-- C4 pgTAP: the rental follow-ups, the payment state rules (payments_enabled on, in this
-- transaction), claims, the admin tools and settings, and who reads the new tables.
-- Users: 1111... (lender of every listing here), 2222... (a stranger), 3333... (the renter),
-- aaaa... (the local admin). Stripe is never called: the server steps are the database functions
-- the Edge Functions call. Everything is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(113);

create function pg_temp.as_user(p_user text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal1')::text, true);
end;
$$;
-- The local admin at aal2, with the last two-step code 1 hour old (fresh) or 25 hours old (stale).
create function pg_temp.as_admin(p_fresh boolean) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'role', 'authenticated',
    'aal', 'aal2', 'amr', json_build_array(json_build_object('method', 'totp',
      'timestamp', extract(epoch from now() - case when p_fresh then interval '1 hour' else interval '25 hours' end)::bigint)))::text, true);
end;
$$;
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
grant execute on function pg_temp.as_admin(boolean) to authenticated;
grant execute on function pg_temp.refusal(text) to authenticated;
create temp table ids (name text primary key, id uuid);
grant select, insert on ids to authenticated;
create temp table d as select app_private.rental_today() as today;
grant select on d to authenticated, anon;

-- Listings (all test user 1's): GOWN payments, BLAZER no windows, COAT cancellations, TROUSERS
-- the automatic cancel and admin_end_rental.
create temp table l (name text primary key, id uuid);
insert into l values ('gown', 'c05269c8-dc62-4fe6-a1c2-68b0f2448d1c'), ('blazer', '3cd2a771-2f4e-4ee5-b0c5-18295ef5999f'),
  ('coat', '0415cc17-423a-4232-b481-df74cec8e4ae'), ('trousers', '3f8b0763-cb28-46b3-a210-a18499de5b65');
grant select on l to authenticated, anon;
delete from public.rentals where listing_id in (select id from l);
delete from app_private.rate_counters where action = 'rental_request';
delete from public.blocks where '11111111-1111-4111-8111-111111111111' in (blocker_id, blocked_id);
delete from public.payout_accounts where user_id in ('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333');
delete from public.stripe_customers where user_id in ('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333');
update public.app_settings set enabled = false where key = 'payments_enabled';
insert into public.device_tokens (token, user_id, platform) values
  ('c4-pgtap-lender', '11111111-1111-4111-8111-111111111111', 'android'),
  ('c4-pgtap-renter', '33333333-3333-4333-8333-333333333333', 'android')
on conflict (token) do update set user_id = excluded.user_id;
-- Condition photos as Storage rows (the counts the rental functions read).
create function pg_temp.photos(p_rental uuid, p_stage text, p_owner text, p_n int) returns void language sql as $$
  insert into storage.objects (bucket_id, name, owner_id)
  select 'rental-photos', p_rental::text || '/' || p_stage || '/c4pgtap' || p_stage || g || 'aaaaaaaaaaaa.jpg', p_owner
  from generate_series(1, p_n) g;
$$;

-- 1. Settings: every business number in the closed table, typed, ranged, changed by admins --------
select is((select count(*)::int from app_private.settings where label is null or area is null or value_type is null or decided_by is null), 0,
  'every setting has a label, an area, a type and who decides');
select ok((select bool_and(key in (select key from app_private.settings)) from unnest(array['platform_fee_percent', 'claim_window_hours',
  'cancellation_refund_cutoff_hours', 'late_cancellation_refund_percent', 'sales_tax_enabled', 'rental_autocancel_days',
  'rental_request_hours', 'rental_reminder_hour', 'rental_timezone', 'data_export_interval_hours']) key),
  'the payment, rental and reminder settings exist');
select results_eq($$select value from app_private.settings where key in ('platform_fee_percent', 'claim_window_hours', 'cancellation_refund_cutoff_hours', 'sales_tax_enabled', 'rental_autocancel_days', 'rental_reminder_hour', 'rental_timezone') order by key$$,
  $$values ('48'::jsonb), ('48'::jsonb), ('0'::jsonb), ('2'::jsonb), ('9'::jsonb), ('"America/Chicago"'::jsonb), ('false'::jsonb)$$,
  'defaults: cutoff 48 h, claim window 48 h, fee 0, auto-cancel 2 days, reminders 9 in Austin time, sales tax off');
select ok((select bool_and(affects_terms) from app_private.settings where key in ('platform_fee_percent', 'claim_window_hours', 'cancellation_refund_cutoff_hours')),
  'fee, claim window and refund cutoff are marked as affecting the terms');
select is(pg_temp.refusal($$update app_private.settings set value = '0'::jsonb where key = 'claim_window_hours'$$),
  'DZ-E5070: Enter a value from 1 to 336 (hours). | value', 'even a direct write outside the range is refused');
create temp table setting_count as select count(*)::int as n from app_private.settings;
grant select on setting_count to authenticated;

set local role authenticated;
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
select alike(pg_temp.refusal($$select public.admin_list_settings()$$), 'DZ-E5001:%', 'a non-admin can''t list settings');
select alike(pg_temp.refusal($$select public.admin_set_setting('rental_request_hours', '24', 'test')$$), 'DZ-E5001:%', 'a non-admin can''t change a setting');
select throws_ok($$select * from app_private.settings$$, '42501', null, 'the settings table is closed to people');
select pg_temp.as_admin(false);
select alike(pg_temp.refusal($$select public.admin_set_setting('rental_request_hours', '24', 'test')$$), 'DZ-E5003:%', 'a stale two-step session can''t change a setting');
select pg_temp.as_admin(true);
select is(jsonb_array_length(public.admin_list_settings()), (select n from setting_count), 'the admin lists every setting');
select is(pg_temp.refusal($$select public.admin_set_setting('claim_window_hours', '400', 'longer window')$$),
  'DZ-E5070: Enter a value from 1 to 336 (hours). | value', 'an admin''s change outside the range is refused');
select alike(pg_temp.refusal($$select public.admin_set_setting('rental_timezone', '"Mars/Olympus"', 'moving')$$), 'DZ-E5072:%', 'a time zone that doesn''t exist is refused');
select alike(pg_temp.refusal($$select public.admin_set_setting('no_such_setting', '1', 'test')$$), 'DZ-E5071:%', 'an unknown setting: DZ-E5071');
select alike(pg_temp.refusal($$select public.admin_set_setting('rental_request_hours', '24', '')$$), 'DZ-E5006:%', 'a change needs a reason');
select is(public.admin_set_setting('rental_request_hours', '"24"', 'Faster answers for the pilot') ->> 'new_value', '24', 'a valid change (sent as text) is saved');
select is(public.admin_set_setting('rate_limit_report', '25', 'More reports per day') -> 'new_value', '{"max": 25, "window_seconds": 86400}'::jsonb,
  'a rate limit takes the new maximum and keeps its window');
reset role;
select set_config('request.jwt.claims', '', true);
select results_eq($$select before, after - 'affects_terms', reason from app_private.admin_actions where action = 'set_setting' and target_id = 'rental_request_hours' order by id desc limit 1$$,
  $$values ('{"value": 48}'::jsonb, '{"value": 24}'::jsonb, 'Faster answers for the pilot'::text)$$, 'the change is in the admin log with the old and new value');
create temp table cron_before as select schedule from cron.job where jobname = 'dzirent-rental-reminders';
set local role authenticated;
select pg_temp.as_admin(true);
select ok(public.admin_set_setting('rental_reminder_hour', '10', 'Later reminders') ->> 'reminder_schedule_utc' is not null, 'changing the reminder hour reschedules');
reset role;
select set_config('request.jwt.claims', '', true);
select isnt((select schedule from cron.job where jobname = 'dzirent-rental-reminders'), (select schedule from cron_before), 'the reminder cron job moved');
select is((select schedule from cron.job where jobname = 'dzirent-rental-reminders'),
  (select (extract(minute from ((d.today + 1 + time '10:00') at time zone 'America/Chicago') at time zone 'UTC'))::int || ' '
       || (extract(hour from ((d.today + 1 + time '10:00') at time zone 'America/Chicago') at time zone 'UTC'))::int || ' * * *' from d),
  'it runs at 10:00 in the rental time zone, as UTC');

-- 2. A listing with no availability windows is always available -----------------------------------
delete from public.availability where listing_id = (select id from l where name = 'blazer');
set local role authenticated;
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
insert into ids select 'nowin', public.request_rental((select id from l where name = 'blazer'), (select today + 200 from d), (select today + 202 from d));
select ok((select id from ids where name = 'nowin') is not null, 'no windows: any future dates can be requested');
select ok((select expires_at between now() + interval '23 hours' and now() + interval '25 hours' from public.rentals where id = (select id from ids where name = 'nowin')),
  'the new request expiry setting (24 hours) takes effect');
select alike(pg_temp.refusal($$select public.request_rental((select id from l where name = 'gown'), (select today + 200 from d), (select today + 202 from d))$$),
  'DZ-E4008:%', 'a listing with windows still limits the dates');
select alike(pg_temp.refusal($$select public.request_rental((select id from l where name = 'blazer'), (select today - 1 from d), (select today + 1 from d))$$),
  'DZ-E4006:%', 'no windows: dates in the past are still refused');
select ok(exists (select 1 from public.browse_listings(p_start_date => (select today + 300 from d), p_end_date => (select today + 301 from d), p_limit => 30)
                  where id = (select id from l where name = 'blazer')), 'date browsing includes the listing with no windows');
select ok(not exists (select 1 from public.browse_listings(p_start_date => (select today + 300 from d), p_end_date => (select today + 301 from d), p_limit => 30)
                      where id = (select id from l where name = 'gown')), 'and leaves out a listing whose windows don''t cover the dates');

-- 3. Requests that expire and rentals not picked up 2 days after the start --------------------------
insert into ids select 'exp', public.request_rental((select id from l where name = 'trousers'), (select today + 50 from d), (select today + 51 from d));
insert into ids select 'late', public.request_rental((select id from l where name = 'coat'), (select today + 5 from d), (select today + 6 from d));
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
insert into ids select 'edge', public.request_rental((select id from l where name = 'coat'), (select today + 9 from d), (select today + 10 from d));
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select is(public.respond_rental((select id from ids where name = 'late'), 'accept'), 'accepted', 'payments off: accepted');
select is(public.respond_rental((select id from ids where name = 'edge'), 'accept'), 'accepted', 'a second accepted rental');
reset role;
select set_config('request.jwt.claims', '', true);
delete from app_private.async_jobs where kind = 'send_push';
update public.rentals set expires_at = now() - interval '1 minute' where id = (select id from ids where name = 'exp');
update public.rentals set start_date = (select today - 3 from d), end_date = (select today - 3 from d) where id = (select id from ids where name = 'late');
update public.rentals set start_date = (select today - 2 from d), end_date = (select today - 2 from d) where id = (select id from ids where name = 'edge');
select ok(app_private.expire_rental_requests() >= 2, 'the expiry job runs');
select results_eq($$select status, (select note from public.rental_events e where e.rental_id = r.id order by e.id desc limit 1),
    (select actor_role from public.rental_events e where e.rental_id = r.id order by e.id desc limit 1)
  from public.rentals r where id = (select id from ids where name = 'late')$$,
  $$values ('cancelled'::text, 'Not picked up within 2 days after the start date'::text, 'system'::text)$$,
  'accepted but not picked up 3 days after the start: cancelled by the system, with an event');
select is((select status from public.rentals where id = (select id from ids where name = 'edge')), 'accepted', 'exactly 2 days after the start: still accepted');
select is((select note from public.rental_events where rental_id = (select id from ids where name = 'exp') order by id desc limit 1), 'No answer in 24 hours',
  'an unanswered request expires, the note from the setting');
select is((select count(*)::int from app_private.async_jobs where kind = 'send_push' and payload ->> 'kind' = 'rental_cancelled'
           and payload ->> 'conversation_id' = (select conversation_id::text from public.rentals where id = (select id from ids where name = 'late'))), 2,
  'rental_cancelled goes to both people for an automatic cancel');
select is((select count(*)::int from app_private.async_jobs where kind = 'send_push' and payload ->> 'kind' = 'rental_expired'
           and payload ->> 'conversation_id' = (select conversation_id::text from public.rentals where id = (select id from ids where name = 'exp'))), 2,
  'rental_expired goes to both people');

-- 4. admin_end_rental ----------------------------------------------------------------------------
update public.rentals set status = 'picked_up', start_date = (select today + 1 from d), end_date = (select today + 2 from d)
where id = (select id from ids where name = 'edge');
set local role authenticated;
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select alike(pg_temp.refusal($$select public.admin_end_rental((select id from ids where name = 'edge'), 'completed', 'Lender banned')$$), 'DZ-E5001:%',
  'a non-admin can''t end a rental');
select pg_temp.as_admin(false);
select alike(pg_temp.refusal($$select public.admin_end_rental((select id from ids where name = 'edge'), 'completed', 'Lender banned')$$), 'DZ-E5003:%',
  'a stale two-step session can''t end a rental');
select pg_temp.as_admin(true);
select alike(pg_temp.refusal($$select public.admin_end_rental((select id from ids where name = 'edge'), 'done', 'Lender banned')$$), 'DZ-E5080:%',
  'the outcome is cancelled or completed');
select is(public.admin_end_rental((select id from ids where name = 'edge'), 'completed', 'Lender banned; piece returned in person') ->> 'status', 'completed',
  'a fresh admin ends a stuck rental as completed');
select alike(pg_temp.refusal($$select public.admin_end_rental((select id from ids where name = 'edge'), 'cancelled', 'again')$$), 'DZ-E5081:%',
  'an ended rental can''t be ended again');
reset role;
select set_config('request.jwt.claims', '', true);
select results_eq($$select to_status, actor_role, note from public.rental_events where rental_id = (select id from ids where name = 'edge') order by id desc limit 1$$,
  $$values ('completed'::text, 'system'::text, 'Ended by Dzirent: Lender banned; piece returned in person'::text)$$, 'the event says Dzirent ended it');
select is((select count(*)::int from app_private.admin_actions where action = 'end_rental' and target_id = (select id::text from ids where name = 'edge')), 1,
  'it is in the admin log');

-- 5. Payments on: accept -> awaiting_payment -> paid ---------------------------------------------
update public.app_settings set enabled = true where key = 'payments_enabled';
update public.listings set deposit_amount = 40 where id = (select id from l where name = 'gown');
set local role authenticated;
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
insert into ids select 'p1', public.request_rental((select id from l where name = 'gown'), (select today + 10 from d), (select today + 12 from d));
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select is(public.respond_rental((select id from ids where name = 'p1'), 'accept'), 'awaiting_payment', 'payments on: accept waits for payment');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select deposit_amount from public.rentals where id = (select id from ids where name = 'p1')), 40::numeric(10,2), 'the deposit is a snapshot of the listing''s');
select alike(pg_temp.refusal($$select public.payment_pay_prepare('33333333-3333-4333-8333-333333333333', (select id from ids where name = 'p1'))$$),
  'DZ-E4031:%', 'no payment while the lender has no payout account');
insert into public.payout_accounts (user_id, stripe_account_id, charges_enabled, payouts_enabled, details_submitted)
values ('11111111-1111-4111-8111-111111111111', 'acct_c4pgtap', true, true, true);
insert into public.stripe_customers (user_id, stripe_customer_id) values ('33333333-3333-4333-8333-333333333333', 'cus_c4pgtap');
select alike(pg_temp.refusal($$select public.payment_pay_prepare('11111111-1111-4111-8111-111111111111', (select id from ids where name = 'p1'))$$),
  'DZ-E4032:%', 'the lender can''t pay');
select ok((select (x ->> 'amount')::numeric = r.total and (x ->> 'fee')::numeric = 0 and x ->> 'lender_account' = 'acct_c4pgtap'
           from public.payment_pay_prepare('33333333-3333-4333-8333-333333333333', (select id from ids where name = 'p1')) x,
                public.rentals r where r.id = (select id from ids where name = 'p1')),
  'the payment: the price snapshot, the fee from the setting (0), to the lender''s account');
select is(public.payment_save_intent((select id from ids where name = 'p1'), 'pi_c4pgtap1', 0, 0), 'pi_c4pgtap1', 'the PaymentIntent is stored');
select is(public.payment_save_intent((select id from ids where name = 'p1'), 'pi_c4pgtap2', 0, 0), 'pi_c4pgtap1', 'a second one is never stored: the first wins');
select is(public.payment_handle_event('evt_c4pgtap1', 'payment_intent.succeeded', 'hash1', '{"id": "pi_c4pgtap1", "payment_method": "pm_card_visa"}'::jsonb) ->> 'result',
  'rental_paid', 'a succeeded payment moves the rental to paid');
select is(public.payment_handle_event('evt_c4pgtap1', 'payment_intent.succeeded', 'hash1', '{"id": "pi_c4pgtap1"}'::jsonb) ->> 'result',
  'duplicate', 'the same event again is a duplicate');
select results_eq($$select status, payment_status, (select count(*)::int from public.rental_events e where e.rental_id = r.id and e.to_status = 'paid')
  from public.rentals r where id = (select id from ids where name = 'p1')$$, $$values ('paid'::text, 'paid'::text, 1)$$, 'paid once');

-- 6. Pickup needs the deposit hold; return opens the claim window --------------------------------
select pg_temp.photos((select id from ids where name = 'p1'), 'pickup', '11111111-1111-4111-8111-111111111111', 2);
set local role authenticated;
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select alike(pg_temp.refusal($$select public.mark_picked_up((select id from ids where name = 'p1'))$$), 'DZ-E4033:%',
  'paid with a deposit: pickup needs the hold first');
select throws_ok($$select public.payment_deposit_prepare('11111111-1111-4111-8111-111111111111', (select id from ids where name = 'p1'))$$, '42501', null,
  'people can''t call the server''s payment steps');
reset role;
select set_config('request.jwt.claims', '', true);
insert into ids select 'p1op', (public.payment_deposit_prepare('11111111-1111-4111-8111-111111111111', (select id from ids where name = 'p1')) ->> 'operation_id')::uuid;
select is((select payment_method_id from app_private.rental_payment_methods where rental_id = (select id from ids where name = 'p1')), 'pm_card_visa',
  'the card the rental was paid with is kept for the hold (closed table)');
select is(public.payment_deposit_result((select id from ids where name = 'p1op'), 'pi_c4pgtapdep', 'requires_capture', null, null) ->> 'deposit_status', 'held',
  'a hold Stripe can capture is held');
select ok((select deposit_capture_before between now() + interval '6 days' and now() + interval '8 days' from public.rentals where id = (select id from ids where name = 'p1')),
  'capture_before is stored (about 7 days when Stripe doesn''t say)');
set local role authenticated;
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select is(public.mark_picked_up((select id from ids where name = 'p1')), 'picked_up', 'with the hold in place the lender marks pickup');
reset role;
select set_config('request.jwt.claims', '', true);
select pg_temp.photos((select id from ids where name = 'p1'), 'return', '11111111-1111-4111-8111-111111111111', 2);
set local role authenticated;
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select is(public.mark_returned((select id from ids where name = 'p1')), 'returned', 'with a deposit hold, return waits for the claim window');
select ok((select claim_window_ends_at between now() + interval '47 hours' and now() + interval '49 hours' from public.rentals where id = (select id from ids where name = 'p1')),
  'the claim window: 48 hours');

-- 7. Claims ------------------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', '', true);
create temp table ev as select (select name from storage.objects where bucket_id = 'rental-photos' and name like (select id::text from ids where name = 'p1') || '/return/%' order by name limit 1) as ret,
  (select name from storage.objects where bucket_id = 'rental-photos' and name like (select id::text from ids where name = 'p1') || '/pickup/%' order by name limit 1) as pick;
grant select on ev to authenticated;
set local role authenticated;
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
select alike(pg_temp.refusal($$select public.file_claim((select id from ids where name = 'p1'), 20, 'Stain', array[(select ret from ev)])$$), 'DZ-E4002:%',
  'the renter can''t file a claim');
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select is(pg_temp.refusal($$select public.file_claim((select id from ids where name = 'p1'), 50, 'Stain on the hem', array[(select ret from ev)])$$),
  'DZ-E4041: Claim an amount above $0 and up to the deposit ($40.00). | amount', 'at most the deposit');
select alike(pg_temp.refusal($$select public.file_claim((select id from ids where name = 'p1'), 20, 'ab', array[(select ret from ev)])$$), 'DZ-E4042:%',
  'a reason of 3 characters or more');
select alike(pg_temp.refusal($$select public.file_claim((select id from ids where name = 'p1'), 20, 'Stain on the hem', '{}')$$), 'DZ-E4043:%',
  'at least one photo');
select alike(pg_temp.refusal($$select public.file_claim((select id from ids where name = 'p1'), 20, 'Stain on the hem', array[(select pick from ev)])$$), 'DZ-E4043:%',
  'a pickup photo isn''t evidence of the return');
reset role;
select set_config('request.jwt.claims', '', true);
update public.rentals set claim_window_ends_at = now() - interval '1 minute' where id = (select id from ids where name = 'p1');
set local role authenticated;
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select alike(pg_temp.refusal($$select public.file_claim((select id from ids where name = 'p1'), 20, 'Stain on the hem', array[(select ret from ev)])$$), 'DZ-E4040:%',
  'after the window: refused');
reset role;
select set_config('request.jwt.claims', '', true);
update public.rentals set claim_window_ends_at = now() + interval '1 hour' where id = (select id from ids where name = 'p1');
set local role authenticated;
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
insert into ids select 'c1', public.file_claim((select id from ids where name = 'p1'), 30, 'Stain on the hem', array[(select ret from ev)]);
select is((select status from public.rentals where id = (select id from ids where name = 'p1')), 'claimed', 'a claim in the window: claimed');
select alike(pg_temp.refusal($$select public.file_claim((select id from ids where name = 'p1'), 10, 'Another', array[(select ret from ev)])$$), 'DZ-E4048:%',
  'one claim per rental');
select throws_ok($$insert into public.rental_claims (rental_id, amount, reason) values ((select id from ids where name = 'p1'), 1, 'direct')$$, '42501', null,
  'no direct writes to claims');
select alike(pg_temp.refusal($$select public.respond_claim((select id from ids where name = 'c1'), 'accept')$$), 'DZ-E4032:%', 'the lender can''t answer the claim');
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select alike(pg_temp.refusal($$select public.respond_claim((select id from ids where name = 'c1'), 'accept')$$), 'DZ-E4044:%', 'a stranger can''t see it');
select is((select count(*)::int from public.rental_claims where id = (select id from ids where name = 'c1')), 0, 'a stranger reads no claim');
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
select is((select count(*)::int from public.rental_claims where id = (select id from ids where name = 'c1')), 1, 'the renter reads the claim');
select alike(pg_temp.refusal($$select public.respond_claim((select id from ids where name = 'c1'), 'maybe')$$), 'DZ-E4046:%', 'accept or dispute');
select is(public.respond_claim((select id from ids where name = 'c1'), 'dispute', 'It was there at pickup'), 'disputed', 'the renter disputes');
select alike(pg_temp.refusal($$select public.respond_claim((select id from ids where name = 'c1'), 'accept')$$), 'DZ-E4045:%', 'answered once');
select alike(pg_temp.refusal($$select public.admin_decide_claim((select id from ids where name = 'c1'), 10, 'Split')$$), 'DZ-E5001:%', 'a non-admin can''t decide');
select pg_temp.as_admin(true);
select is(pg_temp.refusal($$select public.admin_decide_claim((select id from ids where name = 'c1'), 35, 'More than asked')$$),
  'DZ-E5086: Capture from $0 up to the claim ($30.00). | amount', 'the admin captures at most the claimed amount');
select is(public.admin_decide_claim((select id from ids where name = 'c1'), 20, 'Photos show a small stain') ->> 'capture', '20', 'the admin decides $20');
reset role;
select set_config('request.jwt.claims', '', true);
select results_eq($$select c.status, c.decision_amount, r.status, (select o.kind || ' ' || o.amount || ' ' || o.status from app_private.payment_operations o where o.rental_id = r.id and o.kind = 'deposit_capture')
  from public.rental_claims c join public.rentals r on r.id = c.rental_id where c.id = (select id from ids where name = 'c1')$$,
  $$values ('decided'::text, 20::numeric(10,2), 'completed'::text, 'deposit_capture 20.00 queued'::text)$$,
  'decided: the rental completes and $20 is captured through the outbox');
select is((select count(*)::int from app_private.async_jobs where kind = 'stripe_deposit'
  and payload ->> 'operation_id' = (select id::text from app_private.payment_operations where rental_id = (select id from ids where name = 'p1') and kind = 'deposit_capture')), 1,
  'the capture is an outbox job for stripe-deposit');
select is((select count(*)::int from app_private.async_jobs where kind = 'send_push' and payload ->> 'kind' = 'claim_decided'
  and payload ->> 'conversation_id' = (select conversation_id::text from public.rentals where id = (select id from ids where name = 'p1'))), 2,
  'claim_decided goes to both people');
select is((select count(*)::int from app_private.admin_actions where action = 'decide_claim' and target_id = (select id::text from ids where name = 'c1')), 1,
  'the decision is in the admin log');

-- 8. No claim: the window closes, the hold is released --------------------------------------------
set local role authenticated;
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
insert into ids select 'p2', public.request_rental((select id from l where name = 'gown'), (select today + 30 from d), (select today + 31 from d));
reset role;
select set_config('request.jwt.claims', '', true);
update public.rentals set status = 'returned', payment_intent_id = 'pi_c4pgtap_p2', payment_status = 'paid', deposit_intent_id = 'pi_c4pgtap_dep2',
  deposit_status = 'held', claim_window_ends_at = now() - interval '1 minute' where id = (select id from ids where name = 'p2');
select ok(app_private.expire_rental_requests() >= 1, 'the job closes the window');
select results_eq($$select r.status, (select o.kind || ' ' || o.status from app_private.payment_operations o where o.rental_id = r.id)
  from public.rentals r where id = (select id from ids where name = 'p2')$$,
  $$values ('completed'::text, 'deposit_release queued'::text)$$, 'no claim in the window: completed, the hold released');

-- 9. The cancellation rule -------------------------------------------------------------------------
create function pg_temp.paid_rental(p_name text, p_from int, p_to int) returns void language plpgsql as $$
begin
  perform pg_temp.as_user('33333333-3333-4333-8333-333333333333');
  insert into ids select p_name, public.request_rental((select id from l where name = 'coat'), (select today + p_from from d), (select today + p_to from d));
  perform pg_temp.as_user('11111111-1111-4111-8111-111111111111');
  perform public.respond_rental((select id from ids where name = p_name), 'accept');
end;
$$;
grant execute on function pg_temp.paid_rental(text, int, int) to authenticated;
create function pg_temp.mark_paid(p_name text) returns void language sql as $$
  update public.rentals set payment_intent_id = 'pi_' || replace(p_name, '_', '') || 'c4pgtap', payment_status = 'paid', status = 'paid'
  where id = (select id from ids where name = p_name);
$$;
set local role authenticated;
select pg_temp.paid_rental('early', 30, 31);
reset role;
select pg_temp.mark_paid('early');
set local role authenticated;
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
select is(public.cancel_rental((select id from ids where name = 'early'), 'Plans changed'), 'cancelled', 'the renter cancels a month ahead');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select amount from app_private.payment_operations where rental_id = (select id from ids where name = 'early') and kind = 'refund'),
  (select total from public.rentals where id = (select id from ids where name = 'early')), 'before the cutoff: a full refund');
set local role authenticated;
select pg_temp.paid_rental('late_renter', 1, 2);
reset role;
select pg_temp.mark_paid('late_renter');
set local role authenticated;
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
select is(public.cancel_rental((select id from ids where name = 'late_renter')), 'cancelled', 'the renter cancels the day before');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select count(*)::int from app_private.payment_operations where rental_id = (select id from ids where name = 'late_renter')), 0,
  'after the cutoff the lender keeps the rental price (0% refund)');
set local role authenticated;
select pg_temp.paid_rental('late_lender', 1, 2);
reset role;
select pg_temp.mark_paid('late_lender');
delete from app_private.async_jobs where kind = 'send_push';
set local role authenticated;
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select is(public.cancel_rental((select id from ids where name = 'late_lender')), 'cancelled', 'the lender cancels the day before');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select amount from app_private.payment_operations where rental_id = (select id from ids where name = 'late_lender') and kind = 'refund'),
  (select total from public.rentals where id = (select id from ids where name = 'late_lender')), 'a lender cancellation always refunds in full');
select is((select count(*)::int from app_private.async_jobs where kind = 'send_push' and payload ->> 'kind' = 'rental_cancelled'
  and payload ->> 'recipient_id' = '33333333-3333-4333-8333-333333333333'
  and payload ->> 'conversation_id' = (select conversation_id::text from public.rentals where id = (select id from ids where name = 'late_lender'))), 1,
  'rental_cancelled goes to the other person');

-- 10. Admin refunds and ending a paid rental with a hold --------------------------------------------
set local role authenticated;
select pg_temp.paid_rental('stuck', 40, 41);
reset role;
select pg_temp.mark_paid('stuck');
update public.rentals set status = 'picked_up', deposit_amount = 40, deposit_intent_id = 'pi_c4pgtap_dep3', deposit_status = 'held'
where id = (select id from ids where name = 'stuck');
set local role authenticated;
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
select alike(pg_temp.refusal($$select public.admin_refund_rental((select id from ids where name = 'stuck'), 10, 'Goodwill')$$), 'DZ-E5001:%', 'a non-admin can''t refund');
select pg_temp.as_admin(true);
select alike(pg_temp.refusal($$select public.admin_end_rental((select id from ids where name = 'stuck'), 'completed', 'Lender banned')$$), 'DZ-E5083:%',
  'with a hold the admin chooses release or capture');
select alike(pg_temp.refusal($$select public.admin_end_rental((select id from ids where name = 'stuck'), 'completed', 'Lender banned', 100000, 'release')$$), 'DZ-E5084:%',
  'a refund at most what was paid');
select ok((public.admin_refund_rental((select id from ids where name = 'stuck'), 5, 'Late pickup') ->> 'operation_id') is not null, 'the admin refunds $5');
select is(public.admin_end_rental((select id from ids where name = 'stuck'), 'completed', 'Lender banned', 10, 'release') ->> 'status', 'completed',
  'the admin ends it with a $10 refund and the hold released');
reset role;
select set_config('request.jwt.claims', '', true);
select results_eq($$select kind, amount, status from app_private.payment_operations where rental_id = (select id from ids where name = 'stuck') order by kind, amount$$,
  $$values ('deposit_release'::text, 40.00::numeric(10,2), 'queued'::text), ('refund'::text, 5.00::numeric(10,2), 'queued'::text), ('refund'::text, 10.00::numeric(10,2), 'queued'::text)$$,
  'the refunds and the release go to the outbox');
select is((select count(*)::int from app_private.admin_actions where action in ('refund_rental', 'end_rental') and target_id = (select id::text from ids where name = 'stuck')), 2,
  'both are in the admin log');

-- 10b. The nightly deposit hold job ---------------------------------------------------------------
set local role authenticated;
select pg_temp.paid_rental('renew', 60, 61);
reset role;
select pg_temp.mark_paid('renew');
update public.rentals set status = 'picked_up', deposit_amount = 40, deposit_intent_id = 'pi_c4pgtap_dep4', deposit_status = 'held',
  deposit_capture_before = now() + interval '10 hours' where id = (select id from ids where name = 'renew');
delete from app_private.async_jobs where kind = 'send_push';
select is(app_private.check_deposit_holds(), '{"warned": 1, "renewing": 1}'::jsonb, 'a hold ending within a day while picked up: both told, a new hold queued');
select is(app_private.check_deposit_holds(), '{"warned": 0, "renewing": 0}'::jsonb, 'run again: no second notice or renewal while one is on its way');
select is((select count(*)::int from app_private.async_jobs where kind = 'send_push' and payload ->> 'kind' = 'deposit_hold_ending'), 2,
  'deposit_hold_ending goes to both people');

-- 11. Webhook events: account status, disputes ----------------------------------------------------
select is(public.payment_handle_event('evt_c4pgtap2', 'account.updated', 'hash2',
  '{"id": "acct_c4pgtap", "charges_enabled": false, "payouts_enabled": false, "details_submitted": true}'::jsonb) ->> 'result', 'account_updated',
  'account.updated refreshes the payout account');
select is((select charges_enabled from public.payout_accounts where stripe_account_id = 'acct_c4pgtap'), false, 'charges are off again');
select is(public.payment_handle_event('evt_c4pgtap3', 'charge.dispute.created', 'hash3',
  '{"id": "dp_c4pgtap", "payment_intent": "pi_c4pgtap1", "amount": 1500, "reason": "fraudulent", "status": "needs_response"}'::jsonb) ->> 'result', 'dispute_opened',
  'a card dispute is recorded');
select is((select rental_id from app_private.card_disputes where stripe_dispute_id = 'dp_c4pgtap'), (select id from ids where name = 'p1'), 'found by the stored PaymentIntent');

-- 12. Who reads the payout and customer rows -------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select is((select count(user_id)::int from public.payout_accounts), 1, 'the lender reads their own payout account');
select is((select count(user_id)::int from public.stripe_customers), 0, 'the lender reads no other customer row');
select throws_ok($$select * from app_private.payment_events$$, '42501', null, 'payment events are closed to people');
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
select is((select count(user_id)::int from public.payout_accounts), 0, 'the renter reads no other payout account');
select is((select count(user_id)::int from public.stripe_customers), 1, 'the renter sees their own customer row exists');
select throws_ok($$select stripe_customer_id from public.stripe_customers$$, '42501', null, 'but not the Stripe customer id');
select throws_ok($$insert into public.payout_accounts (user_id, stripe_account_id) values ('33333333-3333-4333-8333-333333333333', 'acct_mine')$$, '42501', null,
  'people can''t write payout accounts');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select count(*) from public.payout_accounts$$, '42501', null, 'guests read nothing');

select * from finish();
rollback;
