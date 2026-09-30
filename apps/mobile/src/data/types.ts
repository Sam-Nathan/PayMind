/**
 * Narrow row + domain types for the tables the app reads (docs/schema.md).
 * `*Row` = snake_case as PostgREST returns it; plain names = camelCase domain objects.
 * Money is integer paise in a JS number (PostgREST returns int8 as a JSON number).
 * TODO: replace with types generated into @paymind/db once they exist.
 */
import type { SpaceType } from '@paymind/core';

export type { SpaceType };
export type SpaceStatus = 'active' | 'settling' | 'settled' | 'archived';
export type PaidVia = 'upi' | 'cash' | 'card' | 'bank' | 'wallet' | 'other';
export type SplitMethod = 'equal' | 'ratio' | 'fixed' | 'shares';

export interface ProfileRow {
  id: string;
  name: string | null;
  phone: string | null;
  upi_vpa: string | null;
  locale: string | null;
  currency: string | null;
  avatar_url: string | null;
}
export interface Profile {
  id: string;
  name: string | null;
  phone: string | null;
  upiVpa: string | null;
  locale: string;
  currency: string;
  avatarUrl: string | null;
}

export interface SpaceRow {
  id: string;
  type: SpaceType;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
  budget_minor: number | null;
  currency: string;
  status: SpaceStatus;
  created_by: string | null;
  created_at: string;
}
export interface Space {
  id: string;
  type: SpaceType;
  name: string;
  startsOn: string | null;
  endsOn: string | null;
  budgetMinor: number | null;
  currency: string;
  status: SpaceStatus;
  createdBy: string | null;
  createdAt: string;
}

export interface SpaceMemberRow {
  id: string;
  space_id: string;
  user_id: string | null;
  display_name: string;
  upi_vpa: string | null;
  role: 'owner' | 'member';
  share_weight: number;
  left_at: string | null;
}
export interface SpaceMember {
  id: string;
  spaceId: string;
  userId: string | null;
  displayName: string;
  upiVpa: string | null;
  role: 'owner' | 'member';
  shareWeight: number;
  leftAt: string | null;
}

export interface BalanceRow {
  space_id: string;
  member_id: string;
  user_id: string | null;
  display_name: string;
  left_at: string | null;
  paid_minor: number | string;
  owed_minor: number | string;
  settled_out_minor: number | string;
  settled_in_minor: number | string;
  net_minor: number | string;
}
export interface Balance {
  spaceId: string;
  memberId: string;
  userId: string | null;
  displayName: string;
  leftAt: string | null;
  paidMinor: number;
  owedMinor: number;
  settledOutMinor: number;
  settledInMinor: number;
  /** > 0: the member is owed money; < 0: they owe. */
  netMinor: number;
}

export interface CategoryRow {
  id: string;
  parent_id: string | null;
  owner_id: string | null;
  slug: string | null;
  name: string;
  icon: string | null;
  sort_order: number | null;
}
export interface Category {
  id: string;
  parentId: string | null;
  ownerId: string | null;
  slug: string | null;
  name: string;
  icon: string | null;
  sortOrder: number;
}

export interface ExpenseRow {
  id: string;
  owner_id: string | null;
  space_id: string | null;
  title: string;
  merchant_id: string | null;
  category_id: string | null;
  total_minor: number | string;
  currency: string;
  paid_by_member: string | null;
  paid_via: PaidVia | null;
  occurred_at: string;
  source: string;
  status: 'proposed' | 'confirmed' | 'void';
}
export interface Expense {
  id: string;
  ownerId: string | null;
  spaceId: string | null;
  title: string;
  merchantId: string | null;
  categoryId: string | null;
  totalMinor: number;
  currency: string;
  paidByMember: string | null;
  paidVia: PaidVia | null;
  occurredAt: string;
  source: string;
  status: 'proposed' | 'confirmed' | 'void';
}

export interface RecurringRow {
  id: string;
  name: string;
  kind: 'subscription' | 'emi' | 'bill' | 'other';
  cadence: string;
  expected_minor: number | string;
  last_amount_minor: number | string | null;
  next_due: string | null;
  status: string;
  flags: Record<string, unknown> | null;
}
export interface RecurringItem {
  id: string;
  name: string;
  kind: RecurringRow['kind'];
  cadence: string;
  expectedMinor: number;
  lastAmountMinor: number | null;
  nextDue: string | null;
  /** e.g. "Price up ₹150 since August", if the detector flagged a price change. */
  priceUpMinor: number | null;
}

export interface GoalRow {
  id: string;
  name: string;
  target_minor: number | string;
  target_date: string | null;
  status: string;
  goal_contributions?: { amount_minor: number | string }[] | null;
}
export interface Goal {
  id: string;
  name: string;
  targetMinor: number;
  targetDate: string | null;
  savedMinor: number;
}

export interface Insight {
  id: string;
  headline: string;
  body: string;
}

/** A space with everything the list screens need. */
export interface SpaceSummary {
  space: Space;
  memberCount: number;
  /** Σ confirmed expenses in the space. */
  totalMinor: number;
  /** The current user's net in the space (paise). */
  myNetMinor: number;
  status: 'owe' | 'owed' | 'square';
}
