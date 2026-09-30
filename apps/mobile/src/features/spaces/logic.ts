/**
 * Pure logic for the space detail variants, the trip report and invites (no React, no I/O).
 * Money is integer paise; splits go through @paymind/core so they always add up exactly.
 */
import {
  applySplitRule,
  formatINR,
  splitByUsage,
  splitEqual,
  splitRatio,
  type SplitRule,
  type UsageCommon,
} from '@paymind/core';

const rupees = (m: number, decimals: 0 | 2 = 0) => formatINR(m, { decimals }).replace('-', '−');

// ---------------------------------------------------------------------------
// Dates

export function monthStart(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export function inMonth(iso: string, now: Date): boolean {
  const d = new Date(iso);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthLong = (now: Date): string => MONTH_LONG[now.getMonth()] as string;

/** Whole days between two YYYY-MM-DD dates, both included ("2–6 Oct" = 5 days). */
export function inclusiveDays(startIso: string, endIso: string): number {
  const a = Date.parse(`${startIso.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${endIso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 1;
  return Math.round((b - a) / 86_400_000) + 1;
}

// ---------------------------------------------------------------------------
// Expenses -> totals

export interface ExpenseLike {
  id: string;
  title: string;
  totalMinor: number;
  categoryId: string | null;
  paidByMember: string | null;
  occurredAt: string;
}

export interface CategoryLike {
  id: string;
  slug: string | null;
  name: string;
}

/** "food.dining" -> "food". */
export function rootSlug(slug: string | null | undefined): string {
  return (slug ?? 'other').split('.')[0] || 'other';
}

export interface CategoryTotal {
  slug: string;
  name: string;
  totalMinor: number;
}

const SLUG_NAMES: Record<string, string> = {
  food: 'Food',
  groceries: 'Groceries',
  transport: 'Local rides',
  travel: 'Travel',
  stay: 'Stay',
  shopping: 'Shopping',
  entertainment: 'Entertainment',
  subscriptions: 'Subscriptions',
  utilities: 'Utilities',
  rent: 'Rent',
  education: 'Education',
  health: 'Health',
  household_help: 'Household help',
  emi: 'EMI',
  insurance: 'Insurance',
  activities: 'Activities',
  other: 'Other',
};

export function categoryName(slug: string): string {
  return SLUG_NAMES[slug] ?? slug.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/** Totals per root category, largest first. Uncategorised spend is "Other". */
export function categoryBreakdown(
  expenses: readonly ExpenseLike[],
  categories: readonly CategoryLike[],
): CategoryTotal[] {
  const slugById = new Map(categories.map((c) => [c.id, c.slug]));
  const totals = new Map<string, number>();
  for (const e of expenses) {
    const slug = rootSlug(e.categoryId ? slugById.get(e.categoryId) : null);
    totals.set(slug, (totals.get(slug) ?? 0) + e.totalMinor);
  }
  return [...totals]
    .map(([slug, totalMinor]) => ({ slug, name: categoryName(slug), totalMinor }))
    .sort((a, b) => b.totalMinor - a.totalMinor);
}

export function paidByMember(expenses: readonly ExpenseLike[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of expenses) {
    if (!e.paidByMember) continue;
    out.set(e.paidByMember, (out.get(e.paidByMember) ?? 0) + e.totalMinor);
  }
  return out;
}

export const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

export function percent(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

// ---------------------------------------------------------------------------
// Trip report

export interface PlanRow {
  slug: string;
  name: string;
  plannedMinor: number | null;
  actualMinor: number;
}

/** Plan vs actual per category: every planned category plus everything actually spent. */
export function planVsActual(actual: readonly CategoryTotal[], planned: ReadonlyMap<string, number>): PlanRow[] {
  const rows = new Map<string, PlanRow>();
  for (const a of actual) rows.set(a.slug, { slug: a.slug, name: a.name, plannedMinor: planned.get(a.slug) ?? null, actualMinor: a.totalMinor });
  for (const [slug, p] of planned) if (!rows.has(slug)) rows.set(slug, { slug, name: categoryName(slug), plannedMinor: p, actualMinor: 0 });
  return [...rows.values()].sort((a, b) => b.actualMinor - a.actualMinor);
}

export interface ReportFactsInput {
  expenses: readonly ExpenseLike[];
  breakdown: readonly CategoryTotal[];
  plan: readonly PlanRow[];
  paidByName: readonly { name: string; paidMinor: number }[];
}

/** "What stood out": simple facts computed from the data (no AI), at most four. */
export function reportFacts(input: ReportFactsInput): string[] {
  const facts: string[] = [];
  const total = sum(input.breakdown.map((b) => b.totalMinor));
  if (total <= 0) return facts;

  const top = input.breakdown[0];
  if (top) facts.push(`${top.name} was the biggest spend: ${rupees(top.totalMinor)}, ${percent(top.totalMinor, total)}% of the total.`);

  const planned = input.plan.filter((r) => r.plannedMinor !== null && r.plannedMinor > 0);
  const over = planned
    .filter((r) => r.actualMinor > (r.plannedMinor as number))
    .sort((a, b) => b.actualMinor - (b.plannedMinor as number) - (a.actualMinor - (a.plannedMinor as number)))[0];
  const under = planned
    .filter((r) => r.actualMinor < (r.plannedMinor as number))
    .sort((a, b) => (b.plannedMinor as number) - b.actualMinor - ((a.plannedMinor as number) - a.actualMinor))[0];
  if (over) {
    const p = over.plannedMinor as number;
    facts.push(`${over.name} ran ${percent(over.actualMinor - p, p)}% over plan: ${rupees(over.actualMinor)} against ${rupees(p)}.`);
  }
  if (under) {
    facts.push(`${under.name} came in ${rupees((under.plannedMinor as number) - under.actualMinor)} under plan.`);
  }

  const payers = [...input.paidByName].sort((a, b) => b.paidMinor - a.paidMinor);
  if (payers.length >= 3) {
    const [a, b] = payers as [(typeof payers)[number], (typeof payers)[number]];
    facts.push(`${a.name} and ${b.name} fronted ${percent(a.paidMinor + b.paidMinor, total)}% of all costs between them.`);
  }

  const big = [...input.expenses].sort((a, b) => b.totalMinor - a.totalMinor)[0];
  if (big && input.expenses.length > 2) {
    const d = new Date(big.occurredAt);
    facts.push(`The biggest single expense was ${big.title}: ${rupees(big.totalMinor)} on ${d.getDate()} ${MONTH_LONG[d.getMonth()]?.slice(0, 3)}.`);
  }
  return facts.slice(0, 4);
}

export function tripShareText(p: {
  name: string;
  range: string | null;
  totalMinor: number;
  perPersonMinor: number;
  budgetMinor: number | null;
  balances: readonly { name: string; paidMinor: number; netMinor: number }[];
}): string {
  const lines = [`${p.name}${p.range ? `, ${p.range}` : ''} — trip report`, `Total ${rupees(p.totalMinor)} · ${rupees(p.perPersonMinor)} per person`];
  if (p.budgetMinor) {
    const d = p.budgetMinor - p.totalMinor;
    lines.push(d >= 0 ? `${rupees(d)} under the ${rupees(p.budgetMinor)} budget` : `${rupees(-d)} over the ${rupees(p.budgetMinor)} budget`);
  }
  lines.push('', 'Paid · balance');
  for (const b of p.balances) {
    lines.push(`${b.name}: ${rupees(b.paidMinor)} · ${b.netMinor === 0 ? 'square' : rupees(b.netMinor).replace(/^(?!−)/, '+')}`);
  }
  lines.push('', 'Made with PayMind. Shows trip items and balances only.');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Couple: "How you share"

export type SharePreset = '50-50' | '60-40' | '70-30' | 'fixed' | 'item';

export const SHARE_PRESETS: readonly { value: SharePreset; label: string }[] = [
  { value: '50-50', label: '50 / 50' },
  { value: '60-40', label: '60 / 40' },
  { value: '70-30', label: '70 / 30' },
  { value: 'fixed', label: 'Fixed ₹' },
  { value: 'item', label: 'By item' },
];

/** The JSON stored in `spaces.default_split` (SplitRule-shaped; 'by_item' has no params). */
export function presetToDefaultSplit(
  preset: SharePreset,
  meId: string,
  partnerId: string,
  fixedPartnerMinor = 0,
): Record<string, unknown> {
  switch (preset) {
    case '50-50':
      return { method: 'equal', members: [meId, partnerId] };
    case '60-40':
      return { method: 'ratio', ratio: { [meId]: 60, [partnerId]: 40 } };
    case '70-30':
      return { method: 'ratio', ratio: { [meId]: 70, [partnerId]: 30 } };
    case 'fixed':
      return { method: 'fixed', amounts: { [partnerId]: Math.max(0, Math.round(fixedPartnerMinor)) } };
    case 'item':
      return { method: 'by_item' };
  }
}

export function defaultSplitToPreset(
  ds: unknown,
  meId: string | undefined,
  partnerId: string | undefined,
): { preset: SharePreset; fixedPartnerMinor: number } {
  const fallback = { preset: '50-50' as SharePreset, fixedPartnerMinor: 0 };
  if (!ds || typeof ds !== 'object' || !meId || !partnerId) return fallback;
  const d = ds as Record<string, unknown>;
  if (d['method'] === 'by_item') return { preset: 'item', fixedPartnerMinor: 0 };
  if (d['method'] === 'fixed') {
    const a = (d['amounts'] as Record<string, unknown> | undefined)?.[partnerId];
    return { preset: 'fixed', fixedPartnerMinor: typeof a === 'number' ? a : 0 };
  }
  if (d['method'] === 'ratio') {
    const r = (d['ratio'] ?? {}) as Record<string, unknown>;
    const mine = Number(r[meId]);
    const theirs = Number(r[partnerId]);
    const key = `${mine}-${theirs}`;
    if (key === '50-50') return { preset: '50-50', fixedPartnerMinor: 0 };
    if (key === '60-40' || key === '70-30') return { preset: key, fixedPartnerMinor: 0 };
    return fallback;
  }
  return fallback;
}

export interface CoupleSplit {
  myShareMinor: number;
  partnerShareMinor: number;
  /** percent for the split bar (mine) */
  myPercent: number;
  /** by-item: no fixed ratio to show */
  perItem: boolean;
}

/** Each person's fair share of `totalMinor` under a preset (uses core so rounding is exact). */
export function coupleSplit(
  totalMinor: number,
  preset: SharePreset,
  meId: string,
  partnerId: string,
  fixedPartnerMinor = 0,
): CoupleSplit {
  if (totalMinor <= 0) return { myShareMinor: 0, partnerShareMinor: 0, myPercent: preset === '60-40' ? 60 : preset === '70-30' ? 70 : 50, perItem: preset === 'item' };
  if (preset === '50-50' || preset === 'item') {
    const s = splitEqual(totalMinor, [meId, partnerId]);
    return { myShareMinor: s[meId] as number, partnerShareMinor: s[partnerId] as number, myPercent: 50, perItem: preset === 'item' };
  }
  if (preset === 'fixed') {
    const partner = Math.min(Math.max(0, fixedPartnerMinor), totalMinor);
    return {
      myShareMinor: totalMinor - partner,
      partnerShareMinor: partner,
      myPercent: Math.round(((totalMinor - partner) / totalMinor) * 100),
      perItem: false,
    };
  }
  const mine = preset === '60-40' ? 60 : 70;
  const s = splitRatio(totalMinor, { [meId]: mine, [partnerId]: 100 - mine });
  return { myShareMinor: s[meId] as number, partnerShareMinor: s[partnerId] as number, myPercent: mine, perItem: false };
}

/** "All square", "Ananya owes you ₹X" or "You owe Ananya ₹X" for this month. */
export function coupleStatus(myPaid: number, mySharePerSplit: number, partnerName: string): { text: string; tone: 'square' | 'owed' | 'owe'; amountMinor: number } {
  const net = myPaid - mySharePerSplit;
  if (Math.abs(net) < 100) return { text: 'All square — nobody owes anything this month.', tone: 'square', amountMinor: 0 };
  return net > 0
    ? { text: `${partnerName} owes you ${rupees(net)}`, tone: 'owed', amountMinor: net }
    : { text: `You owe ${partnerName} ${rupees(-net)}`, tone: 'owe', amountMinor: -net };
}

export function splitHelper(preset: SharePreset, partnerName: string): string {
  switch (preset) {
    case '50-50':
      return 'Everything is split evenly. Applies to everything in this space unless an item says otherwise.';
    case '60-40':
    case '70-30':
      return 'Roughly in line with your incomes. Applies to everything in this space unless an item says otherwise.';
    case 'fixed':
      return `${partnerName} pays a fixed amount of each bill and you cover the rest.`;
    case 'item':
      return 'Each new expense is split item by item, so nobody pays for what they did not have.';
  }
}

// ---------------------------------------------------------------------------
// Roommates: a rule per bill

export type BillMethod = 'equal' | 'by_usage' | 'by_room';

export const BILL_METHODS: readonly { value: BillMethod; label: string }[] = [
  { value: 'equal', label: 'Equally' },
  { value: 'by_usage', label: 'By usage' },
  { value: 'by_room', label: 'By room' },
];

export function billMethodLabel(method: string): string {
  switch (method) {
    case 'equal':
      return 'Equally';
    case 'by_usage':
      return 'By usage';
    case 'by_room':
      return 'By room size';
    case 'by_item':
      return 'By item';
    case 'fixed':
      return 'Fixed';
    case 'ratio':
      return 'By ratio';
    default:
      return method;
  }
}

export interface MemberLike {
  id: string;
  displayName: string;
  shareWeight: number;
}

/** A stored `split_rules` row -> a core SplitRule (null when it can't be applied, e.g. by_item). */
export function ruleFromRow(method: string, params: unknown, members: readonly MemberLike[]): SplitRule | null {
  const p = (params && typeof params === 'object' ? params : {}) as Record<string, unknown>;
  const ids = members.map((m) => m.id);
  const nums = (v: unknown): Record<string, number> | null => {
    if (!v || typeof v !== 'object') return null;
    const out: Record<string, number> = {};
    for (const id of ids) {
      const n = Number((v as Record<string, unknown>)[id]);
      if (Number.isFinite(n) && n >= 0) out[id] = n;
    }
    return Object.keys(out).length > 0 ? out : null;
  };
  switch (method) {
    case 'equal':
      return ids.length > 0 ? { method: 'equal', members: ids } : null;
    case 'by_room': {
      const weights = nums(p['weights']) ?? Object.fromEntries(members.map((m) => [m.id, m.shareWeight > 0 ? m.shareWeight : 1]));
      return { method: 'by_room', weights };
    }
    case 'by_usage': {
      const usage = nums(p['usage']);
      if (!usage || Object.values(usage).every((u) => u === 0)) return null;
      const common = p['common'] as UsageCommon | undefined;
      return common ? { method: 'by_usage', usage, common } : { method: 'by_usage', usage };
    }
    case 'ratio': {
      const ratio = nums(p['ratio']);
      return ratio ? { method: 'ratio', ratio } : null;
    }
    default:
      return null;
  }
}

/** Per-person amounts for a bill under a rule, or null if it can't be computed. */
export function billShares(totalMinor: number, rule: SplitRule | null): Record<string, number> | null {
  if (!rule || !Number.isSafeInteger(totalMinor) || totalMinor <= 0) return null;
  try {
    if (rule.method === 'by_usage') {
      return splitByUsage(rule.common ? { totalMinor, usage: rule.usage, common: rule.common } : { totalMinor, usage: rule.usage }).shares;
    }
    return applySplitRule(totalMinor, rule);
  } catch {
    return null;
  }
}

/** Params to store in `split_rules.params` for a method. */
export function ruleParams(
  method: BillMethod,
  members: readonly MemberLike[],
  usage?: Record<string, number>,
): Record<string, unknown> {
  if (method === 'equal') return { members: members.map((m) => m.id) };
  if (method === 'by_room') return { weights: Object.fromEntries(members.map((m) => [m.id, m.shareWeight > 0 ? m.shareWeight : 1])) };
  return { usage: usage ?? {} };
}

export function billKindOf(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}

/** Sum of the given (this month's) expenses that belong to a bill: the title mentions the kind, or it is rent. */
export function billTotal(
  kind: string,
  expenses: readonly ExpenseLike[],
  categories: readonly CategoryLike[],
): number {
  const slugById = new Map(categories.map((c) => [c.id, c.slug]));
  const k = kind.replace(/_/g, ' ');
  return sum(
    expenses
      .filter((e) => {
        if (e.title.toLowerCase().includes(k)) return true;
        // Rent has its own system category; other bills are matched by name only.
        return kind === 'rent' && rootSlug(e.categoryId ? slugById.get(e.categoryId) : null) === 'rent';
      })
      .map((e) => e.totalMinor),
  );
}

// ---------------------------------------------------------------------------
// Family

export function householdInsight(p: {
  breakdown: readonly CategoryTotal[];
  budgets: ReadonlyMap<string, number>;
  spentMinor: number;
  budgetMinor: number | null;
}): string | null {
  if (p.spentMinor <= 0) return null;
  const top = p.breakdown[0];
  const parts: string[] = [];
  if (top) parts.push(`${top.name} is the biggest spend this month at ${rupees(top.totalMinor)} (${percent(top.totalMinor, p.spentMinor)}% of everything).`);
  const over = p.breakdown.find((b) => {
    const lim = p.budgets.get(b.slug);
    return lim !== undefined && lim > 0 && b.totalMinor > lim;
  });
  if (over) parts.push(`${over.name} is ${rupees(over.totalMinor - (p.budgets.get(over.slug) as number))} over its budget.`);
  else if (p.budgetMinor) parts.push(`${percent(p.spentMinor, p.budgetMinor)}% of the ${rupees(p.budgetMinor)} household budget is used.`);
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Invites

export function inviteMessage(spaceName: string, code: string): string {
  return `Join ${spaceName} on PayMind: paymind://invite/${code} (code ${code})`;
}

/** Accepts a bare code or a pasted `paymind://invite/CODE` link. Returns null if it can't be a code. */
export function parseInviteCode(input: string): string | null {
  const t = input.trim();
  const m = /invite\/([A-Za-z0-9]+)/i.exec(t);
  const code = (m ? (m[1] as string) : t).replace(/[\s-]/g, '').toUpperCase();
  return /^[A-Z0-9]{4,16}$/.test(code) ? code : null;
}
