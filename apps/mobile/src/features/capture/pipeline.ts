/**
 * On-device capture pipeline: raw notification -> parsed transaction -> minimal upload payload.
 *
 * Pure (no React Native / Supabase imports) so it is unit-testable. The raw notification text is
 * parsed HERE and never uploaded: only amount, payee, VPA, time, UPI app and a dedupe hash are sent.
 */
import { dedupeHash, parsePaymentText, type ParsedTxn, type UpiAppId } from '@paymind/core';

/** Shape handed over by the native module (modules/paymind-capture). */
export interface RawCaptureInput {
  id: string;
  packageName: string;
  title: string;
  text: string;
  /** Epoch milliseconds. */
  postTime: number;
}

/** Body item for the `capture-ingest` Edge Function. Minimal fields only. */
export interface IngestItem {
  direction: 'debit' | 'credit';
  amountMinor: number;
  payee?: string;
  vpa?: string;
  /** ISO 8601 with offset. */
  occurredAt: string;
  app?: UpiAppId;
  dedupeHash: string;
}

export interface IngestEntry {
  item: IngestItem;
  /** Native queue ids covered by this item (more than one when duplicates collapse). */
  ids: string[];
}

export interface IngestBatch {
  entries: IngestEntry[];
  /** Queue ids that were not payments (or could not be parsed): safe to delete without upload. */
  droppedIds: string[];
}

/** Android packages of the UPI apps that the parser knows by id. */
export const PACKAGE_TO_APP: Readonly<Record<string, UpiAppId>> = {
  'com.google.android.apps.nbu.paisa.user': 'gpay',
  'com.phonepe.app': 'phonepe',
  'net.one97.paytm': 'paytm',
  'in.org.npci.upiapp': 'bhim',
};

const IST_OFFSET_MINUTES = 330;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Epoch ms -> ISO 8601 in IST (`2026-10-14T09:12:00+05:30`). India has no DST. */
export function toIstIso(ms: number): string {
  const d = new Date(ms + IST_OFFSET_MINUTES * 60_000);
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+05:30`
  );
}

/** Text we hand to the parser: title and body together, as one sentence-ish string. */
export function notificationText(raw: Pick<RawCaptureInput, 'title' | 'text'>): string {
  const title = raw.title.trim();
  const text = raw.text.trim();
  if (!title) return text;
  if (!text) return title;
  return `${title}. ${text}`;
}

/** Parse one raw notification. Returns null for anything that is not a completed debit/credit. */
export function parseCapture(raw: RawCaptureInput): ParsedTxn | null {
  const receivedAt = toIstIso(raw.postTime);
  const app = PACKAGE_TO_APP[raw.packageName];
  return parsePaymentText(notificationText(raw), {
    receivedAt,
    sender: raw.title,
    ...(app ? { app } : {}),
  });
}

/** Parsed transaction -> the minimal upload item. */
export function toIngestItem(parsed: ParsedTxn, postTime: number): IngestItem {
  const received = toIstIso(postTime);
  // A date printed in the text that differs from the arrival day wins (delayed alert); otherwise
  // keep the arrival time so the inbox can show "today 9:12 AM".
  const textDate = parsed.occurredAt && parsed.occurredAt.length === 10 ? parsed.occurredAt : undefined;
  const occurredAt = textDate && textDate !== received.slice(0, 10) ? `${textDate}T12:00:00+05:30` : received;
  return {
    direction: parsed.direction,
    amountMinor: parsed.amountMinor,
    ...(parsed.payee ? { payee: parsed.payee } : {}),
    ...(parsed.vpa ? { vpa: parsed.vpa } : {}),
    occurredAt,
    ...(parsed.app ? { app: parsed.app } : {}),
    dedupeHash: dedupeHash(parsed),
  };
}

/** The whole pipeline for a batch: parse -> drop nulls -> hash -> collapse duplicates. */
export function buildIngestBatch(raws: readonly RawCaptureInput[]): IngestBatch {
  const byHash = new Map<string, IngestEntry>();
  const droppedIds: string[] = [];
  for (const raw of raws) {
    const parsed = parseCapture(raw);
    if (!parsed) {
      droppedIds.push(raw.id);
      continue;
    }
    const item = toIngestItem(parsed, raw.postTime);
    const existing = byHash.get(item.dedupeHash);
    if (existing) existing.ids.push(raw.id);
    else byHash.set(item.dedupeHash, { item, ids: [raw.id] });
  }
  return { entries: [...byHash.values()], droppedIds };
}

export function chunk<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
