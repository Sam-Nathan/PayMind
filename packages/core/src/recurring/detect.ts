/**
 * Recurring payment & subscription detection (design pages 4, 23).
 *
 * A series is ≥3 payments to the same merchant key at a roughly monthly (26–35 days)
 * or weekly (6–8 days) cadence with a stable amount (±10%). A sustained step change in
 * amount at the end of the series (Flix+ ₹499 → ₹649) is reported as a price change.
 */
import { assertPaise, type Paise } from '../money.ts';

export interface RecurringTxnInput {
  id: string;
  /** Normalised merchant key (merchant_id or canonical name). */
  merchantKey: string;
  amountMinor: Paise;
  /** "YYYY-MM-DD" or an ISO datetime (the local date part is used). */
  occurredAt: string;
}

export type Cadence = 'monthly' | 'weekly';

export interface PriceChange {
  fromMinor: Paise;
  toMinor: Paise;
  /** Date of the first payment at the new amount. */
  since: string;
  /** Relative change, e.g. 0.3006 for 499 -> 649. */
  pct: number;
}

export interface RecurringSeries {
  merchantKey: string;
  cadence: Cadence;
  /** Transaction ids in date order. */
  txnIds: string[];
  occurrences: number;
  /** The current amount (the latest payment). */
  amountMinor: Paise;
  /** Median gap between payments in days. */
  intervalDays: number;
  firstDate: string;
  lastDate: string;
  /** Predicted next payment date ("YYYY-MM-DD"). */
  nextDate: string;
  /** 'stable' within ±10%; 'price_change' = stable, then a sustained step; 'variable' otherwise. */
  amountPattern: 'stable' | 'price_change' | 'variable';
  priceChange?: PriceChange;
}

export const RECURRING_MIN_OCCURRENCES = 3;
export const MONTHLY_MIN_DAYS = 26;
export const MONTHLY_MAX_DAYS = 35;
export const WEEKLY_MIN_DAYS = 6;
export const WEEKLY_MAX_DAYS = 8;
export const AMOUNT_TOLERANCE = 0.1;

export interface DetectOptions {
  /** Include series whose amounts vary more than ±10% (e.g. a credit card bill). Default false. */
  includeVariable?: boolean;
  minOccurrences?: number;
}

const DAY_MS = 86_400_000;

/** Days since epoch for the calendar date in `s` ("YYYY-MM-DD..."). */
export function dayNumber(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) throw new RangeError(`Invalid date: ${s}`);
  return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS);
}

export function dateFromDayNumber(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

/** Same day-of-month next month, clamped to the month's length (31 Jan -> 28/29 Feb). */
export function addOneMonth(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) throw new RangeError(`Invalid date: ${date}`);
  let y = Number(m[1]);
  let mo = Number(m[2]) + 1;
  if (mo > 12) {
    mo = 1;
    y += 1;
  }
  const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const d = Math.min(Number(m[3]), dim);
  return `${y}-${mo < 10 ? '0' : ''}${mo}-${d < 10 ? '0' : ''}${d}`;
}

function median(xs: number[]): number {
  const s = xs.slice().sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

function within(a: number, ref: number, tol = AMOUNT_TOLERANCE): boolean {
  if (ref === 0) return a === 0;
  return Math.abs(a - ref) <= Math.abs(ref) * tol;
}

/** Split amounts into consecutive runs that stay within tolerance of the run's first amount. */
function amountRuns(amounts: number[]): Array<{ start: number; end: number; ref: number }> {
  const runs: Array<{ start: number; end: number; ref: number }> = [];
  amounts.forEach((a, i) => {
    const cur = runs[runs.length - 1];
    if (cur && within(a, cur.ref)) cur.end = i;
    else runs.push({ start: i, end: i, ref: a });
  });
  return runs;
}

function classifyCadence(gaps: number[]): Cadence | null {
  const med = median(gaps);
  const inRange = (lo: number, hi: number) => med >= lo && med <= hi && gaps.every((g) => g >= lo - 3 && g <= hi + 5);
  if (inRange(MONTHLY_MIN_DAYS, MONTHLY_MAX_DAYS)) return 'monthly';
  if (inRange(WEEKLY_MIN_DAYS, WEEKLY_MAX_DAYS)) return 'weekly';
  return null;
}

/**
 * Detect recurring series. Each merchant yields at most one series (its longest
 * cadence-consistent tail). Results are sorted by merchantKey.
 */
export function detectRecurring(txns: readonly RecurringTxnInput[], options: DetectOptions = {}): RecurringSeries[] {
  const minOcc = options.minOccurrences ?? RECURRING_MIN_OCCURRENCES;
  const groups = new Map<string, Array<RecurringTxnInput & { day: number }>>();
  for (const t of txns) {
    assertPaise(t.amountMinor, 'amountMinor');
    const key = t.merchantKey.trim().toLowerCase();
    if (!key) continue;
    const arr = groups.get(key) ?? [];
    arr.push({ ...t, day: dayNumber(t.occurredAt) });
    groups.set(key, arr);
  }

  const out: RecurringSeries[] = [];
  for (const [key, list] of groups) {
    list.sort((a, b) => a.day - b.day || a.id.localeCompare(b.id));
    // Collapse same-day duplicates (keep the first) so double captures don't break cadence.
    const uniq = list.filter((t, i) => i === 0 || t.day !== (list[i - 1] as { day: number }).day);
    if (uniq.length < minOcc) continue;

    // Find the longest tail whose gaps fit a cadence (subscriptions that restarted keep the recent run).
    let series: typeof uniq | null = null;
    let cadence: Cadence | null = null;
    for (let start = 0; start <= uniq.length - minOcc; start++) {
      const tail = uniq.slice(start);
      const gaps = tail.slice(1).map((t, i) => t.day - (tail[i] as { day: number }).day);
      const c = classifyCadence(gaps);
      if (c) {
        series = tail;
        cadence = c;
        break;
      }
    }
    if (!series || !cadence) continue;

    const amounts = series.map((t) => t.amountMinor);
    const runs = amountRuns(amounts);
    let amountPattern: RecurringSeries['amountPattern'];
    let priceChange: PriceChange | undefined;
    const lastRun = runs[runs.length - 1] as { start: number; end: number; ref: number };
    if (runs.length === 1) {
      amountPattern = 'stable';
    } else if (runs.length === 2 && (runs[0] as { end: number; start: number }).end - (runs[0] as { start: number }).start + 1 >= 2) {
      amountPattern = 'price_change';
      const prev = amounts[lastRun.start - 1] as number;
      const next = amounts[lastRun.start] as number;
      priceChange = {
        fromMinor: prev,
        toMinor: next,
        since: (series[lastRun.start] as RecurringTxnInput).occurredAt.slice(0, 10),
        pct: prev === 0 ? Infinity : (next - prev) / prev,
      };
    } else {
      amountPattern = 'variable';
    }
    if (amountPattern === 'variable' && !options.includeVariable) continue;

    const gaps = series.slice(1).map((t, i) => t.day - (series[i] as { day: number }).day);
    const last = series[series.length - 1] as RecurringTxnInput & { day: number };
    const lastDate = last.occurredAt.slice(0, 10);
    const s: RecurringSeries = {
      merchantKey: key,
      cadence,
      txnIds: series.map((t) => t.id),
      occurrences: series.length,
      amountMinor: last.amountMinor,
      intervalDays: median(gaps),
      firstDate: (series[0] as RecurringTxnInput).occurredAt.slice(0, 10),
      lastDate,
      nextDate: cadence === 'monthly' ? addOneMonth(lastDate) : dateFromDayNumber(last.day + 7),
      amountPattern,
    };
    if (priceChange) s.priceChange = priceChange;
    out.push(s);
  }
  return out.sort((a, b) => a.merchantKey.localeCompare(b.merchantKey));
}

/** Monthly-equivalent cost of a series (weekly × 52 / 12, rounded). */
export function monthlyEquivalentMinor(series: Pick<RecurringSeries, 'cadence' | 'amountMinor'>): Paise {
  return series.cadence === 'monthly' ? series.amountMinor : Math.round((series.amountMinor * 52) / 12);
}
