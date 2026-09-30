import { formatINR } from '@paymind/core';

/** ₹1,166 (whole rupees, for summaries). */
export const inr0 = (paise: number) => formatINR(paise, { decimals: 0 });
/** ₹2,091.00 (two decimals, for bill/split/settlement maths). */
export const inr2 = (paise: number) => formatINR(paise, { decimals: 2 });

const TZ = 'Asia/Kolkata';

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: TZ,
  });
}

export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const key = (x: Date) => x.toLocaleDateString('en-CA', { timeZone: TZ });
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  const dm = d
    .toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: TZ })
    .toUpperCase();
  if (key(d) === key(today)) return `TODAY · ${dm}`;
  if (key(d) === key(yesterday)) return `YESTERDAY · ${dm}`;
  return dm;
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: TZ,
  });
}

export function firstName(name: string | null | undefined, email?: string | null): string {
  const n = (name ?? '').trim();
  if (n) return n.split(/\s+/)[0] as string;
  if (email) return (email.split('@')[0] as string).replace(/[^a-zA-Z]/g, '') || 'there';
  return 'there';
}

/** Days left in the current month, counting today (IST). */
export function daysLeftInMonth(now = new Date()): {
  daysLeft: number;
  day: number;
  daysInMonth: number;
} {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const year = get('year');
  const month = get('month');
  const day = get('day');
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { daysLeft: daysInMonth - day + 1, day, daysInMonth };
}

export function monthShort(now = new Date()): string {
  return now.toLocaleDateString('en-US', { month: 'short', timeZone: TZ }).toUpperCase();
}

const AVATAR_COLORS = ['bg-slate', 'bg-rust', 'bg-plum', 'bg-oxblood'] as const;

/** "You" is always signal; others by a stable hash of their id. */
export function avatarClass(id: string, isYou: boolean): string {
  if (isYou) return 'bg-signal';
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length] as string;
}

export function errMsg(e: unknown): string {
  const m =
    e instanceof Error
      ? e.message
      : typeof e === 'string'
        ? e
        : (e as { message?: string } | null)?.message;
  return m ?? 'Something went wrong';
}

/** Turn a Postgres error like "shares_sum_mismatch: ..." into friendly text. */
export function friendlyDbError(message: string): string {
  const code = message.split(':')[0]?.trim() ?? '';
  const map: Record<string, string> = {
    not_authenticated: 'Please sign in again.',
    not_space_member: 'You are not a member of this space.',
    not_a_settlement_party: 'Only the people involved (or a space owner) can record this.',
    shares_sum_mismatch: "The split doesn't add up to the total.",
    invalid_total: 'Enter an amount greater than zero.',
    invalid_amount: 'Enter a valid amount.',
    payer_not_in_space: 'The payer must be a member of this space.',
    illegal_settlement_transition: 'That payment cannot move to that state.',
    member_display_name_required: 'Every member needs a name.',
  };
  return map[code] ?? message;
}
