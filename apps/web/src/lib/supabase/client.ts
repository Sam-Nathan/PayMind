import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@paymind/db';
import { SUPABASE_KEY, SUPABASE_URL } from '../../config';

/** Supabase client for Client Components (browser). */
export function createClient() {
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_KEY);
}
