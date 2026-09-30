-- PayMind schema v1 — part 6: invites, tightened member inserts, public pay links.
--
-- 1. Future tables / functions are not reachable by `anon` (or PUBLIC) unless a migration
--    grants it explicitly.
-- 2. space_invites + create_space_invite / accept_space_invite / preview_space_invite:
--    the ONLY way to attach another real user to a space_members row.
-- 3. space_members insert policy no longer lets clients set someone else's user_id;
--    create_space rejects p_members[].user_id.
-- 4. reminders.note_ref + get_pay_link(token): the single thing `anon` may call. It returns
--    only what a public "Pay Sunny ₹1,250" page needs.

-- ---------------------------------------------------------------------------
-- 1. Default privileges (applies to objects created later by the migration role)
-- ---------------------------------------------------------------------------
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;
alter default privileges in schema public revoke execute on functions from public;

-- ---------------------------------------------------------------------------
-- 2. Invites
-- ---------------------------------------------------------------------------
create table public.space_invites (
  id           uuid primary key default gen_random_uuid(),
  space_id     uuid not null,
  member_id    uuid not null,                        -- the placeholder row the invitee will take over
  code         text not null unique,                 -- 8 chars, unambiguous base32 alphabet
  created_by   uuid default auth.uid() references auth.users (id) on delete set null,
  expires_at   timestamptz not null default now() + interval '7 days',
  accepted_by  uuid references auth.users (id) on delete set null,
  accepted_at  timestamptz,
  created_at   timestamptz not null default now(),
  constraint space_invites_member_fkey foreign key (space_id, member_id)
    references public.space_members (space_id, id) on delete cascade,
  constraint space_invites_code_format check (code ~ '^[A-Z2-9]{8}$')
);
create index space_invites_member_idx on public.space_invites (space_id, member_id);
create index space_invites_created_by_idx on public.space_invites (created_by);
create index space_invites_accepted_by_idx on public.space_invites (accepted_by);

alter table public.space_invites enable row level security;

-- Members can see the invites of their spaces; only the inviter or a space owner can revoke.
-- There is deliberately no insert/update policy: invites are created and accepted through
-- the RPCs below (SECURITY DEFINER).
create policy space_invites_select on public.space_invites for select to authenticated
  using (space_id in (select private.my_space_ids()));
create policy space_invites_delete on public.space_invites for delete to authenticated
  using (created_by = (select auth.uid()) or space_id in (select private.my_owned_space_ids()));

revoke all on public.space_invites from anon;
revoke insert, update on public.space_invites from authenticated;
grant select, delete on public.space_invites to authenticated;
grant all on public.space_invites to service_role;

-- 8 random chars from a 32-symbol alphabet without I, O, 0, 1 (40 bits).
create or replace function private.gen_invite_code()
returns text
language plpgsql volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea := extensions.gen_random_bytes(8);
  v_code text := '';
  i int;
begin
  for i in 0..7 loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) & 31) + 1, 1);
  end loop;
  return v_code;
end;
$$;

-- create_space_invite(space, member) -> code. Any active member of the space may invite
-- someone into a placeholder (not-on-the-app) member row. Older open invites for the same
-- placeholder are expired so only the newest code works.
create or replace function public.create_space_invite(p_space_id uuid, p_member_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_member public.space_members;
  v_code text;
  v_try int := 0;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not private.is_space_member(p_space_id) then
    raise exception 'not_space_member' using errcode = '42501';
  end if;

  select * into v_member from public.space_members m
  where m.id = p_member_id and m.space_id = p_space_id;
  if not found then
    raise exception 'member_not_found: no such member in this space' using errcode = '22023';
  end if;
  if v_member.user_id is not null then
    raise exception 'member_already_linked: this member is already on PayMind' using errcode = '22023';
  end if;
  if v_member.left_at is not null then
    raise exception 'member_has_left: this member has left the space' using errcode = '22023';
  end if;

  update public.space_invites i set expires_at = now()
  where i.member_id = p_member_id and i.accepted_at is null and i.expires_at > now();

  loop
    v_code := private.gen_invite_code();
    begin
      insert into public.space_invites (space_id, member_id, code, created_by)
      values (p_space_id, p_member_id, v_code, v_uid);
      return v_code;
    exception when unique_violation then
      v_try := v_try + 1;
      if v_try >= 5 then
        raise;
      end if;
    end;
  end loop;
end;
$$;

-- preview_space_invite(code): what the invitee sees before joining. Signed-in users only.
create or replace function public.preview_space_invite(p_code text)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_inv public.space_invites;
  v_space_name text;
  v_member_name text;
  v_inviter text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select * into v_inv from public.space_invites i where i.code = upper(btrim(p_code));
  if not found then
    raise exception 'invite_not_found' using errcode = '22023';
  end if;
  select s.name into v_space_name from public.spaces s where s.id = v_inv.space_id;
  select m.display_name into v_member_name from public.space_members m where m.id = v_inv.member_id;
  select coalesce(nullif(btrim(p.name), ''), 'Someone') into v_inviter
  from public.profiles p where p.id = v_inv.created_by;
  return jsonb_build_object(
    'space_name', v_space_name,
    'member_name', v_member_name,
    'invited_by', coalesce(v_inviter, 'Someone'),
    'expires_at', v_inv.expires_at,
    'usable', v_inv.accepted_at is null and v_inv.expires_at > now()
  );
end;
$$;

-- accept_space_invite(code) -> {space_id, member_id}. Links the placeholder member row to
-- the caller. Fails if the code is unknown / expired / used, or the caller is already a member.
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

  update public.space_members m set user_id = v_uid where m.id = v_inv.member_id;
  update public.space_invites i set accepted_by = v_uid, accepted_at = now() where i.id = v_inv.id;
  update public.space_invites i set expires_at = now()
  where i.member_id = v_inv.member_id and i.accepted_at is null and i.expires_at > now();

  return jsonb_build_object('space_id', v_inv.space_id, 'member_id', v_inv.member_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Clients can never attach ANOTHER real user to a space.
--    Allowed client inserts: placeholder rows (user_id null) and the caller's own row
--    (create_space's owner row). Everything else goes through accept_space_invite.
-- ---------------------------------------------------------------------------
drop policy space_members_insert on public.space_members;
create policy space_members_insert on public.space_members for insert to authenticated
  with check (
    (user_id is null or user_id = (select auth.uid()))
    and (
      space_id in (select private.my_owned_space_ids())
      or (role = 'member' and space_id in (select private.my_space_ids()))
      or (role = 'owner' and user_id = (select auth.uid()) and private.can_bootstrap_space(space_id))
    )
  );

-- create_space: p_members are placeholders. A non-null user_id (other than the caller's) is
-- rejected; use create_space_invite / accept_space_invite to bring people on.
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
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_members, '[]'::jsonb)) x
    where nullif(x ->> 'user_id', '') is not null and (x ->> 'user_id')::uuid <> v_uid
  ) then
    raise exception 'member_user_id_not_allowed: add people as placeholders and invite them with create_space_invite'
      using errcode = '22023';
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
  select v_space, null, btrim(x.display_name), nullif(btrim(x.upi_vpa), ''),
         coalesce(x.share_weight, 1), 'member'
  from jsonb_to_recordset(coalesce(p_members, '[]'::jsonb))
       as x(display_name text, upi_vpa text, user_id uuid, share_weight numeric)
  where x.user_id is distinct from v_uid;

  return v_space;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Public pay links
-- ---------------------------------------------------------------------------
alter table public.reminders add column note_ref text;  -- UPI note, e.g. 'PM-7F3K2A'
-- link_token is already unique + random (32 hex chars = 128 bits); make the floor explicit.
alter table public.reminders
  add constraint reminders_link_token_len check (length(link_token) >= 22);

-- get_pay_link(token): callable by anon. Returns NULL for unknown / finished reminders, else
--   { payee_name, payee_upi_vpa, amount_minor, note_ref,
--     items: [{ space_name, description, amount_minor }] }
-- and nothing else (no ids, no phone numbers, no payer identity).
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
  left join public.spaces s on s.id = nullif(e.val ->> 'space_id', '')::uuid;

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
-- Grants for the new functions (defaults no longer grant to anon / PUBLIC)
-- ---------------------------------------------------------------------------
revoke execute on function private.gen_invite_code() from public, anon;
grant execute on function private.gen_invite_code() to authenticated, service_role;

revoke execute on function public.create_space_invite(uuid, uuid) from public, anon;
revoke execute on function public.preview_space_invite(text) from public, anon;
revoke execute on function public.accept_space_invite(text) from public, anon;
grant execute on function public.create_space_invite(uuid, uuid) to authenticated, service_role;
grant execute on function public.preview_space_invite(text) to authenticated, service_role;
grant execute on function public.accept_space_invite(text) to authenticated, service_role;

revoke execute on function public.get_pay_link(text) from public;
grant execute on function public.get_pay_link(text) to anon, authenticated, service_role;

-- create_space was replaced: keep its grants identical to before.
revoke execute on function public.create_space(text, public.space_type, date, date, bigint, jsonb, jsonb) from public, anon;
grant execute on function public.create_space(text, public.space_type, date, date, bigint, jsonb, jsonb) to authenticated, service_role;
