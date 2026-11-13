-- P5A security hardening (2026-11-10).
-- 1. Current Terms of Use and Privacy Policy required, in the database, before a person publishes a
--    listing, starts a chat, sends a message, saves a piece or studio, or files a report. Reading
--    stays allowed.
-- 2. Rate limits (app_private.settings, one helper, one small closed counter table): messages,
--    new chats, reports, new listings, photo checks.
-- 3. Chat messages are no longer filtered (owner decision). Listings, profiles and reports keep
--    the filter exactly as it is.
-- 4. listing-photos uploads: JPEG, PNG or WebP only, at most 10 MB, only at
--    {listing_id}/{random}.jpg for a listing the uploader owns.
-- 5. Covering indexes for the 11 foreign keys the Performance Advisor listed.

-- 1. Terms. Raises the plain refusal while [p_user] hasn't accepted the current version of both
-- documents (legal_documents). The same rule as needs_legal_acceptance().
create or replace function app_private.require_current_terms(p_user uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if exists (
    select 1 from public.legal_documents d
    where not exists (
      select 1 from public.legal_acceptances a
      where a.user_id = p_user and a.document = d.document and a.version = d.version
    )
  ) then
    raise exception using errcode = 'P0001',
      message = 'Please accept the updated Terms of Use and Privacy Policy to continue.';
  end if;
end;
$function$;

-- 2. Rate limits. One row per person and action: when the window started and how many writes it
-- has seen. A window starts at the first write after the previous one ended. Closed to every API
-- role; only the elevated helpers below read and write it. Removed with the account.
create table app_private.rate_counters (
  user_id uuid not null,
  action text not null,
  window_started_at timestamp with time zone not null,
  hits integer not null,
  constraint rate_counters_pkey primary key (user_id, action),
  constraint rate_counters_user_id_fkey foreign key (user_id)
    references public.profiles(id) on delete cascade,
  constraint rate_counters_action_check
    check (action in ('message', 'new_chat', 'report', 'new_listing', 'photo_scan'))
);
alter table app_private.rate_counters enable row level security;
revoke all on app_private.rate_counters from public, anon, authenticated, service_role;

-- The limits. Changed only by migrations (app_private.settings is closed to every API role).
insert into app_private.settings (key, value, note) values
  ('rate_limit_message', '{"max": 30, "window_seconds": 60}'::jsonb,
   'Chat messages a person can send per minute (P5A).'),
  ('rate_limit_new_chat', '{"max": 30, "window_seconds": 86400}'::jsonb,
   'New chats a person can start per day; reopening an existing chat does not count (P5A).'),
  ('rate_limit_report', '{"max": 20, "window_seconds": 86400}'::jsonb,
   'Reports a person can file per day (P5A).'),
  ('rate_limit_new_listing', '{"max": 20, "window_seconds": 86400}'::jsonb,
   'New listings (drafts included) a person can create per day (P5A).'),
  ('rate_limit_photo_scan', '{"max": 30, "window_seconds": 3600}'::jsonb,
   'New photo checks per lender per hour, asked for or automatic: a cost guard for the vision service (P5A; was 20).')
on conflict (key) do update set value = excluded.value, note = excluded.note, updated_at = pg_catalog.now();

-- Counts one write of [p_action] by [p_user]. True when it is within the limit; false (and not
-- counted) when the limit is reached. No setting means no limit.
create or replace function app_private.rate_limit_take(p_user uuid, p_action text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_rule jsonb;
  v_max integer;
  v_window interval;
  v_now timestamp with time zone := pg_catalog.clock_timestamp();
  v_hits integer;
begin
  select s.value into v_rule from app_private.settings s where s.key = 'rate_limit_' || p_action;
  if v_rule is null then
    return true;
  end if;
  v_max := (v_rule ->> 'max')::integer;
  v_window := pg_catalog.make_interval(secs => (v_rule ->> 'window_seconds')::double precision);

  insert into app_private.rate_counters as c (user_id, action, window_started_at, hits)
  values (p_user, p_action, v_now, 1)
  on conflict (user_id, action) do update set
    window_started_at = case when c.window_started_at <= v_now - v_window then v_now else c.window_started_at end,
    hits = case when c.window_started_at <= v_now - v_window then 1 else c.hits + 1 end
  returning c.hits into v_hits;

  if v_hits > v_max then
    update app_private.rate_counters c set hits = c.hits - 1
      where c.user_id = p_user and c.action = p_action;
    return false;
  end if;
  return true;
end;
$function$;

-- Raises the plain refusal when [p_user] reached the limit for [p_action].
create or replace function app_private.enforce_rate_limit(p_user uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not app_private.rate_limit_take(p_user, p_action) then
    raise exception using errcode = 'P0001', message = 'You''re doing that too often. Try again in a bit.';
  end if;
end;
$function$;

-- The guard on each write that needs the current terms and/or counts toward a limit. It keys on
-- the signed-in caller writing their own row, so server jobs (no user) and admins acting on someone
-- else's row are not stopped. A refused write rolls back its count too.
create or replace function app_private.terms_and_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_terms boolean := true;
  v_action text;
begin
  if v_uid is null then
    return new;
  end if;
  case tg_table_name
    when 'messages' then
      v_owner := new.sender_id;
      v_action := 'message';
    when 'conversations' then
      v_owner := new.renter_id;
      -- start_conversation upserts: reopening an existing chat is not a new chat.
      if exists (select 1 from public.conversations c
                 where c.listing_id = new.listing_id and c.renter_id = new.renter_id) then
        return new;
      end if;
      v_action := 'new_chat';
    when 'reports' then
      v_owner := new.reporter_id;
      v_action := 'report';
    when 'saved_listings', 'saved_studios' then
      v_owner := new.user_id;
    when 'listings' then
      v_owner := new.lender_id;
      if tg_op = 'INSERT' then
        v_action := 'new_listing';
      end if;
      -- Only publishing needs the terms; a private draft doesn't.
      v_terms := new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active');
    else
      return new;
  end case;
  if v_owner is distinct from v_uid then
    return new;
  end if;
  if v_terms then
    perform app_private.require_current_terms(v_uid);
  end if;
  if v_action is not null then
    perform app_private.enforce_rate_limit(v_uid, v_action);
  end if;
  return new;
end;
$function$;

create trigger terms_and_limits before insert on public.messages
  for each row execute function app_private.terms_and_limits();
create trigger terms_and_limits before insert on public.conversations
  for each row execute function app_private.terms_and_limits();
create trigger terms_and_limits before insert on public.reports
  for each row execute function app_private.terms_and_limits();
create trigger terms_and_limits before insert on public.saved_listings
  for each row execute function app_private.terms_and_limits();
create trigger terms_and_limits before insert on public.saved_studios
  for each row execute function app_private.terms_and_limits();
create trigger terms_and_limits before insert or update of status on public.listings
  for each row execute function app_private.terms_and_limits();

-- Photo checks: the cost guard moves to the shared helper (30 an hour per lender). Unchanged
-- otherwise from 20261106040000_step8b_photo_policy.sql.
create or replace function app_private.queue_scan(p_listing_id uuid, p_lender uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
  v_status text;
  v_hash text;
  v_url text;
  v_secret text;
begin
  -- Calls for one listing run one after another, so two can't both start a scan.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_listing_id::text, 8));

  -- A scan that never finished (scan-listing stopped) stops blocking after 10 minutes.
  update public.listing_scans
    set status = 'failed', verdict = 'review', error = 'timed_out', finished_at = pg_catalog.now(),
        reason = 'The photo check didn''t finish. Try again.'
    where listing_id = p_listing_id and status in ('queued', 'running')
      and created_at < pg_catalog.now() - interval '10 minutes';

  select s.id into v_id from public.listing_scans s
    where s.listing_id = p_listing_id and s.status in ('queued', 'running');
  if found then
    return v_id;
  end if;

  select s.id, s.status, s.photo_set_hash into v_id, v_status, v_hash
    from public.listing_scans s
    where s.listing_id = p_listing_id
    order by s.created_at desc
    limit 1;
  if found and v_status = 'done' and v_hash = app_private.photo_set_hash(p_listing_id) then
    return v_id;
  end if;

  -- Cost guard: rate_limit_photo_scan new checks an hour per lender (P5A).
  if not app_private.rate_limit_take(p_lender, 'photo_scan') then
    return null;
  end if;

  select ds.decrypted_secret into v_url from vault.decrypted_secrets ds where ds.name = 'scan_listing_url';
  select ds.decrypted_secret into v_secret from vault.decrypted_secrets ds where ds.name = 'scan_listing_secret';
  if v_url is null or v_secret is null then
    raise exception 'Photo checks are not set up' using errcode = 'P0001';
  end if;

  insert into public.listing_scans (listing_id) values (p_listing_id) returning id into v_id;
  -- Sent after this transaction commits. scan-listing answers at once and works in the background.
  perform net.http_post(
    url := v_url,
    body := pg_catalog.jsonb_build_object('scan_id', v_id),
    headers := pg_catalog.jsonb_build_object(
      'Content-Type', 'application/json',
      'x-scan-listing-secret', v_secret
    ),
    timeout_milliseconds := 10000
  );
  return v_id;
end;
$function$;

create or replace function public.request_scan(p_listing_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.listings l where l.id = p_listing_id and l.lender_id = v_uid) then
    raise exception 'Not your listing' using errcode = '42501';
  end if;
  if not exists (select 1 from public.listing_photos p where p.listing_id = p_listing_id) then
    raise exception 'Add a photo first' using errcode = '22023';
  end if;
  v_id := app_private.queue_scan(p_listing_id, v_uid);
  if v_id is null then
    raise exception using errcode = 'P0001', message = 'You''re doing that too often. Try again in a bit.';
  end if;
  return v_id;
end;
$function$;

-- 3. Chat messages are not filtered: no check and no logging (decisions.md "Chat (2026-11-10)").
drop trigger if exists messages_filter_text on public.messages;
drop function if exists app_private.filter_message_text();

-- check_text keeps accepting 'message' for apps already installed, and always answers null for it.
create or replace function public.check_text(p_text text, p_where text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if p_where is null or p_where not in ('listing', 'profile', 'message', 'report') then
    raise exception 'Unknown place for the text check' using errcode = '22023';
  end if;
  if pg_catalog.char_length(coalesce(p_text, '')) > 5000 then
    raise exception 'Text too long' using errcode = '22023';
  end if;
  if p_where = 'message' then
    return null;
  end if;
  return app_private.text_refusal(p_text, p_where);
end;
$function$;

-- 4. listing-photos: type and size are checked by Storage itself (the bucket), the path and owner
-- by the policies. Both clients upload JPEG to {listing_id}/{random}.jpg.
update storage.buckets
  set file_size_limit = 10485760,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
  where id = 'listing-photos';

drop policy if exists listing_photos_storage_owner_insert on storage.objects;
create policy listing_photos_storage_owner_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'listing-photos'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9_-]{16,64}\.jpg$'
    and exists (
      select 1 from public.listings l
      where l.id::text = (storage.foldername(objects.name))[1]
        and l.lender_id = (select auth.uid())
    )
  );

drop policy if exists listing_photos_storage_owner_update on storage.objects;
create policy listing_photos_storage_owner_update on storage.objects
  for update to authenticated using (
    bucket_id = 'listing-photos' and exists (
      select 1 from public.listings l
      where l.id::text = (storage.foldername(objects.name))[1]
        and l.lender_id = (select auth.uid())
    )
  ) with check (
    bucket_id = 'listing-photos'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9_-]{16,64}\.jpg$'
    and exists (
      select 1 from public.listings l
      where l.id::text = (storage.foldername(objects.name))[1]
        and l.lender_id = (select auth.uid())
    )
  );

-- 5. Performance Advisor: covering indexes for foreign keys.
create index if not exists blocks_blocked_id_idx on public.blocks (blocked_id);
create index if not exists legal_acceptances_document_idx on public.legal_acceptances (document);
create index if not exists listings_lender_id_idx on public.listings (lender_id);
create index if not exists messages_sender_id_idx on public.messages (sender_id);
create index if not exists rental_outcomes_user_id_idx on public.rental_outcomes (user_id);
create index if not exists rentals_listing_id_idx on public.rentals (listing_id);
create index if not exists rentals_updated_by_idx on public.rentals (updated_by);
create index if not exists reports_reporter_id_idx on public.reports (reporter_id);
create index if not exists suggestion_events_listing_id_idx on public.suggestion_events (listing_id);
create index if not exists suggestion_events_user_id_idx on public.suggestion_events (user_id);
create index if not exists user_warnings_report_id_idx on public.user_warnings (report_id);

-- Access: nothing new is callable through the API.
revoke execute on function app_private.require_current_terms(uuid) from public, anon, authenticated;
revoke execute on function app_private.rate_limit_take(uuid, text) from public, anon, authenticated;
revoke execute on function app_private.enforce_rate_limit(uuid, text) from public, anon, authenticated;
revoke execute on function app_private.terms_and_limits() from public, anon, authenticated;
revoke execute on function public.request_scan(uuid) from public, anon;
grant execute on function public.request_scan(uuid) to authenticated;
revoke execute on function public.check_text(text, text) from public;
grant execute on function public.check_text(text, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
