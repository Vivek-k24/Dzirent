-- P2B part 1 (functions): what admins can see and do. Every function starts with
-- app_private.require_admin() (admin_users + two-step sign-in) and writes one admin_actions row,
-- reads included. Bans and photo-file removal go through the admin-actions Edge Function, which
-- calls admin_record_ban / admin_remove_photos here after the Auth or Storage step.

-- Closes an open report with its outcome. Null report: nothing to close.
create or replace function app_private.close_report(p_report uuid, p_outcome text, p_note text, p_admin uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_before public.reports%rowtype;
begin
  if p_report is null then
    return null;
  end if;
  select * into v_before from public.reports r where r.id = p_report for update;
  if not found then
    raise exception 'Report not found' using errcode = 'P0002';
  end if;
  if v_before.status <> 'open' then
    raise exception 'This report is already closed' using errcode = 'P0001';
  end if;
  update public.reports set status = 'closed', outcome = p_outcome, outcome_note = p_note,
    closed_at = pg_catalog.now(), closed_by = p_admin
  where id = p_report;
  return pg_catalog.jsonb_build_object('report_id', p_report, 'outcome', p_outcome);
end;
$function$;

create or replace function app_private.require_reason(p_reason text)
returns text
language plpgsql
immutable
set search_path = ''
as $function$
begin
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Give a reason (at least 3 characters)' using errcode = '22023';
  end if;
  return pg_catalog.left(pg_catalog.btrim(p_reason), 500);
end;
$function$;

create or replace function app_private.profile_state(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select pg_catalog.jsonb_build_object('suspended_until', p.suspended_until, 'suspension_reason', p.suspension_reason,
    'studio_name', p.studio_name, 'studio_bio', p.studio_bio, 'pickup_area', p.pickup_area)
  from public.profiles p where p.id = p_user;
$function$;

-- ---- Queues ----

create or replace function public.admin_queues()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := app_private.require_admin();
  v_result jsonb;
begin
  select pg_catalog.jsonb_build_object(
    'open_reports', (select pg_catalog.count(*) from public.reports r where r.status = 'open'),
    'scans_in_review', (
      select pg_catalog.count(*) from (
        select distinct on (s.listing_id) s.status, s.verdict, s.admin_decision
        from public.listing_scans s order by s.listing_id, s.created_at desc) latest
      where latest.status = 'done' and latest.verdict = 'review' and latest.admin_decision is null),
    'open_takedowns', (select pg_catalog.count(*) from app_private.takedown_requests t where t.status in ('received', 'countered')),
    'id_verification_reviews', 0)
  into v_result;
  perform app_private.log_admin_action(v_admin, 'view_queues', null, null, null, null, v_result);
  return v_result;
end;
$function$;

create or replace function public.admin_list_reports(p_status text default 'open', p_limit integer default 30, p_offset integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := app_private.require_admin();
  v_rows jsonb;
begin
  select coalesce(pg_catalog.jsonb_agg(row_to_json(x)::jsonb order by x.created_at), '[]'::jsonb) into v_rows
  from (
    select r.id, r.created_at, r.status, r.target_type, r.target_id, r.target_user_id, r.reason, r.details,
           r.outcome, r.outcome_note, r.closed_at, r.closed_by, r.reporter_id,
           rp.studio_handle as reporter_handle, coalesce(nullif(rp.studio_name, ''), rp.display_name) as reporter_name,
           tp.studio_handle as target_handle, coalesce(nullif(tp.studio_name, ''), tp.display_name) as target_name,
           e.snapshot as evidence, e.captured_at as evidence_captured_at
    from public.reports r
    left join public.profiles rp on rp.id = r.reporter_id
    left join public.profiles tp on tp.id = r.target_user_id
    left join app_private.report_evidence e on e.report_id = r.id
    where p_status is null or r.status = p_status
    order by r.created_at
    limit least(greatest(coalesce(p_limit, 30), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
  ) x;
  perform app_private.log_admin_action(v_admin, 'view_reports', null, null, p_status, null,
    pg_catalog.jsonb_build_object('count', pg_catalog.jsonb_array_length(v_rows)));
  return v_rows;
end;
$function$;

create or replace function public.admin_list_scan_reviews(p_limit integer default 30, p_offset integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := app_private.require_admin();
  v_rows jsonb;
begin
  select coalesce(pg_catalog.jsonb_agg(row_to_json(x)::jsonb order by x.created_at), '[]'::jsonb) into v_rows
  from (
    select s.id as scan_id, s.listing_id, s.created_at, s.finished_at, s.reason, s.suggestions,
           l.title, l.status as listing_status, l.lender_id, p.studio_handle as lender_handle,
           (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
              'photo_id', ps.photo_id, 'storage_path', ps.storage_path, 'slot', ps.slot, 'decision', ps.decision,
              'warnings', ps.warnings, 'looks_like', ps.labels->'looks_like',
              'nsfw', ps.labels->'safety'->'nsfw', 'hooded', ps.labels->'hooded')), '[]'::jsonb)
            from public.photo_scans ps where ps.scan_id = s.id) as photos
    from (
      select distinct on (sc.listing_id) sc.* from public.listing_scans sc order by sc.listing_id, sc.created_at desc
    ) s
    join public.listings l on l.id = s.listing_id
    left join public.profiles p on p.id = l.lender_id
    where s.status = 'done' and s.verdict = 'review' and s.admin_decision is null
    order by s.created_at
    limit least(greatest(coalesce(p_limit, 30), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
  ) x;
  perform app_private.log_admin_action(v_admin, 'view_scan_reviews', null, null, null, null,
    pg_catalog.jsonb_build_object('count', pg_catalog.jsonb_array_length(v_rows)));
  return v_rows;
end;
$function$;

create or replace function public.admin_list_takedowns(p_status text default null, p_limit integer default 30, p_offset integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := app_private.require_admin();
  v_rows jsonb;
begin
  select coalesce(pg_catalog.jsonb_agg(row_to_json(t)::jsonb order by t.received_at), '[]'::jsonb) into v_rows
  from (
    select * from app_private.takedown_requests tr
    where (p_status is null and tr.status in ('received', 'countered')) or tr.status = p_status
    order by tr.received_at
    limit least(greatest(coalesce(p_limit, 30), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
  ) t;
  perform app_private.log_admin_action(v_admin, 'view_takedowns', null, null, p_status, null,
    pg_catalog.jsonb_build_object('count', pg_catalog.jsonb_array_length(v_rows)));
  return v_rows;
end;
$function$;

-- ID verification reviews arrive with P6A (Didit); until then the queue is empty.
create or replace function public.admin_list_id_reviews()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := app_private.require_admin();
begin
  perform app_private.log_admin_action(v_admin, 'view_id_reviews', null, null, null, null, '{"count": 0}'::jsonb);
  return '[]'::jsonb;
end;
$function$;

-- ---- Reports ----

create or replace function public.admin_dismiss_report(p_report_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := app_private.require_admin();
  v_reason text := app_private.require_reason(p_reason);
  v_after jsonb;
begin
  if p_report_id is null then
    raise exception 'Pick a report' using errcode = '22023';
  end if;
  v_after := app_private.close_report(p_report_id, 'dismissed', v_reason, v_admin);
  perform app_private.log_admin_action(v_admin, 'dismiss_report', 'report', p_report_id::text, v_reason,
    '{"status": "open"}'::jsonb, v_after);
  return v_after;
end;
$function$;

create or replace function public.admin_warn_user(p_user_id uuid, p_note text, p_report_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := app_private.require_admin();
  v_note text := app_private.require_reason(p_note);
  v_warning uuid;
  v_after jsonb;
begin
  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  insert into public.user_warnings (user_id, note, report_id, created_by)
  values (p_user_id, v_note, p_report_id, v_admin)
  returning id into v_warning;
  v_after := pg_catalog.jsonb_build_object('warning_id', v_warning,
    'report', app_private.close_report(p_report_id, 'warned', v_note, v_admin));
  perform app_private.log_admin_action(v_admin, 'warn_user', 'user', p_user_id::text, v_note, null, v_after);
  return v_after;
end;
$function$;

-- What "remove the reported content" means: a message is deleted, a listing is hidden, a profile
-- loses its studio name, bio and pickup area. The report's evidence keeps the original.
create or replace function public.admin_remove_reported_content(p_report_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := app_private.require_admin();
  v_reason text := app_private.require_reason(p_reason);
  v_report public.reports%rowtype;
  v_before jsonb;
  v_after jsonb;
begin
  select * into v_report from public.reports r where r.id = p_report_id;
  if not found then
    raise exception 'Report not found' using errcode = 'P0002';
  end if;
  if v_report.status <> 'open' then
    raise exception 'This report is already closed' using errcode = 'P0001';
  end if;
  if v_report.target_type = 'message' then
    select pg_catalog.to_jsonb(m) into v_before from public.messages m where m.id = v_report.target_id;
    delete from public.messages m where m.id = v_report.target_id;
    v_after := pg_catalog.jsonb_build_object('message_deleted', v_before is not null);
  elsif v_report.target_type = 'listing' then
    select pg_catalog.jsonb_build_object('status', l.status, 'hold', l.hold) into v_before
    from public.listings l where l.id = v_report.target_id;
    perform app_private.hold_listing(v_report.target_id, 'hidden', v_reason);
    select pg_catalog.jsonb_build_object('status', l.status, 'hold', l.hold) into v_after
    from public.listings l where l.id = v_report.target_id;
  else
    v_before := app_private.profile_state(v_report.target_id);
    update public.profiles set studio_name = null, studio_bio = null, pickup_area = null
    where id = v_report.target_id;
    v_after := app_private.profile_state(v_report.target_id);
  end if;
  v_after := coalesce(v_after, '{}'::jsonb) || pg_catalog.jsonb_build_object('report',
    app_private.close_report(p_report_id, 'content_removed', v_reason, v_admin));
  perform app_private.log_admin_action(v_admin, 'remove_reported_content', v_report.target_type,
    v_report.target_id::text, v_reason, v_before, v_after);
  return v_after;
end;
$function$;

-- ---- Suspensions and bans ----

create or replace function app_private.set_suspension(p_user uuid, p_until timestamp with time zone, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_listing uuid;
begin
  update public.profiles set suspended_until = p_until, suspension_reason = p_reason where id = p_user;
  if p_until is null then
    for v_listing in select l.id from public.listings l where l.lender_id = p_user and l.hold = 'suspended' loop
      perform app_private.release_listing(v_listing, 'suspended');
    end loop;
  else
    for v_listing in select l.id from public.listings l where l.lender_id = p_user and l.hold is null and l.status = 'active' loop
      perform app_private.hold_listing(v_listing, 'suspended', p_reason);
    end loop;
  end if;
end;
$function$;

create or replace function public.admin_suspend_user(p_user_id uuid, p_days integer, p_reason text, p_report_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := app_private.require_admin();
  v_reason text := app_private.require_reason(p_reason);
  v_before jsonb := app_private.profile_state(p_user_id);
  v_after jsonb;
begin
  if v_before is null then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  if p_days is null or p_days < 1 or p_days > 3650 then
    raise exception 'Suspend for 1 to 3650 days' using errcode = '22023';
  end if;
  if p_user_id = v_admin then
    raise exception 'Admins can''t suspend themselves' using errcode = 'P0001';
  end if;
  perform app_private.set_suspension(p_user_id, pg_catalog.now() + pg_catalog.make_interval(days => p_days), v_reason);
  v_after := app_private.profile_state(p_user_id) || pg_catalog.jsonb_build_object(
    'listings_held', (select pg_catalog.count(*) from public.listings l where l.lender_id = p_user_id and l.hold = 'suspended'),
    'report', app_private.close_report(p_report_id, 'suspended', v_reason, v_admin));
  perform app_private.log_admin_action(v_admin, 'suspend_user', 'user', p_user_id::text, v_reason, v_before, v_after);
  return v_after;
end;
$function$;

create or replace function public.admin_unsuspend_user(p_user_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := app_private.require_admin();
  v_reason text := app_private.require_reason(p_reason);
  v_before jsonb := app_private.profile_state(p_user_id);
  v_after jsonb;
begin
  if v_before is null then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  perform app_private.set_suspension(p_user_id, null, null);
  v_after := app_private.profile_state(p_user_id) || pg_catalog.jsonb_build_object(
    'listings_active', (select pg_catalog.count(*) from public.listings l where l.lender_id = p_user_id and l.status = 'active'));
  perform app_private.log_admin_action(v_admin, 'unsuspend_user', 'user', p_user_id::text, v_reason, v_before, v_after);
  return v_after;
end;
$function$;

-- Called by the admin-actions Edge Function after it banned or unbanned the account in Supabase
-- Auth. A ban is also an open-ended suspension, so the database refuses the user at once.
create or replace function public.admin_record_ban(p_user_id uuid, p_banned boolean, p_reason text, p_report_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := app_private.require_admin();
  v_reason text := app_private.require_reason(p_reason);
  v_before jsonb := app_private.profile_state(p_user_id);
  v_after jsonb;
begin
  if v_before is null then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  if p_user_id = v_admin then
    raise exception 'Admins can''t ban themselves' using errcode = 'P0001';
  end if;
  if p_banned then
    perform app_private.set_suspension(p_user_id, 'infinity'::timestamptz, v_reason);
  else
    perform app_private.set_suspension(p_user_id, null, null);
  end if;
  v_after := app_private.profile_state(p_user_id) || pg_catalog.jsonb_build_object(
    'banned', p_banned,
    'report', case when p_banned then app_private.close_report(p_report_id, 'banned', v_reason, v_admin) end);
  perform app_private.log_admin_action(v_admin, case when p_banned then 'ban_user' else 'unban_user' end,
    'user', p_user_id::text, v_reason, v_before, v_after);
  return v_after;
end;
$function$;

-- ---- Photo checks ----

create or replace function public.admin_decide_scan(p_scan_id uuid, p_decision text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := app_private.require_admin();
  v_reason text := app_private.require_reason(p_reason);
  v_scan public.listing_scans%rowtype;
  v_after jsonb;
begin
  if p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception 'Decide approved or rejected' using errcode = '22023';
  end if;
  select * into v_scan from public.listing_scans s where s.id = p_scan_id for update;
  if not found then
    raise exception 'Photo check not found' using errcode = 'P0002';
  end if;
  if v_scan.status <> 'done' then
    raise exception 'This photo check hasn''t finished' using errcode = 'P0001';
  end if;
  update public.listing_scans set admin_decision = p_decision, admin_decided_at = pg_catalog.now(),
    admin_reason = pg_catalog.left(v_reason, 300)
  where id = p_scan_id;
  v_after := pg_catalog.jsonb_build_object('admin_decision', p_decision, 'admin_reason', pg_catalog.left(v_reason, 300));
  perform app_private.log_admin_action(v_admin, 'decide_scan', 'scan', p_scan_id::text, v_reason,
    pg_catalog.jsonb_build_object('verdict', v_scan.verdict, 'reason', v_scan.reason, 'admin_decision', v_scan.admin_decision),
    v_after || pg_catalog.jsonb_build_object('listing_id', v_scan.listing_id));
  return v_after;
end;
$function$;

-- ---- Listings ----

create or replace function public.admin_hide_listing(p_listing_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := app_private.require_admin();
  v_reason text := app_private.require_reason(p_reason);
  v_before jsonb;
  v_after jsonb;
begin
  select pg_catalog.jsonb_build_object('status', l.status, 'hold', l.hold) into v_before
  from public.listings l where l.id = p_listing_id;
  if v_before is null then
    raise exception 'Listing not found' using errcode = 'P0002';
  end if;
  perform app_private.hold_listing(p_listing_id, 'hidden', v_reason);
  select pg_catalog.jsonb_build_object('status', l.status, 'hold', l.hold) into v_after
  from public.listings l where l.id = p_listing_id;
  perform app_private.log_admin_action(v_admin, 'hide_listing', 'listing', p_listing_id::text, v_reason, v_before, v_after);
  return v_after;
end;
$function$;

create or replace function public.admin_unhide_listing(p_listing_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := app_private.require_admin();
  v_reason text := app_private.require_reason(p_reason);
  v_before jsonb;
  v_after jsonb;
begin
  select pg_catalog.jsonb_build_object('status', l.status, 'hold', l.hold) into v_before
  from public.listings l where l.id = p_listing_id;
  if v_before is null then
    raise exception 'Listing not found' using errcode = 'P0002';
  end if;
  perform app_private.release_listing(p_listing_id, 'hidden');
  select pg_catalog.jsonb_build_object('status', l.status, 'hold', l.hold) into v_after
  from public.listings l where l.id = p_listing_id;
  perform app_private.log_admin_action(v_admin, 'unhide_listing', 'listing', p_listing_id::text, v_reason, v_before, v_after);
  return v_after;
end;
$function$;

-- ---- Takedowns ----

create or replace function public.admin_create_takedown(
  p_claimant_name text, p_claimant_contact text, p_work text, p_urls text[] default '{}',
  p_listing_ids uuid[] default '{}', p_received_at timestamp with time zone default null, p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := app_private.require_admin();
  v_id uuid;
begin
  if pg_catalog.btrim(coalesce(p_claimant_name, '')) = '' or pg_catalog.btrim(coalesce(p_claimant_contact, '')) = ''
     or pg_catalog.btrim(coalesce(p_work, '')) = '' then
    raise exception 'Claimant name, contact and the work are required' using errcode = '22023';
  end if;
  insert into app_private.takedown_requests (claimant_name, claimant_contact, work, urls, listing_ids, received_at, notes, created_by)
  values (pg_catalog.btrim(p_claimant_name), pg_catalog.btrim(p_claimant_contact), pg_catalog.btrim(p_work),
          coalesce(p_urls, '{}'), coalesce(p_listing_ids, '{}'), coalesce(p_received_at, pg_catalog.now()), p_note, v_admin)
  returning id into v_id;
  perform app_private.log_admin_action(v_admin, 'create_takedown', 'takedown', v_id::text, p_note, null,
    pg_catalog.jsonb_build_object('listing_ids', p_listing_ids, 'urls', p_urls));
  return v_id;
end;
$function$;

create or replace function public.admin_takedown_remove_listing(p_takedown_id uuid, p_listing_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := app_private.require_admin();
  v_reason text := app_private.require_reason(p_reason);
  v_before jsonb;
  v_after jsonb;
begin
  if not exists (select 1 from app_private.takedown_requests t where t.id = p_takedown_id) then
    raise exception 'Takedown request not found' using errcode = 'P0002';
  end if;
  select pg_catalog.jsonb_build_object('status', l.status, 'hold', l.hold) into v_before
  from public.listings l where l.id = p_listing_id;
  if v_before is null then
    raise exception 'Listing not found' using errcode = 'P0002';
  end if;
  perform app_private.hold_listing(p_listing_id, 'hidden', v_reason);
  update app_private.takedown_requests set status = 'actioned', updated_at = pg_catalog.now(),
    listing_ids = case when p_listing_id = any(listing_ids) then listing_ids else listing_ids || p_listing_id end
  where id = p_takedown_id;
  select pg_catalog.jsonb_build_object('status', l.status, 'hold', l.hold, 'takedown_status', 'actioned') into v_after
  from public.listings l where l.id = p_listing_id;
  perform app_private.log_admin_action(v_admin, 'takedown_remove_listing', 'listing', p_listing_id::text, v_reason,
    v_before, v_after || pg_catalog.jsonb_build_object('takedown_id', p_takedown_id));
  return v_after;
end;
$function$;

-- Deletes photo rows and returns their storage paths. Use it through the admin-actions Edge
-- Function, which then deletes the files (called directly, the files stay in the bucket).
create or replace function public.admin_remove_photos(p_listing_id uuid, p_photo_ids uuid[], p_reason text, p_takedown_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := app_private.require_admin();
  v_reason text := app_private.require_reason(p_reason);
  v_paths text[];
begin
  if p_photo_ids is null or pg_catalog.cardinality(p_photo_ids) = 0 then
    raise exception 'Pick the photos to remove' using errcode = '22023';
  end if;
  with removed as (
    delete from public.listing_photos ph
    where ph.listing_id = p_listing_id and ph.id = any(p_photo_ids)
    returning ph.storage_path
  )
  select coalesce(pg_catalog.array_agg(storage_path), '{}') into v_paths from removed;
  if p_takedown_id is not null then
    update app_private.takedown_requests set status = 'actioned', updated_at = pg_catalog.now() where id = p_takedown_id;
  end if;
  perform app_private.log_admin_action(v_admin, 'remove_photos', 'listing', p_listing_id::text, v_reason,
    pg_catalog.jsonb_build_object('photo_ids', p_photo_ids),
    pg_catalog.jsonb_build_object('storage_paths', v_paths, 'takedown_id', p_takedown_id));
  return pg_catalog.jsonb_build_object('storage_paths', v_paths);
end;
$function$;

create or replace function public.admin_record_counter_notice(p_takedown_id uuid, p_notice text, p_received_at timestamp with time zone default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := app_private.require_admin();
  v_before jsonb;
  v_after jsonb;
begin
  if pg_catalog.btrim(coalesce(p_notice, '')) = '' then
    raise exception 'Enter the counter-notice' using errcode = '22023';
  end if;
  select pg_catalog.jsonb_build_object('status', t.status) into v_before from app_private.takedown_requests t where t.id = p_takedown_id;
  if v_before is null then
    raise exception 'Takedown request not found' using errcode = 'P0002';
  end if;
  update app_private.takedown_requests set status = 'countered', counter_notice = p_notice,
    counter_received_at = coalesce(p_received_at, pg_catalog.now()), updated_at = pg_catalog.now()
  where id = p_takedown_id;
  v_after := pg_catalog.jsonb_build_object('status', 'countered');
  perform app_private.log_admin_action(v_admin, 'record_counter_notice', 'takedown', p_takedown_id::text, null, v_before, v_after);
  return v_after;
end;
$function$;

create or replace function public.admin_set_takedown_status(p_takedown_id uuid, p_status text, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := app_private.require_admin();
  v_note text := app_private.require_reason(p_note);
  v_before jsonb;
  v_after jsonb;
begin
  if p_status is null or p_status not in ('received', 'actioned', 'rejected', 'countered', 'restored') then
    raise exception 'Unknown takedown status' using errcode = '22023';
  end if;
  select pg_catalog.jsonb_build_object('status', t.status) into v_before from app_private.takedown_requests t where t.id = p_takedown_id;
  if v_before is null then
    raise exception 'Takedown request not found' using errcode = 'P0002';
  end if;
  update app_private.takedown_requests set status = p_status, updated_at = pg_catalog.now(),
    notes = pg_catalog.concat_ws(E'\n', notes, v_note)
  where id = p_takedown_id;
  v_after := pg_catalog.jsonb_build_object('status', p_status);
  perform app_private.log_admin_action(v_admin, 'set_takedown_status', 'takedown', p_takedown_id::text, v_note, v_before, v_after);
  return v_after;
end;
$function$;

-- ---- Feature flags (replaces switching them with migrations) ----

create or replace function public.set_flag(p_key text, p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := app_private.require_admin();
  v_before boolean;
begin
  if p_enabled is null then
    raise exception 'Say on or off' using errcode = '22023';
  end if;
  select s.enabled into v_before from public.app_settings s where s.key = p_key for update;
  if not found then
    raise exception 'Unknown flag' using errcode = 'P0002';
  end if;
  update public.app_settings set enabled = p_enabled, updated_at = pg_catalog.now() where key = p_key;
  perform app_private.log_admin_action(v_admin, 'set_flag', 'flag', p_key, null,
    pg_catalog.jsonb_build_object('enabled', v_before), pg_catalog.jsonb_build_object('enabled', p_enabled));
  return pg_catalog.jsonb_build_object('key', p_key, 'enabled', p_enabled);
end;
$function$;

-- ---- Metrics, lookup, the log ----

create or replace function public.admin_metrics()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := app_private.require_admin();
  v_week timestamp with time zone := pg_catalog.now() - interval '7 days';
  v_result jsonb;
begin
  select pg_catalog.jsonb_build_object(
    'users', (select pg_catalog.count(*) from public.profiles),
    'new_users_week', (select pg_catalog.count(*) from public.profiles p where p.created_at > v_week),
    'active_listings', (select pg_catalog.count(*) from public.listings l where l.status = 'active'),
    'scans_week', (select coalesce(pg_catalog.jsonb_object_agg(coalesce(x.verdict, x.status), x.n), '{}'::jsonb)
                   from (select s.verdict, s.status, pg_catalog.count(*) as n from public.listing_scans s
                         where s.created_at > v_week group by s.verdict, s.status) x),
    'open_reports', (select pg_catalog.count(*) from public.reports r where r.status = 'open'),
    'messages_week', (select pg_catalog.count(*) from public.messages m where m.created_at > v_week),
    'suspended_users', (select pg_catalog.count(*) from public.profiles p where p.suspended_until > pg_catalog.now()))
  into v_result;
  perform app_private.log_admin_action(v_admin, 'view_metrics', null, null, null, null, v_result);
  return v_result;
end;
$function$;

-- By email, studio handle (with or without @) or account id. Up to 10 matches.
create or replace function public.admin_find_user(p_query text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := app_private.require_admin();
  v_query text := pg_catalog.btrim(coalesce(p_query, ''));
  v_rows jsonb;
begin
  if pg_catalog.char_length(v_query) < 3 then
    raise exception 'Search for an email, handle or account id' using errcode = '22023';
  end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', p.id, 'email', u.email, 'display_name', p.display_name, 'studio_name', p.studio_name,
      'studio_handle', p.studio_handle, 'city', p.city, 'role', p.role, 'created_at', p.created_at,
      'last_sign_in_at', u.last_sign_in_at, 'banned_until', u.banned_until,
      'suspended_until', p.suspended_until, 'suspension_reason', p.suspension_reason,
      'is_admin', exists (select 1 from app_private.admin_users a where a.user_id = p.id),
      'reports_made', (select pg_catalog.count(*) from public.reports r where r.reporter_id = p.id),
      'reports_against', (select pg_catalog.count(*) from public.reports r where r.target_user_id = p.id),
      'open_reports_against', (select pg_catalog.count(*) from public.reports r where r.target_user_id = p.id and r.status = 'open'),
      'warnings', (select pg_catalog.count(*) from public.user_warnings w where w.user_id = p.id),
      'listings_total', (select pg_catalog.count(*) from public.listings l where l.lender_id = p.id),
      'listings_active', (select pg_catalog.count(*) from public.listings l where l.lender_id = p.id and l.status = 'active'),
      'listings_held', (select pg_catalog.count(*) from public.listings l where l.lender_id = p.id and l.hold is not null))), '[]'::jsonb)
  into v_rows
  from (
    select pr.* from public.profiles pr join auth.users au on au.id = pr.id
    where pr.id = case when v_query ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then v_query::uuid end
       or pg_catalog.lower(au.email) = pg_catalog.lower(v_query)
       or pg_catalog.lower(pr.studio_handle) = pg_catalog.lower(pg_catalog.ltrim(v_query, '@'))
    limit 10
  ) p join auth.users u on u.id = p.id;
  perform app_private.log_admin_action(v_admin, 'find_user', null, null, null,
    pg_catalog.jsonb_build_object('query_length', pg_catalog.char_length(v_query)),
    pg_catalog.jsonb_build_object('count', pg_catalog.jsonb_array_length(v_rows)));
  return v_rows;
end;
$function$;

create or replace function public.admin_audit_log(p_limit integer default 50, p_offset integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := app_private.require_admin();
  v_rows jsonb;
begin
  select coalesce(pg_catalog.jsonb_agg(row_to_json(x)::jsonb order by x.id desc), '[]'::jsonb) into v_rows
  from (
    select a.*, p.studio_handle as admin_handle, coalesce(nullif(p.studio_name, ''), p.display_name) as admin_name
    from app_private.admin_actions a left join public.profiles p on p.id = a.admin_id
    order by a.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)
  ) x;
  perform app_private.log_admin_action(v_admin, 'view_audit_log', null, null, null, null,
    pg_catalog.jsonb_build_object('count', pg_catalog.jsonb_array_length(v_rows)));
  return v_rows;
end;
$function$;

-- ---- Access ----
revoke execute on function app_private.close_report(uuid, text, text, uuid) from public, anon, authenticated;
revoke execute on function app_private.require_reason(text) from public, anon, authenticated;
revoke execute on function app_private.profile_state(uuid) from public, anon, authenticated;
revoke execute on function app_private.set_suspension(uuid, timestamp with time zone, text) from public, anon, authenticated;

do $grants$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.admin_queues()',
    'public.admin_list_reports(text, integer, integer)',
    'public.admin_list_scan_reviews(integer, integer)',
    'public.admin_list_takedowns(text, integer, integer)',
    'public.admin_list_id_reviews()',
    'public.admin_dismiss_report(uuid, text)',
    'public.admin_warn_user(uuid, text, uuid)',
    'public.admin_remove_reported_content(uuid, text)',
    'public.admin_suspend_user(uuid, integer, text, uuid)',
    'public.admin_unsuspend_user(uuid, text)',
    'public.admin_record_ban(uuid, boolean, text, uuid)',
    'public.admin_decide_scan(uuid, text, text)',
    'public.admin_hide_listing(uuid, text)',
    'public.admin_unhide_listing(uuid, text)',
    'public.admin_create_takedown(text, text, text, text[], uuid[], timestamp with time zone, text)',
    'public.admin_takedown_remove_listing(uuid, uuid, text)',
    'public.admin_remove_photos(uuid, uuid[], text, uuid)',
    'public.admin_record_counter_notice(uuid, text, timestamp with time zone)',
    'public.admin_set_takedown_status(uuid, text, text)',
    'public.set_flag(text, boolean)',
    'public.admin_metrics()',
    'public.admin_find_user(text)',
    'public.admin_audit_log(integer, integer)'
  ] loop
    execute pg_catalog.format('revoke execute on function %s from public, anon', v_fn);
    execute pg_catalog.format('grant execute on function %s to authenticated', v_fn);
  end loop;
end;
$grants$;

notify pgrst, 'reload schema';
