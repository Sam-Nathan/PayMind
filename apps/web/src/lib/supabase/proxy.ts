import { createServerClient } from '@supabase/ssr';
import type { Database } from '@paymind/db';
import { NextResponse, type NextRequest } from 'next/server';
import { SUPABASE_KEY, SUPABASE_URL } from '../../config';

/**
 * Refreshes the Supabase auth session cookie on every matched request and protects `/app/**`:
 * unauthenticated visitors are redirected to `/login`; signed-in visitors on `/login` or `/signup`
 * are sent to `/app`.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Do not run code between createServerClient and getClaims(). getClaims() validates the JWT and
  // triggers the token refresh that setAll() persists.
  let signedIn = false;
  try {
    const { data } = await supabase.auth.getClaims();
    signedIn = Boolean(data?.claims?.sub);
  } catch {
    // Supabase unreachable: treat as signed out (protected pages redirect, public pages still render).
    signedIn = false;
  }

  const { pathname } = request.nextUrl;
  const isProtected = pathname === '/app' || pathname.startsWith('/app/');
  const isAuthPage = pathname === '/login' || pathname === '/signup';

  if ((isProtected && !signedIn) || (isAuthPage && signedIn)) {
    const url = request.nextUrl.clone();
    url.search = '';
    if (isProtected) {
      url.pathname = '/login';
      url.searchParams.set('next', pathname);
    } else {
      url.pathname = '/app';
    }
    const redirect = NextResponse.redirect(url);
    // Carry over any refreshed session cookies.
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  return response;
}
