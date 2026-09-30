import { describe, expect, it } from 'vitest';
import {
  mergeBalances,
  netBalancesFromExpenses,
  netBalancesFromIous,
  simplifyDebts,
  simplifyIous,
  type Iou,
  type NetBalances,
  type Transfer,
} from './simplify.ts';
import { int, pick, rng } from '../test/rng.ts';

function applyTransfers(bal: NetBalances, ts: Transfer[]): NetBalances {
  const out = { ...bal };
  for (const t of ts) {
    out[t.from] = (out[t.from] ?? 0) + t.amountMinor;
    out[t.to] = (out[t.to] ?? 0) - t.amountMinor;
  }
  return out;
}

function checkInvariants(bal: NetBalances, ts: Transfer[]): void {
  // conservation: applying the transfers zeroes every balance
  for (const v of Object.values(applyTransfers(bal, ts))) expect(v).toBe(0);
  const nonZero = Object.values(bal).filter((v) => v !== 0).length;
  expect(ts.length).toBeLessThanOrEqual(Math.max(0, nonZero - 1));
  for (const t of ts) {
    expect(t.amountMinor).toBeGreaterThan(0);
    expect(Number.isSafeInteger(t.amountMinor)).toBe(true);
    // only debtors pay, only creditors receive
    expect(bal[t.from] as number).toBeLessThan(0);
    expect(bal[t.to] as number).toBeGreaterThan(0);
  }
  // nobody pays more than they owe overall
  for (const [m, v] of Object.entries(bal)) {
    const paid = ts.filter((t) => t.from === m).reduce((a, t) => a + t.amountMinor, 0);
    const got = ts.filter((t) => t.to === m).reduce((a, t) => a + t.amountMinor, 0);
    if (v < 0) expect(paid).toBe(-v);
    else expect(paid).toBe(0);
    if (v > 0) expect(got).toBe(v);
    else expect(got).toBe(0);
  }
}

describe('Goa trip (design pages 7, 16, 17)', () => {
  // Paid: You 17,880 · Priya 14,280 · Meera 13,030 · Rahul 11,830 · Arjun 11,380 = 68,400; fair share 13,680 each.
  const paid: Record<string, number> = { you: 1788000, priya: 1428000, meera: 1303000, rahul: 1183000, arjun: 1138000 };
  const people = Object.keys(paid);

  it('net balances from who paid what', () => {
    const expenses = people.map((p) => ({ paidBy: p, shares: Object.fromEntries(people.map((q) => [q, paid[p]! / 5])) }));
    const bal = netBalancesFromExpenses(expenses);
    expect(bal).toEqual({ you: 420000, priya: 60000, meera: -65000, rahul: -185000, arjun: -230000 });
  });

  // 11 IOUs between 5 people that net to the same balances.
  const ious: Iou[] = [
    { from: 'arjun', to: 'you', amountMinor: 150000 },
    { from: 'arjun', to: 'priya', amountMinor: 50000 },
    { from: 'arjun', to: 'meera', amountMinor: 30000 },
    { from: 'rahul', to: 'you', amountMinor: 120000 },
    { from: 'rahul', to: 'priya', amountMinor: 40000 },
    { from: 'rahul', to: 'meera', amountMinor: 10000 },
    { from: 'meera', to: 'you', amountMinor: 70000 },
    { from: 'meera', to: 'priya', amountMinor: 35000 },
    { from: 'priya', to: 'you', amountMinor: 65000 },
    { from: 'you', to: 'rahul', amountMinor: 5000 },
    { from: 'rahul', to: 'you', amountMinor: 20000 },
  ];

  it('11 IOUs -> 4 payments, exactly as in the design', () => {
    expect(ious).toHaveLength(11);
    const bal = netBalancesFromIous(ious);
    expect(bal).toEqual({ arjun: -230000, you: 420000, priya: 60000, meera: -65000, rahul: -185000 });
    const ts = simplifyIous(ious);
    expect(ts).toEqual([
      { from: 'arjun', to: 'you', amountMinor: 230000 },
      { from: 'rahul', to: 'you', amountMinor: 185000 },
      { from: 'meera', to: 'priya', amountMinor: 60000 },
      { from: 'meera', to: 'you', amountMinor: 5000 },
    ]);
    checkInvariants(bal, ts);
  });

  it('settlements reduce balances', () => {
    const expenses = [{ paidBy: 'you', shares: { you: 1000, rahul: 1000 } }];
    expect(netBalancesFromExpenses(expenses, [{ from: 'rahul', to: 'you', amountMinor: 400 }])).toEqual({ you: 600, rahul: -600 });
    expect(mergeBalances({ a: 5, b: -5 }, { b: 3, c: -3 })).toEqual({ a: 5, b: -2, c: -3 });
  });
});

describe('simplifyDebts', () => {
  it('handles trivial cases', () => {
    expect(simplifyDebts({})).toEqual([]);
    expect(simplifyDebts({ a: 0, b: 0 })).toEqual([]);
    expect(simplifyDebts({ a: 100, b: -100 })).toEqual([{ from: 'b', to: 'a', amountMinor: 100 }]);
    expect(() => simplifyDebts({ a: 100, b: -99 })).toThrow(/sum to zero/);
    expect(() => netBalancesFromIous([{ from: 'a', to: 'b', amountMinor: -1 }])).toThrow();
  });

  it('ties are broken by key order (deterministic)', () => {
    expect(simplifyDebts({ a: 100, b: 100, c: -100, d: -100 })).toEqual([
      { from: 'c', to: 'a', amountMinor: 100 },
      { from: 'd', to: 'b', amountMinor: 100 },
    ]);
  });

  it('property: 5-person trips with random IOUs', () => {
    const r = rng(2026);
    const people = ['you', 'rahul', 'priya', 'arjun', 'meera'];
    for (let i = 0; i < 1000; i++) {
      const ious: Iou[] = [];
      const k = int(r, 0, 30);
      for (let j = 0; j < k; j++) {
        const from = pick(r, people);
        let to = pick(r, people);
        if (to === from) to = people[(people.indexOf(from) + 1) % people.length] as string;
        ious.push({ from, to, amountMinor: int(r, 1, 1_000_000) });
      }
      const bal = netBalancesFromIous(ious);
      expect(Object.values(bal).reduce((a, b) => a + b, 0)).toBe(0);
      checkInvariants(bal, simplifyDebts(bal));
    }
  });

  it('property: larger random groups', () => {
    const r = rng(5);
    for (let i = 0; i < 300; i++) {
      const n = int(r, 2, 25);
      const bal: NetBalances = {};
      let s = 0;
      for (let j = 0; j < n - 1; j++) {
        const v = int(r, -500000, 500000);
        bal[`p${j}`] = v;
        s += v;
      }
      bal[`p${n - 1}`] = -s;
      checkInvariants(bal, simplifyDebts(bal));
    }
  });
});
