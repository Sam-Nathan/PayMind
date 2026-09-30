import { describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));

const { inviteCodeFromUrl, parsePendingInvite, PENDING_INVITE_TTL_MS } = await import('./pendingInvite.ts');

describe('pending invite', () => {
  it('extracts the code from invite links only', () => {
    expect(inviteCodeFromUrl('paymind://invite/ab12cd34')).toBe('AB12CD34');
    expect(inviteCodeFromUrl('https://paymind.vercel.app/invite/AB12-CD34')).toBe('AB12CD34');
    expect(inviteCodeFromUrl('paymind://settle')).toBeNull();
    expect(inviteCodeFromUrl('paymind://')).toBeNull();
    expect(inviteCodeFromUrl(null)).toBeNull();
  });
  it('reads a stored code until it expires', () => {
    const now = 1_000_000_000_000;
    expect(parsePendingInvite(JSON.stringify({ code: 'AB12CD34', at: now - 1000 }), now)).toBe('AB12CD34');
    expect(parsePendingInvite(JSON.stringify({ code: 'AB12CD34', at: now - PENDING_INVITE_TTL_MS - 1 }), now)).toBeNull();
    expect(parsePendingInvite('{bad', now)).toBeNull();
    expect(parsePendingInvite(JSON.stringify({ code: '!!', at: now }), now)).toBeNull();
    expect(parsePendingInvite(null, now)).toBeNull();
  });
});
