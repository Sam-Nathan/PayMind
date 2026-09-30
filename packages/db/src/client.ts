import {
  createClient,
  type SupabaseClient,
  type SupabaseClientOptions,
} from '@supabase/supabase-js';
import type { Database } from './types.ts';

export type PaymindClient = SupabaseClient<Database>;

/** Thin typed wrapper around supabase-js `createClient`. */
export function createPaymindClient(
  url: string,
  key: string,
  options?: SupabaseClientOptions<'public'>,
): PaymindClient {
  return createClient<Database>(url, key, options);
}

/**
 * Removes every receipt photo the caller stored (Storage `receipts/<uid>/...`). Call it BEFORE
 * `delete_my_account`: the account-deletion trigger cannot delete Storage objects, so without this
 * the photos would outlive the account. Storage RLS limits the caller to their own folder.
 * Bounded (at most 50 pages of 100) so a Storage policy problem can never loop forever.
 */
export async function deleteMyReceipts(client: { storage: PaymindClient['storage'] }, uid: string): Promise<number> {
  const bucket = client.storage.from('receipts');
  let removed = 0;
  for (let page = 0; page < 50; page++) {
    const { data, error } = await bucket.list(uid, { limit: 100 });
    if (error) throw error;
    const files = (data ?? []).filter((f) => f.name && f.id !== null);
    if (files.length === 0) return removed;
    const { data: gone, error: rmError } = await bucket.remove(files.map((f) => `${uid}/${f.name}`));
    if (rmError) throw rmError;
    if (!gone || gone.length === 0) throw new Error('Could not delete your receipt photos. Please try again.');
    removed += gone.length;
    if (files.length < 100) return removed;
  }
  return removed;
}
