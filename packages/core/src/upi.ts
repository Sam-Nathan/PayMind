/**
 * UPI deep links (NPCI "UPI Linking Specification"). PayMind is a gateway, not a
 * wallet: we only build the link; the user approves in their own UPI app.
 */
import { assertPaise, paiseToRupeeString, type Paise } from './money.ts';

export interface UpiPayParams {
  /** Payee VPA, e.g. "karthikr@okbank". */
  pa: string;
  /** Payee name. */
  pn: string;
  /** Amount in paise (> 0). Encoded as rupees with 2 decimals. */
  am: Paise;
  /** Transaction note (travels with the payment), e.g. "PM-402-SEP". */
  tn?: string;
  /** Transaction reference id (our settlement ref). */
  tr?: string;
  /** Currency; only INR is valid for UPI. */
  cu?: 'INR';
  /** Merchant category code (merchants only; omit for P2P). */
  mc?: string;
}

/** Max lengths we enforce (conservative; many PSP apps truncate or reject longer values). */
export const UPI_LIMITS = {
  vpa: 255,
  payeeName: 99,
  note: 80,
  ref: 35,
} as const;

// handle: letters, digits, dot, hyphen, underscore; PSP: starts with a letter.
const VPA_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,254}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/;

export function isValidVpa(vpa: string): boolean {
  return typeof vpa === 'string' && vpa.length <= UPI_LIMITS.vpa && VPA_RE.test(vpa.trim());
}

export class UpiError extends Error {
  override name = 'UpiError';
}

/** RFC 3986 encoding (encodeURIComponent plus !'()* which some UPI apps choke on). */
function enc(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function queryString(p: UpiPayParams): string {
  const pa = p.pa.trim();
  if (!isValidVpa(pa)) throw new UpiError(`Invalid UPI ID (VPA): ${JSON.stringify(p.pa)}`);
  const pn = p.pn.trim();
  if (!pn) throw new UpiError('Payee name is required');
  assertPaise(p.am, 'am');
  if (p.am <= 0) throw new UpiError('Amount must be greater than zero');
  const cu = p.cu ?? 'INR';
  if (cu !== 'INR') throw new UpiError('UPI only supports INR');
  const parts: string[] = [
    `pa=${enc(pa)}`,
    `pn=${enc(pn.slice(0, UPI_LIMITS.payeeName))}`,
    `am=${paiseToRupeeString(p.am)}`,
    `cu=${cu}`,
  ];
  if (p.tn) parts.push(`tn=${enc(p.tn.slice(0, UPI_LIMITS.note))}`);
  if (p.tr) {
    if (p.tr.length > UPI_LIMITS.ref) throw new UpiError(`tr is longer than ${UPI_LIMITS.ref} characters`);
    parts.push(`tr=${enc(p.tr)}`);
  }
  if (p.mc) parts.push(`mc=${enc(p.mc)}`);
  return parts.join('&');
}

/** Generic UPI intent: `upi://pay?pa=...&pn=...&am=1240.00&cu=INR&tn=...`. Also the payload for a UPI QR code. */
export function buildUpiUri(params: UpiPayParams): string {
  return `upi://pay?${queryString(params)}`;
}

export type UpiAppId = 'phonepe' | 'gpay' | 'paytm' | 'bhim';

export interface UpiAppTarget {
  id: UpiAppId;
  name: string;
  /** Android package for package-targeted intents. */
  androidPackage: string;
  /**
   * iOS URL scheme prefix that replaces `upi://pay`. BEST-EFFORT: these schemes are
   * not officially documented by the apps and may change; always offer the generic
   * `upi://` link / QR as a fallback, and declare the schemes in LSApplicationQueriesSchemes.
   */
  iosScheme: string;
}

export const upiAppTargets: readonly UpiAppTarget[] = [
  { id: 'phonepe', name: 'PhonePe', androidPackage: 'com.phonepe.app', iosScheme: 'phonepe://pay' },
  { id: 'gpay', name: 'Google Pay', androidPackage: 'com.google.android.apps.nbu.paisa.user', iosScheme: 'tez://upi/pay' },
  { id: 'paytm', name: 'Paytm', androidPackage: 'net.one97.paytm', iosScheme: 'paytmmp://pay' },
  { id: 'bhim', name: 'BHIM', androidPackage: 'in.org.npci.upiapp', iosScheme: 'bhim://pay' },
];

export function getUpiAppTarget(id: UpiAppId): UpiAppTarget {
  const t = upiAppTargets.find((a) => a.id === id);
  if (!t) throw new UpiError(`Unknown UPI app: ${id}`);
  return t;
}

/** iOS deep link for a specific app (best-effort; see `UpiAppTarget.iosScheme`). */
export function buildIosUpiUri(app: UpiAppId, params: UpiPayParams): string {
  return `${getUpiAppTarget(app).iosScheme}?${queryString(params)}`;
}

/**
 * Android package-targeted intent URL (for Chrome/WebView on Android):
 * `intent://pay?...#Intent;scheme=upi;package=com.phonepe.app;end`.
 * In React Native, prefer launching `buildUpiUri()` with the package set natively.
 */
export function buildAndroidIntentUri(app: UpiAppId, params: UpiPayParams): string {
  return `intent://pay?${queryString(params)}#Intent;scheme=upi;package=${getUpiAppTarget(app).androidPackage};end`;
}

export interface ParsedUpiUri {
  pa: string;
  pn?: string;
  /** Amount in paise, if present and valid. */
  am?: Paise;
  tn?: string;
  tr?: string;
  cu?: string;
  mc?: string;
}

/** Parse a `upi://pay?...` link (e.g. from a scanned QR). Returns null if it isn't one. */
export function parseUpiUri(uri: string): ParsedUpiUri | null {
  const m = /^upi:\/\/pay\?(.*)$/i.exec(uri.trim());
  if (!m) return null;
  const params: Record<string, string> = {};
  for (const kv of (m[1] ?? '').split('&')) {
    if (!kv) continue;
    const eq = kv.indexOf('=');
    const k = (eq < 0 ? kv : kv.slice(0, eq)).toLowerCase();
    const raw = eq < 0 ? '' : kv.slice(eq + 1);
    let v: string;
    try {
      v = decodeURIComponent(raw.replace(/\+/g, ' '));
    } catch {
      v = raw;
    }
    params[k] = v;
  }
  const pa = params['pa'];
  if (!pa || !isValidVpa(pa)) return null;
  const out: ParsedUpiUri = { pa };
  if (params['pn']) out.pn = params['pn'];
  if (params['am'] && /^\d+(\.\d{1,2})?$/.test(params['am'])) {
    const [w, f = ''] = params['am'].split('.');
    out.am = Number(w) * 100 + Number((f + '00').slice(0, 2));
  }
  if (params['tn']) out.tn = params['tn'];
  if (params['tr']) out.tr = params['tr'];
  if (params['cu']) out.cu = params['cu'];
  if (params['mc']) out.mc = params['mc'];
  return out;
}
