export interface HistoryLike {
  id: string;
  payee: string | null;
  vpa: string | null;
  amount_minor: number;
  occurred_at: string;
}

const norm = (s: string | null) => (s ?? '').toLowerCase().replace(/[^a-z0-9@]/g, '');

/**
 * "Looks recurring": same counterparty and same amount in at least 2 earlier, different months.
 * Returns e.g. "same amount 3 months running" or null.
 */
export function detectRecurringHint(
  txn: HistoryLike,
  history: readonly HistoryLike[],
): string | null {
  const who = norm(txn.vpa) || norm(txn.payee);
  if (!who) return null;
  const month = (iso: string) => iso.slice(0, 7);
  const months = new Set<string>();
  for (const h of history) {
    if (h.id === txn.id || h.amount_minor !== txn.amount_minor) continue;
    if ((norm(h.vpa) || norm(h.payee)) !== who) continue;
    if (month(h.occurred_at) === month(txn.occurred_at)) continue;
    months.add(month(h.occurred_at));
  }
  return months.size >= 2 ? `same amount ${months.size + 1} months running` : null;
}
