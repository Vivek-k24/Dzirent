-- C2 pgTAP: every refusal carries its DZ code (contracts/error-codes.json, C1).
-- 1. Structural: no function in public or app_private raises a literal message without a code.
-- 2. One refusal per family, through the API roles, with the field in the HINT where named.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'app_private') and p.prokind = 'f'
     and pg_get_functiondef(p.oid) ~* $re$raise\s+exception\s+'(?!DZ-[EW][0-9]{4}: )$re$),
  0, 'every raise exception literal starts with a DZ code');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'app_private') and p.prokind = 'f'
     and pg_get_functiondef(p.oid) ~* $re$raise\s+exception\s+using[^;]*message\s*=\s*'(?!DZ-[EW][0-9]{4}: )$re$),
  0, 'every raise ... using message literal starts with a DZ code');

-- The message and hint of a refused statement, as "message | hint".
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
grant execute on function pg_temp.refusal(text) to anon, authenticated;
-- A clean start for the once-a-day export (another suite may have exported today).
delete from public.data_exports where user_id = '33333333-3333-4333-8333-333333333333';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal1"}', true);
-- 1xxx account
select is(pg_temp.refusal($$select public.accept_legal('tv')$$), 'DZ-E1011: Invalid platform | platform', '1xxx: DZ-E1011 with hint platform');
select alike(pg_temp.refusal($$select public.record_age_check('phone', 'adult', 'web')$$), 'DZ-E1031: %', '1xxx: DZ-E1031');
-- 2xxx listings
select alike(pg_temp.refusal($$select public.record_listing_declaration('2fe0cfa6-a95e-4994-bbe4-f1bfb6760490', 1)$$), 'DZ-E2001: Not your listing%', '2xxx: DZ-E2001');
select is(pg_temp.refusal($$select public.record_accessory_declaration(' ', 1, 'pgtap')$$), 'DZ-E2041: Type your full legal name | full_legal_name', '2xxx: DZ-E2041 with hint full_legal_name');
-- 3xxx chat
select is(pg_temp.refusal($$select public.set_conversation_dates('00000000-0000-0000-0000-000000000000', '2026-12-05', '2026-12-01')$$), 'DZ-E3006: Invalid dates | dates', '3xxx: DZ-E3006 with hint dates');
-- 5xxx admin
select alike(pg_temp.refusal($$select public.admin_metrics()$$), 'DZ-E5001: Admins only%', '5xxx: DZ-E5001');
select alike(pg_temp.refusal($$select public.report_user('studiorostova', '', null)$$), 'DZ-E5013: Reason is required | reason', '5xxx: DZ-E5013 with hint reason');
-- 7xxx data download: the second export within a day
select lives_ok($$select public.export_my_data()$$, '7xxx: the first export works');
select alike(pg_temp.refusal($$select public.export_my_data()$$), 'DZ-E7001: You can download your data once a day. Try again after %', '7xxx: DZ-E7001 with the time');
reset role;

-- Text filter (2xxx, field in the hint) as the owner.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}', true);
select is(pg_temp.refusal($$update public.listings set title = 'Velvet dress, call 512-555-0123' where id = '2fe0cfa6-a95e-4994-bbe4-f1bfb6760490'$$),
  'DZ-E2050: Please remove contact details from your listing; people can message you in Dzirent. | title', '2xxx: text filter DZ-E2050 with hint title');
select alike(pg_temp.refusal($$select public.start_conversation('2fe0cfa6-a95e-4994-bbe4-f1bfb6760490')$$), 'DZ-E3004: %', '3xxx: DZ-E3004 for one''s own listing');
reset role;

select * from finish();
rollback;
