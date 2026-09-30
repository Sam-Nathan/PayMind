-- balances view: 3-person dinner (numbers from design page 6) + settlements lifecycle.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', '{"name": "Sunny"}'),
  ('22222222-2222-2222-2222-222222222222', '{"name": "Rahul"}'),
  ('33333333-3333-3333-3333-333333333333', '{"name": "Priya"}');

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into ids select 'space', public.create_space(
  'Friends', 'friends', null, null, null,
  '[{"display_name": "Rahul", "user_id": "22222222-2222-2222-2222-222222222222"},
    {"display_name": "Priya", "user_id": "33333333-3333-3333-3333-333333333333"}]'::jsonb);
insert into ids select 'm_sunny', id from public.space_members where user_id = '11111111-1111-1111-1111-111111111111';
insert into ids select 'm_rahul', id from public.space_members where user_id = '22222222-2222-2222-2222-222222222222';
insert into ids select 'm_priya', id from public.space_members where user_id = '33333333-3333-3333-3333-333333333333';

-- Tandoor House ₹1,992.00 paid by Sunny: You 699.51, Rahul 720.81, Priya 571.68.
insert into ids select 'dinner', public.create_expense(jsonb_build_object(
  'space_id', (select v from ids where k = 'space'),
  'title', 'Tandoor House', 'total_minor', 199200, 'source', 'scan',
  'paid_by_member', (select v from ids where k = 'm_sunny'), 'paid_via', 'upi',
  'items', jsonb_build_array(
    jsonb_build_object('name', 'Food', 'amount_minor', 180000, 'kind', 'item', 'shares', jsonb_build_array(
      jsonb_build_object('member_id', (select v from ids where k = 'm_sunny'), 'amount_minor', 63000),
      jsonb_build_object('member_id', (select v from ids where k = 'm_rahul'), 'amount_minor', 65500),
      jsonb_build_object('member_id', (select v from ids where k = 'm_priya'), 'amount_minor', 51500))),
    jsonb_build_object('name', 'Tip', 'amount_minor', 19200, 'kind', 'tip', 'shares', jsonb_build_array(
      jsonb_build_object('member_id', (select v from ids where k = 'm_sunny'), 'amount_minor', 6951),
      jsonb_build_object('member_id', (select v from ids where k = 'm_rahul'), 'amount_minor', 6581),
      jsonb_build_object('member_id', (select v from ids where k = 'm_priya'), 'amount_minor', 5668)))),
  'shares', jsonb_build_array(
    jsonb_build_object('member_id', (select v from ids where k = 'm_sunny'), 'owed_minor', 69951),
    jsonb_build_object('member_id', (select v from ids where k = 'm_rahul'), 'owed_minor', 72081),
    jsonb_build_object('member_id', (select v from ids where k = 'm_priya'), 'owed_minor', 57168))));

-- A personal expense must never move space balances.
select public.create_expense('{"title": "Coffee", "total_minor": 24000}'::jsonb) is not null;

-- Viewed by Rahul (a member, not the payer).
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select results_eq(
  format($$select display_name, paid_minor, owed_minor, net_minor from public.balances
           where space_id = '%s' order by net_minor desc$$, (select v from ids where k = 'space')),
  $$values ('Sunny'::text, 199200::bigint, 69951::bigint, 129249::bigint),
           ('Priya'::text, 0::bigint, 57168::bigint, -57168::bigint),
           ('Rahul'::text, 0::bigint, 72081::bigint, -72081::bigint)$$,
  'balances after a 3-person dinner: paid − owed per member');
select is((select sum(net_minor)::bigint from public.balances where space_id = (select v from ids where k = 'space')),
          0::bigint, 'net balances in a space sum to zero');
select is((select count(*)::int from public.item_shares where expense_id = (select v from ids where k = 'dinner')),
          6, 'item shares stored');

-- Rahul starts a UPI payment: initiated does not count yet.
insert into ids select 'rahul_pay', public.record_settlement(
  (select v from ids where k = 'space'), (select v from ids where k = 'm_rahul'),
  (select v from ids where k = 'm_sunny'), 72081, 'upi', 'initiated', 'phonepe', 'PM-TH-OCT');
select is((select net_minor from public.balances where member_id = (select v from ids where k = 'm_rahul')),
          -72081::bigint, 'initiated settlement does not change balances');

select is((select status::text from public.update_settlement_status((select v from ids where k = 'rahul_pay'), 'pending')),
          'pending', 'initiated -> pending');
select is((select net_minor from public.balances where member_id = (select v from ids where k = 'm_rahul')),
          -72081::bigint, 'pending settlement does not change balances');

select is((select status::text from public.update_settlement_status((select v from ids where k = 'rahul_pay'), 'completed', 'UTR123456')),
          'completed', 'pending -> completed with UTR');
select is((select net_minor from public.balances where member_id = (select v from ids where k = 'm_rahul')),
          0::bigint, 'completed settlement clears the payer''s debt');
select is((select net_minor from public.balances where member_id = (select v from ids where k = 'm_sunny')),
          57168::bigint, 'completed settlement reduces what the receiver is owed');

-- Priya pays ₹500 in cash (recorded by Sunny, the receiver), later corrected to ₹571.68.
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into ids select 'priya_pay', public.record_settlement(
  (select v from ids where k = 'space'), (select v from ids where k = 'm_priya'),
  (select v from ids where k = 'm_sunny'), 50000, 'cash', 'confirmed_manual');
select is((select net_minor from public.balances where member_id = (select v from ids where k = 'm_priya')),
          -7168::bigint, 'confirmed_manual settlement counts');

select is((select corrected_from_minor from public.update_settlement_status(
            (select v from ids where k = 'priya_pay'), 'corrected', null, 57168)),
          50000::bigint, 'correction keeps the previous amount');
select results_eq(
  format($$select net_minor from public.balances where space_id = '%s' order by display_name$$,
         (select v from ids where k = 'space')),
  $$values (0::bigint), (0::bigint), (0::bigint)$$,
  'corrected settlement counts at its new amount: everyone square');

-- Cancelling the (duplicate) cash entry reopens Priya's debt.
select 1 from public.update_settlement_status((select v from ids where k = 'priya_pay'), 'cancelled');
select is((select net_minor from public.balances where member_id = (select v from ids where k = 'm_priya')),
          -57168::bigint, 'cancelled settlement no longer counts');

-- Voiding the dinner removes it from balances.
update public.expenses set status = 'void' where id = (select v from ids where k = 'dinner');
select is((select net_minor from public.balances where member_id = (select v from ids where k = 'm_rahul')),
          72081::bigint, 'void expense no longer counts (Rahul''s completed payment now shows as credit)');

reset role;
select * from finish();
rollback;
