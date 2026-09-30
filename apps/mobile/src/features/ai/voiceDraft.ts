/**
 * Voice / text / assistant expense draft: the editable field grid behind "Here's what I heard".
 * Pure mapping from the Edge Function proposals to a draft, the split to send, and the plain
 * sentence that explains who owes whom (all amounts through @paymind/core).
 */
import { formatINR, type ExpenseParseResult } from '@paymind/core';
import { isIsoDate, type SplitInput } from '../../data/payloads.ts';
import type { PaidVia } from '../../data/types.ts';
import { toIsoDate } from '../../data/dates.ts';
import type { ExpenseResolution } from '../../data/ai.ts';

export interface AmbiguousPerson {
  spoken: string;
  candidates: { memberId: string; displayName: string; spaceId: string; spaceName: string }[];
}

export type VoiceSplitMode = 'equal' | 'ratio' | 'fixed';

export interface VoiceDraft {
  amountMinor: number | null;
  merchant: string;
  /** system category slug */
  categorySlug: string | null;
  /** YYYY-MM-DD */
  date: string;
  spaceId: string | null;
  /** the other people on the expense (space_members ids) */
  withIds: string[];
  /** names that matched nobody in your spaces */
  unresolved: string[];
  ambiguous: AmbiguousPerson[];
  /** space_members id of the payer; null = you */
  paidById: string | null;
  paidVia: PaidVia;
  splitMode: VoiceSplitMode;
  /** weights by member id, only for splitMode ratio */
  ratio: Record<string, number>;
  /** paise by member id, only for splitMode fixed */
  fixed: Record<string, number>;
  note: string;
  /** fields the model guessed (clay outline + reason) */
  guessed: { note?: string; category?: string };
}

export function blankVoiceDraft(today: string = toIsoDate(new Date())): VoiceDraft {
  return {
    amountMinor: null,
    merchant: '',
    categorySlug: null,
    date: today,
    spaceId: null,
    withIds: [],
    unresolved: [],
    ambiguous: [],
    paidById: null,
    paidVia: 'upi',
    splitMode: 'equal',
    ratio: {},
    fixed: {},
    note: '',
    guessed: {},
  };
}

const isMe = (s: string) => /^(me|i|myself|you)$/i.test(s.trim());

export function voiceDraftFromParse(
  expense: ExpenseParseResult,
  resolution: ExpenseResolution,
  today: string = toIsoDate(new Date()),
): VoiceDraft {
  const bySpoken = new Map<string, string>();
  const withIds: string[] = [];
  const unresolved: string[] = [];
  const ambiguous: AmbiguousPerson[] = [];
  for (const p of resolution.people) {
    if (p.memberId && !p.ambiguous) {
      bySpoken.set(p.spoken.toLowerCase(), p.memberId);
      if (!withIds.includes(p.memberId)) withIds.push(p.memberId);
    } else if (p.ambiguous && p.candidates.length > 0) {
      ambiguous.push({ spoken: p.spoken, candidates: p.candidates });
    } else {
      unresolved.push(p.spoken);
    }
  }
  const memberFor = (name: string): string | null => {
    if (isMe(name)) return resolution.meMemberId;
    return bySpoken.get(name.trim().toLowerCase()) ?? null;
  };

  const spaceId = resolution.spaceId ?? resolution.people.find((p) => p.memberId && p.spaceId)?.spaceId ?? null;

  let splitMode: VoiceSplitMode = 'equal';
  const ratio: Record<string, number> = {};
  const fixed: Record<string, number> = {};
  const s = expense.split;
  if (s.type === 'ratio') {
    for (const [name, w] of Object.entries(s.ratio)) {
      const id = memberFor(name);
      if (id && w > 0) ratio[id] = w;
    }
    if (Object.keys(ratio).length >= 2) splitMode = 'ratio';
  } else if (s.type === 'fixed') {
    for (const [name, amt] of Object.entries(s.amounts)) {
      const id = memberFor(name);
      if (id && amt > 0) fixed[id] = amt;
    }
    if (Object.keys(fixed).length >= 1) splitMode = 'fixed';
  }

  const payer = expense.paidBy && !isMe(expense.paidBy) ? memberFor(expense.paidBy) : null;
  const note = expense.note?.trim() ?? '';
  return {
    amountMinor: expense.amountMinor,
    merchant: expense.merchant?.trim() ?? '',
    categorySlug: expense.category,
    date: expense.date && isIsoDate(expense.date) ? expense.date : today,
    spaceId,
    withIds,
    unresolved,
    ambiguous,
    paidById: payer,
    paidVia: expense.paidVia ?? 'upi',
    splitMode,
    ratio,
    fixed,
    note,
    guessed: note ? { note: 'Guessed from what you said' } : {},
  };
}

/** The assistant's create_expense proposal payload (supabase/functions/README.md). */
export interface AssistantExpense {
  amountMinor: number;
  merchant?: string | null;
  category?: string | null;
  date?: string | null;
  spaceId?: string | null;
  paidByMemberId?: string | null;
  paidVia?: PaidVia | null;
  splitWithMemberIds?: string[] | null;
  note?: string | null;
}

export function voiceDraftFromAssistant(e: AssistantExpense, meId: string | null, today: string = toIsoDate(new Date())): VoiceDraft {
  const base = blankVoiceDraft(today);
  const withIds = (e.splitWithMemberIds ?? []).filter((id) => id !== meId);
  return {
    ...base,
    amountMinor: e.amountMinor,
    merchant: e.merchant?.trim() ?? '',
    categorySlug: e.category ?? null,
    date: e.date && isIsoDate(e.date) ? e.date : today,
    spaceId: e.spaceId ?? null,
    withIds,
    paidById: e.paidByMemberId && e.paidByMemberId !== meId ? e.paidByMemberId : null,
    paidVia: e.paidVia ?? 'upi',
    note: e.note?.trim() ?? '',
  };
}

/** The split to send to create_expense, or null for a personal expense. */
export function buildVoiceSplit(d: VoiceDraft, meId: string | null): SplitInput | null {
  if (!d.spaceId || !meId) return null;
  const people = Array.from(new Set([meId, ...d.withIds, ...(d.paidById ? [d.paidById] : [])]));
  if (people.length < 2) return null;
  if (d.splitMode === 'ratio') {
    const weights: Record<string, number> = {};
    for (const id of people) if ((d.ratio[id] ?? 0) > 0) weights[id] = d.ratio[id] as number;
    if (Object.keys(weights).length > 0) return { method: 'ratio', weights };
  }
  if (d.splitMode === 'fixed') {
    const amounts: Record<string, number> = {};
    let sum = 0;
    for (const id of people) {
      if ((d.fixed[id] ?? 0) > 0) {
        amounts[id] = d.fixed[id] as number;
        sum += d.fixed[id] as number;
      }
    }
    // The spoken amounts are what others owe; the payer keeps the remainder.
    const total = d.amountMinor ?? 0;
    const payerId = d.paidById ?? meId;
    if (sum < total && !(payerId in amounts)) amounts[payerId] = total - sum;
    else if (sum < total) amounts[payerId] = (amounts[payerId] as number) + (total - sum);
    return { method: 'fixed', amounts };
  }
  return { method: 'equal', memberIds: people };
}

// ---------------------------------------------------------------------------
// Explanation line

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const money = (paise: number) => formatINR(paise, { decimals: 'auto' });

/**
 * "Neel will owe you ₹150 in Flat 402." / "Rahul and Priya will each owe you ₹283.33 in Friends."
 * `shares` = what each person's share of the expense is, in paise (from core).
 */
export function explainOwes(args: {
  shares: Record<string, number>;
  payerId: string;
  meId: string;
  nameOf: (memberId: string) => string;
  spaceName: string | null;
}): string | null {
  const { shares, payerId, meId, nameOf, spaceName } = args;
  const where = spaceName ? ` in ${spaceName}` : '';
  if (payerId === meId) {
    const owing = Object.entries(shares).filter(([id, v]) => id !== meId && v > 0);
    if (owing.length === 0) return null;
    if (owing.length === 1) {
      const [id, v] = owing[0] as [string, number];
      return `${nameOf(id)} will owe you ${money(v)}${where}.`;
    }
    const amounts = new Set(owing.map(([, v]) => v));
    if (amounts.size === 1) {
      return `${joinNames(owing.map(([id]) => nameOf(id)))} will each owe you ${money(owing[0]?.[1] as number)}${where}.`;
    }
    return `${joinNames(owing.map(([id, v]) => `${nameOf(id)} ${money(v)}`))} will owe you${where}.`;
  }
  const mine = shares[meId] ?? 0;
  if (mine <= 0) return null;
  return `You'll owe ${nameOf(payerId)} ${money(mine)}${where}.`;
}
