import { describe, expect, it } from 'vitest';
import { applySplitRule, SplitRuleSchema, type SplitRule } from '@paymind/core';
import {
  billKindOf,
  billShares,
  billTotal,
  categoryBreakdown,
  coupleSplit,
  coupleStatus,
  defaultSplitForExpense,
  defaultSplitToPreset,
  inclusiveDays,
  inviteMessage,
  parseInviteCode,
  planVsActual,
  presetToDefaultSplit,
  reportFacts,
  ruleFromRow,
  ruleParams,
  tripShareText,
  type ExpenseLike,
} from './logic.ts';

const cats = [
  { id: 'c-food', slug: 'food.dining', name: 'Dining' },
  { id: 'c-stay', slug: 'stay', name: 'Stay' },
  { id: 'c-shop', slug: 'shopping', name: 'Shopping' },
  { id: 'c-rent', slug: 'rent', name: 'Rent' },
];
const exp = (id: string, title: string, totalMinor: number, categoryId: string | null, paidByMember: string | null = 'a'): ExpenseLike => ({
  id,
  title,
  totalMinor,
  categoryId,
  paidByMember,
  occurredAt: '2026-10-04T12:00:00Z',
});

describe('categoryBreakdown', () => {
  it('rolls sub-categories up and sorts by amount', () => {
    const r = categoryBreakdown(
      [exp('1', 'Seafood', 510000, 'c-food'), exp('2', 'Villa', 2400000, 'c-stay'), exp('3', 'Sunset', 50000, 'c-food'), exp('4', 'Mystery', 1000, null)],
      cats,
    );
    expect(r.map((x) => [x.slug, x.totalMinor])).toEqual([
      ['stay', 2400000],
      ['food', 560000],
      ['other', 1000],
    ]);
    expect(r[1]?.name).toBe('Food');
  });
});

describe('plan vs actual + facts', () => {
  const actual = categoryBreakdown(
    [exp('1', 'Villa', 2400000, 'c-stay'), exp('2', 'Seafood night', 510000, 'c-food'), exp('3', 'Dinner', 910000, 'c-food'), exp('4', 'Shawl', 170000, 'c-shop')],
    cats,
  );
  const plan = planVsActual(
    actual,
    new Map([
      ['stay', 2500000],
      ['food', 1200000],
      ['shopping', 900000],
      ['activities', 800000],
    ]),
  );
  it('includes planned categories nobody spent on', () => {
    expect(plan.find((r) => r.slug === 'activities')).toMatchObject({ plannedMinor: 800000, actualMinor: 0 });
    expect(plan.find((r) => r.slug === 'food')).toMatchObject({ plannedMinor: 1200000, actualMinor: 1420000 });
  });
  it('leaves unplanned categories without a plan', () => {
    const p = planVsActual(actual, new Map());
    expect(p.every((r) => r.plannedMinor === null)).toBe(true);
  });
  it('writes at most four plain facts from the data', () => {
    const facts = reportFacts({
      expenses: [exp('1', 'Villa', 2400000, 'c-stay'), exp('2', 'Seafood night', 510000, 'c-food'), exp('3', 'Dinner', 910000, 'c-food'), exp('4', 'Shawl', 170000, 'c-shop')],
      breakdown: actual,
      plan,
      paidByName: [
        { name: 'Sunny', paidMinor: 1700000 },
        { name: 'Priya', paidMinor: 1500000 },
        { name: 'Rahul', paidMinor: 790000 },
      ],
    });
    expect(facts.length).toBeLessThanOrEqual(4);
    expect(facts[0]).toBe('Stay was the biggest spend: ₹24,000, 60% of the total.');
    expect(facts).toContain('Food ran 18% over plan: ₹14,200 against ₹12,000.');
    expect(facts.join(' ')).toContain('Activities came in ₹8,000 under plan.');
    expect(facts.join(' ')).toContain('Sunny and Priya fronted 80% of all costs between them.');
  });
  it('has no facts for an empty trip', () => {
    expect(reportFacts({ expenses: [], breakdown: [], plan: [], paidByName: [] })).toEqual([]);
  });
  it('builds the share text with balances', () => {
    const t = tripShareText({
      name: 'Goa',
      range: '2–6 Oct',
      totalMinor: 6840000,
      perPersonMinor: 1368000,
      budgetMinor: 7500000,
      balances: [
        { name: 'Sunny', paidMinor: 1788000, netMinor: 420000 },
        { name: 'Arjun', paidMinor: 1138000, netMinor: -230000 },
        { name: 'Meera', paidMinor: 1303000, netMinor: 0 },
      ],
    });
    expect(t).toContain('Goa, 2–6 Oct — trip report');
    expect(t).toContain('₹6,600 under the ₹75,000 budget');
    expect(t).toContain('Sunny: ₹17,880 · +₹4,200');
    expect(t).toContain('Arjun: ₹11,380 · −₹2,300');
    expect(t).toContain('Meera: ₹13,030 · square');
  });
});

describe('inclusiveDays', () => {
  it('counts both ends', () => {
    expect(inclusiveDays('2026-10-02', '2026-10-06')).toBe(5);
    expect(inclusiveDays('2026-10-02', '2026-10-02')).toBe(1);
    expect(inclusiveDays('2026-10-06', '2026-10-02')).toBe(1);
  });
});

describe('couple split presets', () => {
  it('round-trips the presets through spaces.default_split', () => {
    for (const preset of ['50-50', '60-40', '70-30', 'item'] as const) {
      const ds = presetToDefaultSplit(preset, 'me', 'her');
      expect(defaultSplitToPreset(ds, 'me', 'her').preset).toBe(preset);
    }
    const fixed = presetToDefaultSplit('fixed', 'me', 'her', 500000);
    expect(defaultSplitToPreset(fixed, 'me', 'her')).toEqual({ preset: 'fixed', fixedPartnerMinor: 500000, flipped: false });
  });
  it('stores a core-valid SplitRule for every preset', () => {
    expect(presetToDefaultSplit('60-40', 'me', 'her')).toEqual({ method: 'ratio', ratio: { me: 60, her: 40 } });
    expect(presetToDefaultSplit('50-50', 'me', 'her')).toEqual({ method: 'equal', members: ['me', 'her'] });
    for (const preset of ['50-50', '60-40', '70-30', 'fixed', 'item'] as const) {
      const ds = presetToDefaultSplit(preset, 'me', 'her', 250000);
      const rule = SplitRuleSchema.parse(ds) as SplitRule;
      const shares = applySplitRule(10001, rule);
      expect(Object.values(shares).reduce((a, b) => a + b, 0)).toBe(10001);
    }
  });
  it('reads the rule from the partner\'s side', () => {
    const ds = presetToDefaultSplit('60-40', 'me', 'her');
    expect(defaultSplitToPreset(ds, 'her', 'me')).toEqual({ preset: '60-40', fixedPartnerMinor: 0, flipped: true });
    const s = coupleSplit(1000, '60-40', 'her', 'me', 0, true);
    expect(s).toMatchObject({ myShareMinor: 400, partnerShareMinor: 600, myPercent: 40 });
    const fixed = presetToDefaultSplit('fixed', 'me', 'her', 300);
    expect(defaultSplitToPreset(fixed, 'her', 'me')).toEqual({ preset: 'fixed', fixedPartnerMinor: 300, flipped: true });
    expect(coupleSplit(1000, 'fixed', 'her', 'me', 300, true)).toMatchObject({ myShareMinor: 300, partnerShareMinor: 700 });
  });
  it('tolerates the legacy shapes written before round 3', () => {
    expect(defaultSplitToPreset({ method: 'by_item' }, 'me', 'her').preset).toBe('item');
    expect(defaultSplitToPreset({ method: 'fixed', amounts: { her: 500000 } }, 'me', 'her')).toEqual({
      preset: 'fixed',
      fixedPartnerMinor: 500000,
      flipped: false,
    });
    expect(defaultSplitForExpense({ method: 'by_item' }, ['me', 'her'])).toBeNull();
    expect(defaultSplitForExpense({ method: 'fixed', amounts: { her: 5 } }, ['me', 'her'])).toBeNull();
  });
  it('turns a default split into expense-new inputs', () => {
    expect(defaultSplitForExpense(presetToDefaultSplit('70-30', 'me', 'her'), ['me', 'her'])).toEqual({
      method: 'ratio',
      weights: { me: 70, her: 30 },
    });
    expect(defaultSplitForExpense(presetToDefaultSplit('fixed', 'me', 'her', 9), ['me', 'her'])).toEqual({
      method: 'equal',
      memberIds: ['me', 'her'],
    });
    expect(defaultSplitForExpense({ method: 'equal', members: ['me', 'gone'] }, ['me', 'her'])).toEqual({
      method: 'equal',
      memberIds: ['me'],
    });
    expect(defaultSplitForExpense({ method: 'equal' }, ['me'])).toBeNull();
    expect(defaultSplitForExpense(null, ['me'])).toBeNull();
  });
  it('defaults to 50/50 when nothing usable is stored', () => {
    expect(defaultSplitToPreset(null, 'me', 'her').preset).toBe('50-50');
    expect(defaultSplitToPreset({ method: 'equal' }, 'me', 'her').preset).toBe('50-50');
    expect(defaultSplitToPreset({ method: 'ratio', ratio: { me: 55, her: 45 } }, 'me', 'her').preset).toBe('50-50');
  });
  it('splits the month exactly', () => {
    const s = coupleSplit(1840000, '60-40', 'me', 'her');
    expect(s).toMatchObject({ myShareMinor: 1104000, partnerShareMinor: 736000, myPercent: 60 });
    const odd = coupleSplit(10001, '50-50', 'me', 'her');
    expect(odd.myShareMinor + odd.partnerShareMinor).toBe(10001);
    const fixed = coupleSplit(1000000, 'fixed', 'me', 'her', 300000);
    expect(fixed).toMatchObject({ myShareMinor: 700000, partnerShareMinor: 300000 });
    expect(coupleSplit(1000000, 'fixed', 'me', 'her', 9999999).partnerShareMinor).toBe(1000000);
  });
  it('says who owes whom', () => {
    expect(coupleStatus(1104000, 1104000, 'Ananya').tone).toBe('square');
    expect(coupleStatus(1500000, 1104000, 'Ananya')).toMatchObject({ tone: 'owed', amountMinor: 396000, text: 'Ananya owes you ₹3,960' });
    expect(coupleStatus(500000, 1104000, 'Ananya')).toMatchObject({ tone: 'owe', text: 'You owe Ananya ₹6,040' });
  });
});

describe('roommate bill rules', () => {
  const members = [
    { id: 'you', displayName: 'You', shareWeight: 160 },
    { id: 'karthik', displayName: 'Karthik', shareWeight: 140 },
    { id: 'neel', displayName: 'Neel', shareWeight: 120 },
  ];
  it('splits rent by room size', () => {
    const rule = ruleFromRow('by_room', ruleParams('by_room', members), members);
    expect(billShares(4200000, rule)).toEqual({ you: 1600000, karthik: 1400000, neel: 1200000 });
  });
  it('splits equally', () => {
    const rule = ruleFromRow('equal', ruleParams('equal', members), members);
    expect(billShares(105000, rule)).toEqual({ you: 35000, karthik: 35000, neel: 35000 });
  });
  it('splits electricity by sub-meter readings with core splitByUsage', () => {
    const rule = ruleFromRow('by_usage', { usage: { you: 104, karthik: 148, neel: 120 } }, members);
    const s = billShares(372000, rule) as Record<string, number>;
    expect(s['you']).toBe(104000);
    expect(s['karthik']).toBe(148000);
    expect(s['neel']).toBe(120000);
    expect(Object.values(s).reduce((a, b) => a + b, 0)).toBe(372000);
  });
  it('gives usage bills a common part split equally', () => {
    const rule = ruleFromRow('by_usage', { usage: { you: 1, karthik: 1, neel: 2 }, common: { type: 'fraction', fraction: 0.25 } }, members);
    const s = billShares(400000, rule) as Record<string, number>;
    expect(Object.values(s).reduce((a, b) => a + b, 0)).toBe(400000);
    expect(s['neel']).toBeGreaterThan(s['you'] as number);
  });
  it('returns null when a rule cannot be applied yet', () => {
    expect(ruleFromRow('by_usage', { usage: {} }, members)).toBeNull();
    expect(ruleFromRow('by_usage', { usage: { you: 0, karthik: 0, neel: 0 } }, members)).toBeNull();
    expect(ruleFromRow('by_item', {}, members)).toBeNull();
    expect(billShares(0, ruleFromRow('equal', {}, members))).toBeNull();
    expect(billShares(1000, null)).toBeNull();
  });
  it('turns a bill name into a stable kind and finds its month total', () => {
    expect(billKindOf(' Cleaning & Maintenance! ')).toBe('cleaning_maintenance');
    const month = [exp('1', 'Electricity bill Sept', 372000, null), exp('2', 'Internet', 105000, null), exp('3', 'Flat rent', 4200000, 'c-rent'), exp('4', 'Landlord', 100, 'c-rent')];
    expect(billTotal('electricity', month, cats)).toBe(372000);
    expect(billTotal('rent', month, cats)).toBe(4200000 + 100);
    expect(billTotal('cleaning', month, cats)).toBe(0);
  });
});

describe('invites', () => {
  it('writes the share text', () => {
    expect(inviteMessage('Flat 402', 'K7M2QX9A')).toBe('Join Flat 402 on PayMind: paymind://invite/K7M2QX9A (code K7M2QX9A)');
  });
  it('parses a pasted link or a bare code', () => {
    expect(parseInviteCode('paymind://invite/k7m2qx9a')).toBe('K7M2QX9A');
    expect(parseInviteCode('  k7m2-qx9a ')).toBe('K7M2QX9A');
    expect(parseInviteCode('Join Flat on PayMind: paymind://invite/K7M2QX9A (code K7M2QX9A)')).toBe('K7M2QX9A');
    expect(parseInviteCode('ab')).toBeNull();
    expect(parseInviteCode('not a code!!')).toBeNull();
    expect(parseInviteCode('')).toBeNull();
  });
});
