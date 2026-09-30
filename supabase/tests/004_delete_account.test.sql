-- delete_my_account: personal data removed, shared rows kept and anonymised ("Former member"),
-- last owner hands over ownership. Also: non-parties cannot touch a settlement.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', '{"name": "Sunny"}'),
  ('22222222-2222-2222-2222-222222222222', '{"name": "Rahul"}'),
  ('33333333-3333-3333-3333-333333333333', '{"name": "Priya"}');

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into ids select 'space', public.create_space('Goa Trip', 'trip', '2026-10-02', '2026-10-06', 7500000,
  '[{"display_name": "Rahul"},
    {"display_name": "Priya"}]'::jsonb);
-- Link placeholders to real users (clients may not do this; the invite flow does, see 005).
reset role;
update public.space_members set user_id = '22222222-2222-2222-2222-222222222222' where display_name = 'Rahul' and space_id = (select v from ids where k = 'space');
update public.space_members set user_id = '33333333-3333-3333-3333-333333333333' where display_name = 'Priya' and space_id = (select v from ids where k = 'space');
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into ids select 'm_sunny', id from public.space_members where user_id = '11111111-1111-1111-1111-111111111111';
insert into ids select 'm_rahul', id from public.space_members where user_id = '22222222-2222-2222-2222-222222222222';
insert into ids select 'm_priya', id from public.space_members where user_id = '33333333-3333-3333-3333-333333333333';

-- Rahul: pays a shared expense (with a private note), has personal data everywhere,
-- and owns a space of his own where Sunny is a member.
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
insert into ids select 'parasailing', public.create_expense(jsonb_build_object(
  'space_id', (select v from ids where k = 'space'), 'title', 'Parasailing', 'total_minor', 450000,
  'paid_by_member', (select v from ids where k = 'm_rahul'), 'note', 'rahul private',
  'shares', jsonb_build_array(
    jsonb_build_object('member_id', (select v from ids where k = 'm_sunny'), 'owed_minor', 150000),
    jsonb_build_object('member_id', (select v from ids where k = 'm_rahul'), 'owed_minor', 150000),
    jsonb_build_object('member_id', (select v from ids where k = 'm_priya'), 'owed_minor', 150000))));
insert into ids select 'rahul_personal', public.create_expense('{"title": "Uber", "total_minor": 21200}'::jsonb);
update public.privacy_settings set capture_notifications = true where user_id = (select auth.uid());
insert into public.captured_txns (source, amount_minor, payee, occurred_at, dedupe_hash)
  values ('sms', 50000, 'Metro card', now(), 'm1');
insert into public.learned_rules (kind, match, action) values ('merchant', '{"raw": "UBERRIDES BLR"}', '{"merchant": "Uber"}');
insert into ids select 'rahul_space', public.create_space('Rahul flat', 'roommates', null, null, null,
  '[{"display_name": "Sunny"}]'::jsonb);
-- Link placeholders to real users (clients may not do this; the invite flow does, see 005).
reset role;
update public.space_members set user_id = '11111111-1111-1111-1111-111111111111' where display_name = 'Sunny' and space_id = (select v from ids where k = 'rahul_space');
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

-- Settlement Sunny -> Rahul; Priya (not a party, not an owner) cannot change it.
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into ids select 'settle', public.record_settlement((select v from ids where k = 'space'),
  (select v from ids where k = 'm_sunny'), (select v from ids where k = 'm_rahul'), 150000);
set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select throws_ok(
  $$select public.update_settlement_status((select v from ids where k = 'settle'), 'completed')$$,
  '42501', 'settlement_not_found_or_forbidden', 'a member who is not a party cannot change a settlement');

-- Rahul deletes his account.
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select lives_ok('select public.delete_my_account()', 'delete_my_account runs');

reset role;
select is((select count(*)::int from auth.users where id = '22222222-2222-2222-2222-222222222222'), 0, 'auth user deleted');
select is((select count(*)::int from public.profiles where id = '22222222-2222-2222-2222-222222222222'), 0, 'profile deleted');
select is((select count(*)::int from public.expenses where id = (select v from ids where k = 'rahul_personal')), 0,
          'personal expense deleted');
select is((select count(*)::int from public.captured_txns), 0, 'capture inbox deleted');
select is((select count(*)::int from public.learned_rules), 0, 'learned rules deleted');
select is((select count(*)::int from public.expense_notes), 0, 'private notes deleted');
select is((select count(*)::int from public.privacy_settings where user_id = '22222222-2222-2222-2222-222222222222'), 0,
          'privacy settings deleted');
select results_eq(
  format($$select user_id, display_name, left_at is not null from public.space_members where id = '%s'$$,
         (select v from ids where k = 'm_rahul')),
  $$values (null::uuid, 'Former member'::text, true)$$,
  'member row anonymised as Former member');
select is((select owner_id from public.expenses where id = (select v from ids where k = 'parasailing')), null::uuid,
          'shared expense kept with creator anonymised');

-- The rest of the group still sees the shared history and correct balances.
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select is((select count(*)::int from public.expenses where id = (select v from ids where k = 'parasailing')), 1,
          'other members still see the shared expense');
select results_eq(
  format($$select display_name, net_minor from public.balances where space_id = '%s' order by net_minor, display_name$$,
         (select v from ids where k = 'space')),
  $$values ('Priya'::text, -150000::bigint), ('Sunny'::text, -150000::bigint), ('Former member'::text, 300000::bigint)$$,
  'balances intact, former member shown anonymised');
select is((select role::text from public.space_members
           where space_id = (select v from ids where k = 'rahul_space') and user_id = '11111111-1111-1111-1111-111111111111'),
          'owner', 'remaining member is promoted when the last owner deletes their account');
select is((select count(*)::int from public.settlements where id = (select v from ids where k = 'settle')), 1,
          'settlements kept');
-- Space owner can still move the settlement with the former member.
select is((select status::text from public.update_settlement_status((select v from ids where k = 'settle'), 'completed')),
          'completed', 'settlement with a former member can still be completed');

reset role;
select * from finish();
rollback;
