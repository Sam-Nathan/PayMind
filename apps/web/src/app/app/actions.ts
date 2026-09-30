'use server';

import { rupeesToPaise } from '@paymind/core';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { requireUser } from '../../lib/auth';
import { BALANCE_COOKIE, BUFFER_COOKIE } from '../../lib/balance';

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Safe-to-spend needs a bank balance. Until Account Aggregator consent exists the user types it in;
 * it is kept only in this browser's cookie and never sent to the database.
 */
export async function setBalanceAction(formData: FormData): Promise<void> {
  await requireUser();
  const store = await cookies();
  const opts = { maxAge: ONE_YEAR, path: '/app', sameSite: 'lax' as const, httpOnly: true };

  const clear = formData.get('clear') !== null;
  if (clear) {
    store.delete({ name: BALANCE_COOKIE, path: '/app' });
    store.delete({ name: BUFFER_COOKIE, path: '/app' });
    revalidatePath('/app');
    return;
  }

  const rawBalance = String(formData.get('balance') ?? '').trim();
  const rawBuffer = String(formData.get('buffer') ?? '').trim();
  try {
    if (rawBalance) {
      const paise = rupeesToPaise(rawBalance);
      store.set(BALANCE_COOKIE, String(paise), opts);
    }
    if (rawBuffer) {
      const paise = rupeesToPaise(rawBuffer);
      if (paise >= 0) store.set(BUFFER_COOKIE, String(paise), opts);
    }
  } catch {
    // Unparseable input: keep previous values.
  }
  revalidatePath('/app');
  revalidatePath('/app/money');
}
