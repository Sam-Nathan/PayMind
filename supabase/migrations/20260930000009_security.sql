-- PayMind schema v1 — part 9: security review fixes.
-- Each fix is proved by supabase/tests/006_security.test.sql, which fails without this migration.
--
--  1. Former members cannot rejoin a space on their own (left_at -> null needs a space owner).
--  2. A real user's payout VPA on space_members can only be changed by that user, and accepting an
--     invite replaces whatever VPA the inviter typed with the accepter's own profile VPA.
--  3. Former members lose access to shared expenses they created: read, delete, and edit
--     (update_expense could pull the expense out of the space into their personal list).
--  4. A space creator who left no longer sees the space row.
--  5. captured_txns: server-side consent. Notification/SMS rows need
--     privacy_settings.capture_notifications, e-bill rows need privacy_settings.ebills.
--  6. Settlements: API callers can no longer null created_by or forge completed_at.
--  7. settlement_methods / expense_notes cannot be re-pointed at other rows by an update.
--  8. register_device validates the Expo push token format and lengths.
--  9. get_pay_link only shows the names of spaces the sender belongs (or belonged) to.
-- 10. Per-user rate limits: private.rate_limits + public.consume_rate_limit() for Edge Functions.
-- 11. Length limits on user-typed text that reaches other people, LLM prompts or the public pay page
--     (NOT VALID: enforced for new and updated rows, existing rows are not rechecked).

-- ---------------------------------------------------------------------------
-- 1 + 2. space_members guard
-- ---------------------------------------------------------------------------
create or replace function private.guard_space_member_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_owner boolean;
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
  v_owner := private.is_space_owner(old.space_id);
  if new.role <> old.role and not v_owner then
    raise exception 'only_space_owner_can_change_role' using errcode = '42501';
  end if;
  -- Leaving is self-service; coming back is not (a removed member could otherwise undo it).
  if old.left_at is not null and new.left_at is null and not v_owner then
    raise exception 'only_space_owner_can_restore_member' using errcode = '42501';
  end if;
  -- Where a real user gets paid is theirs to say: nobody else (not even an owner) can re-point it.
  if old.user_id is not null and old.user_id is distinct from (select auth.uid())
     and new.upi_vpa is distinct from old.upi_vpa then
    raise exception 'member_upi_vpa_owner_only: only this member can change their UPI ID'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- accept_space_invite: same as migration 06, except the claimed row takes the accepter's own
-- profile VPA (or none) instead of whatever the inviter typed into the placeholder.
create or replace function public.accept_space_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.space_invites;
  v_member public.space_members;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_inv from public.space_invites i
  where i.code = upper(btrim(p_code)) for update;
  if not found then
    raise exception 'invite_not_found' using errcode = '22023';
  end if;
  if v_inv.accepted_at is not null then
    raise exception 'invite_already_used' using errcode = '22023';
  end if;
  if v_inv.expires_at <= now() then
    raise exception 'invite_expired' using errcode = '22023';
  end if;

  if exists (select 1 from public.space_members m
             where m.space_id = v_inv.space_id and m.user_id = v_uid and m.left_at is null) then
    raise exception 'already_space_member: you are already in this space' using errcode = '22023';
  end if;
  if exists (select 1 from public.space_members m
             where m.space_id = v_inv.space_id and m.user_id = v_uid) then
    raise exception 'previously_left_space: ask a space owner to restore your old membership'
      using errcode = '22023';
  end if;

  select * into v_member from public.space_members m where m.id = v_inv.member_id for update;
  if not found or v_member.user_id is not null or v_member.left_at is not null then
    raise exception 'member_not_available: this spot has already been taken' using errcode = '22023';
  end if;

  update public.space_members m
     set user_id = v_uid,
         upi_vpa = (select nullif(btrim(p.upi_vpa), '') from public.profiles p where p.id = v_uid)
   where m.id = v_inv.member_id;
  update public.space_invites i set accepted_by = v_uid, accepted_at = now() where i.id = v_inv.id;
  update public.space_invites i set expires_at = now()
  where i.member_id = v_inv.member_id and i.accepted_at is null and i.expires_at > now();

  return jsonb_build_object('space_id', v_inv.space_id, 'member_id', v_inv.member_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Creator rights on shared expenses require active membership
-- ---------------------------------------------------------------------------
create or replace function private.can_edit_expense(p_expense_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.expenses e
    where e.id = p_expense_id
      and (
        (e.owner_id = (select auth.uid())
          and (e.space_id is null or private.is_space_member(e.space_id)))
        or (e.space_id is not null and (
              private.is_space_owner(e.space_id)
              or e.paid_by_member in (select private.my_member_ids())
        ))
      )
  )
$$;

drop policy expenses_select on public.expenses;
create policy expenses_select on public.expenses for select to authenticated
  using (
    (owner_id = (select auth.uid()) and space_id is null)
    or space_id = any (array(select private.my_space_ids()))
  );

drop policy expenses_update on public.expenses;
create policy expenses_update on public.expenses for update to authenticated
  using (
    (owner_id = (select auth.uid())
      and (space_id is null or space_id in (select private.my_space_ids())))
    or space_id in (select private.my_owned_space_ids())
    or paid_by_member in (select private.my_member_ids())
  )
  with check (
    (space_id is null and owner_id = (select auth.uid()))
    or space_id in (select private.my_space_ids())
  );

drop policy expenses_delete on public.expenses;
create policy expenses_delete on public.expenses for delete to authenticated
  using (
    (owner_id = (select auth.uid())
      and (space_id is null or space_id in (select private.my_space_ids())))
    or space_id in (select private.my_owned_space_ids())
  );

-- ---------------------------------------------------------------------------
-- 4. spaces: the creator sees the row only until the first member row exists (create_space's
--    INSERT ... RETURNING); after that, only active members do.
-- ---------------------------------------------------------------------------
-- (can_bootstrap_space() cannot be used here: it reads spaces, which does not yet show the row
-- being inserted.)
create or replace function private.space_has_members(p_space_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.space_members m where m.space_id = p_space_id)
$$;
revoke execute on function private.space_has_members(uuid) from public, anon;
grant execute on function private.space_has_members(uuid) to authenticated, service_role;

drop policy spaces_select on public.spaces;
create policy spaces_select on public.spaces for select to authenticated
  using (
    id = any (array(select private.my_space_ids()))
    or (created_by = (select auth.uid()) and not private.space_has_members(id))
  );

-- ---------------------------------------------------------------------------
-- 5. captured_txns: consent enforced in the database too (not only in capture-ingest)
-- ---------------------------------------------------------------------------
drop policy captured_txns_all on public.captured_txns;
create policy captured_txns_select on public.captured_txns for select to authenticated
  using (user_id = (select auth.uid()));
create policy captured_txns_insert on public.captured_txns for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      source = 'manual'
      or exists (
        select 1 from public.privacy_settings ps
        where ps.user_id = (select auth.uid())
          and case when captured_txns.source = 'ebill' then ps.ebills else ps.capture_notifications end
      )
    )
  );
create policy captured_txns_update on public.captured_txns for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy captured_txns_delete on public.captured_txns for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 6. Settlement guard: same state machine as migration 03, plus
--    * API callers cannot change created_by at all (account deletion still nulls it: it runs as
--      the function owner, not as `authenticated`);
--    * completed_at is only ever set by the trigger on a transition, never copied from the client.
-- ---------------------------------------------------------------------------
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
  if new.created_by is distinct from old.created_by
     and (new.created_by is not null or current_user in ('authenticated', 'anon')) then
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
  else
    new.completed_at := old.completed_at;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Updates cannot re-point a row at something the caller could not have inserted it for
-- ---------------------------------------------------------------------------
drop policy settlement_methods_update on public.settlement_methods;
create policy settlement_methods_update on public.settlement_methods for update to authenticated
  using (created_by = (select auth.uid()))
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.settlements s
      where s.id = settlement_methods.settlement_id
        and (s.created_by = (select auth.uid()) or s.from_member in (select private.my_member_ids()))
    )
  );

drop policy expense_notes_update on public.expense_notes;
create policy expense_notes_update on public.expense_notes for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.expenses e where e.id = expense_notes.expense_id)
  );

-- ---------------------------------------------------------------------------
-- 8. register_device: only well-formed Expo push tokens
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
  v_token text := btrim(p_token);
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if v_token is null or length(v_token) > 200
     or v_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,}\]$' then
    raise exception 'invalid_token' using errcode = '22023';
  end if;
  if p_platform is null or (p_app_version is not null and length(p_app_version) > 40) then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;
  insert into public.devices (user_id, expo_push_token, platform, app_version, last_seen_at)
  values (v_uid, v_token, p_platform, p_app_version, now())
  on conflict (expo_push_token) do update
    set user_id = excluded.user_id, platform = excluded.platform,
        app_version = excluded.app_version, last_seen_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. get_pay_link: reminders.items is client-writable, so a space name is shown only when the
--    sender is (or was) a member of that space. Otherwise identical to migration 06.
-- ---------------------------------------------------------------------------
create or replace function public.get_pay_link(p_token text)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  r public.reminders;
  v_name text;
  v_vpa text;
  v_items jsonb;
begin
  if p_token is null or length(p_token) < 22 or length(p_token) > 128 then
    return null;
  end if;

  select * into r from public.reminders x where x.link_token = p_token and x.status = 'active';
  if not found then
    return null;
  end if;

  select nullif(btrim(p.name), ''), nullif(btrim(p.upi_vpa), '') into v_name, v_vpa
  from public.profiles p where p.id = r.from_user;

  if v_name is null or v_vpa is null then
    select coalesce(v_name, nullif(btrim(m.display_name), '')),
           coalesce(v_vpa, nullif(btrim(m.upi_vpa), ''))
      into v_name, v_vpa
    from public.space_members m
    where m.user_id = r.from_user
    order by (m.left_at is null) desc, m.joined_at
    limit 1;
  end if;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'space_name', s.name,
             'description', nullif(btrim(e.val ->> 'label'), ''),
             'amount_minor', (e.val ->> 'amount_minor')::bigint)
           order by e.ord), '[]'::jsonb)
    into v_items
  from jsonb_array_elements(r.items) with ordinality as e(val, ord)
  left join public.spaces s
    on s.id = nullif(e.val ->> 'space_id', '')::uuid
   and exists (select 1 from public.space_members sm
               where sm.space_id = s.id and sm.user_id = r.from_user);

  return jsonb_build_object(
    'payee_name', coalesce(v_name, 'A PayMind user'),
    'payee_upi_vpa', v_vpa,
    'amount_minor', r.amount_minor,
    'items', v_items,
    'note_ref', coalesce(r.note_ref, 'PM-' || upper(left(r.link_token, 6)))
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Per-user rate limits (fixed windows). Called by Edge Functions through the user-scoped
--     client, so the counter is keyed on auth.uid(). A user calling it directly can only use up
--     their own allowance; they cannot reset it.
-- ---------------------------------------------------------------------------
create table private.rate_limits (
  user_id       uuid not null references auth.users (id) on delete cascade,
  bucket        text not null,
  window_start  timestamptz not null,
  hits          int not null default 0,
  primary key (user_id, bucket, window_start)
);
alter table private.rate_limits enable row level security;  -- no policies: definer access only
revoke all on private.rate_limits from public, anon, authenticated;

-- consume_rate_limit(bucket, limit, window_seconds) -> true while the caller is within the limit.
create or replace function public.consume_rate_limit(
  p_bucket text,
  p_limit int,
  p_window_seconds int default 3600
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_start timestamptz;
  v_hits int;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_bucket is null or p_bucket !~ '^[a-z0-9_-]{1,40}$'
     or p_limit is null or p_limit < 1
     or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 604800 then
    raise exception 'invalid_payload: bad rate limit arguments' using errcode = '22023';
  end if;

  v_start := to_timestamp(floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds);
  insert into private.rate_limits as rl (user_id, bucket, window_start, hits)
  values (v_uid, p_bucket, v_start, 1)
  on conflict (user_id, bucket, window_start) do update set hits = rl.hits + 1
  returning rl.hits into v_hits;

  -- Housekeeping: the caller's finished windows for this bucket (PK prefix, so cheap).
  delete from private.rate_limits rl
  where rl.user_id = v_uid and rl.bucket = p_bucket and rl.window_start < v_start;

  return v_hits <= p_limit;
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Length limits (NOT VALID: new and updated rows only)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add constraint profiles_name_len check (name is null or length(name) <= 80) not valid,
  add constraint profiles_upi_vpa_len check (upi_vpa is null or length(upi_vpa) <= 100) not valid;
alter table public.spaces
  add constraint spaces_name_len check (length(name) <= 80) not valid;
alter table public.space_members
  add constraint space_members_display_name_len check (length(display_name) <= 80) not valid,
  add constraint space_members_upi_vpa_len check (upi_vpa is null or length(upi_vpa) <= 100) not valid;
alter table public.expenses
  add constraint expenses_title_len check (title is null or length(title) <= 200) not valid;
alter table public.expense_items
  add constraint expense_items_name_len check (length(name) <= 200) not valid;
alter table public.expense_notes
  add constraint expense_notes_note_len check (length(note) <= 2000) not valid;
alter table public.captured_txns
  add constraint captured_txns_text_len check (
    (raw is null or length(raw) <= 1000) and (payee is null or length(payee) <= 200)
    and (vpa is null or length(vpa) <= 100)) not valid;
alter table public.reminders
  add constraint reminders_message_len check (message is null or length(message) <= 2000) not valid;

-- ---------------------------------------------------------------------------
-- Grants for new / replaced functions (defaults no longer grant to anon / PUBLIC)
-- ---------------------------------------------------------------------------
revoke execute on function public.consume_rate_limit(text, int, int) from public, anon;
grant execute on function public.consume_rate_limit(text, int, int) to authenticated, service_role;
revoke execute on function public.register_device(text, public.device_platform, text) from public, anon;
grant execute on function public.register_device(text, public.device_platform, text) to authenticated, service_role;
revoke execute on function public.accept_space_invite(text) from public, anon;
grant execute on function public.accept_space_invite(text) to authenticated, service_role;
revoke execute on function public.get_pay_link(text) from public;
grant execute on function public.get_pay_link(text) to anon, authenticated, service_role;
revoke execute on function private.can_edit_expense(uuid) from public, anon;
grant execute on function private.can_edit_expense(uuid) to authenticated, service_role;
