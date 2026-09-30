-- PayMind schema v1 — part 4/5: views, RPC functions, grants, realtime.
--
-- Error convention for RPCs: `raise exception '<code>: <detail>'` where <code> is a stable
-- snake_case token clients can match on (see docs/schema.md). SQLSTATEs:
--   42501 not authenticated / not allowed / not found-or-forbidden  (PostgREST -> 401/403)
--   22023 invalid input (PostgREST -> 400)
--   23514 money invariant violated at commit (PostgREST -> 400)

-- ---------------------------------------------------------------------------
-- balances: net per member per space.
--   net = paid (confirmed shared expenses) − owed (their shares)
--         + settlements sent − settlements received   (completed | confirmed_manual | corrected)
-- net > 0: the space owes this member; net < 0: this member owes. Sum of net in a space is 0.
-- security_invoker: RLS of the caller applies, so only spaces the caller belongs to appear.
-- Always filter by space_id (or member_id); the join on space_id lets the planner push the
-- filter into every branch.
-- ---------------------------------------------------------------------------
create view public.balances with (security_invoker = true) as
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
)
select
  m.space_id,
  m.id as member_id,
  m.user_id,
  m.display_name,
  m.left_at,
  coalesce(sum(l.paid), 0)::bigint     as paid_minor,
  coalesce(sum(l.owed), 0)::bigint     as owed_minor,
  coalesce(sum(l.sent), 0)::bigint     as settled_out_minor,
  coalesce(sum(l.received), 0)::bigint as settled_in_minor,
  coalesce(sum(l.paid - l.owed + l.sent - l.received), 0)::bigint as net_minor
from public.space_members m
left join ledger l on l.space_id = m.space_id and l.member_id = m.id
group by m.id;

-- settlements + payment method where the caller may see it (method/upi_app are NULL otherwise).
create view public.settlements_with_method with (security_invoker = true) as
select s.*, sm.method, sm.upi_app
from public.settlements s
left join public.settlement_methods sm on sm.settlement_id = s.id;

-- Unified timeline (feature 42). RLS of each source table applies.
create view public.timeline_events with (security_invoker = true) as
select 'expense'::text as event_type, e.id as ref_id, e.space_id, e.occurred_at,
       e.title, e.total_minor as amount_minor, e.status::text as status, e.source::text as detail
from public.expenses e
union all
select 'payment', s.id, s.space_id, coalesce(s.completed_at, s.created_at),
       fm.display_name || ' → ' || tm.display_name, s.amount_minor, s.status::text, null
from public.settlements s
join public.space_members fm on fm.id = s.from_member
join public.space_members tm on tm.id = s.to_member
union all
select 'goal', gc.id, g.space_id, gc.contributed_at, g.name, gc.amount_minor, null, null
from public.goal_contributions gc
join public.goals g on g.id = gc.goal_id
union all
select 'alert', a.id, null::uuid, a.created_at, a.reason, x.total_minor, a.resolution, null
from public.anomalies a
left join public.expenses x on x.id = a.expense_id;

-- ---------------------------------------------------------------------------
-- create_space
-- p_members: [{"display_name": text, "upi_vpa"?: text, "user_id"?: uuid, "share_weight"?: number}]
-- The caller is always added as the owner member (display_name from profiles.name).
-- ---------------------------------------------------------------------------
create or replace function public.create_space(
  p_name text,
  p_type public.space_type,
  p_starts_on date default null,
  p_ends_on date default null,
  p_budget_minor bigint default null,
  p_members jsonb default '[]'::jsonb,
  p_default_split jsonb default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_space uuid;
  v_name text;
  v_vpa text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_members is not null and jsonb_typeof(p_members) <> 'array' then
    raise exception 'invalid_members: p_members must be a JSON array' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_members, '[]'::jsonb)) x
    where nullif(btrim(x ->> 'display_name'), '') is null
  ) then
    raise exception 'member_display_name_required' using errcode = '22023';
  end if;

  insert into public.spaces (type, name, starts_on, ends_on, budget_minor, default_split, created_by)
  values (p_type, btrim(p_name), p_starts_on, p_ends_on, p_budget_minor,
          coalesce(p_default_split, '{"method": "equal"}'::jsonb), v_uid)
  returning id into v_space;

  select nullif(btrim(p.name), ''), p.upi_vpa into v_name, v_vpa
  from public.profiles p where p.id = v_uid;

  insert into public.space_members (space_id, user_id, display_name, upi_vpa, role)
  values (v_space, v_uid, coalesce(v_name, 'Me'), v_vpa, 'owner');

  insert into public.space_members (space_id, user_id, display_name, upi_vpa, share_weight, role)
  select v_space, x.user_id, btrim(x.display_name), nullif(btrim(x.upi_vpa), ''),
         coalesce(x.share_weight, 1), 'member'
  from jsonb_to_recordset(coalesce(p_members, '[]'::jsonb))
       as x(display_name text, upi_vpa text, user_id uuid, share_weight numeric)
  where x.user_id is distinct from v_uid;

  return v_space;
end;
$$;

-- ---------------------------------------------------------------------------
-- Shared validation + child-row writer for create_expense / update_expense.
-- Assumes the expenses row already exists with the given space_id / total.
-- ---------------------------------------------------------------------------
create or replace function private.write_expense_children(
  p_expense_id uuid, p_space_id uuid, p_total bigint, p jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_shares jsonb := coalesce(p -> 'shares', '[]'::jsonb);
  v_items  jsonb := coalesce(p -> 'items', '[]'::jsonb);
  v_item jsonb;
  v_pos bigint;
  v_item_id uuid;
  v_item_amount bigint;
  v_count int;
  v_distinct int;
  v_bad int;
  v_sum bigint;
  v_all_items_shared boolean := true;
begin
  if jsonb_typeof(v_shares) <> 'array' or jsonb_typeof(v_items) <> 'array' then
    raise exception 'invalid_payload: items and shares must be arrays' using errcode = '22023';
  end if;

  -- expense_shares ---------------------------------------------------------
  if p_space_id is null then
    if jsonb_array_length(v_shares) > 0 then
      raise exception 'shares_not_allowed_on_personal_expense' using errcode = '22023';
    end if;
  else
    if jsonb_array_length(v_shares) = 0 then
      raise exception 'shares_required: a shared expense needs expense_shares' using errcode = '22023';
    end if;
    select count(*), count(distinct x.member_id),
           count(*) filter (where x.member_id is null or x.owed_minor is null or x.owed_minor < 0),
           coalesce(sum(x.owed_minor), 0)
      into v_count, v_distinct, v_bad, v_sum
    from jsonb_to_recordset(v_shares) as x(member_id uuid, owed_minor bigint);
    if v_bad > 0 then
      raise exception 'invalid_share: every share needs member_id and owed_minor >= 0' using errcode = '22023';
    end if;
    if v_distinct <> v_count then
      raise exception 'duplicate_share_member' using errcode = '22023';
    end if;
    if v_sum <> p_total then
      raise exception 'shares_sum_mismatch: shares sum to % but total_minor is %', v_sum, p_total
        using errcode = '22023';
    end if;
    select count(*) into v_bad
    from jsonb_to_recordset(v_shares) as x(member_id uuid)
    where not exists (
      select 1 from public.space_members m where m.id = x.member_id and m.space_id = p_space_id);
    if v_bad > 0 then
      raise exception 'share_member_not_in_space' using errcode = '22023';
    end if;

    insert into public.expense_shares (expense_id, space_id, member_id, owed_minor)
    select p_expense_id, p_space_id, x.member_id, x.owed_minor
    from jsonb_to_recordset(v_shares) as x(member_id uuid, owed_minor bigint);
  end if;

  -- expense_items + item_shares ----------------------------------------------
  if jsonb_array_length(v_items) > 0 then
    select coalesce(sum((i ->> 'amount_minor')::bigint), 0) into v_sum
    from jsonb_array_elements(v_items) i;
    if v_sum <> p_total then
      raise exception 'items_sum_mismatch: items sum to % but total_minor is %', v_sum, p_total
        using errcode = '22023';
    end if;

    for v_item, v_pos in select i.value, i.ordinality from jsonb_array_elements(v_items) with ordinality i loop
      v_item_amount := (v_item ->> 'amount_minor')::bigint;
      insert into public.expense_items
        (expense_id, position, name, qty, unit_price_minor, amount_minor, kind, category_id)
      values (
        p_expense_id,
        v_pos::int,
        coalesce(nullif(btrim(v_item ->> 'name'), ''), 'Item'),
        coalesce((v_item ->> 'qty')::numeric, 1),
        (v_item ->> 'unit_price_minor')::bigint,
        v_item_amount,
        coalesce(nullif(v_item ->> 'kind', ''), 'item')::public.item_kind,
        nullif(v_item ->> 'category_id', '')::uuid
      )
      returning id into v_item_id;

      if jsonb_typeof(v_item -> 'shares') = 'array' and jsonb_array_length(v_item -> 'shares') > 0 then
        if p_space_id is null then
          raise exception 'item_shares_not_allowed_on_personal_expense' using errcode = '22023';
        end if;
        select count(*) filter (where x.member_id is null or x.amount_minor is null),
               coalesce(sum(x.amount_minor), 0)
          into v_bad, v_sum
        from jsonb_to_recordset(v_item -> 'shares') as x(member_id uuid, amount_minor bigint);
        if v_bad > 0 then
          raise exception 'invalid_item_share: every item share needs member_id and amount_minor'
            using errcode = '22023';
        end if;
        if v_sum <> v_item_amount then
          raise exception 'item_shares_sum_mismatch: item % shares sum to % but amount_minor is %',
            v_pos, v_sum, v_item_amount using errcode = '22023';
        end if;
        select count(*) into v_bad
        from jsonb_to_recordset(v_item -> 'shares') as x(member_id uuid)
        where not exists (
          select 1 from public.space_members m where m.id = x.member_id and m.space_id = p_space_id);
        if v_bad > 0 then
          raise exception 'share_member_not_in_space' using errcode = '22023';
        end if;

        insert into public.item_shares (item_id, expense_id, space_id, member_id, units, pct, amount_minor)
        select v_item_id, p_expense_id, p_space_id, x.member_id, x.units, x.pct, x.amount_minor
        from jsonb_to_recordset(v_item -> 'shares')
             as x(member_id uuid, units numeric, pct numeric, amount_minor bigint);
      else
        v_all_items_shared := false;
      end if;
    end loop;

    -- When every item carries shares, per-member item allocations must equal expense_shares.
    if p_space_id is not null and v_all_items_shared then
      select count(*) into v_bad
      from (
        select a.member_id, a.s from (
          select i.member_id, sum(i.amount_minor) as s
          from public.item_shares i where i.expense_id = p_expense_id group by i.member_id
        ) a
        full join (
          select x.member_id, x.owed_minor
          from jsonb_to_recordset(v_shares) as x(member_id uuid, owed_minor bigint)
        ) b on b.member_id = a.member_id
        where coalesce(a.s, 0) <> coalesce(b.owed_minor, 0)
      ) z;
      if v_bad > 0 then
        raise exception 'item_shares_member_mismatch: per-member item shares do not match expense shares'
          using errcode = '22023';
      end if;
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_expense(p jsonb) -> expenses.id
-- Payload (money in paise; shares computed client-side by packages/core, validated here):
-- {
--   "space_id": uuid|null, "title": text, "total_minor": int, "occurred_at": timestamptz,
--   "category_id": uuid, "merchant_id": uuid, "paid_by_member": uuid (required iff space_id),
--   "paid_via": payment_via, "source": expense_source, "status": "confirmed"|"proposed",
--   "currency": "INR", "captured_txn_id": uuid, "proposal_id": uuid, "proposal_status":
--   "accepted"|"edited", "recurring_series_id": uuid, "receipt_path": text,
--   "note": text  (caller's private note -> expense_notes),
--   "items":  [{"name", "qty", "unit_price_minor", "amount_minor", "kind", "category_id",
--               "shares": [{"member_id", "amount_minor", "units"?, "pct"?}]}],
--   "shares": [{"member_id", "owed_minor"}]
-- }
-- ---------------------------------------------------------------------------
create or replace function public.create_expense(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_space uuid;
  v_total bigint;
  v_payer uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;

  v_space := nullif(p ->> 'space_id', '')::uuid;
  v_total := (p ->> 'total_minor')::bigint;
  v_payer := nullif(p ->> 'paid_by_member', '')::uuid;

  if v_total is null or v_total <= 0 then
    raise exception 'invalid_total: total_minor must be a positive integer (paise)' using errcode = '22023';
  end if;

  if v_space is null then
    if v_payer is not null then
      raise exception 'paid_by_member_not_allowed_on_personal_expense' using errcode = '22023';
    end if;
  else
    if not private.is_space_member(v_space) then
      raise exception 'not_space_member' using errcode = '42501';
    end if;
    if v_payer is null then
      raise exception 'paid_by_member_required' using errcode = '22023';
    end if;
    if not exists (select 1 from public.space_members m where m.id = v_payer and m.space_id = v_space) then
      raise exception 'payer_not_in_space' using errcode = '22023';
    end if;
  end if;

  insert into public.expenses (
    owner_id, space_id, title, merchant_id, category_id, total_minor, currency, paid_by_member,
    paid_via, occurred_at, source, status, captured_txn_id, proposal_id, recurring_series_id, receipt_path)
  values (
    v_uid, v_space,
    nullif(btrim(p ->> 'title'), ''),
    nullif(p ->> 'merchant_id', '')::uuid,
    nullif(p ->> 'category_id', '')::uuid,
    v_total,
    coalesce(nullif(p ->> 'currency', ''), 'INR'),
    v_payer,
    nullif(p ->> 'paid_via', '')::public.payment_via,
    coalesce(nullif(p ->> 'occurred_at', '')::timestamptz, now()),
    coalesce(nullif(p ->> 'source', ''), 'manual')::public.expense_source,
    coalesce(nullif(p ->> 'status', ''), 'confirmed')::public.expense_status,
    nullif(p ->> 'captured_txn_id', '')::uuid,
    nullif(p ->> 'proposal_id', '')::uuid,
    nullif(p ->> 'recurring_series_id', '')::uuid,
    nullif(p ->> 'receipt_path', '')
  )
  returning id into v_id;

  perform private.write_expense_children(v_id, v_space, v_total, p);

  if nullif(btrim(p ->> 'note'), '') is not null then
    insert into public.expense_notes (expense_id, user_id, note)
    values (v_id, v_uid, btrim(p ->> 'note'));
  end if;

  if nullif(p ->> 'proposal_id', '') is not null then
    update public.ai_proposals
       set status = coalesce(nullif(p ->> 'proposal_status', ''), 'accepted')::public.proposal_status,
           result_ref = v_id,
           decided_at = now()
     where id = (p ->> 'proposal_id')::uuid and user_id = v_uid;
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- update_expense(p_expense_id, p jsonb) -> expenses.id
-- Same payload as create_expense. Scalar keys that are ABSENT keep their current value;
-- items and shares are always REPLACED by what is sent (send the full split).
-- Allowed for the creator, the paying member, or a space owner.
-- ---------------------------------------------------------------------------
create or replace function public.update_expense(p_expense_id uuid, p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_old public.expenses;
  v_space uuid;
  v_total bigint;
  v_payer uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;
  if not private.can_edit_expense(p_expense_id) then
    raise exception 'expense_not_found_or_forbidden' using errcode = '42501';
  end if;

  select * into v_old from public.expenses e where e.id = p_expense_id for update;

  v_space := case when p ? 'space_id' then nullif(p ->> 'space_id', '')::uuid else v_old.space_id end;
  v_total := case when p ? 'total_minor' then (p ->> 'total_minor')::bigint else v_old.total_minor end;
  v_payer := case when p ? 'paid_by_member' then nullif(p ->> 'paid_by_member', '')::uuid
                  when v_space is distinct from v_old.space_id then null
                  else v_old.paid_by_member end;

  if v_total is null or v_total <= 0 then
    raise exception 'invalid_total: total_minor must be a positive integer (paise)' using errcode = '22023';
  end if;
  if v_space is null then
    if v_payer is not null then
      raise exception 'paid_by_member_not_allowed_on_personal_expense' using errcode = '22023';
    end if;
  else
    if not private.is_space_member(v_space) then
      raise exception 'not_space_member' using errcode = '42501';
    end if;
    if v_payer is null then
      raise exception 'paid_by_member_required' using errcode = '22023';
    end if;
    if not exists (select 1 from public.space_members m where m.id = v_payer and m.space_id = v_space) then
      raise exception 'payer_not_in_space' using errcode = '22023';
    end if;
  end if;

  delete from public.expense_shares s where s.expense_id = p_expense_id;
  delete from public.expense_items i where i.expense_id = p_expense_id;  -- cascades item_shares

  update public.expenses e set
    space_id            = v_space,
    total_minor         = v_total,
    paid_by_member      = v_payer,
    title               = case when p ? 'title' then nullif(btrim(p ->> 'title'), '') else e.title end,
    merchant_id         = case when p ? 'merchant_id' then nullif(p ->> 'merchant_id', '')::uuid else e.merchant_id end,
    category_id         = case when p ? 'category_id' then nullif(p ->> 'category_id', '')::uuid else e.category_id end,
    currency            = case when p ? 'currency' then coalesce(nullif(p ->> 'currency', ''), 'INR') else e.currency end,
    paid_via            = case when p ? 'paid_via' then nullif(p ->> 'paid_via', '')::public.payment_via else e.paid_via end,
    occurred_at         = case when p ? 'occurred_at' then coalesce(nullif(p ->> 'occurred_at', '')::timestamptz, e.occurred_at) else e.occurred_at end,
    status              = case when p ? 'status' then coalesce(nullif(p ->> 'status', ''), 'confirmed')::public.expense_status else e.status end,
    receipt_path        = case when p ? 'receipt_path' then nullif(p ->> 'receipt_path', '') else e.receipt_path end,
    recurring_series_id = case when p ? 'recurring_series_id' then nullif(p ->> 'recurring_series_id', '')::uuid else e.recurring_series_id end
  where e.id = p_expense_id;

  perform private.write_expense_children(p_expense_id, v_space, v_total, p);

  if p ? 'note' then
    if nullif(btrim(p ->> 'note'), '') is null then
      delete from public.expense_notes n where n.expense_id = p_expense_id and n.user_id = v_uid;
    else
      insert into public.expense_notes (expense_id, user_id, note)
      values (p_expense_id, v_uid, btrim(p ->> 'note'))
      on conflict (expense_id, user_id) do update set note = excluded.note;
    end if;
  end if;

  return p_expense_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Settlements
-- ---------------------------------------------------------------------------
create or replace function public.record_settlement(
  p_space_id uuid,
  p_from_member uuid,
  p_to_member uuid,
  p_amount_minor bigint,
  p_method public.settlement_method default 'upi',
  p_status public.settlement_status default 'initiated',
  p_upi_app text default null,
  p_note_ref text default null,
  p_utr text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not private.is_space_member(p_space_id) then
    raise exception 'not_space_member' using errcode = '42501';
  end if;
  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if p_status not in ('initiated', 'confirmed_manual') then
    raise exception 'illegal_initial_settlement_status: %', p_status using errcode = '22023';
  end if;
  if (select count(*) from public.space_members m
      where m.space_id = p_space_id and m.id in (p_from_member, p_to_member)) <> 2 then
    raise exception 'settlement_member_not_in_space' using errcode = '22023';
  end if;
  if not (p_from_member in (select private.my_member_ids())
          or p_to_member in (select private.my_member_ids())
          or private.is_space_owner(p_space_id)) then
    raise exception 'not_a_settlement_party' using errcode = '42501';
  end if;

  insert into public.settlements (space_id, from_member, to_member, amount_minor, status, note_ref, utr, created_by)
  values (p_space_id, p_from_member, p_to_member, p_amount_minor, p_status,
          nullif(btrim(p_note_ref), ''), nullif(btrim(p_utr), ''), v_uid)
  returning id into v_id;

  if p_method is not null then
    insert into public.settlement_methods (settlement_id, method, upi_app, created_by)
    values (v_id, p_method, nullif(btrim(p_upi_app), ''), v_uid);
  end if;

  return v_id;
end;
$$;

-- Moves a settlement through the state machine (enforced by trigger private.guard_settlement).
-- p_amount_minor is required when p_status = 'corrected'.
create or replace function public.update_settlement_status(
  p_id uuid,
  p_status public.settlement_status,
  p_utr text default null,
  p_amount_minor bigint default null
)
returns public.settlements
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.settlements;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_status = 'corrected' and p_amount_minor is null then
    raise exception 'correction_requires_new_amount' using errcode = '22023';
  end if;

  update public.settlements s
     set status = p_status,
         utr = coalesce(nullif(btrim(p_utr), ''), s.utr),
         amount_minor = coalesce(p_amount_minor, s.amount_minor)
   where s.id = p_id
  returning s.* into v_row;

  if not found then
    raise exception 'settlement_not_found_or_forbidden' using errcode = '42501';
  end if;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- confirm_captured_txn: auto-capture inbox item -> expense.
-- Personal when p_space_id is null. For a shared expense pass p_shares
-- ([{"member_id", "owed_minor"}], computed by packages/core); the caller is the payer.
-- ---------------------------------------------------------------------------
create or replace function public.confirm_captured_txn(
  p_id uuid,
  p_category_id uuid default null,
  p_space_id uuid default null,
  p_shares jsonb default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_txn public.captured_txns;
  v_member uuid;
  v_merchant uuid;
  v_merchant_cat uuid;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_txn from public.captured_txns c where c.id = p_id for update;
  if not found then
    raise exception 'captured_txn_not_found_or_forbidden' using errcode = '42501';
  end if;
  if v_txn.status <> 'inbox' then
    raise exception 'captured_txn_not_in_inbox: status is %', v_txn.status using errcode = '22023';
  end if;

  if p_space_id is not null then
    select m.id into v_member from public.space_members m
    where m.space_id = p_space_id and m.user_id = v_uid and m.left_at is null;
    if v_member is null then
      raise exception 'not_space_member' using errcode = '42501';
    end if;
    if p_shares is null then
      raise exception 'shares_required: a shared expense needs expense_shares' using errcode = '22023';
    end if;
  end if;

  if v_txn.vpa is not null then
    select ma.merchant_id, mc.category_id into v_merchant, v_merchant_cat
    from public.merchant_aliases ma
    join public.merchants mc on mc.id = ma.merchant_id
    where ma.vpa = lower(v_txn.vpa)
    order by (ma.owner_id is null), ma.created_at
    limit 1;
  end if;

  v_id := public.create_expense(jsonb_build_object(
    'space_id', p_space_id,
    'title', v_txn.payee,
    'total_minor', v_txn.amount_minor,
    'occurred_at', v_txn.occurred_at,
    'category_id', coalesce(p_category_id, v_txn.suggested_category_id, v_merchant_cat),
    'merchant_id', v_merchant,
    'paid_by_member', v_member,
    'paid_via', case when v_txn.source = 'upi_notification' then 'upi' end,
    'source', case v_txn.source
                when 'upi_notification' then 'upi_alert'
                when 'sms' then 'sms'
                when 'ebill' then 'ebill'
                else 'manual' end,
    'captured_txn_id', v_txn.id,
    'shares', coalesce(p_shares, '[]'::jsonb)
  ));

  update public.captured_txns c set status = 'confirmed', expense_id = v_id where c.id = p_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- delete_my_account: deletes the caller's auth user. Trigger private.handle_user_deleted
-- removes personal data and anonymises shared rows ("Former member"); FKs cascade the rest.
-- SECURITY DEFINER is required: only the table owner can delete from auth.users.
-- Receipt images in Storage must be removed by the calling Edge Function first.
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  delete from auth.users u where u.id = v_uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- register_device: upsert an Expo push token for the caller.
-- SECURITY DEFINER is required: when a device switches accounts the token row belongs to
-- another user, whom the caller cannot see or update under RLS.
-- ---------------------------------------------------------------------------
create or replace function public.register_device(
  p_token text,
  p_platform public.device_platform,
  p_app_version text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if nullif(btrim(p_token), '') is null then
    raise exception 'invalid_token' using errcode = '22023';
  end if;
  insert into public.devices (user_id, expo_push_token, platform, app_version, last_seen_at)
  values (v_uid, btrim(p_token), p_platform, p_app_version, now())
  on conflict (expo_push_token) do update
    set user_id = excluded.user_id, platform = excluded.platform,
        app_version = excluded.app_version, last_seen_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. anon gets nothing: every table requires a signed-in user.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Realtime (postgres_changes respects RLS). Guarded so the migration also runs where the
-- supabase_realtime publication does not exist.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.expenses, public.expense_shares, public.settlements, public.captured_txns;
  end if;
end;
$$;
