import type {
  Balance,
  BalanceRow,
  Category,
  CategoryRow,
  Expense,
  ExpenseRow,
  Goal,
  GoalRow,
  Profile,
  ProfileRow,
  RecurringItem,
  RecurringRow,
  Space,
  SpaceMember,
  SpaceMemberRow,
  SpaceRow,
} from './types.ts';

/** int8 arrives as a number, sums (numeric) may arrive as strings; always return a safe integer. */
export function toMinor(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export const mapProfile = (r: ProfileRow): Profile => ({
  id: r.id,
  name: r.name,
  phone: r.phone,
  upiVpa: r.upi_vpa,
  locale: r.locale ?? 'en-IN',
  currency: r.currency ?? 'INR',
  avatarUrl: r.avatar_url,
});

export const mapSpace = (r: SpaceRow): Space => ({
  id: r.id,
  type: r.type,
  name: r.name,
  startsOn: r.starts_on,
  endsOn: r.ends_on,
  budgetMinor: r.budget_minor === null ? null : toMinor(r.budget_minor),
  currency: r.currency,
  status: r.status,
  createdBy: r.created_by,
  createdAt: r.created_at,
});

export const mapMember = (r: SpaceMemberRow): SpaceMember => ({
  id: r.id,
  spaceId: r.space_id,
  userId: r.user_id,
  displayName: r.display_name,
  upiVpa: r.upi_vpa,
  role: r.role,
  shareWeight: Number(r.share_weight ?? 1),
  leftAt: r.left_at,
});

export const mapBalance = (r: BalanceRow): Balance => ({
  spaceId: r.space_id,
  memberId: r.member_id,
  userId: r.user_id,
  displayName: r.display_name,
  leftAt: r.left_at,
  paidMinor: toMinor(r.paid_minor),
  owedMinor: toMinor(r.owed_minor),
  settledOutMinor: toMinor(r.settled_out_minor),
  settledInMinor: toMinor(r.settled_in_minor),
  netMinor: toMinor(r.net_minor),
});

export const mapCategory = (r: CategoryRow): Category => ({
  id: r.id,
  parentId: r.parent_id,
  ownerId: r.owner_id,
  slug: r.slug,
  name: r.name,
  icon: r.icon,
  sortOrder: r.sort_order ?? 0,
});

export const mapExpense = (r: ExpenseRow): Expense => ({
  id: r.id,
  ownerId: r.owner_id,
  spaceId: r.space_id,
  title: r.title,
  merchantId: r.merchant_id,
  categoryId: r.category_id,
  totalMinor: toMinor(r.total_minor),
  currency: r.currency,
  paidByMember: r.paid_by_member,
  paidVia: r.paid_via,
  occurredAt: r.occurred_at,
  source: r.source,
  status: r.status,
});

/** `flags.price_change` = { from_minor, to_minor } is the assumed shape written by the detector job. */
function priceUp(flags: Record<string, unknown> | null): number | null {
  const pc = flags?.['price_change'];
  if (pc && typeof pc === 'object') {
    const { from_minor, to_minor } = pc as { from_minor?: unknown; to_minor?: unknown };
    if (typeof from_minor === 'number' && typeof to_minor === 'number' && to_minor > from_minor) {
      return to_minor - from_minor;
    }
  }
  return null;
}

export const mapRecurring = (r: RecurringRow): RecurringItem => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  cadence: r.cadence,
  expectedMinor: toMinor(r.expected_minor),
  lastAmountMinor: r.last_amount_minor === null ? null : toMinor(r.last_amount_minor),
  nextDue: r.next_due,
  priceUpMinor: priceUp(r.flags),
});

export const mapGoal = (r: GoalRow): Goal => ({
  id: r.id,
  name: r.name,
  targetMinor: toMinor(r.target_minor),
  targetDate: r.target_date,
  savedMinor: (r.goal_contributions ?? []).reduce((a, c) => a + toMinor(c.amount_minor), 0),
});
