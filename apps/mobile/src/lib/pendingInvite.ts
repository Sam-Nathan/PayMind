/**
 * An invite link opened while signed out (or before onboarding) would be lost at the auth gate, so
 * the code is kept in AsyncStorage and the invite screen is opened once the user reaches the app.
 * Storage failures are ignored: the worst case is that the user has to tap the link again.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseInviteCode } from '../features/spaces/logic.ts';

const KEY = 'paymind.pendingInvite.v1';
/** A stale link from last month should not pop up out of nowhere. */
export const PENDING_INVITE_TTL_MS = 7 * 24 * 3600_000;

/** The invite code in a `paymind://invite/CODE` (or https …/invite/CODE) link, else null. */
export function inviteCodeFromUrl(url: string | null | undefined): string | null {
  if (!url || !/\/invite\/[A-Za-z0-9-]+/i.test(url)) return null;
  return parseInviteCode(url);
}

export function parsePendingInvite(raw: string | null, now = Date.now()): string | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { code?: unknown; at?: unknown };
    if (typeof v.code !== 'string' || typeof v.at !== 'number' || now - v.at > PENDING_INVITE_TTL_MS) return null;
    return parseInviteCode(v.code);
  } catch {
    return null;
  }
}

export async function savePendingInvite(code: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() }));
  } catch {
    // ignore
  }
}

/** Reads and clears the pending code. */
export async function takePendingInvite(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) await AsyncStorage.removeItem(KEY);
    return parsePendingInvite(raw);
  } catch {
    return null;
  }
}
