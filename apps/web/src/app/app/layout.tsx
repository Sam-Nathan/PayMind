import type { ReactNode } from 'react';
import { Sidebar } from '../../components/Sidebar';

export default function AppShellLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1">{children}</main>
    </div>
  );
}
