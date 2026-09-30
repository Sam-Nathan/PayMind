-- PayMind schema v1 — part 1/5: extensions, schemas, enum types, generic trigger functions.
-- Money is always bigint paise (*_minor). Timestamps are timestamptz. PKs are uuid.
-- See docs/schema.md for the contract clients code against.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Non-exposed schema for RLS helpers and trigger functions. PostgREST never exposes it,
-- so nothing here is callable over the API; RLS policies call it as the invoker.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enum types (public, so generated TS types include them)
-- ---------------------------------------------------------------------------
create type public.space_type as enum
  ('trip', 'event', 'couple', 'family', 'roommates', 'friends', 'college', 'office', 'custom');
create type public.space_status as enum ('active', 'settling', 'settled', 'archived');
create type public.member_role as enum ('owner', 'member');
create type public.split_method as enum ('equal', 'ratio', 'by_room', 'by_usage', 'by_item', 'fixed');

create type public.expense_source as enum
  ('scan', 'voice', 'text', 'upi_alert', 'sms', 'ebill', 'manual', 'recurring', 'assistant');
create type public.expense_status as enum ('proposed', 'confirmed', 'void');
create type public.expense_visibility as enum ('personal', 'shared');
create type public.payment_via as enum ('upi', 'cash', 'card', 'bank', 'wallet', 'other');
create type public.item_kind as enum ('item', 'discount', 'service', 'tax', 'tip');

create type public.capture_source as enum ('upi_notification', 'sms', 'ebill', 'manual');
create type public.capture_status as enum ('inbox', 'confirmed', 'not_mine');

create type public.settlement_status as enum
  ('initiated', 'pending', 'completed', 'failed', 'confirmed_manual', 'corrected', 'cancelled');
create type public.settlement_method as enum ('upi', 'cash', 'bank', 'other');

create type public.reminder_tone as enum ('friendly', 'neutral', 'firm');
create type public.reminder_repeat as enum ('once', 'every_3_days', 'weekly');
create type public.reminder_status as enum ('active', 'done', 'cancelled');

create type public.budget_scope as enum ('monthly', 'weekly', 'category', 'group', 'event', 'trip');
create type public.budget_period as enum ('weekly', 'monthly', 'custom');

create type public.recurring_kind as enum ('subscription', 'emi', 'bill', 'other');
create type public.recurring_cadence as enum ('weekly', 'monthly', 'quarterly', 'half_yearly', 'yearly');
create type public.recurring_status as enum ('active', 'paused', 'cancelled', 'ended');

create type public.goal_status as enum ('active', 'achieved', 'archived');
create type public.proposal_status as enum ('pending', 'accepted', 'edited', 'rejected');
create type public.learned_rule_kind as enum ('category', 'merchant', 'split');
create type public.nudge_frequency as enum ('as_it_happens', 'daily', 'weekly');
create type public.device_platform as enum ('android', 'ios', 'web');

-- ---------------------------------------------------------------------------
-- Generic trigger: maintain updated_at
-- ---------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
