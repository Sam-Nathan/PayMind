/**
 * Goal tracking (design pages 3, 18, 24): ETA from a monthly contribution,
 * required monthly amount for a target month, and splitting contributions by ratio.
 */
import { allocate, assertPaise, type Paise } from '../money.ts';
import type { MemberId } from '../split/items.ts';

/** A calendar month, month 1..12. */
export interface YearMonth {
  year: number;
  month: number;
}

function checkYm(ym: YearMonth, label: string): void {
  if (!Number.isSafeInteger(ym.year) || !Number.isSafeInteger(ym.month) || ym.month < 1 || ym.month > 12) {
    throw new RangeError(`${label} must be a valid year/month`);
  }
}

export function addMonths(ym: YearMonth, n: number): YearMonth {
  const idx = ym.year * 12 + (ym.month - 1) + n;
  return { year: Math.floor(idx / 12), month: (((idx % 12) + 12) % 12) + 1 };
}

/** Whole months from `a` to `b` (b − a). Oct 2026 -> Mar 2027 = 5. */
export function monthsBetween(a: YearMonth, b: YearMonth): number {
  return b.year * 12 + b.month - (a.year * 12 + a.month);
}

export function formatYearMonth(ym: YearMonth): string {
  return `${ym.year}-${ym.month < 10 ? '0' : ''}${ym.month}`;
}

export function parseYearMonth(s: string): YearMonth {
  const m = /^(\d{4})-(\d{2})/.exec(s);
  if (!m) throw new RangeError(`Invalid year-month: ${s}`);
  const ym = { year: Number(m[1]), month: Number(m[2]) };
  checkYm(ym, 'year-month');
  return ym;
}

export interface GoalEtaInput {
  targetMinor: Paise;
  savedMinor: Paise;
  monthlyContributionMinor: Paise;
  /** Current month; the first contribution lands in the following month. */
  from: YearMonth;
}

export interface GoalEtaResult {
  remainingMinor: Paise;
  /** null when there's no contribution and money is still needed. */
  monthsNeeded: number | null;
  finish: YearMonth | null;
  /** 0..1 */
  progress: number;
}

/**
 * Kashmir: 1,20,000 target, 46,000 saved, 14,800/month from Oct 2026
 * -> 74,000 remaining, 5 months, finish Mar 2027.
 */
export function goalEta(input: GoalEtaInput): GoalEtaResult {
  const { targetMinor, savedMinor, monthlyContributionMinor, from } = input;
  assertPaise(targetMinor, 'targetMinor');
  assertPaise(savedMinor, 'savedMinor');
  assertPaise(monthlyContributionMinor, 'monthlyContributionMinor');
  checkYm(from, 'from');
  const remainingMinor = Math.max(0, targetMinor - savedMinor);
  const progress = targetMinor > 0 ? Math.min(1, Math.max(0, savedMinor / targetMinor)) : 1;
  if (remainingMinor === 0) return { remainingMinor, monthsNeeded: 0, finish: { ...from }, progress };
  if (monthlyContributionMinor <= 0) return { remainingMinor, monthsNeeded: null, finish: null, progress };
  const monthsNeeded = Math.ceil(remainingMinor / monthlyContributionMinor);
  return { remainingMinor, monthsNeeded, finish: addMonths(from, monthsNeeded), progress };
}

/**
 * Monthly amount needed to reach the target by `target` (contributions in each month
 * after `from` up to and including `target`). Rounded up to whole paise, or to
 * `roundToMinor` (e.g. 100 for whole rupees).
 */
export function requiredMonthly(input: {
  targetMinor: Paise;
  savedMinor: Paise;
  from: YearMonth;
  target: YearMonth;
  roundToMinor?: number;
}): Paise | null {
  assertPaise(input.targetMinor, 'targetMinor');
  assertPaise(input.savedMinor, 'savedMinor');
  checkYm(input.from, 'from');
  checkYm(input.target, 'target');
  const remaining = Math.max(0, input.targetMinor - input.savedMinor);
  if (remaining === 0) return 0;
  const months = monthsBetween(input.from, input.target);
  if (months <= 0) return null;
  const step = input.roundToMinor ?? 1;
  if (!Number.isSafeInteger(step) || step <= 0) throw new RangeError('roundToMinor must be a positive integer');
  return Math.ceil(remaining / months / step) * step;
}

/** Split one contribution by ratio (couple 60/40). Sums exactly to the amount. */
export function splitContribution(amountMinor: Paise, ratio: Record<MemberId, number>): Record<MemberId, Paise> {
  assertPaise(amountMinor, 'amountMinor');
  const members = Object.keys(ratio);
  const parts = allocate(amountMinor, members.map((m) => ratio[m] as number));
  const out: Record<MemberId, Paise> = {};
  members.forEach((m, i) => (out[m] = parts[i] as number));
  return out;
}

/** Whether the current contribution is enough for the target date. */
export function goalOnTrack(input: GoalEtaInput & { target: YearMonth }): boolean {
  const eta = goalEta(input);
  if (!eta.finish) return false;
  return monthsBetween(eta.finish, input.target) >= 0;
}
