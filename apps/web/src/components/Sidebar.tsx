'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/app', label: 'Home' },
  { href: '/app/spaces', label: 'Spaces' },
  { href: '/app/ask', label: 'Ask' },
  { href: '/app/money', label: 'Money' },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex w-56 shrink-0 flex-col gap-1 bg-hero p-4 text-text-on-dark">
      <div className="mb-6 px-3 text-xl font-bold">PayMind</div>
      {NAV.map(({ href, label }) => {
        const active = href === '/app' ? pathname === '/app' : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              active ? 'bg-paper text-ink' : 'text-text-on-dark hover:bg-white/10'
            }`}
          >
            {label}
          </Link>
        );
      })}
    </aside>
  );
}
