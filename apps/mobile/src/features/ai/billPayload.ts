/**
 * create_expense payload for a scanned bill (docs/schema.md "create_expense payload"): items with
 * their kinds, and for shared bills the item shares and expense shares from core `splitItems`.
 * Validated with core's CreateExpenseInputSchema before it is mapped to the snake_case RPC shape.
 */
import { CreateExpenseInputSchema, type ItemSplitResult } from '@paymind/core';
import { ValidationError } from '../../data/errors.ts';
import { computeTotals, draftLines, type BillDraft } from './draft.ts';
import type { AssignMode, SplitState } from './split.ts';

/** core's schema wants a payer uuid even for personal expenses; the RPC forbids sending one. */
const PERSONAL_PAYER_PLACEHOLDER = '00000000-0000-4000-8000-000000000000';

export interface BillItemPayload {
  name: string;
  qty: number;
  unit_price_minor: number | null;
  amount_minor: number;
  kind: 'item' | 'discount' | 'service' | 'tax' | 'tip';
  shares?: { member_id: string; amount_minor: number; units?: number; pct?: number }[];
}

export interface BillExpensePayload {
  space_id: string | null;
  title: string;
  total_minor: number;
  occurred_at: string;
  paid_via: string;
  source: string;
  status: 'confirmed';
  category_id?: string;
  paid_by_member?: string;
  receipt_path?: string;
  proposal_id?: string;
  proposal_status?: 'accepted' | 'edited';
  items: BillItemPayload[];
  shares?: { member_id: string; owed_minor: number }[];
}

export interface SharedPart {
  spaceId: string;
  paidByMember: string;
  state: SplitState;
  result: ItemSplitResult;
}

function issueMessage(e: unknown): string {
  const issues = (e as { issues?: { message?: string }[] }).issues;
  return issues?.[0]?.message ?? (e instanceof Error ? e.message : 'Invalid expense.');
}

function unitPrice(amountMinor: number, qty: number): number | null {
  return qty > 0 ? Math.round(amountMinor / qty) : null;
}

export function buildBillExpensePayload(args: {
  draft: BillDraft;
  categoryId: string | null;
  edited: boolean;
  shared?: SharedPart;
}): BillExpensePayload {
  const { draft, categoryId, edited, shared } = args;
  const title = draft.merchant.trim() || 'Bill';
  const lines = draftLines(draft);
  if (draft.items.length === 0) throw new ValidationError('Add at least one item.');
  const totals = computeTotals(draft);
  const total = totals.totalMinor;
  if (total <= 0) throw new ValidationError('The bill total has to be more than zero.');

  // Item shares only for the item lines: extras are spread by the expense shares. When there are
  // no extras at all and independent line rounding drifts from the member totals by a paisa, the DB
  // would reject the expense, so we keep the authoritative member totals and drop item shares.
  const memberShares = shared
    ? shared.result.members.filter((m) => m.totalMinor > 0).map((m) => ({ memberId: m.memberId, owedMinor: m.totalMinor }))
    : [];
  const lineShares = new Map<string, { memberId: string; amountMinor: number; mode: AssignMode; count?: number; pct?: number }[]>();
  if (shared) {
    for (const l of shared.result.lines) {
      if (l.kind !== 'item') continue;
      const assign = shared.state.assigns[l.itemId];
      const rows = shared.state.participants
        .filter((m) => (l.shares[m] ?? 0) !== 0)
        .map((m) => ({
          memberId: m,
          amountMinor: l.shares[m] as number,
          mode: assign?.mode ?? 'equal',
          ...(assign?.mode === 'units' ? { count: assign.units[m] } : {}),
          ...(assign?.mode === 'percent' ? { pct: Number(assign.pct[m]) || 0 } : {}),
        }));
      lineShares.set(l.itemId, rows);
    }
    const allHaveShares = lines.every((l) => lineShares.has(l.id));
    if (allHaveShares) {
      const sums = new Map<string, number>();
      for (const rows of lineShares.values()) for (const r of rows) sums.set(r.memberId, (sums.get(r.memberId) ?? 0) + r.amountMinor);
      const drift = memberShares.some((m) => (sums.get(m.memberId) ?? 0) !== m.owedMinor) ||
        [...sums.keys()].some((k) => !memberShares.some((m) => m.memberId === k));
      if (drift) lineShares.clear();
    }
  }

  let parsed;
  try {
    parsed = CreateExpenseInputSchema.parse({
      spaceId: shared?.spaceId ?? null,
      merchantName: title,
      categoryId,
      totalMinor: total,
      currency: 'INR',
      paidByMember: shared?.paidByMember ?? PERSONAL_PAYER_PLACEHOLDER,
      paidVia: draft.paidVia,
      occurredAt: draft.occurredAt,
      source: draft.source,
      visibility: shared ? 'shared' : 'personal',
      proposalId: draft.proposalId,
      items: lines.map((l) => ({ clientId: l.id, name: l.name.slice(0, 200) || 'Item', qty: l.qty, amountMinor: l.amountMinor, kind: l.kind })),
      itemShares: [...lineShares.entries()].flatMap(([itemClientId, rows]) =>
        rows.map((r) => ({ itemClientId, memberId: r.memberId, amountMinor: r.amountMinor })),
      ),
      memberShares,
    });
  } catch (e) {
    throw new ValidationError(issueMessage(e));
  }

  const payload: BillExpensePayload = {
    space_id: parsed.spaceId,
    title: title.slice(0, 200),
    total_minor: parsed.totalMinor,
    occurred_at: parsed.occurredAt,
    paid_via: parsed.paidVia,
    source: parsed.source,
    status: 'confirmed',
    items: lines.map((l) => {
      const rows = lineShares.get(l.id);
      const item: BillItemPayload = {
        name: l.name.slice(0, 200) || 'Item',
        qty: l.qty,
        unit_price_minor: l.kind === 'item' ? unitPrice(l.amountMinor, l.qty) : null,
        amount_minor: l.amountMinor,
        kind: l.kind,
      };
      if (rows && rows.length > 0) {
        item.shares = rows.map((r) => ({
          member_id: r.memberId,
          amount_minor: r.amountMinor,
          ...(r.count !== undefined ? { units: r.count } : {}),
          ...(r.pct !== undefined ? { pct: r.pct } : {}),
        }));
      }
      return item;
    }),
  };
  if (categoryId) payload.category_id = categoryId;
  if (draft.receiptPath) payload.receipt_path = draft.receiptPath;
  if (draft.proposalId) {
    payload.proposal_id = draft.proposalId;
    payload.proposal_status = edited ? 'edited' : 'accepted';
  }
  if (shared) {
    payload.paid_by_member = parsed.paidByMember;
    payload.shares = parsed.memberShares.map((s) => ({ member_id: s.memberId, owed_minor: s.owedMinor }));
  }
  return payload;
}
