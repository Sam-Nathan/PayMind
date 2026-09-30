import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { HttpError } from './http.ts';

export interface AuthedContext {
  /** User-scoped client: the caller's JWT is forwarded, so RLS applies to every query. */
  supabase: SupabaseClient;
  userId: string;
}

/** Builds a user-scoped Supabase client from the Authorization header. Rejects anonymous callers. */
export async function requireUser(req: Request): Promise<AuthedContext> {
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new HttpError(401, 'not_authenticated', 'Sign in to use this feature');

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'not_authenticated', 'Your session has expired. Please sign in again');
  return { supabase, userId: data.user.id };
}

/** Service-role client. Only for narrow server-side lookups (e.g. another user's push tokens). */
export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface PrivacyFlags {
  ai_enabled: boolean;
  keep_receipts: boolean;
  capture_notifications: boolean;
}

export async function getPrivacy(ctx: AuthedContext): Promise<PrivacyFlags> {
  const { data, error } = await ctx.supabase
    .from('privacy_settings')
    .select('ai_enabled, keep_receipts, capture_notifications')
    .eq('user_id', ctx.userId)
    .maybeSingle();
  if (error) throw new HttpError(500, 'privacy_lookup_failed', 'Could not read privacy settings');
  // No row yet: use the schema defaults (AI on, everything else off).
  return data ?? { ai_enabled: true, keep_receipts: false, capture_notifications: false };
}

export async function requireAiEnabled(ctx: AuthedContext): Promise<PrivacyFlags> {
  const p = await getPrivacy(ctx);
  if (!p.ai_enabled) {
    throw new HttpError(403, 'ai_disabled', 'AI features are turned off in Privacy & data. Turn them on to use this.');
  }
  return p;
}

/** Stores an AI proposal (RLS: the caller's own row). Returns its id. */
export async function saveProposal(
  ctx: AuthedContext,
  row: { kind: string; payload: unknown; spaceId?: string | null; model?: string | null },
): Promise<string> {
  const { data, error } = await ctx.supabase
    .from('ai_proposals')
    .insert({
      user_id: ctx.userId,
      kind: row.kind,
      payload: row.payload as never,
      space_id: row.spaceId ?? null,
      model: row.model ?? null,
    })
    .select('id')
    .single();
  if (error || !data) throw new HttpError(500, 'proposal_save_failed', 'Could not save the proposal');
  return data.id as string;
}
