/**
 * Turns an assistant `create_expense` proposal (supabase/functions/README.md) into the fields shown
 * on the ProposalCard and the draft that useCreateExpense saves. Money maths via core/payloads.
 */
import { addDays, isoDateToDateTime, shortDate, toIsoDate } from '../../data/dates.ts';
import { computeShares, isIsoDate, type ExpenseDraft, type SplitInput } from '../../data/payloads.ts';
import { friendlyError } from '../../data/errors.ts';
import type { Category, SpaceMember } from '../../data/types.ts';
import { formatINR } from '@paymind/core';
import { PAID_VIA_LABEL } from './format.ts';
import { explainOwes, type AssistantExpense } from './voiceDraft.ts';

const money = (paise: number) => formatINR(paise, { decimals: 'auto' });

export interface ProposalView {
  title: string;
  fields: { label: string; value: string }[];
  summary: string | null;
  problem: string | null;
  /** null when the proposal can't be saved as it stands */
  draft: ExpenseDraft | null;
  /** short "Done — added ₹850 · Friends" text for after Confirm */
  doneText: string;
}

export function describeExpenseProposal(
  e: AssistantExpense,
  ctx: {
    members: readonly SpaceMember[];
    meId: string | null;
    spaceName: string | null;
    categories: readonly Category[];
    now?: Date;
  },
): ProposalView {
  const now = ctx.now ?? new Date();
  const active = ctx.members.filter((m) => !m.leftAt);
  const nameOf = (id: string) => (id === ctx.meId ? 'You' : (active.find((m) => m.id === id)?.displayName ?? 'Someone'));

  const date = e.date && isIsoDate(e.date) ? e.date : toIsoDate(now);
  const dateLabel =
    date === toIsoDate(now) ? `Today, ${shortDate(date)}` : date === toIsoDate(addDays(now, -1)) ? `Yesterday, ${shortDate(date)}` : shortDate(date);

  const cat = e.category
    ? (ctx.categories.find((c) => c.slug === e.category) ?? ctx.categories.find((c) => c.name.toLowerCase() === e.category?.toLowerCase()))
    : undefined;
  const parent = cat?.parentId ? ctx.categories.find((c) => c.id === cat.parentId) : undefined;
  const categoryLabel = cat ? (parent ? `${parent.name} · ${cat.name}` : cat.name) : (e.category ?? 'Other');

  const payerId = e.paidByMemberId ?? ctx.meId;
  const people = e.spaceId && ctx.meId && payerId ? Array.from(new Set([ctx.meId, payerId, ...(e.splitWithMemberIds ?? [])])) : [];
  const split: SplitInput | null = people.length >= 2 ? { method: 'equal', memberIds: people } : null;

  let shares: Record<string, number> | null = null;
  let problem: string | null = null;
  if (split) {
    try {
      shares = computeShares(e.amountMinor, split);
    } catch (err) {
      problem = friendlyError(err);
    }
  }

  const fields: { label: string; value: string }[] = [
    { label: 'Amount', value: money(e.amountMinor) },
    { label: 'Category', value: categoryLabel },
    { label: 'Date', value: dateLabel },
    { label: 'Paid by', value: `${payerId ? nameOf(payerId) : 'You'} · ${PAID_VIA_LABEL[e.paidVia ?? 'upi'] ?? 'UPI'}` },
  ];
  if (split && shares) {
    fields.push({ label: 'Split', value: `Equally · ${people.length}` });
    const owing = Object.entries(shares).filter(([id]) => id !== payerId);
    const first = owing[0]?.[1];
    if (first !== undefined) fields.push({ label: 'Each owes', value: money(first) });
  } else {
    fields.push({ label: 'Split', value: 'Not split' });
  }
  if (e.merchant) fields.unshift({ label: 'Merchant', value: e.merchant });

  const summary =
    split && shares && ctx.meId && payerId
      ? explainOwes({ shares, payerId, meId: ctx.meId, nameOf, spaceName: ctx.spaceName })
      : e.spaceId
        ? null
        : 'Saved as your own expense.';

  const draft: ExpenseDraft | null =
    problem || (e.spaceId && !ctx.meId)
      ? null
      : {
          spaceId: split ? (e.spaceId ?? null) : null,
          title: e.merchant?.trim() || cat?.name || 'Expense',
          totalMinor: e.amountMinor,
          categoryId: cat?.id ?? null,
          paidByMember: split ? payerId : null,
          paidVia: e.paidVia ?? 'upi',
          occurredAt: isoDateToDateTime(date, now),
          split,
          note: e.note ?? null,
          source: 'text',
        };

  return {
    title: split ? 'Create expense + split' : 'Create expense',
    fields,
    summary,
    problem,
    draft,
    doneText: `Done — added ${money(e.amountMinor)}${split && ctx.spaceName ? ` · ${ctx.spaceName}` : ''}`,
  };
}

export interface ReminderPayload {
  memberId: string;
  memberName: string;
  spaceId: string;
  tone: 'friendly' | 'neutral' | 'firm';
  repeat: 'once' | 'every_3_days' | 'weekly';
}

const REPEAT_LABEL: Record<ReminderPayload['repeat'], string> = {
  once: 'Once',
  every_3_days: 'Every 3 days',
  weekly: 'Weekly',
};

export function describeReminderProposal(p: ReminderPayload, spaceName: string | null): { title: string; fields: { label: string; value: string }[]; summary: string } {
  const tone = p.tone.charAt(0).toUpperCase() + p.tone.slice(1);
  return {
    title: 'Send reminder',
    fields: [
      { label: 'Person', value: p.memberName },
      { label: 'Tone', value: tone },
      { label: 'Repeat', value: REPEAT_LABEL[p.repeat] ?? p.repeat },
      ...(spaceName ? [{ label: 'Space', value: spaceName }] : []),
    ],
    summary: `${p.memberName} gets a ${p.tone} nudge with a UPI link for what they owe you.`,
  };
}
