import { describe, expect, it } from 'vitest';
import { spaceTransfers, summariseStanding, type MemberBalance } from './standing.ts';

const bal = (spaceId: string, memberId: string, userId: string | null, displayName: string, netMinor: number): MemberBalance => ({
  spaceId,
  memberId,
  userId,
  displayName,
  netMinor,
});

describe('summariseStanding', () => {
  const rows = [
    // Goa: me +4200, Rahul -1850, Arjun -2350
    bal('goa', 'm1', 'me', 'You', 420000),
    bal('goa', 'm2', null, 'Rahul', -185000),
    bal('goa', 'm3', null, 'Arjun', -235000),
    // Flat: me -1240, Karthik +1240
    bal('flat', 'f1', 'me', 'You', -124000),
    bal('flat', 'f2', 'u-k', 'Karthik', 124000),
    // A space I'm not in
    bal('other', 'o1', 'u-x', 'X', 500),
    bal('other', 'o2', 'u-y', 'Y', -500),
  ];

  it('totals my position across spaces and groups people', () => {
    const s = summariseStanding(rows, 'me');
    expect(s.owedToYouMinor).toBe(420000);
    expect(s.youOweMinor).toBe(124000);
    expect(s.spacesOwedCount).toBe(1);
    expect(s.owedBy.map((p) => [p.key, p.amountMinor])).toEqual([
      ['name:arjun', 235000],
      ['name:rahul', 185000],
    ]);
    expect(s.owes).toEqual([{ key: 'u-k', name: 'Karthik', amountMinor: 124000, spaceIds: ['flat'] }]);
  });

  it('keeps per-space standing including spaces I am not in', () => {
    const s = summariseStanding(rows, 'me');
    expect(s.bySpace.get('goa')).toMatchObject({ netMinor: 420000, myMemberId: 'm1' });
    expect(s.bySpace.get('other')).toMatchObject({ netMinor: 0, myMemberId: null });
    expect(s.bySpace.get('other')?.transfers).toEqual([{ from: 'o2', to: 'o1', amountMinor: 500 }]);
  });

  it('merges one person across spaces by user id', () => {
    const s = summariseStanding(
      [bal('a', 'a1', 'me', 'Me', -100), bal('a', 'a2', 'u-k', 'K', 100), bal('b', 'b1', 'me', 'Me', -50), bal('b', 'b2', 'u-k', 'Kay', 50)],
      'me',
    );
    expect(s.owes).toEqual([{ key: 'u-k', name: 'K', amountMinor: 150, spaceIds: ['a', 'b'] }]);
  });

  it('returns zeros for no rows or no user, and tolerates unbalanced spaces', () => {
    expect(summariseStanding([], 'me')).toMatchObject({ owedToYouMinor: 0, youOweMinor: 0, owedBy: [], owes: [] });
    expect(summariseStanding(rows, undefined).owedToYouMinor).toBe(0);
    expect(spaceTransfers([{ memberId: 'a', netMinor: 100 }])).toEqual([]);
  });
});
