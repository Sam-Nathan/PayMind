import Link from 'next/link';
import type { ReactNode } from 'react';

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="dots bg-hero px-4 py-8 text-text-on-dark md:px-8">
        <div className="mx-auto max-w-3xl">
          <Link href="/" className="text-[15px] font-bold tracking-tight">
            PayMind
          </Link>
          <h1 className="mt-5 text-[30px] font-bold leading-tight">{title}</h1>
          <p className="mt-1 text-[14px] text-text-on-dark-muted">Last updated: {updated}</p>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 md:px-8">
        <div className="mb-8 rounded-[18px] border border-clay bg-peach p-4 text-[14px] text-rust">
          <b>Draft for owner review.</b> This document is a plain-language draft and has not yet been
          reviewed by a lawyer or approved by the PayMind owner. It must be reviewed before the app is
          published.
        </div>
        <article className="space-y-4 text-[16px] leading-relaxed [&_a]:text-signal [&_a]:underline [&_h2]:mt-10 [&_h2]:text-[22px] [&_h2]:font-bold [&_h3]:mt-6 [&_h3]:text-[17px] [&_h3]:font-semibold [&_li]:mt-1.5 [&_ul]:list-disc [&_ul]:pl-6">
          {children}
        </article>
      </main>
      <footer className="border-t border-hairline px-4 py-6 text-center text-[14px] text-text-muted">
        <Link href="/privacy" className="underline">
          Privacy policy
        </Link>
        {' · '}
        <Link href="/terms" className="underline">
          Terms
        </Link>
        {' · '}
        <Link href="/" className="underline">
          Home
        </Link>
      </footer>
    </div>
  );
}
