import { describe, expect, it } from 'vitest';
import { detectRecurringHint } from './recurring.ts';

const t = (id: string, date: string, amt = 149900, vpa = 'fithub@ybl') => ({
  id,
  payee: 'FitHub Gym',
  vpa,
  amount_minor: amt,
  occurred_at: `${date}T09:00:00+05:30`,
});

describe('detectRecurringHint', () => {
  it('flags same payee and amount across 3 months', () => {
    const h = [t('1', '2026-08-29'), t('2', '2026-07-29')];
    expect(detectRecurringHint(t('3', '2026-09-29'), h)).toBe('same amount 3 months running');
  });
  it('ignores different amounts and same-month repeats', () => {
    const h = [t('1', '2026-09-01'), t('2', '2026-08-29', 100)];
    expect(detectRecurringHint(t('3', '2026-09-29'), h)).toBeNull();
  });
});
