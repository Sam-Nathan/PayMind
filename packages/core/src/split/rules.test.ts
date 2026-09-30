import { describe, expect, it } from 'vitest';
import { applySplitRule, splitByUsage, splitEqual, splitFixed, splitRatio, splitWeights } from './rules.ts';
import { int, rng } from '../test/rng.ts';

const flat = ['you', 'karthik', 'neel'];
const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

describe('rule splits (design page 18-19)', () => {
  it('equal: internet ₹1,050 -> ₹350 each; music ₹180 -> ₹60 each; cleaning ₹3,000 -> ₹1,000', () => {
    expect(splitEqual(105000, flat)).toEqual({ you: 35000, karthik: 35000, neel: 35000 });
    expect(splitEqual(18000, flat)).toEqual({ you: 6000, karthik: 6000, neel: 6000 });
    expect(splitEqual(300000, flat)).toEqual({ you: 100000, karthik: 100000, neel: 100000 });
    expect(splitEqual(85000, ['you', 'rahul', 'priya'])).toEqual({ you: 28334, rahul: 28333, priya: 28333 }); // page 10: ₹283.33
    expect(splitEqual(30000, ['you', 'neel'])).toEqual({ you: 15000, neel: 15000 }); // page 11: half each
  });

  it('weights: rent ₹42,000 by room size -> 16,000 / 14,000 / 12,000', () => {
    expect(splitWeights(4200000, { you: 160, karthik: 140, neel: 120 })).toEqual({ you: 1600000, karthik: 1400000, neel: 1200000 });
    expect(applySplitRule(4200000, { method: 'by_room', weights: { you: 16000, karthik: 14000, neel: 12000 } })).toEqual({
      you: 1600000,
      karthik: 1400000,
      neel: 1200000,
    });
  });

  it('ratio: couple 60/40 of ₹18,400 -> 11,040 / 7,360', () => {
    expect(splitRatio(1840000, { you: 60, ananya: 40 })).toEqual({ you: 1104000, ananya: 736000 });
    expect(splitRatio(100, { a: 1, b: 1, c: 1 })).toEqual({ a: 34, b: 33, c: 33 });
  });

  it('fixed amounts must add up', () => {
    expect(splitFixed(1000, { a: 700, b: 300 })).toEqual({ a: 700, b: 300 });
    expect(() => splitFixed(1000, { a: 700, b: 200 })).toThrow(/expected 1000/);
  });

  it('by usage: electricity ₹3,720 -> You 1,040 · Karthik 1,480 · Neel 1,200 (AC sub-meter + common equal)', () => {
    const usage = { you: 24, karthik: 68, neel: 40 }; // AC kWh logged on the 1st
    const byRate = splitByUsage({ totalMinor: 372000, usage, common: { type: 'rate', ratePerUnitMinor: 1000 } });
    expect(byRate.shares).toEqual({ you: 104000, karthik: 148000, neel: 120000 });
    expect(byRate.commonMinor).toBe(240000);
    expect(byRate.commonShares).toEqual({ you: 80000, karthik: 80000, neel: 80000 });
    const byAmount = splitByUsage({ totalMinor: 372000, usage, common: { type: 'amount', amountMinor: 240000 } });
    expect(byAmount.shares).toEqual(byRate.shares);
    const byFraction = splitByUsage({ totalMinor: 372000, usage, common: { type: 'fraction', fraction: 240000 / 372000 } });
    expect(sum(byFraction.shares)).toBe(372000);
    expect(applySplitRule(372000, { method: 'by_usage', usage, common: { type: 'rate', ratePerUnitMinor: 1000 } })).toEqual(byRate.shares);
    expect(splitByUsage({ totalMinor: 1000, usage: { a: 1, b: 3 } }).shares).toEqual({ a: 250, b: 750 });
  });

  it('by usage validation', () => {
    expect(() => splitByUsage({ totalMinor: 1000, usage: { a: 50, b: 60 }, common: { type: 'rate', ratePerUnitMinor: 10 } })).toThrow(/more than/);
    expect(() => splitByUsage({ totalMinor: 1000, usage: { a: 0, b: 0 } })).toThrow();
    expect(() => splitByUsage({ totalMinor: 1000, usage: { a: 1 }, common: { type: 'amount', amountMinor: 2000 } })).toThrow();
    expect(splitByUsage({ totalMinor: 1000, usage: { a: 0, b: 0 }, common: { type: 'amount', amountMinor: 1000 } }).shares).toEqual({ a: 500, b: 500 });
  });

  it('property: every rule sums exactly to the total', () => {
    const r = rng(99);
    for (let i = 0; i < 1000; i++) {
      const n = int(r, 1, 7);
      const ms = Array.from({ length: n }, (_, k) => `m${k}`);
      const total = int(r, 0, 20_000_000);
      const weights = Object.fromEntries(ms.map((m) => [m, int(r, 1, 1000)]));
      expect(sum(splitEqual(total, ms))).toBe(total);
      expect(sum(splitWeights(total, weights))).toBe(total);
      const common = int(r, 0, total);
      const res = splitByUsage({ totalMinor: total, usage: weights, common: { type: 'amount', amountMinor: common } });
      expect(sum(res.shares)).toBe(total);
      expect(sum(res.commonShares)).toBe(common);
      const rate = splitByUsage({ totalMinor: total + 10_000_000, usage: weights, common: { type: 'rate', ratePerUnitMinor: int(r, 0, 1000) } });
      expect(sum(rate.shares)).toBe(total + 10_000_000);
    }
  });
});
