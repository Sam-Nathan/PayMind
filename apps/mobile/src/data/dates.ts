/** Small local-time date helpers (no libs). Dates are plain "YYYY-MM-DD" strings in the user's zone. */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');

export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/** Days from today to the end of the month, counting today (day 14 of 31 -> 18). */
export function daysLeftInMonth(now: Date): number {
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return last - now.getDate() + 1;
}

export function monthStartIso(now: Date): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
}

export function monthEndIso(now: Date): string {
  return toIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
}

export function monthShort(now: Date): string {
  return MONTHS[now.getMonth()] as string;
}

/** ["18","OCT"] from "2026-10-18". */
export function dayAndMonth(iso: string): { day: string; month: string } {
  const [, m, d] = iso.split('-');
  return { day: String(Number(d)), month: (MONTHS[Number(m) - 1] ?? '').toUpperCase() };
}

/** "13 Oct" */
export function shortDate(iso: string): string {
  const { day, month } = dayAndMonth(iso.slice(0, 10));
  return `${day} ${month.charAt(0)}${month.slice(1).toLowerCase()}`;
}

/** "2–6 Oct" / "28 Oct – 2 Nov" */
export function dateRange(startIso: string | null, endIso: string | null): string | null {
  if (!startIso && !endIso) return null;
  if (startIso && !endIso) return shortDate(startIso);
  if (!startIso && endIso) return shortDate(endIso);
  const s = shortDate(startIso as string).split(' ');
  const e = shortDate(endIso as string).split(' ');
  if (startIso === endIso) return shortDate(startIso as string);
  if (s[1] === e[1]) return `${s[0]}–${e[0]} ${e[1]}`;
  return `${s.join(' ')} – ${e.join(' ')}`;
}

/** ISO datetime (with offset) for a YYYY-MM-DD picked by the user: now if today, else local noon. */
export function isoDateToDateTime(iso: string, now: Date = new Date()): string {
  if (iso === toIsoDate(now)) return now.toISOString();
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, 12, 0, 0).toISOString();
}

/** "Today", "Yesterday" or "13 Oct". */
export function relativeDay(isoOrDateTime: string, now: Date = new Date()): string {
  const day = toIsoDate(new Date(isoOrDateTime));
  if (day === toIsoDate(now)) return 'Today';
  if (day === toIsoDate(addDays(now, -1))) return 'Yesterday';
  return shortDate(day);
}
