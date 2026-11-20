-- V1b pgTAP: costume is a garment type for listings and policy rows, policy_item_types has the
-- costume row, and vision_finish_scan keeps the vision service's new type fields with the scan's
-- suggestions (and still keeps the old ones). Everything is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- 1. The garment type ---------------------------------------------------------------------------
select ok(pg_catalog.pg_get_constraintdef((select oid from pg_constraint where conname = 'listings_garment_type_check'))
            like '%costume%', 'listings accept the garment type costume');
select ok(pg_catalog.pg_get_constraintdef((select oid from pg_constraint where conname = 'policy_item_types_garment_type_check'))
            like '%costume%', 'policy rows accept the garment type costume');
select ok(pg_catalog.pg_get_constraintdef((select oid from pg_constraint where conname = 'listings_garment_type_check'))
            like '%one_size%', 'the earlier garment types are still accepted');

-- 2. The costume policy row ----------------------------------------------------------------------
select is((select row(kind, allowed, category, item_type, garment_type, style, policy_group, reason)::text
           from public.policy_item_types where key = 'costume'),
          '(garment,t,"Occasion & Party",,costume,,,)', 'policy_item_types has the costume row, allowed, Occasion & Party');
select is((select count(*)::int from public.policy_item_types), 115, '115 policy rows, as in policy.json');

-- 3. vision_finish_scan keeps the type fields ------------------------------------------------------
create temp table v (scan_id uuid);
delete from public.listing_scans where listing_id = '2fe0cfa6-a95e-4994-bbe4-f1bfb6760490' and status in ('queued', 'running');
with started as (
  insert into public.listing_scans (listing_id, status, started_at)
    values ('2fe0cfa6-a95e-4994-bbe4-f1bfb6760490', 'running', pg_catalog.now()) returning id
)
insert into v select id from started;
select public.vision_finish_scan((select scan_id from v),
  app_private.photo_set_hash('2fe0cfa6-a95e-4994-bbe4-f1bfb6760490'),
  pg_catalog.jsonb_build_object(
    'verdict', 'allowed', 'reason', 'This looks like a cocktail dress. You can list it.', 'item_key', 'cocktail_dress',
    'suggestions', pg_catalog.jsonb_build_object('title', 'Emerald velvet cocktail dress', 'garment_type', 'dress'),
    'quality', pg_catalog.jsonb_build_object('summary', 'All photos look good.'),
    'model', pg_catalog.jsonb_build_object('id', 'Marqo/marqo-fashionSigLIP'),
    'photos', '[]'::jsonb,
    'type', pg_catalog.jsonb_build_object('qid', 'Q1512004', 'english_name', 'cocktail dress',
                                          'category', 'Occasion & Party', 'item_type', null, 'garment_type', 'dress'),
    'type_confidence', 0.8123, 'agreement', true,
    'top_types', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('qid', 'Q1512004', 'english_name', 'cocktail dress', 'allowed', true, 'score', 0.61),
      pg_catalog.jsonb_build_object('qid', 'Q7140985', 'english_name', 'party dress', 'allowed', true, 'score', 0.2)),
    'banned_score', 0.0213, 'vocabulary_version', pg_catalog.repeat('a', 64), 'service_version', 'v1b.1'));

select is((select s.suggestions->'type'->>'qid' from public.listing_scans s where s.id = (select scan_id from v)),
          'Q1512004', 'the type is kept');
select is((select (s.suggestions->>'type_confidence')::numeric from public.listing_scans s where s.id = (select scan_id from v)),
          0.8123, 'the type confidence is kept');
select is((select (s.suggestions->>'agreement')::boolean from public.listing_scans s where s.id = (select scan_id from v)),
          true, 'agreement is kept');
select is((select pg_catalog.jsonb_array_length(s.suggestions->'top_types') from public.listing_scans s where s.id = (select scan_id from v)),
          2, 'the top types are kept');
select is((select (s.suggestions->>'banned_score')::numeric || ' ' || (s.suggestions->>'service_version')
                  || ' ' || pg_catalog.length(s.suggestions->>'vocabulary_version')
           from public.listing_scans s where s.id = (select scan_id from v)),
          '0.0213 v1b.1 64', 'the banned score and both versions are kept');
select is((select s.suggestions->>'title' || ' | ' || (s.suggestions->'quality'->>'summary') || ' | ' || (s.suggestions->>'item_key')
           from public.listing_scans s where s.id = (select scan_id from v)),
          'Emerald velvet cocktail dress | All photos look good. | cocktail_dress', 'the earlier fields are kept as before');
select is((select s.status || ' ' || s.verdict from public.listing_scans s where s.id = (select scan_id from v)),
          'done allowed', 'the scan is done and allowed');

select * from finish();
rollback;
