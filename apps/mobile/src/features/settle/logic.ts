/**
 * Pure settle-up logic (no React, no I/O) so it can be unit-tested.
 * Money is integer paise. The debt maths lives in @paymind/core; this file only groups its output
 * per person across spaces and builds the texts the screens show.
 */
import {
  canTransition,
  formatINR,
  summariseStanding,
  type SettlementStatus,
  type UpiAppId,
  upiAppTargets,
} from '@paymind/core';

export interface BalanceLike {
  spaceId: string;
  memberId: string;
  userId: string | null;
  displayName: string;
  leftAt?: string | null;
  netMinor: number;
}

export interface MemberLike {
  id: string;
  spaceId: string;
  userId: string | null;
  displayName: string;
  upiVpa: string | null;
}

/** One simplified transfer between me and someone else in one space. */
export interface PayItem {
  spaceId: string;
  spaceName: string;
  /** space_members.id of the payer */
  fromMember: string;
  /** space_members.id of the payee */
  toMember: string;
  amountMinor: number;
}

export interface PersonPlan {
  key: string;
  name: string;
  userId: string | null;
  amountMinor: number;
  items: PayItem[];
  vpa: string | null;
  spaceNames: string[];
}

export interface SimplifiedTransfer {
  fromName: string;
  toName: string;
  fromMe: boolean;
  toMe: boolean;
  amountMinor: number;
}

export interface SpaceCardData {
  spaceId: string;
  name: string;
  transfers: SimplifiedTransfer[];
  /** unsimplified debts (one per expense share owed to another member) */
  ious: number;
  people: number;
  payments: number;
}

export interface SettlePlan {
  youOweMinor: number;
  owedToYouMinor: number;
  pays: PersonPlan[];
  gets: PersonPlan[];
  spaces: SpaceCardData[];
  spacesOwedCount: number;
}

export function personKey(userId: string | null, displayName: string): string {
  return userId ?? `name:${displayName.trim().toLowerCase()}`;
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

export interface PlanInput {
  balances: readonly BalanceLike[];
  members?: readonly MemberLike[];
  spaceNames?: ReadonlyMap<string, string>;
  iousBySpace?: ReadonlyMap<string, number>;
  uid: string | null | undefined;
  /** only this space */
  spaceId?: string | undefined;
}

/**
 * "You pay" / "You get back" grouped per person across spaces, plus the per-space simplified cards.
 * Each person's amount is the sum of the space-level simplified transfers that involve me, so a pay
 * row for Karthik is exactly the set of IOUs that settling his rows would clear.
 */
export function buildSettlePlan(input: PlanInput): SettlePlan {
  const rows = input.spaceId ? input.balances.filter((b) => b.spaceId === input.spaceId) : input.balances;
  const spaceNames = input.spaceNames ?? new Map<string, string>();
  const st = summariseStanding(rows, input.uid);

  const vpaByKey = new Map<string, string>();
  for (const m of input.members ?? []) {
    const v = m.upiVpa?.trim();
    if (v) {
      const k = personKey(m.userId, m.displayName);
      if (!vpaByKey.has(k)) vpaByKey.set(k, v);
    }
  }

  const byMember = new Map(rows.map((r) => [r.memberId, r]));
  const pays = new Map<string, PersonPlan>();
  const gets = new Map<string, PersonPlan>();
  const add = (map: Map<string, PersonPlan>, other: BalanceLike, item: PayItem) => {
    const key = personKey(other.userId, other.displayName);
    let p = map.get(key);
    if (!p) {
      p = {
        key,
        name: other.displayName,
        userId: other.userId,
        amountMinor: 0,
        items: [],
        vpa: vpaByKey.get(key) ?? null,
        spaceNames: [],
      };
      map.set(key, p);
    }
    p.amountMinor += item.amountMinor;
    p.items.push(item);
    if (!p.spaceNames.includes(item.spaceName)) p.spaceNames.push(item.spaceName);
  };

  const spaces: SpaceCardData[] = [];
  for (const [spaceId, s] of st.bySpace) {
    const spaceName = spaceNames.get(spaceId) ?? 'Shared expenses';
    const spaceRows = rows.filter((r) => r.spaceId === spaceId);
    const cardTransfers: SimplifiedTransfer[] = [];
    for (const t of s.transfers) {
      const from = byMember.get(t.from);
      const to = byMember.get(t.to);
      if (!from || !to) continue;
      const fromMe = t.from === s.myMemberId;
      const toMe = t.to === s.myMemberId;
      cardTransfers.push({
        fromName: fromMe ? 'You' : from.displayName,
        toName: toMe ? 'You' : to.displayName,
        fromMe,
        toMe,
        amountMinor: t.amountMinor,
      });
      const item: PayItem = { spaceId, spaceName, fromMember: t.from, toMember: t.to, amountMinor: t.amountMinor };
      if (fromMe) add(pays, to, item);
      else if (toMe) add(gets, from, item);
    }
    if (cardTransfers.length > 0) {
      const activeMembers = spaceRows.filter((r) => !r.leftAt || r.netMinor !== 0).length;
      spaces.push({
        spaceId,
        name: spaceName,
        transfers: cardTransfers,
        ious: Math.max(input.iousBySpace?.get(spaceId) ?? 0, cardTransfers.length),
        people: activeMembers,
        payments: cardTransfers.length,
      });
    }
  }

  const sorted = (m: Map<string, PersonPlan>) => [...m.values()].sort((a, b) => b.amountMinor - a.amountMinor);
  return {
    youOweMinor: st.youOweMinor,
    owedToYouMinor: st.owedToYouMinor,
    pays: sorted(pays),
    gets: sorted(gets),
    spaces,
    spacesOwedCount: st.spacesOwedCount,
  };
}

/** Number of unsimplified IOUs: every share someone owes to a different member who paid the bill. */
export function countIous(
  expenses: readonly { paidBy: string | null; shares: readonly { memberId: string; owedMinor: number }[] }[],
): number {
  let n = 0;
  for (const e of expenses) {
    if (!e.paidBy) continue;
    for (const s of e.shares) if (s.memberId !== e.paidBy && s.owedMinor > 0) n += 1;
  }
  return n;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

// ---------------------------------------------------------------------------
// Pay-link reference (note_ref)

const MONTHS_UPPER = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** The "402" of "Flat 402", else up to 3 letters/digits of the name ("Goa Trip" -> "GOA"). */
export function spaceToken(spaceName: string): string {
  const digits = /\d{1,4}/.exec(spaceName)?.[0];
  if (digits) return digits;
  const letters = spaceName.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return letters.slice(0, 3) || 'PAY';
}

/** "PM-402-SEP": deterministic from the space and the month of `date`. */
export function noteRefFor(spaceName: string, date: Date): string {
  return `PM-${spaceToken(spaceName)}-${MONTHS_UPPER[date.getMonth()]}`;
}

/** The text that travels with the payment: "PM-402-SEP · electricity + groceries". */
export function defaultNote(ref: string, label: string): string {
  return label.trim() ? `${ref} · ${label.trim()}` : ref;
}

// ---------------------------------------------------------------------------
// Pay draft <-> route param

export interface DraftItem {
  spaceId: string;
  spaceName: string;
  fromMember: string;
  toMember: string;
  amountMinor: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: unknown): s is string => typeof s === 'string' && UUID.test(s);

export function encodeDraft(items: readonly DraftItem[]): string {
  return JSON.stringify(
    items.map((i) => [i.spaceId, i.spaceName, i.fromMember, i.toMember, i.amountMinor] as const),
  );
}

/** Returns [] for anything that isn't a well-formed draft (route params are user-controlled). */
export function decodeDraft(raw: string | undefined): DraftItem[] {
  if (!raw) return [];
  try {
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length === 0 || arr.length > 10) return [];
    const out: DraftItem[] = [];
    for (const row of arr) {
      if (!Array.isArray(row) || row.length !== 5) return [];
      const [spaceId, spaceName, fromMember, toMember, amountMinor] = row as unknown[];
      if (!isUuid(spaceId) || !isUuid(fromMember) || !isUuid(toMember)) return [];
      if (typeof spaceName !== 'string' || typeof amountMinor !== 'number') return [];
      if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return [];
      out.push({ spaceId, spaceName: spaceName.slice(0, 80), fromMember, toMember, amountMinor });
    }
    return out;
  } catch {
    return [];
  }
}

export const sumItems = (items: readonly { amountMinor: number }[]): number =>
  items.reduce((a, i) => a + i.amountMinor, 0);

// ---------------------------------------------------------------------------
// UPI apps

export interface UpiTile {
  id: UpiAppId | 'other';
  name: string;
  /** two-letter logo label */
  short: string;
}

const SHORT: Record<UpiAppId, string> = { phonepe: 'Pe', gpay: 'G', paytm: 'Pt', bhim: 'B' };

/**
 * Installed apps (from the Android package query) mapped onto the known targets, or the static
 * list when nothing could be detected (Expo Go, iOS), always followed by "Other UPI app".
 * `detected` = whether the platform could tell us which apps are installed.
 */
export function upiTiles(installedPackages: readonly string[]): { tiles: UpiTile[]; detected: boolean } {
  const known = upiAppTargets.filter((a) => installedPackages.includes(a.androidPackage));
  const detected = installedPackages.length > 0;
  const base = detected ? known : upiAppTargets;
  const tiles: UpiTile[] = base.map((a) => ({ id: a.id, name: a.name, short: SHORT[a.id] }));
  tiles.push({ id: 'other', name: 'Other UPI app', short: '…' });
  return { tiles, detected };
}

// ---------------------------------------------------------------------------
// Verify

export type VerifyAnswer = 'completed' | 'pending' | 'failed';

export interface AnswerState {
  /** the status the RPC should move to (null = nothing to change) */
  target: SettlementStatus | null;
  allowed: boolean;
}

/**
 * Whether an answer on the Verify screen is a legal move from `current` according to core's
 * state machine. Answering with the status it already has is allowed (it only adds a UTR).
 */
export function answerState(current: SettlementStatus, answer: VerifyAnswer): AnswerState {
  if (current === answer) return { target: answer, allowed: true };
  return { target: answer, allowed: canTransition(current, answer) };
}

/** UPI app result -> the status to record (null when the app gave no definitive answer). */
export function statusFromUpiResult(result: string | undefined): VerifyAnswer | null {
  if (result === 'success') return 'completed';
  if (result === 'failure') return 'failed';
  if (result === 'submitted') return 'pending';
  return null;
}

export interface TimelineEvent {
  title: string;
  sub: string;
  /** true = unresolved (clay dot) */
  open?: boolean;
}

export function verifyTimeline(p: {
  status: SettlementStatus;
  amountMinor: number;
  vpa: string | null;
  noteRef: string | null;
  appName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
}): TimelineEvent[] {
  const t = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '';
  const events: TimelineEvent[] = [
    {
      title: 'Payment initiated',
      sub: `${formatINR(p.amountMinor, { decimals: 'auto' })}${p.vpa ? ` → ${p.vpa}` : ''}${p.createdAt ? ` · ${t(p.createdAt)}` : ''}`,
    },
  ];
  if (p.appName) {
    events.push({
      title: `Opened ${p.appName}`,
      sub: p.noteRef ? `Note ${p.noteRef} attached` : 'Payment details filled in',
    });
  }
  switch (p.status) {
    case 'initiated':
      events.push({ title: 'Not confirmed', sub: 'No result from the UPI app yet', open: true });
      break;
    case 'pending':
      events.push({ title: 'Still pending', sub: 'Marked pending. Check your UPI app again later', open: true });
      break;
    case 'completed':
    case 'confirmed_manual':
    case 'corrected':
      events.push({
        title: p.status === 'confirmed_manual' ? 'Marked as paid' : 'Payment completed',
        sub: t(p.completedAt ?? p.updatedAt),
      });
      break;
    case 'failed':
      events.push({ title: 'Payment failed', sub: 'It did not go through. You can try again', open: true });
      break;
    case 'cancelled':
      events.push({ title: 'Cancelled', sub: 'This payment was cancelled' });
      break;
  }
  return events;
}

// ---------------------------------------------------------------------------
// Reminders

export type ReminderTone = 'friendly' | 'neutral' | 'firm';
export type ReminderRepeat = 'once' | 'every_3_days' | 'weekly';

export const TONE_OPTIONS: readonly { value: ReminderTone; label: string }[] = [
  { value: 'friendly', label: 'Friendly' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'firm', label: 'Firm' },
];
export const REPEAT_OPTIONS: readonly { value: ReminderRepeat; label: string }[] = [
  { value: 'once', label: 'Just once' },
  { value: 'every_3_days', label: 'Every 3 days' },
  { value: 'weekly', label: 'Weekly' },
];

export interface ReminderLine {
  space: string;
  amountMinor: number;
}

/** What the pay-link URL looks like in the preview before the function has minted a token. */
export const PREVIEW_URL = 'paymind.vercel.app/pay/…';

/**
 * Mirrors `buildMessage` in supabase/functions/send-reminder/index.ts (keep the two in sync):
 * the preview on the Reminders screen shows what the function will produce.
 */
export function buildReminderMessage(
  tone: ReminderTone,
  name: string,
  lines: readonly ReminderLine[],
  url: string = PREVIEW_URL,
): string {
  const rupees = (m: number) => formatINR(m);
  const first = firstName(name);
  const total = lines.reduce((s, l) => s + l.amountMinor, 0);
  const bullets = lines.map((l) => `• ${l.space} — ${rupees(l.amountMinor)}`).join('\n');
  const n = lines.length;
  const only = lines[0]?.space ?? 'Shared expenses';
  if (tone === 'friendly') {
    const head =
      n === 1
        ? `Hey ${first}! Quick one — ${rupees(total)} is pending for ${only}.`
        : `Hey ${first}! Quick one — ${n} shared expenses add up to ${rupees(total)}:\n${bullets}`;
    return `${head}\nNo rush, whenever you get a sec\n${url}`;
  }
  if (tone === 'neutral') {
    const head =
      n === 1
        ? `Hi ${first}, you have a shared expense of ${rupees(total)} in ${only}.`
        : `Hi ${first}, you have ${n} shared expenses totalling ${rupees(total)}:\n${bullets}`;
    return `${head}\n${url}`;
  }
  const head = n === 1 ? `Reminder: ${rupees(total)} is pending for ${only}.` : `Reminder: ${rupees(total)} is pending:\n${bullets}`;
  return `${head}\nPlease settle it today.\n${url}`;
}

// ---------------------------------------------------------------------------
// History

export interface HistoryInput {
  status: SettlementStatus;
  amountMinor: number;
  correctedFromMinor: number | null;
  method: string | null;
  upiApp: string | null;
  note?: string | null;
}

const APP_NAMES: Record<string, string> = Object.fromEntries(upiAppTargets.map((a) => [a.id, a.name]));

export function methodLabel(method: string | null, upiApp: string | null): string | null {
  if (!method) return null;
  if (method === 'upi') {
    const app = upiApp ? (APP_NAMES[upiApp] ?? upiApp) : null;
    return app ? `UPI (${app})` : 'UPI';
  }
  if (method === 'bank') return 'bank transfer';
  return method;
}

/** Sub-line parts after the date and space: method, then "amount fixed" for corrections. */
export function historyDetail(h: HistoryInput): string[] {
  const parts: string[] = [];
  const m = methodLabel(h.method, h.upiApp);
  if (m) parts.push(m);
  if (h.status === 'corrected' || h.correctedFromMinor !== null) parts.push('amount fixed');
  return parts;
}

// ---------------------------------------------------------------------------
// Manual ("paid in cash") settlements

/**
 * Spread a payment of `amountMinor` over a person's per-space items, largest first, never more than
 * each item owes. Returns only the items that receive something; [] for an invalid amount.
 */
export function allocatePayment(items: readonly PayItem[], amountMinor: number): PayItem[] {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return [];
  let left = Math.min(amountMinor, sumItems(items));
  const out: PayItem[] = [];
  for (const it of [...items].sort((a, b) => b.amountMinor - a.amountMinor)) {
    if (left <= 0) break;
    const take = Math.min(it.amountMinor, left);
    out.push({ ...it, amountMinor: take });
    left -= take;
  }
  return out;
}
