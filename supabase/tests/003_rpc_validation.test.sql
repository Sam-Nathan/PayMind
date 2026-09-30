-- RPC validation: create_expense / update_expense money invariants, settlement state
-- machine, captured-txn confirmation.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

insert into auth.users (id, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', '{"name": "Sunny"}'),
  ('22222222-2222-2222-2222-222222222222', '{"name": "Rahul"}'),
  ('33333333-3333-3333-3333-333333333333', '{"name": "Priya"}');

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into ids select 'space', public.create_space(
  'Flat 402', 'roommates', null, null, null,
  '[{"display_name": "Rahul"},
    {"display_name": "Priya"},
    {"display_name": "Neel", "upi_vpa": "neel@okaxis"}]'::jsonb);
-- Link placeholders to real users (clients may not do this; the invite flow does, see 005).
reset role;
update public.space_members set user_id = '22222222-2222-2222-2222-222222222222' where display_name = 'Rahul' and space_id = (select v from ids where k = 'space');
update public.space_members set user_id = '33333333-3333-3333-3333-333333333333' where display_name = 'Priya' and space_id = (select v from ids where k = 'space');
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into ids select 'other_space', public.create_space('Solo', 'custom');
insert into ids select 'm_sunny', id from public.space_members
  where user_id = '11111111-1111-1111-1111-111111111111' and space_id = (select v from ids where k = 'space');
insert into ids select 'm_rahul', id from public.space_members where user_id = '22222222-2222-2222-2222-222222222222';
insert into ids select 'm_priya', id from public.space_members where user_id = '33333333-3333-3333-3333-333333333333';
insert into ids select 'm_neel', id from public.space_members where display_name = 'Neel';
insert into ids select 'm_other', id from public.space_members where space_id = (select v from ids where k = 'other_space');

select is((select count(*)::int from public.space_members where space_id = (select v from ids where k = 'space')), 4,
          'create_space adds owner + 3 members (incl. one not on the app)');
select is((select user_id from public.space_members where id = (select v from ids where k = 'm_neel')), null::uuid,
          'non-app member has no user_id');

-- create_expense validation ---------------------------------------------------------------
create temp table payloads (k text primary key, p jsonb);
grant all on payloads to authenticated;
insert into payloads values ('base', jsonb_build_object(
  'space_id', (select v from ids where k = 'space'), 'title', 'Electricity', 'total_minor', 372000,
  'paid_by_member', (select v from ids where k = 'm_sunny')));

select throws_like(
  $$select public.create_expense((select p from payloads where k = 'base') || jsonb_build_object('shares', jsonb_build_array(
      jsonb_build_object('member_id', (select v from ids where k = 'm_sunny'), 'owed_minor', 124000),
      jsonb_build_object('member_id', (select v from ids where k = 'm_rahul'), 'owed_minor', 124000),
      jsonb_build_object('member_id', (select v from ids where k = 'm_priya'), 'owed_minor', 123999))))$$,
  'shares_sum_mismatch%', 'create_expense rejects shares that do not sum to total (1 paisa short)');

select throws_like(
  $$select public.create_expense((select p from payloads where k = 'base'))$$,
  'shares_required%', 'shared expense without shares is rejected');

select throws_like(
  $$select public.create_expense((select p from payloads where k = 'base') || jsonb_build_object('shares', jsonb_build_array(
      jsonb_build_object('member_id', (select v from ids where k = 'm_sunny'), 'owed_minor', 272000),
      jsonb_build_object('member_id', (select v from ids where k = 'm_other'), 'owed_minor', 100000))))$$,
  'share_member_not_in_space%', 'shares for a member of another space are rejected');

select throws_like(
  $$select public.create_expense((select p from payloads where k = 'base') || jsonb_build_object('shares', jsonb_build_array(
      jsonb_build_object('member_id', (select v from ids where k = 'm_sunny'), 'owed_minor', 372000),
      jsonb_build_object('member_id', (select v from ids where k = 'm_sunny'), 'owed_minor', 0))))$$,
  'duplicate_share_member%', 'duplicate members in shares are rejected');

select throws_like(
  $$select public.create_expense((select p from payloads where k = 'base') || jsonb_build_object('shares', jsonb_build_array(
      jsonb_build_object('member_id', (select v from ids where k = 'm_sunny'), 'owed_minor', 472000),
      jsonb_build_object('member_id', (select v from ids where k = 'm_rahul'), 'owed_minor', -100000))))$$,
  'invalid_share%', 'negative shares are rejected');

select throws_like(
  $$select public.create_expense((select p from payloads where k = 'base') || jsonb_build_object(
      'paid_by_member', (select v from ids where k = 'm_other'),
      'shares', jsonb_build_array(jsonb_build_object('member_id', (select v from ids where k = 'm_sunny'), 'owed_minor', 372000))))$$,
  'payer_not_in_space%', 'payer from another space is rejected');

select throws_like(
  $$select public.create_expense((select p from payloads where k = 'base') || jsonb_build_object(
      'items', jsonb_build_array(jsonb_build_object('name', 'Units', 'amount_minor', 300000)),
      'shares', jsonb_build_array(jsonb_build_object('member_id', (select v from ids where k = 'm_sunny'), 'owed_minor', 372000))))$$,
  'items_sum_mismatch%', 'items that do not add up to total are rejected');

select throws_like(
  $$select public.create_expense((select p from payloads where k = 'base') || jsonb_build_object(
      'items', jsonb_build_array(jsonb_build_object('name', 'Units', 'amount_minor', 372000, 'shares', jsonb_build_array(
          jsonb_build_object('member_id', (select v from ids where k = 'm_sunny'), 'amount_minor', 200000),
          jsonb_build_object('member_id', (select v from ids where k = 'm_rahul'), 'amount_minor', 100000)))),
      'shares', jsonb_build_array(jsonb_build_object('member_id', (select v from ids where k = 'm_sunny'), 'owed_minor', 372000))))$$,
  'item_shares_sum_mismatch%', 'item shares that do not add up to the item are rejected');

select throws_like(
  $$select public.create_expense((select p from payloads where k = 'base') || jsonb_build_object(
      'items', jsonb_build_array(jsonb_build_object('name', 'Units', 'amount_minor', 372000, 'shares', jsonb_build_array(
          jsonb_build_object('member_id', (select v from ids where k = 'm_rahul'), 'amount_minor', 372000)))),
      'shares', jsonb_build_array(jsonb_build_object('member_id', (select v from ids where k = 'm_sunny'), 'owed_minor', 372000))))$$,
  'item_shares_member_mismatch%', 'item shares must agree with expense shares per member');

select throws_like(
  $$select public.create_expense(jsonb_build_object('title', 'Gym', 'total_minor', 100,
      'shares', jsonb_build_array(jsonb_build_object('member_id', (select v from ids where k = 'm_sunny'), 'owed_minor', 100))))$$,
  'shares_not_allowed_on_personal_expense%', 'personal expense cannot carry shares');

select throws_like(
  $$select public.create_expense('{"title": "Zero", "total_minor": 0}'::jsonb)$$,
  'invalid_total%', 'zero total is rejected');

-- Valid: electricity ₹3,720 split 1,040 / 1,480 / 1,200 (Neel owes nothing here).
insert into ids select 'elec', public.create_expense((select p from payloads where k = 'base') || jsonb_build_object(
  'shares', jsonb_build_array(
    jsonb_build_object('member_id', (select v from ids where k = 'm_sunny'), 'owed_minor', 104000),
    jsonb_build_object('member_id', (select v from ids where k = 'm_rahul'), 'owed_minor', 148000),
    jsonb_build_object('member_id', (select v from ids where k = 'm_priya'), 'owed_minor', 120000))));
select is((select sum(owed_minor)::bigint from public.expense_shares where expense_id = (select v from ids where k = 'elec')),
          372000::bigint, 'valid expense stored with shares summing to total');

-- update_expense: change the split, keep the title.
select lives_ok(
  $$select public.update_expense((select v from ids where k = 'elec'), jsonb_build_object('total_minor', 360000,
      'shares', jsonb_build_array(
        jsonb_build_object('member_id', (select v from ids where k = 'm_sunny'), 'owed_minor', 120000),
        jsonb_build_object('member_id', (select v from ids where k = 'm_rahul'), 'owed_minor', 120000),
        jsonb_build_object('member_id', (select v from ids where k = 'm_priya'), 'owed_minor', 120000))))$$,
  'update_expense replaces shares');
select is((select title from public.expenses where id = (select v from ids where k = 'elec')), 'Electricity',
          'update_expense keeps absent scalar fields');
select throws_like(
  $$select public.update_expense((select v from ids where k = 'elec'), jsonb_build_object('total_minor', 360001,
      'shares', jsonb_build_array(jsonb_build_object('member_id', (select v from ids where k = 'm_sunny'), 'owed_minor', 360000))))$$,
  'shares_sum_mismatch%', 'update_expense rejects unbalanced shares');

-- Priya (plain member, neither creator nor payer) cannot edit it.
set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select throws_ok(
  $$select public.update_expense((select v from ids where k = 'elec'), '{"title": "hacked"}'::jsonb)$$,
  '42501', 'expense_not_found_or_forbidden', 'plain member cannot edit someone else''s expense');

-- Deferred invariant: writing an unbalanced share directly fails at commit.
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update public.expense_shares set owed_minor = owed_minor + 1
  where expense_id = (select v from ids where k = 'elec') and member_id = (select v from ids where k = 'm_sunny');
select throws_like('set constraints all immediate', 'shares_sum_mismatch%',
                   'direct share edits that break the total are rejected at commit');
update public.expense_shares set owed_minor = owed_minor - 1
  where expense_id = (select v from ids where k = 'elec') and member_id = (select v from ids where k = 'm_sunny');
set constraints all deferred;

-- Settlement state machine ------------------------------------------------------------------
insert into ids select 's1', public.record_settlement(
  (select v from ids where k = 'space'), (select v from ids where k = 'm_sunny'),
  (select v from ids where k = 'm_rahul'), 124000);

select throws_like(
  $$select public.update_settlement_status((select v from ids where k = 's1'), 'corrected', null, 100000)$$,
  'illegal_settlement_transition: initiated -> corrected%', 'initiated -> corrected is illegal');
select throws_like(
  $$select public.record_settlement((select v from ids where k = 'space'), (select v from ids where k = 'm_sunny'),
      (select v from ids where k = 'm_rahul'), 1000, 'upi', 'completed')$$,
  'illegal_initial_settlement_status%', 'a settlement cannot be created as completed');

select 1 from public.update_settlement_status((select v from ids where k = 's1'), 'completed');
select throws_like(
  $$select public.update_settlement_status((select v from ids where k = 's1'), 'pending')$$,
  'illegal_settlement_transition: completed -> pending%', 'completed -> pending is illegal');
select throws_like(
  $$update public.settlements set amount_minor = 1 where id = (select v from ids where k = 's1')$$,
  'settlement_amount_locked%', 'amount of a completed settlement cannot change without a correction');
select throws_like(
  $$select public.update_settlement_status((select v from ids where k = 's1'), 'corrected')$$,
  'correction_requires_new_amount%', 'correction needs a new amount');

select 1 from public.update_settlement_status((select v from ids where k = 's1'), 'cancelled');
select throws_like(
  $$select public.update_settlement_status((select v from ids where k = 's1'), 'completed')$$,
  'illegal_settlement_transition: cancelled -> completed%', 'cancelled is terminal');

-- Captured txn -> personal expense --------------------------------------------------------------
insert into public.captured_txns (source, amount_minor, payee, vpa, occurred_at, dedupe_hash)
values ('upi_notification', 24000, 'Brew Street Café', 'BREWSTREET@ybl', now(), 'h1');
insert into ids select 'cap', id from public.captured_txns where dedupe_hash = 'h1';
insert into ids select 'cap_exp', public.confirm_captured_txn(
  (select v from ids where k = 'cap'), (select id from public.categories where slug = 'food.cafe'));
select results_eq(
  format($$select e.space_id, e.total_minor, e.source::text, e.paid_via::text, c.status::text
           from public.expenses e join public.captured_txns c on c.expense_id = e.id where e.id = '%s'$$,
         (select v from ids where k = 'cap_exp')),
  $$values (null::uuid, 24000::bigint, 'upi_alert'::text, 'upi'::text, 'confirmed'::text)$$,
  'confirm_captured_txn creates a personal expense and marks the inbox item confirmed');
select throws_like(
  $$select public.confirm_captured_txn((select v from ids where k = 'cap'))$$,
  'captured_txn_not_in_inbox%', 'an inbox item cannot be confirmed twice');

reset role;
select * from finish();
rollback;
