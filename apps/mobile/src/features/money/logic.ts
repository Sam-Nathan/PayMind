/**
 * Pure helpers behind the Money / Insights / Afford / Recurring / Goals / Timeline screens.
 * All money maths goes through @paymind/core; this file only shapes inputs and outputs.
 * No React, no I/O, so it is unit-tested directly (logic.test.ts).
 */
import {
  addMonths,
  allocate,
  budgetPace,
  canAfford,
  detectRecurring,
  forecastMonthEnd,
  goalEta,
  monthlyEquivalentMinor,
  requiredMonthly,
  type BudgetPaceResult,
  type CanAffordResult,
  type YearMonth,
} from '@paymind/core';
import { toIsoDate } from '../../data/dates.ts';

// ---------------------------------------------------------------------------
// Spend lines: the user's OWN spend (personal expenses in full + their share of shared ones)

export interface SpendLine {
  id: string;
  title: string;
  merchantId: string | null;
  categoryId: string | null;
  /** personal: total_minor; shared: my expense_shares.owed_minor */
  amountMinor: number;
  /** ISO datetime */
  occurredAt: string;
  recurringSeriesId: string | null;
  shared: boolean;
}

/** Local calendar day ("YYYY-MM-DD") of an ISO datetime. */
export function localDay(iso: string): string {
  return toIsoDate(new Date(iso));
}

export function daysInMonth(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

/** Monday of the week containing `now` ("YYYY-MM-DD"). */
export function weekStartIso(now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toIsoDate(d);
}

/** 1-based day of the week (Mon = 1). */
export function dayOfWeek(now: Date): number {
  return ((now.getDay() + 6) % 7) + 1;
}

export function startOfMonthsAgo(now: Date, monthsBack: number): Date {
  return new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
}

/** Σ amounts whose local day is within [fromDay, toDay] (inclusive, YYYY-MM-DD compare). */
export function sumRange(lines: readonly SpendLine[], fromDay: string, toDay: string, pick?: (l: SpendLine) => boolean): number {
  let t = 0;
  for (const l of lines) {
    const d = localDay(l.occurredAt);
    if (d >= fromDay && d <= toDay && (!pick || pick(l))) t += l.amountMinor;
  }
  return t;
}

/** Category totals within [fromDay, toDay]. Uncategorised spend is keyed `null`. */
export function spendByCategory(lines: readonly SpendLine[], fromDay: string, toDay: string): Map<string | null, number> {
  const out = new Map<string | null, number>();
  for (const l of lines) {
    const d = localDay(l.occurredAt);
    if (d < fromDay || d > toDay) continue;
    out.set(l.categoryId, (out.get(l.categoryId) ?? 0) + l.amountMinor);
  }
  return out;
}

/**
 * One entry per calendar day for the `days` days ending at `endDay` (inclusive), oldest first,
 * zeros included. Recurring payments are excluded by default, as core's forecast requires.
 */
export function dailyTotals(lines: readonly SpendLine[], endDay: string, days: number, includeRecurring = false): number[] {
  const end = new Date(`${endDay}T12:00:00`);
  const index = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date(end);
    d.setDate(d.getDate() - (days - 1 - i));
    index.set(toIsoDate(d), i);
  }
  const out = new Array<number>(days).fill(0);
  for (const l of lines) {
    if (!includeRecurring && l.recurringSeriesId) continue;
    const i = index.get(localDay(l.occurredAt));
    if (i !== undefined) out[i] = (out[i] as number) + l.amountMinor;
  }
  return out;
}

export interface MonthTotal {
  /** "YYYY-MM" */
  key: string;
  /** "Jun" */
  label: string;
  totalMinor: number;
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Totals for the last `count` calendar months ending with the month of `now` (oldest first). */
export function monthTotals(lines: readonly SpendLine[], now: Date, count: number): MonthTotal[] {
  const out: MonthTotal[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const start = startOfMonthsAgo(now, i);
    const key = toIsoDate(start).slice(0, 7);
    out.push({ key, label: MONTH_LABELS[start.getMonth()] as string, totalMinor: 0 });
  }
  const idx = new Map(out.map((m, i) => [m.key, i]));
  for (const l of lines) {
    const i = idx.get(localDay(l.occurredAt).slice(0, 7));
    if (i !== undefined) (out[i] as MonthTotal).totalMinor += l.amountMinor;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Month-end forecast (core forecastMonthEnd on daily history)

export interface MonthForecast {
  projectedMinor: number;
  medianDailyMinor: number;
  spentToDateMinor: number;
  upcomingRecurringMinor: number;
  /** projected vs the previous full month, e.g. 0.12; null with no previous month data */
  vsLastMonthPct: number | null;
  lastMonthMinor: number;
  hasEnoughData: boolean;
  daysLeft: number;
}

/**
 * spent so far this month + median(daily non-recurring spend, trailing 90 days) × days left +
 * recurring still due. `lines` must cover at least the last 90 days.
 */
export function buildForecast(lines: readonly SpendLine[], now: Date, upcomingRecurringMinor: number): MonthForecast {
  const today = toIsoDate(now);
  const monthStart = `${today.slice(0, 7)}-01`;
  const spentToDateMinor = sumRange(lines, monthStart, today);
  const history = dailyTotals(lines, today, 90);
  const daysLeft = daysInMonth(now) - now.getDate() + 1;
  const f = forecastMonthEnd({ spentToDateMinor, dailyHistoryMinor: history, daysLeft, upcomingRecurringMinor });
  const lastStart = toIsoDate(startOfMonthsAgo(now, 1));
  const lastEnd = toIsoDate(new Date(now.getFullYear(), now.getMonth(), 0));
  const lastMonthMinor = sumRange(lines, lastStart, lastEnd);
  let earliest = today;
  for (const l of lines) {
    const d = localDay(l.occurredAt);
    if (d < earliest) earliest = d;
  }
  const spanDays = Math.round((new Date(`${today}T12:00:00`).getTime() - new Date(`${earliest}T12:00:00`).getTime()) / 86_400_000);
  return {
    projectedMinor: f.projectedMinor,
    medianDailyMinor: f.medianDailyMinor,
    spentToDateMinor,
    upcomingRecurringMinor,
    vsLastMonthPct: lastMonthMinor > 0 ? (f.projectedMinor - lastMonthMinor) / lastMonthMinor : null,
    lastMonthMinor,
    hasEnoughData: spanDays >= 14 && lines.length >= 3,
    daysLeft,
  };
}

// ---------------------------------------------------------------------------
// Budgets

export type BudgetTone = 'signal' | 'slate';

export interface BudgetRowModel {
  pace: BudgetPaceResult;
  tone: BudgetTone;
  statusText: string;
  /** even-pace tick (0..1) */
  tick: number;
  /** computed tip for the expanded panel */
  tip: string;
}

const rupees = (paise: number) => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;

/** Budget row model from spend and limit, using core budgetPace. `day`/`of` = day of the period and its length. */
export function budgetRowModel(spentMinor: number, limitMinor: number, day: number, of: number): BudgetRowModel {
  const pace = budgetPace({ spentMinor, limitMinor, dayOfPeriod: day, daysInPeriod: of });
  const statusText =
    pace.status === 'over'
      ? `Over by ${rupees(pace.overByMinor)}`
      : pace.status === 'heading_over'
        ? `Heading ${rupees(pace.overByMinor)} over`
        : `On track · ${rupees(Math.max(0, pace.leftMinor))} left`;
  const perDay = Math.max(0, Math.floor(pace.leftMinor / Math.max(1, pace.daysLeft)));
  let tip: string;
  if (pace.status === 'over') tip = 'You are past this limit. Nothing more fits without raising it.';
  else if (pace.status === 'heading_over') tip = `Keeping to ${rupees(perDay)} a day from here keeps you inside the limit.`;
  else tip = `You can spend about ${rupees(perDay)} a day and stay on track.`;
  return { pace, tone: pace.status === 'on_track' ? 'slate' : 'signal', statusText, tick: day / of, tip };
}

/** True when `lineCat` is `budgetCat` or one of its descendants (categories form a 2-level tree). */
export function categoryMatches(lineCat: string | null, budgetCat: string, parentOf: ReadonlyMap<string, string | null>): boolean {
  let c: string | null = lineCat;
  for (let i = 0; i < 4 && c; i++) {
    if (c === budgetCat) return true;
    c = parentOf.get(c) ?? null;
  }
  return false;
}

/** Σ of a per-category map for one budget category (including sub-categories). */
export function spentForCategory(byCategory: ReadonlyMap<string | null, number>, budgetCat: string, parentOf: ReadonlyMap<string, string | null>): number {
  let t = 0;
  for (const [k, v] of byCategory) if (categoryMatches(k, budgetCat, parentOf)) t += v;
  return t;
}

/** The day range a budget counts spend in ("YYYY-MM-DD", null = open-ended). */
export function budgetWindow(
  b: { period: 'weekly' | 'monthly' | 'custom'; startsOn: string | null; endsOn: string | null },
  now: Date,
): { from: string | null; to: string | null } {
  if (b.period === 'weekly') {
    const from = weekStartIso(now);
    const end = new Date(`${from}T12:00:00`);
    end.setDate(end.getDate() + 6);
    return { from, to: toIsoDate(end) };
  }
  if (b.period === 'monthly') {
    const from = `${toIsoDate(now).slice(0, 7)}-01`;
    return { from, to: toIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
  }
  return { from: b.startsOn, to: b.endsOn };
}

// ---------------------------------------------------------------------------
// Insights

export interface CategoryDelta {
  categoryId: string | null;
  deltaMinor: number;
  thisMinor: number;
  lastMinor: number;
}

/**
 * Per-category change vs last month, comparing the same first N days of each month so a part-way
 * month isn't compared with a whole one. Sorted by |delta| descending.
 */
export function categoryDeltas(lines: readonly SpendLine[], now: Date, limit = 3): CategoryDelta[] {
  const today = toIsoDate(now);
  const thisStart = `${today.slice(0, 7)}-01`;
  const lastStartD = startOfMonthsAgo(now, 1);
  const lastStart = toIsoDate(lastStartD);
  const lastDim = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  const lastEnd = toIsoDate(new Date(lastStartD.getFullYear(), lastStartD.getMonth(), Math.min(now.getDate(), lastDim)));
  const cur = spendByCategory(lines, thisStart, today);
  const prev = spendByCategory(lines, lastStart, lastEnd);
  const keys = new Set<string | null>([...cur.keys(), ...prev.keys()]);
  const out: CategoryDelta[] = [];
  for (const k of keys) {
    const thisMinor = cur.get(k) ?? 0;
    const lastMinor = prev.get(k) ?? 0;
    if (thisMinor !== lastMinor) out.push({ categoryId: k, deltaMinor: thisMinor - lastMinor, thisMinor, lastMinor });
  }
  return out.sort((a, b) => Math.abs(b.deltaMinor) - Math.abs(a.deltaMinor)).slice(0, limit);
}

export interface Patterns {
  smallFoodCount: number;
  smallFoodMinor: number;
  /** 0..1, null when there is no dining spend this month */
  weekendDiningShare: number | null;
  diningCount: number;
  diningWeekendCount: number;
  lockedInMinor: number;
  largeCount: number;
  largestTitle: string | null;
  largestMinor: number;
}

export const SMALL_PAYMENT_MINOR = 30_000; // ₹300
export const LARGE_ONE_OFF_MINOR = 500_000; // ₹5,000

const isFood = (slug: string | null | undefined) => !!slug && (slug === 'food' || slug.startsWith('food.'));

const CADENCE_MONTHS: Record<string, number> = { monthly: 1, quarterly: 3, half_yearly: 6, yearly: 12 };

/**
 * Monthly-equivalent of a recurring_series row. Weekly and monthly go through core's
 * monthlyEquivalentMinor; quarterly/half-yearly/yearly are spread over their months.
 */
export function monthlyOf(r: { cadence: string; expectedMinor: number }): number {
  if (r.cadence === 'weekly') return monthlyEquivalentMinor({ cadence: 'weekly', amountMinor: r.expectedMinor });
  const months = CADENCE_MONTHS[r.cadence] ?? 1;
  return months === 1 ? monthlyEquivalentMinor({ cadence: 'monthly', amountMinor: r.expectedMinor }) : Math.round(r.expectedMinor / months);
}

/** Computed facts for the Patterns tiles. `recurring` = active series (monthly equivalents summed). */
export function patternStats(
  lines: readonly SpendLine[],
  slugById: ReadonlyMap<string, string | null>,
  recurring: readonly { cadence: string; expectedMinor: number }[],
  now: Date,
): Patterns {
  const today = toIsoDate(now);
  const monthStart = `${today.slice(0, 7)}-01`;
  let smallFoodCount = 0;
  let smallFoodMinor = 0;
  let diningMinor = 0;
  let diningCount = 0;
  let diningWeekendCount = 0;
  let diningWeekendMinor = 0;
  let largeCount = 0;
  let largestTitle: string | null = null;
  let largestMinor = 0;
  for (const l of lines) {
    const d = localDay(l.occurredAt);
    if (d < monthStart || d > today) continue;
    const slug = l.categoryId ? slugById.get(l.categoryId) : null;
    if (isFood(slug)) {
      if (l.amountMinor < SMALL_PAYMENT_MINOR) {
        smallFoodCount += 1;
        smallFoodMinor += l.amountMinor;
      }
      diningMinor += l.amountMinor;
      diningCount += 1;
      const dow = new Date(`${d}T12:00:00`).getDay();
      if (dow === 0 || dow === 6) {
        diningWeekendCount += 1;
        diningWeekendMinor += l.amountMinor;
      }
    }
    if (!l.recurringSeriesId && l.amountMinor >= LARGE_ONE_OFF_MINOR) {
      largeCount += 1;
      if (l.amountMinor > largestMinor) {
        largestMinor = l.amountMinor;
        largestTitle = l.title;
      }
    }
  }
  return {
    smallFoodCount,
    smallFoodMinor,
    weekendDiningShare: diningMinor > 0 ? diningWeekendMinor / diningMinor : null,
    diningCount,
    diningWeekendCount,
    lockedInMinor: recurring.reduce((a, r) => a + monthlyOf(r), 0),
    largeCount,
    largestTitle,
    largestMinor,
  };
}

// ---------------------------------------------------------------------------
// Recurring: flags

export interface SeriesLike {
  id: string;
  name: string;
  kind: 'subscription' | 'emi' | 'bill' | 'other';
  cadence: string;
  expectedMinor: number;
  lastAmountMinor: number | null;
  nextDue: string | null;
  categoryId: string | null;
  merchantId: string | null;
  flags: Record<string, unknown> | null;
  priceUpMinor: number | null;
}

export type SeriesFlag = 'PRICE UP' | 'OVERLAP' | 'UNUSED?';

/** Categories too generic to call an overlap or "unused". */
const GENERIC_SLUGS = new Set(['subscriptions', 'other', 'utilities', 'rent', 'emi', 'insurance']);

export const UNUSED_AFTER_DAYS = 30;

/**
 * Flags per subscription. Stored flags (recurring_series.flags) win; otherwise:
 * - OVERLAP: 2+ active subscriptions in the same non-generic category
 * - UNUSED?: no spend in that category (other than this subscription) in the last 30 days
 */
export function subscriptionFlags(
  subs: readonly SeriesLike[],
  slugById: ReadonlyMap<string, string | null>,
  lines: readonly SpendLine[],
  now: Date,
): Map<string, SeriesFlag[]> {
  const out = new Map<string, SeriesFlag[]>();
  const generic = (c: string | null) => !c || GENERIC_SLUGS.has((slugById.get(c) ?? 'other').split('.')[0] as string);
  const perCat = new Map<string, number>();
  for (const s of subs) if (!generic(s.categoryId)) perCat.set(s.categoryId as string, (perCat.get(s.categoryId as string) ?? 0) + 1);
  const cutoff = toIsoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - UNUSED_AFTER_DAYS));
  const today = toIsoDate(now);
  for (const s of subs) {
    const f: SeriesFlag[] = [];
    if (s.priceUpMinor || s.flags?.['price_up']) f.push('PRICE UP');
    if (s.flags?.['overlap'] || (!generic(s.categoryId) && (perCat.get(s.categoryId as string) ?? 0) >= 2)) f.push('OVERLAP');
    let unused = !!s.flags?.['unused'];
    if (!unused && !generic(s.categoryId)) {
      unused = !lines.some(
        (l) =>
          l.categoryId === s.categoryId &&
          l.recurringSeriesId !== s.id &&
          (s.merchantId === null || l.merchantId !== s.merchantId) &&
          localDay(l.occurredAt) >= cutoff &&
          localDay(l.occurredAt) <= today,
      );
    }
    if (unused) f.push('UNUSED?');
    if (f.length) out.set(s.id, f);
  }
  return out;
}

/**
 * Subscriptions to cancel to remove overlap: within each non-generic category holding 2+
 * subscriptions, every one except the priciest (by monthly equivalent).
 */
export function overlapCancelCandidates(subs: readonly SeriesLike[], slugById: ReadonlyMap<string, string | null>): SeriesLike[] {
  const groups = new Map<string, SeriesLike[]>();
  for (const s of subs) {
    if (s.kind !== 'subscription' || !s.categoryId) continue;
    if (GENERIC_SLUGS.has((slugById.get(s.categoryId) ?? 'other').split('.')[0] as string)) continue;
    groups.set(s.categoryId, [...(groups.get(s.categoryId) ?? []), s]);
  }
  const out: SeriesLike[] = [];
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const sorted = g.slice().sort((a, b) => monthlyOf(b) - monthlyOf(a) || a.id.localeCompare(b.id));
    out.push(...sorted.slice(1));
  }
  return out;
}

/** Σ expected amounts of these series whose next_due falls in [today, monthEnd]. */
export function dueBefore(list: readonly SeriesLike[], today: string, monthEnd: string): number {
  return list.reduce((a, s) => (s.nextDue && s.nextDue >= today && s.nextDue <= monthEnd ? a + s.expectedMinor : a), 0);
}

export interface SubscriptionTotals {
  count: number;
  monthlyMinor: number;
  yearlyMinor: number;
  /** Σ price increases (monthly equivalent), for "up ₹150/month" */
  priceUpMonthlyMinor: number;
}

export function subscriptionTotals(subs: readonly SeriesLike[]): SubscriptionTotals {
  let monthlyMinor = 0;
  let priceUpMonthlyMinor = 0;
  for (const s of subs) {
    monthlyMinor += monthlyOf(s);
    if (s.priceUpMinor) priceUpMonthlyMinor += monthlyOf({ cadence: s.cadence, expectedMinor: s.priceUpMinor });
  }
  return { count: subs.length, monthlyMinor, yearlyMinor: monthlyMinor * 12, priceUpMonthlyMinor };
}

export interface SuggestedSeries {
  key: string;
  name: string;
  merchantId: string | null;
  categoryId: string | null;
  cadence: 'weekly' | 'monthly';
  amountMinor: number;
  nextDate: string;
  occurrences: number;
  priceChange: { fromMinor: number; toMinor: number } | null;
}

/**
 * Client-side suggestions from core detectRecurring over the user's own spend lines
 * (merchant_id, else the normalised title, is the merchant key). Already-tracked names are skipped.
 */
export function suggestSeries(lines: readonly SpendLine[], trackedNames: readonly string[] = []): SuggestedSeries[] {
  const latest = new Map<string, SpendLine>();
  const txns: { id: string; merchantKey: string; amountMinor: number; occurredAt: string }[] = [];
  for (const l of lines) {
    if (l.recurringSeriesId || l.amountMinor <= 0) continue;
    const k = (l.merchantId ?? l.title.trim()).toLowerCase();
    if (!k) continue;
    txns.push({ id: l.id, merchantKey: k, amountMinor: l.amountMinor, occurredAt: localDay(l.occurredAt) });
    const prev = latest.get(k);
    if (!prev || l.occurredAt > prev.occurredAt) latest.set(k, l);
  }
  const tracked = new Set(trackedNames.map((n) => n.trim().toLowerCase()));
  const out: SuggestedSeries[] = [];
  for (const s of detectRecurring(txns)) {
    const l = latest.get(s.merchantKey);
    if (!l || tracked.has(l.title.trim().toLowerCase())) continue;
    out.push({
      key: s.merchantKey,
      name: l.title,
      merchantId: l.merchantId,
      categoryId: l.categoryId,
      cadence: s.cadence,
      amountMinor: s.amountMinor,
      nextDate: s.nextDate,
      occurrences: s.occurrences,
      priceChange: s.priceChange ? { fromMinor: s.priceChange.fromMinor, toMinor: s.priceChange.toMinor } : null,
    });
  }
  return out.sort(
    (a, b) => monthlyOf({ cadence: b.cadence, expectedMinor: b.amountMinor }) - monthlyOf({ cadence: a.cadence, expectedMinor: a.amountMinor }),
  );
}

/** "Fx" from "Flix+ Premium": first letter of the first two words, else the first two letters. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const a = words[0]?.[0] ?? '?';
  const b = words.length > 1 ? (words[1]?.[0] ?? '') : (words[0]?.[1] ?? '');
  return (a.toUpperCase() + b.toLowerCase()).slice(0, 2);
}

/** "1st", "22nd" from a YYYY-MM-DD date. */
export function ordinalDay(iso: string): string {
  const d = Number(iso.slice(8, 10));
  const v = d % 100;
  const suffix = v >= 11 && v <= 13 ? 'th' : (({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[d % 10] ?? 'th');
  return `${d}${suffix}`;
}

// ---------------------------------------------------------------------------
// Afford + what-ifs

export interface AffordBase {
  balanceMinor: number;
  upcomingMinor: number;
  goalSetAsideMinor: number;
  bufferMinor: number;
  daysLeft: number;
  typicalDailySpendMinor?: number;
}

export interface WhatIfToggles {
  skipGoal: boolean;
  eatLess: boolean;
  cancelSubs: boolean;
}

export interface WhatIfDeltas {
  /** Free-to-spend gained by skipping this month's goal saving */
  skipGoalMinor: number;
  /** 20% of the rest-of-month dining projection */
  eatLessMinor: number;
  /** Recurring charges of the cancelled subscriptions that would have landed before month end */
  cancelSubsMinor: number;
}

export const EAT_LESS_FRACTION = 0.2;

/** Dining pace this month × days left × 20%: what "eat out 20% less" frees up for the rest of the month. */
export function eatLessDelta(diningSpentMinor: number, now: Date): number {
  const daysLeft = daysInMonth(now) - now.getDate() + 1;
  const remaining = Math.round((diningSpentMinor / Math.max(1, now.getDate())) * daysLeft);
  return Math.round(remaining * EAT_LESS_FRACTION);
}

export interface AffordScenario extends CanAffordResult {
  /** Change in free-to-spend caused by the toggles */
  appliedDeltaMinor: number;
  upcomingMinor: number;
  goalSetAsideMinor: number;
  eatLessMinor: number;
}

/** canAfford with cumulative what-if toggles applied on top of the base safe-to-spend inputs. */
export function affordScenario(
  base: AffordBase,
  purchaseMinor: number,
  toggles: WhatIfToggles,
  deltas: WhatIfDeltas,
): AffordScenario {
  const goalSetAsideMinor = toggles.skipGoal ? 0 : base.goalSetAsideMinor;
  const upcomingMinor = base.upcomingMinor - (toggles.cancelSubs ? Math.min(deltas.cancelSubsMinor, base.upcomingMinor) : 0);
  const eatLessMinor = toggles.eatLess ? deltas.eatLessMinor : 0;
  const r = canAfford({
    balanceMinor: base.balanceMinor + eatLessMinor,
    upcomingMinor,
    goalSetAsideMinor,
    bufferMinor: base.bufferMinor,
    daysLeft: base.daysLeft,
    purchaseMinor,
    ...(base.typicalDailySpendMinor !== undefined && base.typicalDailySpendMinor > 0
      ? { typicalDailySpendMinor: base.typicalDailySpendMinor }
      : {}),
  });
  const baseFree = base.balanceMinor - base.upcomingMinor - base.goalSetAsideMinor - base.bufferMinor;
  return { ...r, appliedDeltaMinor: r.freeMinor - baseFree, upcomingMinor, goalSetAsideMinor, eatLessMinor };
}

// ---------------------------------------------------------------------------
// Goals

export function ymOf(now: Date): YearMonth {
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function ymFromDate(iso: string): YearMonth {
  return { year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) };
}

export function formatYm(ym: YearMonth): string {
  return `${MONTH_LABELS[ym.month - 1]} ${ym.year}`;
}

/** Monthly amount a goal needs to hit its target date (0 when no date, done, or date passed). */
export function goalMonthlyNeed(g: { targetMinor: number; savedMinor: number; targetDate: string | null }, now: Date): number {
  if (!g.targetDate) return 0;
  return requiredMonthly({ targetMinor: g.targetMinor, savedMinor: g.savedMinor, from: ymOf(now), target: ymFromDate(g.targetDate) }) ?? 0;
}

/** Before/after finish month when this month's saving is skipped (first contribution shifts one month). */
export function skipMonthEta(
  g: { targetMinor: number; savedMinor: number },
  monthlyMinor: number,
  now: Date,
): { before: YearMonth | null; after: YearMonth | null } {
  const from = ymOf(now);
  const base = { targetMinor: g.targetMinor, savedMinor: g.savedMinor, monthlyContributionMinor: monthlyMinor };
  return { before: goalEta({ ...base, from }).finish, after: goalEta({ ...base, from: addMonths(from, 1) }).finish };
}

/** This user's part of a monthly amount by space share weights (whole amount when personal/unknown). */
export function myShareOfMonthly(
  monthlyMinor: number,
  members: readonly { id: string; weight: number }[] | null,
  myMemberId: string | null,
): number {
  if (!members || members.length === 0 || !myMemberId) return monthlyMinor;
  const parts = allocate(monthlyMinor, members.map((m) => (m.weight > 0 ? m.weight : 1)));
  const i = members.findIndex((m) => m.id === myMemberId);
  return i >= 0 ? (parts[i] as number) : monthlyMinor;
}

export type GoalStatus =
  | { kind: 'done' }
  | { kind: 'no_plan' }
  | { kind: 'no_date'; finish: YearMonth | null }
  | { kind: 'on_target' }
  | { kind: 'behind'; finish: YearMonth; extraMinor: number; target: YearMonth };

/** Plan status for a goal at a given monthly amount, using core goalEta + requiredMonthly. */
export function goalPlanStatus(
  g: { targetMinor: number; savedMinor: number; targetDate: string | null },
  monthlyMinor: number,
  now: Date,
): GoalStatus {
  if (g.savedMinor >= g.targetMinor) return { kind: 'done' };
  const eta = goalEta({ targetMinor: g.targetMinor, savedMinor: g.savedMinor, monthlyContributionMinor: monthlyMinor, from: ymOf(now) });
  if (!g.targetDate) return { kind: 'no_date', finish: eta.finish };
  if (!eta.finish) return { kind: 'no_plan' };
  const target = ymFromDate(g.targetDate);
  const need = requiredMonthly({ targetMinor: g.targetMinor, savedMinor: g.savedMinor, from: ymOf(now), target });
  const late = eta.finish.year * 12 + eta.finish.month > target.year * 12 + target.month;
  if (!late) return { kind: 'on_target' };
  return { kind: 'behind', finish: eta.finish, target, extraMinor: Math.max(0, (need ?? 0) - monthlyMinor) };
}

// ---------------------------------------------------------------------------
// Timeline

export type TimelineFilter = 'all' | 'expenses' | 'shared' | 'payments' | 'bills' | 'alerts' | 'goals';
export const TIMELINE_FILTERS: { value: TimelineFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'expenses', label: 'Expenses' },
  { value: 'shared', label: 'Shared' },
  { value: 'payments', label: 'Payments' },
  { value: 'bills', label: 'Bills' },
  { value: 'alerts', label: 'Alerts' },
  { value: 'goals', label: 'Goals' },
];

export const TIMELINE_PAGE_SIZE = 30;

export interface TimelineEventRow {
  event_type: string | null;
  ref_id: string | null;
  space_id: string | null;
  occurred_at: string | null;
  title: string | null;
  amount_minor: number | string | null;
  status: string | null;
  detail: string | null;
}

export type TimelineBadge = 'PAID' | 'ALERT' | 'EXP' | 'BDGT' | 'SPLIT' | 'GOAL' | 'BILL';

export interface TimelineItem {
  key: string;
  refId: string;
  badge: TimelineBadge;
  title: string;
  subtitle: string;
  /** signed paise for display; null = no amount */
  amountMinor: number | null;
  occurredAt: string;
  /** keyset cursor values */
  cursor: { occurredAt: string; refId: string };
  route: string;
}

const SOURCE_TEXT: Record<string, string> = {
  upi_alert: 'Auto-captured from UPI alert',
  sms: 'Auto-captured from SMS',
  ebill: 'From an e-bill',
  scan: 'Scanned bill',
  voice: 'Added by voice',
  text: 'Added by text',
  manual: 'Added by you',
  recurring: 'Recurring payment',
  assistant: 'Added by PayMind',
};

const PAYMENT_TEXT: Record<string, string> = {
  initiated: 'waiting for confirmation',
  pending: 'waiting for confirmation',
  completed: 'completed',
  confirmed_manual: 'recorded manually',
  corrected: 'amount corrected',
  failed: 'failed',
  cancelled: 'cancelled',
};

export function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function mapTimelineEvent(r: TimelineEventRow): TimelineItem | null {
  if (!r.occurred_at || !r.ref_id || !r.event_type) return null;
  const amount = r.amount_minor === null ? null : Math.round(Number(r.amount_minor));
  const time = hhmm(r.occurred_at);
  const base = {
    refId: r.ref_id,
    occurredAt: r.occurred_at,
    cursor: { occurredAt: r.occurred_at, refId: r.ref_id },
    key: `${r.event_type}:${r.ref_id}`,
  };
  switch (r.event_type) {
    case 'expense': {
      const bill = r.detail === 'recurring';
      const shared = !!r.space_id;
      const src = SOURCE_TEXT[r.detail ?? ''] ?? 'Expense';
      return {
        ...base,
        badge: bill ? 'BILL' : shared ? 'SPLIT' : 'EXP',
        title: r.title ?? 'Expense',
        subtitle: `${shared ? 'Shared · ' : ''}${src} · ${time}`,
        amountMinor: amount === null ? null : -amount,
        route: bill ? '/recurring' : shared ? `/split/${r.ref_id}` : `/understand/${r.ref_id}`,
      };
    }
    case 'payment': {
      const pending = r.status === 'pending' || r.status === 'initiated';
      const what = PAYMENT_TEXT[r.status ?? ''] ?? r.status;
      return {
        ...base,
        badge: 'PAID',
        title: r.title ?? 'Payment',
        subtitle: what ? `${what} · ${time}` : time,
        amountMinor: amount,
        route: pending ? `/verify/${r.ref_id}` : '/settle',
      };
    }
    case 'goal':
      return { ...base, badge: 'GOAL', title: r.title ?? 'Goal', subtitle: `Contribution · ${time}`, amountMinor: amount, route: '/goals' };
    case 'alert':
      return {
        ...base,
        badge: 'ALERT',
        title: r.title ?? 'Flagged for review',
        subtitle: `${r.status ? `Reviewed · ${r.status.replace('_', ' ')}` : 'Needs a look'} · ${time}`,
        amountMinor: amount,
        route: '/insights',
      };
    default:
      return null;
  }
}

/**
 * PostgREST `or` filter for "strictly older than the cursor" on (occurred_at desc, ref_id desc).
 * The view has no global id, so (occurred_at, ref_id) is the keyset.
 */
export function keysetFilter(cursor: { occurredAt: string; refId: string }): string {
  return `occurred_at.lt.${cursor.occurredAt},and(occurred_at.eq.${cursor.occurredAt},ref_id.lt.${cursor.refId})`;
}

export interface DayGroup {
  key: string;
  label: string;
  items: TimelineItem[];
}

/** "TODAY · 14 OCT", "YESTERDAY · 13 OCT", "12 OCT". Input must be newest-first. */
export function groupByDay(items: readonly TimelineItem[], now: Date): DayGroup[] {
  const today = toIsoDate(now);
  const yest = toIsoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const groups: DayGroup[] = [];
  for (const it of items) {
    const day = localDay(it.occurredAt);
    let g = groups[groups.length - 1];
    if (!g || g.key !== day) {
      const d = new Date(`${day}T12:00:00`);
      const short = `${d.getDate()} ${(MONTH_LABELS[d.getMonth()] ?? '').toUpperCase()}`;
      g = { key: day, label: day === today ? `TODAY · ${short}` : day === yest ? `YESTERDAY · ${short}` : short, items: [] };
      groups.push(g);
    }
    g.items.push(it);
  }
  return groups;
}

/** Merge a freshly fetched page into the list, dropping duplicates (same key). */
export function appendUnique(existing: readonly TimelineItem[], page: readonly TimelineItem[]): TimelineItem[] {
  const seen = new Set(existing.map((i) => i.key));
  return [...existing, ...page.filter((p) => !seen.has(p.key))];
}

export function pctText(p: number): string {
  const v = Math.round(p * 100);
  return `${v >= 0 ? '+' : '−'}${Math.abs(v)}%`;
}
