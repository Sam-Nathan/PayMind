import { formatINR, type BillFlag, type BillParseResult, type ExpenseParseResult } from '@paymind/core';
import { describe, expect, it } from 'vitest';
import type { ExpenseResolution } from '../../data/ai.ts';
import { buildBillExpensePayload } from './billPayload.ts';
import {
  addItem,
  applyFlagAction,
  computeTotals,
  draftFromBill,
  draftLines,
  flagSpec,
  isEdited,
  openFlags,
  removeItem,
  setTip,
  updateItem,
  guessCategorySlug,
  type BillDraft,
} from './draft.ts';
import { describeExpenseProposal } from './proposal.ts';
import { parseSearchQuery, enabledFilters, termPatterns } from './searchQuery.ts';
import {
  bumpUnits,
  computeSplit,
  defaultSplitState,
  extrasLabel,
  rationale,
  setInput,
  setMode,
  setParticipants,
  toggleOn,
} from './split.ts';
import { toPlainText } from './text.ts';
import { buildVoiceSplit, explainOwes, voiceDraftFromParse } from './voiceDraft.ts';

// Tandoor House, design page 5/6 (paise).
const bill: BillParseResult = {
  merchant: 'Tandoor House',
  location: 'Hubli',
  datetime: '2026-10-13T21:42:00',
  items: [
    { name: 'Paneer Tikka', qty: 1, unitPriceMinor: 32000, amountMinor: 32000 },
    { name: 'Butter Chicken', qty: 1, unitPriceMinor: 42000, amountMinor: 42000 },
    { name: 'Dal Makhani', qty: 1, unitPriceMinor: 28000, amountMinor: 28000 },
    { name: 'Butter Naan', qty: 4, unitPriceMinor: 6000, amountMinor: 24000 },
    { name: 'Veg Biryani', qty: 1, unitPriceMinor: 34000, amountMinor: 34000 },
    { name: 'Fresh Lime Soda', qty: 3, unitPriceMinor: 9000, amountMinor: 27000 },
    { name: 'Fresh Lime Soda', qty: 1, unitPriceMinor: 9000, amountMinor: 9000 },
  ],
  subtotalMinor: 196000,
  discounts: [{ label: 'Coupon', ratePct: null, amountMinor: 15000 }],
  serviceCharge: { label: 'Service charge', ratePct: 5, amountMinor: 9050 },
  tax: [{ label: 'GST', ratePct: 5, amountMinor: 9050 }],
  tipMinor: 10000,
  totalMinor: 199100,
  currency: 'INR',
};
const flags: BillFlag[] = [
  { type: 'possible_duplicate_line', reason: 'Printed right after 3 Fresh Lime Soda.', lineIndex: 6, amountMinor: 9000, resolution: null },
  { type: 'service_charge', reason: 'Service charge is usually optional.', lineIndex: null, amountMinor: 9050, resolution: null },
];
const meta = { proposalId: '99999999-9999-4999-8999-999999999999', source: 'scan' as const, receiptPath: null };

const ME = '11111111-1111-4111-8111-111111111111';
const RAHUL = '22222222-2222-4222-8222-222222222222';
const PRIYA = '33333333-3333-4333-8333-333333333333';
const SPACE = '44444444-4444-4444-8444-444444444444';

function fresh(): BillDraft {
  return draftFromBill(bill, flags, meta);
}

describe('bill draft', () => {
  it('reproduces the printed bill before any edit', () => {
    const t = computeTotals(fresh());
    expect(t.subtotalMinor).toBe(196000);
    expect(t.billTotalMinor).toBe(199100);
    expect(t.totalMinor).toBe(209100); // design: Total you paid ₹2,091.00 with the ₹100 tip
    expect(t.matchesPrinted).toBe(true);
    expect(openFlags(fresh())).toHaveLength(2);
  });

  it('Remove it drops the duplicate and recomputes service/GST to 5% of the discounted subtotal', () => {
    let d = fresh();
    const flag = d.flags.find((f) => f.type === 'possible_duplicate_line')!;
    d = applyFlagAction(d, flag.id, 'primary');
    const t = computeTotals(d);
    expect(d.items).toHaveLength(6);
    expect(d.service?.amountMinor).toBe(8600);
    expect(d.tax[0]?.amountMinor).toBe(8600);
    expect(t.totalMinor).toBe(199200); // design: Split page total ₹1,992.00
    expect(t.matchesPrinted).toBe(false);
    expect(isEdited(d)).toBe(true);
    expect(openFlags(d).map((f) => f.type)).toEqual(['service_charge']);
  });

  it('We had 4 keeps the line and labels the button with the combined quantity', () => {
    let d = fresh();
    const flag = d.flags.find((f) => f.type === 'possible_duplicate_line')!;
    expect(flagSpec(d, flag).secondaryLabel).toBe('We had 4');
    d = applyFlagAction(d, flag.id, 'secondary');
    expect(d.items).toHaveLength(7);
    expect(isEdited(d)).toBe(false);
    expect(d.flags.find((f) => f.id === flag.id)?.resolution).toBe('kept');
  });

  it('It was removed takes the service charge line off', () => {
    let d = fresh();
    const flag = d.flags.find((f) => f.type === 'service_charge')!;
    expect(flagSpec(d, flag).title).toBe('Service charge added (5%)');
    d = applyFlagAction(d, flag.id, 'secondary');
    expect(d.service).toBeNull();
    expect(computeTotals(d).billTotalMinor).toBe(196000 - 15000 + 9050);
  });

  it('editing items reopens resolved flags and recalculates', () => {
    let d = fresh();
    d = applyFlagAction(d, d.flags[1]!.id, 'primary'); // keep service
    expect(openFlags(d)).toHaveLength(1);
    d = updateItem(d, d.items[0]!.id, { amountMinor: 40000 });
    expect(openFlags(d)).toHaveLength(2);
    expect(d.service?.amountMinor).toBe(Math.round(((196000 + 8000 - 15000) * 5) / 100));
  });

  it('adds an item and a tip; lines add up to the total', () => {
    let d = fresh();
    d = addItem(d, { name: 'Extra roti', qty: 2, amountMinor: 5000 });
    d = setTip(d, 12000);
    d = removeItem(d, d.items[1]!.id);
    const sum = draftLines(d).reduce((a, l) => a + l.amountMinor, 0);
    expect(sum).toBe(computeTotals(d).totalMinor);
  });

  it('guesses a category from the merchant name', () => {
    expect(guessCategorySlug('Brew Street Café')).toBe('food.cafe');
    expect(guessCategorySlug('Tandoor House')).toBe('food.dining');
    expect(guessCategorySlug('XYZ Traders', ['Bolt'])).toBeNull();
  });
});

describe('item split (design page 6)', () => {
  function designState() {
    let d = fresh();
    d = applyFlagAction(d, d.flags[0]!.id, 'primary');
    d = setTip(d, 10000);
    let s = defaultSplitState(d, [ME, RAHUL, PRIYA]);
    const id = (name: string) => d.items.find((i) => i.name === name)!.id;
    // Butter Chicken: Rahul only, Dal: Priya only, Biryani: me only
    const only = (itemId: string, who: string) => {
      for (const m of [ME, RAHUL, PRIYA]) if (m !== who) s = toggleOn(s, itemId, m);
    };
    only(id('Butter Chicken'), RAHUL);
    only(id('Dal Makhani'), PRIYA);
    only(id('Veg Biryani'), ME);
    return { d, s };
  }

  it('gives each person the exact share from core and adds up to the total', () => {
    const { d, s } = designState();
    const c = computeSplit(d, s);
    expect(c.problem).toBeNull();
    const r = c.result!;
    expect(r.totalMinor).toBe(199200);
    expect(r.members.reduce((a, m) => a + m.totalMinor, 0)).toBe(199200);
    // design: You 699.51 / Rahul 720.81 / Priya 571.68
    expect(r.byMember[ME]?.totalMinor).toBe(69951);
    expect(r.byMember[RAHUL]?.totalMinor).toBe(72081);
    expect(r.byMember[PRIYA]?.totalMinor).toBe(57168);
    expect(r.byMember[ME]?.itemsMinor).toBe(65667);
  });

  it('quantity items default to 2/1/1 and cycle on tap', () => {
    const { d, s } = designState();
    const naan = d.items.find((i) => i.name === 'Butter Naan')!;
    expect(s.assigns[naan.id]?.units).toEqual({ [ME]: 2, [RAHUL]: 1, [PRIYA]: 1 });
    const s2 = bumpUnits(s, naan, PRIYA);
    expect(s2.assigns[naan.id]?.units[PRIYA]).toBe(2);
    const s3 = bumpUnits(bumpUnits(bumpUnits(bumpUnits(s2, naan, PRIYA), naan, PRIYA), naan, PRIYA), naan, PRIYA);
    expect(s3.assigns[naan.id]?.units[PRIYA]).toBe(1);
  });

  it('validates custom percent and custom amounts with friendly messages', () => {
    const { d, s } = designState();
    const tikka = d.items.find((i) => i.name === 'Paneer Tikka')!;
    let s2 = setMode(s, tikka.id, 'percent');
    s2 = setInput(s2, tikka.id, 'pct', ME, '50');
    s2 = setInput(s2, tikka.id, 'pct', RAHUL, '30');
    s2 = setInput(s2, tikka.id, 'pct', PRIYA, '10');
    expect(computeSplit(d, s2).itemErrors[tikka.id]).toMatch(/add up to 90%/);
    s2 = setInput(s2, tikka.id, 'pct', PRIYA, '20');
    expect(computeSplit(d, s2).result?.lines.find((l) => l.itemId === tikka.id)?.shares[ME]).toBe(16000);

    let s3 = setMode(s, tikka.id, 'fixed');
    s3 = setInput(s3, tikka.id, 'fixed', ME, '100');
    s3 = setInput(s3, tikka.id, 'fixed', RAHUL, '100');
    s3 = setInput(s3, tikka.id, 'fixed', PRIYA, '100');
    expect(computeSplit(d, s3).itemErrors[tikka.id]).toMatch(/₹20.00 is still left/);
  });

  it('extras equal vs proportional still add up', () => {
    const { d, s } = designState();
    const eq = computeSplit(d, { ...s, extrasSpread: 'equal' }).result!;
    expect(eq.members.reduce((a, m) => a + m.totalMinor, 0)).toBe(199200);
    expect(extrasLabel(d)).toBe('Coupon, service, GST & tip');
  });

  it('removing a participant keeps the rest consistent; one person is not a split', () => {
    const { d, s } = designState();
    const s2 = setParticipants(d, s, [ME, RAHUL]);
    expect(computeSplit(d, s2).itemErrors[d.items.find((i) => i.name === 'Dal Makhani')!.id]).toMatch(/Pick at least one/);
    const solo = setParticipants(d, s, [ME]);
    expect(computeSplit(d, solo).problem).toMatch(/at least one other person/);
  });
});

describe('create_expense payload for a bill', () => {
  it('personal: items add up to the total, no shares', () => {
    const d = setTip(fresh(), 10000);
    const p = buildBillExpensePayload({ draft: d, categoryId: null, edited: false });
    expect(p.space_id).toBeNull();
    expect(p.total_minor).toBe(209100);
    expect(p.items.reduce((a, i) => a + i.amount_minor, 0)).toBe(p.total_minor);
    expect(p.items.some((i) => i.kind === 'discount' && i.amount_minor === -15000)).toBe(true);
    expect(p.shares).toBeUndefined();
    expect(p.paid_by_member).toBeUndefined();
    expect(p.proposal_id).toBe(meta.proposalId);
    expect(p.proposal_status).toBe('accepted');
    expect(p.source).toBe('scan');
  });

  it('shared: expense shares sum to total and item shares sum per item', () => {
    let d = fresh();
    d = applyFlagAction(d, d.flags[0]!.id, 'primary');
    d = setTip(d, 10000);
    const s = defaultSplitState(d, [ME, RAHUL, PRIYA]);
    const result = computeSplit(d, s).result!;
    const p = buildBillExpensePayload({
      draft: d,
      categoryId: null,
      edited: true,
      shared: { spaceId: SPACE, paidByMember: ME, state: s, result },
    });
    expect(p.proposal_status).toBe('edited');
    expect(p.shares!.reduce((a, x) => a + x.owed_minor, 0)).toBe(p.total_minor);
    for (const item of p.items) {
      if (item.kind === 'item') expect(item.shares!.reduce((a, x) => a + x.amount_minor, 0)).toBe(item.amount_minor);
      else expect(item.shares).toBeUndefined();
    }
    const naan = p.items.find((i) => i.name === 'Butter Naan')!;
    expect(naan.shares?.map((x) => x.units)).toEqual([2, 1, 1]);
    expect(naan.unit_price_minor).toBe(6000);
  });

  it('drops item shares when line rounding would disagree with member totals (no extras)', () => {
    const plain: BillParseResult = {
      ...bill,
      items: [{ name: 'Thing', qty: 1, unitPriceMinor: 1000, amountMinor: 1000 }],
      subtotalMinor: 1000,
      discounts: [],
      serviceCharge: null,
      tax: [],
      tipMinor: null,
      totalMinor: 1000,
    };
    const d = draftFromBill(plain, [], meta);
    const s = defaultSplitState(d, [ME, RAHUL, PRIYA]);
    const result = computeSplit(d, s).result!;
    const p = buildBillExpensePayload({ draft: d, categoryId: null, edited: false, shared: { spaceId: SPACE, paidByMember: ME, state: s, result } });
    expect(p.shares!.reduce((a, x) => a + x.owed_minor, 0)).toBe(1000);
  });

  it('rejects an empty bill', () => {
    expect(() => buildBillExpensePayload({ draft: { ...fresh(), items: [] }, categoryId: null, edited: false })).toThrow(/at least one item/i);
  });
});

describe('voice draft', () => {
  const expense: ExpenseParseResult = {
    amountMinor: 30000,
    merchant: 'Auto-rickshaw',
    category: 'transport.local_rides',
    date: '2026-10-13',
    with: ['Neel'],
    paidBy: 'me',
    paidVia: 'cash',
    split: { type: 'equal' },
    note: 'Station to flat',
    spaceHint: 'Flat 402',
  };
  const resolution: ExpenseResolution = {
    spaceId: SPACE,
    spaceName: 'Flat 402',
    meMemberId: ME,
    people: [{ spoken: 'Neel', memberId: RAHUL, displayName: 'Neel', spaceId: SPACE, ambiguous: false, candidates: [] }],
  };

  it('resolves Neel to a member and explains the debt with core', () => {
    const d = voiceDraftFromParse(expense, resolution, '2026-10-14');
    expect(d.withIds).toEqual([RAHUL]);
    expect(d.spaceId).toBe(SPACE);
    expect(d.paidVia).toBe('cash');
    expect(d.guessed.note).toBeTruthy();
    const split = buildVoiceSplit(d, ME)!;
    expect(split).toEqual({ method: 'equal', memberIds: [ME, RAHUL] });
    const line = explainOwes({ shares: { [ME]: 15000, [RAHUL]: 15000 }, payerId: ME, meId: ME, nameOf: () => 'Neel', spaceName: 'Flat 402' });
    expect(line).toBe('Neel will owe you ₹150 in Flat 402.');
  });

  it('is personal with nobody else, and keeps unknown names aside', () => {
    const d = voiceDraftFromParse({ ...expense, with: [] }, { ...resolution, people: [], spaceId: null }, '2026-10-14');
    expect(buildVoiceSplit(d, ME)).toBeNull();
    const d2 = voiceDraftFromParse(
      expense,
      { ...resolution, people: [{ spoken: 'Zed', memberId: null, displayName: null, spaceId: null, ambiguous: false, candidates: [] }] },
      '2026-10-14',
    );
    expect(d2.unresolved).toEqual(['Zed']);
  });

  it('maps a spoken ratio to member ids and supports each/mixed explanations', () => {
    const d = voiceDraftFromParse({ ...expense, split: { type: 'ratio', ratio: { me: 1, Neel: 2 } } }, resolution, '2026-10-14');
    expect(buildVoiceSplit(d, ME)).toEqual({ method: 'ratio', weights: { [ME]: 1, [RAHUL]: 2 } });
    const names: Record<string, string> = { [RAHUL]: 'Rahul', [PRIYA]: 'Priya' };
    const nameOf = (id: string) => names[id] ?? 'You';
    expect(
      explainOwes({ shares: { [ME]: 28334, [RAHUL]: 28333, [PRIYA]: 28333 }, payerId: ME, meId: ME, nameOf, spaceName: 'Friends' }),
    ).toBe('Rahul and Priya will each owe you ₹283.33 in Friends.');
    expect(explainOwes({ shares: { [ME]: 10000, [RAHUL]: 20000 }, payerId: RAHUL, meId: ME, nameOf, spaceName: null })).toBe(
      "You'll owe Rahul ₹100.",
    );
  });

  it('formats like the design', () => {
    expect(formatINR(85000, { decimals: 'auto' })).toBe('₹850');
  });
});

describe('split rationale', () => {
  it('describes the choices in plain words', () => {
    let d = fresh();
    d = applyFlagAction(d, d.flags[0]!.id, 'primary');
    const s = defaultSplitState(d, [ME, RAHUL, PRIYA]);
    const names: Record<string, string> = { [ME]: 'you', [RAHUL]: 'Rahul', [PRIYA]: 'Priya' };
    const r = rationale(d, s, (id) => names[id] as string);
    expect(r[0]).toBe('4 items shared by all 3');
    expect(r.some((l) => l.startsWith('Butter Naan by count: 2 for you, 1 for Rahul, 1 for Priya'))).toBe(true);
    expect(r.at(-1)).toBe('Coupon, service, GST & tip spread by what each person ordered');
  });
});

describe('assistant expense proposal', () => {
  const members = [
    { id: ME, spaceId: SPACE, userId: 'u', displayName: 'Sunny', upiVpa: null, role: 'owner' as const, shareWeight: 1, leftAt: null },
    { id: RAHUL, spaceId: SPACE, userId: null, displayName: 'Rahul', upiVpa: null, role: 'member' as const, shareWeight: 1, leftAt: null },
    { id: PRIYA, spaceId: SPACE, userId: null, displayName: 'Priya', upiVpa: null, role: 'member' as const, shareWeight: 1, leftAt: null },
  ];
  const cats = [{ id: 'c1', parentId: null, ownerId: null, slug: 'food.dining', name: 'Dining', icon: null, sortOrder: 1 }];

  it('splits 850 three ways like the design', () => {
    const v = describeExpenseProposal(
      { amountMinor: 85000, category: 'food.dining', spaceId: SPACE, splitWithMemberIds: [ME, RAHUL, PRIYA], paidVia: 'upi' },
      { members, meId: ME, spaceName: 'Friends', categories: cats, now: new Date(2026, 9, 14) },
    );
    expect(v.title).toBe('Create expense + split');
    expect(v.fields.find((f) => f.label === 'Each owes')?.value).toBe('₹283.33');
    expect(v.summary).toBe('Rahul and Priya will each owe you ₹283.33 in Friends.');
    expect(v.draft?.split).toEqual({ method: 'equal', memberIds: [ME, RAHUL, PRIYA] });
    expect(v.draft?.categoryId).toBe('c1');
    expect(v.doneText).toBe('Done — added ₹850 · Friends');
  });

  it('is personal without a space', () => {
    const v = describeExpenseProposal(
      { amountMinor: 30000, merchant: 'Auto' },
      { members: [], meId: null, spaceName: null, categories: cats, now: new Date(2026, 9, 14) },
    );
    expect(v.draft?.spaceId).toBeNull();
    expect(v.draft?.split).toBeNull();
  });
});

describe('plain text', () => {
  it('strips markdown links, images and html', () => {
    expect(toPlainText('See [this](https://evil.test/x) and ![pic](https://evil.test/i.png) now')).toBe('See this and pic now');
    expect(toPlainText('**Rahul** owes ₹1,850\n- one\n- two <b>x</b>')).toBe('Rahul owes ₹1,850\n• one\n• two x');
    expect(toPlainText('# Title\n`code`')).toBe('Title\ncode');
  });
});

describe('search query parsing', () => {
  const now = new Date(2026, 9, 14); // 14 Oct 2026
  const ctx = {
    now,
    people: ['Rahul Sharma', 'Priya'],
    spaces: [
      { id: 's1', name: 'Goa Trip' },
      { id: 's2', name: 'Flat 402' },
    ],
  };

  it('Uber this year', () => {
    const p = parseSearchQuery('How much did I spend on Uber this year', ctx);
    expect(p.term).toBe('Uber');
    expect(p.filters).toMatchObject([{ kind: 'period', from: '2026-01-01', to: '2027-01-01' }]);
  });

  it('amounts and people', () => {
    const p = parseSearchQuery('Above ₹5,000', ctx);
    expect(p.term).toBe('');
    expect(p.filters).toMatchObject([{ kind: 'min', minMinor: 500000 }]);
    const q = parseSearchQuery('involving Rahul under 2k', ctx);
    expect(q.filters.map((f) => f.kind).sort()).toEqual(['max', 'person']);
    expect(q.filters.find((f) => f.kind === 'max')).toMatchObject({ maxMinor: 200000 });
    expect(parseSearchQuery('dinner Priya', ctx).filters[0]).toMatchObject({ kind: 'person', person: 'Priya' });
  });

  it('months (past or later in the year), spaces and leftovers', () => {
    const aug = parseSearchQuery('Family groceries · Aug', ctx);
    expect(aug.term).toBe('Family groceries');
    expect(aug.filters[0]).toMatchObject({ kind: 'period', from: '2026-08-01', to: '2026-09-01', label: 'Aug' });
    const dec = parseSearchQuery('diwali shopping december', ctx);
    expect(dec.filters[0]).toMatchObject({ from: '2025-12-01', to: '2026-01-01' });
    const goa = parseSearchQuery('food in Goa Trip last month', ctx);
    expect(goa.filters.map((f) => f.kind).sort()).toEqual(['period', 'space']);
    expect(goa.term).toBe('food');
  });

  it('disabled chips are ignored; term patterns are safe for or() filters', () => {
    const p = parseSearchQuery('Uber above 5000', ctx);
    expect(enabledFilters(p, new Set(['min']))).toHaveLength(0);
    expect(termPatterns('blue (dart), inc')).toEqual(['blue dart inc', 'blue', 'dart', 'inc']);
    expect(termPatterns('')).toEqual([]);
  });
});
