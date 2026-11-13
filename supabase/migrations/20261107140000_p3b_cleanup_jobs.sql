-- P3B: cleanup and retention jobs.
--
-- Nine jobs. Seven only touch database rows and run as functions every night (pg_cron). Two
-- delete photo files and go through the cleanup-files Edge Function and the Storage API, like
-- delete-listing; storage rows are never deleted directly.
--
-- Every job has a count-only mode, and every run is recorded in app_private.job_runs. All jobs
-- start in count-only mode. An admin switches a job to real deletion on the admin Flags page:
-- the switch is an app_settings flag cleanup_<job> (off = count only), changed with set_flag,
-- which writes the admin log.
--
-- Never purged: the admin log (app_private.admin_actions) and copyright takedown records
-- (app_private.takedown_requests).

create extension if not exists pg_cron with schema pg_catalog;

-- 1. Retention settings (closed table app_private.settings), each with who decides.
insert into app_private.settings (key, value, note) values
  ('draft_retention_days', '60'::jsonb,
   'Abandoned drafts: listings never published and not edited for this many days are deleted with their photos. Owner decides.'),
  ('orphan_photo_days', '1'::jsonb,
   'Orphan photos: files in listing-photos with no photo row, older than this many days, are deleted. Owner decides.'),
  ('photo_check_retention_days', '90'::jsonb,
   'Old photo checks: every check except the latest per listing is deleted after this many days (with its per-photo results). Owner decides.'),
  ('data_export_retention_days', '30'::jsonb,
   'Download-my-data records (when each export ran) are deleted after this many days. Owner decides.'),
  ('age_checks_keep', '"latest"'::jsonb,
   'Age checks: only the latest per account is kept, plus the latest one that decides the age gate (a store minor or adult), so a block is never lost. Owner decides.'),
  ('suggestion_retention_days', '365'::jsonb,
   'Suggestion choices (kept, changed or cleared) are deleted after this many days. Owner decides.'),
  ('declaration_retention_years', '7'::jsonb,
   'Accessory and listing declarations (legal name, email, IP, user agent, city) are deleted after this many years. Placeholder until the attorney sets the period.'),
  ('device_token_stale_days', '90'::jsonb,
   'Notification device tokens not seen for this many days are deleted. Owner decides.')
on conflict (key) do nothing;
update app_private.settings
  set note = note || ' Attorney decides.'
  where key = 'report_retention_days' and note not like '%Attorney decides.%';

create or replace function app_private.setting_number(p_key text)
returns numeric
language sql
stable
security definer
set search_path = ''
as $function$
  select (s.value)::text::numeric from app_private.settings s where s.key = p_key;
$function$;

-- 2. When a listing was last edited and first published (for abandoned drafts). Server-written:
-- apps can't set them (the trigger decides) and they aren't in the apps' column grants.
alter table public.listings
  add column updated_at timestamp with time zone,
  add column published_at timestamp with time zone;
update public.listings set updated_at = created_at where updated_at is null;
-- Every existing listing counts as published: none of them is a draft (all 13 were active).
update public.listings set published_at = created_at where published_at is null;
alter table public.listings alter column updated_at set default pg_catalog.now();
alter table public.listings alter column updated_at set not null;

create or replace function app_private.listing_track_changes()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at := pg_catalog.now();
  if tg_op = 'INSERT' then
    new.published_at := case when new.status = 'active' then pg_catalog.now() end;
  else
    new.published_at := coalesce(old.published_at, case when new.status = 'active' then pg_catalog.now() end);
  end if;
  return new;
end;
$function$;
create trigger listings_track_changes before insert or update on public.listings
  for each row execute function app_private.listing_track_changes();

-- Adding or changing photos, measurements or dates is editing the listing too.
create or replace function app_private.listing_touch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  -- Only the timestamp changes, so the age gate (P2C) doesn't need to look at it.
  perform pg_catalog.set_config('dzirent.age_gate_skip', 'on', true);
  update public.listings set updated_at = pg_catalog.now() where id = new.listing_id;
  perform pg_catalog.set_config('dzirent.age_gate_skip', 'off', true);
  return null;
end;
$function$;
create trigger listing_photos_touch after insert or update on public.listing_photos
  for each row execute function app_private.listing_touch();
create trigger listing_measurements_touch after insert or update on public.listing_measurements
  for each row execute function app_private.listing_touch();
create trigger availability_touch after insert or update on public.availability
  for each row execute function app_private.listing_touch();

-- 3. Job runs (closed: only the job functions write it; admins read it through admin_cleanup_status).
create table app_private.job_runs (
  id bigint generated always as identity,
  job text not null,
  mode text not null,
  counts jsonb,
  error text,
  started_at timestamp with time zone not null,
  finished_at timestamp with time zone default pg_catalog.now() not null,
  constraint job_runs_pkey primary key (id),
  constraint job_runs_mode_check check (mode in ('count', 'delete')),
  constraint job_runs_job_check check (job in (
    'abandoned_drafts', 'orphan_photos', 'old_photo_checks', 'expired_reports', 'old_data_exports',
    'old_age_checks', 'old_suggestion_choices', 'old_declarations', 'stale_device_tokens'))
);
create index job_runs_job_idx on app_private.job_runs using btree (job, id desc);
alter table app_private.job_runs enable row level security;
revoke all on app_private.job_runs from public, anon, authenticated, service_role;

create or replace function app_private.record_job_run(
  p_job text, p_mode text, p_counts jsonb, p_error text, p_started_at timestamp with time zone)
returns void
language sql
security definer
set search_path = ''
as $function$
  insert into app_private.job_runs (job, mode, counts, error, started_at)
  values (p_job, p_mode, p_counts, pg_catalog.left(p_error, 1000), coalesce(p_started_at, pg_catalog.now()));
$function$;

-- 4. The switches: app_settings cleanup_<job>, off = count only. Admins switch them with set_flag.
insert into public.app_settings (key, enabled, description) values
  ('cleanup_abandoned_drafts', false, 'Cleanup job: abandoned drafts (never published, not edited for 60 days) and their photos. Off: counts only. On: deletes them.'),
  ('cleanup_orphan_photos', false, 'Cleanup job: photo files with no photo row, older than 1 day. Off: counts only. On: deletes the files.'),
  ('cleanup_old_photo_checks', false, 'Cleanup job: photo checks older than 90 days, except the latest per listing. Off: counts only. On: deletes them.'),
  ('cleanup_expired_reports', false, 'Cleanup job: closed reports and their evidence past the report retention period (730 days, attorney to set). Off: counts only. On: deletes them.'),
  ('cleanup_old_data_exports', false, 'Cleanup job: download-my-data records older than 30 days. Off: counts only. On: deletes them.'),
  ('cleanup_old_age_checks', false, 'Cleanup job: age checks except the latest per account (and the one that decides the age gate). Off: counts only. On: deletes them.'),
  ('cleanup_old_suggestion_choices', false, 'Cleanup job: suggestion choices older than 365 days. Off: counts only. On: deletes them.'),
  ('cleanup_old_declarations', false, 'Cleanup job: accessory and listing declarations older than 7 years (attorney to set). Off: counts only. On: deletes them.'),
  ('cleanup_stale_device_tokens', false, 'Cleanup job: notification device tokens not seen for 90 days. Off: counts only. On: deletes them.')
on conflict (key) do nothing;

create or replace function app_private.cleanup_deletes(p_job text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((select s.enabled from public.app_settings s where s.key = 'cleanup_' || p_job), false);
$function$;

-- 5. The database jobs. Each returns its counts and deletes only when p_delete is true.
create or replace function app_private.cleanup_old_photo_checks(p_delete boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_days numeric := app_private.setting_number('photo_check_retention_days');
  v_ids uuid[];
  v_photos bigint;
begin
  select coalesce(pg_catalog.array_agg(s.id), '{}') into v_ids
  from public.listing_scans s
  where s.created_at < pg_catalog.now() - pg_catalog.make_interval(days => v_days::integer)
    and s.status in ('done', 'failed')
    and s.id <> (select s2.id from public.listing_scans s2 where s2.listing_id = s.listing_id
                 order by s2.created_at desc, s2.id desc limit 1);
  select pg_catalog.count(*) into v_photos from public.photo_scans ps where ps.scan_id = any (v_ids);
  if p_delete then
    delete from public.listing_scans s where s.id = any (v_ids);
  end if;
  return pg_catalog.jsonb_build_object('photo_checks', pg_catalog.cardinality(v_ids), 'photo_results', v_photos);
end;
$function$;

create or replace function app_private.cleanup_expired_reports(p_delete boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_days numeric := app_private.setting_number('report_retention_days');
  v_ids uuid[];
  v_evidence bigint;
begin
  select coalesce(pg_catalog.array_agg(r.id), '{}') into v_ids
  from public.reports r
  where r.status = 'closed' and r.closed_at < pg_catalog.now() - pg_catalog.make_interval(days => v_days::integer);
  select pg_catalog.count(*) into v_evidence from app_private.report_evidence e where e.report_id = any (v_ids);
  if p_delete then
    delete from public.reports r where r.id = any (v_ids);
  end if;
  return pg_catalog.jsonb_build_object('reports', pg_catalog.cardinality(v_ids), 'evidence', v_evidence);
end;
$function$;

create or replace function app_private.cleanup_old_data_exports(p_delete boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_days numeric := app_private.setting_number('data_export_retention_days');
  v_count bigint;
begin
  select pg_catalog.count(*) into v_count from public.data_exports e
  where e.exported_at < pg_catalog.now() - pg_catalog.make_interval(days => v_days::integer);
  if p_delete then
    delete from public.data_exports e
    where e.exported_at < pg_catalog.now() - pg_catalog.make_interval(days => v_days::integer);
  end if;
  return pg_catalog.jsonb_build_object('export_records', v_count);
end;
$function$;

-- Keeps the latest row per account and the latest decisive one (what app_private.age_blocked reads).
create or replace function app_private.cleanup_old_age_checks(p_delete boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_ids bigint[];
begin
  select coalesce(pg_catalog.array_agg(x.id), '{}') into v_ids
  from (
    select c.id,
      pg_catalog.row_number() over (partition by c.user_id order by c.id desc) as latest,
      pg_catalog.row_number() over (partition by c.user_id,
        (c.result = 'minor' or (c.source = 'store_signal' and c.result = 'adult')) order by c.id desc) as latest_of_kind,
      (c.result = 'minor' or (c.source = 'store_signal' and c.result = 'adult')) as decisive
    from public.age_checks c
  ) x
  where x.latest > 1 and not (x.decisive and x.latest_of_kind = 1);
  if p_delete then
    delete from public.age_checks c where c.id = any (v_ids);
  end if;
  return pg_catalog.jsonb_build_object('age_checks', pg_catalog.cardinality(v_ids));
end;
$function$;

create or replace function app_private.cleanup_old_suggestion_choices(p_delete boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_days numeric := app_private.setting_number('suggestion_retention_days');
  v_count bigint;
begin
  select pg_catalog.count(*) into v_count from public.suggestion_events e
  where e.created_at < pg_catalog.now() - pg_catalog.make_interval(days => v_days::integer);
  if p_delete then
    delete from public.suggestion_events e
    where e.created_at < pg_catalog.now() - pg_catalog.make_interval(days => v_days::integer);
  end if;
  return pg_catalog.jsonb_build_object('suggestion_choices', v_count);
end;
$function$;

create or replace function app_private.cleanup_old_declarations(p_delete boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_cutoff timestamp with time zone :=
    pg_catalog.now() - pg_catalog.make_interval(years => app_private.setting_number('declaration_retention_years')::integer);
  v_accessory bigint;
  v_listing bigint;
begin
  select pg_catalog.count(*) into v_accessory from public.accessory_declarations d where d.created_at < v_cutoff;
  select pg_catalog.count(*) into v_listing from public.listing_declarations d where d.created_at < v_cutoff;
  if p_delete then
    delete from public.accessory_declarations d where d.created_at < v_cutoff;
    delete from public.listing_declarations d where d.created_at < v_cutoff;
  end if;
  return pg_catalog.jsonb_build_object('accessory_declarations', v_accessory, 'listing_declarations', v_listing);
end;
$function$;

create or replace function app_private.cleanup_stale_device_tokens(p_delete boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_days numeric := app_private.setting_number('device_token_stale_days');
  v_count bigint;
begin
  select pg_catalog.count(*) into v_count from public.device_tokens t
  where t.last_seen_at < pg_catalog.now() - pg_catalog.make_interval(days => v_days::integer);
  if p_delete then
    delete from public.device_tokens t
    where t.last_seen_at < pg_catalog.now() - pg_catalog.make_interval(days => v_days::integer);
  end if;
  return pg_catalog.jsonb_build_object('device_tokens', v_count);
end;
$function$;

-- Runs the seven database jobs, each on its own: one failing records its error and the others still run.
create or replace function app_private.run_cleanup_jobs()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job text;
  v_delete boolean;
  v_started timestamp with time zone;
  v_counts jsonb;
  v_error text;
  v_all jsonb := '{}'::jsonb;
begin
  foreach v_job in array array['old_photo_checks', 'expired_reports', 'old_data_exports', 'old_age_checks',
                               'old_suggestion_choices', 'old_declarations', 'stale_device_tokens'] loop
    v_started := pg_catalog.clock_timestamp();
    v_delete := app_private.cleanup_deletes(v_job);
    v_counts := null;
    v_error := null;
    begin
      execute pg_catalog.format('select app_private.cleanup_%s($1)', v_job) into v_counts using v_delete;
    exception when others then
      v_error := sqlstate || ': ' || sqlerrm;
    end;
    perform app_private.record_job_run(v_job, case when v_delete then 'delete' else 'count' end, v_counts, v_error, v_started);
    v_all := v_all || pg_catalog.jsonb_build_object(v_job, coalesce(v_counts, pg_catalog.jsonb_build_object('error', v_error)));
  end loop;
  return v_all;
end;
$function$;

-- 6. The file jobs. The plan says what the cleanup-files function may delete; it never deletes
-- anything itself. Callable only with the server key (service_role).
create or replace function public.cleanup_file_plan()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_draft_days numeric := app_private.setting_number('draft_retention_days');
  v_orphan_days numeric := app_private.setting_number('orphan_photo_days');
begin
  return pg_catalog.jsonb_build_object(
    'abandoned_drafts', pg_catalog.jsonb_build_object(
      'delete', app_private.cleanup_deletes('abandoned_drafts'),
      'listings', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'id', l.id,
          'files', (select pg_catalog.count(*) from storage.objects o
                    where o.bucket_id = 'listing-photos' and o.name like l.id::text || '/%')))
        from (select l2.id from public.listings l2
              where l2.status = 'paused' and l2.published_at is null and l2.hold is null
                and l2.updated_at < pg_catalog.now() - pg_catalog.make_interval(days => v_draft_days::integer)
              order by l2.updated_at limit 200) l), '[]'::jsonb)),
    'orphan_photos', pg_catalog.jsonb_build_object(
      'delete', app_private.cleanup_deletes('orphan_photos'),
      'paths', coalesce((select pg_catalog.jsonb_agg(o.name)
        from (select o2.name from storage.objects o2
              where o2.bucket_id = 'listing-photos'
                and o2.created_at < pg_catalog.now() - pg_catalog.make_interval(days => v_orphan_days::integer)
                and not exists (select 1 from public.listing_photos p where p.storage_path = o2.name)
              order by o2.created_at limit 1000) o), '[]'::jsonb)));
end;
$function$;

create or replace function public.cleanup_record_run(
  p_job text, p_mode text, p_counts jsonb, p_error text, p_started_at timestamp with time zone)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_job not in ('abandoned_drafts', 'orphan_photos') then
    raise exception 'Unknown file job' using errcode = '22023';
  end if;
  perform app_private.record_job_run(p_job, p_mode, p_counts, p_error, p_started_at);
end;
$function$;

-- Calls cleanup-files with the shared secret (Vault), like send-push.
create or replace function app_private.request_file_cleanup()
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_url text;
  v_secret text;
begin
  select ds.decrypted_secret into v_url from vault.decrypted_secrets ds where ds.name = 'cleanup_files_url';
  select ds.decrypted_secret into v_secret from vault.decrypted_secrets ds where ds.name = 'cleanup_files_secret';
  if v_url is null or v_secret is null then
    perform app_private.record_job_run(j, 'count', null, 'Not configured: the cleanup-files address or secret is missing', pg_catalog.now())
    from pg_catalog.unnest(array['abandoned_drafts', 'orphan_photos']) j;
    return null;
  end if;
  return net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := pg_catalog.jsonb_build_object('Content-Type', 'application/json', 'x-cleanup-secret', v_secret),
    timeout_milliseconds := 120000
  );
end;
$function$;

do $migration$
begin
  if not exists (select 1 from vault.secrets s where s.name = 'cleanup_files_secret') then
    perform vault.create_secret(
      pg_catalog.encode(extensions.gen_random_bytes(32), 'hex'),
      'cleanup_files_secret',
      'Proves to the cleanup-files Edge Function that this database is calling'
    );
  end if;
  if not exists (select 1 from vault.secrets s where s.name = 'cleanup_files_url') then
    perform vault.create_secret(
      'https://pwfzkyjeivadbtkfkdxr.supabase.co/functions/v1/cleanup-files',
      'cleanup_files_url',
      'Address of the cleanup-files Edge Function'
    );
  end if;
end;
$migration$;

-- 7. Nightly, around 3 a.m. US Central: the database jobs, then the file jobs.
select cron.schedule('dzirent-cleanup-database', '15 9 * * *', 'select app_private.run_cleanup_jobs()');
select cron.schedule('dzirent-cleanup-files', '30 9 * * *', 'select app_private.request_file_cleanup()');

-- 8. Admins: each job's switch and last run, for the admin overview.
create or replace function public.admin_cleanup_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := app_private.require_admin();
  v_rows jsonb;
begin
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'job', j.job,
      'description', s.description,
      'deletes', coalesce(s.enabled, false),
      'last_run', (select pg_catalog.jsonb_build_object('mode', r.mode, 'counts', r.counts, 'error', r.error,
                     'started_at', r.started_at, 'finished_at', r.finished_at)
                   from app_private.job_runs r where r.job = j.job order by r.id desc limit 1))
      order by j.ord), '[]'::jsonb)
  into v_rows
  from pg_catalog.unnest(array['abandoned_drafts', 'orphan_photos', 'old_photo_checks', 'expired_reports',
                               'old_data_exports', 'old_age_checks', 'old_suggestion_choices', 'old_declarations',
                               'stale_device_tokens']) with ordinality as j(job, ord)
  left join public.app_settings s on s.key = 'cleanup_' || j.job;
  perform app_private.log_admin_action(v_admin, 'view_cleanup_jobs', null, null, null, null,
    pg_catalog.jsonb_build_object('count', pg_catalog.jsonb_array_length(v_rows)));
  return v_rows;
end;
$function$;

-- 9. Access.
revoke execute on function app_private.setting_number(text) from public, anon, authenticated;
revoke execute on function app_private.listing_track_changes() from public, anon, authenticated;
revoke execute on function app_private.listing_touch() from public, anon, authenticated;
revoke execute on function app_private.record_job_run(text, text, jsonb, text, timestamp with time zone) from public, anon, authenticated;
revoke execute on function app_private.cleanup_deletes(text) from public, anon, authenticated;
revoke execute on function app_private.cleanup_old_photo_checks(boolean) from public, anon, authenticated;
revoke execute on function app_private.cleanup_expired_reports(boolean) from public, anon, authenticated;
revoke execute on function app_private.cleanup_old_data_exports(boolean) from public, anon, authenticated;
revoke execute on function app_private.cleanup_old_age_checks(boolean) from public, anon, authenticated;
revoke execute on function app_private.cleanup_old_suggestion_choices(boolean) from public, anon, authenticated;
revoke execute on function app_private.cleanup_old_declarations(boolean) from public, anon, authenticated;
revoke execute on function app_private.cleanup_stale_device_tokens(boolean) from public, anon, authenticated;
revoke execute on function app_private.run_cleanup_jobs() from public, anon, authenticated;
revoke execute on function app_private.request_file_cleanup() from public, anon, authenticated;
revoke execute on function public.cleanup_file_plan() from public, anon, authenticated;
grant execute on function public.cleanup_file_plan() to service_role;
revoke execute on function public.cleanup_record_run(text, text, jsonb, text, timestamp with time zone) from public, anon, authenticated;
grant execute on function public.cleanup_record_run(text, text, jsonb, text, timestamp with time zone) to service_role;
revoke execute on function public.admin_cleanup_status() from public, anon;
grant execute on function public.admin_cleanup_status() to authenticated;

notify pgrst, 'reload schema';
