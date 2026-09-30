import {
  spaceTransfers,
  summariseStanding,
  type MemberBalance,
  type SpaceStanding,
  type Transfer,
} from '@paymind/core';
import type { BalanceRow } from './types';

export type { SpaceStanding };

export interface DebtSummary {
  owedToMeMinor: number;
  iOweMinor: number;
  /** Distinct people who owe me something. */
  debtorCount: number;
  /** Spaces in which I am owed something. */
  creditSpaceCount: number;
  /** The person I owe most (across spaces): { name, spaceId, amountMinor }. */
  largestCreditor: { name: string; spaceId: string; amountMinor: number } | null;
  bySpace: Map<string, SpaceStanding>;
}

const toMemberBalance = (r: BalanceRow): MemberBalance => ({
  spaceId: r.space_id,
  memberId: r.member_id,
  userId: r.user_id,
  displayName: r.display_name,
  netMinor: Number(r.net_minor),
});

/**
 * Turn `balances` rows (across the viewer's spaces) into my standing, using core's
 * summariseStanding: the same maths as the mobile Home screen.
 */
export function summariseDebts(rows: BalanceRow[], userId: string): DebtSummary {
  const s = summariseStanding(rows.map(toMemberBalance), userId);
  const top = s.owes[0];
  return {
    owedToMeMinor: s.owedToYouMinor,
    iOweMinor: s.youOweMinor,
    debtorCount: s.owedBy.length,
    creditSpaceCount: s.spacesOwedCount,
    largestCreditor: top ? { name: top.name, spaceId: top.spaceIds[0] ?? '', amountMinor: top.amountMinor } : null,
    bySpace: s.bySpace,
  };
}

/** Simplified transfers for one space's balance rows (empty if the nets don't sum to zero). */
export function transfersFor(rows: BalanceRow[]): Transfer[] {
  return spaceTransfers(rows.map(toMemberBalance));
}
