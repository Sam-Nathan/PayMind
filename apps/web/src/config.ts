// Publishable key is public by design (RLS protects data), so defaults are committed.
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://nlkoxgbrhpkqwuzobjas.supabase.co';

export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_KEY ?? 'sb_publishable_Fyui9dhk_CGnMzprbTPOqQ__eicVyVq';
