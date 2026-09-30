/**
 * Settlement status state machine (design pages 9 & 21). PayMind never moves money;
 * it only tracks what the user tells us happened in their UPI app.
 *
 * Keep in sync with the SQL implementation (Architect) — exactly these transitions.
 */

export const SETTLEMENT_STATUSES = [
  'initiated',
  'pending',
  'completed',
  'failed',
  'confirmed_manual',
  'corrected',
  'cancelled',
] as const;

export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

export const SETTLEMENT_TRANSITIONS: Readonly<Record<SettlementStatus, readonly SettlementStatus[]>> = {
  initiated: ['pending', 'completed', 'failed', 'cancelled', 'confirmed_manual'],
  pending: ['completed', 'failed', 'cancelled', 'confirmed_manual'],
  failed: ['initiated', 'cancelled'],
  completed: ['corrected', 'cancelled'],
  confirmed_manual: ['corrected', 'cancelled'],
  corrected: [],
  cancelled: [],
};

export function isSettlementStatus(value: unknown): value is SettlementStatus {
  return typeof value === 'string' && (SETTLEMENT_STATUSES as readonly string[]).includes(value);
}

export function canTransition(from: SettlementStatus, to: SettlementStatus): boolean {
  return SETTLEMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function nextStatuses(from: SettlementStatus): readonly SettlementStatus[] {
  return SETTLEMENT_TRANSITIONS[from] ?? [];
}

/** No further transitions possible. */
export function isTerminalStatus(status: SettlementStatus): boolean {
  return nextStatuses(status).length === 0;
}

/** Statuses where the money is considered to have moved (counts against balances). */
export const SETTLED_STATUSES: readonly SettlementStatus[] = ['completed', 'confirmed_manual', 'corrected'];

export function countsTowardBalance(status: SettlementStatus): boolean {
  return SETTLED_STATUSES.includes(status);
}

export class InvalidTransitionError extends Error {
  override name = 'InvalidTransitionError';
  readonly from: SettlementStatus;
  readonly to: SettlementStatus;
  constructor(from: SettlementStatus, to: SettlementStatus) {
    super(`Settlement cannot move from ${from} to ${to}`);
    this.from = from;
    this.to = to;
  }
}

/** Returns `to` if allowed, else throws InvalidTransitionError. */
export function transition(from: SettlementStatus, to: SettlementStatus): SettlementStatus {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
  return to;
}
