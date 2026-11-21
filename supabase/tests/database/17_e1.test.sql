-- E1 pgTAP: finished profiles and their gate, the email flag, Resend's events, the one-click
-- unsubscribe and the website's sign-in email limits.
--  - Every existing profile is finished; a Google-like sign-up (no 18+ tick, no name) isn't, a
--    form sign-up is. Apps can't write profile_completed_at or the email flag.
--  - An unfinished profile can't publish, start a chat, message or request a rental (DZ-E1078),
--    whatever the client shows; saving and drafts still work. complete_profile checks the 18+
--    tick, the name and the location, then the account can.
--  - email_event_record: a hard bounce or a complaint flags the address once per event; a
--    temporary bounce and an unknown address change nothing; a new address clears the flag.
--  - auth_email_allowed: 3 an hour per address, 20 an hour per network address.
begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

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
grant execute on function pg_temp.refusal(text) to anon, authenticated, service_role;

-- 1. The new fields --------------------------------------------------------------------------------
select has_column('public', 'profiles', 'profile_completed_at', 'profiles has profile_completed_at');
select has_column('public', 'profiles', 'email_status', 'profiles has email_status');
select is((select count(*)::int from public.profiles where profile_completed_at is null), 0,
  'every existing profile counts as finished (nobody is locked out)');

-- A Google sign-up brings a name and an email only; a form sign-up the 18+ tick and the name.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated',
   'e1-google@dzirent.local', '', now(), '{"provider":"google","providers":["google"]}',
   '{"full_name":"Gia Google","name":"Gia Google","email_verified":true}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '55555555-5555-4555-8555-555555555555', 'authenticated', 'authenticated',
   'e1-form@dzirent.local', '', now(), '{"provider":"email","providers":["email"]}',
   '{"display_name":"Fran Form","role":"renter","adult_confirmed":true}'::jsonb, now(), now(), '', '', '', '');
select ok((select profile_completed_at is null and display_name = '' and not adult_confirmed from public.profiles
           where id = '44444444-4444-4444-8444-444444444444'), 'a Google sign-up starts unfinished, with no name and no 18+ tick');
select ok((select profile_completed_at is not null from public.profiles where id = '55555555-5555-4555-8555-555555555555'),
  'a sign-up form with the 18+ tick and a name is finished');

-- Apps can't mark themselves finished or clear the email flag.
update public.profiles set email_status = 'bounced', email_status_at = now() where id = '55555555-5555-4555-8555-555555555555';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated","aal":"aal1"}', true);
update public.profiles set profile_completed_at = now(), adult_confirmed = true, display_name = 'Gia' where id = '44444444-4444-4444-8444-444444444444';
select ok((select profile_completed_at is null from public.profiles where id = '44444444-4444-4444-8444-444444444444'),
  'an app can''t write profile_completed_at (the trigger keeps it)');
select set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated","aal":"aal1"}', true);
update public.profiles set email_status = 'ok', email_status_at = null where id = '55555555-5555-4555-8555-555555555555';
select is((select email_status from public.profiles where id = '55555555-5555-4555-8555-555555555555'), 'bounced',
  'an app can''t clear its email flag');
reset role;

-- 2. The gate --------------------------------------------------------------------------------------
-- Test user 3 (Jordan Bell, terms accepted) opens a chat while finished, then is unfinished again.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal1"}', true);
create temp table chat on commit drop as select public.start_conversation('2fe0cfa6-a95e-4994-bbe4-f1bfb6760490') as id;
reset role;
grant select on chat to authenticated;
update public.profiles set profile_completed_at = null where id = '33333333-3333-4333-8333-333333333333';
create temp table d on commit drop as select (now() at time zone 'America/Chicago')::date as today;
grant select on d to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal1"}', true);
select is(pg_temp.refusal($$insert into public.listings (lender_id, title, category, approx_lat, approx_lng, price_usd, status)
  values ('33333333-3333-4333-8333-333333333333', 'E1 gate test', 'Everyday', 30.3, -97.7, 10, 'active')$$),
  'DZ-E1078: Finish your profile first. | profile', 'an unfinished profile can''t publish a listing (DZ-E1078)');
select is(pg_temp.refusal($$select public.start_conversation('a7417052-55ff-4cb8-b49d-054a69a6e719')$$),
  'DZ-E1078: Finish your profile first. | profile', 'or start a chat');
select is(pg_temp.refusal($$insert into public.messages (conversation_id, sender_id, body) select id, '33333333-3333-4333-8333-333333333333', 'hi' from chat$$),
  'DZ-E1078: Finish your profile first. | profile', 'or send a message');
select is(pg_temp.refusal($$select public.request_rental('2fe0cfa6-a95e-4994-bbe4-f1bfb6760490', (select today + 30 from d), (select today + 31 from d))$$),
  'DZ-E1078: Finish your profile first. | profile', 'or request a rental');
select lives_ok($$insert into public.saved_listings (user_id, listing_id) values ('33333333-3333-4333-8333-333333333333', 'a7417052-55ff-4cb8-b49d-054a69a6e719')$$,
  'saving a piece still works');
select lives_ok($$insert into public.listings (lender_id, title, category, approx_lat, approx_lng, status)
  values ('33333333-3333-4333-8333-333333333333', 'E1 draft', 'Everyday', 30.3, -97.7, 'paused')$$,
  'a private draft still saves');

-- complete_profile's own checks.
select is(pg_temp.refusal($$select public.complete_profile('Jordan Bell', false)$$),
  'DZ-E1079: Confirm that you are 18 or older. | adult', 'complete_profile needs the 18+ tick (DZ-E1079)');
select is(pg_temp.refusal($$select public.complete_profile('   ', true)$$),
  'DZ-E1080: Enter your name (up to 80 characters). | display_name', 'and a name (DZ-E1080)');
select is(pg_temp.refusal($$select public.complete_profile(repeat('x', 81), true)$$),
  'DZ-E1080: Enter your name (up to 80 characters). | display_name', 'of at most 80 characters');
select is(pg_temp.refusal($$select public.complete_profile('Jordan Bell', true, 'Austin, TX', 30.27, null)$$),
  'DZ-E1082: Pick your city from the list. | city', 'a location needs both coordinates (DZ-E1082)');
select is(pg_temp.refusal($$select public.complete_profile('Jordan Bell', true, 'Nowhere, ZZ', 95, 10)$$),
  'DZ-E1082: Pick your city from the list. | city', 'and coordinates on Earth');
select is(pg_temp.refusal($$select public.complete_profile('Contact me at jordan@example.com', true)$$),
  'DZ-E1051: Please remove contact details from your profile; people can message you in Dzirent. | display_name',
  'the profile text filter still checks the name');
select ok((public.complete_profile(' Jordan Bell ', true, 'Round Rock, TX', 30.50834, -97.67889) ->> 'profile_completed_at') is not null,
  'complete_profile finishes the profile');
select results_eq($$select display_name, adult_confirmed, city, approx_lat, approx_lng from public.profiles where id = '33333333-3333-4333-8333-333333333333'$$,
  $$values ('Jordan Bell'::text, true, 'Round Rock, TX'::text, 30.51::double precision, -97.68::double precision)$$,
  'with the trimmed name, the 18+ tick and the location rounded like sign-up');
select lives_ok($$insert into public.messages (conversation_id, sender_id, body) select id, '33333333-3333-4333-8333-333333333333', 'hi' from chat$$,
  'then the account can message');
reset role;
set local role anon;
select is(pg_temp.refusal($$select public.complete_profile('x', true)$$), 'permission denied for function complete_profile | ',
  'guests can''t call complete_profile');
reset role;

-- 3. Email events and the flag (Edge Functions only) -----------------------------------------------
select ok(not has_function_privilege('authenticated', 'public.email_event_record(text, text, text, text[], text)', 'execute')
          and not has_function_privilege('authenticated', 'public.email_unsubscribe(uuid)', 'execute'),
  'signed-in people can''t record email events or unsubscribe others');
set local role service_role;
select is(public.email_event_record('evt-e1-1', 'email.bounced', 're-e1-1', array['test2@dzirent.local'], 'Permanent'), 'flagged_bounced',
  'a hard bounce flags the account with that address');
select is(public.email_event_record('evt-e1-1', 'email.bounced', 're-e1-1', array['test2@dzirent.local'], 'Permanent'), 'duplicate',
  'the same event is recorded once');
select is(public.email_event_record('evt-e1-2', 'email.bounced', 're-e1-2', array['TEST3@dzirent.local'], 'Temporary'), 'temporary_bounce',
  'a temporary bounce changes nothing');
select is(public.email_event_record('evt-e1-3', 'email.complained', null, array['test3@dzirent.local'], null), 'flagged_complained',
  'a spam complaint flags the address');
select is(public.email_event_record('evt-e1-4', 'email.bounced', null, array['nobody@dzirent.local'], 'Permanent'), 'no_account',
  'an address with no account changes nothing');
reset role;
select results_eq($$select id::text, email_status from public.profiles where id in ('22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333') order by id$$,
  $$values ('22222222-2222-4222-8222-222222222222', 'bounced'), ('33333333-3333-4333-8333-333333333333', 'complained')$$,
  'the flags are on the profiles');
select is((select count(*)::int from app_private.email_events where event_id like 'evt-e1-%'), 4, 'four events kept (never the address)');
update auth.users set email = 'test2-new@dzirent.local' where id = '22222222-2222-4222-8222-222222222222';
select is((select email_status from public.profiles where id = '22222222-2222-4222-8222-222222222222'), 'ok',
  'a new email address clears the flag');

set local role service_role;
select is(public.email_unsubscribe('33333333-3333-4333-8333-333333333333'), 'unsubscribed', 'email_unsubscribe turns rental emails off');
reset role;
select is((select email_rentals from public.notification_settings where user_id = '33333333-3333-4333-8333-333333333333'), false,
  '"Email me about rentals" is off');

-- 4. The website's sign-in email limits -----------------------------------------------------------
set local role anon;
select results_eq($$select public.auth_email_allowed('recovery', '', 'limit-test@dzirent.local') from generate_series(1, 4)$$,
  $$values ('ok'), ('ok'), ('ok'), ('address_limited')$$, 'three reset emails an hour per address, for guests too');
select is((select count(*)::int from generate_series(1, 21) g
           where public.auth_email_allowed('signup_resend', '203.0.113.7', 'ip-test-' || g || '@dzirent.local') = 'ip_limited'), 1,
  'twenty an hour per network address');
select is(pg_temp.refusal($$select public.auth_email_allowed('other', '', 'x@dzirent.local')$$), 'DZ-E9016: This request isn''t valid. | ',
  'only the two kinds');
reset role;
select ok((select relrowsecurity from pg_class where oid = 'app_private.auth_email_counters'::regclass)
          and (select relrowsecurity from pg_class where oid = 'app_private.email_events'::regclass)
          and not exists (select 1 from information_schema.role_table_grants
                          where table_schema = 'app_private' and table_name in ('auth_email_counters', 'email_events')
                            and grantee in ('anon', 'authenticated', 'service_role'))
          and not exists (select 1 from app_private.auth_email_counters where key_hash !~ '^[0-9a-f]{64}$'),
  'the counters and events are closed tables (RLS, no grants) and keep only hashes');

select * from finish();
rollback;
