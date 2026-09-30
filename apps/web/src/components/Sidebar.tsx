'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType, SVGProps } from 'react';
import { signOutAction } from '../app/auth-actions';
import {
  BarsIcon,
  ClockIcon,
  HomeIcon,
  ShieldIcon,
  SparklesIcon,
  UsersIcon,
} from './icons';

interface NavItem {
  href: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

const NAV: NavItem[] = [
  { href: '/app', label: 'Home', Icon: HomeIcon },
  { href: '/app/spaces', label: 'Spaces', Icon: UsersIcon },
  { href: '/app/ask', label: 'Ask', Icon: SparklesIcon },
  { href: '/app/money', label: 'Money', Icon: BarsIcon },
  { href: '/app/timeline', label: 'Timeline', Icon: ClockIcon },
  { href: '/app/privacy', label: 'Privacy', Icon: ShieldIcon },
];

function isActive(pathname: string, href: string) {
  return href === '/app' ? pathname === '/app' : pathname.startsWith(href);
}

/** Desktop (>= md) left sidebar. */
export function Sidebar({ userLabel }: { userLabel: string }) {
  const pathname = usePathname();
  return (
    <aside className="dots sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-hero p-4 text-text-on-dark md:flex">
      <Link href="/app" className="mb-8 mt-2 px-3 text-xl font-bold tracking-tight">
        PayMind
      </Link>
      <nav aria-label="Main" className="flex flex-col gap-1">
        {NAV.map(({ href, label, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-[14px] px-3 py-2.5 text-[15px] font-semibold transition-colors ${
                active ? 'bg-paper text-ink' : 'text-text-on-dark hover:bg-white/10'
              }`}
            >
              <Icon width={20} height={20} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto rounded-[16px] bg-oxblood-deep/70 p-3">
        <p className="truncate text-[13px] text-text-on-dark-muted">{userLabel}</p>
        <form action={signOutAction}>
          <button type="submit" className="mt-1 text-[14px] font-semibold underline-offset-2 hover:underline">
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}

/** Phone-width bottom tab bar, mirroring the mobile app. */
export function BottomTabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-hairline bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {NAV.map(({ href, label, Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px] font-semibold ${
              active ? 'text-signal' : 'text-text-muted'
            }`}
          >
            <Icon width={22} height={22} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
