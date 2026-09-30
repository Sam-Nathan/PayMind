import { describe, expect, it } from 'vitest';
import {
  SETTLEMENT_STATUSES,
  canTransition,
  countsTowardBalance,
  isSettlementStatus,
  isTerminalStatus,
  nextStatuses,
  transition,
  InvalidTransitionError,
  type SettlementStatus,
} from './state.ts';

const expected: Record<SettlementStatus, SettlementStatus[]> = {
  initiated: ['pending', 'completed', 'failed', 'cancelled', 'confirmed_manual'],
  pending: ['completed', 'failed', 'cancelled', 'confirmed_manual'],
  failed: ['initiated', 'completed', 'confirmed_manual', 'cancelled'],
  completed: ['corrected', 'cancelled'],
  confirmed_manual: ['corrected', 'cancelled'],
  corrected: ['cancelled'],
  cancelled: [],
};

describe('settlement state machine', () => {
  it('has exactly the agreed transitions (full 7x7 matrix)', () => {
    for (const from of SETTLEMENT_STATUSES) {
      expect([...nextStatuses(from)].sort()).toEqual([...expected[from]].sort());
      for (const to of SETTLEMENT_STATUSES) {
        expect(canTransition(from, to)).toBe(expected[from].includes(to));
      }
    }
  });

  it('no self transitions; terminal states', () => {
    for (const s of SETTLEMENT_STATUSES) expect(canTransition(s, s)).toBe(false);
    expect(isTerminalStatus('corrected')).toBe(false);
    expect(isTerminalStatus('cancelled')).toBe(true);
    expect(isTerminalStatus('pending')).toBe(false);
  });

  it('design flow: initiated -> pending ("not confirmed yet") -> completed ("yes, it went through")', () => {
    let s: SettlementStatus = 'initiated';
    s = transition(s, 'pending');
    s = transition(s, 'completed');
    expect(s).toBe('completed');
    expect(() => transition('cancelled', 'completed')).toThrow(InvalidTransitionError);
    expect(() => transition('pending', 'initiated')).toThrow(/pending to initiated/);
  });

  it('matches the DB trigger: a UPI "failure" can still complete later', () => {
    expect(transition('failed', 'completed')).toBe('completed');
    expect(canTransition('failed', 'confirmed_manual')).toBe(true);
    expect(canTransition('corrected', 'cancelled')).toBe(true);
    expect(canTransition('corrected', 'completed')).toBe(false);
  });

  it('guards', () => {
    expect(isSettlementStatus('pending')).toBe(true);
    expect(isSettlementStatus('done')).toBe(false);
    expect(canTransition('nope' as SettlementStatus, 'pending')).toBe(false);
    expect(countsTowardBalance('completed')).toBe(true);
    expect(countsTowardBalance('pending')).toBe(false);
  });
});
