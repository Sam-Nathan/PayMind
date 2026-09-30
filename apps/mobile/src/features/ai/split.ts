/**
 * Item-level split state for split/[id]. Shares come from core `splitItems`; this file only turns
 * the screen's toggles and inputs into its input and validates them with friendly messages.
 */
import {
  allocateEqual,
  formatINR,
  splitItems,
  type ExtrasSpread,
  type ItemAssignment,
  type ItemSplitResult,
  type SplitItem,
} from '@paymind/core';
import { parseAmountInput } from '../../data/payloads.ts';
import { draftLines, type BillDraft, type DraftItem, type DraftLine } from './draft.ts';

export type AssignMode = 'equal' | 'units' | 'percent' | 'fixed';

export interface ItemAssign {
  /** people who had this item (equal / percent / fixed modes) */
  on: string[];
  mode: AssignMode;
  /** per-person counts for quantity items */
  units: Record<string, number>;
  /** text inputs, so half-typed values survive re-renders */
  pct: Record<string, string>;
  fixed: Record<string, string>;
}

export interface SplitState {
  /** member ids, in display order (you first) */
  participants: string[];
  assigns: Record<string, ItemAssign>;
  extrasSpread: ExtrasSpread;
}

export const isQtyItem = (i: Pick<DraftItem, 'qty'>): boolean => Number.isInteger(i.qty) && i.qty > 1;

export function defaultAssign(item: DraftItem, participants: readonly string[]): ItemAssign {
  if (isQtyItem(item) && participants.length > 0) {
    const counts = allocateEqual(item.qty, participants.length);
    return {
      on: [...participants],
      mode: 'units',
      units: Object.fromEntries(participants.map((p, i) => [p, counts[i] as number])),
      pct: {},
      fixed: {},
    };
  }
  return { on: [...participants], mode: 'equal', units: {}, pct: {}, fixed: {} };
}

export function defaultSplitState(draft: BillDraft, participants: readonly string[]): SplitState {
  return {
    participants: [...participants],
    assigns: Object.fromEntries(draft.items.map((i) => [i.id, defaultAssign(i, participants)])),
    extrasSpread: 'proportional',
  };
}

/** Add or remove a participant, keeping every other choice. */
export function setParticipants(draft: BillDraft, state: SplitState, participants: readonly string[]): SplitState {
  const keep = new Set(participants);
  const assigns: Record<string, ItemAssign> = {};
  for (const item of draft.items) {
    const a = state.assigns[item.id] ?? defaultAssign(item, state.participants);
    const added = participants.filter((p) => !state.participants.includes(p));
    const on = [...a.on.filter((p) => keep.has(p)), ...(a.mode === 'equal' ? added : [])];
    const units = Object.fromEntries(participants.map((p) => [p, a.units[p] ?? 0]));
    assigns[item.id] = { ...a, on, units };
  }
  return { ...state, participants: [...participants], assigns };
}

export function toggleOn(state: SplitState, itemId: string, memberId: string): SplitState {
  const a = state.assigns[itemId];
  if (!a) return state;
  const on = a.on.includes(memberId) ? a.on.filter((m) => m !== memberId) : [...a.on, memberId];
  return { ...state, assigns: { ...state.assigns, [itemId]: { ...a, on } } };
}

/** Quantity items: tap a name to add one, cycling 0..qty. */
export function bumpUnits(state: SplitState, item: DraftItem, memberId: string): SplitState {
  const a = state.assigns[item.id];
  if (!a) return state;
  const next = ((a.units[memberId] ?? 0) + 1) % (item.qty + 1);
  return { ...state, assigns: { ...state.assigns, [item.id]: { ...a, units: { ...a.units, [memberId]: next } } } };
}

export function setMode(state: SplitState, itemId: string, mode: AssignMode): SplitState {
  const a = state.assigns[itemId];
  if (!a) return state;
  return { ...state, assigns: { ...state.assigns, [itemId]: { ...a, mode } } };
}

export function setInput(
  state: SplitState,
  itemId: string,
  field: 'pct' | 'fixed',
  memberId: string,
  value: string,
): SplitState {
  const a = state.assigns[itemId];
  if (!a) return state;
  return {
    ...state,
    assigns: { ...state.assigns, [itemId]: { ...a, [field]: { ...a[field], [memberId]: value } } },
  };
}

// ---------------------------------------------------------------------------

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The assignment for one item, or a message explaining what is missing. */
export function assignmentFor(
  item: Pick<DraftItem, 'amountMinor' | 'qty'>,
  a: ItemAssign,
  participants: readonly string[],
): { assignment: ItemAssignment } | { error: string } {
  const valid = new Set(participants);
  const on = a.on.filter((m) => valid.has(m));
  switch (a.mode) {
    case 'equal':
      return on.length > 0 ? { assignment: { type: 'equal', members: on } } : { error: 'Pick at least one person.' };
    case 'units': {
      const units: Record<string, number> = {};
      for (const m of participants) if ((a.units[m] ?? 0) > 0) units[m] = a.units[m] as number;
      return Object.keys(units).length > 0
        ? { assignment: { type: 'units', units } }
        : { error: 'Give at least one person a share.' };
    }
    case 'percent': {
      if (on.length === 0) return { error: 'Pick at least one person.' };
      const pct: Record<string, number> = {};
      let hundredths = 0;
      for (const m of on) {
        const v = round2(Math.max(0, Number(a.pct[m] ?? '') || 0));
        pct[m] = v;
        hundredths += Math.round(v * 100);
      }
      if (hundredths !== 10000) return { error: `Percentages add up to ${hundredths / 100}%, they need to make 100%.` };
      return { assignment: { type: 'percent', pct } };
    }
    case 'fixed': {
      if (on.length === 0) return { error: 'Pick at least one person.' };
      const amounts: Record<string, number> = {};
      let sum = 0;
      for (const m of on) {
        const v = parseAmountInput(a.fixed[m] ?? '') ?? 0;
        amounts[m] = v;
        sum += v;
      }
      const diff = item.amountMinor - sum;
      if (diff !== 0) {
        return {
          error:
            diff > 0
              ? `${formatINR(diff)} is still left to assign.`
              : `Amounts are ${formatINR(-diff)} over the item price.`,
        };
      }
      return { assignment: { type: 'fixed', amounts } };
    }
  }
}

export interface SplitComputation {
  result: ItemSplitResult | null;
  itemErrors: Record<string, string>;
  problem: string | null;
  /** the core SplitItems used, index-aligned with draftLines (for saving) */
  lines: DraftLine[];
}

export function computeSplit(draft: BillDraft, state: SplitState): SplitComputation {
  const lines = draftLines(draft);
  const itemErrors: Record<string, string> = {};
  if (state.participants.length < 2) {
    return { result: null, itemErrors, problem: 'Pick at least one other person to split with.', lines };
  }
  if (draft.items.length === 0) return { result: null, itemErrors, problem: 'There are no items to split.', lines };

  const items: SplitItem[] = [];
  for (const line of lines) {
    if (line.kind === 'item') {
      const a = state.assigns[line.id] ?? defaultAssign(draft.items.find((i) => i.id === line.id) as DraftItem, state.participants);
      const r = assignmentFor(line, a, state.participants);
      if ('error' in r) {
        itemErrors[line.id] = r.error;
        continue;
      }
      items.push({ id: line.id, name: line.name, amountMinor: line.amountMinor, kind: 'item', assignment: r.assignment });
    } else {
      items.push({ id: line.id, name: line.name, amountMinor: line.amountMinor, kind: line.kind });
    }
  }
  if (Object.keys(itemErrors).length > 0) {
    return { result: null, itemErrors, problem: 'Fix the items marked in red to see the split.', lines };
  }
  try {
    const result = splitItems({ members: state.participants, items, extrasSpread: state.extrasSpread });
    return { result, itemErrors, problem: null, lines };
  } catch (e) {
    return { result: null, itemErrors, problem: e instanceof Error ? e.message : 'Could not work out the split.', lines };
  }
}

/** "Coupon, service, GST & tip" from the extras that exist. */
export function extrasLabel(draft: BillDraft): string {
  const parts: string[] = [];
  if (draft.discounts.some((c) => c.amountMinor !== 0)) parts.push('Coupon');
  if (draft.service && draft.service.amountMinor !== 0) parts.push('service');
  if (draft.tax.some((c) => c.amountMinor !== 0)) parts.push('GST');
  if (draft.tipMinor > 0) parts.push('tip');
  if (parts.length === 0) return 'Extras';
  const text = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} & ${parts[parts.length - 1]}`;
  return (text as string).charAt(0).toUpperCase() + (text as string).slice(1);
}

function list(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Short bullet points that explain the current split (derived from the choices, not from AI). */
export function rationale(draft: BillDraft, state: SplitState, nameOf: (memberId: string) => string): string[] {
  const n = state.participants.length;
  const sharedAll: string[] = [];
  const solo: string[] = [];
  const bullets: string[] = [];
  for (const item of draft.items) {
    const a = state.assigns[item.id];
    if (!a) continue;
    if (a.mode === 'units') {
      const parts = state.participants.filter((m) => (a.units[m] ?? 0) > 0).map((m) => `${a.units[m]} for ${nameOf(m)}`);
      if (parts.length > 0) bullets.push(`${item.name} by count: ${parts.join(', ')}`);
    } else if (a.mode === 'equal' && a.on.length === n && n > 1) {
      sharedAll.push(item.name);
    } else if (a.mode === 'equal' && a.on.length === 1) {
      solo.push(item.name);
    }
  }
  if (sharedAll.length > 0) {
    const shown = sharedAll.length <= 3 ? list(sharedAll) : `${sharedAll.length} items`;
    bullets.unshift(`${shown} shared by all ${n}`);
  }
  if (solo.length > 0) {
    bullets.push(`${solo.length <= 3 ? list(solo) : `${solo.length} items`} to whoever had ${solo.length === 1 ? 'it' : 'them'}`);
  }
  const extras = extrasLabel(draft);
  if (extras !== 'Extras') {
    bullets.push(`${extras} spread ${state.extrasSpread === 'proportional' ? 'by what each person ordered' : 'equally'}`);
  }
  return bullets;
}
