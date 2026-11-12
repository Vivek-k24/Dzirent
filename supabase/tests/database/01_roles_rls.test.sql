-- C2 pgTAP: row-level security and access per role on the local seed (supabase/seed.sql).
-- Guest, signed-in renter, owner, other user, and the admin without two-step, with a stale code and
-- with a fresh one. Everything runs in one transaction that is rolled back.
-- Users: 1111... (test user 1, lender, 6 listings), 2222... (test user 2, lender, 6 listings),
-- 3333... (test user 3), aaaa... (the local admin).
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- Guest (anon): no raw table, only the shop window.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok('select count(*) from public.listings', '42501', null, 'guest: no access to raw listings');
select throws_ok('select count(*) from public.profiles', '42501', null, 'guest: no access to profiles');
select throws_ok('select count(*) from public.messages', '42501', null, 'guest: no access to messages');
select ok((select count(*) from public.browse_listings()) > 0, 'guest: the shop window lists pieces');
reset role;

-- Signed-in renter (test user 3): own rows only.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal1"}', true);
select is((select count(*) from public.listings)::int, 0, 'renter: sees no one else''s raw listings');
select is((select count(*) from public.profiles)::int, 1, 'renter: reads only their own profile');
select is((select count(*) from public.private_profiles)::int, 1, 'renter: reads only their own private profile');
select ok(public.start_conversation('2fe0cfa6-a95e-4994-bbe4-f1bfb6760490') is not null, 'renter: starts a chat on a live listing');
reset role;

-- Owner (test user 1): their own listings, and nothing of test user 2's.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}', true);
select is((select count(*) from public.listings)::int, 6, 'owner: reads their 6 listings');
select lives_ok($$update public.listings set description = 'Edited by its owner' where id = '2fe0cfa6-a95e-4994-bbe4-f1bfb6760490'$$, 'owner: edits their own listing');
update public.listings set description = 'Edited by someone else' where id = 'a7417052-55ff-4cb8-b49d-054a69a6e719';
select throws_ok($$insert into public.listings (lender_id, title, category, approx_lat, approx_lng, price_usd)
  values ('22222222-2222-4222-8222-222222222222', 'Not mine', 'Everyday', 30.2, -97.7, 10)$$, '42501', null,
  'owner: can''t create a listing for another lender');
select is((select count(*) from public.conversations where listing_id = '2fe0cfa6-a95e-4994-bbe4-f1bfb6760490'
  and renter_id = '33333333-3333-4333-8333-333333333333')::int, 1, 'owner: sees the chat on their listing');
reset role;
select is((select description from public.listings where id = '2fe0cfa6-a95e-4994-bbe4-f1bfb6760490'), 'Edited by its owner', 'the owner''s edit was saved');
select isnt((select description from public.listings where id = 'a7417052-55ff-4cb8-b49d-054a69a6e719'), 'Edited by someone else', 'another lender''s listing was not changed');

-- Other user (test user 2): not in the chat between 1 and 3.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal1"}', true);
select is((select count(*) from public.conversations where lender_id = '11111111-1111-4111-8111-111111111111')::int, 0, 'other user: can''t see a chat they''re not in');
select is((select count(*) from public.listings where lender_id = '11111111-1111-4111-8111-111111111111')::int, 0, 'other user: can''t see test user 1''s raw listings');
reset role;

-- Admin functions: a non-admin, the admin without two-step, with a stale code, with a fresh one.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal2"}', true);
select throws_like('select public.admin_queues()', 'DZ-E5001:%', 'non-admin: refused with DZ-E5001');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated","aal":"aal1"}', true);
select throws_like('select public.admin_queues()', 'DZ-E5002:%', 'admin without two-step: refused with DZ-E5002');
select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'role', 'authenticated', 'aal', 'aal2',
  'amr', json_build_array(json_build_object('method', 'totp', 'timestamp', extract(epoch from now() - interval '25 hours')::bigint)))::text, true);
select throws_like('select public.admin_queues()', 'DZ-E5003:%', 'admin with a code older than 24 hours: refused with DZ-E5003');
select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'role', 'authenticated', 'aal', 'aal2',
  'amr', json_build_array(json_build_object('method', 'totp', 'timestamp', extract(epoch from now() - interval '1 hour')::bigint)))::text, true);
select ok(public.is_admin(), 'admin with a fresh code: is_admin() is true');
select lives_ok('select public.admin_queues()', 'admin with a fresh code: admin functions work');
reset role;
select ok(exists (select 1 from app_private.admin_actions a where a.admin_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'the admin''s call is in the admin log');

select * from finish();
rollback;
