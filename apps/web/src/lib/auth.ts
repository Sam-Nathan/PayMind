import { redirect } from 'next/navigation';
import { cache } from 'react';
import { createClient } from './supabase/server';

export interface SessionUser {
  id: string;
  email: string | null;
}

/** Current user from the validated JWT claims, or null. Cached per request. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const claims = data?.claims;
    if (!claims?.sub) return null;
    return { id: claims.sub, email: (claims.email as string | undefined) ?? null };
  } catch {
    return null;
  }
});

/** For pages under /app: the proxy already redirects, this is the belt-and-braces check. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  return user;
}
