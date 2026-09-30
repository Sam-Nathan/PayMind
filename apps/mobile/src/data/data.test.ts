import { describe, expect, it } from 'vitest';
import { daysLeftInMonth, dateRange, isoDateToDateTime, toIsoDate } from './dates.ts';
import { errorCodeOf, friendlyError, ValidationError } from './errors.ts';
import { toMinor } from './mappers.ts';
import { computeMyNet } from './netBalances.ts';
import {
  buildCreateExpensePayload,
  buildCreateSpaceArgs,
  computeShares,
  isIsoDate,
  parseAmountInput,
} from './payloads.ts';
import type { Balance } from './types.ts';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const SPACE = '44444444-4444-4444-8444-444444444444';

describe('error mapping', () => {
  it('extracts the code prefix', () => {
    expect(errorCodeOf({ message: 'shares_sum_mismatch: 100 vs 99' })).toBe('shares_sum_mismatch');
    expect(errorCodeOf({ message: 'Network request failed' })).toBeNull();
  });
  it('maps known codes to friendly copy', () => {
    expect(friendlyError({ message: 'payer_not_in_space: x', code: '22023' })).toMatch(/isn't in this space/);
    expect(friendlyError({ message: 'not_authenticated: nope', code: '42501' })).toMatch(/sign in/);
  });
  it('falls back on SQLSTATE, transport errors and unknowns', () => {
    expect(friendlyError({ message: 'weird', code: '42501' })).toMatch(/permission/);
    expect(friendlyError(new Error('Network request failed'))).toMatch(/connection/);
    expect(friendlyError({ message: 'Invalid login credentials' })).toBe('Wrong email or password.');
    expect(friendlyError(null)).toMatch(/Something went wrong/);
  });
  it('passes validation errors through', () => {
    expect(friendlyError(new ValidationError('Pick someone.'))).toBe('Pick someone.');
  });
});

describe('computeShares', () => {
  it('splits equally with paise remainders', () => {
    expect(computeShares(10000, { method: 'equal', memberIds: [A, B, C] })).toEqual({
      [A]: 3334,
      [B]: 3333,
      [C]: 3333,
    });
  });
  it('splits by ratio and shares', () => {
    expect(computeShares(10000, { method: 'ratio', weights: { [A]: 60, [B]: 40 } })).toEqual({ [A]: 6000, [B]: 4000 });
    expect(computeShares(9000, { method: 'shares', weights: { [A]: 2, [B]: 1 } })).toEqual({ [A]: 6000, [B]: 3000 });
  });
  it('requires fixed amounts to add up', () => {
    expect(computeShares(10000, { method: 'fixed', amounts: { [A]: 7000, [B]: 3000 } })).toEqual({ [A]: 7000, [B]: 3000 });
    expect(() => computeShares(10000, { method: 'fixed', amounts: { [A]: 7000, [B]: 2000 } })).toThrow(/still left/);
    expect(() => computeShares(10000, { method: 'fixed', amounts: { [A]: 8000, [B]: 3000 } })).toThrow(/over the total/);
  });
  it('rejects empty splits', () => {
    expect(() => computeShares(100, { method: 'equal', memberIds: [] })).toThrow(ValidationError);
    expect(() => computeShares(100, { method: 'ratio', weights: { [A]: 0 } })).toThrow(ValidationError);
  });
});

describe('buildCreateExpensePayload', () => {
  const base = {
    title: ' Tandoor House ',
    totalMinor: 199200,
    categoryId: null,
    paidVia: 'upi' as const,
    occurredAt: '2026-10-13T16:12:00.000Z',
  };

  it('builds a shared payload whose shares sum to the total', () => {
    const p = buildCreateExpensePayload({
      ...base,
      spaceId: SPACE,
      paidByMember: A,
      split: { method: 'equal', memberIds: [A, B, C] },
    });
    expect(p.space_id).toBe(SPACE);
    expect(p.title).toBe('Tandoor House');
    expect(p.paid_by_member).toBe(A);
    expect(p.status).toBe('confirmed');
    expect(p.source).toBe('manual');
    expect(p.shares?.reduce((a, s) => a + s.owed_minor, 0)).toBe(199200);
    expect(p.shares).toHaveLength(3);
  });

  it('builds a personal payload with no payer or shares', () => {
    const p = buildCreateExpensePayload({ ...base, spaceId: null, paidByMember: null, split: null, note: 'lunch' });
    expect(p.space_id).toBeNull();
    expect(p).not.toHaveProperty('paid_by_member');
    expect(p).not.toHaveProperty('shares');
    expect(p.note).toBe('lunch');
  });

  it('maps bank back to the DB enum value', () => {
    const p = buildCreateExpensePayload({ ...base, spaceId: null, paidByMember: null, split: null, paidVia: 'bank' });
    expect(p.paid_via).toBe('bank');
  });

  it('drops zero-owed members from shares', () => {
    const p = buildCreateExpensePayload({
      ...base,
      spaceId: SPACE,
      paidByMember: A,
      split: { method: 'fixed', amounts: { [A]: 199200, [B]: 0 } },
    });
    expect(p.shares).toEqual([{ member_id: A, owed_minor: 199200 }]);
  });

  it('validates', () => {
    expect(() => buildCreateExpensePayload({ ...base, title: ' ', spaceId: null, paidByMember: null, split: null })).toThrow(/merchant/);
    expect(() => buildCreateExpensePayload({ ...base, totalMinor: 0, spaceId: null, paidByMember: null, split: null })).toThrow(/greater than zero/);
    expect(() => buildCreateExpensePayload({ ...base, spaceId: SPACE, paidByMember: null, split: { method: 'equal', memberIds: [A] } })).toThrow(/who paid/);
    expect(() => buildCreateExpensePayload({ ...base, spaceId: SPACE, paidByMember: A, split: null })).toThrow(/split/);
  });
});

describe('buildCreateSpaceArgs', () => {
  it('omits empty optionals and maps members', () => {
    const args = buildCreateSpaceArgs({
      type: 'trip',
      name: ' Goa Trip ',
      startsOn: '2026-10-02',
      endsOn: '2026-10-06',
      budgetMinor: 7500000,
      members: [{ displayName: 'Rahul', upiVpa: 'rahul@ybl' }, { displayName: '  ' }, { displayName: 'Priya' }],
    });
    expect(args).toEqual({
      p_name: 'Goa Trip',
      p_type: 'trip',
      p_starts_on: '2026-10-02',
      p_ends_on: '2026-10-06',
      p_budget_minor: 7500000,
      p_members: [{ display_name: 'Rahul', upi_vpa: 'rahul@ybl' }, { display_name: 'Priya' }],
    });
  });
  it('rejects blank names and inverted dates', () => {
    expect(() => buildCreateSpaceArgs({ type: 'friends', name: ' ', members: [] })).toThrow(/name/);
    expect(() =>
      buildCreateSpaceArgs({ type: 'trip', name: 'X', startsOn: '2026-10-06', endsOn: '2026-10-02', members: [] }),
    ).toThrow(/end date/);
  });
});

describe('input parsing', () => {
  it('parses rupee amounts', () => {
    expect(parseAmountInput('1,240.50')).toBe(124050);
    expect(parseAmountInput('₹300')).toBe(30000);
    expect(parseAmountInput('')).toBeNull();
    expect(parseAmountInput('abc')).toBeNull();
    expect(parseAmountInput('0')).toBeNull();
  });
  it('validates ISO dates', () => {
    expect(isIsoDate('2026-10-14')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('14/10/2026')).toBe(false);
  });
  it('coerces numeric strings from numeric columns', () => {
    expect(toMinor('12345')).toBe(12345);
    expect(toMinor(null)).toBe(0);
  });
});

describe('dates', () => {
  it('counts days left including today', () => {
    expect(daysLeftInMonth(new Date(2026, 9, 14))).toBe(18);
  });
  it('formats ranges', () => {
    expect(dateRange('2026-10-02', '2026-10-06')).toBe('2–6 Oct');
    expect(dateRange('2026-10-28', '2026-11-02')).toBe('28 Oct – 2 Nov');
  });
  it('uses now for today and noon for other days', () => {
    const now = new Date(2026, 9, 14, 9, 30);
    expect(isoDateToDateTime(toIsoDate(now), now)).toBe(now.toISOString());
    expect(new Date(isoDateToDateTime('2026-10-13', now)).getHours()).toBe(12);
  });
});

function bal(spaceId: string, memberId: string, userId: string | null, name: string, net: number): Balance {
  return { spaceId, memberId, userId, displayName: name, leftAt: null, paidMinor: 0, owedMinor: 0, settledOutMinor: 0, settledInMinor: 0, netMinor: net };
}

describe('computeMyNet', () => {
  it('totals across spaces and lists people', () => {
    const rows = [
      // Goa: me +4200, Rahul -1850, Arjun -2350
      bal('goa', 'm1', 'me', 'You', 420000),
      bal('goa', 'm2', null, 'Rahul', -185000),
      bal('goa', 'm3', null, 'Arjun', -235000),
      // Flat: me -1240, Karthik +1240
      bal('flat', 'f1', 'me', 'You', -124000),
      bal('flat', 'f2', null, 'Karthik', 124000),
    ];
    const net = computeMyNet(rows, 'me');
    expect(net.owedToYouMinor).toBe(420000);
    expect(net.youOweMinor).toBe(124000);
    expect(net.spacesOwedCount).toBe(1);
    expect(net.owedBy.map((p) => [p.name, p.amountMinor])).toEqual([
      ['Arjun', 235000],
      ['Rahul', 185000],
    ]);
    expect(net.owes).toEqual([{ key: 'name:karthik', name: 'Karthik', amountMinor: 124000, spaceIds: ['flat'] }]);
    expect(net.perSpace).toEqual({ goa: 420000, flat: -124000 });
  });
  it('ignores spaces the user is not in and returns zeros when empty', () => {
    expect(computeMyNet([], 'me')).toMatchObject({ owedToYouMinor: 0, youOweMinor: 0, owedBy: [], owes: [] });
    expect(computeMyNet([bal('x', 'a', 'u2', 'Other', 100)], 'me').owedToYouMinor).toBe(0);
  });
});
