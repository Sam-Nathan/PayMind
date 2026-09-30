/**
 * Bill draft: the editable copy of an `ai-parse-bill` proposal that the Understand and Split
 * screens share. Pure functions only; every money calculation goes through @paymind/core.
 */
import {
  allocate,
  sumPaise,
  type BillFlag,
  type BillFlagType,
  type BillParseResult,
  type PaidVia,
} from '@paymind/core';

export interface DraftItem {
  id: string;
  qty: number;
  name: string;
  /** line total in paise (not the unit price) */
  amountMinor: number;
}

export interface DraftCharge {
  id: string;
  label: string;
  /** percent as printed (5 for "5%"); null when printed as a flat amount */
  ratePct: number | null;
  amountMinor: number;
}

export type FlagResolution = 'kept' | 'removed' | 'corrected' | 'dismissed';

export interface DraftFlag {
  id: string;
  type: BillFlagType;
  reason: string;
  /** the draft item the flag is about, when it is about a line */
  itemId: string | null;
  resolution: FlagResolution | null;
}

export interface BillDraft {
  proposalId: string | null;
  source: 'scan' | 'ebill' | 'manual';
  receiptPath: string | null;
  merchant: string;
  location: string | null;
  /** ISO datetime with offset */
  occurredAt: string;
  categorySlug: string | null;
  paidVia: PaidVia;
  items: DraftItem[];
  discounts: DraftCharge[];
  service: DraftCharge | null;
  tax: DraftCharge[];
  /** added by the user, never printed on the bill */
  tipMinor: number;
  printedSubtotalMinor: number | null;
  printedTotalMinor: number;
  flags: DraftFlag[];
  /** true once the user changed the items: rate-based charges are then recomputed */
  recalc: boolean;
  /** signature of the parsed bill, to tell "accepted" from "edited" */
  baseline: string;
}

export type ProposalPayload = {
  source?: 'scan' | 'ebill';
  bill?: unknown;
  flags?: unknown;
  receiptPath?: string | null;
};

// ---------------------------------------------------------------------------
// Construction

let counter = 0;
const uid = (prefix: string) => `${prefix}${(counter += 1)}`;

export function toOccurredAt(datetime: string | null | undefined, now: Date = new Date()): string {
  if (datetime) {
    const d = new Date(datetime);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return now.toISOString();
}

const CATEGORY_HINTS: { slug: string; re: RegExp }[] = [
  { slug: 'food.cafe', re: /\b(caf[eé]|coffee|chai|bakery|brew|starbucks|tea)\b/i },
  { slug: 'transport.fuel', re: /\b(petrol|diesel|fuel|hpcl|bpcl|indian oil|shell)\b/i },
  { slug: 'transport.local_rides', re: /\b(uber|ola|rapido|auto|cab|taxi|metro)\b/i },
  { slug: 'groceries', re: /\b(mart|grocer|supermarket|kirana|bigbasket|blinkit|zepto|dmart|vegetable|fresh)\b/i },
  { slug: 'health', re: /\b(pharma|pharmacy|medical|chemist|clinic|hospital|apollo)\b/i },
  { slug: 'stay', re: /\b(hotel|resort|hostel|lodge|stay|inn)\b/i },
  { slug: 'entertainment', re: /\b(cinema|pvr|inox|movie|theatre|bowling)\b/i },
  {
    slug: 'food.dining',
    re: /\b(restaurant|house|kitchen|tandoor|dhaba|biryani|grill|bar|pizza|dine|diner|eatery|bistro|thali|hotel)\b/i,
  },
];

/** A cheap first guess for the category chip; the user can change it. */
export function guessCategorySlug(merchant: string, itemNames: readonly string[] = []): string | null {
  const hay = merchant;
  for (const h of CATEGORY_HINTS) if (h.re.test(hay)) return h.slug;
  const foodish = /\b(naan|paneer|biryani|dal|roti|thali|soda|lime|masala|tikka|chicken|rice|dosa|idli|burger|pizza|coffee|tea)\b/i;
  if (itemNames.some((n) => foodish.test(n))) return 'food.dining';
  return null;
}

function chargeOf(label: string, c: { ratePct: number | null; amountMinor: number }): DraftCharge {
  return { id: uid('c'), label, ratePct: c.ratePct, amountMinor: c.amountMinor };
}

function signature(d: Pick<BillDraft, 'items' | 'discounts' | 'service' | 'tax'>): string {
  return JSON.stringify([
    d.items.map((i) => [i.name, i.qty, i.amountMinor]),
    d.discounts.map((c) => c.amountMinor),
    d.service?.amountMinor ?? null,
    d.tax.map((c) => c.amountMinor),
  ]);
}

export function draftFromBill(
  bill: BillParseResult,
  flags: readonly BillFlag[],
  meta: { proposalId: string | null; source: 'scan' | 'ebill'; receiptPath: string | null; now?: Date },
): BillDraft {
  const items: DraftItem[] = bill.items.map((l) => ({
    id: uid('i'),
    qty: l.qty,
    name: l.name,
    amountMinor: l.amountMinor,
  }));
  const merchant = bill.merchant?.trim() || '';
  const base = {
    items,
    discounts: bill.discounts.map((c) => chargeOf(c.label || 'Discount', c)),
    service: bill.serviceCharge ? chargeOf(bill.serviceCharge.label || 'Service charge', bill.serviceCharge) : null,
    tax: bill.tax.map((c) => chargeOf(c.label || 'GST', c)),
  };
  const draftFlags: DraftFlag[] = flags.map((f) => ({
    id: uid('f'),
    type: f.type,
    reason: f.reason,
    itemId: f.lineIndex !== null && f.lineIndex !== undefined ? (items[f.lineIndex]?.id ?? null) : null,
    resolution: f.resolution ?? null,
  }));
  return {
    proposalId: meta.proposalId,
    source: meta.source,
    receiptPath: meta.receiptPath,
    merchant,
    location: bill.location,
    occurredAt: toOccurredAt(bill.datetime, meta.now),
    categorySlug: guessCategorySlug(merchant, items.map((i) => i.name)),
    paidVia: 'upi',
    ...base,
    tipMinor: bill.tipMinor ?? 0,
    printedSubtotalMinor: bill.subtotalMinor,
    printedTotalMinor: bill.totalMinor,
    flags: draftFlags,
    recalc: false,
    baseline: signature(base),
  };
}

/** A blank draft for "Enter manually". */
export function emptyDraft(proposalId: string | null, now: Date = new Date()): BillDraft {
  return {
    proposalId,
    source: 'manual',
    receiptPath: null,
    merchant: '',
    location: null,
    occurredAt: now.toISOString(),
    categorySlug: null,
    paidVia: 'upi',
    items: [],
    discounts: [],
    service: null,
    tax: [],
    tipMinor: 0,
    printedSubtotalMinor: null,
    printedTotalMinor: 0,
    flags: [],
    recalc: false,
    baseline: signature({ items: [], discounts: [], service: null, tax: [] }),
  };
}

// ---------------------------------------------------------------------------
// Totals

/** round(base x ratePct / 100) in paise, using core's exact largest-remainder allocation. */
export function percentOf(baseMinor: number, ratePct: number): number {
  if (baseMinor <= 0 || !(ratePct > 0) || ratePct >= 100) return 0;
  return allocate(baseMinor, [ratePct, 100 - ratePct])[0] as number;
}

/** With `recalc`, service and tax that were printed as a percentage follow the current items. */
export function withRecalculatedCharges(d: BillDraft): BillDraft {
  if (!d.recalc) return d;
  const subtotal = sumPaise(d.items.map((i) => i.amountMinor));
  const discounts = d.discounts.map((c) =>
    c.ratePct !== null ? { ...c, amountMinor: percentOf(subtotal, c.ratePct) } : c,
  );
  const base = subtotal - sumPaise(discounts.map((c) => c.amountMinor));
  const fix = (c: DraftCharge): DraftCharge => (c.ratePct !== null ? { ...c, amountMinor: percentOf(base, c.ratePct) } : c);
  return { ...d, discounts, service: d.service ? fix(d.service) : null, tax: d.tax.map(fix) };
}

export interface DraftTotals {
  subtotalMinor: number;
  discountMinor: number;
  serviceMinor: number;
  taxMinor: number;
  tipMinor: number;
  /** what the bill says you pay, without the tip */
  billTotalMinor: number;
  /** what you paid in all (with tip) */
  totalMinor: number;
  /** items and charges reproduce the printed bill */
  matchesPrinted: boolean;
  /** computed bill total minus the printed total */
  diffMinor: number;
}

export function computeTotals(d: BillDraft): DraftTotals {
  const subtotalMinor = sumPaise(d.items.map((i) => i.amountMinor));
  const discountMinor = sumPaise(d.discounts.map((c) => Math.abs(c.amountMinor)));
  const serviceMinor = d.service?.amountMinor ?? 0;
  const taxMinor = sumPaise(d.tax.map((c) => c.amountMinor));
  const billTotalMinor = subtotalMinor - discountMinor + serviceMinor + taxMinor;
  const diffMinor = billTotalMinor - d.printedTotalMinor;
  const subtotalOk = d.printedSubtotalMinor === null || d.printedSubtotalMinor === subtotalMinor;
  return {
    subtotalMinor,
    discountMinor,
    serviceMinor,
    taxMinor,
    tipMinor: d.tipMinor,
    billTotalMinor,
    totalMinor: billTotalMinor + d.tipMinor,
    matchesPrinted: d.printedTotalMinor > 0 && subtotalOk && diffMinor === 0,
    diffMinor,
  };
}

// ---------------------------------------------------------------------------
// Editing

function reopenFlags(flags: DraftFlag[]): DraftFlag[] {
  return flags.map((f) => (f.resolution && f.resolution !== 'removed' ? { ...f, resolution: null } : f));
}

function touched(d: BillDraft, patch: Partial<BillDraft>): BillDraft {
  return withRecalculatedCharges({ ...d, ...patch, recalc: true, flags: reopenFlags(patch.flags ?? d.flags) });
}

export function updateItem(d: BillDraft, id: string, patch: Partial<Omit<DraftItem, 'id'>>): BillDraft {
  return touched(d, { items: d.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
}

export function addItem(d: BillDraft, item: Omit<DraftItem, 'id'>): BillDraft {
  return touched(d, { items: [...d.items, { ...item, id: uid('i') }] });
}

export function removeItem(d: BillDraft, id: string): BillDraft {
  return touched(d, { items: d.items.filter((i) => i.id !== id) });
}

export function setTip(d: BillDraft, tipMinor: number): BillDraft {
  return { ...d, tipMinor: Math.max(0, Math.round(tipMinor)) };
}

// ---------------------------------------------------------------------------
// Bill Detective cards

export interface FlagCardSpec {
  flagId: string;
  title: string;
  body: string;
  primaryLabel: string;
  secondaryLabel: string;
}

const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** How many of this dish the table had if the flagged line is real (e.g. 3 + 1 = 4). */
export function duplicateQty(d: BillDraft, itemId: string): number {
  const item = d.items.find((i) => i.id === itemId);
  if (!item) return 1;
  const key = normName(item.name);
  return d.items.filter((i) => normName(i.name) === key).reduce((a, i) => a + i.qty, 0);
}

export function flagSpec(d: BillDraft, f: DraftFlag): FlagCardSpec {
  const item = f.itemId ? d.items.find((i) => i.id === f.itemId) : undefined;
  switch (f.type) {
    case 'possible_duplicate_line':
      return {
        flagId: f.id,
        title: `Possible double entry${item ? `: ${item.name}` : ''}`,
        body: f.reason,
        primaryLabel: 'Remove it',
        secondaryLabel: `We had ${item ? duplicateQty(d, item.id) : 'more'}`,
      };
    case 'service_charge':
      return {
        flagId: f.id,
        title: `Service charge added${d.service?.ratePct ? ` (${d.service.ratePct}%)` : ''}`,
        body: f.reason,
        primaryLabel: 'Keep it',
        secondaryLabel: 'It was removed',
      };
    case 'subtotal_mismatch':
    case 'tax_mismatch':
    case 'total_mismatch':
    case 'price_mismatch':
    case 'unusual_amount':
    case 'other': {
      const titles: Record<string, string> = {
        subtotal_mismatch: "Subtotal doesn't match the items",
        tax_mismatch: 'GST looks different from usual',
        total_mismatch: "Total doesn't match",
        price_mismatch: `Price to double-check${item ? `: ${item.name}` : ''}`,
        unusual_amount: `Unusual amount${item ? `: ${item.name}` : ''}`,
        other: 'Worth a look',
      };
      return {
        flagId: f.id,
        title: titles[f.type] as string,
        body: f.reason,
        primaryLabel: 'Looks fine',
        secondaryLabel: "I'll fix it",
      };
    }
  }
}

export type FlagAction = 'primary' | 'secondary';

export function applyFlagAction(d: BillDraft, flagId: string, action: FlagAction): BillDraft {
  const flag = d.flags.find((f) => f.id === flagId);
  if (!flag) return d;
  const resolve = (next: BillDraft, resolution: FlagResolution): BillDraft => ({
    ...next,
    flags: next.flags.map((f) => (f.id === flagId ? { ...f, resolution } : f)),
  });
  if (flag.type === 'possible_duplicate_line') {
    if (action === 'primary') {
      // Remove it: drop the line, recompute percentage charges, keep other resolutions.
      const items = d.items.filter((i) => i.id !== flag.itemId);
      return resolve(withRecalculatedCharges({ ...d, items, recalc: true }), 'removed');
    }
    return resolve(d, 'kept');
  }
  if (flag.type === 'service_charge') {
    if (action === 'primary') return resolve(d, 'kept');
    return resolve(withRecalculatedCharges({ ...d, service: null, recalc: true }), 'removed');
  }
  return resolve(d, action === 'primary' ? 'dismissed' : 'corrected');
}

/** Flags still waiting for the user, skipping ones about a line that no longer exists. */
export function openFlags(d: BillDraft): DraftFlag[] {
  return d.flags.filter((f) => f.resolution === null && (f.itemId === null || d.items.some((i) => i.id === f.itemId)));
}

export function isEdited(d: BillDraft): boolean {
  return signature(d) !== d.baseline;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return (parts[0] as string).slice(0, 2).toUpperCase();
  return ((parts[0] as string).charAt(0) + (parts[1] as string).charAt(0)).toUpperCase();
}

// ---------------------------------------------------------------------------
// expense_items lines (shared by the personal and shared save paths)

export type LineKind = 'item' | 'discount' | 'service' | 'tax' | 'tip';

export interface DraftLine {
  id: string;
  name: string;
  qty: number;
  /** signed: discounts are negative, so the lines add up to the total */
  amountMinor: number;
  kind: LineKind;
}

export function draftLines(d: BillDraft): DraftLine[] {
  const lines: DraftLine[] = d.items.map((i) => ({
    id: i.id,
    name: i.name,
    qty: i.qty,
    amountMinor: i.amountMinor,
    kind: 'item',
  }));
  for (const c of d.discounts) {
    if (c.amountMinor !== 0) lines.push({ id: c.id, name: c.label, qty: 1, amountMinor: -Math.abs(c.amountMinor), kind: 'discount' });
  }
  if (d.service && d.service.amountMinor !== 0) {
    lines.push({ id: d.service.id, name: d.service.label, qty: 1, amountMinor: d.service.amountMinor, kind: 'service' });
  }
  for (const c of d.tax) {
    if (c.amountMinor !== 0) lines.push({ id: c.id, name: c.label, qty: 1, amountMinor: c.amountMinor, kind: 'tax' });
  }
  if (d.tipMinor > 0) lines.push({ id: 'tip', name: 'Tip', qty: 1, amountMinor: d.tipMinor, kind: 'tip' });
  return lines;
}
