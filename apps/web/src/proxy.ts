import type { NextRequest } from 'next/server';
import { updateSession } from './lib/supabase/proxy';

// Next.js 16: `proxy.ts` replaces the deprecated `middleware.ts`.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Skip static assets; the public pay-link page still gets a session refresh (harmless).
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
