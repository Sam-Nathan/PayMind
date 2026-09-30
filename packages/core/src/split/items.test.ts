import { describe, expect, it } from 'vitest';
import { splitItems, SplitError, type SplitItem, type ItemAssignment } from './items.ts';
import { rupeesToPaise } from '../money.ts';
import { int, pick, rng } from '../test/rng.ts';

const members = ['you', 'rahul', 'priya'];
const all3: ItemAssignment = { type: 'equal', members };

/** Design page 5-6: Tandoor House after removing the repeat soda and adding a ₹100 tip. */
const tandoorItems: SplitItem[] = [
  { id: 'paneer', name: 'Paneer Tikka', amountMinor: 32000, kind: 'item', assignment: all3 },
  { id: 'butter-chicken', name: 'Butter Chicken', amountMinor: 42000, kind: 'item', assignment: { type: 'equal', members: ['rahul'] } },
  { id: 'dal', name: 'Dal Makhani', amountMinor: 28000, kind: 'item', assignment: { type: 'equal', members: ['priya'] } },
  { id: 'naan', name: 'Butter Naan', amountMinor: 24000, kind: 'item', assignment: { type: 'units', units: { you: 2, rahul: 1, priya: 1 } } },
  { id: 'biryani', name: 'Veg Biryani', amountMinor: 34000, kind: 'item', assignment: { type: 'equal', members: ['you'] } },
  { id: 'soda', name: 'Fresh Lime Soda', amountMinor: 27000, kind: 'item', assignment: all3 },
];

describe('splitItems — design example (Tandoor House, ₹1,992.00)', () => {
  // Extras net +₹122.00: coupon −150, service 5% 86, GST 5% 86, tip 100
  // (service/GST recomputed on 1,870 − 150 = 1,720 once the repeat soda is removed).
  const extras: SplitItem[] = [
    { id: 'coupon', name: 'Coupon', amountMinor: 15000, kind: 'discount' },
    { id: 'svc', name: 'Service charge 5%', amountMinor: 8600, kind: 'service' },
    { id: 'gst', name: 'GST 5%', amountMinor: 8600, kind: 'tax' },
    { id: 'tip', name: 'Tip', amountMinor: 10000, kind: 'tip' },
  ];
  const res = splitItems({ members, items: [...tandoorItems, ...extras], extrasSpread: 'proportional' });

  it('matches the design totals exactly', () => {
    expect(res.totalMinor).toBe(rupeesToPaise('1,992.00'));
    expect(res.itemsTotalMinor).toBe(187000);
    expect(res.extrasTotalMinor).toBe(12200);
    expect(res.byMember['you']?.totalMinor).toBe(69951);
    expect(res.byMember['rahul']?.totalMinor).toBe(72081);
    expect(res.byMember['priya']?.totalMinor).toBe(57168);
    // "Approve & request 1,292.49"
    expect((res.byMember['rahul']?.totalMinor ?? 0) + (res.byMember['priya']?.totalMinor ?? 0)).toBe(129249);
  });

  it('matches the design extras exactly', () => {
    expect(res.byMember['you']?.extrasMinor).toBe(4284);
    expect(res.byMember['rahul']?.extrasMinor).toBe(4415);
    expect(res.byMember['priya']?.extrasMinor).toBe(3501);
  });

  it('items are within 1 paisa of the design (design shows 656.67 / 676.67 / 536.67, which sum to 1,870.01)', () => {
    expect(res.byMember['you']?.itemsMinor).toBe(65667);
    expect(res.byMember['rahul']?.itemsMinor).toBe(67666);
    expect(res.byMember['priya']?.itemsMinor).toBe(53667);
    const items = res.members.reduce((a, m) => a + m.itemsMinor, 0);
    expect(items).toBe(187000);
  });

  it('each row is items + extras and every column sums exactly', () => {
    for (const m of res.members) expect(m.itemsMinor + m.extrasMinor).toBe(m.totalMinor);
    expect(res.members.reduce((a, m) => a + m.totalMinor, 0)).toBe(199200);
    expect(res.members.reduce((a, m) => a + m.extrasMinor, 0)).toBe(12200);
    expect(res.members.map((m) => m.memberId)).toEqual(members);
  });

  it('line shares show the per-item labels (₹106.67 each, ₹60 per naan, ₹90 each)', () => {
    const line = (id: string) => res.lines.find((l) => l.itemId === id)?.shares;
    expect(line('paneer')).toEqual({ you: 10667, rahul: 10667, priya: 10666 });
    expect(line('naan')).toEqual({ you: 12000, rahul: 6000, priya: 6000 });
    expect(line('soda')).toEqual({ you: 9000, rahul: 9000, priya: 9000 });
    expect(line('coupon')?.['you']).toBeLessThan(0);
    for (const l of res.lines) {
      expect(Object.values(l.shares).reduce((a, b) => a + b, 0)).toBe(l.amountMinor);
    }
    expect(res.lines.map((l) => l.itemId)).toEqual([...tandoorItems, ...extras].map((i) => i.id));
  });

  it('a single net extras line gives the same member totals', () => {
    const res2 = splitItems({
      members,
      items: [...tandoorItems, { id: 'x', name: 'Coupon, service, GST & tip', amountMinor: 12200, kind: 'service' }],
    });
    expect(res2.members.map((m) => m.totalMinor)).toEqual([69951, 72081, 57168]);
    expect(res2.members.map((m) => m.extrasMinor)).toEqual([4284, 4415, 3501]);
  });

  it('discount sign is normalised', () => {
    const a = splitItems({ members, items: [...tandoorItems, { id: 'd', name: 'd', amountMinor: 15000, kind: 'discount' }] });
    const b = splitItems({ members, items: [...tandoorItems, { id: 'd', name: 'd', amountMinor: -15000, kind: 'discount' }] });
    expect(a).toEqual(b);
    expect(a.totalMinor).toBe(172000);
  });
});

describe('splitItems — other modes', () => {
  it('equal extras spread', () => {
    const res = splitItems({
      members,
      items: [...tandoorItems, { id: 'tip', name: 'Tip', amountMinor: 10000, kind: 'tip' }],
      extrasSpread: 'equal',
    });
    expect(res.members.map((m) => m.extrasMinor)).toEqual([3334, 3333, 3333]);
  });

  it('per-extra spread override and explicit extra assignment', () => {
    const res = splitItems({
      members,
      items: [
        ...tandoorItems,
        { id: 'tip', name: 'Tip', amountMinor: 9000, kind: 'tip', spread: 'equal' },
        { id: 'svc', name: 'Svc', amountMinor: 5000, kind: 'service', assignment: { type: 'equal', members: ['you'] } },
      ],
    });
    expect(res.byMember['you']?.extrasMinor).toBe(3000 + 5000);
    expect(res.byMember['rahul']?.extrasMinor).toBe(3000);
  });

  it('percent and fixed assignments', () => {
    const res = splitItems({
      members: ['a', 'b'],
      items: [
        { id: '1', name: 'Pizza', amountMinor: 100000, kind: 'item', assignment: { type: 'percent', pct: { a: 60, b: 40 } } },
        { id: '2', name: 'Wine', amountMinor: 50000, kind: 'item', assignment: { type: 'fixed', amounts: { a: 20000, b: 30000 } } },
        { id: '3', name: 'GST', amountMinor: 7500, kind: 'tax' },
      ],
    });
    expect(res.byMember['a']?.itemsMinor).toBe(80000);
    expect(res.byMember['b']?.itemsMinor).toBe(70000);
    expect(res.byMember['a']?.extrasMinor).toBe(4000);
    expect(res.byMember['b']?.extrasMinor).toBe(3500);
  });

  it('members with no items pay no proportional extras; only-extras bills fall back to equal', () => {
    const r1 = splitItems({
      members: ['a', 'b', 'c'],
      items: [
        { id: '1', name: 'x', amountMinor: 1000, kind: 'item', assignment: { type: 'equal', members: ['a', 'b'] } },
        { id: 't', name: 'tax', amountMinor: 100, kind: 'tax' },
      ],
    });
    expect(r1.byMember['c']).toEqual({ memberId: 'c', itemsMinor: 0, extrasMinor: 0, totalMinor: 0 });
    const r2 = splitItems({ members: ['a', 'b', 'c'], items: [{ id: 't', name: 'tip', amountMinor: 100, kind: 'tip' }] });
    expect(r2.members.map((m) => m.totalMinor)).toEqual([34, 33, 33]);
  });

  it('validates input', () => {
    const base = { id: '1', name: 'x', amountMinor: 1000, kind: 'item' as const };
    expect(() => splitItems({ members: [], items: [] })).toThrow(SplitError);
    expect(() => splitItems({ members: ['a', 'a'], items: [] })).toThrow(SplitError);
    expect(() => splitItems({ members: ['a'], items: [base] })).toThrow(/no assignment/);
    expect(() => splitItems({ members: ['a'], items: [{ ...base, assignment: { type: 'equal', members: ['z'] } }] })).toThrow(/unknown member/);
    expect(() => splitItems({ members: ['a', 'b'], items: [{ ...base, assignment: { type: 'percent', pct: { a: 50, b: 49 } } }] })).toThrow(/100/);
    expect(() => splitItems({ members: ['a', 'b'], items: [{ ...base, assignment: { type: 'fixed', amounts: { a: 500, b: 499 } } }] })).toThrow(/expected 1000/);
    expect(() => splitItems({ members: ['a'], items: [{ ...base, assignment: { type: 'units', units: { a: 0 } } }] })).toThrow(/zero/);
    expect(() => splitItems({ members: ['a'], items: [{ ...base, amountMinor: 10.5, assignment: { type: 'equal', members: ['a'] } }] })).toThrow();
    expect(() => splitItems({ members: ['a'], items: [{ ...base, assignment: { type: 'equal', members: [] } }] })).toThrow();
  });
});

describe('splitItems — properties over random bills', () => {
  it('totals and extras sum exactly; rows are consistent; shares are near exact', () => {
    const r = rng(7);
    for (let iter = 0; iter < 400; iter++) {
      const n = int(r, 1, 8);
      const ms = Array.from({ length: n }, (_, i) => `m${i}`);
      const items: SplitItem[] = [];
      const nItems = int(r, 1, 10);
      for (let k = 0; k < nItems; k++) {
        const amount = int(r, 1, 500000);
        const subset = ms.filter(() => r() < 0.6);
        const who = subset.length ? subset : [pick(r, ms)];
        const mode = int(r, 0, 3);
        let assignment: ItemAssignment;
        if (mode === 0) assignment = { type: 'equal', members: who };
        else if (mode === 1) assignment = { type: 'units', units: Object.fromEntries(who.map((m) => [m, int(r, 1, 5)])) };
        else if (mode === 2) {
          // percentages that sum to exactly 100 (two decimals)
          const raw = who.map(() => int(r, 1, 100));
          const total = raw.reduce((a, b) => a + b, 0);
          const cents = raw.map((x) => Math.floor((x * 10000) / total));
          cents[0] = (cents[0] as number) + 10000 - cents.reduce((a, b) => a + b, 0);
          assignment = { type: 'percent', pct: Object.fromEntries(who.map((m, i) => [m, (cents[i] as number) / 100])) };
        } else {
          const parts = who.map(() => int(r, 0, 10));
          if (!parts.some((p) => p !== 0)) parts[0] = 1;
          const s = parts.reduce((a, b) => a + b, 0);
          const amts = parts.map((p) => Math.floor((amount * p) / s));
          amts[0] = (amts[0] as number) + amount - amts.reduce((a, b) => a + b, 0);
          assignment = { type: 'fixed', amounts: Object.fromEntries(who.map((m, i) => [m, amts[i] as number])) };
        }
        items.push({ id: `i${k}`, name: `Item ${k}`, amountMinor: amount, kind: 'item', assignment });
      }
      const extraKinds = ['discount', 'service', 'tax', 'tip'] as const;
      const nExtras = int(r, 0, 4);
      for (let k = 0; k < nExtras; k++) {
        items.push({ id: `e${k}`, name: `Extra ${k}`, amountMinor: int(r, 0, 50000), kind: pick(r, extraKinds), spread: r() < 0.5 ? 'equal' : 'proportional' });
      }
      const res = splitItems({ members: ms, items });
      const total = items.reduce((a, it) => a + (it.kind === 'discount' ? -Math.abs(it.amountMinor) : it.amountMinor), 0);
      expect(res.totalMinor).toBe(total);
      expect(res.members.reduce((a, m) => a + m.totalMinor, 0)).toBe(total);
      expect(res.members.reduce((a, m) => a + m.extrasMinor, 0)).toBe(res.extrasTotalMinor);
      expect(res.members.reduce((a, m) => a + m.itemsMinor, 0)).toBe(res.itemsTotalMinor);
      for (const m of res.members) {
        expect(Number.isSafeInteger(m.totalMinor)).toBe(true);
        expect(m.itemsMinor + m.extrasMinor).toBe(m.totalMinor);
        // a member's total is within (#lines) paise of the sum of their rounded line shares
        const lineSum = res.lines.reduce((a, l) => a + (l.shares[m.memberId] ?? 0), 0);
        expect(Math.abs(lineSum - m.totalMinor)).toBeLessThanOrEqual(res.lines.length);
      }
      for (const l of res.lines) expect(Object.values(l.shares).reduce((a, b) => a + b, 0)).toBe(l.amountMinor);
    }
  });

  it('is deterministic and independent of extras order', () => {
    const a = splitItems({ members, items: [...tandoorItems, { id: 't', name: 't', amountMinor: 999, kind: 'tip' }, { id: 'g', name: 'g', amountMinor: 777, kind: 'tax' }] });
    const b = splitItems({ members, items: [...tandoorItems, { id: 'g', name: 'g', amountMinor: 777, kind: 'tax' }, { id: 't', name: 't', amountMinor: 999, kind: 'tip' }] });
    expect(a.members).toEqual(b.members);
  });
});
