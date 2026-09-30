import { safeToSpend, type SafeToSpendResult } from '@paymind/core';
import { cookies } from 'next/headers';
import { daysLeftInMonth } from './format';

export const BALANCE_COOKIE = 'pm_balance';
export const BUFFER_COOKIE = 'pm_buffer';
export const DEFAULT_BUFFER_MINOR = 500_000; // ₹5,000

export interface SafeToSpendView {
  hasBalance: boolean;
  balanceMinor: number | null;
  bufferMinor: number;
  daysLeft: number;
  day: number;
  daysInMonth: number;
  result: SafeToSpendResult | null;
}

function readInt(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : null;
}

/** Safe-to-spend from the manually entered balance (cookie) using core's safeToSpend. */
export async function loadSafeToSpend(upcomingMinor = 0, goalSetAsideMinor = 0): Promise<SafeToSpendView> {
  const store = await cookies();
  const balanceMinor = readInt(store.get(BALANCE_COOKIE)?.value);
  const bufferMinor = readInt(store.get(BUFFER_COOKIE)?.value) ?? DEFAULT_BUFFER_MINOR;
  const { daysLeft, day, daysInMonth } = daysLeftInMonth();
  const result =
    balanceMinor === null
      ? null
      : safeToSpend({ balanceMinor, upcomingMinor, goalSetAsideMinor, bufferMinor, daysLeft });
  return { hasBalance: balanceMinor !== null, balanceMinor, bufferMinor, daysLeft, day, daysInMonth, result };
}
