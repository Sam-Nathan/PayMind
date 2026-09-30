import { shortDate, toIsoDate } from '../../data/dates.ts';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Tue 13 Oct, 9:42 PM" */
export function billDateLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const time = `${((h + 11) % 12) + 1}:${m} ${h < 12 ? 'AM' : 'PM'}`;
  return `${DAYS[d.getDay()]} ${shortDate(toIsoDate(d))}, ${time}`;
}

/** "Rahul", "Rahul & Priya", "Rahul +2" */
export function namesLabel(names: readonly string[]): string {
  if (names.length === 0) return 'friends';
  if (names.length === 1) return names[0] as string;
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names[0]} +${names.length - 1}`;
}

export const PAID_VIA_LABEL: Record<string, string> = {
  upi: 'UPI',
  cash: 'Cash',
  card: 'Card',
  bank: 'Bank',
  wallet: 'Wallet',
  other: 'Other',
};
