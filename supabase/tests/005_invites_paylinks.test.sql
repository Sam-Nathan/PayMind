-- Invites (the only way to attach another real user to a space), locked-down space_members
-- inserts, and the public pay-link RPC (anon sees ONLY the pay-page fields).
begin;
create extension if not exists pgtap with schema extensions;
select plan(40);

insert into auth.users (id, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', '{"name": "Sunny"}'),
  ('22222222-2222-2222-2222-222222222222', '{"name": "Rahul"}'),
  ('33333333-3333-3333-3333-333333333333', '{"name": "Priya"}'),
  ('44444444-4444-4444-4444-444444444444', '{"name": "Karthik"}'),
  ('55555555-5555-5555-5555-555555555555', '{"name": "Ananya"}');
update public.profiles set upi_vpa = 'sunny@okaxis' where id = '11111111-1111-1111-1111-111111111111';

create temp table ids (k text primary key, v uuid);
create temp table codes (k text primary key, v text);
grant all on ids, codes to authenticated, anon;

-- Space creation ------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select throws_like(
  $$select public.create_space('Bad', 'friends', null, null, null,
      '[{"display_name": "Rahul", "user_id": "22222222-2222-2222-2222-222222222222"}]'::jsonb)$$,
  'member_user_id_not_allowed%', 'create_space refuses to attach another real user');

insert into ids select 'space', public.create_space('Flat 402', 'roommates', null, null, null,
  '[{"display_name": "Rahul", "upi_vpa": "rahul@okbank"}, {"display_name": "Neel"}]'::jsonb);
insert into ids select 'm_sunny', id from public.space_members where user_id = '11111111-1111-1111-1111-111111111111';
insert into ids select 'm_rahul', id from public.space_members where display_name = 'Rahul';
insert into ids select 'm_neel', id from public.space_members where display_name = 'Neel';

select lives_ok(
  format($$insert into public.space_members (space_id, display_name) values ('%s', 'Aman')$$, (select v from ids where k = 'space')),
  'an owner can still add a placeholder member directly');
insert into ids select 'm_aman', id from public.space_members where display_name = 'Aman';

select throws_ok(
  format($$insert into public.space_members (space_id, user_id, display_name) values ('%s', '44444444-4444-4444-4444-444444444444', 'Karthik')$$,
         (select v from ids where k = 'space')),
  '42501', null, 'even an owner cannot insert a member row for another real user');

-- Creating invites ----------------------------------------------------------------------
insert into codes select 'neel', public.create_space_invite((select v from ids where k = 'space'), (select v from ids where k = 'm_neel'));
select matches((select v from codes where k = 'neel'), '^[A-Z2-9]{8}$', 'invite code is 8 unambiguous base32 characters');

select throws_like(
  format($$select public.create_space_invite('%s', '%s')$$, (select v from ids where k = 'space'), (select v from ids where k = 'm_sunny')),
  'member_already_linked%', 'cannot invite into a member row that already belongs to a user');
select throws_ok(
  format($$insert into public.space_invites (space_id, member_id, code) values ('%s', '%s', 'ABCDEFGH')$$,
         (select v from ids where k = 'space'), (select v from ids where k = 'm_neel')),
  '42501', null, 'clients cannot insert invites directly');
select is((select count(*)::int from public.space_invites), 1, 'members see the space''s invites');

set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
select throws_like(
  format($$select public.create_space_invite('%s', '%s')$$, (select v from ids where k = 'space'), (select v from ids where k = 'm_neel')),
  'not_space_member%', 'a non-member cannot create invites');
select is((select count(*)::int from public.space_invites), 0, 'non-members see no invites');
select is((select public.preview_space_invite((select v from codes where k = 'neel')) ->> 'space_name'), 'Flat 402',
          'preview shows the space name to the invitee');
select is((select (public.preview_space_invite((select v from codes where k = 'neel')) ->> 'usable')::boolean), true,
          'preview says the invite is usable');

-- Accepting ---------------------------------------------------------------------------
select throws_like($$select public.accept_space_invite('ZZZZZZZZ')$$, 'invite_not_found%', 'unknown code is rejected');
select is((select public.accept_space_invite(lower((select v from codes where k = 'neel'))) ->> 'member_id')::uuid,
          (select v from ids where k = 'm_neel'), 'accepting (case-insensitive) returns the claimed member row');
select is((select count(*)::int from public.spaces), 1, 'after accepting, the new member can see the space');
select is((select count(*)::int from public.balances where space_id = (select v from ids where k = 'space')), 4,
          'and its balances');
select throws_like(format($$select public.accept_space_invite('%s')$$, (select v from codes where k = 'neel')),
  'invite_already_used%', 'a used code cannot be used again');

-- Already a member cannot take a second spot.
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into codes select 'rahul', public.create_space_invite((select v from ids where k = 'space'), (select v from ids where k = 'm_rahul'));
set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
select throws_like(format($$select public.accept_space_invite('%s')$$, (select v from codes where k = 'rahul')),
  'already_space_member%', 'an existing active member cannot accept another invite');

-- Expired codes are rejected.
reset role;
update public.space_invites set expires_at = now() - interval '1 minute' where code = (select v from codes where k = 'rahul');
set local role authenticated;
set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select throws_like(format($$select public.accept_space_invite('%s')$$, (select v from codes where k = 'rahul')),
  'invite_expired%', 'an expired code is rejected');

-- A newer invite for the same placeholder expires the older one.
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into codes select 'rahul2', public.create_space_invite((select v from ids where k = 'space'), (select v from ids where k = 'm_rahul'));
insert into codes select 'rahul3', public.create_space_invite((select v from ids where k = 'space'), (select v from ids where k = 'm_rahul'));
set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select throws_like(format($$select public.accept_space_invite('%s')$$, (select v from codes where k = 'rahul2')),
  'invite_expired%', 're-inviting the same placeholder invalidates the previous code');
select lives_ok(format($$select public.accept_space_invite('%s')$$, (select v from codes where k = 'rahul3')),
  'the newest code works');
select is((select user_id from public.space_members where id = (select v from ids where k = 'm_rahul')),
          '33333333-3333-3333-3333-333333333333'::uuid, 'the placeholder row is now linked to the accepting user');
select is((select role::text from public.space_members where id = (select v from ids where k = 'm_rahul')), 'member',
          'invitees join as plain members');

-- A member who left cannot silently re-join through a new placeholder.
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update public.space_members set left_at = now() where id = (select v from ids where k = 'm_rahul');
insert into codes select 'aman', public.create_space_invite((select v from ids where k = 'space'), (select v from ids where k = 'm_aman'));
set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select throws_like(format($$select public.accept_space_invite('%s')$$, (select v from codes where k = 'aman')),
  'previously_left_space%', 'a former member is told to ask an owner instead of taking a new spot');
set local request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
select lives_ok(format($$select public.accept_space_invite('%s')$$, (select v from codes where k = 'aman')),
  'a brand-new user can accept');

-- Anonymous ---------------------------------------------------------------------------
reset role;
set local role anon;
select throws_ok(format($$select public.create_space_invite('%s', '%s')$$, (select v from ids where k = 'space'), (select v from ids where k = 'm_neel')),
  '42501', null, 'anon cannot create invites');
select throws_ok($$select public.accept_space_invite('ABCDEFGH')$$, '42501', null, 'anon cannot accept invites');
select throws_ok($$select count(*) from public.space_invites$$, '42501', null, 'anon cannot read space_invites');

-- Pay links -----------------------------------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into public.reminders (to_member, amount_minor, items, tone)
values ((select v from ids where k = 'm_neel'), 125000,
  jsonb_build_array(
    jsonb_build_object('space_id', (select v from ids where k = 'space'), 'label', 'Electricity (Sep)', 'amount_minor', 100000),
    jsonb_build_object('space_id', (select v from ids where k = 'space'), 'label', 'Wifi', 'amount_minor', 25000)),
  'friendly');
insert into codes select 'tok', link_token from public.reminders;
select cmp_ok((select length(v) from codes where k = 'tok'), '>=', 22, 'link tokens are at least 22 characters');

reset role;
set local role anon;
select is(array(select jsonb_object_keys(public.get_pay_link((select v from codes where k = 'tok'))) order by 1),
          array['amount_minor', 'items', 'note_ref', 'payee_name', 'payee_upi_vpa'],
          'anon gets exactly the pay-page fields and nothing else');
select is(public.get_pay_link((select v from codes where k = 'tok')) ->> 'payee_name', 'Sunny', 'payee name');
select is(public.get_pay_link((select v from codes where k = 'tok')) ->> 'payee_upi_vpa', 'sunny@okaxis', 'payee UPI id');
select is((public.get_pay_link((select v from codes where k = 'tok')) ->> 'amount_minor')::bigint, 125000::bigint, 'amount');
select matches(public.get_pay_link((select v from codes where k = 'tok')) ->> 'note_ref', '^PM-[0-9A-F]{6}$', 'note_ref is derived when unset');
select is(jsonb_array_length(public.get_pay_link((select v from codes where k = 'tok')) -> 'items'), 2, 'two line items');
select is(array(select jsonb_object_keys(public.get_pay_link((select v from codes where k = 'tok')) -> 'items' -> 0) order by 1),
          array['amount_minor', 'description', 'space_name'], 'items expose only space name, description and amount');
select is(public.get_pay_link((select v from codes where k = 'tok')) -> 'items' -> 0 ->> 'space_name', 'Flat 402', 'item space name');
select is(public.get_pay_link('not-a-real-token-but-long-enough-000000'), null::jsonb, 'unknown token -> null');
select is(public.get_pay_link('short'), null::jsonb, 'short token -> null');
select throws_ok($$select count(*) from public.reminders$$, '42501', null, 'anon cannot read reminders directly');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update public.reminders set status = 'cancelled';
reset role;
set local role anon;
select is(public.get_pay_link((select v from codes where k = 'tok')), null::jsonb, 'cancelled reminders stop resolving');

select * from finish();
rollback;
