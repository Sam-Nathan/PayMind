import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL } from '../../config';

/** Cookie-less anon client for public pages (e.g. `/pay/[token]`). Never persists a session. */
export function createAnonClient() {
  return createSupabaseClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
