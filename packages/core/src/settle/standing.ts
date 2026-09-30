/**
 * "What I'm owed / what I owe" across spaces, from rows of the `balances` view.
 * Debts are simplified per space with simplifyDebts, then grouped per person across spaces.
 * Shared by the web and mobile apps so Home shows the same numbers everywhere.
 */
import type { Paise } from '../money.ts';
import { simplifyDebts, type NetBalances, type Transfer } from './simplify.ts';

/** One `balances` row (camelCase; only the fields the maths needs). */
export interface MemberBalance {
  spaceId: string;
  memberId: string;
  userId: string | null;
  displayName: string;
  /** > 0: the member is owed money; < 0: they owe. */
  netMinor: Paise;
}

export interface PersonNet {
  /** Stable key: user id when known, else `name:<lower-cased display name>`. */
  key: string;
  name: string;
  amountMinor: Paise;
  spaceIds: string[];
}

export interface SpaceStanding {
  spaceId: string;
  /** My net in this space (0 when I'm not a member). */
  netMinor: Paise;
  myMemberId: string | null;
  /** Simplified transfers for the whole space (empty if its nets don't sum to zero). */
  transfers: Transfer[];
}

export interface MyStanding {
  /** Σ of my positive nets across spaces. */
  owedToYouMinor: Paise;
  /** Σ of |my negative nets| across spaces. */
  youOweMinor: Paise;
  /** People who owe me, largest first. */
  owedBy: PersonNet[];
  /** People I owe, largest first. */
  owes: PersonNet[];
  /** Per space id. */
  bySpace: Map<string, SpaceStanding>;
  /** Number of spaces where I'm owed money. */
  spacesOwedCount: number;
}

/** Simplified transfers for one space's rows; [] if the nets don't sum to zero. */
export function spaceTransfers(rows: readonly Pick<MemberBalance, 'memberId' | 'netMinor'>[]): Transfer[] {
  const nets: NetBalances = {};
  for (const r of rows) nets[r.memberId] = r.netMinor;
  try {
    return simplifyDebts(nets);
  } catch {
    return [];
  }
}

export function summariseStanding(balances: readonly MemberBalance[], myUserId: string | null | undefined): MyStanding {
  const bySpaceRows = new Map<string, MemberBalance[]>();
  for (const b of balances) {
    const list = bySpaceRows.get(b.spaceId);
    if (list) list.push(b);
    else bySpaceRows.set(b.spaceId, [b]);
  }

  const owedBy = new Map<string, PersonNet>();
  const owes = new Map<string, PersonNet>();
  const bySpace = new Map<string, SpaceStanding>();
  let owedToYouMinor = 0;
  let youOweMinor = 0;
  let spacesOwedCount = 0;

  const bump = (map: Map<string, PersonNet>, b: MemberBalance, amount: number) => {
    const key = b.userId ?? `name:${b.displayName.trim().toLowerCase()}`;
    const cur = map.get(key);
    if (cur) {
      cur.amountMinor += amount;
      if (!cur.spaceIds.includes(b.spaceId)) cur.spaceIds.push(b.spaceId);
    } else {
      map.set(key, { key, name: b.displayName, amountMinor: amount, spaceIds: [b.spaceId] });
    }
  };

  for (const [spaceId, rows] of bySpaceRows) {
    const me = myUserId ? rows.find((r) => r.userId === myUserId) : undefined;
    const transfers = spaceTransfers(rows);
    bySpace.set(spaceId, { spaceId, netMinor: me?.netMinor ?? 0, myMemberId: me?.memberId ?? null, transfers });
    if (!me || me.netMinor === 0) continue;

    if (me.netMinor > 0) {
      owedToYouMinor += me.netMinor;
      spacesOwedCount += 1;
    } else {
      youOweMinor += -me.netMinor;
    }

    const byMember = new Map(rows.map((r) => [r.memberId, r]));
    for (const t of transfers) {
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
  return { owedToYouMinor, youOweMinor, owedBy: sorted(owedBy), owes: sorted(owes), bySpace, spacesOwedCount };
}
