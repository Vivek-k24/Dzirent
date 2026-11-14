-- C6 pgTAP: ID verification. What the owner reads (status only, never the legal name), the settings,
-- the status mapping, starting and the attempts limit (with verification_required off), webhook
-- events (our application, once each, in order), decisions (verified with the badge and an 18+ age
-- check from the ID, a duplicate face to review, declined, a minor blocks the account and outranks a
-- store signal, KYC expiry removes the badge), the gate only while the flag is on (in this
-- transaction), the admin queue, decisions and attempt resets (refused for non-admins and stale
-- sessions, and logged), reconciliation, account deletion helpers and the data download.
-- Users: 1111... (test user 1, lender), 2222... (test user 2, lender), 3333... (test user 3),
-- aaaa... (the local admin). Didit is never called: the server steps are the database functions the
-- Edge Functions call. Everything is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(79);

create function pg_temp.as_user(p_user text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal1')::text, true);
end;
$$;
create function pg_temp.as_admin(p_fresh boolean) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'role', 'authenticated',
    'aal', 'aal2', 'amr', json_build_array(json_build_object('method', 'totp',
      'timestamp', extract(epoch from now() - case when p_fresh then interval '1 hour' else interval '25 hours' end)::bigint)))::text, true);
end;
$$;
-- The server (the Edge Functions' key): no person in the claims.
create function pg_temp.as_server() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
end;
$$;
create function pg_temp.refusal(p_sql text) returns text language plpgsql as $$
declare
  v_message text;
begin
  execute p_sql;
  return 'not refused';
exception when others then
  get stacked diagnostics v_message = message_text;
  return v_message;
end;
$$;
grant execute on function pg_temp.as_user(text) to authenticated;
grant execute on function pg_temp.as_admin(boolean) to authenticated;
grant execute on function pg_temp.as_server() to authenticated;
grant execute on function pg_temp.refusal(text) to authenticated;

delete from app_private.didit_sessions where user_id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333');
delete from public.identity_verifications where user_id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333');
delete from public.age_checks where user_id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333');
delete from app_private.rate_counters;
update public.app_settings set enabled = false where key = 'verification_required';
create temp table app as select value #>> '{}' as id from app_private.settings where key = 'didit_application_id';
grant select on app to authenticated;

-- 1. What Dzirent keeps, and who reads it -----------------------------------------------------------
select is((select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns
           where table_schema = 'public' and table_name = 'identity_verifications'),
  'user_id,status,provider_session_id,legal_name,is_adult,attempts,reason,verified_at,created_at,updated_at',
  'identity_verifications holds no birthdate, document, address, nationality, image or IP column');
select is((select count(*)::int from information_schema.columns where table_schema = 'app_private' and table_name in ('didit_sessions', 'didit_events')
           and column_name ~ '(birth|document|address|nationality|ip|image|selfie|payload|name)'), 0,
  'the closed Didit tables hold none of those either');
select results_eq($$select key, value #>> '{}', value_type, area from app_private.settings
                    where key in ('didit_workflow_id', 'didit_application_id', 'id_verification_max_attempts') order by key$$,
  $$values ('didit_application_id', 'dd05b583-4e74-405d-8b3c-f0da541218b1', 'uuid', 'verification'),
           ('didit_workflow_id', '7051bbe4-0793-49c0-a9a3-39483e7af5da', 'uuid', 'verification'),
           ('id_verification_max_attempts', '3', 'integer', 'verification')$$,
  'the Didit workflow and application ids and the attempts limit are settings');
select alike(pg_temp.refusal($$update app_private.settings set value = '"not-an-id"'::jsonb where key = 'didit_workflow_id'$$),
  'DZ-E5072:%', 'a workflow id that isn''t an id is refused');
select is(pg_temp.refusal($$update app_private.settings set value = '11'::jsonb where key = 'id_verification_max_attempts'$$),
  'DZ-E5070: Enter a value from 1 to 10 (checks per person).', 'the attempts limit is 1 to 10');

-- 2. Status mapping (Didit's strings, case-sensitive) ------------------------------------------------
select results_eq($$select app_private.didit_status_map(s) from unnest(array['Approved', 'Declined', 'In Review', 'Not Started',
                    'In Progress', 'Awaiting User', 'Resubmitted', 'Abandoned', 'Expired', 'Kyc Expired', 'approved', 'KYC Expired']) s$$,
  $$values ('verified'), ('declined'), ('in_review'), ('in_progress'), ('in_progress'), ('in_progress'), ('in_progress'),
           ('expired'), ('expired'), ('expired'), (null::text), (null::text)$$,
  'every Didit status maps as decided; other spellings are unknown');

-- 3. Starting, with verification_required off -----------------------------------------------------------
select pg_temp.as_server();
select is((public.didit_start_prepare('33333333-3333-4333-8333-333333333333') ->> 'workflow_id'), '7051bbe4-0793-49c0-a9a3-39483e7af5da',
  'starting works with the flag off and uses the workflow from the settings');
select is((public.didit_start_record('33333333-3333-4333-8333-333333333333', 'sess-u3-first-0001') ->> 'status'), 'in_progress',
  'a started check is in progress');
select is((select attempts from public.identity_verifications where user_id = '33333333-3333-4333-8333-333333333333'), 1, 'one attempt used');
select public.didit_start_prepare('33333333-3333-4333-8333-333333333333');
select public.didit_start_release('33333333-3333-4333-8333-333333333333');
select is((select attempts from public.identity_verifications where user_id = '33333333-3333-4333-8333-333333333333'), 1,
  'an attempt whose session couldn''t be created is given back');

set local role authenticated;
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
select results_eq($$select status from public.identity_verifications$$, $$values ('in_progress')$$, 'the owner reads their status');
select throws_ok($$select legal_name from public.identity_verifications$$, '42501', null, 'the owner can''t read the legal name');
select throws_ok($$select provider_session_id from public.identity_verifications$$, '42501', null, 'the owner can''t read the session id');
select throws_ok($$update public.identity_verifications set status = 'verified'$$, '42501', null, 'the owner can''t change the check');
select throws_ok($$insert into public.identity_verifications (user_id, status) values ('33333333-3333-4333-8333-333333333333', 'verified')$$,
  '42501', null, 'the owner can''t write a check');
select throws_ok($$select * from app_private.didit_sessions$$, '42501', null, 'the sessions table is closed');
select throws_ok($$select public.didit_start_prepare('33333333-3333-4333-8333-333333333333')$$, '42501', null,
  'people can''t call the server steps');
update public.profiles set is_verified = true where id = '33333333-3333-4333-8333-333333333333';
select is((select is_verified from public.profiles where id = '33333333-3333-4333-8333-333333333333'), false, 'the owner can''t set the badge');
select is((public.my_verification() ->> 'attempts_left')::int, 2, 'my_verification: 2 of 3 checks left');
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select is((select count(*)::int from public.identity_verifications), 0, 'another person''s check isn''t visible');
reset role;

-- The attempts limit.
select pg_temp.as_server();
update public.identity_verifications set attempts = 3 where user_id = '33333333-3333-4333-8333-333333333333';
select alike(pg_temp.refusal($$select public.didit_start_prepare('33333333-3333-4333-8333-333333333333')$$), 'DZ-E6003:%',
  'after the attempts limit: "Contact support to verify."');
set local role authenticated;
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
select is((public.my_verification() ->> 'can_start')::boolean, false, 'my_verification: no new check');
reset role;
select pg_temp.as_server();
update public.identity_verifications set attempts = 1 where user_id = '33333333-3333-4333-8333-333333333333';

-- 4. Webhook events ---------------------------------------------------------------------------------
select alike(pg_temp.refusal($$select public.didit_webhook_received(gen_random_uuid(), 'status.updated', '00000000-0000-4000-8000-000000000000',
  'sess-u3-first-0001', '33333333-3333-4333-8333-333333333333', 'Approved', 100)$$), 'DZ-E6009:%', 'another application''s event is refused');
select is((select count(*)::int from app_private.didit_events where session_id = 'sess-u3-first-0001'), 0, '... and not recorded');
create temp table ev as select gen_random_uuid() as id;
select is((public.didit_webhook_received((select id from ev), 'status.updated', (select id from app), 'sess-u3-first-0001',
  '33333333-3333-4333-8333-333333333333', 'In Progress', 100) ->> 'result'), 'unchanged', 'an In Progress event: status only');
select is((public.didit_webhook_received((select id from ev), 'status.updated', (select id from app), 'sess-u3-first-0001',
  '33333333-3333-4333-8333-333333333333', 'Approved', 101) ->> 'result'), 'duplicate', 'the same event id again is processed once');
select is((select count(*)::int from app_private.didit_events where event_id = (select id from ev)), 1, '... and recorded once');
select is((public.didit_webhook_received(gen_random_uuid(), 'status.updated', (select id from app), 'sess-u3-first-0001',
  '22222222-2222-4222-8222-222222222222', 'Approved', 102) ->> 'result'), 'wrong_person', 'an event for another person''s session changes nothing');
select is((public.didit_webhook_received(gen_random_uuid(), 'status.updated', (select id from app), 'sess-nobody-0000001',
  '33333333-3333-4333-8333-333333333333', 'Approved', 103) ->> 'result'), 'unknown_session', 'a session Dzirent didn''t start changes nothing');
select is((public.didit_webhook_received(gen_random_uuid(), 'status.updated', (select id from app), 'sess-u3-first-0001',
  '33333333-3333-4333-8333-333333333333', 'Approved', 104) ->> 'result'), 'queued', 'Approved queues a decision check');
select is((select count(*)::int from app_private.async_jobs where kind = 'didit_sync' and payload ->> 'session_id' = 'sess-u3-first-0001'), 1,
  '... through the outbox (didit_sync)');
select is((public.didit_webhook_received(gen_random_uuid(), 'status.updated', (select id from app), 'sess-u3-first-0001',
  '33333333-3333-4333-8333-333333333333', 'In Progress', 90) ->> 'result'), 'older', 'an event older than the last one changes nothing');

-- 5. Decisions -------------------------------------------------------------------------------------
-- A duplicate face goes to review (no badge).
select is((public.didit_apply_decision('sess-u3-first-0001', 'Approved', 'Jordan Q Bell', true, true, null) ->> 'result'), 'in_review',
  'an approved ID with a duplicate face goes to review');
select results_eq($$select status, reason, legal_name is not null from public.identity_verifications where user_id = '33333333-3333-4333-8333-333333333333'$$,
  $$values ('in_review', 'Possible duplicate account', true)$$, '... with the reason "Possible duplicate account"');
select is((select is_verified from public.profiles where id = '33333333-3333-4333-8333-333333333333'), false, '... and no badge');
select alike(pg_temp.refusal($$select public.didit_start_prepare('33333333-3333-4333-8333-333333333333')$$), 'DZ-E6005:%',
  'no new check while one is in review');

-- Test user 1: approved, 18 or older.
select public.didit_start_prepare('11111111-1111-4111-8111-111111111111');
select public.didit_start_record('11111111-1111-4111-8111-111111111111', 'sess-u1-first-0001');
select is((public.didit_apply_decision('sess-u1-first-0001', 'Approved', 'Elena Rostova', true, false, null) ->> 'result'), 'verified',
  'an approved ID is verified');
select is((select is_verified from public.profiles where id = '11111111-1111-4111-8111-111111111111'), true, 'the badge is on');
select results_eq($$select source, result, platform from public.age_checks where user_id = '11111111-1111-4111-8111-111111111111'$$,
  $$values ('id_verification', 'adult', 'server')$$, 'an 18+ age check from the ID');
select alike(pg_temp.refusal($$select public.didit_start_prepare('11111111-1111-4111-8111-111111111111')$$), 'DZ-E6004:%',
  'a verified person isn''t asked again');

-- The badge through the shop window.
select pg_temp.as_server();
set local role anon;
select ok((select bool_and(is_verified) from public.browse_listings(p_limit => 30) where studio_handle = 'studiorostova')
  and (select bool_and(not is_verified) from public.browse_listings(p_limit => 30) where studio_handle = 'ateliermaya'),
  'listing cards show the badge for the verified lender only');
select is((select is_verified from public.get_listing('2fe0cfa6-a95e-4994-bbe4-f1bfb6760490')), true, 'the listing page shows it');
reset role;
set local role authenticated;
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
select results_eq($$select s.is_verified, (select bool_and((x ->> 'is_verified')::boolean) from jsonb_array_elements(s.listings) x)
                    from public.get_studio('studiorostova') s$$, $$values (true, true)$$, 'the studio page and its cards show it');
select ok(public.start_conversation('2fe0cfa6-a95e-4994-bbe4-f1bfb6760490') is not null, 'with the flag off an unverified person starts a chat');
select is((select other_is_verified from public.my_conversations() where listing_id = '2fe0cfa6-a95e-4994-bbe4-f1bfb6760490'), true,
  'the chat header shows the other person''s badge');
reset role;

-- KYC expiry removes the badge.
select pg_temp.as_server();
select is((public.didit_webhook_received(gen_random_uuid(), 'status.updated', (select id from app), 'sess-u1-first-0001',
  '11111111-1111-4111-8111-111111111111', 'Kyc Expired', 200) ->> 'result'), 'expired', 'Kyc Expired: expired');
select is((select is_verified from public.profiles where id = '11111111-1111-4111-8111-111111111111'), false, '... and the badge is gone');
update public.identity_verifications set status = 'verified' where user_id = '11111111-1111-4111-8111-111111111111';

-- Declined: no name, no 18+ result, a reason for admins.
select public.didit_start_prepare('22222222-2222-4222-8222-222222222222');
select public.didit_start_record('22222222-2222-4222-8222-222222222222', 'sess-u2-first-0001');
select is((public.didit_apply_decision('sess-u2-first-0001', 'Declined', 'Maya Lin', true, false, 'Declined by the verification provider (LOW_FACE_MATCH_SIMILARITY)') ->> 'result'),
  'declined', 'a declined ID is declined');
select results_eq($$select legal_name, is_adult, reason from public.identity_verifications where user_id = '22222222-2222-4222-8222-222222222222'$$,
  $$values (null::text, null::boolean, 'Declined by the verification provider (LOW_FACE_MATCH_SIMILARITY)')$$,
  '... with no name or 18+ result kept');

-- A minor's approved ID blocks the account (and outranks a later store signal).
select public.didit_start_prepare('22222222-2222-4222-8222-222222222222');
select public.didit_start_record('22222222-2222-4222-8222-222222222222', 'sess-u2-second-001');
select is((public.didit_apply_decision('sess-u2-second-001', 'Approved', 'Maya Lin', false, false, null) ->> 'result'), 'declined',
  'an approved ID of someone under 18 is declined');
select is(app_private.age_blocked('22222222-2222-4222-8222-222222222222'), true, 'the minor result blocks the account');
select is((select count(*)::int from public.listings where lender_id = '22222222-2222-4222-8222-222222222222' and status = 'active'), 0,
  '... and pauses its listings');
set local role authenticated;
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select is(public.record_age_check('store_signal', 'adult', 'android'), true, 'a store''s adult doesn''t lift an ID''s minor');
select alike(pg_temp.refusal($$update public.profiles set display_name = 'Someone else' where id = '22222222-2222-4222-8222-222222222222'$$),
  'DZ-E1030:%', 'the blocked account can''t write');
select alike(pg_temp.refusal($$select public.record_age_check('id_verification', 'adult', 'android')$$), 'DZ-E1031:%',
  'apps can''t record an ID age check');
reset role;

-- 6. The gate: only while verification_required is on ---------------------------------------------------
select pg_temp.as_server();
update public.app_settings set enabled = true where key = 'verification_required';
set local role authenticated;
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
select alike(pg_temp.refusal($$select public.start_conversation('3cd2a771-2f4e-4ee5-b0c5-18295ef5999f')$$), 'DZ-E6001:%',
  'flag on: an unverified person can''t start a chat');
select alike(pg_temp.refusal($$insert into public.messages (conversation_id, sender_id, body)
  select c.id, '33333333-3333-4333-8333-333333333333', 'Hello' from public.conversations c
  where c.listing_id = '2fe0cfa6-a95e-4994-bbe4-f1bfb6760490' and c.renter_id = '33333333-3333-4333-8333-333333333333'$$), 'DZ-E6001:%',
  'flag on: ... or send a message');
select is((public.my_verification() ->> 'required')::boolean, true, 'my_verification says verification is required');
reset role;
select pg_temp.as_server();
update public.identity_verifications set status = 'expired' where user_id = '11111111-1111-4111-8111-111111111111';
set local role authenticated;
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
update public.listings set status = 'paused' where id = '3cd2a771-2f4e-4ee5-b0c5-18295ef5999f';
select alike(pg_temp.refusal($$update public.listings set status = 'active' where id = '3cd2a771-2f4e-4ee5-b0c5-18295ef5999f'$$), 'DZ-E6001:%',
  'flag on: ... or publish a listing');
select lives_ok($$update public.listings set description = 'Still a draft' where id = '3cd2a771-2f4e-4ee5-b0c5-18295ef5999f'$$,
  'flag on: editing a paused draft needs no ID check');
reset role;
select pg_temp.as_server();
update public.identity_verifications set status = 'verified' where user_id = '11111111-1111-4111-8111-111111111111';
set local role authenticated;
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select lives_ok($$update public.listings set status = 'active' where id = '3cd2a771-2f4e-4ee5-b0c5-18295ef5999f'$$,
  'flag on: a verified person publishes');
reset role;
select pg_temp.as_server();
update public.app_settings set enabled = false where key = 'verification_required';

-- 7. Admins: the queue, decisions, attempts --------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
select alike(pg_temp.refusal($$select public.admin_list_id_reviews()$$), 'DZ-E5001:%', 'a non-admin can''t see the queue');
select alike(pg_temp.refusal($$select public.admin_decide_id_verification('33333333-3333-4333-8333-333333333333', 'approve', 'Looks fine')$$),
  'DZ-E5001:%', 'a non-admin can''t decide');
select pg_temp.as_admin(false);
select alike(pg_temp.refusal($$select public.admin_reset_id_attempts('33333333-3333-4333-8333-333333333333', 'Support request')$$),
  'DZ-E5003:%', 'a stale two-step session can''t reset attempts');
select pg_temp.as_admin(true);
select ok((select bool_and(x ->> 'status' in ('in_review', 'declined') and not (x ? 'legal_name')) from jsonb_array_elements(public.admin_list_id_reviews()) x)
  and (select count(*) from jsonb_array_elements(public.admin_list_id_reviews('in_review')) x where x ->> 'user_id' = '33333333-3333-4333-8333-333333333333') = 1,
  'the queue lists checks in review and declined, never a legal name');
select is((public.admin_queues() ->> 'id_verification_reviews')::int, 1, 'the overview counts the checks in review');
select alike(pg_temp.refusal($$select public.admin_decide_id_verification('33333333-3333-4333-8333-333333333333', 'maybe', 'Looks fine')$$),
  'DZ-E6012:%', 'a decision is approve or reject');
select is((public.admin_decide_id_verification('33333333-3333-4333-8333-333333333333', 'approve', 'Checked the provider''s console') ->> 'status'), 'verified',
  'an admin approves a check in review');
select alike(pg_temp.refusal($$select public.admin_decide_id_verification('33333333-3333-4333-8333-333333333333', 'reject', 'Changed my mind')$$),
  'DZ-E6011:%', 'a verified check can''t be decided again');
select is((public.admin_reset_id_attempts('33333333-3333-4333-8333-333333333333', 'Support request') ->> 'attempts')::int, 0,
  'an admin resets the attempts');
reset role;
select pg_temp.as_server();
select results_eq($$select action, before ->> 'status', after ->> 'status' from app_private.admin_actions
                    where action in ('decide_id_verification', 'reset_id_attempts') and target_id = '33333333-3333-4333-8333-333333333333'
                      and created_at >= now() order by id$$,
  $$values ('decide_id_verification', 'in_review', 'verified'), ('reset_id_attempts', 'verified', null::text)$$,
  'both are in the admin log');
select is((select is_verified from public.profiles where id = '33333333-3333-4333-8333-333333333333'), true, 'the approved person has the badge');
select is((public.didit_apply_decision('sess-u3-first-0001', 'Approved', 'Jordan Q Bell', true, true, null) ->> 'result'), 'kept',
  'a later decision for a session an admin decided changes nothing');

-- 8. Reconciliation, account deletion, the data download --------------------------------------------------
select public.didit_start_prepare('22222222-2222-4222-8222-222222222222');
select public.didit_start_record('22222222-2222-4222-8222-222222222222', 'sess-u2-third-0001');
select is((app_private.didit_reconcile() ->> 'queued')::int, 0, 'a check started just now isn''t reconciled yet');
update public.identity_verifications set updated_at = now() - interval '31 minutes' where user_id = '22222222-2222-4222-8222-222222222222';
select is((app_private.didit_reconcile() ->> 'queued')::int, 1, 'one in progress for over 30 minutes gets a decision check');
select is((app_private.didit_reconcile() ->> 'queued')::int, 0, '... once (not again within 30 minutes)');
select results_eq($$select array(select s from unnest(public.didit_sessions_for('22222222-2222-4222-8222-222222222222')) s order by s)$$,
  $$values (array['sess-u2-first-0001', 'sess-u2-second-001', 'sess-u2-third-0001'])$$, 'delete-account gets every session to delete at Didit');
select public.didit_forget('11111111-1111-4111-8111-111111111111');
select results_eq($$select (select count(*)::int from public.identity_verifications where user_id = '11111111-1111-4111-8111-111111111111'),
                    (select count(*)::int from app_private.didit_sessions where user_id = '11111111-1111-4111-8111-111111111111'),
                    (select is_verified from public.profiles where id = '11111111-1111-4111-8111-111111111111')$$,
  $$values (0, 0, false)$$, 'then the rows and the badge go');
delete from public.data_exports where user_id = '33333333-3333-4333-8333-333333333333';
set local role authenticated;
select pg_temp.as_user('33333333-3333-4333-8333-333333333333');
select results_eq($$select e #>> '{id_verification,status}', e #> '{id_verification}' ? 'legal_name' from (select public.export_my_data() as e) x$$,
  $$values ('verified', true)$$, 'the data download includes the check (with the person''s own legal name)');
reset role;

select * from finish();
rollback;
