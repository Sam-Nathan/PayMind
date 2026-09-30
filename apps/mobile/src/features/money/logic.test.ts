import { describe, expect, it } from 'vitest';
import {
  affordScenario,
  budgetRowModel,
  budgetWindow,
  buildForecast,
  categoryDeltas,
  categoryMatches,
  dailyTotals,
  dueBefore,
  eatLessDelta,
  goalMonthlyNeed,
  goalPlanStatus,
  groupByDay,
  initials,
  keysetFilter,
  mapTimelineEvent,
  monthTotals,
  monthlyOf,
  myShareOfMonthly,
  ordinalDay,
  overlapCancelCandidates,
  patternStats,
  skipMonthEta,
  spendByCategory,
  spentForCategory,
  subscriptionFlags,
  subscriptionTotals,
  suggestSeries,
  sumRange,
  weekStartIso,
  type SeriesLike,
  type SpendLine,
} from './logic.ts';

// Local-time helpers: the logic buckets by the device's local day.
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h, 0, 0).toISOString();
const NOW = new Date(2026, 9, 14, 12); // Tue 14 Oct 2026, day 14 of 31

let n = 0;
const line = (over: Partial<SpendLine> & { amountMinor: number; occurredAt: string }): SpendLine => ({
  id: `l${++n}`,
  title: 'Shop',
  merchantId: null,
  categoryId: null,
  recurringSeriesId: null,
  shared: false,
  ...over,
});

describe('spend aggregation', () => {
  const lines = [
    line({ amountMinor: 10000, occurredAt: at(2026, 10, 1), categoryId: 'food' }),
    line({ amountMinor: 20000, occurredAt: at(2026, 10, 14), categoryId: 'food' }),
    line({ amountMinor: 5000, occurredAt: at(2026, 10, 14), categoryId: 'fuel' }),
    line({ amountMinor: 7000, occurredAt: at(2026, 9, 30), categoryId: 'food' }),
    line({ amountMinor: 900, occurredAt: at(2026, 10, 14), categoryId: null }),
  ];
  it('sums by category inside an inclusive day range, null = uncategorised', () => {
    const m = spendByCategory(lines, '2026-10-01', '2026-10-14');
    expect(m.get('food')).toBe(30000);
    expect(m.get('fuel')).toBe(5000);
    expect(m.get(null)).toBe(900);
    expect(m.has('missing')).toBe(false);
  });
  it('sumRange honours the range and an optional predicate', () => {
    expect(sumRange(lines, '2026-10-01', '2026-10-14')).toBe(35900);
    expect(sumRange(lines, '2026-09-01', '2026-09-30')).toBe(7000);
    expect(sumRange(lines, '2026-10-01', '2026-10-14', (l) => l.categoryId === 'fuel')).toBe(5000);
  });
  it('rolls sub-categories up into a parent budget', () => {
    const parentOf = new Map<string, string | null>([
      ['food', null],
      ['food.dining', 'food'],
      ['food.cafe', 'food'],
      ['fuel', null],
    ]);
    const by = new Map<string | null, number>([
      ['food', 100],
      ['food.dining', 200],
      ['food.cafe', 50],
      ['fuel', 999],
    ]);
    expect(spentForCategory(by, 'food', parentOf)).toBe(350);
    expect(spentForCategory(by, 'food.cafe', parentOf)).toBe(50);
    expect(categoryMatches('food.dining', 'fuel', parentOf)).toBe(false);
    expect(categoryMatches(null, 'food', parentOf)).toBe(false);
  });
  it('monthTotals gives 5 months oldest-first and ignores older spend', () => {
    const t = monthTotals(lines, NOW, 5);
    expect(t.map((m) => m.label)).toEqual(['Jun', 'Jul', 'Aug', 'Sep', 'Oct']);
    expect(t[3]?.totalMinor).toBe(7000);
    expect(t[4]?.totalMinor).toBe(35900);
    expect(monthTotals(lines, NOW, 1)).toHaveLength(1);
  });
});

describe('forecast input', () => {
  it('dailyTotals: one entry per day, zeros included, recurring excluded', () => {
    const lines = [
      line({ amountMinor: 100, occurredAt: at(2026, 10, 14) }),
      line({ amountMinor: 50, occurredAt: at(2026, 10, 14) }),
      line({ amountMinor: 999, occurredAt: at(2026, 10, 13), recurringSeriesId: 'r1' }),
      line({ amountMinor: 70, occurredAt: at(2026, 10, 12) }),
      line({ amountMinor: 5, occurredAt: at(2026, 9, 1) }), // outside a 3-day window
    ];
    expect(dailyTotals(lines, '2026-10-14', 3)).toEqual([70, 0, 150]);
    expect(dailyTotals(lines, '2026-10-14', 3, true)).toEqual([70, 999, 150]);
    expect(dailyTotals(lines, '2026-10-14', 90)).toHaveLength(90);
  });

  it('buildForecast = spent + median daily × days left + recurring due (core forecastMonthEnd)', () => {
    // ₹1,000 every day from 1 Sep to 14 Oct, none recurring
    const lines: SpendLine[] = [];
    for (let d = 0; d < 44; d++) lines.push(line({ amountMinor: 100000, occurredAt: new Date(2026, 8, 1 + d, 12).toISOString() }));
    const f = buildForecast(lines, NOW, 1638800);
    const spent = 14 * 100000;
    expect(f.spentToDateMinor).toBe(spent);
    expect(f.daysLeft).toBe(18);
    // the last 90 days include 46 zero days before 1 Sep, so the median of the window is 0 → only spent + recurring
    expect(f.medianDailyMinor).toBe(0);
    expect(f.projectedMinor).toBe(spent + 1638800);
    // Sep 1–30 = 30 days × ₹1,000
    expect(f.lastMonthMinor).toBe(3_000_000);
    expect(f.vsLastMonthPct).toBeCloseTo((f.projectedMinor - 3_000_000) / 3_000_000);
    expect(f.hasEnoughData).toBe(true);
  });

  it('buildForecast uses the median when most days have spend', () => {
    const lines: SpendLine[] = [];
    for (let d = 0; d < 90; d++) lines.push(line({ amountMinor: 50000, occurredAt: new Date(2026, 9, 14 - d, 12).toISOString() }));
    const f = buildForecast(lines, NOW, 0);
    expect(f.medianDailyMinor).toBe(50000);
    expect(f.projectedMinor).toBe(f.spentToDateMinor + 50000 * 18);
  });

  it('flags too little history', () => {
    const f = buildForecast([line({ amountMinor: 100, occurredAt: at(2026, 10, 13) })], NOW, 0);
    expect(f.hasEnoughData).toBe(false);
    expect(f.vsLastMonthPct).toBeNull();
  });
});

describe('budget row (core budgetPace)', () => {
  it('food ₹6,240 of ₹8,000 on day 14 of 31 is heading over with a ₹446/day pace', () => {
    const m = budgetRowModel(624000, 800000, 14, 31);
    expect(m.tone).toBe('signal');
    expect(m.statusText).toMatch(/^Heading ₹/);
    expect(Math.round(m.pace.pacePerDayMinor / 100)).toBe(446);
    expect(m.tick).toBeCloseTo(14 / 31);
  });
  it('transport ₹1,380 of ₹3,000 is on track with ₹1,620 left', () => {
    const m = budgetRowModel(138000, 300000, 14, 31);
    expect(m.tone).toBe('slate');
    expect(m.statusText).toBe('On track · ₹1,620 left');
  });
  it('over the limit', () => {
    const m = budgetRowModel(900000, 800000, 20, 31);
    expect(m.statusText).toBe('Over by ₹1,000');
  });
  it('windows: weekly starts Monday, monthly covers the month, custom passes through', () => {
    expect(weekStartIso(NOW)).toBe('2026-10-12');
    expect(budgetWindow({ period: 'weekly', startsOn: null, endsOn: null }, NOW)).toEqual({ from: '2026-10-12', to: '2026-10-18' });
    expect(budgetWindow({ period: 'monthly', startsOn: null, endsOn: null }, NOW)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(budgetWindow({ period: 'custom', startsOn: '2026-11-02', endsOn: '2026-11-06' }, NOW)).toEqual({ from: '2026-11-02', to: '2026-11-06' });
  });
});

describe('insights', () => {
  it('categoryDeltas compares the same days of the month and sorts by size', () => {
    const lines = [
      line({ amountMinor: 50000, occurredAt: at(2026, 10, 10), categoryId: 'dining' }),
      line({ amountMinor: 10000, occurredAt: at(2026, 9, 10), categoryId: 'dining' }),
      line({ amountMinor: 99999, occurredAt: at(2026, 9, 25), categoryId: 'dining' }), // after day 14: excluded
      line({ amountMinor: 3000, occurredAt: at(2026, 10, 5), categoryId: 'power' }),
      line({ amountMinor: 9000, occurredAt: at(2026, 9, 5), categoryId: 'power' }),
    ];
    const d = categoryDeltas(lines, NOW, 3);
    expect(d.map((x) => [x.categoryId, x.deltaMinor])).toEqual([
      ['dining', 40000],
      ['power', -6000],
    ]);
  });

  it('patternStats: small food payments, weekend share, large one-offs, locked-in recurring', () => {
    const slug = new Map<string, string | null>([
      ['cafe', 'food.cafe'],
      ['dine', 'food.dining'],
      ['tech', 'shopping'],
    ]);
    const lines = [
      line({ amountMinor: 12000, occurredAt: at(2026, 10, 3), categoryId: 'cafe' }), // Sat
      line({ amountMinor: 18000, occurredAt: at(2026, 10, 7), categoryId: 'cafe' }), // Wed
      line({ amountMinor: 100000, occurredAt: at(2026, 10, 4), categoryId: 'dine' }), // Sun
      line({ amountMinor: 699000, occurredAt: at(2026, 10, 9), categoryId: 'tech', title: 'Headphones' }),
      line({ amountMinor: 800000, occurredAt: at(2026, 10, 9), categoryId: 'tech', recurringSeriesId: 'r' }), // recurring: not a one-off
      line({ amountMinor: 45000, occurredAt: at(2026, 9, 9), categoryId: 'cafe' }), // last month
    ];
    const p = patternStats(lines, slug, [{ cadence: 'monthly', expectedMinor: 100000 }, { cadence: 'yearly', expectedMinor: 120000 }], NOW);
    expect(p.smallFoodCount).toBe(2);
    expect(p.smallFoodMinor).toBe(30000);
    expect(p.diningCount).toBe(3);
    expect(p.diningWeekendCount).toBe(2);
    expect(p.weekendDiningShare).toBeCloseTo((12000 + 100000) / (12000 + 18000 + 100000));
    expect(p.largeCount).toBe(1);
    expect(p.largestTitle).toBe('Headphones');
    expect(p.lockedInMinor).toBe(100000 + 10000);
  });
});

describe('recurring', () => {
  const s = (over: Partial<SeriesLike> & { id: string }): SeriesLike => ({
    name: over.id,
    kind: 'subscription',
    cadence: 'monthly',
    expectedMinor: 10000,
    lastAmountMinor: null,
    nextDue: null,
    categoryId: null,
    merchantId: null,
    flags: null,
    priceUpMinor: null,
    ...over,
  });
  const slug = new Map<string, string | null>([
    ['video', 'entertainment'],
    ['gym', 'health'],
    ['subs', 'subscriptions'],
  ]);

  it('monthly equivalents via core', () => {
    expect(monthlyOf({ cadence: 'weekly', expectedMinor: 41000 })).toBe(177667);
    expect(monthlyOf({ cadence: 'yearly', expectedMinor: 120000 })).toBe(10000);
    expect(monthlyOf({ cadence: 'monthly', expectedMinor: 64900 })).toBe(64900);
  });

  it('flags: price up from stored flags, overlap by shared non-generic category, unused by no related spend in 30 days', () => {
    const subs = [
      s({ id: 'flix', categoryId: 'video', priceUpMinor: 15000, expectedMinor: 64900 }),
      s({ id: 'lite', categoryId: 'video', expectedMinor: 19900 }),
      s({ id: 'fit', categoryId: 'gym', expectedMinor: 149900 }),
      s({ id: 'cloud', categoryId: 'subs' }), // generic category: never overlap/unused
    ];
    const lines = [line({ amountMinor: 500, occurredAt: at(2026, 10, 10), categoryId: 'video' })]; // video used recently
    const f = subscriptionFlags(subs, slug, lines, NOW);
    expect(f.get('flix')).toEqual(['PRICE UP', 'OVERLAP']);
    expect(f.get('lite')).toEqual(['OVERLAP']);
    expect(f.get('fit')).toEqual(['UNUSED?']);
    expect(f.has('cloud')).toBe(false);
  });

  it('a payment for the subscription itself does not count as use', () => {
    const subs = [s({ id: 'fit', categoryId: 'gym', merchantId: 'm-fit' })];
    const own = line({ amountMinor: 149900, occurredAt: at(2026, 10, 1), categoryId: 'gym', merchantId: 'm-fit' });
    expect(subscriptionFlags(subs, slug, [own], NOW).get('fit')).toEqual(['UNUSED?']);
    const other = line({ amountMinor: 300, occurredAt: at(2026, 10, 1), categoryId: 'gym', merchantId: 'm-other' });
    expect(subscriptionFlags(subs, slug, [other], NOW).has('fit')).toBe(false);
  });

  it('totals and overlap cancel candidates keep the priciest', () => {
    const subs = [
      s({ id: 'flix', categoryId: 'video', priceUpMinor: 15000, expectedMinor: 64900 }),
      s({ id: 'lite', categoryId: 'video', expectedMinor: 19900, nextDue: '2026-10-28' }),
      s({ id: 'news', categoryId: 'video', expectedMinor: 9900, nextDue: '2026-11-03' }),
    ];
    const t = subscriptionTotals(subs);
    expect(t.monthlyMinor).toBe(64900 + 19900 + 9900);
    expect(t.yearlyMinor).toBe(t.monthlyMinor * 12);
    expect(t.priceUpMonthlyMinor).toBe(15000);
    const cancel = overlapCancelCandidates(subs, slug);
    expect(cancel.map((c) => c.id).sort()).toEqual(['lite', 'news']);
    expect(dueBefore(cancel, '2026-10-14', '2026-10-31')).toBe(19900);
  });

  it('suggests a series from spend history and skips tracked names', () => {
    const lines = [
      line({ title: 'Flix+', merchantId: 'm1', amountMinor: 49900, occurredAt: at(2026, 6, 27) }),
      line({ title: 'Flix+', merchantId: 'm1', amountMinor: 49900, occurredAt: at(2026, 7, 27) }),
      line({ title: 'Flix+', merchantId: 'm1', amountMinor: 49900, occurredAt: at(2026, 8, 27) }),
      line({ title: 'Flix+', merchantId: 'm1', amountMinor: 64900, occurredAt: at(2026, 9, 27) }),
      line({ title: 'Flix+', merchantId: 'm1', amountMinor: 64900, occurredAt: at(2026, 10, 27, 12) }),
      line({ title: 'Random shop', amountMinor: 1000, occurredAt: at(2026, 10, 2) }),
    ];
    const sug = suggestSeries(lines);
    expect(sug).toHaveLength(1);
    expect(sug[0]).toMatchObject({ name: 'Flix+', cadence: 'monthly', amountMinor: 64900, merchantId: 'm1' });
    expect(sug[0]?.priceChange).toEqual({ fromMinor: 49900, toMinor: 64900 });
    expect(suggestSeries(lines, ['flix+'])).toHaveLength(0);
    // spend already linked to a series is not re-suggested
    expect(suggestSeries(lines.map((l) => ({ ...l, recurringSeriesId: 'x' })))).toHaveLength(0);
  });

  it('labels', () => {
    expect(initials('Flix+ Premium')).toBe('Fp');
    expect(initials('CloudVault')).toBe('Cl');
    expect(ordinalDay('2026-10-22')).toBe('22nd');
    expect(ordinalDay('2026-10-01')).toBe('1st');
    expect(ordinalDay('2026-10-11')).toBe('11th');
  });
});

describe('afford + what-ifs (design page 14 numbers)', () => {
  const base = { balanceMinor: 5238000, upcomingMinor: 1638800, goalSetAsideMinor: 1000000, bufferMinor: 500000, daysLeft: 18 };
  const off = { skipGoal: false, eatLess: false, cancelSubs: false };
  const deltas = { skipGoalMinor: 1000000, eatLessMinor: 156000, cancelSubsMinor: 39800 };

  it('₹20,000 phone: ₹992 left for 18 days, not affordable', () => {
    const r = affordScenario(base, 2000000, off, deltas);
    expect(r.freeMinor).toBe(2099200);
    expect(r.leftMinor).toBe(99200);
    expect(r.verdict).toBe('no');
    expect(r.appliedDeltaMinor).toBe(0);
  });
  it('skipping the goal saving adds ₹10,000 and flips the verdict', () => {
    const r = affordScenario(base, 2000000, { ...off, skipGoal: true }, deltas);
    expect(r.freeMinor).toBe(3099200);
    expect(r.appliedDeltaMinor).toBe(1000000);
    expect(r.goalSetAsideMinor).toBe(0);
    expect(r.verdict).not.toBe('no');
  });
  it('toggles are cumulative', () => {
    const r = affordScenario(base, 2000000, { skipGoal: true, eatLess: true, cancelSubs: true }, deltas);
    expect(r.appliedDeltaMinor).toBe(1000000 + 156000 + 39800);
    expect(r.upcomingMinor).toBe(1638800 - 39800);
  });
  it('cancelling never removes more than what is due', () => {
    const r = affordScenario({ ...base, upcomingMinor: 10000 }, 100, { ...off, cancelSubs: true }, deltas);
    expect(r.upcomingMinor).toBe(0);
  });
  it('typical daily spend of 0 falls back to safe-to-spend per day', () => {
    const a = affordScenario({ ...base, typicalDailySpendMinor: 0 }, 500000, off, deltas);
    const b = affordScenario(base, 500000, off, deltas);
    expect(a.verdict).toBe(b.verdict);
  });
  it('eatLessDelta = 20% of the paced rest-of-month dining spend', () => {
    // ₹14,000 on food in 14 days -> ₹1,000/day × 18 days left = ₹18,000 -> 20% = ₹3,600
    expect(eatLessDelta(1400000, NOW)).toBe(360000);
    expect(eatLessDelta(0, NOW)).toBe(0);
  });
});

describe('goals', () => {
  const kashmir = { targetMinor: 12000000, savedMinor: 4600000, targetDate: '2027-03-15' };
  it('needs ₹14,800/month for Mar 2027 and is on target at that pace', () => {
    expect(goalMonthlyNeed(kashmir, NOW)).toBe(1480000);
    expect(goalPlanStatus(kashmir, 1480000, NOW)).toEqual({ kind: 'on_target' });
  });
  it('behind: finish month and the extra needed a month', () => {
    const s = goalPlanStatus(kashmir, 1200000, NOW);
    expect(s).toMatchObject({ kind: 'behind', finish: { year: 2027, month: 5 }, target: { year: 2027, month: 3 } });
    expect(s.kind === 'behind' && s.extraMinor).toBe(280000);
  });
  it('no plan / no date / done', () => {
    expect(goalPlanStatus(kashmir, 0, NOW)).toEqual({ kind: 'no_plan' });
    expect(goalPlanStatus({ ...kashmir, targetDate: null }, 1480000, NOW)).toMatchObject({ kind: 'no_date' });
    expect(goalPlanStatus({ ...kashmir, savedMinor: 12000000 }, 0, NOW)).toEqual({ kind: 'done' });
    expect(goalMonthlyNeed({ ...kashmir, targetDate: null }, NOW)).toBe(0);
  });
  it('skipping this month moves March to April 2027', () => {
    expect(skipMonthEta(kashmir, 1480000, NOW)).toEqual({ before: { year: 2027, month: 3 }, after: { year: 2027, month: 4 } });
  });
  it('splits a monthly amount by share weights and returns my part', () => {
    const members = [
      { id: 'me', weight: 60 },
      { id: 'ananya', weight: 40 },
    ];
    expect(myShareOfMonthly(1480000, members, 'me')).toBe(888000);
    expect(myShareOfMonthly(1480000, members, 'ananya')).toBe(592000);
    expect(myShareOfMonthly(1480000, null, null)).toBe(1480000);
    expect(myShareOfMonthly(1480000, members, 'nobody')).toBe(1480000);
  });
});

describe('timeline', () => {
  const row = (over: Record<string, unknown>) => ({
    event_type: 'expense',
    ref_id: 'r1',
    space_id: null,
    occurred_at: at(2026, 10, 14, 9),
    title: 'Brew Street Café',
    amount_minor: 24000,
    status: 'confirmed',
    detail: 'upi_alert',
    ...over,
  });

  it('maps event types to badges, signs and routes', () => {
    const exp = mapTimelineEvent(row({}))!;
    expect(exp).toMatchObject({ badge: 'EXP', amountMinor: -24000, route: '/understand/r1' });
    expect(exp.subtitle).toMatch(/Auto-captured from UPI alert · 09:00/);
    expect(mapTimelineEvent(row({ space_id: 's1', detail: 'scan' }))).toMatchObject({ badge: 'SPLIT', route: '/split/r1' });
    expect(mapTimelineEvent(row({ detail: 'recurring' }))).toMatchObject({ badge: 'BILL', route: '/recurring' });
    expect(mapTimelineEvent(row({ event_type: 'payment', status: 'pending' }))).toMatchObject({ badge: 'PAID', amountMinor: 24000, route: '/verify/r1' });
    expect(mapTimelineEvent(row({ event_type: 'payment', status: 'completed' }))).toMatchObject({ route: '/settle' });
    expect(mapTimelineEvent(row({ event_type: 'goal' }))).toMatchObject({ badge: 'GOAL', route: '/goals' });
    expect(mapTimelineEvent(row({ event_type: 'alert', amount_minor: null, status: null }))).toMatchObject({ badge: 'ALERT', amountMinor: null, route: '/insights' });
  });
  it('drops malformed rows and unknown types', () => {
    expect(mapTimelineEvent(row({ ref_id: null }))).toBeNull();
    expect(mapTimelineEvent(row({ event_type: 'mystery' }))).toBeNull();
    expect(mapTimelineEvent(row({ amount_minor: '4860' }))?.amountMinor).toBe(-4860);
  });
  it('keyset filter is strictly older on (occurred_at, ref_id)', () => {
    expect(keysetFilter({ occurredAt: '2026-10-14T03:42:00.123456+00:00', refId: 'abc' })).toBe(
      'occurred_at.lt.2026-10-14T03:42:00.123456+00:00,and(occurred_at.eq.2026-10-14T03:42:00.123456+00:00,ref_id.lt.abc)',
    );
  });
  it('groups newest-first items by local day with TODAY / YESTERDAY labels', () => {
    const items = [
      mapTimelineEvent(row({ ref_id: 'a', occurred_at: at(2026, 10, 14, 10) }))!,
      mapTimelineEvent(row({ ref_id: 'b', occurred_at: at(2026, 10, 14, 9) }))!,
      mapTimelineEvent(row({ ref_id: 'c', occurred_at: at(2026, 10, 13, 20) }))!,
      mapTimelineEvent(row({ ref_id: 'd', occurred_at: at(2026, 10, 12, 8) }))!,
    ];
    const g = groupByDay(items, NOW);
    expect(g.map((x) => [x.label, x.items.length])).toEqual([
      ['TODAY · 14 OCT', 2],
      ['YESTERDAY · 13 OCT', 1],
      ['12 OCT', 1],
    ]);
  });
});
