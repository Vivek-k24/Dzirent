-- F1 pgTAP: nobody blocks or reports themselves. block_user() and report_user() skip it and write
-- nothing; a row written to the tables directly (as the apps do) is refused with DZ-E3021 /
-- DZ-E5017; someone else can still be blocked and reported. A listing draft saves unfinished
-- (no size, price or description), as Next on the photos step saves it.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

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

-- Studio Rostova (test1) owns 2fe0cfa6-...; Atelier Maya (test2) owns a7417052-....
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}', true);

-- Reporting yourself
select lives_ok($$select public.report_user('studiorostova', 'Spam', null)$$, 'report_user with your own handle does nothing');
select is((select count(*)::int from public.reports where reporter_id = '11111111-1111-4111-8111-111111111111'
           and target_user_id = '11111111-1111-4111-8111-111111111111'), 0, 'and writes no report about yourself');
select is(pg_temp.refusal($$insert into public.reports (reporter_id, target_type, target_id, reason)
                            values ('11111111-1111-4111-8111-111111111111', 'user', '11111111-1111-4111-8111-111111111111', 'Spam')$$),
          'DZ-E5017: You can''t report yourself, your own listings or your own messages. | ',
          'a report about yourself written to the table is refused (DZ-E5017)');
select is(pg_temp.refusal($$insert into public.reports (reporter_id, target_type, target_id, reason)
                            values ('11111111-1111-4111-8111-111111111111', 'listing', '2fe0cfa6-a95e-4994-bbe4-f1bfb6760490', 'Spam')$$),
          'DZ-E5017: You can''t report yourself, your own listings or your own messages. | ',
          'reporting your own listing is refused (DZ-E5017)');
select lives_ok($$insert into public.reports (reporter_id, target_type, target_id, reason)
                  values ('11111111-1111-4111-8111-111111111111', 'listing', 'a7417052-55ff-4cb8-b49d-054a69a6e719', 'Spam')$$,
                'reporting someone else''s listing still works');
select is((select target_user_id from public.reports where reporter_id = '11111111-1111-4111-8111-111111111111'
           and target_id = 'a7417052-55ff-4cb8-b49d-054a69a6e719'),
          '22222222-2222-4222-8222-222222222222'::uuid, 'and it is about the listing''s lender');

-- Blocking yourself
select lives_ok($$select public.block_user('studiorostova')$$, 'block_user with your own handle does nothing');
select is((select count(*)::int from public.blocks where blocker_id = blocked_id), 0, 'and writes no self-block');
select is(pg_temp.refusal($$insert into public.blocks (blocker_id, blocked_id)
                            values ('11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111')$$),
          'DZ-E3021: You can''t block yourself. | ', 'a self-block written to the table is refused (DZ-E3021)');
select lives_ok($$insert into public.blocks (blocker_id, blocked_id)
                  values ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222')$$,
                'blocking someone else still works');
select is(pg_temp.refusal($$update public.blocks set blocked_id = blocker_id
                            where blocker_id = '11111111-1111-4111-8111-111111111111'$$),
          'DZ-E3021: You can''t block yourself. | ', 'and a block can''t be changed into a self-block');

-- A listing draft saves unfinished (paused, the placeholder title, no size, price or description).
select lives_ok($$insert into public.listings (id, lender_id, title, category, city, approx_lat, approx_lng, status)
                  values ('f1f1f1f1-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
                          'New listing (draft)', 'Everyday', 'Austin, TX', 30.2672, -97.7431, 'paused')$$,
                'a paused draft without size, price or description saves');
select is((select size_label is null and price_usd is null and description is null
           from public.listings where id = 'f1f1f1f1-0000-4000-8000-000000000001'),
          true, 'with its size, price and description empty');
select lives_ok($$update public.listings set title = 'Navy linen blazer', category = 'Career & Professional', size_label = null
                  where id = 'f1f1f1f1-0000-4000-8000-000000000001'$$,
                'the details step''s save keeps it unfinished (still no size)');

select * from finish();
rollback;
