// Publishable key is public by design (RLS protects data), so defaults are committed.
// NOTE: EXPO_PUBLIC_* must be accessed as literal `process.env.X` so Metro can inline them.
export const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://nlkoxgbrhpkqwuzobjas.supabase.co';

export const SUPABASE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_KEY ?? 'sb_publishable_Fyui9dhk_CGnMzprbTPOqQ__eicVyVq';
