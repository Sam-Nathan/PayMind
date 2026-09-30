-- Security review (migration 09). Every block below FAILS on migrations 01-08 and passes with 09:
-- each one is an exploit that used to work.
begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

insert into auth.users (id, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', '{"name": "Sunny"}'),
  ('22222222-2222-2222-2222-222222222222', '{"name": "Rahul"}'),
  ('33333333-3333-3333-3333-333333333333', '{"name": "Priya"}'),
  ('44444444-4444-4444-4444-444444444444', '{"name": "Karthik"}');
update public.profiles set upi_vpa = 'sunny@okaxis' where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set upi_vpa = 'karthik@okicici' where id = '44444444-4444-4444-4444-444444444444';

create temp table ids (k text primary key, v uuid);
create temp table codes (k text primary key, v text);
grant all on ids, codes to authenticated, anon;

-- Setup: Sunny owns "Flat 402"; Rahul and Priya join through invites. ------------------------
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into ids select 'space', public.create_space('Flat 402', 'roommates', null, null, null,
  '[{"display_name": "Rahul"}, {"display_name": "Priya"}, {"display_name": "Neel", "upi_vpa": "sunny.alt@okaxis"}]'::jsonb);
insert into ids select 'm_sunny', id from public.space_members where display_name = 'Sunny';
insert into ids select 'm_rahul', id from public.space_members where display_name = 'Rahul';
insert into ids select 'm_priya', id from public.space_members where display_name = 'Priya';
insert into ids select 'm_neel', id from public.space_members where display_name = 'Neel';
insert into codes select 'rahul', public.create_space_invite((select v from ids where k = 'space'), (select v from ids where k = 'm_rahul'));
insert into codes select 'priya', public.create_space_invite((select v from ids where k = 'space'), (select v from ids where k = 'm_priya'));
insert into codes select 'neel', public.create_space_invite((select v from ids where k = 'space'), (select v from ids where k = 'm_neel'));
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select public.accept_space_invite((select v from codes where k = 'rahul'));
set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select public.accept_space_invite((select v from codes where k = 'priya'));

-- Rahul records a shared expense (with an item) while he is a member.
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
insert into ids select 'exp_rahul', public.create_expense(jsonb_build_object(
  'space_id', (select v from ids where k = 'space'), 'title', 'Groceries', 'total_minor', 90000,
  'paid_by_member', (select v from ids where k = 'm_rahul'),
  'items', jsonb_build_array(jsonb_build_object('name', 'Rice', 'amount_minor', 90000)),
  'shares', jsonb_build_array(
    jsonb_build_object('member_id', (select v from ids where k = 'm_sunny'), 'owed_minor', 30000),
    jsonb_build_object('member_id', (select v from ids where k = 'm_rahul'), 'owed_minor', 30000),
    jsonb_build_object('member_id', (select v from ids where k = 'm_priya'), 'owed_minor', 30000))));

-- 1. A member who left cannot rejoin on their own ----------------------------------------------
select lives_ok(
  format($$update public.space_members set left_at = now() where id = '%s'$$, (select v from ids where k = 'm_rahul')),
  'a member can leave (sets their own left_at)');
select throws_ok(
  format($$update public.space_members set left_at = null where id = '%s'$$, (select v from ids where k = 'm_rahul')),
  '42501', null, 'a former member cannot clear their own left_at to rejoin');

-- 3. ...and loses access to the shared expenses they created -------------------------------------
select is((select count(*)::int from public.expenses where id = (select v from ids where k = 'exp_rahul')), 0,
          'a former member no longer sees a shared expense they created');
select is((select count(*)::int from public.expense_items where expense_id = (select v from ids where k = 'exp_rahul')), 0,
          '...nor its items');
delete from public.expenses where id = (select v from ids where k = 'exp_rahul');
select throws_like(
  format($$select public.update_expense('%s', '{"space_id": null}'::jsonb)$$, (select v from ids where k = 'exp_rahul')),
  'expense_not_found_or_forbidden%', 'a former member cannot pull the expense out of the space via update_expense');
select throws_like(
  format($$select public.update_expense('%s', '{"total_minor": 1}'::jsonb)$$, (select v from ids where k = 'exp_rahul')),
  'expense_not_found_or_forbidden%', 'a former member cannot edit it');
select is((select count(*)::int from public.expense_notes), 0, 'sanity: no notes');
select throws_ok(
  format($$insert into public.expense_notes (expense_id, note) values ('%s', 'x')$$, (select v from ids where k = 'exp_rahul')),
  '42501', null, 'a former member cannot attach a note to it either');

set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select is((select count(*)::int from public.expenses where id = (select v from ids where k = 'exp_rahul')), 1,
          'the former member''s DELETE did nothing: the expense is still there for the space');
select is((select total_minor from public.expenses where id = (select v from ids where k = 'exp_rahul')), 90000::bigint,
          '...unchanged');

-- The owner may restore a former member (the path accept_space_invite points people to).
select lives_ok(
  format($$update public.space_members set left_at = null where id = '%s'$$, (select v from ids where k = 'm_rahul')),
  'a space owner can restore a former member');
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select is((select count(*)::int from public.expenses where id = (select v from ids where k = 'exp_rahul')), 1,
          'once restored, the member sees their expense again');
update public.expenses set title = 'Groceries (Sep)' where id = (select v from ids where k = 'exp_rahul');
select is((select title from public.expenses where id = (select v from ids where k = 'exp_rahul')), 'Groceries (Sep)',
          'and can edit it again');

-- 2. Payout VPA of a real user belongs to that user ----------------------------------------------
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select throws_ok(
  format($$update public.space_members set upi_vpa = 'sunny@okaxis' where id = '%s'$$, (select v from ids where k = 'm_priya')),
  '42501', null, 'an owner cannot re-point another real member''s UPI ID to themselves');
select lives_ok(
  format($$update public.space_members set display_name = 'Priya S' where id = '%s'$$, (select v from ids where k = 'm_priya')),
  'an owner can still rename a member');
set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select lives_ok(
  format($$update public.space_members set upi_vpa = 'priya@okhdfc' where id = '%s'$$, (select v from ids where k = 'm_priya')),
  'a member can set their own UPI ID');

-- Invite hand-over: the placeholder's inviter-typed VPA must not follow the new user.
set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
select public.accept_space_invite((select v from codes where k = 'neel'));
select is((select upi_vpa from public.space_members where id = (select v from ids where k = 'm_neel')), 'karthik@okicici',
          'accepting an invite replaces the inviter-typed UPI ID with the accepter''s own');

-- 4. A creator who left no longer sees the space ------------------------------------------------
insert into ids select 'kspace', public.create_space('Karthik solo', 'custom');
update public.space_members set left_at = now() where space_id = (select v from ids where k = 'kspace');
select is((select count(*)::int from public.spaces where id = (select v from ids where k = 'kspace')), 0,
          'a space creator who left no longer sees the space');
select is((select count(*)::int from public.spaces where id = (select v from ids where k = 'space')), 1,
          'members still see their space');

-- 5. Capture consent is enforced by the database -------------------------------------------------
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select throws_ok(
  $$insert into public.captured_txns (source, amount_minor, occurred_at, dedupe_hash) values ('upi_notification', 29900, now(), 'h-1')$$,
  '42501', null, 'notification captures are refused while capture_notifications is off');
select throws_ok(
  $$insert into public.captured_txns (source, amount_minor, occurred_at, dedupe_hash) values ('ebill', 29900, now(), 'h-2')$$,
  '42501', null, 'e-bill captures are refused while ebills is off');
select lives_ok(
  $$insert into public.captured_txns (source, amount_minor, occurred_at, dedupe_hash) values ('manual', 29900, now(), 'h-3')$$,
  'manual inbox entries need no capture consent');
update public.privacy_settings set capture_notifications = true where user_id = '22222222-2222-2222-2222-222222222222';
select lives_ok(
  $$insert into public.captured_txns (source, amount_minor, occurred_at, dedupe_hash) values ('upi_notification', 29900, now(), 'h-4')$$,
  'notification captures work once the user opts in');

-- 6. Settlements: created_by and completed_at cannot be forged ----------------------------------
insert into ids select 'st1', public.record_settlement((select v from ids where k = 'space'),
  (select v from ids where k = 'm_rahul'), (select v from ids where k = 'm_sunny'), 30000, 'cash', 'confirmed_manual');
select throws_like(
  format($$update public.settlements set created_by = null where id = '%s'$$, (select v from ids where k = 'st1')),
  'settlement_created_by_immutable%', 'a party cannot null out created_by');
update public.settlements set completed_at = '2020-01-01' where id = (select v from ids where k = 'st1');
select cmp_ok((select completed_at from public.settlements where id = (select v from ids where k = 'st1')), '>', '2026-01-01'::timestamptz,
              'completed_at cannot be back-dated by a direct update');

-- Design decision (documented in docs/schema.md): the payer may self-report, the payee can dispute.
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select lives_ok(
  format($$select public.update_settlement_status('%s', 'cancelled')$$, (select v from ids where k = 'st1')),
  'the payee can cancel a payment the payer self-reported');
set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
insert into ids select 'st2', public.record_settlement((select v from ids where k = 'space'),
  (select v from ids where k = 'm_priya'), (select v from ids where k = 'm_sunny'), 10000, null);  -- no method row
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select throws_like(
  format($$select public.update_settlement_status('%s', 'completed')$$, (select v from ids where k = 'st2')),
  'settlement_not_found_or_forbidden%', 'a member who is not a party cannot move someone else''s settlement');

-- 7. settlement_methods / expense_notes cannot be re-pointed -----------------------------------
insert into ids select 'st3', public.record_settlement((select v from ids where k = 'space'),
  (select v from ids where k = 'm_rahul'), (select v from ids where k = 'm_sunny'), 5000, 'upi');
select throws_ok(
  format($$update public.settlement_methods set settlement_id = '%s' where settlement_id = '%s'$$,
         (select v from ids where k = 'st2'), (select v from ids where k = 'st3')),
  '42501', null, 'a recorder cannot move their payment-method row onto someone else''s settlement');

set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into ids select 'exp_personal', public.create_expense('{"title": "Sunny personal", "total_minor": 5000}'::jsonb);
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
insert into public.expense_notes (expense_id, note) values ((select v from ids where k = 'exp_rahul'), 'my note');
select throws_ok(
  format($$update public.expense_notes set expense_id = '%s' where expense_id = '%s'$$,
         (select v from ids where k = 'exp_personal'), (select v from ids where k = 'exp_rahul')),
  '42501', null, 'a note cannot be re-pointed at an expense the author cannot see');

-- 8. register_device validates tokens --------------------------------------------------------
select throws_like($$select public.register_device('not-a-token', 'android')$$, 'invalid_token%',
                   'register_device rejects malformed push tokens');
select throws_like(format($$select public.register_device('ExponentPushToken[%s]', 'android')$$, repeat('a', 300)),
                   'invalid_token%', 'register_device rejects oversized tokens');
select lives_ok($$select public.register_device('ExponentPushToken[abcdefghij1234567890]', 'android', '0.1.0')$$,
                'register_device accepts a well-formed Expo token');

-- 9. get_pay_link does not leak names of spaces the sender is not in -------------------------
set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
insert into public.reminders (to_member, amount_minor, items)
select m.id, 100, jsonb_build_array(
  jsonb_build_object('space_id', (select v from ids where k = 'space'), 'label', 'probe', 'amount_minor', 100),
  jsonb_build_object('space_id', (select v from ids where k = 'kspace'), 'label', 'own', 'amount_minor', 0))
from public.space_members m where m.space_id = (select v from ids where k = 'kspace');
insert into codes select 'probe', link_token from public.reminders;
reset role;
set local role anon;
select is(public.get_pay_link((select v from codes where k = 'probe')) -> 'items' -> 0 ->> 'space_name', 'Flat 402',
          'a space the sender belongs to is named');
reset role;
update public.space_members set left_at = now(), user_id = null
 where id = (select v from ids where k = 'm_neel');  -- Karthik is no longer linked to Flat 402
set local role anon;
select is(public.get_pay_link((select v from codes where k = 'probe')) -> 'items' -> 0 ->> 'space_name', null,
          'a space the sender is not in is not named, even if its id is in reminders.items');
select is(public.get_pay_link((select v from codes where k = 'probe')) -> 'items' -> 1 ->> 'space_name', 'Karthik solo',
          'a space the sender left is still named (it is their own history)');

-- 10. Rate limits ------------------------------------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select is(public.consume_rate_limit('test', 2, 3600), true, 'rate limit: first call allowed');
select is(public.consume_rate_limit('test', 2, 3600), true, 'rate limit: second call allowed');
select is(public.consume_rate_limit('test', 2, 3600), false, 'rate limit: third call refused');
set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select is(public.consume_rate_limit('test', 2, 3600), true, 'rate limits are per user');
select throws_like($$select public.consume_rate_limit('Bad Bucket!', 2, 3600)$$, 'invalid_payload%', 'bucket names are validated');
select throws_ok($$select count(*) from private.rate_limits$$, '42501', null, 'clients cannot read or reset the counters');

-- 11. Length limits --------------------------------------------------------------------------
select throws_ok(format($$select public.create_space('%s', 'friends')$$, repeat('x', 200)), '23514', null,
                 'space names are capped at 80 characters');

select * from finish();
rollback;
