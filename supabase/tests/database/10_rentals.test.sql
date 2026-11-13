-- C3 pgTAP: the rental lifecycle on the local seed.
-- Users: 1111... (test user 1, lender of L1 and L2), 2222... (test user 2, here a renter),
-- 3333... (test user 3, renter), aaaa... (the local admin, here also a renter).
-- L1 = Emerald Velvet Cocktail Dress ($55/day), L2 = Linen Summer Sundress ($14/day); both have
-- availability from today for 90 days. Everything is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(75);

-- Run a statement as someone; "server" clears the claims and runs as postgres.
create function pg_temp.as_user(p_user text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal1')::text, true);
end;
$$;
-- The message (and hint) of a refused statement, as "message | hint".
create function pg_temp.refusal(p_sql text) returns text language plpgsql as $$
declare
  v_message text;
  v_hint text;
begin
  execute p_sql;
  return 'not refused';
exception when others then
  get stacked diagnostics v_message = message_text, v_hint = pg_exception_hint;
  return v_message || ' | ' || coalesce(v_hint, '');
end;
$$;
grant execute on function pg_temp.as_user(text) to authenticated;
grant execute on function pg_temp.refusal(text) to authenticated;
create temp table ids (name text primary key, id uuid);
grant select, insert on ids to authenticated;
create temp table d as select app_private.rental_today() as today;
grant select on d to authenticated, anon;
-- Clean slate for these people on L1 and L2 (a used local database may hold earlier runs).
delete from public.rentals where listing_id in ('2fe0cfa6-a95e-4994-bbe4-f1bfb6760490', 'a79481ab-8f15-426c-b9db-f704b09e94f0');
delete from app_private.rate_counters where action = 'rental_request';
delete from public.blocks where '11111111-1111-4111-8111-111111111111' in (blocker_id, blocked_id);
delete from public.data_exports where user_id = '33333333-3333-4333-8333-333333333333';
update public.conversations set requested_start = null, requested_end = null
where listing_id in ('2fe0cfa6-a95e-4994-bbe4-f1bfb6760490', 'a79481ab-8f15-426c-b9db-f704b09e94f0');

-- 1. Writes only through functions -------------------------------------------------------------
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'rentals' and cmd <> 'SELECT'), 0,
  'rentals: no insert, update or delete policy remains');
select ok(exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rentals' and policyname = 'rentals_participant_read'),
  'rentals: participants still read their rentals');
select ok(exists (select 1 from pg_constraint where conname = 'rentals_no_double_booking' and contype = 'x'), 'the exclusion constraint exists');

set local role authenticated;
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
select throws_ok($$insert into public.rentals (conversation_id, listing_id, renter_id, lender_id, status, start_date, end_date, updated_by)
  select c.id, c.listing_id, c.renter_id, c.lender_id, 'accepted', current_date, current_date, c.renter_id
  from public.conversations c where c.renter_id = '33333333-3333-4333-8333-333333333333' limit 1$$, '42501', null,
  'renter: a direct insert into rentals is refused');

-- 2. Requests: refusals ----------------------------------------------------------------------
select is(pg_temp.refusal($$select public.request_rental('2fe0cfa6-a95e-4994-bbe4-f1bfb6760490', (select today + 200 from d), (select today + 202 from d))$$),
  'DZ-E4008: Those dates aren''t open for this piece. Pick dates inside its available dates. | dates', 'outside the availability window: DZ-E4008');
select is(pg_temp.refusal($$select public.request_rental('2fe0cfa6-a95e-4994-bbe4-f1bfb6760490', (select today - 1 from d), (select today + 2 from d))$$),
  'DZ-E4006: Pick dates from today on. | dates', 'a start in the past: DZ-E4006');
select is(pg_temp.refusal($$select public.request_rental('2fe0cfa6-a95e-4994-bbe4-f1bfb6760490', (select today + 5 from d), (select today + 3 from d))$$),
  'DZ-E4007: The last day can''t be before the first day. | dates', 'end before start: DZ-E4007');
select is(pg_temp.refusal($$select public.request_rental('2fe0cfa6-a95e-4994-bbe4-f1bfb6760490')$$),
  'DZ-E4005: Choose the dates you want to rent. | dates', 'no dates and none in the chat: DZ-E4005');
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select alike(pg_temp.refusal($$select public.request_rental('2fe0cfa6-a95e-4994-bbe4-f1bfb6760490', (select today + 2 from d), (select today + 3 from d))$$),
  'DZ-E4004:%', 'one''s own piece: DZ-E4004');

-- 3. Request -> accepted, with the price snapshot ---------------------------------------------
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
insert into ids select 'r1', public.request_rental('2fe0cfa6-a95e-4994-bbe4-f1bfb6760490', (select today + 10 from d), (select today + 13 from d));
select results_eq($$select status, price_per_day, days, total, currency from public.rentals where id = (select id from ids where name = 'r1')$$,
  $$values ('requested'::text, 55::numeric, 4, 220::numeric, 'USD'::text)$$, 'requested with price 55 x 4 days = 220 USD');
select ok((select expires_at between now() + interval '47 hours' and now() + interval '49 hours' from public.rentals where id = (select id from ids where name = 'r1')),
  'the request expires in 48 hours');
select throws_ok($$update public.rentals set status = 'accepted' where id = (select id from ids where name = 'r1')$$, '42501', null,
  'renter: a direct update of rentals is refused');
select alike(pg_temp.refusal($$select public.request_rental('2fe0cfa6-a95e-4994-bbe4-f1bfb6760490', (select today + 40 from d), (select today + 41 from d))$$),
  'DZ-E4010:%', 'a second open rental in the same chat: DZ-E4010');
select alike(pg_temp.refusal($$select public.respond_rental((select id from ids where name = 'r1'), 'accept')$$),
  'DZ-E4002:%', 'renter can''t accept: DZ-E4002');
select alike(pg_temp.refusal($$select public.mark_picked_up((select id from ids where name = 'r1'))$$),
  'DZ-E4002:%', 'renter can''t mark picked up: DZ-E4002');

select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select alike(pg_temp.refusal($$select public.respond_rental((select id from ids where name = 'r1'), 'accept')$$),
  'DZ-E4001:%', 'a stranger can''t act on it: DZ-E4001');
select is((select count(*)::int from public.rentals where id = (select id from ids where name = 'r1')), 0, 'a stranger can''t read it');
select is(public.get_rental((select id from ids where name = 'r1')), null::jsonb, 'get_rental gives a stranger nothing');

select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select alike(pg_temp.refusal($$select public.cancel_rental((select id from ids where name = 'r1'))$$),
  'DZ-E4018:%', 'the lender declines a request instead of cancelling: DZ-E4018');
select alike(pg_temp.refusal($$select public.respond_rental((select id from ids where name = 'r1'), 'maybe')$$),
  'DZ-E4016:%', 'an answer other than accept or decline: DZ-E4016');
select is(public.respond_rental((select id from ids where name = 'r1'), 'accept'), 'accepted', 'lender accepts (payments off): accepted');
select is((select (public.get_rental((select id from ids where name = 'r1')) -> 'events' -> 1 ->> 'to')), 'accepted', 'the timeline shows the acceptance');
select alike(pg_temp.refusal($$select public.respond_rental((select id from ids where name = 'r1'), 'decline')$$),
  'DZ-E4012:%', 'answering twice: DZ-E4012');
select alike(pg_temp.refusal($$select public.mark_picked_up((select id from ids where name = 'r1'))$$),
  'DZ-E4020:%', 'picked up without 2 pickup photos: DZ-E4020');

-- 4. Double booking ----------------------------------------------------------------------------
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select is(pg_temp.refusal($$select public.request_rental('2fe0cfa6-a95e-4994-bbe4-f1bfb6760490', (select today + 13 from d), (select today + 15 from d))$$),
  'DZ-E4009: Those dates are already booked. Pick other dates. | dates', 'overlapping the accepted rental by one day: DZ-E4009');
insert into ids select 'r2', public.request_rental('2fe0cfa6-a95e-4994-bbe4-f1bfb6760490', (select today + 14 from d), (select today + 16 from d));
select ok((select id from ids where name = 'r2') is not null, 'back-to-back (starts the day after) is allowed');
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select is(public.respond_rental((select id from ids where name = 'r2'), 'accept'), 'accepted', 'the back-to-back rental is accepted');
reset role;
select set_config('request.jwt.claims', '', true);
select throws_ok($$update public.rentals set start_date = (select today + 12 from d) where id = (select id from ids where name = 'r2')$$, '23P01', null,
  'the constraint refuses two accepted rentals with overlapping days');
-- An overlap that appears between request and answer is refused at accept.
set local role authenticated;
select pg_temp.as_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
insert into ids select 'r3', public.request_rental('2fe0cfa6-a95e-4994-bbe4-f1bfb6760490', (select today + 30 from d), (select today + 31 from d));
reset role;
select set_config('request.jwt.claims', '', true);
update public.rentals set end_date = (select today + 30 from d) where id = (select id from ids where name = 'r2');
set local role authenticated;
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select is(pg_temp.refusal($$select public.respond_rental((select id from ids where name = 'r3'), 'accept')$$),
  'DZ-E4009: Those dates are already booked. Pick other dates. | dates', 'accepting over booked days: DZ-E4009');
select pg_temp.as_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select is(public.cancel_rental((select id from ids where name = 'r3'), 'Found another dress'), 'cancelled', 'the renter cancels a request');
select is((select note from public.rental_events where rental_id = (select id from ids where name = 'r3') and to_status = 'cancelled'),
  'Found another dress', 'the reason is in the timeline');
reset role;
select set_config('request.jwt.claims', '', true);
update public.rentals set end_date = (select today + 16 from d) where id = (select id from ids where name = 'r2');

-- 5. Who may act: blocked, suspended, age-blocked, no current terms ------------------------------
insert into public.blocks (blocker_id, blocked_id) values ('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333');
set local role authenticated;
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
select alike(pg_temp.refusal($$select public.request_rental('a79481ab-8f15-426c-b9db-f704b09e94f0', (select today + 3 from d), (select today + 4 from d))$$),
  'DZ-E4003:%', 'blocked pair: request refused (DZ-E4003)');
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select alike(pg_temp.refusal($$select public.mark_picked_up((select id from ids where name = 'r1'))$$),
  'DZ-E4003:%', 'blocked pair: pickup refused (DZ-E4003)');
reset role;
select set_config('request.jwt.claims', '', true);
delete from public.blocks where blocker_id = '11111111-1111-4111-8111-111111111111';

update public.profiles set suspended_until = now() + interval '2 days', suspension_reason = 'pgTAP' where id = '22222222-2222-4222-8222-222222222222';
set local role authenticated;
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select alike(pg_temp.refusal($$select public.cancel_rental((select id from ids where name = 'r2'))$$),
  'DZ-E1040:%', 'suspended: refused (DZ-E1040)');
reset role;
select set_config('request.jwt.claims', '', true);
update public.profiles set suspended_until = null, suspension_reason = null where id = '22222222-2222-4222-8222-222222222222';

insert into public.age_checks (user_id, source, result, platform) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'store_signal', 'minor', 'android');
set local role authenticated;
select pg_temp.as_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select alike(pg_temp.refusal($$select public.request_rental('a79481ab-8f15-426c-b9db-f704b09e94f0', (select today + 3 from d), (select today + 4 from d))$$),
  'DZ-E1030:%', 'age-blocked: refused (DZ-E1030)');
reset role;
select set_config('request.jwt.claims', '', true);
delete from public.age_checks where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and result = 'minor';

create temp table kept_terms as select * from public.legal_acceptances where user_id = '22222222-2222-4222-8222-222222222222';
delete from public.legal_acceptances where user_id = '22222222-2222-4222-8222-222222222222';
set local role authenticated;
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select alike(pg_temp.refusal($$select public.cancel_rental((select id from ids where name = 'r2'))$$),
  'DZ-E1010:%', 'current terms not accepted: refused (DZ-E1010)');
reset role;
select set_config('request.jwt.claims', '', true);
insert into public.legal_acceptances select * from kept_terms;

-- 6. Condition photos (bucket rental-photos) --------------------------------------------------
select is((select public from storage.buckets where id = 'rental-photos'), false, 'the bucket is private');
select is((select file_size_limit from storage.buckets where id = 'rental-photos'), 10485760::bigint, '10 MB limit');
set local role authenticated;
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select throws_ok($$insert into storage.objects (bucket_id, name, owner_id) values ('rental-photos',
  (select id from ids where name = 'r1') || '/pickup/strangerphoto00001.jpg', '22222222-2222-4222-8222-222222222222')$$, '42501', null,
  'a stranger can''t upload to someone else''s rental');
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
select lives_ok($$insert into storage.objects (bucket_id, name, owner_id) values ('rental-photos',
  (select id from ids where name = 'r1') || '/pickup/renterphoto0000001.jpg', '33333333-3333-4333-8333-333333333333')$$,
  'the renter adds a pickup photo while accepted');
select throws_ok($$insert into storage.objects (bucket_id, name, owner_id) values ('rental-photos',
  (select id from ids where name = 'r1') || '/return/renterphoto0000002.jpg', '33333333-3333-4333-8333-333333333333')$$, '42501', null,
  'wrong stage: a return photo before pickup is refused');
select throws_ok($$insert into storage.objects (bucket_id, name, owner_id) values ('rental-photos',
  (select id from ids where name = 'r1') || '/pickup/x.jpg', '33333333-3333-4333-8333-333333333333')$$, '42501', null,
  'a path that isn''t {rental}/{stage}/{random}.jpg is refused');
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select lives_ok($$insert into storage.objects (bucket_id, name, owner_id) values
  ('rental-photos', (select id from ids where name = 'r1') || '/pickup/lenderphoto0000001.jpg', '11111111-1111-4111-8111-111111111111'),
  ('rental-photos', (select id from ids where name = 'r1') || '/pickup/lenderphoto0000002.jpg', '11111111-1111-4111-8111-111111111111')$$,
  'the lender adds two pickup photos');
select is(public.mark_picked_up((select id from ids where name = 'r1'), 'Steamed, no marks'), 'picked_up', 'lender marks picked up');
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select is((select count(*)::int from storage.objects where bucket_id = 'rental-photos' and name like (select id::text from ids where name = 'r1') || '/%'), 0,
  'a stranger can''t read the photos');
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
select is((select count(*)::int from storage.objects where bucket_id = 'rental-photos' and name like (select id::text from ids where name = 'r1') || '/%'), 3,
  'the renter reads all three photos');
select alike(pg_temp.refusal($$select public.cancel_rental((select id from ids where name = 'r1'))$$),
  'DZ-E4014:%', 'no cancelling after pickup: DZ-E4014');
select alike(pg_temp.refusal($$select public.mark_returned((select id from ids where name = 'r1'))$$),
  'DZ-E4002:%', 'renter can''t mark returned: DZ-E4002');
select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'role', 'authenticated', 'aal', 'aal2',
  'amr', json_build_array(json_build_object('method', 'totp', 'timestamp', extract(epoch from now() - interval '1 hour')::bigint)))::text, true);
select is((select count(*)::int from storage.objects where bucket_id = 'rental-photos' and name like (select id::text from ids where name = 'r1') || '/%'), 3,
  'an admin (fresh two-step) reads them');
reset role;
select set_config('request.jwt.claims', '', true);
select ok(public.account_has_rental_in_progress('33333333-3333-4333-8333-333333333333'), 'delete-account check: blocked while picked up');

-- 7. Return -> completed (payments off) ------------------------------------------------------
create temp table studio_before (rental_count integer);
grant select, insert on studio_before to authenticated;
set local role authenticated;
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
insert into studio_before select rental_count from public.get_studio('studiorostova');
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select lives_ok($$insert into storage.objects (bucket_id, name, owner_id) values
  ('rental-photos', (select id from ids where name = 'r1') || '/return/lenderphoto0000003.jpg', '11111111-1111-4111-8111-111111111111'),
  ('rental-photos', (select id from ids where name = 'r1') || '/return/lenderphoto0000004.jpg', '11111111-1111-4111-8111-111111111111')$$,
  'the lender adds two return photos while picked up');
select is(public.mark_returned((select id from ids where name = 'r1')), 'completed', 'returned goes straight to completed while payments are off');
select results_eq($$select from_status, to_status, actor_role from public.rental_events where rental_id = (select id from ids where name = 'r1') order by id$$,
  $$values (null::text, 'requested'::text, 'renter'::text), ('requested', 'accepted', 'lender'), ('accepted', 'picked_up', 'lender'),
           ('picked_up', 'returned', 'lender'), ('returned', 'completed', 'system')$$, 'every transition is in rental_events');
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
select is((select rental_count from public.get_studio('studiorostova')), (select rental_count + 1 from studio_before), 'get_studio counts the completed rental');
select throws_ok($$insert into storage.objects (bucket_id, name, owner_id) values ('rental-photos',
  (select id from ids where name = 'r1') || '/return/renterphoto0000009.jpg', '33333333-3333-4333-8333-333333333333')$$, '42501', null,
  'no photos after the rental is completed');
reset role;
select set_config('request.jwt.claims', '', true);
select ok(not public.account_has_rental_in_progress('33333333-3333-4333-8333-333333333333'), 'delete-account check: free once completed');
select ok(public.account_has_rental_in_progress('22222222-2222-4222-8222-222222222222'), 'delete-account check: blocked while accepted');

-- 8. Decline and expiry -----------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
insert into ids select 'r4', public.request_rental('a79481ab-8f15-426c-b9db-f704b09e94f0', (select today + 3 from d), (select today + 4 from d));
reset role;
select set_config('request.jwt.claims', '', true);
select ok(not public.account_has_rental_in_progress('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'delete-account check: a request alone doesn''t block');
set local role authenticated;
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select is(public.respond_rental((select id from ids where name = 'r4'), 'decline', 'Away that week'), 'declined', 'lender declines');
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
insert into ids select 'r5', public.request_rental('a79481ab-8f15-426c-b9db-f704b09e94f0', (select today + 5 from d), (select today + 6 from d));
reset role;
select set_config('request.jwt.claims', '', true);
update public.rentals set expires_at = now() - interval '1 minute' where id = (select id from ids where name = 'r5');
select ok(app_private.expire_rental_requests() >= 1, 'the expiry job runs');
select is((select status from public.rentals where id = (select id from ids where name = 'r5')), 'expired', 'an unanswered request expires');
select is((select actor_role from public.rental_events where rental_id = (select id from ids where name = 'r5') and to_status = 'expired'), 'system', 'expired by the system');
select is((select count(*)::int from cron.job where jobname in ('dzirent-rental-expiry', 'dzirent-rental-reminders')), 2, 'expiry and reminder cron jobs are scheduled');

-- 9. Reminders: once per rental, person and day; nothing for blocked pairs ----------------------
update public.rentals set start_date = (select today + 1 from d) where id = (select id from ids where name = 'r2');
insert into public.device_tokens (token, user_id, platform) values
  ('pgtap-token-lender', '11111111-1111-4111-8111-111111111111', 'android'),
  ('pgtap-token-renter', '22222222-2222-4222-8222-222222222222', 'android')
on conflict (token) do nothing;
select app_private.queue_rental_reminders();
select app_private.queue_rental_reminders();
select is((select count(*)::int from app_private.async_jobs j where j.kind = 'send_push' and j.payload ->> 'kind' = 'pickup_tomorrow'
  and j.payload ->> 'conversation_id' = (select conversation_id::text from public.rentals where id = (select id from ids where name = 'r2'))), 2,
  'pickup reminder queued once for each person, though the job ran twice');
select is((select count(*)::int from app_private.rental_reminders where rental_id = (select id from ids where name = 'r2')), 2, 'two reminder rows today');
insert into public.blocks (blocker_id, blocked_id) values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111');
delete from app_private.rental_reminders where rental_id = (select id from ids where name = 'r2');
select app_private.queue_rental_reminders();
select is((select count(*)::int from app_private.async_jobs j where j.kind = 'send_push' and j.payload ->> 'kind' = 'pickup_tomorrow'
  and j.payload ->> 'conversation_id' = (select conversation_id::text from public.rentals where id = (select id from ids where name = 'r2'))), 2,
  'nothing more is queued for a blocked pair');
select ok((select rental_reminders from public.notification_settings where user_id = '22222222-2222-4222-8222-222222222222') is not false,
  'rental reminders are on by default');

-- 10. Shop window: booked days are unavailable, without who booked them ------------------------
delete from public.blocks where blocker_id = '22222222-2222-4222-8222-222222222222';
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select booked from public.get_listing('2fe0cfa6-a95e-4994-bbe4-f1bfb6760490')),
  (select jsonb_build_array(jsonb_build_object('start_date', today + 1, 'end_date', today + 16)) from d),
  'get_listing shows the booked days only, no names or ids');
select ok(not exists (select 1 from public.browse_listings(p_start_date => (select today + 2 from d), p_end_date => (select today + 3 from d), p_limit => 30)
  where id = '2fe0cfa6-a95e-4994-bbe4-f1bfb6760490'), 'browse with booked dates leaves the piece out');
select ok(exists (select 1 from public.browse_listings(p_start_date => (select today + 20 from d), p_end_date => (select today + 21 from d), p_limit => 30)
  where id = '2fe0cfa6-a95e-4994-bbe4-f1bfb6760490'), 'browse with free dates shows it');
reset role;

-- 11. Reports and data download ---------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select alike(pg_temp.refusal($$insert into public.reports (reporter_id, target_type, target_id, reason)
  values ('22222222-2222-4222-8222-222222222222', 'rental', (select id from ids where name = 'r1'), 'Not mine')$$),
  'DZ-E5015:%', 'only the rental''s people can report it: DZ-E5015');
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
insert into public.reports (reporter_id, target_type, target_id, reason)
values ('33333333-3333-4333-8333-333333333333', 'rental', (select id from ids where name = 'r1'), 'Stain was there before pickup');
reset role;
select set_config('request.jwt.claims', '', true);
select results_eq($$select e.snapshot ->> 'type', jsonb_array_length(e.snapshot -> 'events'), jsonb_array_length(e.snapshot -> 'photos'), r.target_user_id
  from public.reports r join app_private.report_evidence e on e.report_id = r.id
  where r.target_type = 'rental' and r.target_id = (select id from ids where name = 'r1')$$,
  $$values ('rental'::text, 5, 5, '11111111-1111-4111-8111-111111111111'::uuid)$$,
  'a rental report freezes the timeline and the condition photo paths, about the other person');
set local role authenticated;
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
create temp table export_c3 as select public.export_my_data() as data;
select is((select count(*)::int from export_c3, jsonb_array_elements(data -> 'condition_photos') x
  where x ->> 'rental_id' = (select id::text from ids where name = 'r1')), 1, 'download my data: only the caller''s own condition photo');
select ok((select bool_or(jsonb_array_length(x -> 'events') = 5) from export_c3, jsonb_array_elements(data -> 'rentals') x),
  'download my data: the rental with its five events');
reset role;

-- 12. Rate limit: 20 requests a day ------------------------------------------------------------
select set_config('request.jwt.claims', '', true);
insert into app_private.rate_counters (user_id, action, window_started_at, hits)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'rental_request', now(), 20)
on conflict (user_id, action) do update set window_started_at = now(), hits = 20;
set local role authenticated;
select pg_temp.as_user('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select alike(pg_temp.refusal($$select public.request_rental('a79481ab-8f15-426c-b9db-f704b09e94f0', (select today + 30 from d), (select today + 31 from d))$$),
  'DZ-E9001:%', 'the 21st request in a day: DZ-E9001');
reset role;

select * from finish();
rollback;
