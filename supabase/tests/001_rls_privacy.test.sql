-- RLS / "share the minimum": non-members see nothing; members never see each other's
-- personal expenses, private notes, profiles or (by default) payment method.
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

-- Fixtures ----------------------------------------------------------------------------
insert into auth.users (id, phone, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', '+919800000001', '{"name": "Sunny"}'),
  ('22222222-2222-2222-2222-222222222222', '+919800000002', '{"name": "Rahul"}'),
  ('33333333-3333-3333-3333-333333333333', '+919800000003', '{"name": "Priya"}'),
  ('44444444-4444-4444-4444-444444444444', '+919800000004', '{"name": "Karthik"}');

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon;

select is((select count(*)::int from public.profiles), 4, 'profiles are auto-created for new auth users');
select is((select count(*)::int from public.privacy_settings where not share_payment_method), 4,
          'privacy_settings default to not sharing payment method');

-- Sunny creates "Friends" with Rahul and Priya (both on the app).
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into ids select 'space', public.create_space(
  'Friends', 'friends', null, null, null,
  '[{"display_name": "Rahul", "user_id": "22222222-2222-2222-2222-222222222222", "upi_vpa": "rahul@okbank"},
    {"display_name": "Priya", "user_id": "33333333-3333-3333-3333-333333333333"}]'::jsonb);
reset role;

insert into ids select 'm_sunny', id from public.space_members where user_id = '11111111-1111-1111-1111-111111111111';
insert into ids select 'm_rahul', id from public.space_members where user_id = '22222222-2222-2222-2222-222222222222';
insert into ids select 'm_priya', id from public.space_members where user_id = '33333333-3333-3333-3333-333333333333';

select is((select role::text from public.space_members where id = (select v from ids where k = 'm_sunny')),
          'owner', 'creator is added as owner member');

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
-- Shared dinner ₹900 paid by Sunny, split 3 ways, with Sunny's private note.
insert into ids select 'dinner', public.create_expense(jsonb_build_object(
  'space_id', (select v from ids where k = 'space'),
  'title', 'Tandoor House', 'total_minor', 90000,
  'paid_by_member', (select v from ids where k = 'm_sunny'), 'paid_via', 'upi',
  'note', 'sunny secret note',
  'shares', jsonb_build_array(
    jsonb_build_object('member_id', (select v from ids where k = 'm_sunny'), 'owed_minor', 30000),
    jsonb_build_object('member_id', (select v from ids where k = 'm_rahul'), 'owed_minor', 30000),
    jsonb_build_object('member_id', (select v from ids where k = 'm_priya'), 'owed_minor', 30000))));
-- Sunny's personal expense.
insert into ids select 'sunny_personal', public.create_expense(
  '{"title": "FitHub Gym", "total_minor": 149900, "note": "sunny personal note"}'::jsonb);
-- Rahul: personal expense + his own private note on the shared dinner.
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
insert into ids select 'rahul_personal', public.create_expense('{"title": "Uber", "total_minor": 21200}'::jsonb);
insert into public.expense_notes (expense_id, note) values ((select v from ids where k = 'dinner'), 'rahul secret note');

-- Rahul pays Sunny back in cash (method hidden from others by default).
insert into ids select 'settle', public.record_settlement(
  (select v from ids where k = 'space'), (select v from ids where k = 'm_rahul'),
  (select v from ids where k = 'm_sunny'), 30000, 'cash', 'confirmed_manual');

-- Non-member (Karthik) ------------------------------------------------------------------
set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
select is((select count(*)::int from public.spaces), 0, 'non-member sees no spaces');
select is((select count(*)::int from public.space_members), 0, 'non-member sees no members');
select is((select count(*)::int from public.expenses), 0, 'non-member sees no expenses');
select is((select count(*)::int from public.expense_shares), 0, 'non-member sees no expense shares');
select is((select count(*)::int from public.balances), 0, 'non-member sees no balances');
select is((select count(*)::int from public.settlements), 0, 'non-member sees no settlements');
select throws_ok(
  format($$select public.create_expense('{"space_id": "%s", "total_minor": 100, "paid_by_member": "%s",
           "shares": [{"member_id": "%s", "owed_minor": 100}]}'::jsonb)$$,
         (select v from ids where k = 'space'), (select v from ids where k = 'm_sunny'),
         (select v from ids where k = 'm_sunny')),
  '42501', 'not_space_member', 'non-member cannot add an expense to the space');
select throws_ok(
  format($$insert into public.space_members (space_id, user_id, display_name) values ('%s', '44444444-4444-4444-4444-444444444444', 'Karthik')$$,
         (select v from ids where k = 'space')),
  '42501', null, 'non-member cannot add themselves to a space');

-- Member (Rahul) ------------------------------------------------------------------------
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select is((select count(*)::int from public.expenses where id = (select v from ids where k = 'dinner')), 1,
          'member sees the shared expense');
select is((select count(*)::int from public.expense_shares where expense_id = (select v from ids where k = 'dinner')), 3,
          'member sees all shares of the shared expense');
select is((select count(*)::int from public.expenses where id = (select v from ids where k = 'sunny_personal')), 0,
          'member cannot see another member''s personal expense');
select throws_like(
  format($$select public.create_expense('{"space_id": "%s", "total_minor": 300, "status": "proposed", "paid_by_member": "%s",
           "shares": [{"member_id": "%s", "owed_minor": 300}]}'::jsonb)$$,
         (select v from ids where k = 'space'), (select v from ids where k = 'm_rahul'),
         (select v from ids where k = 'm_rahul')),
  '%expenses_proposed_personal_only%', 'shared expenses cannot be left in proposed state (drafts live in ai_proposals)');
select is((select count(*)::int from public.expenses where space_id is null), 1,
          'member sees exactly their own personal expense');
select results_eq('select note from public.expense_notes', $$values ('rahul secret note'::text)$$,
          'member sees only their own private note');
select is((select count(*)::int from public.profiles), 1, 'member sees only their own profile');
select is((select method::text from public.settlements_with_method where id = (select v from ids where k = 'settle')),
          'cash', 'payer sees their own payment method');

-- Rahul cannot touch Sunny's personal expense or escalate his role.
update public.expenses set total_minor = 1 where id = (select v from ids where k = 'sunny_personal');
select throws_ok(
  $$update public.space_members set role = 'owner' where user_id = '22222222-2222-2222-2222-222222222222'$$,
  '42501', 'only_space_owner_can_change_role', 'member cannot promote themselves to owner');

select throws_like(
  format($$update public.expenses set owner_id = '11111111-1111-1111-1111-111111111111' where id = '%s'$$,
         (select v from ids where k = 'rahul_personal')),
  'expense_owner_immutable%', 'expense creator cannot be re-pointed');

-- Sunny (receiver) and Priya do not see how Rahul paid ------------------------------------
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select is((select count(*)::int from public.expense_notes where user_id = '22222222-2222-2222-2222-222222222222'), 0,
          'other members'' private notes are invisible');
select is((select method::text from public.settlements_with_method where id = (select v from ids where k = 'settle')),
          null, 'receiver does not see payment method when payer has not opted in');
select is((select count(*)::int from public.settlements where id = (select v from ids where k = 'settle')), 1,
          'receiver still sees the settlement itself');

-- Rahul opts in to sharing payment method -> the space can see it.
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
update public.privacy_settings set share_payment_method = true;
set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select is((select method::text from public.settlements_with_method where id = (select v from ids where k = 'settle')),
          'cash', 'payment method visible to the space once payer opts in');

-- Priya leaves the space -> loses visibility of its expenses.
update public.space_members set left_at = now() where user_id = '33333333-3333-3333-3333-333333333333';
select is((select count(*)::int from public.expenses where space_id = (select v from ids where k = 'space')), 0,
          'a member who left no longer sees the space''s expenses');

-- anon has no table access at all.
reset role;
set local role anon;
select throws_ok('select count(*) from public.expenses', '42501', null, 'anon cannot read expenses');
reset role;

select is((select total_minor from public.expenses where id = (select v from ids where k = 'sunny_personal')), 149900::bigint,
          'another member''s update of a personal expense affected nothing');

select * from finish();
rollback;
