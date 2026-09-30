-- PayMind schema v1 — part 7: performance (RLS predicate shape + cheaper balances view).
-- (Part 6 is reserved for the Edge Functions / pay-link migration.)
--
-- 1. SELECT policies: `space_id in (select private.my_space_ids())` becomes
--    `space_id = any (array(select private.my_space_ids()))`.
--    Same rows, same privacy model. The IN form is planned as a *hashed SubPlan filter*, which
--    cannot drive an index, so every "across all my spaces" read (Home, Spaces, timeline,
--    balances without a space_id filter, Realtime RLS checks) sequentially scanned the whole
--    table — every user's rows. The `= any(array(...))` form is an InitPlan that yields an
--    array; the planner uses it as an index condition (and BitmapOr with owner_id), so the cost
--    is proportional to the caller's own spaces instead of the table size.
--    Measured on a local PG 17 with 300k expenses / 1.8M shares / 1000 spaces, user in 20 spaces:
--      expenses newest-100 list       65 ms -> 9 ms
--      timeline_events newest-100     90 ms -> 13 ms
--      balances (all my spaces)      474 ms -> 38 ms  (together with 2.)
--    Write policies are left as they are: writes target rows by primary key.
--
-- 2. balances: aggregate the ledger per (space_id, member_id) *before* joining members.
--    The old shape (members LEFT JOIN ledger, then GROUP BY member) could be planned as a
--    nested loop that re-ran the whole ledger once per member. Same columns, same results.

-- ---------------------------------------------------------------------------
-- 1. SELECT policies
-- ---------------------------------------------------------------------------
drop policy spaces_select on public.spaces;
create policy spaces_select on public.spaces for select to authenticated
  using (id = any (array(select private.my_space_ids())) or created_by = (select auth.uid()));

drop policy space_members_select on public.space_members;
create policy space_members_select on public.space_members for select to authenticated
  using (space_id = any (array(select private.my_space_ids())) or user_id = (select auth.uid()));

drop policy split_rules_select on public.split_rules;
create policy split_rules_select on public.split_rules for select to authenticated
  using (space_id = any (array(select private.my_space_ids())));

drop policy recurring_series_select on public.recurring_series;
create policy recurring_series_select on public.recurring_series for select to authenticated
  using (user_id = (select auth.uid()) or space_id = any (array(select private.my_space_ids())));

drop policy expenses_select on public.expenses;
create policy expenses_select on public.expenses for select to authenticated
  using (owner_id = (select auth.uid()) or space_id = any (array(select private.my_space_ids())));

drop policy item_shares_select on public.item_shares;
create policy item_shares_select on public.item_shares for select to authenticated
  using (space_id = any (array(select private.my_space_ids())));

drop policy expense_shares_select on public.expense_shares;
create policy expense_shares_select on public.expense_shares for select to authenticated
  using (space_id = any (array(select private.my_space_ids())));

drop policy settlements_select on public.settlements;
create policy settlements_select on public.settlements for select to authenticated
  using (space_id = any (array(select private.my_space_ids())));

drop policy budgets_select on public.budgets;
create policy budgets_select on public.budgets for select to authenticated
  using (owner_id = (select auth.uid()) or space_id = any (array(select private.my_space_ids())));

drop policy goals_select on public.goals;
create policy goals_select on public.goals for select to authenticated
  using (owner_id = (select auth.uid()) or space_id = any (array(select private.my_space_ids())));

-- ---------------------------------------------------------------------------
-- 2. balances: aggregate first, then join members (columns unchanged)
-- ---------------------------------------------------------------------------
create or replace view public.balances with (security_invoker = true) as
with ledger as (
  select e.space_id, e.paid_by_member as member_id,
         e.total_minor as paid, 0::bigint as owed, 0::bigint as sent, 0::bigint as received
  from public.expenses e
  where e.status = 'confirmed' and e.space_id is not null
  union all
  select s.space_id, s.member_id, 0, s.owed_minor, 0, 0
  from public.expense_shares s
  join public.expenses e on e.id = s.expense_id and e.space_id = s.space_id
  where e.status = 'confirmed'
  union all
  select st.space_id, st.from_member, 0, 0, st.amount_minor, 0
  from public.settlements st
  where st.status in ('completed', 'confirmed_manual', 'corrected')
  union all
  select st.space_id, st.to_member, 0, 0, 0, st.amount_minor
  from public.settlements st
  where st.status in ('completed', 'confirmed_manual', 'corrected')
),
totals as (
  select l.space_id, l.member_id,
         sum(l.paid) as paid, sum(l.owed) as owed, sum(l.sent) as sent, sum(l.received) as received
  from ledger l
  group by l.space_id, l.member_id
)
select
  m.space_id,
  m.id as member_id,
  m.user_id,
  m.display_name,
  m.left_at,
  coalesce(t.paid, 0)::bigint     as paid_minor,
  coalesce(t.owed, 0)::bigint     as owed_minor,
  coalesce(t.sent, 0)::bigint     as settled_out_minor,
  coalesce(t.received, 0)::bigint as settled_in_minor,
  coalesce(t.paid - t.owed + t.sent - t.received, 0)::bigint as net_minor
from public.space_members m
left join totals t on t.space_id = m.space_id and t.member_id = m.id;
