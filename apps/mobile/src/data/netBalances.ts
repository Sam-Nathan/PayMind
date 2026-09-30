/**
 * "What I'm owed / what I owe" over the `balances` view. The maths lives in @paymind/core
 * (summariseStanding, shared with the web app); this adapts it to the shape Home uses.
 */
import { summariseStanding, type PersonNet } from '@paymind/core';
import type { Balance } from './types.ts';

export type { PersonNet };

export interface MyNet {
  /** Σ positive nets across spaces */
  owedToYouMinor: number;
  /** Σ |negative nets| across spaces */
  youOweMinor: number;
  /** people who owe me, largest first */
  owedBy: PersonNet[];
  /** people I owe, largest first */
  owes: PersonNet[];
  /** my net per space id (only spaces I'm a member of) */
  perSpace: Record<string, number>;
  /** number of spaces where I'm owed money */
  spacesOwedCount: number;
}

export function computeMyNet(balances: readonly Balance[], myUserId: string | undefined): MyNet {
  const s = summariseStanding(balances, myUserId);
  const perSpace: Record<string, number> = {};
  for (const [spaceId, st] of s.bySpace) if (st.myMemberId) perSpace[spaceId] = st.netMinor;
  return {
    owedToYouMinor: s.owedToYouMinor,
    youOweMinor: s.youOweMinor,
    owedBy: s.owedBy,
    owes: s.owes,
    perSpace,
    spacesOwedCount: s.spacesOwedCount,
  };
}

export function netStatus(netMinor: number): 'owe' | 'owed' | 'square' {
  return netMinor < 0 ? 'owe' : netMinor > 0 ? 'owed' : 'square';
}
