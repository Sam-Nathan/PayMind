/**
 * Parse Indian UPI / bank payment notifications and SMS into a structured
 * transaction proposal (design page 4 "Picked up automatically").
 *
 * Deliberately conservative: OTPs, promotions, collect requests, failed payments
 * and upcoming-debit reminders return null. Output is a proposal the user confirms.
 */
import { rupeesToPaise, type Paise } from '../money.ts';
import type { UpiAppId } from '../upi.ts';

export type TxnDirection = 'debit' | 'credit';

export interface ParsedTxn {
  direction: TxnDirection;
  amountMinor: Paise;
  /** Counterparty name: who you paid (debit) or who paid you (credit). */
  payee?: string;
  /** Counterparty UPI ID, lower-cased. */
  vpa?: string;
  /** Bank name, e.g. "HDFC Bank". */
  bank?: string;
  /** Last 3–4 digits of the account or card. */
  account_last4?: string;
  /** UPI reference / RRN / UTR. */
  ref?: string;
  /**
   * ISO 8601. "YYYY-MM-DD" when the date is in the text (Indian DD-MM order),
   * otherwise `options.receivedAt` if given.
   */
  occurredAt?: string;
  /** UPI app the notification came from, if recognisable. */
  app?: UpiAppId;
}

export interface ParseOptions {
  /** When the SMS/notification arrived (ISO); used when the text has no date, and for year inference. */
  receivedAt?: string;
  /** SMS sender id (e.g. "VM-HDFCBK") or notification source; helps detect the bank. */
  sender?: string;
  /** App the notification came from (from the Android package name). */
  app?: UpiAppId;
}

// ---------------------------------------------------------------------------
// Filters

const OTP_RE = /\b(?:otp|one[\s-]?time[\s-]?(?:password|passcode|pin)|verification code|security code)\b/i;
const PROMO_RE =
  /\b(?:offer|offers|up\s?to|win|won|congratulations|pre-?approved|apply now|click here|limited period|limited time|voucher|exclusive|hurry|eligible for|get (?:instant|flat)|t&c)\b/i;
const NOT_A_PAYMENT_RE =
  /\b(?:failed|declined|unsuccessful|could not be processed|has requested|requested (?:money|payment|₹|rs|inr)|collect request|payment request|will be debited|to be debited|is due|due on|due date|due by|mandate (?:created|registered|set up)|autopay (?:set ?up|scheduled|registered)|reminder)\b/i;

// ---------------------------------------------------------------------------
// Helpers

const CURRENCY_AMOUNT_RE = /(?:₹|\brs\.?|\binr)\s*([\d,]+(?:\.\d{1,2})?)/gi;
const BARE_AMOUNT_RE = /\b(?:debited|credited)\s+(?:by|for|with)\s+([\d,]+(?:\.\d{1,2})?)\b/i;
const BALANCE_PREFIX_RE = /(?:bal(?:ance)?|lmt|limit|avl\.?|available)\s*[:.-]?\s*(?:is\s*)?$/i;

function extractAmount(text: string): Paise | null {
  CURRENCY_AMOUNT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CURRENCY_AMOUNT_RE.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 24), m.index);
    if (BALANCE_PREFIX_RE.test(before)) continue;
    const digits = (m[1] ?? '').replace(/,/g, '');
    if (!/\d/.test(digits)) continue;
    try {
      const v = rupeesToPaise(digits);
      if (v > 0) return v;
    } catch {
      /* try next */
    }
  }
  const bare = BARE_AMOUNT_RE.exec(text);
  if (bare) {
    try {
      const v = rupeesToPaise((bare[1] ?? '').replace(/,/g, ''));
      if (v > 0) return v;
    } catch {
      /* ignore */
    }
  }
  return null;
}

const CREDIT_PATTERNS: RegExp[] = [
  /\b(?:paid|sent)\s+you\b/i,
  /\breceived\b/i,
  /\bcredited\s+(?:to\s+(?:your|ur|a\/c|ac|acct|account)|with|by|in)\b/i,
  /\b(?:is|has been|was|been)\s+credited\b/i,
  /\brefund(?:ed)?\b/i,
  /\breversed\b/i,
  /\bdeposited\b/i,
];
const DEBIT_PATTERNS: RegExp[] = [
  /\bdebited\b/i,
  /\bspent\b/i,
  /\bpaid\b/i,
  /\bsent\b/i,
  /\bpayment of\b/i,
  /\bpurchase\b/i,
  /\bwithdrawn\b/i,
  /\btransferred to\b/i,
  /\btrf to\b/i,
  /\b(?:transaction|txn) of\b/i,
];

function earliest(text: string, patterns: RegExp[]): number {
  let best = Infinity;
  for (const p of patterns) {
    const m = p.exec(text);
    if (m && m.index < best) best = m.index;
  }
  return best;
}

function detectDirection(text: string): TxnDirection | null {
  const c = earliest(text, CREDIT_PATTERNS);
  const d = earliest(text, DEBIT_PATTERNS);
  if (c === Infinity && d === Infinity) {
    return /\bcredited\b/i.test(text) ? 'credit' : null;
  }
  return c <= d ? 'credit' : 'debit';
}

const VPA_RE = /\b([a-zA-Z0-9][a-zA-Z0-9._-]*@[a-zA-Z][a-zA-Z0-9]{1,63})(?!\.?[a-zA-Z0-9]*\.[a-zA-Z])(?![a-zA-Z0-9@])/;
const VPA_EXACT_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*@[a-zA-Z][a-zA-Z0-9]{1,63}$/;

const BANKS: Array<[RegExp, string]> = [
  [/\bhdfc\s*(?:bank|bk)?\b|hdfcbk/i, 'HDFC Bank'],
  [/\bicici\b|icicib/i, 'ICICI Bank'],
  [/\bsbi\b|state bank of india|sbiinb|sbiupi|\batmsbi/i, 'State Bank of India'],
  [/\baxis\b|axisbk/i, 'Axis Bank'],
  [/\bkotak\b|kotakb/i, 'Kotak Mahindra Bank'],
  [/\bpnb\b|punjab national/i, 'Punjab National Bank'],
  [/bank of baroda|\bbob\b|barodm/i, 'Bank of Baroda'],
  [/\bcanara\b|canbnk/i, 'Canara Bank'],
  [/union bank/i, 'Union Bank of India'],
  [/idfc\s*first|\bidfc\b|idfcfb/i, 'IDFC FIRST Bank'],
  [/indusind/i, 'IndusInd Bank'],
  [/yes\s*bank|yesbnk/i, 'Yes Bank'],
  [/federal bank|fedbnk/i, 'Federal Bank'],
  [/\bidbi\b/i, 'IDBI Bank'],
  [/au small finance|\bau bank\b/i, 'AU Small Finance Bank'],
  [/indian overseas bank|\biob\b/i, 'Indian Overseas Bank'],
  [/bank of india|\bboi\b/i, 'Bank of India'],
  [/indian bank/i, 'Indian Bank'],
];

function detectBank(text: string, sender?: string): string | undefined {
  // Ignore VPA handles (swiggy@icici) and URLs, then take the earliest bank mentioned.
  const stripped = text.replace(/\S+@\S+/g, ' ').replace(/https?:\/\/\S+/gi, ' ');
  for (const src of [stripped, sender ?? '']) {
    let best: { idx: number; name: string } | undefined;
    for (const [re, name] of BANKS) {
      const m = re.exec(src);
      if (m && (!best || m.index < best.idx)) best = { idx: m.index, name };
    }
    if (best) return best.name;
  }
  return undefined;
}

function detectApp(text: string): UpiAppId | undefined {
  if (/phone\s?pe/i.test(text)) return 'phonepe';
  if (/\bg\s?pay\b|google pay/i.test(text)) return 'gpay';
  if (/paytm/i.test(text)) return 'paytm';
  if (/\bbhim\b/i.test(text)) return 'bhim';
  return undefined;
}

const LAST4_RE = /\b(?:a\/c|ac|acct|account|card)(?:\s*no\.?)?\s*(?:ending(?:\s+(?:with|in))?\s*)?(?:[x*]+\s*|\*\*\s*)(\d{3,4})\b/i;
const LAST4_ENDING_RE = /\b(?:a\/c|ac|acct|account|card)\b[^.]{0,20}?\bending(?:\s+(?:with|in))?\s*(\d{3,4})\b/i;

function detectLast4(text: string): string | undefined {
  const m = LAST4_RE.exec(text) ?? LAST4_ENDING_RE.exec(text);
  return m?.[1];
}

const REF_RE =
  /(?:upi\s*ref(?:erence)?(?:\s*(?:no|number|id))?|ref(?:erence)?(?:\s*(?:no|number|id))?|refno|utr(?:\s*no)?|rrn|upi(?:\s*(?:txn|transaction)\s*id)?|txn\s*(?:id|no)|transaction\s*id)\s*[.:#-]?\s*[:.#-]?\s*(\d{10,18})\b/i;
const AXIS_UPI_RE = /\bupi\/p2[ma]\/(\d{10,18})\/([^/\n]+?)(?:\/|\s+not you|\s+call|\s*$)/i;

function detectRef(text: string): string | undefined {
  const axis = AXIS_UPI_RE.exec(text);
  if (axis) return axis[1];
  return REF_RE.exec(text)?.[1];
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function validDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= dim;
}

function fullYear(y: string): number {
  const n = Number(y);
  return y.length === 2 ? 2000 + n : n;
}

function isoDate(y: number, m: number, d: number): string | undefined {
  return validDate(y, m, d) ? `${y}-${pad2(m)}-${pad2(d)}` : undefined;
}

function detectDate(text: string, receivedAt?: string): string | undefined {
  let m = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/.exec(text);
  if (m) return isoDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})\b/.exec(text);
  if (m) return isoDate(fullYear(m[3] as string), Number(m[2]), Number(m[1]));
  m = /\b(\d{1,2})[-\s]?(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*[-\s,]*(\d{4}|\d{2})?\b/i.exec(text);
  if (m) {
    const month = MONTHS[(m[2] as string).toLowerCase()] as number;
    let year: number | undefined = m[3] ? fullYear(m[3]) : undefined;
    if (year === undefined) {
      const ref = receivedAt ? /^(\d{4})-(\d{2})/.exec(receivedAt) : null;
      if (!ref) return undefined;
      year = Number(ref[1]);
      // "29 Dec" received on 2 Jan belongs to last year.
      if (month > Number(ref[2]) + 1) year -= 1;
    }
    return isoDate(year, month, Number(m[1]));
  }
  return undefined;
}

// Counterparty extraction ----------------------------------------------------

const STOP =
  '(?=\\s+(?:on|from|via|using|thru|through|ref|refno|upi|txn|avl|avbl|if|not|for|with|in|dated|at|and|is|was|has|successful|successfully|completed|done)\\b|\\s*[.;,!(|]\\s|\\s*[.;!]?\\s*$|\\s*\\(|\\s*-\\s*(?:[A-Z]{2,}|ref))';

const DEBIT_PAYEE_RES: RegExp[] = [
  new RegExp(`\\b(?:paid|sent|payment of\\s+\\S+|transferred|trf|debited[^.;]*?)\\s+(?:(?:₹|rs\\.?|inr)\\s*[\\d,.]+\\s+)?to\\s+(?:vpa\\s+)?(.+?)${STOP}`, 'i'),
  new RegExp(`\\bto\\s+(?:vpa\\s+)?(.+?)${STOP}`, 'i'),
  new RegExp(`\\bat\\s+(.+?)${STOP}`, 'i'),
  /;\s*([^;.]+?)\s+credited\b/i,
];

const CREDIT_PAYER_RES: RegExp[] = [
  /^(?:.*?:\s*)?([A-Za-z][\w .&'-]*?)\s+(?:has\s+)?(?:paid|sent)\s+you\b/i,
  new RegExp(`\\bfrom\\s+(?:vpa\\s+)?(.+?)${STOP}`, 'i'),
  new RegExp(`\\bby\\s+(?:vpa\\s+)?(.+?)${STOP}`, 'i'),
];

const NOT_A_NAME_RE =
  /^(?:(?:your|ur|you|a\/c|ac|acct|account|card|the|bank|upi|vpa|rs|inr)\b|[₹\d])|\b(?:a\/c|acct|account|card|bank a\/c|wallet|balance)\b|^(?:hdfc|icici|sbi|axis|kotak|paytm|phonepe|google pay|gpay)(?:\s+bank)?(?:\s|$)/i;

function cleanName(raw: string): string | undefined {
  let s = raw.replace(/\s+/g, ' ').trim();
  s = s.replace(/^vpa\s+/i, '').replace(/[.,;:!\-–]+$/, '').trim();
  if (!s || s.length > 60) return undefined;
  return s;
}

interface Counterparty {
  payee?: string;
  vpa?: string;
}

function pickCounterparty(text: string, res: RegExp[]): Counterparty {
  const out: Counterparty = {};
  for (const re of res) {
    const m = re.exec(text);
    if (!m || !m[1]) continue;
    const name = cleanName(m[1]);
    if (!name) continue;
    if (VPA_EXACT_RE.test(name)) {
      if (!out.vpa) out.vpa = name.toLowerCase();
      continue;
    }
    if (NOT_A_NAME_RE.test(name)) continue;
    if (!out.payee) out.payee = name;
    break;
  }
  return out;
}

// ---------------------------------------------------------------------------

/**
 * Parse one notification/SMS body. Returns null for anything that isn't a completed
 * debit or credit (OTP, promotions, requests, failures, reminders, balance alerts).
 */
export function parsePaymentText(text: string, options: ParseOptions = {}): ParsedTxn | null {
  if (typeof text !== 'string') return null;
  const t = text.replace(/[   ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  if (OTP_RE.test(t) || PROMO_RE.test(t) || NOT_A_PAYMENT_RE.test(t)) return null;

  const direction = detectDirection(t);
  if (!direction) return null;
  const amountMinor = extractAmount(t);
  if (amountMinor === null) return null;

  const out: ParsedTxn = { direction, amountMinor };

  const axis = AXIS_UPI_RE.exec(t);
  let cp: Counterparty;
  if (axis && axis[2]) {
    const nm = cleanName(axis[2]);
    cp = nm ? { payee: nm } : {};
  } else {
    cp = pickCounterparty(t, direction === 'debit' ? DEBIT_PAYEE_RES : CREDIT_PAYER_RES);
  }
  const anyVpa = VPA_RE.exec(t)?.[1];
  const vpa = cp.vpa ?? anyVpa?.toLowerCase();
  if (cp.payee && !(vpa && cp.payee.toLowerCase().includes(vpa))) out.payee = cp.payee;
  if (vpa) out.vpa = vpa;

  const bank = detectBank(t, options.sender);
  if (bank) out.bank = bank;
  const last4 = detectLast4(t);
  if (last4) out.account_last4 = last4;
  const ref = detectRef(t);
  if (ref) out.ref = ref;
  const date = detectDate(t, options.receivedAt);
  if (date) out.occurredAt = date;
  else if (options.receivedAt) out.occurredAt = options.receivedAt;
  const app = options.app ?? detectApp(t);
  if (app) out.app = app;
  return out;
}

// ---------------------------------------------------------------------------
// Dedupe

function fnv1a32(s: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function hex8(n: number): string {
  return n.toString(16).padStart(8, '0');
}

function normKey(s: string | undefined): string {
  // No String.normalize: keep identical output on Hermes builds without full Intl.
  return (s ?? '').toLowerCase().replace(/[^a-z0-9@\u00c0-\u024f]/g, '');
}

/** The canonical string a parsed transaction is hashed from. */
export function dedupeKey(p: Pick<ParsedTxn, 'direction' | 'amountMinor' | 'ref' | 'occurredAt' | 'vpa' | 'payee' | 'account_last4'>): string {
  if (p.ref) return `ref|${p.direction}|${p.amountMinor}|${p.ref}`;
  const day = (p.occurredAt ?? '').slice(0, 10);
  const who = p.vpa ? normKey(p.vpa) : normKey(p.payee);
  return `txn|${p.direction}|${p.amountMinor}|${day}|${who}|${p.account_last4 ?? ''}`;
}

/**
 * Deterministic 64-bit (16 hex chars) hash for exact-duplicate detection
 * (the same SMS delivered twice, or SMS + notification that share a UPI ref).
 * Uses FNV-1a; no crypto dependency, so it runs identically on RN, web and Deno.
 */
export function dedupeHash(p: Pick<ParsedTxn, 'direction' | 'amountMinor' | 'ref' | 'occurredAt' | 'vpa' | 'payee' | 'account_last4'>): string {
  const key = dedupeKey(p);
  return hex8(fnv1a32(key, 0x811c9dc5)) + hex8(fnv1a32(key, 0x050c5d1f));
}

/**
 * Fuzzy check for the same payment seen through two channels (e.g. a PhonePe
 * notification without a ref and the bank SMS with one). Same direction and amount,
 * compatible dates, and no conflicting refs / VPAs / accounts.
 */
export function isLikelyDuplicate(a: ParsedTxn, b: ParsedTxn): boolean {
  if (a.direction !== b.direction || a.amountMinor !== b.amountMinor) return false;
  if (a.ref && b.ref) return a.ref === b.ref;
  const da = a.occurredAt?.slice(0, 10);
  const db = b.occurredAt?.slice(0, 10);
  if (da && db && da !== db) return false;
  if (a.vpa && b.vpa && a.vpa !== b.vpa) return false;
  if (a.account_last4 && b.account_last4 && a.account_last4 !== b.account_last4) return false;
  return true;
}
