import { describe, expect, it } from 'vitest';
import { addOneMonth, detectRecurring, monthlyEquivalentMinor, type RecurringTxnInput } from './detect.ts';

let seq = 0;
const tx = (merchantKey: string, occurredAt: string, amountMinor: number): RecurringTxnInput => ({ id: `t${++seq}`, merchantKey, amountMinor, occurredAt });

describe('detectRecurring (design pages 4, 23)', () => {
  const txns: RecurringTxnInput[] = [
    // Flix+ Premium: ₹499 until the August bill, then ₹649
    tx('flix-premium', '2026-05-27', 49900),
    tx('flix-premium', '2026-06-27', 49900),
    tx('flix-premium', '2026-07-27', 49900),
    tx('flix-premium', '2026-08-27', 64900),
    tx('flix-premium', '2026-09-27', 64900),
    // FitHub Gym: same amount 4 months running, on the 29th
    tx('fithub', '2026-06-29', 149900),
    tx('fithub', '2026-07-29', 149900),
    tx('fithub', '2026-08-29', 149900),
    tx('fithub', '2026-09-29', 149900),
    // Credit card bill: monthly but amount varies
    tx('card-bill', '2026-07-18', 620000),
    tx('card-bill', '2026-08-18', 910000),
    tx('card-bill', '2026-09-18', 845000),
    // Weekly vegetables, amounts within ±10%
    tx('veg-vendor', '2026-09-06', 40000),
    tx('veg-vendor', '2026-09-13', 42000),
    tx('veg-vendor', '2026-09-20', 38500),
    tx('veg-vendor', '2026-09-27', 41000),
    // Cafe: frequent but irregular -> not recurring
    tx('brew-street', '2026-09-01', 24000),
    tx('brew-street', '2026-09-03', 24000),
    tx('brew-street', '2026-09-17', 24000),
    tx('brew-street', '2026-10-14', 24000),
    // Only two payments -> not enough
    tx('cloudvault', '2026-09-08', 21000),
    tx('cloudvault', '2026-10-08', 21000),
  ];

  const found = detectRecurring(txns);
  const by = (k: string) => found.find((s) => s.merchantKey === k);

  it('finds monthly subscriptions and flags the price increase 499 -> 649 (+30%)', () => {
    const flix = by('flix-premium');
    expect(flix?.cadence).toBe('monthly');
    expect(flix?.amountPattern).toBe('price_change');
    expect(flix?.amountMinor).toBe(64900);
    expect(flix?.priceChange).toMatchObject({ fromMinor: 49900, toMinor: 64900, since: '2026-08-27' });
    expect(Math.round((flix?.priceChange?.pct ?? 0) * 100)).toBe(30);
    expect(flix?.nextDate).toBe('2026-10-27'); // "next 27 Oct"
    // "That's ₹1,800 more a year"
    expect(((flix?.priceChange?.toMinor ?? 0) - (flix?.priceChange?.fromMinor ?? 0)) * 12).toBe(180000);
  });

  it('FitHub: stable, 4 occurrences, next 29 Oct', () => {
    const gym = by('fithub');
    expect(gym).toMatchObject({ cadence: 'monthly', amountPattern: 'stable', occurrences: 4, nextDate: '2026-10-29', amountMinor: 149900 });
    expect(gym?.txnIds).toHaveLength(4);
  });

  it('weekly cadence', () => {
    expect(by('veg-vendor')).toMatchObject({ cadence: 'weekly', amountPattern: 'stable', nextDate: '2026-10-04', intervalDays: 7 });
    expect(monthlyEquivalentMinor({ cadence: 'weekly', amountMinor: 41000 })).toBe(177667);
  });

  it('excludes irregular, too-short and (by default) variable-amount series', () => {
    expect(by('brew-street')).toBeUndefined();
    expect(by('cloudvault')).toBeUndefined();
    expect(by('card-bill')).toBeUndefined();
    const withVar = detectRecurring(txns, { includeVariable: true });
    expect(withVar.find((s) => s.merchantKey === 'card-bill')?.amountPattern).toBe('variable');
  });

  it('keeps the recent regular tail and tolerates same-day duplicates', () => {
    const s = detectRecurring([
      tx('news', '2025-01-05', 19900),
      tx('news', '2026-07-28', 19900),
      tx('news', '2026-08-28', 19900),
      tx('news', '2026-08-28', 19900),
      tx('news', '2026-09-28', 19900),
    ]);
    expect(s).toHaveLength(1);
    expect(s[0]?.occurrences).toBe(3);
    expect(s[0]?.firstDate).toBe('2026-07-28');
  });

  it('handles month-end dates and uses local date from ISO datetimes', () => {
    expect(addOneMonth('2027-01-31')).toBe('2027-02-28');
    expect(addOneMonth('2026-12-15')).toBe('2027-01-15');
    const s = detectRecurring([
      tx('rent', '2026-07-01T09:00:00+05:30', 1600000),
      tx('rent', '2026-08-01T09:00:00+05:30', 1600000),
      tx('rent', '2026-09-01T09:00:00+05:30', 1600000),
    ]);
    expect(s[0]?.nextDate).toBe('2026-10-01');
  });
});
