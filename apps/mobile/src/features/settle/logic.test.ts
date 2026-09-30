import { describe, expect, it } from 'vitest';
import {
  allocatePayment,
  answerState,
  buildReminderMessage,
  buildSettlePlan,
  countIous,
  decodeDraft,
  defaultNote,
  encodeDraft,
  historyDetail,
  noteRefFor,
  spaceToken,
  statusFromUpiResult,
  upiTiles,
  verifyTimeline,
  type BalanceLike,
  type PayItem,
} from './logic.ts';

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ME = 'user-me';

// Goa: me(+), rahul(-), arjun(-). Flat: me(-) owes karthik(+). Rahul also owes me in Flat? no: keep simple.
const b = (spaceId: string, memberId: string, userId: string | null, displayName: string, netMinor: number): BalanceLike => ({
  spaceId,
  memberId,
  userId,
  displayName,
  netMinor,
});

const balances: BalanceLike[] = [
  b('goa', 'm-me-goa', ME, 'Sunny', 415000),
  b('goa', 'm-rahul-goa', 'u-rahul', 'Rahul', -185000),
  b('goa', 'm-arjun-goa', null, 'Arjun', -230000),
  b('tandoor', 'm-me-t', ME, 'Sunny', 72100),
  b('tandoor', 'm-rahul-t', 'u-rahul', 'Rahul', -72100),
  b('flat', 'm-me-f', ME, 'Sunny', -124000),
  b('flat', 'm-karthik-f', 'u-karthik', 'Karthik', 124000),
];
const spaceNames = new Map([
  ['goa', 'Goa Trip'],
  ['tandoor', 'Tandoor House'],
  ['flat', 'Flat 402'],
]);

describe('buildSettlePlan', () => {
  const plan = buildSettlePlan({
    balances,
    members: [
      { id: 'm-karthik-f', spaceId: 'flat', userId: 'u-karthik', displayName: 'Karthik', upiVpa: 'karthikr@okbank' },
    ],
    spaceNames,
    iousBySpace: new Map([['goa', 11]]),
    uid: ME,
  });

  it('totals what I owe and am owed across spaces', () => {
    expect(plan.youOweMinor).toBe(124000);
    expect(plan.owedToYouMinor).toBe(415000 + 72100);
    expect(plan.spacesOwedCount).toBe(2);
  });

  it('groups "you get back" per person across spaces, largest first', () => {
    expect(plan.gets.map((g) => [g.name, g.amountMinor])).toEqual([
      ['Rahul', 185000 + 72100],
      ['Arjun', 230000],
    ]);
    const rahul = plan.gets[0] as NonNullable<(typeof plan.gets)[number]>;
    expect(rahul.items.map((i) => [i.spaceName, i.amountMinor])).toEqual([
      ['Goa Trip', 185000],
      ['Tandoor House', 72100],
    ]);
    // the member row to remind is the debtor's, one per space
    expect(rahul.items.map((i) => i.fromMember)).toEqual(['m-rahul-goa', 'm-rahul-t']);
  });

  it('builds the "you pay" row with the payee UPI ID', () => {
    expect(plan.pays).toHaveLength(1);
    const k = plan.pays[0] as NonNullable<(typeof plan.pays)[number]>;
    expect(k.name).toBe('Karthik');
    expect(k.amountMinor).toBe(124000);
    expect(k.vpa).toBe('karthikr@okbank');
    expect(k.items[0]).toMatchObject({ fromMember: 'm-me-f', toMember: 'm-karthik-f', spaceName: 'Flat 402' });
  });

  it('builds a simplified card per space with IOU, people and payment counts', () => {
    const goa = plan.spaces.find((s) => s.spaceId === 'goa') as NonNullable<(typeof plan.spaces)[number]>;
    expect(goa.payments).toBe(2);
    expect(goa.ious).toBe(11);
    expect(goa.people).toBe(3);
    expect(goa.transfers.map((t) => `${t.fromName}>${t.toName}`).sort()).toEqual(['Arjun>You', 'Rahul>You']);
  });

  it('never reports fewer IOUs than payments', () => {
    const p = buildSettlePlan({ balances, spaceNames, uid: ME });
    const goa = p.spaces.find((s) => s.spaceId === 'goa') as NonNullable<(typeof p.spaces)[number]>;
    expect(goa.ious).toBe(goa.payments);
  });

  it('filters to one space', () => {
    const p = buildSettlePlan({ balances, spaceNames, uid: ME, spaceId: 'flat' });
    expect(p.gets).toHaveLength(0);
    expect(p.pays).toHaveLength(1);
    expect(p.owedToYouMinor).toBe(0);
  });

  it('is empty when everyone is square', () => {
    const p = buildSettlePlan({ balances: [b('x', 'a', ME, 'Me', 0), b('x', 'c', 'u', 'Z', 0)], uid: ME });
    expect(p.pays).toEqual([]);
    expect(p.gets).toEqual([]);
  });
});

describe('countIous', () => {
  it('counts shares owed to someone else who paid', () => {
    expect(
      countIous([
        { paidBy: 'a', shares: [{ memberId: 'a', owedMinor: 100 }, { memberId: 'b', owedMinor: 100 }, { memberId: 'c', owedMinor: 100 }] },
        { paidBy: 'b', shares: [{ memberId: 'a', owedMinor: 50 }, { memberId: 'b', owedMinor: 50 }, { memberId: 'c', owedMinor: 0 }] },
        { paidBy: null, shares: [{ memberId: 'a', owedMinor: 10 }] },
      ]),
    ).toBe(3);
  });
});

describe('note_ref', () => {
  const sep = new Date(2026, 8, 14);
  it('uses the number in the space name', () => {
    expect(noteRefFor('Flat 402', sep)).toBe('PM-402-SEP');
  });
  it('falls back to the first letters', () => {
    expect(noteRefFor('Goa Trip', new Date(2026, 9, 2))).toBe('PM-GOA-OCT');
    expect(spaceToken('  ')).toBe('PAY');
    expect(spaceToken('मुंबई')).toBe('PAY');
  });
  it('is deterministic for the same space and month', () => {
    expect(noteRefFor('Flat 402', new Date(2026, 8, 1))).toBe(noteRefFor('Flat 402', new Date(2026, 8, 30)));
  });
  it('builds the note that travels with the payment', () => {
    expect(defaultNote('PM-402-SEP', 'electricity + groceries')).toBe('PM-402-SEP · electricity + groceries');
    expect(defaultNote('PM-402-SEP', '  ')).toBe('PM-402-SEP');
  });
});

describe('pay draft param', () => {
  const items: PayItem[] = [
    { spaceId: U(1), spaceName: 'Flat 402', fromMember: U(2), toMember: U(3), amountMinor: 124000 },
    { spaceId: U(4), spaceName: 'Goa "Trip"', fromMember: U(5), toMember: U(6), amountMinor: 500 },
  ];
  it('round-trips', () => {
    expect(decodeDraft(encodeDraft(items))).toEqual(items);
  });
  it('rejects malformed or hostile input', () => {
    expect(decodeDraft(undefined)).toEqual([]);
    expect(decodeDraft('not json')).toEqual([]);
    expect(decodeDraft('[]')).toEqual([]);
    expect(decodeDraft(JSON.stringify([[U(1), 'x', 'nope', U(3), 100]]))).toEqual([]);
    expect(decodeDraft(JSON.stringify([[U(1), 'x', U(2), U(3), -5]]))).toEqual([]);
    expect(decodeDraft(JSON.stringify([[U(1), 'x', U(2), U(3), 1.5]]))).toEqual([]);
    expect(decodeDraft(JSON.stringify([[U(1), 'x', U(2), U(3)]]))).toEqual([]);
  });
});

describe('allocatePayment', () => {
  const items: PayItem[] = [
    { spaceId: 'a', spaceName: 'A', fromMember: 'f1', toMember: 't1', amountMinor: 30000 },
    { spaceId: 'b', spaceName: 'B', fromMember: 'f2', toMember: 't2', amountMinor: 70000 },
  ];
  it('pays everything in full', () => {
    expect(allocatePayment(items, 100000).map((i) => i.amountMinor)).toEqual([70000, 30000]);
  });
  it('spreads a part payment largest first', () => {
    const out = allocatePayment(items, 80000);
    expect(out.map((i) => [i.spaceId, i.amountMinor])).toEqual([['b', 70000], ['a', 10000]]);
    expect(out.reduce((a, i) => a + i.amountMinor, 0)).toBe(80000);
  });
  it('never pays more than owed and ignores bad amounts', () => {
    expect(allocatePayment(items, 999999).reduce((a, i) => a + i.amountMinor, 0)).toBe(100000);
    expect(allocatePayment(items, 0)).toEqual([]);
    expect(allocatePayment(items, -1)).toEqual([]);
    expect(allocatePayment(items, 10.5)).toEqual([]);
  });
});

describe('UPI tiles', () => {
  it('falls back to the static list when nothing can be detected', () => {
    const { tiles, detected } = upiTiles([]);
    expect(detected).toBe(false);
    expect(tiles.map((t) => t.id)).toEqual(['phonepe', 'gpay', 'paytm', 'bhim', 'other']);
  });
  it('shows only installed known apps, then "Other"', () => {
    const { tiles, detected } = upiTiles(['net.one97.paytm', 'com.unknown.bank', 'com.phonepe.app']);
    expect(detected).toBe(true);
    expect(tiles.map((t) => t.id)).toEqual(['phonepe', 'paytm', 'other']);
  });
});

describe('verify transitions follow core nextStatuses', () => {
  it('lets an initiated payment go to any answer', () => {
    expect(answerState('initiated', 'completed').allowed).toBe(true);
    expect(answerState('initiated', 'pending').allowed).toBe(true);
    expect(answerState('initiated', 'failed').allowed).toBe(true);
  });
  it('lets a pending payment be completed or failed, and "still pending" is a no-op', () => {
    expect(answerState('pending', 'completed').allowed).toBe(true);
    expect(answerState('pending', 'failed').allowed).toBe(true);
    expect(answerState('pending', 'pending').allowed).toBe(true);
  });
  it('blocks moves the state machine does not allow', () => {
    expect(answerState('failed', 'pending').allowed).toBe(false);
    expect(answerState('completed', 'pending').allowed).toBe(false);
    expect(answerState('cancelled', 'completed').allowed).toBe(false);
  });
  it('lets a failed payment be marked as gone through after all (UPI reversal)', () => {
    expect(answerState('failed', 'completed').allowed).toBe(true);
  });
  it('maps a UPI app result to a status', () => {
    expect(statusFromUpiResult('success')).toBe('completed');
    expect(statusFromUpiResult('failure')).toBe('failed');
    expect(statusFromUpiResult('submitted')).toBe('pending');
    expect(statusFromUpiResult('unknown')).toBeNull();
    expect(statusFromUpiResult(undefined)).toBeNull();
  });
  it('builds a timeline whose last step is open until resolved', () => {
    const base = { amountMinor: 124000, vpa: 'k@okbank', noteRef: 'PM-402-SEP', appName: 'PhonePe', createdAt: null, updatedAt: null, completedAt: null };
    const open = verifyTimeline({ ...base, status: 'initiated' });
    expect(open.map((e) => e.title)).toEqual(['Payment initiated', 'Opened PhonePe', 'Not confirmed']);
    expect(open[2]?.open).toBe(true);
    const done = verifyTimeline({ ...base, status: 'completed' });
    expect(done[2]?.open).toBeFalsy();
    expect(done[2]?.title).toBe('Payment completed');
  });
});

describe('reminder message (mirrors the send-reminder function)', () => {
  const two = [
    { space: 'Goa Trip', amountMinor: 185000 },
    { space: 'Tandoor House', amountMinor: 72100 },
  ];
  const url = 'https://x.test/pay/tok';
  it('friendly, several spaces', () => {
    expect(buildReminderMessage('friendly', 'Rahul Verma', two, url)).toBe(
      'Hey Rahul! Quick one — 2 shared expenses add up to ₹2,571.00:\n• Goa Trip — ₹1,850.00\n• Tandoor House — ₹721.00\nNo rush, whenever you get a sec\nhttps://x.test/pay/tok',
    );
  });
  it('friendly, one space', () => {
    expect(buildReminderMessage('friendly', 'Rahul', [two[0] as (typeof two)[number]], url)).toBe(
      'Hey Rahul! Quick one — ₹1,850.00 is pending for Goa Trip.\nNo rush, whenever you get a sec\nhttps://x.test/pay/tok',
    );
  });
  it('neutral', () => {
    expect(buildReminderMessage('neutral', 'Rahul', two, url)).toBe(
      'Hi Rahul, you have 2 shared expenses totalling ₹2,571.00:\n• Goa Trip — ₹1,850.00\n• Tandoor House — ₹721.00\nhttps://x.test/pay/tok',
    );
    expect(buildReminderMessage('neutral', 'Rahul', [two[1] as (typeof two)[number]], url)).toBe(
      'Hi Rahul, you have a shared expense of ₹721.00 in Tandoor House.\nhttps://x.test/pay/tok',
    );
  });
  it('firm', () => {
    expect(buildReminderMessage('firm', 'Rahul', two, url)).toBe(
      'Reminder: ₹2,571.00 is pending:\n• Goa Trip — ₹1,850.00\n• Tandoor House — ₹721.00\nPlease settle it today.\nhttps://x.test/pay/tok',
    );
    expect(buildReminderMessage('firm', 'Rahul', [two[0] as (typeof two)[number]], url)).toBe(
      'Reminder: ₹1,850.00 is pending for Goa Trip.\nPlease settle it today.\nhttps://x.test/pay/tok',
    );
  });
  it('uses a placeholder link in the preview', () => {
    expect(buildReminderMessage('neutral', 'Rahul', two)).toContain('paymind.vercel.app/pay/…');
  });
});

describe('history detail', () => {
  it('names the method and flags corrections', () => {
    expect(historyDetail({ status: 'completed', amountMinor: 1, correctedFromMinor: null, method: 'upi', upiApp: 'phonepe' })).toEqual(['UPI (PhonePe)']);
    expect(historyDetail({ status: 'completed', amountMinor: 1, correctedFromMinor: null, method: 'bank', upiApp: null })).toEqual(['bank transfer']);
    expect(historyDetail({ status: 'corrected', amountMinor: 16000, correctedFromMinor: 18000, method: 'cash', upiApp: null })).toEqual(['cash', 'amount fixed']);
    expect(historyDetail({ status: 'pending', amountMinor: 1, correctedFromMinor: null, method: null, upiApp: null })).toEqual([]);
  });
});
