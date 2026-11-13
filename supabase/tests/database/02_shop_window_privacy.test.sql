-- C2 pgTAP: the shop window never returns coordinates, emails or account ids (contract.md section 1,
-- architecture Q1). Checked twice: the functions' declared result columns, and the actual rows (as
-- JSON text) for a guest and a signed-in user, against the seed's account ids, emails and listing
-- coordinates (Austin, TX: 30.2672 / -97.7431, 30.3072 / -97.756).
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- Declared result columns of every shop window function.
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('browse_listings', 'get_listing', 'get_studio', 'fit_listings', 'search_cities', 'my_saved_listings', 'my_saved_studios')
     and pg_get_function_result(p.oid) ~* '(approx_lat|approx_lng|lender_id|renter_id|email|user_id)'),
  0, 'no shop window function declares coordinates, emails or account ids');

-- What a guest gets.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
create temp table guest_rows on commit drop as
  select 'browse' as fn, to_jsonb(b)::text as row from public.browse_listings(p_lat => 30.27, p_lng => -97.74, p_limit => 30) b
  union all
  select 'listing', to_jsonb(g)::text from public.get_listing('2fe0cfa6-a95e-4994-bbe4-f1bfb6760490', 30.27, -97.74) g
  union all
  select 'cities', to_jsonb(c)::text from public.search_cities('Austin', 5) c;
reset role;
select ok((select count(*) from guest_rows where fn = 'browse') >= 12, 'guest: browse_listings returns the 12 sample pieces');
select ok((select count(*) from guest_rows where fn = 'listing') = 1, 'guest: get_listing returns the listing page');
select is((select count(*)::int from guest_rows where fn <> 'cities' and row ~ '(11111111-1111-4111-8111-111111111111|22222222-2222-4222-8222-222222222222|33333333-3333-4333-8333-333333333333|aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa)'),
  0, 'guest: no account id in any row');
select is((select count(*)::int from guest_rows where row ~* '@dzirent\.local'), 0, 'guest: no email in any row');
select is((select count(*)::int from guest_rows where fn <> 'cities' and row ~ '(30\.2672|97\.7431|30\.3072|97\.756)'), 0, 'guest: no listing coordinates, only whole-mile distances');
select ok((select bool_and((row::jsonb ->> 'distance') ~ '^[0-9]+$') from guest_rows where fn = 'browse'), 'guest: distance is whole miles');

-- What a signed-in renter gets from the signed-in parts of the shop window.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal1"}', true);
create temp table user_rows on commit drop as
  select 'studio' as fn, to_jsonb(s)::text as row from public.get_studio('studiorostova', 30.27, -97.74) s
  union all
  select 'fit', to_jsonb(f)::text from public.fit_listings(30.27, -97.74, null, 30, 0) f
  union all
  select 'saved_studios', to_jsonb(m)::text from public.my_saved_studios(30.27, -97.74, 30, 0) m;
reset role;
select ok((select count(*) from user_rows where fn = 'studio') = 1, 'signed in: get_studio returns the studio');
select ok((select count(*) from user_rows where fn = 'fit') > 0, 'signed in: fit_listings matches test user 3''s measurements');
select is((select count(*)::int from user_rows where row ~ '(11111111-1111-4111-8111-111111111111|22222222-2222-4222-8222-222222222222|aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa)'),
  0, 'signed in: no other account id in studio or fit rows');
select is((select count(*)::int from user_rows where row ~* '@dzirent\.local'), 0, 'signed in: no email');
select is((select count(*)::int from user_rows where row ~ '(30\.2672|97\.7431|30\.3072|97\.756)'), 0, 'signed in: no coordinates');

select * from finish();
rollback;
