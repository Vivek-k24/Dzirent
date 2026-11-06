-- Step 8A publish gate, duplicate check and failure path, run against dzirent-server:
--   supabase db query --linked -f supabase/tests/step8a_gate.sql
-- Run supabase/tests/step8a_scan.mjs first: it needs an allowed scan of test user 1's sample
-- listing "Emerald Velvet Cocktail Dress".
-- Everything happens in one block that always ends by raising GATE_RESULTS, so the whole
-- transaction is rolled back: vision_required is turned on only inside it and ends off, and
-- none of the test scans or listing changes stay.
do $gate$
declare
  v_listing uuid := '2fe0cfa6-a95e-4994-bbe4-f1bfb6760490';
  v_owner uuid;
  v_scan uuid;
  v_other_listing uuid;
  v_other_photo uuid;
  v_other_scan uuid;
  v_out text := '';
begin
  select l.lender_id into v_owner from public.listings l where l.id = v_listing;
  if not exists (
    select 1 from public.listing_scans s
    where s.listing_id = v_listing and s.status = 'done' and s.verdict = 'allowed'
  ) then
    raise exception 'GATE_SETUP: no allowed scan for the listing; run step8a_scan.mjs first';
  end if;

  update public.app_settings set enabled = true where key = 'vision_required';
  -- As postgres: the gate never stops server jobs or migrations.
  update public.listings set status = 'paused' where id = v_listing;
  perform pg_catalog.set_config('request.jwt.claims',
    pg_catalog.json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  -- 1. The latest scan was allowed and covers the current photos: the owner can publish.
  set local role authenticated;
  begin
    update public.listings set status = 'active' where id = v_listing;
    v_out := v_out || '1 allowed scan: published | ';
  exception when others then
    v_out := v_out || '1 allowed scan: REFUSED (' || sqlerrm || ') | ';
  end;
  reset role;

  -- 2. A newer scan of the same photos was rejected: refused.
  update public.listings set status = 'paused' where id = v_listing;
  insert into public.listing_scans (listing_id, status, verdict, reason, photo_set_hash, finished_at)
  values (v_listing, 'done', 'rejected', 'This looks like a T-shirt. Dzirent doesn''t list everyday basics like T-shirts.',
          app_private.photo_set_hash(v_listing), pg_catalog.now())
  returning id into v_scan;
  set local role authenticated;
  begin
    update public.listings set status = 'active' where id = v_listing;
    v_out := v_out || '2 rejected scan: PUBLISHED | ';
  exception when others then
    v_out := v_out || '2 rejected scan: refused (' || sqlerrm || ') | ';
  end;
  reset role;

  -- 3. An admin approves that scan: the owner can publish.
  update public.listing_scans set admin_decision = 'approved', admin_decided_at = pg_catalog.now() where id = v_scan;
  set local role authenticated;
  begin
    update public.listings set status = 'active' where id = v_listing;
    v_out := v_out || '3 admin approved: published | ';
  exception when others then
    v_out := v_out || '3 admin approved: REFUSED (' || sqlerrm || ') | ';
  end;
  reset role;

  -- 4. The photos changed after the check (the front photo moved slot): refused.
  update public.listings set status = 'paused' where id = v_listing;
  update public.listing_photos set slot = 'extra_1' where listing_id = v_listing and slot = 'front';
  set local role authenticated;
  begin
    update public.listings set status = 'active' where id = v_listing;
    v_out := v_out || '4 photos changed: PUBLISHED | ';
  exception when others then
    v_out := v_out || '4 photos changed: refused (' || sqlerrm || ') | ';
  end;
  reset role;
  update public.listing_photos set slot = 'front' where listing_id = v_listing and slot = 'extra_1';

  -- 5. A new listing can't start out active while the flag is on.
  set local role authenticated;
  begin
    insert into public.listings (lender_id, title, category, approx_lat, approx_lng)
    values (v_owner, 'Gate test', 'Everyday', 30.27, -97.74);
    v_out := v_out || '5 new active listing: CREATED | ';
  exception when others then
    v_out := v_out || '5 new active listing: refused (' || sqlerrm || ') | ';
  end;
  reset role;

  -- 6. With the flag off nothing is blocked, even with a rejected latest scan.
  update public.listing_scans set admin_decision = null, admin_decided_at = null where id = v_scan;
  update public.app_settings set enabled = false where key = 'vision_required';
  set local role authenticated;
  begin
    update public.listings set status = 'active' where id = v_listing;
    v_out := v_out || '6 flag off, rejected scan: published | ';
  exception when others then
    v_out := v_out || '6 flag off, rejected scan: REFUSED (' || sqlerrm || ') | ';
  end;
  reset role;

  -- 7. Another lender's listing gets a photo with the same fingerprint as this listing's photo:
  -- an allowed result becomes review.
  select l.id, p.id into v_other_listing, v_other_photo
    from public.listings l join public.listing_photos p on p.listing_id = l.id
    where l.lender_id <> v_owner
    order by l.created_at, p.position limit 1;
  delete from public.listing_scans where listing_id = v_other_listing and status in ('queued', 'running');
  insert into public.listing_scans (listing_id, status, started_at) values (v_other_listing, 'running', pg_catalog.now())
    returning id into v_other_scan;
  perform public.vision_finish_scan(v_other_scan, pg_catalog.repeat('0', 64), pg_catalog.jsonb_build_object(
    'verdict', 'allowed', 'reason', 'This looks like a dress. You can list it.', 'item_key', 'day_dress',
    'suggestions', pg_catalog.jsonb_build_object('title', 'Dress'),
    'photos', pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'photo_id', v_other_photo, 'ok', true, 'decision', 'allowed', 'labels', '{}'::jsonb, 'warnings', '[]'::jsonb,
      'fingerprint', (select ps.fingerprint::text::jsonb from public.photo_scans ps
                      where ps.listing_id = v_listing order by ps.scanned_at desc limit 1)))));
  v_out := v_out || '7 duplicate photo: ' ||
    (select s.verdict || ' - ' || s.reason from public.listing_scans s where s.id = v_other_scan) || ' | ';

  -- 8. A failure (what scan-listing calls on any error): failed, and the verdict is review.
  insert into public.listing_scans (listing_id, status, started_at) values (v_other_listing, 'running', pg_catalog.now())
    returning id into v_other_scan;
  perform public.vision_fail_scan(v_other_scan, 'vision_timeout');
  v_out := v_out || '8 failure: ' ||
    (select s.status || ' / ' || s.verdict || ' - ' || s.reason || ' (' || s.error || ')'
     from public.listing_scans s where s.id = v_other_scan);

  raise exception 'GATE_RESULTS %', v_out;
end;
$gate$;
