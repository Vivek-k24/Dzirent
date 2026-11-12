-- C2 pgTAP: database rate limits (P5A, contract.md "Current terms and rate limits").
-- Messages: 30 a minute per sender; the 31st is refused with DZ-E9001 and isn't counted.
-- Reports: 20 a day. New listings: 20 a day (drafts included).
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select is((select (value ->> 'max')::int from app_private.settings where key = 'rate_limit_message'), 30, 'messages: 30 per window');
select is((select (value ->> 'window_seconds')::int from app_private.settings where key = 'rate_limit_message'), 60, 'messages: a one-minute window');
delete from app_private.rate_counters where user_id in ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal1"}', true);
create temp table chat on commit drop as select public.start_conversation('2fe0cfa6-a95e-4994-bbe4-f1bfb6760490') as id;
select lives_ok($$
  do $do$ begin
    for i in 1..30 loop
      insert into public.messages (conversation_id, sender_id, body)
      select id, '33333333-3333-4333-8333-333333333333', 'rate test ' || i from chat;
    end loop;
  end $do$;
$$, 'messages: 30 in a minute are accepted');
select throws_like($$insert into public.messages (conversation_id, sender_id, body)
  select id, '33333333-3333-4333-8333-333333333333', 'one too many' from chat$$,
  'DZ-E9001: You''re doing that too often.%', 'messages: the 31st is refused with DZ-E9001');
reset role;
select is((select hits from app_private.rate_counters where user_id = '33333333-3333-4333-8333-333333333333' and action = 'message'),
  30, 'a refused write is not counted');

-- New listings: 20 a day, drafts included.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}', true);
select lives_ok($$
  do $do$ begin
    for i in 1..20 loop
      insert into public.listings (lender_id, title, category, approx_lat, approx_lng, price_usd, status)
      values ('11111111-1111-4111-8111-111111111111', 'Rate test draft ' || i, 'Everyday', 30.27, -97.74, 10, 'paused');
    end loop;
  end $do$;
$$, 'listings: 20 drafts in a day are accepted');
select throws_like($$insert into public.listings (lender_id, title, category, approx_lat, approx_lng, price_usd, status)
  values ('11111111-1111-4111-8111-111111111111', 'One too many', 'Everyday', 30.27, -97.74, 10, 'paused')$$,
  'DZ-E9001:%', 'listings: the 21st is refused with DZ-E9001');
reset role;

-- Server work for someone else's row is never limited (the rule keys on the caller writing their own row).
select set_config('request.jwt.claims', '', true);
select lives_ok($$insert into public.listings (lender_id, title, category, approx_lat, approx_lng, price_usd, status)
  values ('11111111-1111-4111-8111-111111111111', 'Server-made draft', 'Everyday', 30.27, -97.74, 10, 'paused')$$,
  'a server write (no signed-in caller) is not limited');

select * from finish();
rollback;
