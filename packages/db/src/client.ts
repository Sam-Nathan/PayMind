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
