import { simplifyDebts, type Transfer } from '@paymind/core';
import type { BalanceRow } from './types';

export interface SpaceStanding {
  spaceId: string;
  /** My net in this space: > 0 I am owed, < 0 I owe. */
  netMinor: number;
  myMemberId: string | null;
  /** Simplified transfers in this space (who pays whom). */
  transfers: Transfer[];
}

export interface DebtSummary {
  owedToMeMinor: number;
  iOweMinor: number;
  /** Distinct people who owe me something. */
  debtorCount: number;
  /** Spaces in which I am owed something. */
  creditSpaceCount: number;
  /** Largest amount I owe to one person: { name, spaceId }. */
  largestCreditor: { name: string; spaceId: string; amountMinor: number } | null;
  bySpace: Map<string, SpaceStanding>;
}

/**
 * Turn `balances` rows (across the viewer's spaces) into my standing per space, using core's
 * simplifyDebts so the maths is identical to the Settle-up screens.
 */
export function summariseDebts(rows: BalanceRow[], userId: string): DebtSummary {
  const bySpaceRows = new Map<string, BalanceRow[]>();
  for (const r of rows) {
    const list = bySpaceRows.get(r.space_id) ?? [];
    list.push(r);
    bySpaceRows.set(r.space_id, list);
  }

  const summary: DebtSummary = {
    owedToMeMinor: 0,
    iOweMinor: 0,
    debtorCount: 0,
    creditSpaceCount: 0,
    largestCreditor: null,
    bySpace: new Map(),
  };
  const debtors = new Set<string>();

  for (const [spaceId, list] of bySpaceRows) {
    const me = list.find((r) => r.user_id === userId) ?? null;
    const transfers = transfersFor(list);
    const standing: SpaceStanding = {
      spaceId,
      netMinor: me ? Number(me.net_minor) : 0,
      myMemberId: me?.member_id ?? null,
      transfers,
    };
    summary.bySpace.set(spaceId, standing);
    if (!me) continue;

    let creditInSpace = false;
    for (const t of transfers) {
      if (t.to === me.member_id) {
        summary.owedToMeMinor += t.amountMinor;
        debtors.add(t.from);
        creditInSpace = true;
      } else if (t.from === me.member_id) {
        summary.iOweMinor += t.amountMinor;
        if (!summary.largestCreditor || t.amountMinor > summary.largestCreditor.amountMinor) {
          const creditor = list.find((r) => r.member_id === t.to);
          summary.largestCreditor = {
            name: creditor?.display_name ?? 'Someone',
            spaceId,
            amountMinor: t.amountMinor,
          };
        }
      }
    }
    if (creditInSpace) summary.creditSpaceCount += 1;
  }
  summary.debtorCount = debtors.size;
  return summary;
}

/** Simplified transfers for one space's balance rows (empty if the nets don't sum to zero). */
export function transfersFor(rows: BalanceRow[]): Transfer[] {
  const nets: Record<string, number> = {};
  for (const r of rows) nets[r.member_id] = Number(r.net_minor);
  try {
    return simplifyDebts(nets);
  } catch {
    return [];
  }
}
