-- PayMind schema v1 — part 3/5: RLS helpers, integrity triggers, row-level security, grants.
--
-- Performance rules followed by every policy:
-- * auth.uid() is always wrapped as (select auth.uid()) so it is evaluated once per query.
-- * Membership is checked with `space_id in (select private.my_space_ids())`: a
--   SECURITY DEFINER set-returning helper evaluated once per query (hashed subplan). Because it
--   bypasses RLS on space_members, there is no policy recursion.
-- * Every predicate column is indexed (see part 2).

-- ---------------------------------------------------------------------------
-- RLS helper functions (private schema, SECURITY DEFINER, empty search_path)
-- ---------------------------------------------------------------------------
create or replace function private.my_space_ids()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select m.space_id from public.space_members m
  where m.user_id = (select auth.uid()) and m.left_at is null
$$;

create or replace function private.my_owned_space_ids()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select m.space_id from public.space_members m
  where m.user_id = (select auth.uid()) and m.left_at is null and m.role = 'owner'
$$;

-- The caller's own (active) member rows across all spaces.
create or replace function private.my_member_ids()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select m.id from public.space_members m
  where m.user_id = (select auth.uid()) and m.left_at is null
$$;

create or replace function private.is_space_member(p_space_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.space_members m
    where m.space_id = p_space_id and m.user_id = (select auth.uid()) and m.left_at is null
  )
$$;

create or replace function private.is_space_owner(p_space_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.space_members m
    where m.space_id = p_space_id and m.user_id = (select auth.uid())
      and m.left_at is null and m.role = 'owner'
  )
$$;

-- True only for the creator of a space that has no members yet (lets create_space add the
-- first owner row).
create or replace function private.can_bootstrap_space(p_space_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.spaces s
    where s.id = p_space_id and s.created_by = (select auth.uid())
      and not exists (select 1 from public.space_members m where m.space_id = s.id)
  )
$$;

-- Who may change an expense (and its items / shares / flags): its creator; for shared
-- expenses also the member who paid and the space owners.
create or replace function private.can_edit_expense(p_expense_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.expenses e
    where e.id = p_expense_id
      and (
        e.owner_id = (select auth.uid())
        or (e.space_id is not null and (
              private.is_space_owner(e.space_id)
              or e.paid_by_member in (select private.my_member_ids())
        ))
      )
  )
$$;

-- "How I paid": visible to the settlement's recorder and the payer; visible to the other
-- members of the space only when the payer has privacy_settings.share_payment_method = true.
create or replace function private.can_see_settlement_method(p_settlement_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.settlements s
    join public.space_members fm on fm.id = s.from_member
    where s.id = p_settlement_id
      and private.is_space_member(s.space_id)
      and (
        s.created_by = (select auth.uid())
        or fm.user_id = (select auth.uid())
        or (fm.user_id is not null and exists (
              select 1 from public.privacy_settings ps
              where ps.user_id = fm.user_id and ps.share_payment_method
        ))
      )
  )
$$;

-- ---------------------------------------------------------------------------
-- New auth user -> profile + settings rows
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name'),
    new.phone
  )
  on conflict (id) do nothing;
  insert into public.privacy_settings (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into public.notification_prefs (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Auth user deleted -> delete personal data, anonymise shared rows ("Former member").
-- Runs for delete_my_account() and for deletions from the dashboard / admin API alike.
-- Everything not handled here is removed by ON DELETE CASCADE / SET NULL FKs.
-- ---------------------------------------------------------------------------
create or replace function private.handle_user_deleted()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_space uuid;
begin
  -- Spaces where this user is the last active owner: promote the longest-standing active member.
  for v_space in
    select m.space_id from public.space_members m
    where m.user_id = old.id and m.role = 'owner' and m.left_at is null
      and not exists (
        select 1 from public.space_members o
        where o.space_id = m.space_id and o.role = 'owner' and o.left_at is null
          and o.user_id is distinct from old.id
      )
  loop
    update public.space_members p set role = 'owner'
    where p.id = (
      select c.id from public.space_members c
      where c.space_id = v_space and c.left_at is null and c.user_id is not null
        and c.user_id <> old.id
      order by c.joined_at, c.id
      limit 1
    );
  end loop;

  update public.space_members
     set user_id = null, display_name = 'Former member', upi_vpa = null,
         role = 'member', left_at = coalesce(left_at, now())
   where user_id = old.id;

  delete from public.expenses where owner_id = old.id and space_id is null;  -- personal spending
  update public.expenses set owner_id = null where owner_id = old.id;       -- shared: keep, anonymise
  update public.settlements set created_by = null where created_by = old.id;
  update public.goal_contributions set user_id = null where user_id = old.id;
  update public.spaces set created_by = null where created_by = old.id;
  return old;
end;
$$;

create trigger on_auth_user_deleted
  before delete on auth.users
  for each row execute function private.handle_user_deleted();

-- ---------------------------------------------------------------------------
-- space_members guard: clients cannot re-point user_id or escalate their own role.
-- Applies to API callers (role authenticated / anon); SECURITY DEFINER internals
-- (account deletion) run as the function owner and are not restricted.
-- ---------------------------------------------------------------------------
create or replace function private.guard_space_member_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.space_id <> old.space_id then
    raise exception 'member_space_immutable' using errcode = '22023';
  end if;
  if new.user_id is distinct from old.user_id then
    raise exception 'member_user_id_immutable' using errcode = '22023';
  end if;
  if new.role <> old.role and not private.is_space_owner(old.space_id) then
    raise exception 'only_space_owner_can_change_role' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger guard_space_member_update
  before update on public.space_members
  for each row execute function private.guard_space_member_update();

-- expenses guard: the creator (owner_id) cannot be re-pointed by API callers, so an editor
-- cannot take over someone else's expense (e.g. move it into their own personal list).
create or replace function private.guard_expense_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and new.owner_id is distinct from old.owner_id then
    raise exception 'expense_owner_immutable' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger guard_expense_update
  before update on public.expenses
  for each row execute function private.guard_expense_update();

-- ---------------------------------------------------------------------------
-- Settlement state machine (enforced for every writer, including service_role).
--
--   initiated        -> pending | completed | failed | confirmed_manual | cancelled
--   pending          -> completed | failed | confirmed_manual | cancelled
--   failed           -> initiated (retry) | completed | confirmed_manual | cancelled
--   completed        -> corrected | cancelled
--   confirmed_manual -> corrected | cancelled
--   corrected        -> cancelled            (a further correction keeps status 'corrected')
--   cancelled        -> (terminal)
--
-- New rows must start as 'initiated' (UPI hand-off) or 'confirmed_manual' (cash/other/recorded
-- after the fact). amount_minor may change only while 'initiated', or together with a move to
-- (or within) 'corrected'; the previous amount is saved to corrected_from_minor.
-- Balances count completed, confirmed_manual and corrected.
-- ---------------------------------------------------------------------------
create or replace function private.settlement_transition_allowed(
  p_from public.settlement_status, p_to public.settlement_status)
returns boolean
language sql immutable
set search_path = ''
as $$
  select case p_from
    when 'initiated'        then p_to in ('pending', 'completed', 'failed', 'confirmed_manual', 'cancelled')
    when 'pending'          then p_to in ('completed', 'failed', 'confirmed_manual', 'cancelled')
    when 'failed'           then p_to in ('initiated', 'completed', 'confirmed_manual', 'cancelled')
    when 'completed'        then p_to in ('corrected', 'cancelled')
    when 'confirmed_manual' then p_to in ('corrected', 'cancelled')
    when 'corrected'        then p_to in ('cancelled')
    else false
  end
$$;

create or replace function private.guard_settlement()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status not in ('initiated', 'confirmed_manual') then
      raise exception 'illegal_initial_settlement_status: %', new.status using errcode = '22023';
    end if;
    new.corrected_from_minor := null;
    new.completed_at := case when new.status = 'confirmed_manual' then coalesce(new.completed_at, now()) end;
    return new;
  end if;

  if new.space_id <> old.space_id or new.from_member <> old.from_member
     or new.to_member <> old.to_member or new.created_at <> old.created_at then
    raise exception 'settlement_parties_immutable' using errcode = '22023';
  end if;
  if new.created_by is distinct from old.created_by and new.created_by is not null then
    raise exception 'settlement_created_by_immutable' using errcode = '22023';
  end if;

  if new.status <> old.status and not private.settlement_transition_allowed(old.status, new.status) then
    raise exception 'illegal_settlement_transition: % -> %', old.status, new.status using errcode = '22023';
  end if;

  if new.amount_minor <> old.amount_minor then
    if new.status = 'corrected' and old.status in ('completed', 'confirmed_manual', 'corrected') then
      new.corrected_from_minor := old.amount_minor;
    elsif old.status = 'initiated' and new.status = 'initiated' then
      new.corrected_from_minor := old.corrected_from_minor;
    else
      raise exception 'settlement_amount_locked: amount can change only while initiated or via corrected'
        using errcode = '22023';
    end if;
  else
    if new.status = 'corrected' and old.status <> 'corrected' then
      raise exception 'correction_requires_new_amount' using errcode = '22023';
    end if;
    new.corrected_from_minor := old.corrected_from_minor;
  end if;

  if new.status in ('completed', 'confirmed_manual') and old.status not in ('completed', 'confirmed_manual') then
    new.completed_at := now();
  elsif new.status in ('initiated', 'pending', 'failed') then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger guard_settlement
  before insert or update on public.settlements
  for each row execute function private.guard_settlement();

-- ---------------------------------------------------------------------------
-- Money invariant: for a confirmed shared expense, sum(expense_shares.owed_minor) must equal
-- expenses.total_minor. Checked at COMMIT (deferred), so multi-statement writes inside one
-- transaction (the create_expense / update_expense RPCs) are fine, while a client writing
-- rows one by one over the REST API cannot leave an unbalanced expense behind.
-- ---------------------------------------------------------------------------
create or replace function private.check_expense_shares_balance()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_expense_id uuid;
  v_total bigint;
  v_space uuid;
  v_status public.expense_status;
  v_sum bigint;
begin
  if tg_table_name = 'expenses' then
    v_expense_id := new.id;
  elsif tg_op = 'DELETE' then
    v_expense_id := old.expense_id;
  else
    v_expense_id := new.expense_id;
  end if;

  select e.total_minor, e.space_id, e.status into v_total, v_space, v_status
  from public.expenses e where e.id = v_expense_id;
  if not found or v_space is null or v_status <> 'confirmed' then
    return null;
  end if;

  select coalesce(sum(s.owed_minor), 0) into v_sum
  from public.expense_shares s where s.expense_id = v_expense_id;
  if v_sum <> v_total then
    raise exception 'shares_sum_mismatch: expense % shares sum to % but total_minor is %',
      v_expense_id, v_sum, v_total using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger expenses_shares_balance
  after insert or update of total_minor, status, space_id on public.expenses
  deferrable initially deferred
  for each row execute function private.check_expense_shares_balance();

create constraint trigger expense_shares_balance
  after insert or update or delete on public.expense_shares
  deferrable initially deferred
  for each row execute function private.check_expense_shares_balance();

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.spaces              enable row level security;
alter table public.space_members       enable row level security;
alter table public.split_rules         enable row level security;
alter table public.categories          enable row level security;
alter table public.merchants           enable row level security;
alter table public.merchant_aliases    enable row level security;
alter table public.ai_proposals        enable row level security;
alter table public.recurring_series    enable row level security;
alter table public.captured_txns       enable row level security;
alter table public.expenses            enable row level security;
alter table public.expense_items       enable row level security;
alter table public.item_shares         enable row level security;
alter table public.expense_shares      enable row level security;
alter table public.expense_notes       enable row level security;
alter table public.bill_flags          enable row level security;
alter table public.settlements         enable row level security;
alter table public.settlement_methods  enable row level security;
alter table public.reminders           enable row level security;
alter table public.budgets             enable row level security;
alter table public.goals               enable row level security;
alter table public.goal_contributions  enable row level security;
alter table public.learned_rules       enable row level security;
alter table public.anomalies           enable row level security;
alter table public.notification_prefs  enable row level security;
alter table public.privacy_settings    enable row level security;
alter table public.devices             enable row level security;

-- ---------------------------------------------------------------------------
-- profiles: owner only (co-members see space_members.display_name / upi_vpa instead)
-- ---------------------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_insert on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- spaces
-- ---------------------------------------------------------------------------
create policy spaces_select on public.spaces for select to authenticated
  using (id in (select private.my_space_ids()) or created_by = (select auth.uid()));
create policy spaces_insert on public.spaces for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy spaces_update on public.spaces for update to authenticated
  using (id in (select private.my_owned_space_ids()))
  with check (id in (select private.my_owned_space_ids()));
create policy spaces_delete on public.spaces for delete to authenticated
  using (id in (select private.my_owned_space_ids()));

-- ---------------------------------------------------------------------------
-- space_members
-- ---------------------------------------------------------------------------
create policy space_members_select on public.space_members for select to authenticated
  using (space_id in (select private.my_space_ids()) or user_id = (select auth.uid()));
create policy space_members_insert on public.space_members for insert to authenticated
  with check (
    space_id in (select private.my_owned_space_ids())
    or (role = 'member' and space_id in (select private.my_space_ids()))
    or (role = 'owner' and user_id = (select auth.uid()) and private.can_bootstrap_space(space_id))
  );
create policy space_members_update on public.space_members for update to authenticated
  using (space_id in (select private.my_owned_space_ids()) or user_id = (select auth.uid()))
  with check (space_id in (select private.my_owned_space_ids()) or user_id = (select auth.uid()));
create policy space_members_delete on public.space_members for delete to authenticated
  using (space_id in (select private.my_owned_space_ids()));

-- ---------------------------------------------------------------------------
-- split_rules: any active member of the space
-- ---------------------------------------------------------------------------
create policy split_rules_select on public.split_rules for select to authenticated
  using (space_id in (select private.my_space_ids()));
create policy split_rules_insert on public.split_rules for insert to authenticated
  with check (space_id in (select private.my_space_ids()));
create policy split_rules_update on public.split_rules for update to authenticated
  using (space_id in (select private.my_space_ids()))
  with check (space_id in (select private.my_space_ids()));
create policy split_rules_delete on public.split_rules for delete to authenticated
  using (space_id in (select private.my_space_ids()));

-- ---------------------------------------------------------------------------
-- categories / merchants / merchant_aliases: system rows readable by all signed-in users,
-- user rows by their owner only. System rows are written by migrations / service_role.
-- ---------------------------------------------------------------------------
create policy categories_select on public.categories for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));
create policy categories_insert on public.categories for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy categories_update on public.categories for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy categories_delete on public.categories for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy merchants_select on public.merchants for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));
create policy merchants_insert on public.merchants for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy merchants_update on public.merchants for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy merchants_delete on public.merchants for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy merchant_aliases_select on public.merchant_aliases for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));
create policy merchant_aliases_insert on public.merchant_aliases for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy merchant_aliases_update on public.merchant_aliases for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy merchant_aliases_delete on public.merchant_aliases for delete to authenticated
  using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Owner-only personal tables
-- ---------------------------------------------------------------------------
create policy ai_proposals_all on public.ai_proposals for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
              and (space_id is null or space_id in (select private.my_space_ids())));

create policy captured_txns_all on public.captured_txns for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy learned_rules_all on public.learned_rules for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy anomalies_all on public.anomalies for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy devices_all on public.devices for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy notification_prefs_select on public.notification_prefs for select to authenticated
  using (user_id = (select auth.uid()));
create policy notification_prefs_insert on public.notification_prefs for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy notification_prefs_update on public.notification_prefs for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy privacy_settings_select on public.privacy_settings for select to authenticated
  using (user_id = (select auth.uid()));
create policy privacy_settings_insert on public.privacy_settings for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy privacy_settings_update on public.privacy_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- recurring_series: owner; shared series (space_id set) readable by the space
-- ---------------------------------------------------------------------------
create policy recurring_series_select on public.recurring_series for select to authenticated
  using (user_id = (select auth.uid()) or space_id in (select private.my_space_ids()));
create policy recurring_series_insert on public.recurring_series for insert to authenticated
  with check (user_id = (select auth.uid())
              and (space_id is null or space_id in (select private.my_space_ids())));
create policy recurring_series_update on public.recurring_series for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
              and (space_id is null or space_id in (select private.my_space_ids())));
create policy recurring_series_delete on public.recurring_series for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- expenses: personal -> owner only; shared -> active members of the space
-- (shared expenses can never be 'proposed', see expenses_proposed_personal_only)
-- ---------------------------------------------------------------------------
create policy expenses_select on public.expenses for select to authenticated
  using (owner_id = (select auth.uid()) or space_id in (select private.my_space_ids()));
create policy expenses_insert on public.expenses for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (space_id is null or space_id in (select private.my_space_ids()))
  );
create policy expenses_update on public.expenses for update to authenticated
  using (
    owner_id = (select auth.uid())
    or space_id in (select private.my_owned_space_ids())
    or paid_by_member in (select private.my_member_ids())
  )
  with check (
    (space_id is null and owner_id = (select auth.uid()))
    or space_id in (select private.my_space_ids())
  );
create policy expenses_delete on public.expenses for delete to authenticated
  using (owner_id = (select auth.uid()) or space_id in (select private.my_owned_space_ids()));

-- Child rows: readable when the parent expense is readable (parent RLS applies inside EXISTS),
-- writable by whoever may edit the parent.
create policy expense_items_select on public.expense_items for select to authenticated
  using (exists (select 1 from public.expenses e where e.id = expense_items.expense_id));
create policy expense_items_insert on public.expense_items for insert to authenticated
  with check (private.can_edit_expense(expense_id));
create policy expense_items_update on public.expense_items for update to authenticated
  using (private.can_edit_expense(expense_id)) with check (private.can_edit_expense(expense_id));
create policy expense_items_delete on public.expense_items for delete to authenticated
  using (private.can_edit_expense(expense_id));

-- Shares only exist on shared expenses (composite FK), which are visible to exactly the
-- active members of their space, so a direct space check is equivalent and cheaper.
create policy item_shares_select on public.item_shares for select to authenticated
  using (space_id in (select private.my_space_ids()));
create policy item_shares_insert on public.item_shares for insert to authenticated
  with check (private.can_edit_expense(expense_id));
create policy item_shares_update on public.item_shares for update to authenticated
  using (private.can_edit_expense(expense_id)) with check (private.can_edit_expense(expense_id));
create policy item_shares_delete on public.item_shares for delete to authenticated
  using (private.can_edit_expense(expense_id));

create policy expense_shares_select on public.expense_shares for select to authenticated
  using (space_id in (select private.my_space_ids()));
create policy expense_shares_insert on public.expense_shares for insert to authenticated
  with check (private.can_edit_expense(expense_id));
create policy expense_shares_update on public.expense_shares for update to authenticated
  using (private.can_edit_expense(expense_id)) with check (private.can_edit_expense(expense_id));
create policy expense_shares_delete on public.expense_shares for delete to authenticated
  using (private.can_edit_expense(expense_id));

create policy bill_flags_select on public.bill_flags for select to authenticated
  using (exists (select 1 from public.expenses e where e.id = bill_flags.expense_id));
create policy bill_flags_insert on public.bill_flags for insert to authenticated
  with check (private.can_edit_expense(expense_id));
create policy bill_flags_update on public.bill_flags for update to authenticated
  using (private.can_edit_expense(expense_id)) with check (private.can_edit_expense(expense_id));
create policy bill_flags_delete on public.bill_flags for delete to authenticated
  using (private.can_edit_expense(expense_id));

-- Private notes: strictly the author's.
create policy expense_notes_select on public.expense_notes for select to authenticated
  using (user_id = (select auth.uid()));
create policy expense_notes_insert on public.expense_notes for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.expenses e where e.id = expense_notes.expense_id)
  );
create policy expense_notes_update on public.expense_notes for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy expense_notes_delete on public.expense_notes for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- settlements: visible to the space; recorded by a party to it (or a space owner);
-- status changes go through the state-machine trigger. No deletes (cancel instead).
-- ---------------------------------------------------------------------------
create policy settlements_select on public.settlements for select to authenticated
  using (space_id in (select private.my_space_ids()));
create policy settlements_insert on public.settlements for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and space_id in (select private.my_space_ids())
    and (
      from_member in (select private.my_member_ids())
      or to_member in (select private.my_member_ids())
      or space_id in (select private.my_owned_space_ids())
    )
  );
create policy settlements_update on public.settlements for update to authenticated
  using (
    space_id in (select private.my_space_ids())
    and (
      created_by = (select auth.uid())
      or from_member in (select private.my_member_ids())
      or to_member in (select private.my_member_ids())
      or space_id in (select private.my_owned_space_ids())
    )
  )
  with check (space_id in (select private.my_space_ids()));

create policy settlement_methods_select on public.settlement_methods for select to authenticated
  using (created_by = (select auth.uid()) or private.can_see_settlement_method(settlement_id));
create policy settlement_methods_insert on public.settlement_methods for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.settlements s
      where s.id = settlement_methods.settlement_id
        and (s.created_by = (select auth.uid()) or s.from_member in (select private.my_member_ids()))
    )
  );
create policy settlement_methods_update on public.settlement_methods for update to authenticated
  using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()));
create policy settlement_methods_delete on public.settlement_methods for delete to authenticated
  using (created_by = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- reminders: sender only; target must be a member the sender can see.
-- Public pay-link pages resolve link_token server-side (Edge Function, service_role).
-- ---------------------------------------------------------------------------
create policy reminders_select on public.reminders for select to authenticated
  using (from_user = (select auth.uid()));
create policy reminders_insert on public.reminders for insert to authenticated
  with check (
    from_user = (select auth.uid())
    and exists (select 1 from public.space_members m where m.id = reminders.to_member)
  );
create policy reminders_update on public.reminders for update to authenticated
  using (from_user = (select auth.uid())) with check (from_user = (select auth.uid()));
create policy reminders_delete on public.reminders for delete to authenticated
  using (from_user = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- budgets / goals: personal (owner_id) or space (space_id)
-- ---------------------------------------------------------------------------
create policy budgets_select on public.budgets for select to authenticated
  using (owner_id = (select auth.uid()) or space_id in (select private.my_space_ids()));
create policy budgets_insert on public.budgets for insert to authenticated
  with check (owner_id = (select auth.uid()) or space_id in (select private.my_space_ids()));
create policy budgets_update on public.budgets for update to authenticated
  using (owner_id = (select auth.uid()) or space_id in (select private.my_space_ids()))
  with check (owner_id = (select auth.uid()) or space_id in (select private.my_space_ids()));
create policy budgets_delete on public.budgets for delete to authenticated
  using (owner_id = (select auth.uid()) or space_id in (select private.my_space_ids()));

create policy goals_select on public.goals for select to authenticated
  using (owner_id = (select auth.uid()) or space_id in (select private.my_space_ids()));
create policy goals_insert on public.goals for insert to authenticated
  with check (owner_id = (select auth.uid()) or space_id in (select private.my_space_ids()));
create policy goals_update on public.goals for update to authenticated
  using (owner_id = (select auth.uid()) or space_id in (select private.my_space_ids()))
  with check (owner_id = (select auth.uid()) or space_id in (select private.my_space_ids()));
create policy goals_delete on public.goals for delete to authenticated
  using (owner_id = (select auth.uid()) or space_id in (select private.my_space_ids()));

create policy goal_contributions_select on public.goal_contributions for select to authenticated
  using (exists (select 1 from public.goals g where g.id = goal_contributions.goal_id));
create policy goal_contributions_insert on public.goal_contributions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.goals g where g.id = goal_contributions.goal_id)
    and (member_id is null or exists (
          select 1 from public.goals g
          join public.space_members m on m.space_id = g.space_id
          where g.id = goal_contributions.goal_id and m.id = goal_contributions.member_id))
  );
create policy goal_contributions_update on public.goal_contributions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy goal_contributions_delete on public.goal_contributions for delete to authenticated
  using (user_id = (select auth.uid()));
