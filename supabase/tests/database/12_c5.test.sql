-- C5 pgTAP: the payment deadline (setting, payment_due_at, the automatic cancel by the expiry job
-- with an event and pushes to both), the rules the screens read (rental_settings), no-window
-- listings, and transactional emails: queued next to the rental pushes, the "Email me about
-- rentals" switch, the payment receipt, the account-deleted email, and send_email jobs marked
-- skipped (not failed) while the provider key is blank. Nothing is sent: pg_net requests queued
-- here roll back with the transaction, and the send-email answers are simulated in net._http_response.
-- Users: 1111... (lender), 2222... and 3333... (renters). Everything is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(54);

create function pg_temp.as_user(p_user text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal1')::text, true);
end;
$$;
create function pg_temp.as_admin() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'role', 'authenticated',
    'aal', 'aal2', 'amr', json_build_array(json_build_object('method', 'totp',
      'timestamp', extract(epoch from now() - interval '1 hour')::bigint)))::text, true);
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
-- The send-email function's answer to one email's job (200), as pg_net would record it.
create function pg_temp.answer_email(p_email uuid, p_code int) returns void language sql as $$
  insert into net._http_response (id, status_code, content, timed_out, created)
  select j.request_id, p_code, '{}', false, now() from app_private.async_jobs j
  where j.kind = 'send_email' and j.payload ->> 'email_id' = p_email::text and j.request_id is not null;
$$;
grant execute on function pg_temp.as_user(text) to authenticated, anon;
grant execute on function pg_temp.as_admin() to authenticated;
grant execute on function pg_temp.refusal(text) to authenticated, anon;
create temp table ids (name text primary key, id uuid);
grant select, insert on ids to authenticated;
create temp table d as select app_private.rental_today() as today;
grant select on d to authenticated, anon;
create temp table l (name text primary key, id uuid);
insert into l values ('gown', 'c05269c8-dc62-4fe6-a1c2-68b0f2448d1c'), ('blazer', '3cd2a771-2f4e-4ee5-b0c5-18295ef5999f'),
  ('coat', '0415cc17-423a-4232-b481-df74cec8e4ae'), ('trousers', '3f8b0763-cb28-46b3-a210-a18499de5b65');
grant select on l to authenticated, anon;
delete from public.rentals where listing_id in (select id from l);
delete from app_private.rate_counters where action = 'rental_request';
delete from public.blocks where '11111111-1111-4111-8111-111111111111' in (blocker_id, blocked_id);
delete from public.notification_settings where user_id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333');
delete from app_private.email_messages;
update public.app_settings set enabled = false where key = 'payments_enabled';
insert into public.device_tokens (token, user_id, platform) values
  ('c5-pgtap-lender', '11111111-1111-4111-8111-111111111111', 'android'),
  ('c5-pgtap-renter', '33333333-3333-4333-8333-333333333333', 'android')
on conflict (token) do update set user_id = excluded.user_id;

-- 1. The payment deadline setting -------------------------------------------------------------------
select results_eq($$select value, min_value, max_value, unit, decided_by, area, affects_terms from app_private.settings where key = 'payment_deadline_hours'$$,
  $$values ('24'::jsonb, 1::numeric, 72::numeric, 'hours after acceptance'::text, 'business_owner'::text, 'payments'::text, true)$$,
  'payment_deadline_hours: 24, from 1 to 72 hours, the business owner decides, the terms state it');
select is(pg_temp.refusal($$update app_private.settings set value = '73'::jsonb where key = 'payment_deadline_hours'$$),
  'DZ-E5070: Enter a value from 1 to 72 (hours after acceptance). | value', 'a deadline above 72 hours is refused');
select alike(pg_temp.refusal($$update app_private.settings set value = '0'::jsonb where key = 'payment_deadline_hours'$$),
  'DZ-E5070:%', 'and below 1 hour');
select results_eq($$select value, area, decided_by, affects_terms from app_private.settings where key = 'email_log_retention_days'$$,
  $$values ('30'::jsonb, 'retention'::text, 'attorney'::text, true)$$, 'email records are kept 30 days, a retention setting for the attorney');

-- 2. The rules the screens read, for everyone --------------------------------------------------------
set local role anon;
select is((select array_agg(k order by k) from jsonb_object_keys(public.rental_settings()) k),
  array['cancellation_refund_cutoff_hours', 'claim_window_hours', 'late_cancellation_refund_percent', 'payment_deadline_hours',
        'payments_enabled', 'platform_fee_percent', 'rental_request_hours'],
  'rental_settings(): the seven rules, readable by guests');
select results_eq($$select (public.rental_settings() ->> 'rental_request_hours')::int, (public.rental_settings() ->> 'payment_deadline_hours')::int, (public.rental_settings() ->> 'payments_enabled')::boolean$$,
  $$values (48, 24, false)$$, 'the request answer time (48), the payment deadline (24) and payments off');
reset role;

-- 3. No availability windows: every day from today --------------------------------------------------
delete from public.availability where listing_id = (select id from l where name = 'blazer');
set local role authenticated;
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
insert into ids select 'nowin', public.request_rental((select id from l where name = 'blazer'), (select today from d), (select today + 120 from d));
select ok((select id from ids where name = 'nowin') is not null, 'no windows: today through 120 days ahead can be requested');
select alike(pg_temp.refusal($$select public.request_rental((select id from l where name = 'gown'), (select today + 400 from d), (select today + 401 from d))$$),
  'DZ-E4008:%', 'a listing with windows still limits the dates');
select alike(pg_temp.refusal($$select public.request_rental((select id from l where name = 'trousers'), (select today - 1 from d), (select today from d))$$),
  'DZ-E4006:%', 'the past is refused either way');
reset role;
select set_config('request.jwt.claims', '', true);

-- 4. Emails go with the rental pushes, and email_prepare holds only plain fields --------------------
select is((select count(*)::int from app_private.email_messages
           where rental_id = (select id from ids where name = 'nowin') and template = 'rental_request'
             and recipient_id = '11111111-1111-4111-8111-111111111111' and status = 'queued'), 1,
  'a request queues the "rental request received" email to the lender');
select ok(exists (select 1 from app_private.async_jobs j join app_private.email_messages e on j.payload ->> 'email_id' = e.id::text
                  where j.kind = 'send_email' and e.rental_id = (select id from ids where name = 'nowin')),
  'through the outbox (kind send_email)');
create temp table prep as
  select public.email_prepare((select id from app_private.email_messages where rental_id = (select id from ids where name = 'nowin') and template = 'rental_request')) as p;
select results_eq($$select p ->> 'state', p ->> 'template', p ->> 'to' = (select email from auth.users where id = '11111111-1111-4111-8111-111111111111'),
                           p -> 'data' ->> 'role', p -> 'data' ->> 'listing_title' is not null from prep$$,
  $$values ('send'::text, 'rental_request'::text, true, 'lender'::text, true)$$,
  'email_prepare: send it, to the account''s own email, with the listing title');
select is((select count(*)::int from prep, jsonb_object_keys(p -> 'data') k
           where k in ('message', 'messages', 'body', 'reason', 'note', 'pickup_area', 'approx_lat', 'approx_lng', 'city', 'bust_cm', 'waist_cm', 'hips_cm', 'measurements')), 0,
  'no messages, claim reasons, measurements or places in what an email may show');
select ok((select p -> 'data' ->> 'chat_path' like '/app/messages/%' from prep), 'the chat link is the rental''s chat');
set local role authenticated;
select throws_ok($$select public.email_prepare(gen_random_uuid())$$, '42501', null, 'people can''t call email_prepare');
reset role;

-- 5. The payment deadline: accept -> awaiting payment -> cancelled when unpaid in time ---------------
update public.app_settings set enabled = true where key = 'payments_enabled';
set local role authenticated;
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
insert into ids select 'pay', public.request_rental((select id from l where name = 'gown'), (select today + 30 from d), (select today + 31 from d));
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select is(public.respond_rental((select id from ids where name = 'pay'), 'accept'), 'awaiting_payment', 'payments on: accepting waits for payment');
select ok((public.get_rental((select id from ids where name = 'pay')) ->> 'payment_due_at')::timestamptz between now() + interval '23 hours 59 minutes' and now() + interval '24 hours 1 minute',
  'payment_due_at is 24 hours after acceptance, and the two people see it');
select results_eq($$select (r ->> 'lender_can_take_payment')::boolean, r ? 'fee_amount', r ? 'deposit_captured_amount', r ? 'completed_at'
                    from (select public.get_rental((select id from ids where name = 'pay')) as r) x$$,
  $$values (false, true, true, true)$$, 'get_rental has the receipt fields and whether the lender can take payments (not yet)');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select count(*)::int from app_private.email_messages where rental_id = (select id from ids where name = 'pay')
             and template = 'request_accepted' and recipient_id = '33333333-3333-4333-8333-333333333333'), 1,
  'the renter gets the "request accepted" email');
select app_private.expire_rental_requests();
select is((select status from public.rentals where id = (select id from ids where name = 'pay')), 'awaiting_payment', 'not yet due: still waiting');
-- A pending payment, then past the deadline.
update public.rentals set payment_intent_id = 'pi_c5pgtapdeadline', payment_status = 'pending', payment_due_at = now() - interval '1 minute'
  where id = (select id from ids where name = 'pay');
delete from app_private.async_jobs where kind = 'send_push';
select app_private.expire_rental_requests();
select is((select status from public.rentals where id = (select id from ids where name = 'pay')), 'cancelled', 'unpaid by the deadline: cancelled');
select results_eq($$select to_status, actor_role, actor_id is null, note from public.rental_events where rental_id = (select id from ids where name = 'pay') order by id desc limit 1$$,
  $$values ('cancelled'::text, 'system'::text, true, 'Not paid within 24 hours after it was accepted'::text)$$, 'a timeline event by Dzirent with the reason');
select is((select array_agg(payload ->> 'recipient_id' order by payload ->> 'recipient_id') from app_private.async_jobs
           where kind = 'send_push' and payload ->> 'kind' = 'rental_cancelled'
             and payload ->> 'conversation_id' = (select conversation_id::text from public.rentals where id = (select id from ids where name = 'pay'))),
  array['11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333'], 'a rental_cancelled push to both people');
select ok((select bool_and(payload ->> 'body' like '%Not paid in time%') from app_private.async_jobs where kind = 'send_push' and payload ->> 'kind' = 'rental_cancelled'),
  'saying it wasn''t paid in time');
select is((select count(*)::int from app_private.payment_operations where rental_id = (select id from ids where name = 'pay') and kind = 'payment_cancel'), 1,
  'the unpaid PaymentIntent is cancelled (a payment_cancel step)');
select is((select count(*)::int from app_private.email_messages where rental_id = (select id from ids where name = 'pay')
             and template not in ('rental_request', 'request_accepted')), 0, 'a cancel sends no email');
-- Paid just in time (the webhook won the race): the deadline doesn't cancel it.
set local role authenticated;
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
insert into ids select 'race', public.request_rental((select id from l where name = 'trousers'), (select today + 40 from d), (select today + 41 from d));
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select public.respond_rental((select id from ids where name = 'race'), 'accept');
reset role;
select set_config('request.jwt.claims', '', true);
update public.rentals set payment_status = 'paid', payment_due_at = now() - interval '1 minute' where id = (select id from ids where name = 'race');
select app_private.expire_rental_requests();
select is((select status from public.rentals where id = (select id from ids where name = 'race')), 'awaiting_payment', 'a payment recorded in time is never cancelled by the deadline');

-- 6. The payment receipt when a payment succeeds ----------------------------------------------------
select is((select count(*)::int from app_private.email_messages where rental_id = (select id from ids where name = 'race')
             and template = 'payment_receipt' and recipient_id = '33333333-3333-4333-8333-333333333333'), 1,
  'payment_status paid queues the payment receipt to the renter');

-- 7. send_email jobs while the provider key is blank: skipped, not failed --------------------------
create temp table em as
  select (select id from app_private.email_messages where rental_id = (select id from ids where name = 'nowin') and template = 'rental_request') as skipped_id,
         (select id from app_private.email_messages where rental_id = (select id from ids where name = 'pay') and template = 'request_accepted') as sent_id;
-- send-email with EMAIL_API_KEY blank: email_finish(skipped, not_configured), then 200.
select is(public.email_finish((select skipped_id from em), 'skipped', 'not_configured'), 'skipped', 'send-email marks it skipped (no provider key)');
select pg_temp.answer_email((select skipped_id from em), 200);
select app_private.run_async_jobs();
select is((select status from app_private.async_jobs where kind = 'send_email' and payload ->> 'email_id' = (select skipped_id::text from em)), 'skipped',
  'its outbox job is marked skipped: not done, not failed, not retried');
select results_eq($$select status, skip_reason, finished_at is not null from app_private.email_messages where id = (select skipped_id from em)$$,
  $$values ('skipped'::text, 'not_configured'::text, true)$$, 'the email row says why');
-- With a key, a sent email: its job is done.
select public.email_finish((select sent_id from em), 'sent', null, 'msg_c5pgtap');
select pg_temp.answer_email((select sent_id from em), 200);
select app_private.run_async_jobs();
select is((select status from app_private.async_jobs where kind = 'send_email' and payload ->> 'email_id' = (select sent_id::text from em)), 'done',
  'a sent email''s job is done');
-- A job whose email already finished sends nothing again.
update app_private.async_jobs set status = 'pending', attempts = 0 where kind = 'send_email' and payload ->> 'email_id' = (select sent_id::text from em);
select app_private.dispatch_job((select id from app_private.async_jobs where kind = 'send_email' and payload ->> 'email_id' = (select sent_id::text from em)));
select results_eq($$select status, last_error from app_private.async_jobs where kind = 'send_email' and payload ->> 'email_id' = (select sent_id::text from em)$$,
  $$values ('done'::text, 'skipped: the email already finished'::text)$$, 'a finished email is never sent twice');
select is(pg_temp.refusal($$select public.email_finish((select skipped_id from em), 'bounced')$$), 'DZ-E9016: This request isn''t valid. | ', 'only sent, skipped or failed');

-- 8. The "Email me about rentals" switch -----------------------------------------------------------
insert into public.notification_settings (user_id, email_rentals) values ('11111111-1111-4111-8111-111111111111', false)
  on conflict (user_id) do update set email_rentals = false;
set local role authenticated;
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
insert into ids select 'off', public.request_rental((select id from l where name = 'coat'), (select today + 60 from d), (select today + 61 from d));
reset role;
select set_config('request.jwt.claims', '', true);
select is((select count(*)::int from app_private.email_messages where rental_id = (select id from ids where name = 'off') and recipient_id = '11111111-1111-4111-8111-111111111111'), 0,
  'switched off: no email to the lender');
select is((select count(*)::int from app_private.async_jobs where kind = 'send_push' and payload ->> 'kind' = 'rental_request'
             and payload ->> 'recipient_id' = '11111111-1111-4111-8111-111111111111'
             and payload ->> 'conversation_id' = (select conversation_id::text from public.rentals where id = (select id from ids where name = 'off'))), 1,
  'the push still goes (the email switch is separate)');
set local role authenticated;
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select public.respond_rental((select id from ids where name = 'off'), 'decline');
reset role;
select set_config('request.jwt.claims', '', true);
create temp table declined as select id from app_private.email_messages where rental_id = (select id from ids where name = 'off') and template = 'request_declined';
select is((select count(*)::int from declined), 1, 'the renter (switch on by default) gets the "request declined" email');
-- Turned off after it was queued: email_prepare skips it.
insert into public.notification_settings (user_id, email_rentals) values ('22222222-2222-4222-8222-222222222222', false)
  on conflict (user_id) do update set email_rentals = false;
select is(public.email_prepare((select id from declined)) ->> 'state', 'skipped', 'switched off before it went: skipped');
select is(public.email_prepare((select id from declined)) ->> 'state', 'finished', 'and then finished (never sent later)');
select results_eq($$select status, skip_reason from app_private.email_messages where id = (select id from declined)$$,
  $$values ('skipped'::text, 'turned_off'::text)$$, 'the row says turned_off');
select is((select count(*)::int from app_private.email_messages where recipient_id = '22222222-2222-4222-8222-222222222222' and status = 'queued'), 0,
  'nothing left waiting for that person');
set local role authenticated;
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select is((select email_rentals from public.notification_settings where user_id = '22222222-2222-4222-8222-222222222222'), false,
  'people read their own switch');
select lives_ok($$update public.notification_settings set email_rentals = true where user_id = '22222222-2222-4222-8222-222222222222'$$,
  'and change it');
select throws_ok($$select * from app_private.email_messages$$, '42501', null, 'the email log is closed to people');
reset role;
select set_config('request.jwt.claims', '', true);

-- 9. Reminders send the pickup reminder email (to whoever has rental emails on) ----------------------
update public.app_settings set enabled = false where key = 'payments_enabled';
set local role authenticated;
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
insert into ids select 'soon', public.request_rental((select id from l where name = 'blazer'), (select today + 1 from d), (select today + 2 from d));
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select public.respond_rental((select id from ids where name = 'soon'), 'accept');
reset role;
select set_config('request.jwt.claims', '', true);
select app_private.queue_rental_reminders();
select results_eq($$select recipient_id::text, details ->> 'kind' from app_private.email_messages
                    where rental_id = (select id from ids where name = 'soon') and template = 'pickup_reminder'$$,
  $$values ('22222222-2222-4222-8222-222222222222'::text, 'pickup_tomorrow'::text)$$,
  'the pickup reminder email goes to the renter only (the lender turned rental emails off)');

-- 10. The account-deleted email -------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
select throws_ok($$select public.queue_account_deleted_email('someone@example.com')$$, '42501', null, 'people can''t queue it');
reset role;
select set_config('request.jwt.claims', '', true);
create temp table gone as select public.queue_account_deleted_email('deleted-person@example.com') as id;
select results_eq($$select template, recipient_id is null, to_address, status from app_private.email_messages where id = (select id from gone)$$,
  $$values ('account_deleted'::text, true, 'deleted-person@example.com'::text, 'queued'::text)$$,
  'delete-account queues it with the address the account had (no account to point to)');
select is(public.queue_account_deleted_email('not an address'), null, 'not an address: nothing queued');
-- Its job dies (send-email never answers 2xx): the email fails and the address is dropped.
do $do$
declare v_job bigint := (select j.id from app_private.async_jobs j where j.kind = 'send_email' and j.payload ->> 'email_id' = (select id::text from gone));
begin
  for i in 1..5 loop
    perform app_private.job_failed(v_job, 'HTTP 503');
    update app_private.async_jobs set next_attempt_at = now() where id = v_job and status = 'pending';
    perform app_private.dispatch_job(v_job);
  end loop;
end
$do$;
select results_eq($$select e.status, e.to_address is null, j.status from app_private.email_messages e
                    join app_private.async_jobs j on j.payload ->> 'email_id' = e.id::text where e.id = (select id from gone)$$,
  $$values ('failed'::text, true, 'dead'::text)$$, 'a dead email job: the email failed and its address is gone');

-- 11. Admin views: the email kind, never an address ------------------------------------------------
set local role authenticated;
select pg_temp.as_admin();
select ok((select (k ->> 'skipped_day')::int >= 1 from jsonb_array_elements(public.admin_jobs_status() -> 'kinds') k where k ->> 'kind' = 'send_email'),
  'Background jobs counts the skipped emails');
create temp table dead_jobs on commit drop as select public.admin_list_dead_jobs(100, 0) as rows;
select is((select e ->> 'email_template' from dead_jobs, jsonb_array_elements(rows) e where e ->> 'kind' = 'send_email' limit 1), 'account_deleted',
  'the dead list names the email template');
select is((select count(*)::int from dead_jobs, jsonb_array_elements(rows) e where e::text like '%@example.com%'), 0, 'and never an address');
reset role;
select set_config('request.jwt.claims', '', true);

-- 12. Download my data: the switch and the emails sent ---------------------------------------------
delete from public.data_exports where user_id = '33333333-3333-4333-8333-333333333333';
set local role authenticated;
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
create temp table ex on commit drop as select public.export_my_data() as x;
select ok((select x -> 'emails' @> '[{"email": "request_accepted"}]'::jsonb from ex), 'the export lists the emails sent to you');
select is((select count(*)::int from ex, jsonb_array_elements(x -> 'emails') e where e ? 'to_address' or e ? 'details'), 0, 'without addresses or details');
reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
