/**
 * Item-level fair split (design page 6).
 *
 * Every item is assigned to members (equally, by units, by percent or by fixed
 * amounts). Extras (discount, service charge, tax, tip) are spread either in
 * proportion to each member's item subtotal or equally. All intermediate maths
 * is exact (rationals); rounding to paise happens once per output column with
 * the largest-remainder method, so every column sums exactly to its total.
 */
import { assertPaise, type Paise } from '../money.ts';
import {
  R0,
  add,
  cmp,
  div,
  fromNumber,
  mul,
  rat,
  roundSharesLargestRemainder,
  sum,
  type Rational,
} from '../rational.ts';

export type MemberId = string;

export type ItemKind = 'item' | 'discount' | 'service' | 'tax' | 'tip';

/** Kinds that are spread across members rather than assigned by default. */
export const EXTRA_KINDS: readonly ItemKind[] = ['discount', 'service', 'tax', 'tip'];

export type ItemAssignment =
  | { type: 'equal'; members: MemberId[] }
  | { type: 'units'; units: Record<MemberId, number> }
  | { type: 'percent'; pct: Record<MemberId, number> }
  | { type: 'fixed'; amounts: Record<MemberId, Paise> };

export type ExtrasSpread = 'proportional' | 'equal';

export interface SplitItem {
  id: string;
  name: string;
  /**
   * Line amount in paise. For kind 'discount' the sign is ignored and the line
   * always reduces the total (both 15000 and -15000 mean "₹150 off").
   */
  amountMinor: Paise;
  kind: ItemKind;
  /** Required for kind 'item'. Optional for extras: if given, overrides the spread. */
  assignment?: ItemAssignment;
  /** Per-extra override of the input-level `extrasSpread`. */
  spread?: ExtrasSpread;
}

export interface ItemSplitInput {
  /** Members in stable display order; this order breaks rounding ties. */
  members: MemberId[];
  items: SplitItem[];
  /** How extras without an explicit assignment are spread. Default 'proportional'. */
  extrasSpread?: ExtrasSpread;
}

export interface MemberSplit {
  memberId: MemberId;
  /** Share of 'item' lines. itemsMinor + extrasMinor === totalMinor. */
  itemsMinor: Paise;
  /** Share of discount/service/tax/tip lines (may be negative). */
  extrasMinor: Paise;
  /** What this member's consumption cost. Sums exactly to the bill total. */
  totalMinor: Paise;
}

export interface ItemLineShare {
  itemId: string;
  kind: ItemKind;
  /** Signed effective line amount (discounts negative). */
  amountMinor: Paise;
  /** Per-member share of this line; sums exactly to amountMinor. */
  shares: Record<MemberId, Paise>;
}

export interface ItemSplitResult {
  /** In input member order. */
  members: MemberSplit[];
  byMember: Record<MemberId, MemberSplit>;
  totalMinor: Paise;
  itemsTotalMinor: Paise;
  extrasTotalMinor: Paise;
  /**
   * Per-line shares, each rounded independently (useful for `item_shares` and
   * "₹106.67 each" labels). The authoritative amount owed is `members[].totalMinor`;
   * a member's line shares can differ from it by a few paise of rounding.
   */
  lines: ItemLineShare[];
}

export class SplitError extends Error {
  override name = 'SplitError';
}

function isExtra(kind: ItemKind): boolean {
  return kind !== 'item';
}

export function effectiveAmount(item: Pick<SplitItem, 'amountMinor' | 'kind'>): Paise {
  assertPaise(item.amountMinor, `amountMinor`);
  if (item.kind === 'discount') return item.amountMinor === 0 ? 0 : -Math.abs(item.amountMinor);
  return item.amountMinor;
}

function checkMember(members: ReadonlySet<MemberId>, id: MemberId, itemId: string): void {
  if (!members.has(id)) throw new SplitError(`Item ${itemId}: unknown member "${id}"`);
}

/**
 * Exact share of `amount` for each member (indexed like `members`) under an assignment.
 */
export function assignmentShares(
  amount: Paise,
  assignment: ItemAssignment,
  members: readonly MemberId[],
  itemId = '?',
): Rational[] {
  const set = new Set(members);
  const idx = new Map(members.map((m, i) => [m, i] as const));
  const out: Rational[] = members.map(() => R0);
  const A = rat(amount);
  switch (assignment.type) {
    case 'equal': {
      const uniq = Array.from(new Set(assignment.members));
      if (uniq.length === 0) throw new SplitError(`Item ${itemId}: equal split needs at least one member`);
      uniq.forEach((m) => checkMember(set, m, itemId));
      const each = div(A, rat(uniq.length));
      for (const m of uniq) out[idx.get(m) as number] = each;
      return out;
    }
    case 'units':
    case 'percent': {
      const rec = assignment.type === 'units' ? assignment.units : assignment.pct;
      const entries = Object.entries(rec);
      let total = R0;
      const ws: Array<[number, Rational]> = [];
      for (const [m, w] of entries) {
        checkMember(set, m, itemId);
        if (!Number.isFinite(w) || w < 0) throw new SplitError(`Item ${itemId}: invalid ${assignment.type} for ${m}: ${w}`);
        const r = fromNumber(w);
        ws.push([idx.get(m) as number, r]);
        total = add(total, r);
      }
      if (assignment.type === 'percent') {
        if (cmp(total, rat(100)) !== 0) throw new SplitError(`Item ${itemId}: percentages must add up to 100`);
      } else if (total.n === BigInt(0)) {
        throw new SplitError(`Item ${itemId}: units must not all be zero`);
      }
      for (const [i, w] of ws) out[i] = div(mul(A, w), total);
      return out;
    }
    case 'fixed': {
      let s = 0;
      for (const [m, v] of Object.entries(assignment.amounts)) {
        checkMember(set, m, itemId);
        assertPaise(v, `Item ${itemId}: fixed amount for ${m}`);
        s += v;
        out[idx.get(m) as number] = rat(v);
      }
      if (s !== amount) {
        throw new SplitError(`Item ${itemId}: fixed amounts add up to ${s}, expected ${amount}`);
      }
      return out;
    }
    default: {
      const never: never = assignment;
      throw new SplitError(`Unknown assignment ${JSON.stringify(never)}`);
    }
  }
}

/**
 * Compute each member's fair share of an itemised bill.
 *
 * Rounding: member totals are the largest-remainder rounding of each member's exact
 * total; extras likewise; itemsMinor = totalMinor - extrasMinor. This reproduces the
 * design's Tandoor House numbers exactly for totals and extras.
 */
export function splitItems(input: ItemSplitInput): ItemSplitResult {
  const members = input.members;
  if (members.length === 0) throw new SplitError('At least one member is required');
  if (new Set(members).size !== members.length) throw new SplitError('Duplicate member ids');
  const defaultSpread: ExtrasSpread = input.extrasSpread ?? 'proportional';
  const n = members.length;

  const itemExact: Rational[] = members.map(() => R0);
  const extraExact: Rational[] = members.map(() => R0);
  const lineExact: Array<{ item: SplitItem; amount: Paise; shares: Rational[] }> = [];

  let itemsTotal = 0;
  let extrasTotal = 0;

  // Pass 1: items with explicit assignment (all 'item' lines, plus extras that are assigned).
  const deferredExtras: Array<{ item: SplitItem; amount: Paise; spread: ExtrasSpread }> = [];
  for (const item of input.items) {
    const amount = effectiveAmount(item);
    if (!isExtra(item.kind)) {
      if (!item.assignment) throw new SplitError(`Item ${item.id} ("${item.name}") has no assignment`);
      const shares = assignmentShares(amount, item.assignment, members, item.id);
      shares.forEach((s, i) => (itemExact[i] = add(itemExact[i] as Rational, s)));
      itemsTotal += amount;
      lineExact.push({ item, amount, shares });
    } else if (item.assignment) {
      const shares = assignmentShares(amount, item.assignment, members, item.id);
      shares.forEach((s, i) => (extraExact[i] = add(extraExact[i] as Rational, s)));
      extrasTotal += amount;
      lineExact.push({ item, amount, shares });
    } else {
      deferredExtras.push({ item, amount, spread: item.spread ?? defaultSpread });
      extrasTotal += amount;
    }
  }

  // Pass 2: spread unassigned extras.
  const itemSum = sum(itemExact);
  const hasItemBase = itemSum.n !== BigInt(0);
  for (const { item, amount, spread } of deferredExtras) {
    const A = rat(amount);
    let shares: Rational[];
    if (spread === 'proportional' && hasItemBase) {
      shares = itemExact.map((w) => div(mul(A, w), itemSum));
    } else {
      const each = div(A, rat(n));
      shares = members.map(() => each);
    }
    shares.forEach((s, i) => (extraExact[i] = add(extraExact[i] as Rational, s)));
    lineExact.push({ item, amount, shares });
  }

  assertPaise(itemsTotal, 'items total');
  assertPaise(extrasTotal, 'extras total');
  const total = itemsTotal + extrasTotal;

  const totalExact = members.map((_, i) => add(itemExact[i] as Rational, extraExact[i] as Rational));
  const totals = roundSharesLargestRemainder(totalExact);
  const extras = roundSharesLargestRemainder(extraExact);

  const memberSplits: MemberSplit[] = members.map((memberId, i) => {
    const totalMinor = totals[i] as number;
    const extrasMinor = extras[i] as number;
    return { memberId, itemsMinor: totalMinor - extrasMinor, extrasMinor, totalMinor };
  });

  // Lines keep input order.
  const order = new Map(input.items.map((it, i) => [it, i] as const));
  lineExact.sort((a, b) => (order.get(a.item) as number) - (order.get(b.item) as number));
  const lines: ItemLineShare[] = lineExact.map(({ item, amount, shares }) => {
    const rounded = roundSharesLargestRemainder(shares);
    const rec: Record<MemberId, Paise> = {};
    members.forEach((m, i) => (rec[m] = rounded[i] as number));
    return { itemId: item.id, kind: item.kind, amountMinor: amount, shares: rec };
  });

  const byMember: Record<MemberId, MemberSplit> = {};
  for (const ms of memberSplits) byMember[ms.memberId] = ms;

  return {
    members: memberSplits,
    byMember,
    totalMinor: total,
    itemsTotalMinor: itemsTotal,
    extrasTotalMinor: extrasTotal,
    lines,
  };
}
