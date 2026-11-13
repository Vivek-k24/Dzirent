-- C2 pgTAP: current terms are enforced in the database (P5A). Without an acceptance of the current
-- Terms of Use and Privacy Policy: publishing, starting a chat, sending a message, saving and
-- reporting are refused with DZ-E1010; reading stays allowed; accept_legal fixes it.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

-- Test user 3 has a chat (made while accepted); then a new terms version is published.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal1"}', true);
create temp table chat on commit drop as select public.start_conversation('2fe0cfa6-a95e-4994-bbe4-f1bfb6760490') as id;
reset role;
grant select on chat to authenticated;
update public.legal_documents set version = '9.9.9' where document = 'terms';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal1"}', true);
select ok(public.needs_legal_acceptance(), 'a new terms version: needs_legal_acceptance() is true');
select throws_like($$select public.start_conversation('a7417052-55ff-4cb8-b49d-054a69a6e719')$$, 'DZ-E1010:%', 'starting a chat is refused');
select throws_like($$insert into public.messages (conversation_id, sender_id, body) select id, '33333333-3333-4333-8333-333333333333', 'hi' from chat$$,
  'DZ-E1010:%', 'sending a message is refused');
select throws_like($$insert into public.saved_listings (user_id, listing_id) values ('33333333-3333-4333-8333-333333333333', 'a7417052-55ff-4cb8-b49d-054a69a6e719')$$,
  'DZ-E1010:%', 'saving a piece is refused');
select throws_like($$select public.report_user('studiorostova', 'Spam', null)$$, 'DZ-E1010:%', 'reporting is refused');
select ok((select count(*) from public.browse_listings()) > 0, 'reading the shop window still works');
select lives_ok($$select public.accept_legal('web')$$, 'accept_legal records the new version');
select ok(not public.needs_legal_acceptance(), 'after accepting: needs_legal_acceptance() is false');
select lives_ok($$insert into public.saved_listings (user_id, listing_id) values ('33333333-3333-4333-8333-333333333333', 'a7417052-55ff-4cb8-b49d-054a69a6e719')$$,
  'after accepting: saving works');
reset role;

-- A lender publishing without the current version is refused too.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal1"}', true);
select throws_like($$insert into public.listings (lender_id, title, category, approx_lat, approx_lng, price_usd, status)
  values ('22222222-2222-4222-8222-222222222222', 'Terms test', 'Everyday', 30.3, -97.7, 10, 'active')$$,
  'DZ-E1010:%', 'publishing a listing is refused');
reset role;

select * from finish();
rollback;
