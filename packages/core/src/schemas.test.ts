import { describe, expect, it } from 'vitest';
import {
  BillFlagSchema,
  BillParseResultSchema,
  CreateExpenseInputSchema,
  CreateSpaceInputSchema,
  ExpenseParseResultSchema,
  ParsedTxnSchema,
  SplitRuleSchema,
  ItemAssignmentSchema,
} from './schemas.ts';
import { splitItems } from './split/items.ts';
import { parsePaymentText } from './capture/parse.ts';

const U = {
  space: '5b0e1c8e-6f2a-4d3b-9a51-0c1d2e3f4a5b',
  you: '11111111-1111-4111-8111-111111111111',
  rahul: '22222222-2222-4222-8222-222222222222',
  priya: '33333333-3333-4333-8333-333333333333',
};

describe('CreateExpenseInput', () => {
  const split = splitItems({
    members: [U.you, U.rahul, U.priya],
    items: [
      { id: 'a', name: 'Paneer Tikka', amountMinor: 32000, kind: 'item', assignment: { type: 'equal', members: [U.you, U.rahul, U.priya] } },
      { id: 'b', name: 'Butter Chicken', amountMinor: 42000, kind: 'item', assignment: { type: 'equal', members: [U.rahul] } },
      { id: 'c', name: 'Coupon', amountMinor: -15000, kind: 'discount' },
    ],
  });
  const valid = {
    spaceId: U.space,
    merchantName: 'Tandoor House',
    totalMinor: split.totalMinor,
    paidByMember: U.you,
    paidVia: 'upi',
    occurredAt: '2026-10-13T21:42:00+05:30',
    source: 'scan',
    visibility: 'shared',
    items: [
      { clientId: 'a', name: 'Paneer Tikka', qty: 1, amountMinor: 32000, kind: 'item' },
      { clientId: 'b', name: 'Butter Chicken', qty: 1, amountMinor: 42000, kind: 'item' },
      { clientId: 'c', name: 'Coupon', amountMinor: -15000, kind: 'discount' },
    ],
    itemShares: [
      { itemClientId: 'a', memberId: U.you, units: 1 },
      { itemClientId: 'a', memberId: U.rahul, units: 1 },
      { itemClientId: 'a', memberId: U.priya, units: 1 },
      { itemClientId: 'b', memberId: U.rahul, pct: 100 },
    ],
    memberShares: split.members.map((m) => ({ memberId: m.memberId, owedMinor: m.totalMinor })),
  };

  it('accepts a payload built from splitItems and applies defaults', () => {
    const parsed = CreateExpenseInputSchema.parse(valid);
    expect(parsed.currency).toBe('INR');
    expect(parsed.items[2]?.qty).toBe(1);
    expect(parsed.memberShares.reduce((a, s) => a + s.owedMinor, 0)).toBe(59000);
  });

  it('rejects inconsistent sums, floats, unknown items and bad shares', () => {
    const bad = (patch: object) => CreateExpenseInputSchema.safeParse({ ...valid, ...patch }).success;
    expect(bad({ totalMinor: 59001 })).toBe(false);
    expect(bad({ totalMinor: 590.5 })).toBe(false);
    expect(bad({ memberShares: [{ memberId: U.you, owedMinor: 59000 }, { memberId: U.you, owedMinor: 0 }] })).toBe(false);
    expect(bad({ itemShares: [{ itemClientId: 'zzz', memberId: U.you, units: 1 }] })).toBe(false);
    expect(bad({ itemShares: [{ itemClientId: 'a', memberId: U.you, units: 1, pct: 50 }] })).toBe(false);
    expect(bad({ visibility: 'shared', spaceId: null })).toBe(false);
    expect(bad({ memberShares: [] })).toBe(false);
    expect(bad({ occurredAt: 'yesterday' })).toBe(false);
  });

  it('personal expense without items or shares', () => {
    const r = CreateExpenseInputSchema.safeParse({
      totalMinor: 24000,
      paidByMember: U.you,
      paidVia: 'upi',
      occurredAt: '2026-10-14T09:12:00+05:30',
      source: 'upi_alert',
      visibility: 'personal',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.spaceId).toBeNull();
  });
});

describe('CreateSpaceInput', () => {
  it('trip with dates, budget and members', () => {
    const r = CreateSpaceInputSchema.parse({
      type: 'trip',
      name: 'Goa Trip',
      startsOn: '2026-10-02',
      endsOn: '2026-10-06',
      budgetMinor: 7500000,
      defaultSplit: { method: 'equal', members: ['a', 'b'] },
      members: [{ displayName: 'Rahul' }, { displayName: 'Meera', userId: U.priya }],
    });
    expect(r.members[0]).toMatchObject({ userId: null, role: 'member', shareWeight: 1 });
    expect(CreateSpaceInputSchema.safeParse({ type: 'trip', name: 'x', startsOn: '2026-10-06', endsOn: '2026-10-02' }).success).toBe(false);
    expect(CreateSpaceInputSchema.safeParse({ type: 'yacht', name: 'x' }).success).toBe(false);
  });

  it('split rule and assignment schemas mirror core types', () => {
    expect(SplitRuleSchema.safeParse({ method: 'by_usage', usage: { a: 24 }, common: { type: 'rate', ratePerUnitMinor: 1000 } }).success).toBe(true);
    expect(SplitRuleSchema.safeParse({ method: 'ratio', ratio: { a: -1 } }).success).toBe(false);
    expect(ItemAssignmentSchema.safeParse({ type: 'units', units: { a: 2, b: 1 } }).success).toBe(true);
    expect(ItemAssignmentSchema.safeParse({ type: 'fixed', amounts: { a: 1.5 } }).success).toBe(false);
  });
});

describe('AI outputs', () => {
  it('BillParseResult: the Tandoor House bill (page 4)', () => {
    const bill = {
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
        { name: 'Fresh Lime Soda', qty: 1, unitPriceMinor: null, amountMinor: 9000 },
      ],
      subtotalMinor: 196000,
      discounts: [{ label: 'DISC COUPON', ratePct: null, amountMinor: 15000 }],
      serviceCharge: { label: 'SVC CHG 5%', ratePct: 5, amountMinor: 9050 },
      tax: [{ label: 'GST 5%', ratePct: 5, amountMinor: 9050 }],
      tipMinor: null,
      totalMinor: 199100,
      currency: 'INR',
    };
    expect(BillParseResultSchema.parse(bill).items).toHaveLength(7);
    expect(BillParseResultSchema.safeParse({ ...bill, currency: 'USD' }).success).toBe(false);
    expect(BillParseResultSchema.safeParse({ ...bill, merchant: undefined }).success).toBe(false); // nullable, not optional
  });

  it('ExpenseParseResult: voice entry (page 11)', () => {
    const r = ExpenseParseResultSchema.parse({
      amountMinor: 30000,
      merchant: 'Auto-rickshaw',
      category: 'Transport',
      date: '2026-10-13',
      with: ['Neel'],
      paidBy: 'me',
      paidVia: 'cash',
      split: { type: 'equal' },
      note: 'Station → flat',
      spaceHint: null,
    });
    expect(r.split.type).toBe('equal');
    expect(ExpenseParseResultSchema.safeParse({ ...r, amountMinor: 0 }).success).toBe(false);
    expect(ExpenseParseResultSchema.safeParse({ ...r, split: { type: 'ratio', ratio: { me: 1, Neel: 1 } } }).success).toBe(true);
  });

  it('BillFlag', () => {
    expect(
      BillFlagSchema.parse({
        type: 'possible_duplicate_line',
        reason: '"1 Fresh Lime Soda 90" is printed right after "3 Fresh Lime Soda".',
        lineIndex: 6,
        amountMinor: 9000,
        resolution: null,
      }).type,
    ).toBe('possible_duplicate_line');
    expect(BillFlagSchema.safeParse({ type: 'service_charge', reason: '', lineIndex: null, amountMinor: null, resolution: null }).success).toBe(false);
  });

  it('ParsedTxn schema accepts parser output', () => {
    const p = parsePaymentText('Rs.500.00 debited from A/c XX1234 on 13-10-26 to VPA brewstreet@ybl UPI Ref 123456789012');
    expect(ParsedTxnSchema.safeParse(p).success).toBe(true);
  });
});
