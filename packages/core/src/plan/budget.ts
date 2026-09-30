/**
 * Budget pace and month-end forecast (design pages 3, 13, 22).
 */
import { assertPaise, type Paise } from '../money.ts';

export type BudgetStatus = 'on_track' | 'heading_over' | 'over';

export interface BudgetPaceInput {
  spentMinor: Paise;
  limitMinor: Paise;
  /** 1-based day of the period, counting today (design: "day 14 of 31"). */
  dayOfPeriod: number;
  daysInPeriod: number;
  /**
   * Optional projection from a better model (e.g. `forecastMonthEnd` per category).
   * When given it replaces the straight-line projection for status/overBy.
   */
  projectedMinor?: Paise;
}

/**
 * A projection may exceed the limit by this fraction and still count as on track
 * (straight-line pace is noisy early in the month). 0.05 = 5%.
 */
export const HEADING_OVER_TOLERANCE = 0.05;

export interface BudgetPaceResult {
  /** spent ÷ days elapsed (rounded to paise). */
  pacePerDayMinor: Paise;
  /** limit ÷ days in period (rounded to paise). */
  plannedPerDayMinor: Paise;
  /** Where spending lands at the current pace: spent × daysInPeriod ÷ dayOfPeriod. */
  projectedMinor: Paise;
  status: BudgetStatus;
  /** Amount over the limit: actual if already over, projected overrun if heading over, else 0. */
  overByMinor: Paise;
  /** limit − spent (may be negative). */
  leftMinor: Paise;
  /** Days remaining including today: daysInPeriod − dayOfPeriod + 1. */
  daysLeft: number;
  /** spent ÷ limit, 0..∞ (e.g. 0.55 for "55% used"). */
  usedFraction: number;
}

function roundDiv(a: number, b: number): number {
  // Half away from zero on integers.
  const q = Math.trunc(a / b);
  const r = a - q * b;
  if (Math.abs(r) * 2 >= Math.abs(b)) return q + (Math.sign(a) * Math.sign(b) || 1);
  return q;
}

export function budgetPace(input: BudgetPaceInput): BudgetPaceResult {
  const { spentMinor, limitMinor, dayOfPeriod, daysInPeriod } = input;
  assertPaise(spentMinor, 'spentMinor');
  assertPaise(limitMinor, 'limitMinor');
  if (!Number.isSafeInteger(daysInPeriod) || daysInPeriod <= 0) throw new RangeError('daysInPeriod must be a positive integer');
  if (!Number.isSafeInteger(dayOfPeriod) || dayOfPeriod < 1 || dayOfPeriod > daysInPeriod) {
    throw new RangeError('dayOfPeriod must be within 1..daysInPeriod');
  }
  const pacePerDayMinor = roundDiv(spentMinor, dayOfPeriod);
  const plannedPerDayMinor = roundDiv(limitMinor, daysInPeriod);
  let projectedMinor: Paise;
  if (input.projectedMinor !== undefined) {
    assertPaise(input.projectedMinor, 'projectedMinor');
    projectedMinor = input.projectedMinor;
  } else {
    projectedMinor = roundDiv(spentMinor * daysInPeriod, dayOfPeriod);
  }
  const { status, overByMinor } = budgetStatusFor(spentMinor, projectedMinor, limitMinor);
  return {
    pacePerDayMinor,
    plannedPerDayMinor,
    projectedMinor,
    status,
    overByMinor,
    leftMinor: limitMinor - spentMinor,
    daysLeft: daysInPeriod - dayOfPeriod + 1,
    usedFraction: limitMinor > 0 ? spentMinor / limitMinor : spentMinor > 0 ? Infinity : 0,
  };
}

/**
 * Status for a projection: 'over' once spent exceeds the limit; 'heading_over' when the
 * projection exceeds the limit by more than HEADING_OVER_TOLERANCE; else 'on_track'.
 * overByMinor is the actual overrun when over, the projected overrun when heading over.
 */
export function budgetStatusFor(
  spentMinor: Paise,
  projectedMinor: Paise,
  limitMinor: Paise,
  tolerance: number = HEADING_OVER_TOLERANCE,
): { status: BudgetStatus; overByMinor: Paise } {
  if (spentMinor > limitMinor) return { status: 'over', overByMinor: spentMinor - limitMinor };
  if (projectedMinor > limitMinor && projectedMinor - limitMinor > limitMinor * tolerance) {
    return { status: 'heading_over', overByMinor: projectedMinor - limitMinor };
  }
  return { status: 'on_track', overByMinor: 0 };
}

/** Median of integer paise values, rounded half up to whole paise. Empty -> 0. */
export function medianMinor(values: readonly Paise[]): Paise {
  if (values.length === 0) return 0;
  const s = values.slice().sort((a, b) => a - b);
  const mid = s.length >> 1;
  if (s.length % 2 === 1) return s[mid] as number;
  const a = s[mid - 1] as number;
  const b = s[mid] as number;
  return Math.floor((a + b + 1) / 2);
}

export const FORECAST_HISTORY_DAYS = 90;

export interface ForecastInput {
  /** Spent so far this period (day-to-day + recurring already paid). */
  spentToDateMinor: Paise;
  /**
   * Daily day-to-day spend totals (one entry per calendar day, zeros included),
   * oldest first. Only the trailing 90 are used. Exclude recurring payments here.
   */
  dailyHistoryMinor: readonly Paise[];
  /** Days still to come in the period (design counts today: 18 on day 14 of 31). */
  daysLeft: number;
  /** Known recurring payments still due this period (card bill, EMI, subscriptions). */
  upcomingRecurringMinor?: Paise;
}

export interface ForecastResult {
  projectedMinor: Paise;
  medianDailyMinor: Paise;
  variableRemainingMinor: Paise;
  upcomingRecurringMinor: Paise;
}

/** Month-end forecast: spent + median daily (trailing 90 days) × days left + known upcoming recurring. */
export function forecastMonthEnd(input: ForecastInput): ForecastResult {
  assertPaise(input.spentToDateMinor, 'spentToDateMinor');
  if (!Number.isSafeInteger(input.daysLeft) || input.daysLeft < 0) throw new RangeError('daysLeft must be >= 0');
  const upcoming = input.upcomingRecurringMinor ?? 0;
  assertPaise(upcoming, 'upcomingRecurringMinor');
  input.dailyHistoryMinor.forEach((v) => assertPaise(v, 'daily spend'));
  const recent = input.dailyHistoryMinor.slice(-FORECAST_HISTORY_DAYS);
  const medianDailyMinor = medianMinor(recent);
  const variableRemainingMinor = medianDailyMinor * input.daysLeft;
  const projectedMinor = input.spentToDateMinor + variableRemainingMinor + upcoming;
  assertPaise(projectedMinor, 'projection');
  return { projectedMinor, medianDailyMinor, variableRemainingMinor, upcomingRecurringMinor: upcoming };
}
