-- PayMind schema v1 — part 2/5: tables, constraints, indexes, updated_at triggers.
--
-- Integrity notes
-- * Rows that belong to a space carry space_id, and composite FKs (space_id, member_id) ->
--   space_members(space_id, id) guarantee every referenced member belongs to that same space.
-- * expense_shares / item_shares repeat the expense's space_id and reference
--   expenses(id, space_id), so a share can only exist on a shared expense and only for
--   members of its space.
-- * FKs to auth.users are ON DELETE CASCADE for personal data and ON DELETE SET NULL for
--   shared data (account deletion keeps shared rows, anonymised; see part 4).

-- ---------------------------------------------------------------------------
-- profiles (1:1 auth.users; created by trigger on auth.users insert)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text,
  phone       text,
  upi_vpa     text,
  locale      text not null default 'en-IN' check (locale in ('en-IN', 'hi-IN', 'kn-IN')),
  currency    char(3) not null default 'INR',
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- ---------------------------------------------------------------------------
-- spaces + members
-- ---------------------------------------------------------------------------
create table public.spaces (
  id             uuid primary key default gen_random_uuid(),
  type           public.space_type not null,
  name           text not null check (length(btrim(name)) > 0),
  starts_on      date,
  ends_on        date,
  budget_minor   bigint check (budget_minor is null or budget_minor >= 0),
  currency       char(3) not null default 'INR',
  default_split  jsonb not null default '{"method": "equal"}'::jsonb,
  status         public.space_status not null default 'active',
  created_by     uuid default auth.uid() references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint spaces_dates_ordered check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create index spaces_created_by_idx on public.spaces (created_by);

create table public.space_members (
  id            uuid primary key default gen_random_uuid(),
  space_id      uuid not null references public.spaces (id) on delete cascade,
  user_id       uuid references auth.users (id) on delete set null,  -- null = not on the app / former member
  display_name  text not null check (length(btrim(display_name)) > 0),
  upi_vpa       text,
  role          public.member_role not null default 'member',
  share_weight  numeric(12, 4) not null default 1 check (share_weight > 0),
  joined_at     timestamptz not null default now(),
  left_at       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint space_members_space_id_id_key unique (space_id, id)  -- target of composite FKs
);
create unique index space_members_space_user_key on public.space_members (space_id, user_id)
  where user_id is not null;
-- Supports private.my_space_ids() / my_member_ids(): the hot path of every RLS check.
create index space_members_active_user_idx on public.space_members (user_id, space_id)
  where left_at is null;

create table public.split_rules (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces (id) on delete cascade,
  name        text,
  bill_kind   text not null,                      -- e.g. 'rent', 'electricity', 'groceries', '*'
  method      public.split_method not null,
  params      jsonb not null default '{}'::jsonb, -- shape owned by packages/core
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index split_rules_space_idx on public.split_rules (space_id);
create index split_rules_created_by_idx on public.split_rules (created_by);

-- ---------------------------------------------------------------------------
-- categories, merchants
-- ---------------------------------------------------------------------------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references public.categories (id) on delete cascade,
  owner_id    uuid references auth.users (id) on delete cascade,  -- null = system category
  slug        text,                                               -- stable key for system rows
  name        text not null,
  icon        text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create unique index categories_system_slug_key on public.categories (slug) where owner_id is null;
create index categories_owner_idx on public.categories (owner_id);
create index categories_parent_idx on public.categories (parent_id);

create table public.merchants (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid references auth.users (id) on delete cascade,  -- null = global catalogue
  canonical_name  text not null,
  category_id     uuid references public.categories (id) on delete set null,
  created_at      timestamptz not null default now()
);
create index merchants_owner_idx on public.merchants (owner_id);
create index merchants_category_idx on public.merchants (category_id);
create unique index merchants_owner_name_key
  on public.merchants (coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(canonical_name));

create table public.merchant_aliases (
  id           uuid primary key default gen_random_uuid(),
  merchant_id  uuid not null references public.merchants (id) on delete cascade,
  owner_id     uuid references auth.users (id) on delete cascade,  -- null = global
  raw_text     text not null,       -- e.g. 'UBER *TRIP HELP.UBER', 'UBERRIDES BLR'
  vpa          text,                -- e.g. 'uber.india@upi' (store lower-case)
  created_at   timestamptz not null default now()
);
create index merchant_aliases_merchant_idx on public.merchant_aliases (merchant_id);
create index merchant_aliases_owner_idx on public.merchant_aliases (owner_id);
create index merchant_aliases_vpa_idx on public.merchant_aliases (vpa) where vpa is not null;
create index merchant_aliases_raw_text_trgm on public.merchant_aliases
  using gin (raw_text extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- AI proposals (AI proposes, people confirm)
-- ---------------------------------------------------------------------------
create table public.ai_proposals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  space_id    uuid references public.spaces (id) on delete cascade,
  kind        text not null,        -- 'create_expense' | 'split' | 'categorize' | 'reminder' | ...
  payload     jsonb not null,
  status      public.proposal_status not null default 'pending',
  result_ref  uuid,                 -- id of the row created on accept (e.g. expenses.id)
  model       text,
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);
create index ai_proposals_user_idx on public.ai_proposals (user_id, status, created_at desc);
create index ai_proposals_space_idx on public.ai_proposals (space_id);

-- ---------------------------------------------------------------------------
-- recurring series (subscriptions, EMIs, bills)
-- ---------------------------------------------------------------------------
create table public.recurring_series (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users (id) on delete cascade,
  space_id            uuid references public.spaces (id) on delete cascade,  -- e.g. flat internet
  merchant_id         uuid references public.merchants (id) on delete set null,
  category_id         uuid references public.categories (id) on delete set null,
  name                text not null,
  kind                public.recurring_kind not null,
  cadence             public.recurring_cadence not null default 'monthly',
  expected_minor      bigint check (expected_minor is null or expected_minor > 0),
  last_amount_minor   bigint,
  amount_varies       boolean not null default false,
  next_due            date,
  installments_total  int check (installments_total is null or installments_total > 0),
  installments_paid   int not null default 0 check (installments_paid >= 0),
  flags               jsonb not null default '{}'::jsonb,  -- {price_up, overlap, unused, ...}
  status              public.recurring_status not null default 'active',
  remind_days_before  int,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index recurring_series_user_idx on public.recurring_series (user_id, next_due);
create index recurring_series_space_idx on public.recurring_series (space_id);
create index recurring_series_merchant_idx on public.recurring_series (merchant_id);
create index recurring_series_category_idx on public.recurring_series (category_id);

-- ---------------------------------------------------------------------------
-- captured_txns (auto-capture inbox). FK to expenses is added after expenses exists.
-- ---------------------------------------------------------------------------
create table public.captured_txns (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source        public.capture_source not null,
  raw           text,                -- optional; on-device parsing sends minimal fields
  parsed        jsonb not null default '{}'::jsonb,
  amount_minor  bigint not null check (amount_minor > 0),
  payee         text,
  vpa           text,
  occurred_at   timestamptz not null,
  status        public.capture_status not null default 'inbox',
  dedupe_hash   text not null,
  suggested_category_id uuid references public.categories (id) on delete set null,
  expense_id    uuid,                -- set when confirmed
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint captured_txns_user_dedupe_key unique (user_id, dedupe_hash)
);
create index captured_txns_user_status_idx on public.captured_txns (user_id, status, occurred_at desc);
create index captured_txns_expense_idx on public.captured_txns (expense_id);
create index captured_txns_category_idx on public.captured_txns (suggested_category_id);

-- ---------------------------------------------------------------------------
-- expenses
-- ---------------------------------------------------------------------------
create table public.expenses (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             uuid default auth.uid() references auth.users (id) on delete set null, -- creator; null = former member
  space_id             uuid references public.spaces (id) on delete cascade,                 -- null = personal
  visibility           public.expense_visibility not null
                         generated always as (case when space_id is null then 'personal'::public.expense_visibility
                                                   else 'shared'::public.expense_visibility end) stored,
  title                text,
  merchant_id          uuid references public.merchants (id) on delete set null,
  category_id          uuid references public.categories (id) on delete set null,
  total_minor          bigint not null check (total_minor > 0),
  currency             char(3) not null default 'INR',
  paid_by_member       uuid,
  paid_via             public.payment_via,
  occurred_at          timestamptz not null default now(),
  source               public.expense_source not null default 'manual',
  status               public.expense_status not null default 'confirmed',
  captured_txn_id      uuid references public.captured_txns (id) on delete set null,
  proposal_id          uuid references public.ai_proposals (id) on delete set null,
  recurring_series_id  uuid references public.recurring_series (id) on delete set null,
  receipt_path         text,        -- storage object path, if the user keeps receipts
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint expenses_id_space_key unique (id, space_id),  -- target of composite FKs
  -- AI drafts live in ai_proposals; 'proposed' expenses are personal-only, so every shared
  -- expense (and its shares) is visible to the whole space.
  constraint expenses_proposed_personal_only check (status <> 'proposed' or space_id is null),
  constraint expenses_payer_matches_visibility
    check ((space_id is null and paid_by_member is null) or (space_id is not null and paid_by_member is not null)),
  constraint expenses_paid_by_member_fkey foreign key (space_id, paid_by_member)
    references public.space_members (space_id, id)
);
create index expenses_owner_occurred_idx on public.expenses (owner_id, occurred_at desc);
create index expenses_space_occurred_idx on public.expenses (space_id, occurred_at desc) where space_id is not null;
create index expenses_space_payer_idx on public.expenses (space_id, paid_by_member) where space_id is not null;
create index expenses_merchant_idx on public.expenses (merchant_id);
create index expenses_category_idx on public.expenses (category_id);
create index expenses_captured_idx on public.expenses (captured_txn_id);
create index expenses_proposal_idx on public.expenses (proposal_id);
create index expenses_recurring_idx on public.expenses (recurring_series_id);

alter table public.captured_txns
  add constraint captured_txns_expense_id_fkey foreign key (expense_id)
  references public.expenses (id) on delete set null;

create table public.expense_items (
  id                uuid primary key default gen_random_uuid(),
  expense_id        uuid not null references public.expenses (id) on delete cascade,
  position          int not null default 0,
  name              text not null,
  qty               numeric(10, 3) not null default 1 check (qty > 0),
  unit_price_minor  bigint,
  amount_minor      bigint not null,   -- line total; negative only for discounts
  kind              public.item_kind not null default 'item',
  category_id       uuid references public.categories (id) on delete set null,
  created_at        timestamptz not null default now(),
  constraint expense_items_id_expense_key unique (id, expense_id),
  constraint expense_items_sign check ((kind = 'discount' and amount_minor <= 0) or (kind <> 'discount' and amount_minor >= 0))
);
create index expense_items_expense_idx on public.expense_items (expense_id, position);
create index expense_items_category_idx on public.expense_items (category_id);

create table public.item_shares (
  item_id       uuid not null,
  expense_id    uuid not null,
  space_id      uuid not null,
  member_id     uuid not null,
  units         numeric(10, 3),       -- by-quantity splits (e.g. 2 naans)
  pct           numeric(7, 4),        -- custom % splits
  amount_minor  bigint not null,      -- this member's allocation of the item (negative for discounts)
  primary key (item_id, member_id),
  constraint item_shares_item_fkey foreign key (item_id, expense_id)
    references public.expense_items (id, expense_id) on delete cascade,
  constraint item_shares_expense_fkey foreign key (expense_id, space_id)
    references public.expenses (id, space_id) on delete cascade,
  constraint item_shares_member_fkey foreign key (space_id, member_id)
    references public.space_members (space_id, id)
);
create index item_shares_item_expense_idx on public.item_shares (item_id, expense_id);
create index item_shares_expense_idx on public.item_shares (expense_id, space_id);
create index item_shares_member_idx on public.item_shares (space_id, member_id);

-- Materialised result of the split: what each member owes for the expense.
create table public.expense_shares (
  expense_id  uuid not null,
  space_id    uuid not null,
  member_id   uuid not null,
  owed_minor  bigint not null check (owed_minor >= 0),
  primary key (expense_id, member_id),
  constraint expense_shares_expense_fkey foreign key (expense_id, space_id)
    references public.expenses (id, space_id) on delete cascade,
  constraint expense_shares_member_fkey foreign key (space_id, member_id)
    references public.space_members (space_id, id)
);
create index expense_shares_expense_space_idx on public.expense_shares (expense_id, space_id);
create index expense_shares_member_idx on public.expense_shares (space_id, member_id);

-- A user's private note on any expense (personal or shared). Owner-only, never shared.
create table public.expense_notes (
  expense_id  uuid not null references public.expenses (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  note        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (expense_id, user_id)
);
create index expense_notes_user_idx on public.expense_notes (user_id);

-- Bill Detective flags ("explain, don't accuse")
create table public.bill_flags (
  id           uuid primary key default gen_random_uuid(),
  expense_id   uuid not null references public.expenses (id) on delete cascade,
  type         text not null,       -- 'double_entry' | 'service_charge' | 'subtotal_mismatch' | 'tax_rate' | ...
  reason       text not null,
  item_id      uuid references public.expense_items (id) on delete set null,
  resolution   text,                -- e.g. 'removed' | 'kept' | 'we_had_4' | 'was_removed'
  resolved_by  uuid references auth.users (id) on delete set null,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index bill_flags_expense_idx on public.bill_flags (expense_id);
create index bill_flags_item_idx on public.bill_flags (item_id);
create index bill_flags_resolved_by_idx on public.bill_flags (resolved_by);

-- ---------------------------------------------------------------------------
-- settlements (state only; PayMind never moves money)
-- ---------------------------------------------------------------------------
create table public.settlements (
  id                    uuid primary key default gen_random_uuid(),
  space_id              uuid not null references public.spaces (id) on delete cascade,
  from_member           uuid not null,
  to_member             uuid not null,
  amount_minor          bigint not null check (amount_minor > 0),
  status                public.settlement_status not null default 'initiated',
  note_ref              text,        -- note that travels with the UPI payment, e.g. 'PM-402-SEP'
  utr                   text,        -- optional UPI reference
  corrected_from_minor  bigint,      -- previous amount, set by trigger on correction
  created_by            uuid default auth.uid() references auth.users (id) on delete set null,
  completed_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint settlements_distinct_parties check (from_member <> to_member),
  constraint settlements_from_fkey foreign key (space_id, from_member)
    references public.space_members (space_id, id),
  constraint settlements_to_fkey foreign key (space_id, to_member)
    references public.space_members (space_id, id)
);
create index settlements_space_idx on public.settlements (space_id, created_at desc);
create index settlements_from_idx on public.settlements (space_id, from_member);
create index settlements_to_idx on public.settlements (space_id, to_member);
create index settlements_created_by_idx on public.settlements (created_by);

-- "How I paid" is private by default: kept out of settlements and gated by RLS
-- (visible to its recorder, the payer, and — only if the payer's
-- privacy_settings.share_payment_method is on — the rest of the space).
create table public.settlement_methods (
  settlement_id  uuid primary key references public.settlements (id) on delete cascade,
  method         public.settlement_method not null,
  upi_app        text,               -- 'phonepe' | 'gpay' | 'paytm' | 'bhim' | 'other'
  created_by     uuid default auth.uid() references auth.users (id) on delete cascade,
  created_at     timestamptz not null default now()
);
create index settlement_methods_created_by_idx on public.settlement_methods (created_by);

-- ---------------------------------------------------------------------------
-- reminders
-- ---------------------------------------------------------------------------
create table public.reminders (
  id            uuid primary key default gen_random_uuid(),
  from_user     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  to_member     uuid not null references public.space_members (id) on delete cascade,
  amount_minor  bigint not null check (amount_minor > 0),
  items         jsonb not null default '[]'::jsonb,  -- [{space_id, label, amount_minor}]
  tone          public.reminder_tone not null default 'friendly',
  repeat        public.reminder_repeat not null default 'once',
  status        public.reminder_status not null default 'active',
  message       text,
  next_at       timestamptz,
  last_sent_at  timestamptz,
  link_token    text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index reminders_from_user_idx on public.reminders (from_user);
create index reminders_to_member_idx on public.reminders (to_member);
create index reminders_due_idx on public.reminders (next_at) where status = 'active';

-- ---------------------------------------------------------------------------
-- budgets, goals
-- ---------------------------------------------------------------------------
create table public.budgets (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid references auth.users (id) on delete cascade,
  space_id     uuid references public.spaces (id) on delete cascade,
  scope        public.budget_scope not null,
  period       public.budget_period not null default 'monthly',
  name         text,
  category_id  uuid references public.categories (id) on delete set null,
  limit_minor  bigint not null check (limit_minor > 0),
  starts_on    date,
  ends_on      date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint budgets_one_owner check (num_nonnulls(owner_id, space_id) = 1)
);
create index budgets_owner_idx on public.budgets (owner_id);
create index budgets_space_idx on public.budgets (space_id);
create index budgets_category_idx on public.budgets (category_id);

create table public.goals (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid references auth.users (id) on delete cascade,
  space_id      uuid references public.spaces (id) on delete cascade,
  name          text not null,
  target_minor  bigint not null check (target_minor > 0),
  target_date   date,
  status        public.goal_status not null default 'active',
  created_by    uuid default auth.uid() references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint goals_one_owner check (num_nonnulls(owner_id, space_id) = 1)
);
create index goals_owner_idx on public.goals (owner_id);
create index goals_space_idx on public.goals (space_id);
create index goals_created_by_idx on public.goals (created_by);

create table public.goal_contributions (
  id              uuid primary key default gen_random_uuid(),
  goal_id         uuid not null references public.goals (id) on delete cascade,
  member_id       uuid references public.space_members (id),   -- for space goals
  user_id         uuid default auth.uid() references auth.users (id) on delete set null,
  amount_minor    bigint not null check (amount_minor > 0),
  contributed_at  timestamptz not null default now(),
  note            text,
  created_at      timestamptz not null default now()
);
create index goal_contributions_goal_idx on public.goal_contributions (goal_id, contributed_at desc);
create index goal_contributions_member_idx on public.goal_contributions (member_id);
create index goal_contributions_user_idx on public.goal_contributions (user_id);

-- ---------------------------------------------------------------------------
-- learning, anomalies
-- ---------------------------------------------------------------------------
create table public.learned_rules (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind             public.learned_rule_kind not null,
  match            jsonb not null,
  action           jsonb not null,
  hits             int not null default 0,
  last_applied_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index learned_rules_user_idx on public.learned_rules (user_id, kind);

create table public.anomalies (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  expense_id   uuid references public.expenses (id) on delete cascade,
  reason       text not null,
  resolution   text,              -- 'looks_right' | 'split' | 'unknown'
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index anomalies_user_idx on public.anomalies (user_id, created_at desc);
create index anomalies_expense_idx on public.anomalies (expense_id);

-- ---------------------------------------------------------------------------
-- per-user settings (rows created by the auth.users trigger)
-- ---------------------------------------------------------------------------
create table public.notification_prefs (
  user_id               uuid primary key references auth.users (id) on delete cascade,
  budget_alerts         boolean not null default true,
  money_nudges          boolean not null default true,
  settlement_reminders  boolean not null default true,
  unusual_activity      boolean not null default true,
  nudge_frequency       public.nudge_frequency not null default 'daily',
  nudge_category_ids    uuid[] not null default '{}',
  updated_at            timestamptz not null default now()
);

create table public.privacy_settings (
  user_id                 uuid primary key references auth.users (id) on delete cascade,
  capture_notifications   boolean not null default false,   -- UPI & bank alerts (opt-in)
  aa_balance              boolean not null default false,   -- Account Aggregator balance
  aa_consent_expires_at   timestamptz,
  ebills                  boolean not null default false,
  ebill_senders           text[] not null default '{}',
  keep_receipts           boolean not null default false,   -- off = discard image after parsing
  ai_enabled              boolean not null default true,
  learn_from_corrections  boolean not null default true,
  share_payment_method    boolean not null default false,   -- "How I paid" visible to space members
  quiet_hours_enabled     boolean not null default true,
  quiet_hours_start       time not null default '22:00',
  quiet_hours_end         time not null default '08:00',
  updated_at              timestamptz not null default now()
);

create table public.devices (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  expo_push_token  text not null unique,
  platform         public.device_platform not null,
  app_version      text,
  last_seen_at     timestamptz not null default now(),
  created_at       timestamptz not null default now()
);
create index devices_user_idx on public.devices (user_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'spaces', 'space_members', 'split_rules', 'recurring_series', 'captured_txns',
    'expenses', 'expense_notes', 'settlements', 'reminders', 'budgets', 'goals',
    'learned_rules', 'notification_prefs', 'privacy_settings'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function private.set_updated_at()', t);
  end loop;
end;
$$;
