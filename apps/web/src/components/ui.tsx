import Link from 'next/link';
import type { ReactNode } from 'react';
import { avatarClass } from '../lib/format';

export function ProgressBar({
  value,
  tone = 'signal',
  track = 'bg-sand',
}: {
  /** 0..1 (values above 1 are clamped visually) */
  value: number;
  tone?: 'signal' | 'slate' | 'clay' | 'oxblood';
  track?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const fill = { signal: 'bg-signal', slate: 'bg-slate', clay: 'bg-clay', oxblood: 'bg-oxblood' }[
    tone
  ];
  return (
    <div
      className={`h-2.5 w-full overflow-hidden rounded-full ${track}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Avatar({
  id,
  name,
  isYou = false,
  size = 40,
}: {
  id: string;
  name: string;
  isYou?: boolean;
  size?: number;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white ${avatarClass(id, isYou)}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      aria-hidden="true"
    >
      {(name.trim()[0] ?? '?').toUpperCase()}
    </span>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: { href: string; label: string };
}) {
  return (
    <div className="rounded-[24px] border border-dashed border-stone bg-white/60 p-6 text-center">
      <p className="text-[17px] font-semibold">{title}</p>
      {children ? <p className="mx-auto mt-1 max-w-sm text-[14px] text-text-muted">{children}</p> : null}
      {action ? (
        <Link href={action.href} className="btn-primary mt-4">
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

export function SectionHeader({
  title,
  link,
}: {
  title: string;
  link?: { href: string; label: string };
}) {
  return (
    <div className="mb-3 mt-8 flex items-baseline justify-between">
      <h2 className="text-[18px] font-semibold">{title}</h2>
      {link ? (
        <Link href={link.href} className="text-[14px] font-semibold text-signal">
          {link.label}
        </Link>
      ) : null}
    </div>
  );
}

/** Oxblood hero surface with dot texture and rounded bottom corners. */
export function Hero({
  children,
  className = '',
  tone = 'oxblood',
}: {
  children: ReactNode;
  className?: string;
  tone?: 'oxblood' | 'ink';
}) {
  return (
    <div
      className={`dots rounded-b-[40px] px-4 pb-10 pt-6 text-text-on-dark md:px-8 ${
        tone === 'ink' ? 'bg-ink' : 'bg-hero'
      } ${className}`}
    >
      <div className="mx-auto max-w-4xl">{children}</div>
    </div>
  );
}

/** Centred content column used by every /app page. */
export function Container({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-4xl px-4 md:px-8 ${className}`}>{children}</div>;
}

export function PageTitle({
  title,
  sub,
  right,
}: {
  title: string;
  sub?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-[28px] font-bold leading-tight">{title}</h1>
        {sub ? <p className="mt-0.5 text-[15px] text-text-muted">{sub}</p> : null}
      </div>
      {right}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-[14px] bg-blush px-3.5 py-2.5 text-[14px] font-medium text-signal">
      {children}
    </p>
  );
}

export function Disclosure() {
  return (
    <div className="flex gap-3 rounded-[22px] bg-mist p-4 text-[13.5px] leading-relaxed">
      <svg
        viewBox="0 0 24 24"
        width={22}
        height={22}
        className="mt-0.5 shrink-0 text-slate"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 3.5 5 6v5.5c0 4.2 2.9 7.5 7 9 4.1-1.5 7-4.8 7-9V6z" />
        <path d="m9 12 2.2 2.2L15.2 10" />
      </svg>
      <p>
        PayMind isn&apos;t a bank or a wallet and never holds your money. We open your UPI app with
        the payee, amount and note filled in. You approve with your UPI PIN there.
      </p>
    </div>
  );
}
