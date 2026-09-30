/**
 * "What I'm owed / what I owe" maths over the `balances` view. Pure: debts are derived per space
 * with core's simplifyDebts, then grouped per person across spaces.
 */
import { simplifyDebts } from '@paymind/core';
import type { Balance } from './types.ts';

export interface PersonNet {
  /** stable key: user id when known, else lower-cased name */
  key: string;
  name: string;
  amountMinor: number;
  spaceIds: string[];
}

export interface MyNet {
  /** Σ positive nets across spaces */
  owedToYouMinor: number;
  /** Σ |negative nets| across spaces */
  youOweMinor: number;
  /** people who owe me, largest first */
  owedBy: PersonNet[];
  /** people I owe, largest first */
  owes: PersonNet[];
  /** my net per space id */
  perSpace: Record<string, number>;
  /** number of spaces where I'm owed money */
  spacesOwedCount: number;
}

export function computeMyNet(balances: readonly Balance[], myUserId: string | undefined): MyNet {
  const bySpace = new Map<string, Balance[]>();
  for (const b of balances) {
    const list = bySpace.get(b.spaceId);
    if (list) list.push(b);
    else bySpace.set(b.spaceId, [b]);
  }

  const owedBy = new Map<string, PersonNet>();
  const owes = new Map<string, PersonNet>();
  const perSpace: Record<string, number> = {};
  let owedToYouMinor = 0;
  let youOweMinor = 0;
  let spacesOwedCount = 0;

  const bump = (map: Map<string, PersonNet>, b: Balance, amount: number) => {
    const key = b.userId ?? `name:${b.displayName.trim().toLowerCase()}`;
    const cur = map.get(key);
    if (cur) {
      cur.amountMinor += amount;
      if (!cur.spaceIds.includes(b.spaceId)) cur.spaceIds.push(b.spaceId);
    } else {
      map.set(key, { key, name: b.displayName, amountMinor: amount, spaceIds: [b.spaceId] });
    }
  };

  for (const [spaceId, rows] of bySpace) {
    const me = myUserId ? rows.find((r) => r.userId === myUserId) : undefined;
    if (!me) continue;
    perSpace[spaceId] = me.netMinor;
    if (me.netMinor > 0) {
      owedToYouMinor += me.netMinor;
      spacesOwedCount += 1;
    } else if (me.netMinor < 0) {
      youOweMinor += -me.netMinor;
    }
    if (me.netMinor === 0) continue;

    const nets: Record<string, number> = {};
    for (const r of rows) nets[r.memberId] = r.netMinor;
    const byMember = new Map(rows.map((r) => [r.memberId, r]));
    for (const t of simplifyDebts(nets)) {
      if (t.to === me.memberId) {
        const from = byMember.get(t.from);
        if (from) bump(owedBy, from, t.amountMinor);
      } else if (t.from === me.memberId) {
        const to = byMember.get(t.to);
        if (to) bump(owes, to, t.amountMinor);
      }
    }
  }

  const sorted = (m: Map<string, PersonNet>) => [...m.values()].sort((a, b) => b.amountMinor - a.amountMinor);
  return {
    owedToYouMinor,
    youOweMinor,
    owedBy: sorted(owedBy),
    owes: sorted(owes),
    perSpace,
    spacesOwedCount,
  };
}

export function netStatus(netMinor: number): 'owe' | 'owed' | 'square' {
  return netMinor < 0 ? 'owe' : netMinor > 0 ? 'owed' : 'square';
}
