import { describe, expect, it } from 'vitest';
import { addMonths, formatYearMonth, goalEta, goalOnTrack, monthsBetween, parseYearMonth, requiredMonthly, splitContribution } from './goals.ts';

const oct2026 = { year: 2026, month: 10 };
const kashmir = { targetMinor: 12000000, savedMinor: 4600000, monthlyContributionMinor: 1480000, from: oct2026 };

describe('goals (design pages 3, 18, 24)', () => {
  it('Kashmir: ₹74,000 to go at ₹14,800/month -> finish Mar 2027', () => {
    const r = goalEta(kashmir);
    expect(r.remainingMinor).toBe(7400000);
    expect(r.monthsNeeded).toBe(5);
    expect(r.finish).toEqual({ year: 2027, month: 3 });
    expect(Math.round(r.progress * 100)).toBe(38);
    expect(goalOnTrack({ ...kashmir, target: { year: 2027, month: 3 } })).toBe(true);
  });

  it('needed for Mar 2027 is ₹14,800/mo', () => {
    expect(requiredMonthly({ targetMinor: 12000000, savedMinor: 4600000, from: oct2026, target: { year: 2027, month: 3 } })).toBe(1480000);
    expect(requiredMonthly({ targetMinor: 100, savedMinor: 0, from: oct2026, target: { year: 2026, month: 12 }, roundToMinor: 100 })).toBe(100);
    expect(requiredMonthly({ targetMinor: 100, savedMinor: 0, from: oct2026, target: oct2026 })).toBeNull();
    expect(requiredMonthly({ targetMinor: 100, savedMinor: 200, from: oct2026, target: oct2026 })).toBe(0);
  });

  it('skipping this month moves the goal from March to April 2027 (page 14)', () => {
    // one month with no contribution = start one month later
    const r = goalEta({ ...kashmir, from: addMonths(oct2026, 1) });
    expect(r.finish).toEqual({ year: 2027, month: 4 });
    expect(goalOnTrack({ ...kashmir, from: addMonths(oct2026, 1), target: { year: 2027, month: 3 } })).toBe(false);
  });

  it('60/40 contribution split', () => {
    expect(splitContribution(1480000, { you: 60, ananya: 40 })).toEqual({ you: 888000, ananya: 592000 });
    expect(splitContribution(500000, { you: 60, ananya: 40 })).toEqual({ you: 300000, ananya: 200000 }); // timeline: ₹5,000 deposit, 60% yours
    expect(splitContribution(101, { you: 60, ananya: 40 })).toEqual({ you: 61, ananya: 40 });
  });

  it('edge cases', () => {
    expect(goalEta({ ...kashmir, monthlyContributionMinor: 0 }).finish).toBeNull();
    expect(goalEta({ ...kashmir, savedMinor: 12000000 }).monthsNeeded).toBe(0);
    expect(goalEta({ ...kashmir, monthlyContributionMinor: 1480001 }).monthsNeeded).toBe(5);
    expect(goalEta({ ...kashmir, monthlyContributionMinor: 1479999 }).monthsNeeded).toBe(6);
  });

  it('month helpers', () => {
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(monthsBetween(oct2026, { year: 2027, month: 3 })).toBe(5);
    expect(formatYearMonth({ year: 2027, month: 3 })).toBe('2027-03');
    expect(parseYearMonth('2027-03-15')).toEqual({ year: 2027, month: 3 });
    expect(() => parseYearMonth('2027-13')).toThrow();
  });
});
