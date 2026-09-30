import { describe, expect, it } from 'vitest';
import { budgetPace, budgetStatusFor, forecastMonthEnd, medianMinor } from './budget.ts';

describe('budgetPace (design page 22, October day 14 of 31)', () => {
  it('overall: ₹15,144 of ₹27,500 -> 55% used, ₹12,356 left for 18 days', () => {
    const r = budgetPace({ spentMinor: 1514400, limitMinor: 2750000, dayOfPeriod: 14, daysInPeriod: 31 });
    expect(Math.floor(r.usedFraction * 100)).toBe(55);
    expect(r.leftMinor).toBe(1235600);
    expect(r.daysLeft).toBe(18);
    expect(r.status).toBe('heading_over');
  });

  it('food: ₹6,240 of ₹8,000 -> ₹446/day vs ₹258 planned, heading over', () => {
    const r = budgetPace({ spentMinor: 624000, limitMinor: 800000, dayOfPeriod: 14, daysInPeriod: 31 });
    expect(Math.round(r.pacePerDayMinor / 100)).toBe(446);
    expect(Math.floor(r.plannedPerDayMinor / 100)).toBe(258);
    expect(r.status).toBe('heading_over');
    // straight-line projection; the design's ₹13,400 comes from the forecast model, not linear pace
    expect(r.projectedMinor).toBe(1381714);
    expect(r.overByMinor).toBe(1381714 - 800000);
  });

  it('design category statuses', () => {
    const pace = (spent: number, limit: number) => budgetPace({ spentMinor: spent * 100, limitMinor: limit * 100, dayOfPeriod: 14, daysInPeriod: 31 }).status;
    expect(pace(1380, 3000)).toBe('on_track'); // Transport (linear 3,056 is within 5%)
    expect(pace(2077, 5000)).toBe('on_track'); // Shopping
    expect(pace(727, 3000)).toBe('on_track'); // Subscriptions
    expect(pace(2900, 6000)).toBe('heading_over'); // Groceries
    expect(pace(1820, 2500)).toBe('heading_over'); // Entertainment
  });

  it('accepts a model projection', () => {
    const r = budgetPace({ spentMinor: 624000, limitMinor: 800000, dayOfPeriod: 14, daysInPeriod: 31, projectedMinor: 1340000 });
    expect(r).toMatchObject({ status: 'heading_over', overByMinor: 540000, projectedMinor: 1340000 });
  });

  it('transport on track; over when already past the limit', () => {
    const t = budgetPace({ spentMinor: 138000, limitMinor: 300000, dayOfPeriod: 14, daysInPeriod: 31 });
    expect(t.status).toBe('on_track');
    expect(t.overByMinor).toBe(0);
    expect(t.leftMinor).toBe(162000); // "₹1,620 left"
    const o = budgetPace({ spentMinor: 900000, limitMinor: 800000, dayOfPeriod: 20, daysInPeriod: 31 });
    expect(o.status).toBe('over');
    expect(o.overByMinor).toBe(100000);
  });

  it('validates', () => {
    expect(() => budgetPace({ spentMinor: 1, limitMinor: 1, dayOfPeriod: 0, daysInPeriod: 31 })).toThrow();
    expect(() => budgetPace({ spentMinor: 1, limitMinor: 1, dayOfPeriod: 32, daysInPeriod: 31 })).toThrow();
    expect(budgetPace({ spentMinor: 0, limitMinor: 0, dayOfPeriod: 1, daysInPeriod: 7 }).usedFraction).toBe(0);
  });

  it('budgetStatusFor with a model projection (design: food projected ₹13,400 -> ₹5,400 over)', () => {
    expect(budgetStatusFor(624000, 1340000, 800000)).toEqual({ status: 'heading_over', overByMinor: 540000 });
    expect(budgetStatusFor(1514400, 3207500, 2750000)).toEqual({ status: 'heading_over', overByMinor: 457500 });
  });
});

describe('forecastMonthEnd', () => {
  it('median of trailing 90 days × days left + upcoming recurring', () => {
    const history = [...Array(30).fill(999999), ...Array(90).fill(0).map((_, i) => (i % 3 === 0 ? 150000 : 90000))];
    const r = forecastMonthEnd({ spentToDateMinor: 3410000, dailyHistoryMinor: history, daysLeft: 18, upcomingRecurringMinor: 1638800 });
    expect(r.medianDailyMinor).toBe(90000); // old 30 days ignored
    expect(r.projectedMinor).toBe(3410000 + 90000 * 18 + 1638800);
  });

  it('median helper', () => {
    expect(medianMinor([])).toBe(0);
    expect(medianMinor([5, 1, 3])).toBe(3);
    expect(medianMinor([1, 2])).toBe(2);
    expect(medianMinor([100, 200, 300, 400])).toBe(250);
  });
});
