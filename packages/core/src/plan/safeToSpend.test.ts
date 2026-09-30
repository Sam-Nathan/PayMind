import { describe, expect, it } from 'vitest';
import { AFFORD_MIN_PER_DAY_MINOR, canAfford, perDayDisplayRupees, safeToSpend } from './safeToSpend.ts';
import { formatINR } from '../money.ts';

// Design pages 3, 14, 22: 52,380 − 16,388 − 10,000 − 5,000 = 20,992 over 18 days -> ₹1,166/day
const oct14 = { balanceMinor: 5238000, upcomingMinor: 1638800, goalSetAsideMinor: 1000000, bufferMinor: 500000, daysLeft: 18 };

describe('safeToSpend', () => {
  it('reproduces the design', () => {
    const r = safeToSpend(oct14);
    expect(r.freeMinor).toBe(2099200);
    expect(r.perDayMinor).toBe(116622);
    expect(perDayDisplayRupees(r.perDayMinor)).toBe(1166);
    expect(formatINR(r.freeMinor, { decimals: 0 })).toBe('₹20,992');
  });

  it('never shows a negative per-day amount', () => {
    const r = safeToSpend({ ...oct14, balanceMinor: 2000000 });
    expect(r.freeMinor).toBeLessThan(0);
    expect(r.perDayMinor).toBe(0);
    expect(perDayDisplayRupees(-5)).toBe(0);
  });

  it('validates', () => {
    expect(() => safeToSpend({ ...oct14, daysLeft: 0 })).toThrow();
    expect(() => safeToSpend({ ...oct14, balanceMinor: 1.5 })).toThrow();
  });
});

describe('canAfford (design page 14)', () => {
  it('₹20,000 phone: only ₹992 left for 18 days (₹55/day) -> not this month', () => {
    const r = canAfford({ ...oct14, purchaseMinor: 2000000 });
    expect(r.leftMinor).toBe(99200);
    expect(r.leftPerDayMinor).toBe(5511);
    expect(perDayDisplayRupees(r.leftPerDayMinor)).toBe(55);
    expect(r.verdict).toBe('no');
  });

  it('₹5k this week is fine, ₹12k trip is tight', () => {
    expect(canAfford({ ...oct14, purchaseMinor: 500000 }).verdict).toBe('yes');
    expect(canAfford({ ...oct14, purchaseMinor: 1200000 }).verdict).toBe('tight');
    expect(canAfford({ ...oct14, purchaseMinor: 3000000 }).verdict).toBe('no');
  });

  it('uses typical daily spend when known', () => {
    // left per day 88,844 paise vs typical ₹1,000/day -> 0.89 -> yes; vs ₹2,000/day -> 0.44 -> tight
    expect(canAfford({ ...oct14, purchaseMinor: 500000, typicalDailySpendMinor: 100000 }).verdict).toBe('yes');
    expect(canAfford({ ...oct14, purchaseMinor: 500000, typicalDailySpendMinor: 200000 }).verdict).toBe('tight');
    expect(canAfford({ ...oct14, purchaseMinor: 500000, typicalDailySpendMinor: 400000 }).verdict).toBe('no');
  });

  it('floor per day', () => {
    const left = AFFORD_MIN_PER_DAY_MINOR * 18 - 1;
    expect(canAfford({ ...oct14, purchaseMinor: 2099200 - left }).verdict).toBe('no');
    expect(() => canAfford({ ...oct14, purchaseMinor: -1 })).toThrow();
  });
});
