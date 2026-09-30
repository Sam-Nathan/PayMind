import type { ReactNode } from 'react';
import { BottomTabBar, Sidebar } from '../../components/Sidebar';
import { requireUser } from '../../lib/auth';

// Everything under /app is per-user.
export const dynamic = 'force-dynamic';

export default async function AppShellLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return (
    <div className="flex min-h-screen">
      <Sidebar userLabel={user.email ?? 'Signed in'} />
      <main className="min-w-0 flex-1 pb-24 md:pb-10">
        {children}
      </main>
      <BottomTabBar />
    </div>
  );
}
