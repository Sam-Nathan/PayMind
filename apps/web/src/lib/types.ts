// Narrow row types from docs/schema.md. Replace with generated types from @paymind/db once available.

export type SpaceType =
  | 'trip'
  | 'event'
  | 'couple'
  | 'family'
  | 'roommates'
  | 'friends'
  | 'college'
  | 'office'
  | 'custom';

export type SpaceStatus = 'active' | 'settling' | 'settled' | 'archived';

export type SettlementStatus =
  | 'initiated'
  | 'pending'
  | 'completed'
  | 'failed'
  | 'confirmed_manual'
  | 'corrected'
  | 'cancelled';

export interface Profile {
  id: string;
  name: string | null;
  upi_vpa: string | null;
}

export interface Space {
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

export interface SpaceMember {
  id: string;
  space_id: string;
  user_id: string | null;
  display_name: string;
  upi_vpa: string | null;
  role: 'owner' | 'member';
  share_weight: number;
  left_at: string | null;
}

export interface BalanceRow {
  space_id: string;
  member_id: string;
  user_id: string | null;
  display_name: string;
  left_at: string | null;
  paid_minor: number;
  owed_minor: number;
  settled_out_minor: number;
  settled_in_minor: number;
  net_minor: number;
}

export interface Expense {
  id: string;
  owner_id: string | null;
  space_id: string | null;
  title: string;
  total_minor: number;
  paid_by_member: string | null;
  occurred_at: string;
  status: 'proposed' | 'confirmed' | 'void';
  category_id: string | null;
}

export interface Settlement {
  id: string;
  space_id: string;
  from_member: string;
  to_member: string;
  amount_minor: number;
  status: SettlementStatus;
  note_ref: string | null;
  utr: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface Category {
  id: string;
  slug: string | null;
  name: string;
}

export interface Budget {
  id: string;
  name: string | null;
  scope: string;
  period: string;
  limit_minor: number;
  category_id: string | null;
  space_id: string | null;
}

export interface TimelineEvent {
  event_type: 'expense' | 'payment' | 'goal' | 'alert';
  ref_id: string;
  space_id: string | null;
  occurred_at: string;
  title: string;
  amount_minor: number | null;
  status: string | null;
  detail: string | null;
}

export interface PrivacySettings {
  user_id: string;
  capture_notifications: boolean;
  aa_balance: boolean;
  ebills: boolean;
  keep_receipts: boolean;
  ai_enabled: boolean;
  learn_from_corrections: boolean;
  share_payment_method: boolean;
}

/** Shape returned by the public `get_pay_link(p_token)` RPC. */
export interface PayLink {
  payee_name: string;
  upi_vpa: string;
  amount_minor: number;
  note_ref: string | null;
  items: { space: string; description: string; amount_minor: number }[];
}
