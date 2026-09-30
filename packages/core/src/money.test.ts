import { describe, expect, it } from 'vitest';
import {
  allocate,
  allocateEqual,
  assertPaise,
  floorToRupees,
  formatINR,
  groupIndian,
  paiseToRupeeString,
  paiseToRupees,
  rupeesToPaise,
  sumPaise,
} from './money.ts';
import { int, rng } from './test/rng.ts';

describe('rupeesToPaise', () => {
  it.each([
    [240, 24000],
    [1240.5, 124050],
    ['1,240', 124000],
    ['₹1,20,000.50', 12000050],
    ['Rs. 499', 49900],
    ['Rs.500.00', 50000],
    ['INR 1,499.00', 149900],
    ['-150', -15000],
    ['-₹150.00', -15000],
    ['0.1', 10],
    ['.5', 50],
    ['1499.00/-', 149900],
    [0.1 + 0.2, 30],
    [1.005, 101],
    ['1.005', 101],
    ['1.004', 100],
    ['-1.005', -101],
    [0, 0],
    [-0, 0],
  ])('%s -> %i', (input, expected) => {
    expect(rupeesToPaise(input)).toBe(expected);
  });

  it.each(['', 'abc', '12.3.4', '₹', NaN, Infinity])('rejects %s', (bad) => {
    expect(() => rupeesToPaise(bad as string | number)).toThrow(RangeError);
  });

  it('round-trips random paise', () => {
    const r = rng(1);
    for (let i = 0; i < 500; i++) {
      const p = int(r, -1e10, 1e10);
      expect(rupeesToPaise(paiseToRupeeString(p))).toBe(p);
      expect(rupeesToPaise(formatINR(p))).toBe(p);
    }
  });
});

describe('formatting', () => {
  it('groups the Indian way', () => {
    expect(groupIndian('1')).toBe('1');
    expect(groupIndian('999')).toBe('999');
    expect(groupIndian('1000')).toBe('1,000');
    expect(groupIndian('120000')).toBe('1,20,000');
    expect(groupIndian('1234567')).toBe('12,34,567');
    expect(groupIndian('123456789')).toBe('12,34,56,789');
  });

  it('formats INR', () => {
    expect(formatINR(12000000)).toBe('₹1,20,000.00');
    expect(formatINR(123456789)).toBe('₹12,34,567.89');
    expect(formatINR(199200, { decimals: 0 })).toBe('₹1,992');
    expect(formatINR(69951)).toBe('₹699.51');
    expect(formatINR(5, {})).toBe('₹0.05');
    expect(formatINR(-15000)).toBe('-₹150.00');
    expect(formatINR(420000, { signed: true, decimals: 0 })).toBe('+₹4,200');
    expect(formatINR(124000, { decimals: 'auto' })).toBe('₹1,240');
    expect(formatINR(128333, { decimals: 'auto' })).toBe('₹1,283.33');
    expect(formatINR(124000, { symbol: false })).toBe('1,240.00');
    expect(formatINR(124000, { symbol: 'Rs ' })).toBe('Rs 1,240.00');
    expect(formatINR(28350, { decimals: 0 })).toBe('₹284'); // half away from zero
    expect(formatINR(-49, { decimals: 0 })).toBe('₹0');
    expect(formatINR(0)).toBe('₹0.00');
  });

  it('converts for display', () => {
    expect(paiseToRupees(69951)).toBe(699.51);
    expect(paiseToRupeeString(124000)).toBe('1240.00');
    expect(paiseToRupeeString(-5)).toBe('-0.05');
    expect(floorToRupees(116622)).toBe(1166);
    expect(floorToRupees(-1)).toBe(-1);
  });

  it('asserts paise', () => {
    expect(() => assertPaise(1.5)).toThrow();
    expect(() => assertPaise(2 ** 53)).toThrow();
    expect(() => assertPaise(10)).not.toThrow();
    expect(sumPaise([1, 2, 3])).toBe(6);
  });
});

describe('allocate (largest remainder)', () => {
  it('distributes remainders deterministically by order', () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(200, [1, 1, 1])).toEqual([67, 67, 66]);
    expect(allocate(32000, [1, 1, 1])).toEqual([10667, 10667, 10666]);
    expect(allocate(-100, [1, 1, 1])).toEqual([-34, -33, -33]);
    expect(allocate(1000, [60, 40])).toEqual([600, 400]);
    expect(allocate(1, [1, 1, 1])).toEqual([1, 0, 0]);
    expect(allocate(10, [0, 1, 0])).toEqual([0, 10, 0]);
    expect(allocate(100, [33.33, 33.33, 33.34])).toEqual([33, 33, 34]);
    expect(allocate(0, [1, 2])).toEqual([0, 0]);
    expect(allocateEqual(100, 3)).toEqual([34, 33, 33]);
  });

  it('prefers larger remainders over order', () => {
    // exact: 14.2857, 28.5714, 57.1428 -> floors 14,28,57 = 99, largest frac is .5714
    expect(allocate(100, [1, 2, 4])).toEqual([14, 29, 57]);
  });

  it('rejects bad weights', () => {
    expect(() => allocate(100, [])).toThrow();
    expect(() => allocate(100, [0, 0])).toThrow();
    expect(() => allocate(100, [-1, 2])).toThrow();
    expect(() => allocate(100, [NaN])).toThrow();
    expect(() => allocate(1.5, [1])).toThrow();
  });

  it('property: sums exactly, each part is floor/ceil of exact share', () => {
    const r = rng(42);
    for (let i = 0; i < 2000; i++) {
      const n = int(r, 1, 12);
      const total = int(r, -5_000_000, 50_000_000);
      const weights = Array.from({ length: n }, () => (r() < 0.2 ? 0 : r() < 0.5 ? int(r, 1, 100) : Math.round(r() * 10000) / 100));
      if (!weights.some((w) => w !== 0)) weights[0] = 1;
      const parts = allocate(total, weights);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      const wSum = weights.reduce((a, b) => a + b, 0);
      parts.forEach((p, j) => {
        expect(Number.isSafeInteger(p)).toBe(true);
        const exact = (total * (weights[j] as number)) / wSum;
        expect(Math.abs(p - exact)).toBeLessThan(1 + 1e-6);
        if (weights[j] === 0) expect(p).toBe(0);
      });
    }
  });
});
