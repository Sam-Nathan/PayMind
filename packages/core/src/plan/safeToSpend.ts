/**
 * Safe-to-spend and "Can I afford this?" (design pages 3, 14, 22).
 *
 * free = balance − upcoming bills/EMIs/dues − goal set-aside − buffer
 * perDay = free ÷ days left (floored to whole paise; UI floors to whole rupees)
 */
import { assertPaise, floorToRupees, type Paise } from '../money.ts';

export interface SafeToSpendInput {
  /** Money in the account now. */
  balanceMinor: Paise;
  /** Bills, EMIs and dues before the next income. */
  upcomingMinor: Paise;
  /** Goal contributions to set aside this period. */
  goalSetAsideMinor: Paise;
  /** Safety buffer the user keeps untouched. */
  bufferMinor: Paise;
  /** Days until the next income, counting today (design: day 14 of 31 -> 18). */
  daysLeft: number;
}

export interface SafeToSpendResult {
  /** May be negative when commitments exceed the balance. */
  freeMinor: Paise;
  /** floor(free / daysLeft), never below 0. */
  perDayMinor: Paise;
}

function checkDays(daysLeft: number): void {
  if (!Number.isSafeInteger(daysLeft) || daysLeft <= 0) throw new RangeError(`daysLeft must be a positive integer (got ${daysLeft})`);
}

export function safeToSpend(input: SafeToSpendInput): SafeToSpendResult {
  const { balanceMinor, upcomingMinor, goalSetAsideMinor, bufferMinor, daysLeft } = input;
  assertPaise(balanceMinor, 'balanceMinor');
  assertPaise(upcomingMinor, 'upcomingMinor');
  assertPaise(goalSetAsideMinor, 'goalSetAsideMinor');
  assertPaise(bufferMinor, 'bufferMinor');
  checkDays(daysLeft);
  const freeMinor = balanceMinor - upcomingMinor - goalSetAsideMinor - bufferMinor;
  const perDayMinor = freeMinor > 0 ? Math.floor(freeMinor / daysLeft) : 0;
  return { freeMinor, perDayMinor };
}

/** Whole rupees for the hero number (floored, so we never overstate): 116622 -> 1166. */
export function perDayDisplayRupees(perDayMinor: Paise): number {
  return Math.max(0, floorToRupees(perDayMinor));
}

export type AffordVerdict = 'yes' | 'tight' | 'no';

/**
 * Thresholds on what's left per day after the purchase, as a fraction of a reference
 * daily amount: the user's typical daily spend if known (median of last 3 months, per
 * the design's assumptions), otherwise today's safe-to-spend per day.
 */
export const AFFORD_TIGHT_RATIO = 0.6;
export const AFFORD_NO_RATIO = 0.25;
/** Below this per-day amount the verdict is always 'no' (₹100/day). */
export const AFFORD_MIN_PER_DAY_MINOR: Paise = 100_00;

export interface CanAffordInput extends SafeToSpendInput {
  purchaseMinor: Paise;
  /** Typical day-to-day spend per day; improves the verdict when available. */
  typicalDailySpendMinor?: Paise;
}

export interface CanAffordResult {
  verdict: AffordVerdict;
  freeMinor: Paise;
  perDayMinor: Paise;
  /** free − purchase (may be negative). */
  leftMinor: Paise;
  /** floor(left / daysLeft), never below 0. */
  leftPerDayMinor: Paise;
}

export function canAfford(input: CanAffordInput): CanAffordResult {
  assertPaise(input.purchaseMinor, 'purchaseMinor');
  if (input.purchaseMinor < 0) throw new RangeError('purchaseMinor must be >= 0');
  const { freeMinor, perDayMinor } = safeToSpend(input);
  const leftMinor = freeMinor - input.purchaseMinor;
  const leftPerDayMinor = leftMinor > 0 ? Math.floor(leftMinor / input.daysLeft) : 0;

  let verdict: AffordVerdict;
  const reference = input.typicalDailySpendMinor ?? perDayMinor;
  if (input.typicalDailySpendMinor !== undefined) assertPaise(input.typicalDailySpendMinor, 'typicalDailySpendMinor');
  if (leftMinor < 0 || leftPerDayMinor < AFFORD_MIN_PER_DAY_MINOR) {
    verdict = 'no';
  } else if (reference <= 0) {
    verdict = 'yes';
  } else {
    const ratio = leftPerDayMinor / reference;
    verdict = ratio < AFFORD_NO_RATIO ? 'no' : ratio < AFFORD_TIGHT_RATIO ? 'tight' : 'yes';
  }
  return { verdict, freeMinor, perDayMinor, leftMinor, leftPerDayMinor };
}
