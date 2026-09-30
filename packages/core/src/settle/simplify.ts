/**
 * Debt simplification (design page 7): compute net balances first (who is up,
 * who is down), then repeatedly match the largest debtor to the largest creditor.
 * Nobody pays more than they owe overall, nobody both pays and receives, and the
 * number of transfers is at most (people with a non-zero balance) - 1.
 */
import { assertPaise, type Paise } from '../money.ts';
import type { MemberId } from '../split/items.ts';

/** `from` owes `to` this amount. */
export interface Iou {
  from: MemberId;
  to: MemberId;
  amountMinor: Paise;
}

export type Transfer = Iou;

/** Net balance per member: positive = others owe them (creditor), negative = they owe. */
export type NetBalances = Record<MemberId, Paise>;

function bump(bal: NetBalances, order: MemberId[], m: MemberId, delta: Paise): void {
  if (!(m in bal)) {
    bal[m] = 0;
    order.push(m);
  }
  const v = (bal[m] as number) + delta;
  assertPaise(v, `balance of ${m}`);
  bal[m] = v;
}

/** Net balances from a list of IOUs. Key order = first appearance. */
export function netBalancesFromIous(ious: readonly Iou[]): NetBalances {
  const bal: NetBalances = {};
  const order: MemberId[] = [];
  for (const iou of ious) {
    assertPaise(iou.amountMinor, 'IOU amount');
    if (iou.amountMinor < 0) throw new RangeError('IOU amounts must be >= 0');
    bump(bal, order, iou.from, -iou.amountMinor);
    bump(bal, order, iou.to, iou.amountMinor);
  }
  return bal;
}

export interface SharedExpense {
  /** Member who paid the bill. */
  paidBy: MemberId;
  /** What each member owes for it (expense_shares.owed_minor); includes the payer's own share. */
  shares: Record<MemberId, Paise>;
}

export interface SettlementLike {
  from: MemberId;
  to: MemberId;
  amountMinor: Paise;
}

/**
 * Net balances from shared expenses and completed settlements
 * (mirrors the `balances` view: expense_shares − settlements).
 * A payer is credited with everyone else's shares; a settlement from A to B moves A up and B down.
 */
export function netBalancesFromExpenses(
  expenses: readonly SharedExpense[],
  settlements: readonly SettlementLike[] = [],
): NetBalances {
  const bal: NetBalances = {};
  const order: MemberId[] = [];
  for (const e of expenses) {
    let paidTotal = 0;
    for (const [m, owed] of Object.entries(e.shares)) {
      assertPaise(owed, `share of ${m}`);
      bump(bal, order, m, -owed);
      paidTotal += owed;
    }
    bump(bal, order, e.paidBy, paidTotal);
  }
  for (const s of settlements) {
    assertPaise(s.amountMinor, 'settlement amount');
    bump(bal, order, s.from, s.amountMinor);
    bump(bal, order, s.to, -s.amountMinor);
  }
  return bal;
}

/** Merge several balance maps (e.g. across spaces). */
export function mergeBalances(...maps: NetBalances[]): NetBalances {
  const out: NetBalances = {};
  const order: MemberId[] = [];
  for (const m of maps) for (const [k, v] of Object.entries(m)) bump(out, order, k, v);
  return out;
}

/**
 * Greedy simplification: largest debtor pays largest creditor, repeat.
 * Ties are broken by the balances' key order (stable). Balances must sum to zero.
 */
export function simplifyDebts(balances: NetBalances): Transfer[] {
  const entries = Object.entries(balances);
  let total = 0;
  for (const [m, v] of entries) {
    assertPaise(v, `balance of ${m}`);
    total += v;
  }
  if (total !== 0) throw new RangeError(`Balances must sum to zero (got ${total})`);

  const rank = new Map(entries.map(([m], i) => [m, i] as const));
  const creditors = entries.filter(([, v]) => v > 0).map(([m, v]) => ({ m, v }));
  const debtors = entries.filter(([, v]) => v < 0).map(([m, v]) => ({ m, v: -v }));
  const byLargest = (a: { m: string; v: number }, b: { m: string; v: number }) =>
    b.v - a.v || (rank.get(a.m) as number) - (rank.get(b.m) as number);

  const transfers: Transfer[] = [];
  while (creditors.length && debtors.length) {
    creditors.sort(byLargest);
    debtors.sort(byLargest);
    const c = creditors[0] as { m: string; v: number };
    const d = debtors[0] as { m: string; v: number };
    const amt = Math.min(c.v, d.v);
    transfers.push({ from: d.m, to: c.m, amountMinor: amt });
    c.v -= amt;
    d.v -= amt;
    if (c.v === 0) creditors.shift();
    if (d.v === 0) debtors.shift();
  }
  return transfers;
}

/** IOUs -> net balances -> simplified transfers. */
export function simplifyIous(ious: readonly Iou[]): Transfer[] {
  return simplifyDebts(netBalancesFromIous(ious));
}
