-- C2 pgTAP: the age gate (P2C). A store signal "minor" blocks every write by the account with
-- DZ-E1030 and pauses its active listings; reading still works; a self-declared adult doesn't lift
-- it; a later store "adult" does (the listings stay paused).
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal1"}', true);
select is(public.record_age_check('store_signal', 'minor', 'android'), true, 'a store "minor" blocks the account');
select ok(public.age_blocked(), 'age_blocked() is true');
select throws_like($$insert into public.availability (listing_id, start_date, end_date) values ('a7417052-55ff-4cb8-b49d-054a69a6e719', current_date, current_date + 3)$$,
  'DZ-E1030: Dzirent is only for people 18 and older.', 'a write is refused with DZ-E1030');
select throws_like($$update public.profiles set studio_bio = 'new bio' where id = '22222222-2222-4222-8222-222222222222'$$,
  'DZ-E1030:%', 'editing the profile is refused');
select is((select count(*)::int from public.listings), 6, 'reading their own listings still works');
select is(public.record_age_check('self_declared', 'adult', 'web'), true, 'a self-declared adult doesn''t lift it');
select is(public.record_age_check('store_signal', 'adult', 'android'), false, 'a store "adult" lifts it');
reset role;
select is((select count(*)::int from public.listings where lender_id = '22222222-2222-4222-8222-222222222222' and status = 'active'), 0,
  'the account''s listings were paused when the block started');
select is((select count(*)::int from public.listings where lender_id = '22222222-2222-4222-8222-222222222222'
  and auto_paused_reason = 'Paused: Dzirent is only for people 18 and older.'), 6, 'with the plain reason, and they stay paused');

select * from finish();
rollback;
