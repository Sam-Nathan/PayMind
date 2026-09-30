/**
 * Pure builders for RPC payloads. All money maths comes from @paymind/core; inputs are validated
 * with the shared zod schemas before anything is sent, and the result is mapped to the snake_case
 * contract in docs/schema.md.
 */
import {
  CreateExpenseInputSchema,
  CreateSpaceInputSchema,
  formatINR,
  rupeesToPaise,
  splitEqual,
  splitFixed,
  splitWeights,
  type Shares,
  type SpaceType,
} from '@paymind/core';
import { ValidationError } from './errors.ts';
import type { PaidVia, SplitMethod } from './types.ts';

// ---------------------------------------------------------------------------
// Splits

export type SplitInput =
  | { method: 'equal'; memberIds: string[] }
  /** weights are percentages (or any ratio) per member id */
  | { method: 'ratio'; weights: Record<string, number> }
  /** weights are whole shares/units per member id (e.g. 2 adults, 1 child) */
  | { method: 'shares'; weights: Record<string, number> }
  /** amounts in paise per member id; must add up to the total */
  | { method: 'fixed'; amounts: Record<string, number> };

export const SPLIT_METHOD_LABELS: Record<SplitMethod, string> = {
  equal: 'Equal',
  ratio: 'Ratio %',
  fixed: 'Fixed ₹',
  shares: 'Shares',
};

/** Person-by-person owed amounts in paise, summing exactly to `totalMinor`. */
export function computeShares(totalMinor: number, split: SplitInput): Shares {
  try {
    switch (split.method) {
      case 'equal':
        if (split.memberIds.length === 0) throw new ValidationError('Pick at least one person to split with.');
        return splitEqual(totalMinor, split.memberIds);
      case 'ratio':
      case 'shares': {
        const weights: Record<string, number> = {};
        for (const [id, w] of Object.entries(split.weights)) if (w > 0) weights[id] = w;
        if (Object.keys(weights).length === 0) {
          throw new ValidationError(
            split.method === 'ratio' ? 'Enter a percentage for at least one person.' : 'Give at least one person a share.',
          );
        }
        return splitWeights(totalMinor, weights);
      }
      case 'fixed': {
        const amounts: Record<string, number> = {};
        for (const [id, a] of Object.entries(split.amounts)) if (a > 0) amounts[id] = a;
        const sum = Object.values(amounts).reduce((a, b) => a + b, 0);
        if (Object.keys(amounts).length === 0) throw new ValidationError('Enter an amount for at least one person.');
        if (sum !== totalMinor) {
          const diff = totalMinor - sum;
          throw new ValidationError(
            diff > 0
              ? `${formatINR(diff, { decimals: 2 })} is still left to assign.`
              : `Amounts are ${formatINR(-diff, { decimals: 2 })} over the total.`,
          );
        }
        return splitFixed(totalMinor, amounts);
      }
    }
  } catch (e) {
    if (e instanceof ValidationError) throw e;
    throw new ValidationError(e instanceof Error ? e.message : 'Could not work out the split.');
  }
}

// ---------------------------------------------------------------------------
// Input parsing

/** "1,240.50", "₹500" -> paise; null when empty/invalid/non-positive. */
export function parseAmountInput(text: string): number | null {
  if (!text.trim()) return null;
  try {
    const v = rupeesToPaise(text);
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date in YYYY-MM-DD form. */
export function isIsoDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// ---------------------------------------------------------------------------
// create_expense

export interface ExpenseDraft {
  /** null = personal */
  spaceId: string | null;
  title: string;
  totalMinor: number;
  categoryId: string | null;
  /** space_members.id of the payer; required for shared expenses */
  paidByMember: string | null;
  paidVia: PaidVia;
  /** ISO datetime with offset (e.g. from Date#toISOString) */
  occurredAt: string;
  split: SplitInput | null;
  note?: string | null;
  source?: 'manual' | 'voice' | 'text' | 'scan';
}

/** core's schema requires a payer uuid even for personal expenses; the DB forbids sending one. */
const PERSONAL_PAYER_PLACEHOLDER = '00000000-0000-4000-8000-000000000000';

export interface CreateExpensePayload {
  space_id: string | null;
  title: string;
  total_minor: number;
  occurred_at: string;
  paid_via: PaidVia;
  source: string;
  status: 'confirmed';
  category_id?: string;
  paid_by_member?: string;
  note?: string;
  shares?: { member_id: string; owed_minor: number }[];
}

function issueMessage(e: unknown): string {
  const issues = (e as { issues?: { message?: string }[] }).issues;
  return issues?.[0]?.message ?? (e instanceof Error ? e.message : 'Invalid expense.');
}

export function buildCreateExpensePayload(draft: ExpenseDraft): CreateExpensePayload {
  const title = draft.title.trim();
  if (!title) throw new ValidationError('Add a merchant or short description.');
  if (!Number.isSafeInteger(draft.totalMinor) || draft.totalMinor <= 0) {
    throw new ValidationError('Enter an amount greater than zero.');
  }
  const shared = draft.spaceId !== null;
  if (shared && !draft.paidByMember) throw new ValidationError('Choose who paid.');
  if (shared && !draft.split) throw new ValidationError('Choose how to split this expense.');

  const shares = shared && draft.split ? computeShares(draft.totalMinor, draft.split) : {};
  const memberShares = Object.entries(shares)
    .filter(([, owed]) => owed > 0)
    .map(([memberId, owedMinor]) => ({ memberId, owedMinor }));

  const source = draft.source ?? 'manual';
  let parsed;
  try {
    parsed = CreateExpenseInputSchema.parse({
      spaceId: draft.spaceId,
      merchantName: title,
      categoryId: draft.categoryId,
      totalMinor: draft.totalMinor,
      currency: 'INR',
      paidByMember: draft.paidByMember ?? PERSONAL_PAYER_PLACEHOLDER,
      paidVia: draft.paidVia,
      occurredAt: draft.occurredAt,
      source,
      visibility: shared ? 'shared' : 'personal',
      notePrivate: draft.note?.trim() || null,
      memberShares,
    });
  } catch (e) {
    throw new ValidationError(issueMessage(e));
  }

  const payload: CreateExpensePayload = {
    space_id: parsed.spaceId,
    title,
    total_minor: parsed.totalMinor,
    occurred_at: parsed.occurredAt,
    paid_via: parsed.paidVia,
    source: parsed.source,
    status: 'confirmed',
  };
  if (parsed.categoryId) payload.category_id = parsed.categoryId;
  if (parsed.notePrivate) payload.note = parsed.notePrivate;
  if (shared) {
    payload.paid_by_member = parsed.paidByMember;
    payload.shares = parsed.memberShares.map((s) => ({ member_id: s.memberId, owed_minor: s.owedMinor }));
  }
  return payload;
}

// ---------------------------------------------------------------------------
// create_space

export interface SpaceMemberDraft {
  displayName: string;
  upiVpa?: string | null;
}

export interface SpaceDraft {
  type: SpaceType;
  name: string;
  startsOn?: string | null;
  endsOn?: string | null;
  budgetMinor?: number | null;
  members: SpaceMemberDraft[];
}

export interface CreateSpaceArgs {
  p_name: string;
  p_type: SpaceType;
  p_starts_on?: string;
  p_ends_on?: string;
  p_budget_minor?: number;
  p_members: { display_name: string; upi_vpa?: string }[];
}

export function buildCreateSpaceArgs(draft: SpaceDraft): CreateSpaceArgs {
  const name = draft.name.trim();
  if (!name) throw new ValidationError('Give the space a name.');
  const members = draft.members
    .map((m) => ({ displayName: m.displayName.trim(), upiVpa: m.upiVpa?.trim() || null }))
    .filter((m) => m.displayName.length > 0);

  let parsed;
  try {
    parsed = CreateSpaceInputSchema.parse({
      type: draft.type,
      name,
      startsOn: draft.startsOn || null,
      endsOn: draft.endsOn || null,
      budgetMinor: draft.budgetMinor ?? null,
      members: members.map((m) => ({ displayName: m.displayName, upiVpa: m.upiVpa })),
    });
  } catch (e) {
    const msg = issueMessage(e);
    throw new ValidationError(msg.includes('endsOn') ? 'The end date is before the start date.' : msg);
  }

  const args: CreateSpaceArgs = {
    p_name: parsed.name,
    p_type: parsed.type,
    p_members: parsed.members.map((m) => ({
      display_name: m.displayName,
      ...(m.upiVpa ? { upi_vpa: m.upiVpa } : {}),
    })),
  };
  if (parsed.startsOn) args.p_starts_on = parsed.startsOn;
  if (parsed.endsOn) args.p_ends_on = parsed.endsOn;
  if (parsed.budgetMinor !== null && parsed.budgetMinor !== undefined && parsed.budgetMinor > 0) {
    args.p_budget_minor = parsed.budgetMinor;
  }
  return args;
}
