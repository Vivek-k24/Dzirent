-- C1: every refusal starts with its code from contracts/error-codes.json ("DZ-E2010: Add a photo
-- first"), with the field in the HINT where the catalog names one. The words stay the same, except
-- "You cannot message this user" -> "You can't message this user." (what the apps already showed).
-- Generated from the live definitions (pg_get_functiondef) of every function that refuses, so only
-- the raise lines change; create or replace keeps each function's owner and grants.
-- The text filter's sentences (text_refusal, also returned by check_text) and the suspension
-- sentence (suspension_message) carry the code in the sentence itself.

-- app_private.admin_actions_append_only: 1 refusal(s)
CREATE OR REPLACE FUNCTION app_private.admin_actions_append_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  raise exception 'DZ-E5004: The admin log is append-only' using errcode = '42501';
end;
$function$;

-- app_private.close_report: 2 refusal(s)
CREATE OR REPLACE FUNCTION app_private.close_report(p_report uuid, p_outcome text, p_note text, p_admin uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_before public.reports%rowtype;
begin
  if p_report is null then
    return null;
  end if;
  select * into v_before from public.reports r where r.id = p_report for update;
  if not found then
    raise exception 'DZ-E5010: Report not found' using errcode = 'P0002';
  end if;
  if v_before.status <> 'open' then
    raise exception 'DZ-E5011: This report is already closed' using errcode = 'P0001';
  end if;
  update public.reports set status = 'closed', outcome = p_outcome, outcome_note = p_note,
    closed_at = pg_catalog.now(), closed_by = p_admin
  where id = p_report;
  return pg_catalog.jsonb_build_object('report_id', p_report, 'outcome', p_outcome);
end;
$function$;

-- app_private.enforce_rate_limit: 1 refusal(s)
CREATE OR REPLACE FUNCTION app_private.enforce_rate_limit(p_user uuid, p_action text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not app_private.rate_limit_take(p_user, p_action) then
    raise exception using errcode = 'P0001', message = 'DZ-E9001: You''re doing that too often. Try again in a bit.';
  end if;
end;
$function$;

-- app_private.is_blocked: 1 refusal(s)
CREATE OR REPLACE FUNCTION app_private.is_blocked(a uuid, b uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or (v_uid is distinct from a and v_uid is distinct from b) then
    raise exception 'DZ-E3020: Not your block relationship' using errcode = '42501';
  end if;
  return exists (
    select 1 from public.blocks bl
    where (bl.blocker_id = a and bl.blocked_id = b)
       or (bl.blocker_id = b and bl.blocked_id = a)
  );
end;
$function$;

-- app_private.listing_hold_guard: 2 refusal(s)
CREATE OR REPLACE FUNCTION app_private.listing_hold_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_message text;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.hold := null;
    new.hold_reason := null;
    new.hold_restores := false;
  else
    new.hold := old.hold;
    new.hold_reason := old.hold_reason;
    new.hold_restores := old.hold_restores;
  end if;
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    if new.hold = 'hidden' then
      raise exception using errcode = 'P0001', message =
        'DZ-E2030: This listing is hidden by Dzirent: ' || coalesce(pg_catalog.rtrim(pg_catalog.btrim(new.hold_reason), '.'), 'no reason given')
        || '. Contact support if you think this is a mistake.';
    end if;
    v_message := app_private.suspension_message(new.lender_id);
    if v_message is not null then
      raise exception using message = v_message, errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$function$;

-- app_private.lock_photo_listing: 3 refusal(s)
CREATE OR REPLACE FUNCTION app_private.lock_photo_listing()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
begin
  if new.bucket_id <> 'listing-photos' then
    return new;
  end if;
  if tg_table_schema <> 'storage' or tg_table_name <> 'objects'
     or tg_op not in ('INSERT', 'UPDATE') then
    raise exception 'DZ-E2060: Invalid photo context' using errcode = '42501';
  end if;
  if new.name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9_-]+\.[A-Za-z0-9]+$' then
    raise exception 'DZ-E2061: Use listing_id/random.ext for photos' using errcode = '22023';
  end if;
  select l.lender_id into v_owner from public.listings l
    where l.id::text = pg_catalog.split_part(new.name, '/', 1)
    for key share;
  if not found or (v_uid is not null and v_uid <> v_owner)
     or (v_uid is null and (
       session_user not in ('postgres', 'supabase_admin', 'supabase_storage_admin')
       and coalesce(pg_catalog.current_setting('role', true), '') not in
         ('service_role', 'supabase_storage_admin')
     )) then
    raise exception 'DZ-E2062: Not your listing folder' using errcode = '42501';
  end if;
  return new;
end;
$function$;

-- app_private.queue_scan: 1 refusal(s)
CREATE OR REPLACE FUNCTION app_private.queue_scan(p_listing_id uuid, p_lender uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    raise exception 'DZ-E2011: Photo checks are not set up' using errcode = 'P0001';
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

-- app_private.refuse_minor_account: 1 refusal(s)
CREATE OR REPLACE FUNCTION app_private.refuse_minor_account()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is not null
     and pg_catalog.current_setting('dzirent.age_gate_skip', true) is distinct from 'on'
     and app_private.age_blocked(v_uid) then
    raise exception using errcode = 'P0001', message = 'DZ-E1030: Dzirent is only for people 18 and older.';
  end if;
  return new;
end;
$function$;

-- app_private.report_evidence_frozen: 1 refusal(s)
CREATE OR REPLACE FUNCTION app_private.report_evidence_frozen()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  raise exception 'DZ-E5005: Report evidence never changes' using errcode = '42501';
end;
$function$;

-- app_private.report_target_user: 2 refusal(s)
CREATE OR REPLACE FUNCTION app_private.report_target_user(p_reporter uuid, p_type text, p_target uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_message text := app_private.suspension_message(p_reporter);
  v_user uuid;
begin
  if v_message is not null then
    raise exception using message = v_message, errcode = 'P0001';
  end if;
  if p_type = 'message' then
    select m.sender_id into v_user
    from public.messages m join public.conversations c on c.id = m.conversation_id
    where m.id = p_target and p_reporter in (c.renter_id, c.lender_id);
    if not found then
      raise exception 'DZ-E5012: You can only report messages in your own chats.' using errcode = 'P0001';
    end if;
  elsif p_type = 'listing' then
    select l.lender_id into v_user from public.listings l where l.id = p_target;
  else
    v_user := p_target;
  end if;
  return v_user;
end;
$function$;

-- app_private.require_admin: 3 refusal(s)
CREATE OR REPLACE FUNCTION app_private.require_admin()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (select 1 from app_private.admin_users a where a.user_id = v_uid) then
    raise exception 'DZ-E5001: Admins only' using errcode = '42501';
  end if;
  if coalesce(auth.jwt()->>'aal', '') <> 'aal2' then
    raise exception 'DZ-E5002: Sign in with two-step verification to use admin tools' using errcode = '42501';
  end if;
  if not app_private.admin_code_fresh() then
    raise exception 'DZ-E5003: Enter a new two-step code to keep using admin tools' using errcode = '42501';
  end if;
  return v_uid;
end;
$function$;

-- app_private.require_current_terms: 1 refusal(s)
CREATE OR REPLACE FUNCTION app_private.require_current_terms(p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if exists (
    select 1 from public.legal_documents d
    where not exists (
      select 1 from public.legal_acceptances a
      where a.user_id = p_user and a.document = d.document and a.version = d.version
    )
  ) then
    raise exception using errcode = 'P0001',
      message = 'DZ-E1010: Please accept the updated Terms of Use and Privacy Policy to continue.';
  end if;
end;
$function$;

-- app_private.require_empty_listing_folder: 2 refusal(s)
CREATE OR REPLACE FUNCTION app_private.require_empty_listing_folder()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if tg_table_schema <> 'public' or tg_table_name <> 'listings' or tg_op <> 'DELETE'
     or (v_uid is not null and v_uid <> old.lender_id)
     or (v_uid is null and session_user not in
       ('postgres', 'supabase_admin', 'supabase_auth_admin')
       and coalesce(pg_catalog.current_setting('role', true), '') <> 'service_role') then
    raise exception 'DZ-E2001: Not your listing' using errcode = '42501';
  end if;
  -- DELETE already holds the parent row lock. This volatile trigger sees
  -- committed metadata from uploads that held a conflicting KEY SHARE lock.
  if exists (
    select 1 from storage.objects o
    where o.bucket_id = 'listing-photos'
      and pg_catalog.split_part(o.name, '/', 1) = old.id::text
  ) then
    raise exception 'DZ-E2063: Remove listing photos through the Storage API before deleting the listing.'
      using errcode = '23503';
  end if;
  return old;
end;
$function$;

-- app_private.require_measurements_consent: 1 refusal(s)
CREATE OR REPLACE FUNCTION app_private.require_measurements_consent()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_adds boolean;
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'UPDATE' then
      new.measurements_consent_at := old.measurements_consent_at;
    else
      -- An upsert reaches this INSERT trigger before its conflict turns it into an update,
      -- so the consent comes from the row that is already there (none for a new row).
      new.measurements_consent_at := (
        select p.measurements_consent_at from public.private_profiles p where p.user_id = new.user_id
      );
    end if;
  end if;

  if tg_op = 'UPDATE' then
    v_adds := (new.chest_cm is not null and new.chest_cm is distinct from old.chest_cm)
      or (new.waist_cm is not null and new.waist_cm is distinct from old.waist_cm)
      or (new.hips_cm is not null and new.hips_cm is distinct from old.hips_cm)
      or (new.shoulder_cm is not null and new.shoulder_cm is distinct from old.shoulder_cm)
      or (new.height_cm is not null and new.height_cm is distinct from old.height_cm)
      or (new.inseam_cm is not null and new.inseam_cm is distinct from old.inseam_cm);
  else
    v_adds := pg_catalog.num_nonnulls(new.chest_cm, new.waist_cm, new.hips_cm,
      new.shoulder_cm, new.height_cm, new.inseam_cm) > 0;
  end if;

  if v_adds and new.measurements_consent_at is null then
    raise exception 'DZ-E1020: Give consent before saving your measurements.' using errcode = 'P0001';
  end if;
  return new;
end;
$function$;

-- app_private.require_reason: 1 refusal(s)
CREATE OR REPLACE FUNCTION app_private.require_reason(p_reason text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
begin
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'DZ-E5006: Give a reason (at least 3 characters)' using errcode = '22023', hint = 'reason';
  end if;
  return pg_catalog.left(pg_catalog.btrim(p_reason), 500);
end;
$function$;

-- app_private.validate_conversation: 3 refusal(s)
CREATE OR REPLACE FUNCTION app_private.validate_conversation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if tg_table_schema <> 'public' or tg_table_name <> 'conversations' or tg_op <> 'INSERT'
     or v_uid is null or new.renter_id <> v_uid then
    raise exception 'DZ-E3001: Invalid conversation' using errcode = '42501';
  end if;

  if new.lender_id is null then
    select l.lender_id into new.lender_id from public.listings l where l.id = new.listing_id;
  end if;

  if new.renter_id = new.lender_id then
    raise exception 'DZ-E3001: Invalid conversation' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.listings l
    where l.id = new.listing_id and l.lender_id = new.lender_id and l.status = 'active'
  ) or app_private.is_blocked(new.renter_id, new.lender_id) then
    raise exception 'DZ-E3002: Listing unavailable for conversation' using errcode = '42501';
  end if;
  return new;
end;
$function$;

-- app_private.vision_publish_gate: 4 refusal(s)
CREATE OR REPLACE FUNCTION app_private.vision_publish_gate()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_scan record;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.auto_paused_reason := null;
  end if;
  if new.status <> 'active' or (tg_op = 'UPDATE' and old.status = 'active') then
    return new;
  end if;
  if coalesce((select s.enabled from public.app_settings s where s.key = 'vision_required'), false) then
    select ls.status, ls.verdict, ls.reason, ls.admin_decision, ls.photo_set_hash into v_scan
      from public.listing_scans ls
      where ls.listing_id = new.id
      order by ls.created_at desc
      limit 1;
    if not found then
      raise exception 'DZ-E2020: Check the photos before publishing this listing.' using errcode = 'P0001';
    end if;
    if v_scan.status in ('queued', 'running') then
      raise exception 'DZ-E2021: The photo check is still running. Try again in a minute.' using errcode = 'P0001';
    end if;
    if v_scan.photo_set_hash is distinct from app_private.photo_set_hash(new.id) then
      raise exception 'DZ-E2022: The photos changed after they were checked. Check them again before publishing.'
        using errcode = 'P0001';
    end if;
    if not (v_scan.admin_decision = 'approved' or (v_scan.admin_decision is null and v_scan.verdict = 'allowed')) then
      raise exception 'DZ-E2023: This listing can''t be published yet: %', v_scan.reason using errcode = 'P0001';
    end if;
  end if;
  new.auto_paused_reason := null;
  return new;
end;
$function$;

-- public.accept_legal: 2 refusal(s)
CREATE OR REPLACE FUNCTION public.accept_legal(p_platform text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'DZ-E1001: Not signed in' using errcode = '42501';
  end if;
  if p_platform is null or p_platform not in ('web', 'android', 'ios') then
    raise exception 'DZ-E1011: Invalid platform' using errcode = '22023', hint = 'platform';
  end if;
  insert into public.legal_acceptances (user_id, document, version, platform)
  select v_uid, d.document, d.version, p_platform
  from public.legal_documents d
  on conflict (user_id, document, version) do nothing;
end;
$function$;

-- public.admin_create_takedown: 1 refusal(s)
CREATE OR REPLACE FUNCTION public.admin_create_takedown(p_claimant_name text, p_claimant_contact text, p_work text, p_urls text[] DEFAULT '{}'::text[], p_listing_ids uuid[] DEFAULT '{}'::uuid[], p_received_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin uuid := app_private.require_admin();
  v_id uuid;
begin
  if pg_catalog.btrim(coalesce(p_claimant_name, '')) = '' or pg_catalog.btrim(coalesce(p_claimant_contact, '')) = ''
     or pg_catalog.btrim(coalesce(p_work, '')) = '' then
    raise exception 'DZ-E5040: Claimant name, contact and the work are required' using errcode = '22023';
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

-- public.admin_decide_scan: 3 refusal(s)
CREATE OR REPLACE FUNCTION public.admin_decide_scan(p_scan_id uuid, p_decision text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin uuid := app_private.require_admin();
  v_reason text := app_private.require_reason(p_reason);
  v_scan public.listing_scans%rowtype;
  v_after jsonb;
begin
  if p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception 'DZ-E5033: Decide approved or rejected' using errcode = '22023';
  end if;
  select * into v_scan from public.listing_scans s where s.id = p_scan_id for update;
  if not found then
    raise exception 'DZ-E5031: Photo check not found' using errcode = 'P0002';
  end if;
  if v_scan.status <> 'done' then
    raise exception 'DZ-E5032: This photo check hasn''t finished' using errcode = 'P0001';
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

-- public.admin_dismiss_report: 1 refusal(s)
CREATE OR REPLACE FUNCTION public.admin_dismiss_report(p_report_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin uuid := app_private.require_admin();
  v_reason text := app_private.require_reason(p_reason);
  v_after jsonb;
begin
  if p_report_id is null then
    raise exception 'DZ-E5014: Pick a report' using errcode = '22023';
  end if;
  v_after := app_private.close_report(p_report_id, 'dismissed', v_reason, v_admin);
  perform app_private.log_admin_action(v_admin, 'dismiss_report', 'report', p_report_id::text, v_reason,
    '{"status": "open"}'::jsonb, v_after);
  return v_after;
end;
$function$;

-- public.admin_find_user: 1 refusal(s)
CREATE OR REPLACE FUNCTION public.admin_find_user(p_query text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin uuid := app_private.require_admin();
  v_query text := pg_catalog.btrim(coalesce(p_query, ''));
  v_rows jsonb;
begin
  if pg_catalog.char_length(v_query) < 3 then
    raise exception 'DZ-E5052: Search for an email, handle or account id' using errcode = '22023';
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
      'listings_held', (select pg_catalog.count(*) from public.listings l where l.lender_id = p.id and l.hold is not null),
      'age_check', (select pg_catalog.jsonb_build_object('source', c.source, 'result', c.result,
                      'platform', c.platform, 'checked_at', c.checked_at)
                    from public.age_checks c where c.user_id = p.id order by c.id desc limit 1),
      'age_blocked', app_private.age_blocked(p.id))), '[]'::jsonb)
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

-- public.admin_hide_listing: 1 refusal(s)
CREATE OR REPLACE FUNCTION public.admin_hide_listing(p_listing_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin uuid := app_private.require_admin();
  v_reason text := app_private.require_reason(p_reason);
  v_before jsonb;
  v_after jsonb;
begin
  select pg_catalog.jsonb_build_object('status', l.status, 'hold', l.hold) into v_before
  from public.listings l where l.id = p_listing_id;
  if v_before is null then
    raise exception 'DZ-E5030: Listing not found' using errcode = 'P0002';
  end if;
  perform app_private.hold_listing(p_listing_id, 'hidden', v_reason);
  select pg_catalog.jsonb_build_object('status', l.status, 'hold', l.hold) into v_after
  from public.listings l where l.id = p_listing_id;
  perform app_private.log_admin_action(v_admin, 'hide_listing', 'listing', p_listing_id::text, v_reason, v_before, v_after);
  return v_after;
end;
$function$;

-- public.admin_record_ban: 2 refusal(s)
CREATE OR REPLACE FUNCTION public.admin_record_ban(p_user_id uuid, p_banned boolean, p_reason text, p_report_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin uuid := app_private.require_admin();
  v_reason text := app_private.require_reason(p_reason);
  v_before jsonb := app_private.profile_state(p_user_id);
  v_after jsonb;
begin
  if v_before is null then
    raise exception 'DZ-E5020: User not found' using errcode = 'P0002';
  end if;
  if p_user_id = v_admin then
    raise exception 'DZ-E5021: Admins can''t ban themselves' using errcode = 'P0001';
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

-- public.admin_record_counter_notice: 2 refusal(s)
CREATE OR REPLACE FUNCTION public.admin_record_counter_notice(p_takedown_id uuid, p_notice text, p_received_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin uuid := app_private.require_admin();
  v_before jsonb;
  v_after jsonb;
begin
  if pg_catalog.btrim(coalesce(p_notice, '')) = '' then
    raise exception 'DZ-E5043: Enter the counter-notice' using errcode = '22023';
  end if;
  select pg_catalog.jsonb_build_object('status', t.status) into v_before from app_private.takedown_requests t where t.id = p_takedown_id;
  if v_before is null then
    raise exception 'DZ-E5041: Takedown request not found' using errcode = 'P0002';
  end if;
  update app_private.takedown_requests set status = 'countered', counter_notice = p_notice,
    counter_received_at = coalesce(p_received_at, pg_catalog.now()), updated_at = pg_catalog.now()
  where id = p_takedown_id;
  v_after := pg_catalog.jsonb_build_object('status', 'countered');
  perform app_private.log_admin_action(v_admin, 'record_counter_notice', 'takedown', p_takedown_id::text, null, v_before, v_after);
  return v_after;
end;
$function$;

-- public.admin_remove_photos: 1 refusal(s)
CREATE OR REPLACE FUNCTION public.admin_remove_photos(p_listing_id uuid, p_photo_ids uuid[], p_reason text, p_takedown_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin uuid := app_private.require_admin();
  v_reason text := app_private.require_reason(p_reason);
  v_paths text[];
begin
  if p_photo_ids is null or pg_catalog.cardinality(p_photo_ids) = 0 then
    raise exception 'DZ-E5034: Pick the photos to remove' using errcode = '22023';
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

-- public.admin_remove_reported_content: 2 refusal(s)
CREATE OR REPLACE FUNCTION public.admin_remove_reported_content(p_report_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin uuid := app_private.require_admin();
  v_reason text := app_private.require_reason(p_reason);
  v_report public.reports%rowtype;
  v_before jsonb;
  v_after jsonb;
begin
  select * into v_report from public.reports r where r.id = p_report_id;
  if not found then
    raise exception 'DZ-E5010: Report not found' using errcode = 'P0002';
  end if;
  if v_report.status <> 'open' then
    raise exception 'DZ-E5011: This report is already closed' using errcode = 'P0001';
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

-- public.admin_set_takedown_status: 2 refusal(s)
CREATE OR REPLACE FUNCTION public.admin_set_takedown_status(p_takedown_id uuid, p_status text, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin uuid := app_private.require_admin();
  v_note text := app_private.require_reason(p_note);
  v_before jsonb;
  v_after jsonb;
begin
  if p_status is null or p_status not in ('received', 'actioned', 'rejected', 'countered', 'restored') then
    raise exception 'DZ-E5042: Unknown takedown status' using errcode = '22023';
  end if;
  select pg_catalog.jsonb_build_object('status', t.status) into v_before from app_private.takedown_requests t where t.id = p_takedown_id;
  if v_before is null then
    raise exception 'DZ-E5041: Takedown request not found' using errcode = 'P0002';
  end if;
  update app_private.takedown_requests set status = p_status, updated_at = pg_catalog.now(),
    notes = pg_catalog.concat_ws(E'\n', notes, v_note)
  where id = p_takedown_id;
  v_after := pg_catalog.jsonb_build_object('status', p_status);
  perform app_private.log_admin_action(v_admin, 'set_takedown_status', 'takedown', p_takedown_id::text, v_note, v_before, v_after);
  return v_after;
end;
$function$;

-- public.admin_suspend_user: 3 refusal(s)
CREATE OR REPLACE FUNCTION public.admin_suspend_user(p_user_id uuid, p_days integer, p_reason text, p_report_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin uuid := app_private.require_admin();
  v_reason text := app_private.require_reason(p_reason);
  v_before jsonb := app_private.profile_state(p_user_id);
  v_after jsonb;
begin
  if v_before is null then
    raise exception 'DZ-E5020: User not found' using errcode = 'P0002';
  end if;
  if p_days is null or p_days < 1 or p_days > 3650 then
    raise exception 'DZ-E5023: Suspend for 1 to 3650 days' using errcode = '22023', hint = 'days';
  end if;
  if p_user_id = v_admin then
    raise exception 'DZ-E5022: Admins can''t suspend themselves' using errcode = 'P0001';
  end if;
  perform app_private.set_suspension(p_user_id, pg_catalog.now() + pg_catalog.make_interval(days => p_days), v_reason);
  v_after := app_private.profile_state(p_user_id) || pg_catalog.jsonb_build_object(
    'listings_held', (select pg_catalog.count(*) from public.listings l where l.lender_id = p_user_id and l.hold = 'suspended'),
    'report', app_private.close_report(p_report_id, 'suspended', v_reason, v_admin));
  perform app_private.log_admin_action(v_admin, 'suspend_user', 'user', p_user_id::text, v_reason, v_before, v_after);
  return v_after;
end;
$function$;

-- public.admin_takedown_remove_listing: 2 refusal(s)
CREATE OR REPLACE FUNCTION public.admin_takedown_remove_listing(p_takedown_id uuid, p_listing_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin uuid := app_private.require_admin();
  v_reason text := app_private.require_reason(p_reason);
  v_before jsonb;
  v_after jsonb;
begin
  if not exists (select 1 from app_private.takedown_requests t where t.id = p_takedown_id) then
    raise exception 'DZ-E5041: Takedown request not found' using errcode = 'P0002';
  end if;
  select pg_catalog.jsonb_build_object('status', l.status, 'hold', l.hold) into v_before
  from public.listings l where l.id = p_listing_id;
  if v_before is null then
    raise exception 'DZ-E5030: Listing not found' using errcode = 'P0002';
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

-- public.admin_unhide_listing: 1 refusal(s)
CREATE OR REPLACE FUNCTION public.admin_unhide_listing(p_listing_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin uuid := app_private.require_admin();
  v_reason text := app_private.require_reason(p_reason);
  v_before jsonb;
  v_after jsonb;
begin
  select pg_catalog.jsonb_build_object('status', l.status, 'hold', l.hold) into v_before
  from public.listings l where l.id = p_listing_id;
  if v_before is null then
    raise exception 'DZ-E5030: Listing not found' using errcode = 'P0002';
  end if;
  perform app_private.release_listing(p_listing_id, 'hidden');
  select pg_catalog.jsonb_build_object('status', l.status, 'hold', l.hold) into v_after
  from public.listings l where l.id = p_listing_id;
  perform app_private.log_admin_action(v_admin, 'unhide_listing', 'listing', p_listing_id::text, v_reason, v_before, v_after);
  return v_after;
end;
$function$;

-- public.admin_unsuspend_user: 1 refusal(s)
CREATE OR REPLACE FUNCTION public.admin_unsuspend_user(p_user_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin uuid := app_private.require_admin();
  v_reason text := app_private.require_reason(p_reason);
  v_before jsonb := app_private.profile_state(p_user_id);
  v_after jsonb;
begin
  if v_before is null then
    raise exception 'DZ-E5020: User not found' using errcode = 'P0002';
  end if;
  perform app_private.set_suspension(p_user_id, null, null);
  v_after := app_private.profile_state(p_user_id) || pg_catalog.jsonb_build_object(
    'listings_active', (select pg_catalog.count(*) from public.listings l where l.lender_id = p_user_id and l.status = 'active'));
  perform app_private.log_admin_action(v_admin, 'unsuspend_user', 'user', p_user_id::text, v_reason, v_before, v_after);
  return v_after;
end;
$function$;

-- public.admin_warn_user: 1 refusal(s)
CREATE OR REPLACE FUNCTION public.admin_warn_user(p_user_id uuid, p_note text, p_report_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin uuid := app_private.require_admin();
  v_note text := app_private.require_reason(p_note);
  v_warning uuid;
  v_after jsonb;
begin
  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'DZ-E5020: User not found' using errcode = 'P0002';
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

-- public.block_user: 1 refusal(s)
CREATE OR REPLACE FUNCTION public.block_user(p_handle text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_target_id uuid;
begin
  if v_uid is null then
    raise exception 'DZ-E1001: Not signed in' using errcode = '42501';
  end if;

  select p.id into v_target_id
  from public.profiles p
  where pg_catalog.lower(pg_catalog.btrim(p.studio_handle)) = pg_catalog.lower(pg_catalog.btrim(coalesce(p_handle, '')))
  limit 1;

  if not found or v_target_id = v_uid then
    return;
  end if;

  insert into public.blocks (blocker_id, blocked_id)
  values (v_uid, v_target_id)
  on conflict do nothing;
end;
$function$;

-- public.check_text: 2 refusal(s)
CREATE OR REPLACE FUNCTION public.check_text(p_text text, p_where text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_where is null or p_where not in ('listing', 'profile', 'message', 'report') then
    raise exception 'DZ-E1052: Unknown place for the text check' using errcode = '22023';
  end if;
  if pg_catalog.char_length(coalesce(p_text, '')) > 5000 then
    raise exception 'DZ-E1053: Text too long' using errcode = '22023';
  end if;
  if p_where = 'message' then
    return null;
  end if;
  return app_private.text_refusal(p_text, p_where);
end;
$function$;

-- public.cleanup_record_run: 1 refusal(s)
CREATE OR REPLACE FUNCTION public.cleanup_record_run(p_job text, p_mode text, p_counts jsonb, p_error text, p_started_at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_job not in ('abandoned_drafts', 'orphan_photos') then
    raise exception 'DZ-E9015: Unknown file job' using errcode = '22023';
  end if;
  perform app_private.record_job_run(p_job, p_mode, p_counts, p_error, p_started_at);
end;
$function$;

-- public.export_my_data: 2 refusal(s)
CREATE OR REPLACE FUNCTION public.export_my_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_last timestamp with time zone;
  v_result jsonb;
begin
  if v_uid is null or not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'DZ-E1001: Not signed in' using errcode = '42501';
  end if;

  -- Once per 24 hours. The lock keeps two exports started at the same moment from both passing.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('data_export:' || v_uid::text));
  select max(e.exported_at) into v_last from public.data_exports e where e.user_id = v_uid;
  if v_last is not null and v_last > pg_catalog.now() - interval '24 hours' then
    raise exception using errcode = 'P0001', message =
      'DZ-E7001: You can download your data once a day. Try again after '
      || pg_catalog.to_char((v_last + interval '24 hours') at time zone 'UTC', 'Mon FMDD, YYYY, FMHH12:MI AM')
      || ' UTC.';
  end if;

  select pg_catalog.jsonb_build_object(
    -- Sign-in account (Supabase Auth). The password is never readable, so it isn't here.
    'account', (select pg_catalog.jsonb_build_object(
        'email', u.email, 'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at)
      from auth.users u where u.id = v_uid),

    -- Profile and studio: every column is the caller's own.
    'profile', (select pg_catalog.to_jsonb(p) from public.profiles p where p.id = v_uid),

    -- Measurements, consent time, fit profile, style interests.
    'private_profile', (select pg_catalog.to_jsonb(pp) - 'user_id'
      from public.private_profiles pp where pp.user_id = v_uid),

    -- The caller's listings, with everything attached to them.
    'listings', coalesce((select pg_catalog.jsonb_agg(
        (pg_catalog.to_jsonb(l) - 'lender_id') || pg_catalog.jsonb_build_object(
          'measurements', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
              'label', m.label, 'value', m.value, 'unit', m.unit) order by m.label)
            from public.listing_measurements m where m.listing_id = l.id), '[]'::jsonb),
          'availability', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
              'start_date', a.start_date, 'end_date', a.end_date) order by a.start_date)
            from public.availability a where a.listing_id = l.id), '[]'::jsonb),
          'photos', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
              'id', ph.id, 'storage_path', ph.storage_path, 'position', ph.position, 'slot', ph.slot)
              order by ph.position)
            from public.listing_photos ph where ph.listing_id = l.id), '[]'::jsonb),
          -- Photo checks of this listing; "duplicate" is only true or false, never another listing.
          'photo_checks', coalesce((select pg_catalog.jsonb_agg(
              (pg_catalog.to_jsonb(s) - 'listing_id') || pg_catalog.jsonb_build_object(
                'photos', coalesce((select pg_catalog.jsonb_agg(
                    (pg_catalog.to_jsonb(ps) - 'listing_id' - 'scan_id' - 'fingerprint')
                    || pg_catalog.jsonb_build_object('fingerprint', (ps.fingerprint::text)::jsonb)
                    order by ps.scanned_at, ps.id)
                  from public.photo_scans ps where ps.scan_id = s.id), '[]'::jsonb))
              order by s.created_at)
            from public.listing_scans s where s.listing_id = l.id), '[]'::jsonb))
        order by l.created_at)
      from public.listings l where l.lender_id = v_uid), '[]'::jsonb),

    -- Saved pieces: the title only while the piece is public (active, not blocked either way).
    'saved_pieces', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'listing_id', sl.listing_id,
        'title', case when l.status = 'active' and not exists (
            select 1 from public.blocks b
            where (b.blocker_id = v_uid and b.blocked_id = l.lender_id)
               or (b.blocker_id = l.lender_id and b.blocked_id = v_uid)) then l.title end,
        'saved_at', sl.created_at) order by sl.created_at)
      from public.saved_listings sl left join public.listings l on l.id = sl.listing_id
      where sl.user_id = v_uid), '[]'::jsonb),

    'saved_studios', coalesce((select pg_catalog.jsonb_agg(
        coalesce(app_private.export_person(ss.lender_id), '{}'::jsonb)
        || pg_catalog.jsonb_build_object('saved_at', ss.created_at) order by ss.created_at)
      from public.saved_studios ss where ss.user_id = v_uid), '[]'::jsonb),

    -- Chats the caller is part of, with every message in them.
    'chats', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', c.id,
        'listing_id', c.listing_id,
        'listing_title', l.title,
        'your_role', case when c.renter_id = v_uid then 'renter' else 'lender' end,
        'other_person', app_private.export_person(case when c.renter_id = v_uid then c.lender_id else c.renter_id end),
        'requested_start', c.requested_start,
        'requested_end', c.requested_end,
        'started_at', c.created_at,
        'you_last_read_at', (select r.last_read_at from public.conversation_reads r
                             where r.user_id = v_uid and r.conversation_id = c.id),
        'your_rental_answer', (select pg_catalog.jsonb_build_object('happened', ro.happened, 'answered_at', ro.answered_at)
                               from public.rental_outcomes ro where ro.conversation_id = c.id and ro.user_id = v_uid),
        'messages', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'from', case when m.sender_id = v_uid then 'you' else 'other person' end,
            'text', m.body,
            'sent_at', m.created_at) order by m.created_at, m.id)
          from public.messages m where m.conversation_id = c.id), '[]'::jsonb))
        order by c.created_at)
      from public.conversations c join public.listings l on l.id = c.listing_id
      where v_uid in (c.renter_id, c.lender_id)), '[]'::jsonb),

    'rentals', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', rt.id,
        'chat_id', rt.conversation_id,
        'listing_id', rt.listing_id,
        'listing_title', l.title,
        'your_role', case when rt.renter_id = v_uid then 'renter' else 'lender' end,
        'other_person', app_private.export_person(case when rt.renter_id = v_uid then rt.lender_id else rt.renter_id end),
        'status', rt.status,
        'start_date', rt.start_date,
        'end_date', rt.end_date,
        'last_changed_by', case when rt.updated_by is null then null
                                when rt.updated_by = v_uid then 'you' else 'other person' end,
        'created_at', rt.created_at,
        'updated_at', rt.updated_at) order by rt.created_at)
      from public.rentals rt join public.listings l on l.id = rt.listing_id
      where v_uid in (rt.renter_id, rt.lender_id)), '[]'::jsonb),

    'blocked_people', coalesce((select pg_catalog.jsonb_agg(app_private.export_person(b.blocked_id))
      from public.blocks b where b.blocker_id = v_uid), '[]'::jsonb),

    -- Reports the caller filed. Not reports about them, and not the outcome, admin notes or
    -- evidence (those describe moderation of the other person).
    'reports_filed', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', rp.id,
        'about', rp.target_type,
        'person', app_private.export_person(rp.target_user_id),
        'listing_id', case when rp.target_type = 'listing' then rp.target_id end,
        'reason', rp.reason,
        'details', rp.details,
        'status', rp.status,
        'created_at', rp.created_at) order by rp.created_at)
      from public.reports rp where rp.reporter_id = v_uid), '[]'::jsonb),

    'warnings', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'note', w.note, 'created_at', w.created_at) order by w.created_at)
      from public.user_warnings w where w.user_id = v_uid), '[]'::jsonb),

    'accessory_declarations', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(d) - 'user_id' order by d.created_at)
      from public.accessory_declarations d where d.user_id = v_uid), '[]'::jsonb),

    'listing_declarations', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(d) - 'user_id' order by d.created_at)
      from public.listing_declarations d where d.user_id = v_uid), '[]'::jsonb),

    'legal_acceptances', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'document', la.document, 'version', la.version, 'platform', la.platform, 'accepted_at', la.accepted_at)
        order by la.accepted_at)
      from public.legal_acceptances la where la.user_id = v_uid), '[]'::jsonb),

    'age_checks', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'source', ac.source, 'result', ac.result, 'platform', ac.platform, 'checked_at', ac.checked_at)
        order by ac.id)
      from public.age_checks ac where ac.user_id = v_uid), '[]'::jsonb),

    'notification_settings', (select pg_catalog.jsonb_build_object(
        'messages', ns.messages, 'show_message_text', ns.show_message_text, 'updated_at', ns.updated_at)
      from public.notification_settings ns where ns.user_id = v_uid),

    -- Which kinds of phone get notifications. Not the push tokens.
    'devices', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'platform', dt.platform, 'registered_at', dt.created_at, 'last_seen_at', dt.last_seen_at)
        order by dt.created_at)
      from public.device_tokens dt where dt.user_id = v_uid), '[]'::jsonb),

    'suggestion_choices', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'listing_id', se.listing_id, 'field', se.field, 'suggested_from', se.label, 'choice', se.action,
        'created_at', se.created_at) order by se.created_at)
      from public.suggestion_events se where se.user_id = v_uid), '[]'::jsonb),

    'listing_activity', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'listing_id', le.listing_id, 'type', le.type, 'created_at', le.created_at) order by le.created_at)
      from public.listing_events le where le.user_id = v_uid), '[]'::jsonb),

    'earlier_exports', coalesce((select pg_catalog.jsonb_agg(e.exported_at order by e.exported_at)
      from public.data_exports e where e.user_id = v_uid), '[]'::jsonb)
  ) into v_result;

  insert into public.data_exports (user_id) values (v_uid);
  return v_result;
end;
$function$;

-- public.fit_listings: 1 refusal(s)
CREATE OR REPLACE FUNCTION public.fit_listings(p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_radius_miles double precision DEFAULT NULL::double precision, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, title text, price numeric, distance integer, city text, category text, cover_photo_path text, studio_name text, studio_handle text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_profile public.private_profiles%rowtype;
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 30);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if v_uid is null then
    raise exception 'DZ-E1001: Not signed in' using errcode = '42501';
  end if;

  select * into v_profile from public.private_profiles where user_id = v_uid;

  if v_profile.chest_cm is null and v_profile.waist_cm is null
     and v_profile.hips_cm is null and v_profile.shoulder_cm is null then
    return;
  end if;

  return query
  with candidate_matches as (
    select
      l.id as listing_id,
      match_calc.part
    from public.listings l
    join public.listing_measurements lm on lm.listing_id = l.id
    cross join lateral (
      select
        case
          when pg_catalog.lower(lm.label) like '%shoulder%' then 'shoulder'
          when pg_catalog.lower(lm.label) like '%chest%'
            or pg_catalog.lower(lm.label) like '%bust%'
            or pg_catalog.lower(lm.label) like '%pit to pit%'
            or pg_catalog.lower(lm.label) like '%pit-to-pit%' then 'chest'
          when pg_catalog.lower(lm.label) like '%waist%' then 'waist'
          when pg_catalog.lower(lm.label) like '%hip%' then 'hips'
          else null
        end as part,
        case
          when lm.unit = 'in' then lm.value * 2.54
          else lm.value
        end * case
          when pg_catalog.lower(lm.label) like '%flat%'
               and pg_catalog.lower(lm.label) not like '%shoulder%' then 2.0
          else 1.0
        end as garment_cm
    ) parsed
    cross join lateral (
      select
        case parsed.part
          when 'chest' then v_profile.chest_cm
          when 'waist' then v_profile.waist_cm
          when 'hips' then v_profile.hips_cm
          when 'shoulder' then v_profile.shoulder_cm
          else null
        end as body_cm,
        case l.category
          when 'Career & Professional' then
            case parsed.part
              when 'chest' then 4.0 when 'waist' then 2.0 when 'hips' then 4.0 when 'shoulder' then -1.0 else null end
          when 'Occasion & Party' then
            case parsed.part
              when 'chest' then 0.0 when 'waist' then 0.0 when 'hips' then 0.0 when 'shoulder' then -2.0 else null end
          when 'Cultural & Traditional' then
            case parsed.part
              when 'chest' then 4.0 when 'waist' then 4.0 when 'hips' then 6.0 when 'shoulder' then -1.0 else null end
          when 'Outerwear' then
            case parsed.part
              when 'chest' then 10.0 when 'waist' then 8.0 when 'hips' then 8.0 when 'shoulder' then 0.0 else null end
          else
            case parsed.part
              when 'chest' then 4.0 when 'waist' then 0.0 when 'hips' then 2.0 when 'shoulder' then -2.0 else null end
        end as ease_min,
        case l.category
          when 'Career & Professional' then
            case parsed.part
              when 'chest' then 14.0 when 'waist' then 12.0 when 'hips' then 14.0 when 'shoulder' then 3.0 else null end
          when 'Occasion & Party' then
            case parsed.part
              when 'chest' then 8.0 when 'waist' then 6.0 when 'hips' then 10.0 when 'shoulder' then 2.0 else null end
          when 'Cultural & Traditional' then
            case parsed.part
              when 'chest' then 16.0 when 'waist' then 16.0 when 'hips' then 20.0 when 'shoulder' then 3.0 else null end
          when 'Outerwear' then
            case parsed.part
              when 'chest' then 28.0 when 'waist' then 30.0 when 'hips' then 30.0 when 'shoulder' then 5.0 else null end
          else
            case parsed.part
              when 'chest' then 20.0 when 'waist' then 14.0 when 'hips' then 18.0 when 'shoulder' then 4.0 else null end
        end as ease_max
    ) ease
    cross join lateral (
      select
        parsed.part,
        (parsed.garment_cm - ease.body_cm) as extra
    ) match_calc
    where l.status = 'active'
      and l.category <> 'Accessories'
      and l.lender_id <> v_uid
      and not exists (
        select 1 from public.blocks bl
        where (bl.blocker_id = v_uid and bl.blocked_id = l.lender_id)
           or (bl.blocker_id = l.lender_id and bl.blocked_id = v_uid)
      )
      and parsed.part is not null
      and ease.body_cm is not null
      and match_calc.extra >= ease.ease_min
      and match_calc.extra <= ease.ease_max
  ),
  matched_listings as (
    select
      cm.listing_id
    from candidate_matches cm
    group by cm.listing_id
    having pg_catalog.count(distinct cm.part) >= 2
  ),
  results as (
    select
      l.id,
      l.title,
      l.price_usd as price,
      case
        when p_lat is not null and p_lng is not null then
          pg_catalog.round(
            3959.0 * 2.0 * pg_catalog.asin(pg_catalog.sqrt(
              pg_catalog.power(pg_catalog.sin(pg_catalog.radians(l.approx_lat - p_lat) / 2.0), 2) +
              pg_catalog.cos(pg_catalog.radians(p_lat)) * pg_catalog.cos(pg_catalog.radians(l.approx_lat)) *
              pg_catalog.power(pg_catalog.sin(pg_catalog.radians(l.approx_lng - p_lng) / 2.0), 2)
            ))
          )::integer
        else null
      end as distance,
      coalesce(nullif(l.city, ''), nullif(p.city, '')) as city,
      l.category,
      (
        select lp.storage_path
        from public.listing_photos lp
        where lp.listing_id = l.id
        order by lp.position asc, lp.id asc
        limit 1
      ) as cover_photo_path,
      coalesce(nullif(p.studio_name, ''), nullif(p.display_name, ''), 'Studio') as studio_name,
      p.studio_handle,
      l.created_at
    from matched_listings ml
    join public.listings l on l.id = ml.listing_id
    join public.profiles p on p.id = l.lender_id
  )
  select
    r.id,
    r.title,
    r.price,
    r.distance,
    r.city,
    r.category,
    r.cover_photo_path,
    r.studio_name,
    r.studio_handle
  from results r
  where (p_radius_miles is null or (r.distance is not null and r.distance <= p_radius_miles))
  order by r.distance asc nulls last, r.created_at desc
  limit v_limit
  offset v_offset;
end;
$function$;

-- public.get_studio: 1 refusal(s)
CREATE OR REPLACE FUNCTION public.get_studio(p_handle text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision)
 RETURNS TABLE(studio_name text, studio_handle text, studio_bio text, style_tags text[], city text, pickup_area text, rental_count integer, reply_minutes integer, is_saved boolean, listings jsonb, is_own boolean, since text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_lender record;
  v_rental_count integer;
  v_reply_minutes integer;
  v_is_saved boolean;
  v_listings jsonb;
  v_is_own boolean;
  v_since text;
begin
  if v_uid is null then
    raise exception 'DZ-E1001: Not signed in' using errcode = '42501';
  end if;

  select p.* into v_lender
  from public.profiles p
  where pg_catalog.lower(pg_catalog.btrim(p.studio_handle)) = pg_catalog.lower(pg_catalog.btrim(coalesce(p_handle, '')))
  limit 1;

  if not found then
    return;
  end if;

  if exists (
    select 1 from public.blocks bl
    where (bl.blocker_id = v_uid and bl.blocked_id = v_lender.id)
       or (bl.blocker_id = v_lender.id and bl.blocked_id = v_uid)
  ) then
    return;
  end if;

  v_is_own := (v_lender.id = v_uid);
  v_since := case
    when v_lender.created_at is not null then 'Since ' || to_char(v_lender.created_at, 'Mon YYYY')
    else null
  end;

  select pg_catalog.count(*)::integer into v_rental_count
  from public.rentals r
  where r.lender_id = v_lender.id and r.status in ('active', 'returned');

  with asked as (
    select c.id,
           (select pg_catalog.min(m.created_at) from public.messages m
            where m.conversation_id = c.id and m.sender_id = c.renter_id) as asked_at
    from public.conversations c
    where c.lender_id = v_lender.id and c.created_at > pg_catalog.now() - interval '90 days'
  ), replies as (
    select pg_catalog.date_part('epoch', (
             (select pg_catalog.min(m.created_at) from public.messages m
              where m.conversation_id = a.id and m.sender_id = v_lender.id and m.created_at > a.asked_at)
             - a.asked_at)) / 60 as minutes
    from asked a
    where a.asked_at is not null
  )
  select case when pg_catalog.count(minutes) >= 3
              then pg_catalog.round(pg_catalog.percentile_cont(0.5) within group (order by minutes))::integer end
  into v_reply_minutes
  from replies;

  select exists (
    select 1 from public.saved_studios ss
    where ss.user_id = v_uid and ss.lender_id = v_lender.id
  ) into v_is_saved;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', act.id,
        'title', act.title,
        'price', act.price_usd,
        'distance', case
          when p_lat is not null and p_lng is not null then
            pg_catalog.round(
              3959.0 * 2.0 * pg_catalog.asin(pg_catalog.sqrt(
                pg_catalog.power(pg_catalog.sin(pg_catalog.radians(act.approx_lat - p_lat) / 2.0), 2) +
                pg_catalog.cos(pg_catalog.radians(p_lat)) * pg_catalog.cos(pg_catalog.radians(act.approx_lat)) *
                pg_catalog.power(pg_catalog.sin(pg_catalog.radians(act.approx_lng - p_lng) / 2.0), 2)
              ))
            )::integer
          else null
        end,
        'city', coalesce(nullif(act.city, ''), nullif(v_lender.city, '')),
        'category', act.category,
        'cover_photo_path', (
          select lp.storage_path
          from public.listing_photos lp
          where lp.listing_id = act.id
          order by lp.position asc, lp.id asc
          limit 1
        ),
        'studio_name', coalesce(nullif(v_lender.studio_name, ''), nullif(v_lender.display_name, ''), 'Studio'),
        'studio_handle', v_lender.studio_handle
      ) order by act.created_at desc
    ),
    '[]'::jsonb
  ) into v_listings
  from (
    select * from public.listings l
    where l.lender_id = v_lender.id and l.status = 'active'
    order by l.created_at desc
    limit 30
  ) act;

  return query select
    coalesce(nullif(v_lender.studio_name, ''), nullif(v_lender.display_name, ''), 'Studio'),
    v_lender.studio_handle,
    v_lender.studio_bio,
    v_lender.style_tags,
    v_lender.city,
    v_lender.pickup_area,
    coalesce(v_rental_count, 0),
    v_reply_minutes,
    v_is_saved,
    v_listings,
    v_is_own,
    v_since;
end;
$function$;

-- public.give_measurements_consent: 1 refusal(s)
CREATE OR REPLACE FUNCTION public.give_measurements_consent()
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_at timestamp with time zone;
begin
  if v_uid is null then
    raise exception 'DZ-E1001: Not signed in' using errcode = '42501';
  end if;
  insert into public.private_profiles as pp (user_id, measurements_consent_at)
  values (v_uid, pg_catalog.now())
  on conflict (user_id) do update
    set measurements_consent_at = coalesce(pp.measurements_consent_at, pg_catalog.now())
  returning pp.measurements_consent_at into v_at;
  return v_at;
end;
$function$;

-- public.handle_new_user: 1 refusal(s)
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_lat double precision;
  v_lng double precision;
begin
  if tg_table_schema <> 'auth' or tg_table_name <> 'users'
     or tg_op <> 'INSERT' or pg_catalog.pg_trigger_depth() < 1
     or (v_uid is not null and v_uid <> new.id) then
    raise exception 'DZ-E1009: Invalid profile creation context' using errcode = '42501';
  end if;

  if new.raw_user_meta_data->>'approx_lat' ~ '^-?[0-9]{1,3}([.][0-9]+)?$'
     and new.raw_user_meta_data->>'approx_lng' ~ '^-?[0-9]{1,3}([.][0-9]+)?$' then
    v_lat := pg_catalog.round((new.raw_user_meta_data->>'approx_lat')::numeric, 2);
    v_lng := pg_catalog.round((new.raw_user_meta_data->>'approx_lng')::numeric, 2);
    if v_lat not between -90 and 90 or v_lng not between -180 and 180 then
      v_lat := null;
      v_lng := null;
    end if;
  end if;

  insert into public.profiles
    (id, display_name, role, adult_confirmed, city, approx_lat, approx_lng)
  values
    (new.id, coalesce(new.raw_user_meta_data->>'display_name', ''),
     coalesce(new.raw_user_meta_data->>'role', 'renter'),
     coalesce((new.raw_user_meta_data->>'adult_confirmed')::boolean, false),
     nullif(new.raw_user_meta_data->>'city', ''), v_lat, v_lng);
  return new;
end;
$function$;

-- public.mark_activity_seen: 1 refusal(s)
CREATE OR REPLACE FUNCTION public.mark_activity_seen()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'DZ-E1001: Not signed in' using errcode = '42501';
  end if;
  perform pg_catalog.set_config('dzirent.age_gate_skip', 'on', true);
  insert into public.private_profiles (user_id, activity_seen_at)
  values (v_uid, pg_catalog.now())
  on conflict (user_id) do update set activity_seen_at = pg_catalog.now();
  perform pg_catalog.set_config('dzirent.age_gate_skip', 'off', true);
end;
$function$;

-- public.mark_conversation_read: 1 refusal(s)
CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'DZ-E1001: Not signed in' using errcode = '42501';
  end if;
  insert into public.conversation_reads (user_id, conversation_id, last_read_at)
  values (v_uid, p_conversation_id, pg_catalog.now())
  on conflict (user_id, conversation_id) do update set last_read_at = pg_catalog.now();
end;
$function$;

-- public.my_block_peer_ids: 1 refusal(s)
CREATE OR REPLACE FUNCTION public.my_block_peer_ids()
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'DZ-E1001: Not signed in' using errcode = '42501';
  end if;
  return query
    select bl.blocked_id from public.blocks bl where bl.blocker_id = v_uid
    union
    select bl.blocker_id from public.blocks bl where bl.blocked_id = v_uid;
end;
$function$;

-- public.my_blocked_users: 1 refusal(s)
CREATE OR REPLACE FUNCTION public.my_blocked_users()
 RETURNS TABLE(blocked_id uuid, display_name text, studio_name text, studio_handle text, city text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'DZ-E1001: Not signed in' using errcode = '42501';
  end if;

  return query
  select
    b.blocked_id,
    coalesce(nullif(p.display_name, ''), nullif(p.studio_name, ''), 'Dzirent member') as display_name,
    p.studio_name,
    p.studio_handle,
    p.city
  from public.blocks b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = v_uid;
end;
$function$;

-- public.my_conversations: 1 refusal(s)
CREATE OR REPLACE FUNCTION public.my_conversations(p_conversation_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, listing_id uuid, listing_title text, cover_photo_path text, price numeric, other_name text, other_handle text, last_message text, last_message_at timestamp with time zone, unread boolean, requested_start date, requested_end date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 30);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if v_uid is null then
    raise exception 'DZ-E1001: Not signed in' using errcode = '42501';
  end if;

  return query
  with convs as (
    select
      c.id,
      c.listing_id,
      c.renter_id,
      c.lender_id,
      c.requested_start,
      c.requested_end,
      c.created_at,
      case when c.renter_id = v_uid then c.lender_id else c.renter_id end as other_id
    from public.conversations c
    where (c.renter_id = v_uid or c.lender_id = v_uid)
      and (p_conversation_id is null or c.id = p_conversation_id)
  )
  select
    c.id,
    c.listing_id,
    l.title as listing_title,
    (
      select lp.storage_path
      from public.listing_photos lp
      where lp.listing_id = l.id
      order by lp.position asc, lp.id asc
      limit 1
    ) as cover_photo_path,
    l.price_usd as price,
    coalesce(nullif(other_p.studio_name, ''), nullif(other_p.display_name, ''), 'User') as other_name,
    other_p.studio_handle as other_handle,
    last_msg.body as last_message,
    last_msg.created_at as last_message_at,
    coalesce(
      exists (
        select 1 from public.messages m
        where m.conversation_id = c.id
          and m.sender_id <> v_uid
          and (cr.last_read_at is null or m.created_at > cr.last_read_at)
      ),
      false
    ) as unread,
    c.requested_start,
    c.requested_end
  from convs c
  join public.listings l on l.id = c.listing_id
  join public.profiles other_p on other_p.id = c.other_id
  left join public.conversation_reads cr on cr.conversation_id = c.id and cr.user_id = v_uid
  left join lateral (
    select m.body, m.created_at
    from public.messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) last_msg on true
  where not exists (
    select 1 from public.blocks bl
    where (bl.blocker_id = v_uid and bl.blocked_id = c.other_id)
       or (bl.blocker_id = c.other_id and bl.blocked_id = v_uid)
  )
  order by coalesce(last_msg.created_at, c.created_at) desc
  limit v_limit
  offset v_offset;
end;
$function$;

-- public.my_saved_listings: 1 refusal(s)
CREATE OR REPLACE FUNCTION public.my_saved_listings(p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_limit integer DEFAULT 30, p_offset integer DEFAULT 0)
 RETURNS TABLE(listing_id uuid, is_available boolean, title text, price numeric, distance integer, city text, category text, cover_photo_path text, studio_name text, studio_handle text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 30);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if v_uid is null then
    raise exception 'DZ-E1001: Not signed in' using errcode = '42501';
  end if;

  return query
  select
    sl.listing_id,
    case
      when l.id is not null
       and l.status = 'active'
       and not exists (
         select 1 from public.blocks bl
         where (bl.blocker_id = v_uid and bl.blocked_id = l.lender_id)
            or (bl.blocker_id = l.lender_id and bl.blocked_id = v_uid)
       ) then true
      else false
    end as is_available,
    case
      when l.id is not null
       and l.status = 'active'
       and not exists (
         select 1 from public.blocks bl
         where (bl.blocker_id = v_uid and bl.blocked_id = l.lender_id)
            or (bl.blocker_id = l.lender_id and bl.blocked_id = v_uid)
       ) then l.title
      else null
    end as title,
    case
      when l.id is not null and l.status = 'active' then l.price_usd
      else null
    end as price,
    case
      when l.id is not null and l.status = 'active' and p_lat is not null and p_lng is not null then
        pg_catalog.round(
          3959.0 * 2.0 * pg_catalog.asin(pg_catalog.sqrt(
            pg_catalog.power(pg_catalog.sin(pg_catalog.radians(l.approx_lat - p_lat) / 2.0), 2) +
            pg_catalog.cos(pg_catalog.radians(p_lat)) * pg_catalog.cos(pg_catalog.radians(l.approx_lat)) *
            pg_catalog.power(pg_catalog.sin(pg_catalog.radians(l.approx_lng - p_lng) / 2.0), 2)
          ))
        )::integer
      else null
    end as distance,
    case
      when l.id is not null and l.status = 'active' then coalesce(nullif(l.city, ''), nullif(p.city, ''))
      else null
    end as city,
    case
      when l.id is not null and l.status = 'active' then l.category
      else null
    end as category,
    case
      when l.id is not null and l.status = 'active' then (
        select lp.storage_path
        from public.listing_photos lp
        where lp.listing_id = l.id
        order by lp.position asc, lp.id asc
        limit 1
      )
      else null
    end as cover_photo_path,
    case
      when l.id is not null and l.status = 'active' then coalesce(nullif(p.studio_name, ''), nullif(p.display_name, ''), 'Studio')
      else null
    end as studio_name,
    case
      when l.id is not null and l.status = 'active' then p.studio_handle
      else null
    end as studio_handle,
    sl.created_at
  from public.saved_listings sl
  left join public.listings l on l.id = sl.listing_id
  left join public.profiles p on p.id = l.lender_id
  where sl.user_id = v_uid
  order by sl.created_at desc
  limit v_limit
  offset v_offset;
end;
$function$;

-- public.my_saved_studios: 1 refusal(s)
CREATE OR REPLACE FUNCTION public.my_saved_studios(p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(studio_name text, studio_handle text, city text, cover_photo_path text, piece_count integer, distance integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 30);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if v_uid is null then
    raise exception 'DZ-E1001: Not signed in' using errcode = '42501';
  end if;

  return query
  select
    coalesce(nullif(p.studio_name, ''), nullif(p.display_name, ''), 'Studio') as studio_name,
    p.studio_handle,
    p.city,
    (
      select lp.storage_path
      from public.listings l
      join public.listing_photos lp on lp.listing_id = l.id
      where l.lender_id = p.id and l.status = 'active'
      order by l.created_at desc, lp.position asc
      limit 1
    ) as cover_photo_path,
    (
      select pg_catalog.count(*)::integer
      from public.listings l
      where l.lender_id = p.id and l.status = 'active'
    ) as piece_count,
    case
      when p_lat is not null and p_lng is not null and p.approx_lat is not null and p.approx_lng is not null then
        pg_catalog.round(
          3959.0 * 2.0 * pg_catalog.asin(pg_catalog.sqrt(
            pg_catalog.power(pg_catalog.sin(pg_catalog.radians(p.approx_lat - p_lat) / 2.0), 2) +
            pg_catalog.cos(pg_catalog.radians(p_lat)) * pg_catalog.cos(pg_catalog.radians(p.approx_lat)) *
            pg_catalog.power(pg_catalog.sin(pg_catalog.radians(p.approx_lng - p_lng) / 2.0), 2)
          ))
        )::integer
      else null
    end as distance
  from public.saved_studios ss
  join public.profiles p on p.id = ss.lender_id
  where ss.user_id = v_uid
    and not exists (
      select 1 from public.blocks bl
      where (bl.blocker_id = v_uid and bl.blocked_id = p.id)
         or (bl.blocker_id = p.id and bl.blocked_id = v_uid)
    )
  order by ss.created_at desc
  limit v_limit
  offset v_offset;
end;
$function$;

-- public.needs_legal_acceptance: 1 refusal(s)
CREATE OR REPLACE FUNCTION public.needs_legal_acceptance()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'DZ-E1001: Not signed in' using errcode = '42501';
  end if;
  return exists (
    select 1 from public.legal_documents d
    where not exists (
      select 1 from public.legal_acceptances a
      where a.user_id = v_uid and a.document = d.document and a.version = d.version
    )
  );
end;
$function$;

-- public.record_accessory_declaration: 3 refusal(s)
CREATE OR REPLACE FUNCTION public.record_accessory_declaration(p_full_legal_name text, p_declaration_version integer, p_app_version text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_headers json := nullif(pg_catalog.current_setting('request.headers', true), '')::json;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'DZ-E1001: Not signed in' using errcode = '42501';
  end if;
  if pg_catalog.char_length(pg_catalog.btrim(coalesce(p_full_legal_name, ''))) < 2 then
    raise exception 'DZ-E2041: Type your full legal name' using errcode = '22023', hint = 'full_legal_name';
  end if;
  if coalesce(p_declaration_version, 0) < 1 then
    raise exception 'DZ-E2042: Unknown declaration version' using errcode = '22023';
  end if;
  insert into public.accessory_declarations
    (user_id, email, full_legal_name, declaration_version, app_version,
     city, ip, user_agent, session_id)
  values
    (v_uid,
     coalesce(auth.jwt()->>'email', (select u.email from auth.users u where u.id = v_uid)),
     pg_catalog.left(pg_catalog.btrim(p_full_legal_name), 120), p_declaration_version,
     pg_catalog.left(p_app_version, 40),
     (select nullif(p.city, '') from public.profiles p where p.id = v_uid),
     public.declaration_request_ip(), pg_catalog.left(v_headers->>'user-agent', 400),
     auth.jwt()->>'session_id')
  returning id into v_id;
  return v_id;
end;
$function$;

-- public.record_age_check: 5 refusal(s)
CREATE OR REPLACE FUNCTION public.record_age_check(p_source text, p_result text, p_platform text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_result text := p_result;
  v_adult_confirmed boolean;
  v_last public.age_checks;
  v_was_blocked boolean;
  v_blocked boolean;
begin
  if v_uid is null then
    raise exception 'DZ-E1001: Not signed in' using errcode = '42501';
  end if;
  if p_source is null or p_source not in ('store_signal', 'self_declared') then
    raise exception 'DZ-E1031: Unknown age check source' using errcode = '22023';
  end if;
  if p_result is null or p_result not in ('adult', 'minor', 'unknown') then
    raise exception 'DZ-E1032: Unknown age check result' using errcode = '22023';
  end if;
  if p_platform is null or p_platform not in ('web', 'android', 'ios') then
    raise exception 'DZ-E1012: Unknown platform' using errcode = '22023', hint = 'platform';
  end if;
  select p.adult_confirmed into v_adult_confirmed from public.profiles p where p.id = v_uid;
  if not found then
    raise exception 'DZ-E1001: Not signed in' using errcode = '42501';
  end if;
  -- A self-declared "adult" stands for the 18+ confirmation at sign-up; without it, it's unknown.
  if p_source = 'self_declared' and v_result = 'adult' and not coalesce(v_adult_confirmed, false) then
    v_result := 'unknown';
  end if;
  v_was_blocked := app_private.age_blocked(v_uid);
  -- The same answer again within the hour adds no row (sign-in and app start often come together).
  select c.* into v_last from public.age_checks c where c.user_id = v_uid order by c.id desc limit 1;
  if not found
     or v_last.source <> p_source or v_last.result <> v_result or v_last.platform <> p_platform
     or v_last.checked_at < pg_catalog.now() - interval '1 hour' then
    insert into public.age_checks (user_id, source, result, platform)
    values (v_uid, p_source, v_result, p_platform);
  end if;
  v_blocked := app_private.age_blocked(v_uid);
  -- Newly blocked: the account's listings leave the shop window, so nobody can start a chat with
  -- it. They stay paused when the block ends; the owner republishes them (that clears the reason).
  if v_blocked and not v_was_blocked then
    perform pg_catalog.set_config('dzirent.age_gate_skip', 'on', true);
    update public.listings
      set status = 'paused', auto_paused_reason = 'Paused: Dzirent is only for people 18 and older.'
      where lender_id = v_uid and status = 'active';
    perform pg_catalog.set_config('dzirent.age_gate_skip', 'off', true);
  end if;
  return v_blocked;
end;
$function$;

-- public.record_listing_declaration: 3 refusal(s)
CREATE OR REPLACE FUNCTION public.record_listing_declaration(p_listing_id uuid, p_declaration_version integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'DZ-E1001: Not signed in' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.listings l where l.id = p_listing_id and l.lender_id = v_uid
  ) then
    raise exception 'DZ-E2001: Not your listing' using errcode = '42501';
  end if;
  if coalesce(p_declaration_version, 0) < 1 then
    raise exception 'DZ-E2042: Unknown declaration version' using errcode = '22023';
  end if;
  insert into public.listing_declarations
    (listing_id, user_id, declaration_version, ip, session_id)
  values
    (p_listing_id, v_uid, p_declaration_version,
     public.declaration_request_ip(), auth.jwt()->>'session_id')
  returning id into v_id;
  return v_id;
end;
$function$;

-- public.register_push_token: 3 refusal(s)
CREATE OR REPLACE FUNCTION public.register_push_token(p_token text, p_platform text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_token text := pg_catalog.btrim(coalesce(p_token, ''));
begin
  if v_uid is null then
    raise exception 'DZ-E1001: Not signed in' using errcode = '42501';
  end if;
  if pg_catalog.char_length(v_token) not between 1 and 4096 then
    raise exception 'DZ-E1060: Invalid push token' using errcode = '22023';
  end if;
  if p_platform is null or p_platform not in ('android', 'ios') then
    raise exception 'DZ-E1011: Invalid platform' using errcode = '22023', hint = 'platform';
  end if;
  insert into public.device_tokens as dt (token, user_id, platform)
  values (v_token, v_uid, p_platform)
  on conflict (token) do update set
    created_at = case when dt.user_id = excluded.user_id then dt.created_at else pg_catalog.now() end,
    user_id = excluded.user_id,
    platform = excluded.platform,
    last_seen_at = pg_catalog.now();
end;
$function$;

-- public.report_user: 2 refusal(s)
CREATE OR REPLACE FUNCTION public.report_user(p_handle text, p_reason text, p_details text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_target_id uuid;
  v_clean_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
begin
  if v_uid is null then
    raise exception 'DZ-E1001: Not signed in' using errcode = '42501';
  end if;

  if pg_catalog.char_length(v_clean_reason) < 1 then
    raise exception 'DZ-E5013: Reason is required' using errcode = '22023', hint = 'reason';
  end if;

  select p.id into v_target_id
  from public.profiles p
  where pg_catalog.lower(pg_catalog.btrim(p.studio_handle)) = pg_catalog.lower(pg_catalog.btrim(coalesce(p_handle, '')))
  limit 1;

  if not found or v_target_id = v_uid then
    return;
  end if;

  insert into public.reports (reporter_id, target_type, target_id, reason, details)
  values (v_uid, 'user', v_target_id, v_clean_reason, nullif(pg_catalog.btrim(coalesce(p_details, '')), ''));
end;
$function$;

-- public.request_scan: 4 refusal(s)
CREATE OR REPLACE FUNCTION public.request_scan(p_listing_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'DZ-E1001: Not signed in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.listings l where l.id = p_listing_id and l.lender_id = v_uid) then
    raise exception 'DZ-E2001: Not your listing' using errcode = '42501';
  end if;
  if not exists (select 1 from public.listing_photos p where p.listing_id = p_listing_id) then
    raise exception 'DZ-E2010: Add a photo first' using errcode = '22023';
  end if;
  v_id := app_private.queue_scan(p_listing_id, v_uid);
  if v_id is null then
    raise exception using errcode = 'P0001', message = 'DZ-E9001: You''re doing that too often. Try again in a bit.';
  end if;
  return v_id;
end;
$function$;

-- public.require_accessory_declaration: 1 refusal(s)
CREATE OR REPLACE FUNCTION public.require_accessory_declaration()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.category = 'Accessories' and new.status = 'active'
     and current_user in ('authenticated', 'anon')
     and (tg_op = 'INSERT' or old.status is distinct from 'active'
          or old.category is distinct from new.category)
     and not exists (
       select 1 from public.accessory_declarations d
       where d.user_id = new.lender_id
     ) then
    raise exception 'DZ-E2040: Sign the accessory declaration before listing accessories.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$function$;

-- public.save_studio: 2 refusal(s)
CREATE OR REPLACE FUNCTION public.save_studio(p_handle text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_lender_id uuid;
begin
  if v_uid is null then
    raise exception 'DZ-E1001: Not signed in' using errcode = '42501';
  end if;

  select p.id into v_lender_id
  from public.profiles p
  where pg_catalog.lower(pg_catalog.btrim(p.studio_handle)) = pg_catalog.lower(pg_catalog.btrim(coalesce(p_handle, '')))
  limit 1;

  if not found or v_lender_id = v_uid then
    return;
  end if;

  if exists (
    select 1 from public.blocks bl
    where (bl.blocker_id = v_uid and bl.blocked_id = v_lender_id)
       or (bl.blocker_id = v_lender_id and bl.blocked_id = v_uid)
  ) then
    raise exception 'DZ-E3010: Cannot save blocked studio' using errcode = '42501';
  end if;

  insert into public.saved_studios (user_id, lender_id)
  values (v_uid, v_lender_id)
  on conflict do nothing;
end;
$function$;

-- public.set_conversation_dates: 4 refusal(s)
CREATE OR REPLACE FUNCTION public.set_conversation_dates(p_conversation_id uuid, p_start date, p_end date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_lender_id uuid;
begin
  if v_uid is null then
    raise exception 'DZ-E1001: Not signed in' using errcode = '42501';
  end if;
  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'DZ-E3006: Invalid dates' using errcode = '22023', hint = 'dates';
  end if;
  select c.lender_id into v_lender_id
    from public.conversations c
    where c.id = p_conversation_id and c.renter_id = v_uid;
  if not found then
    raise exception 'DZ-E3007: Only the renter can set dates for this chat' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.blocks bl
    where (bl.blocker_id = v_uid and bl.blocked_id = v_lender_id)
       or (bl.blocker_id = v_lender_id and bl.blocked_id = v_uid)
  ) then
    raise exception 'DZ-E3005: You can''t message this user.' using errcode = '42501';
  end if;
  update public.conversations
    set requested_start = p_start, requested_end = p_end
    where id = p_conversation_id and renter_id = v_uid;
end;
$function$;

-- public.set_flag: 2 refusal(s)
CREATE OR REPLACE FUNCTION public.set_flag(p_key text, p_enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin uuid := app_private.require_admin();
  v_before boolean;
begin
  if p_enabled is null then
    raise exception 'DZ-E5050: Say on or off' using errcode = '22023';
  end if;
  select s.enabled into v_before from public.app_settings s where s.key = p_key for update;
  if not found then
    raise exception 'DZ-E5051: Unknown flag' using errcode = 'P0002';
  end if;
  update public.app_settings set enabled = p_enabled, updated_at = pg_catalog.now() where key = p_key;
  perform app_private.log_admin_action(v_admin, 'set_flag', 'flag', p_key, null,
    pg_catalog.jsonb_build_object('enabled', v_before), pg_catalog.jsonb_build_object('enabled', p_enabled));
  return pg_catalog.jsonb_build_object('key', p_key, 'enabled', p_enabled);
end;
$function$;

-- public.start_conversation: 5 refusal(s)
CREATE OR REPLACE FUNCTION public.start_conversation(p_listing_id uuid, p_start date DEFAULT NULL::date, p_end date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_lender_id uuid;
  v_conv_id uuid;
begin
  if v_uid is null then
    raise exception 'DZ-E1001: Not signed in' using errcode = '42501';
  end if;

  select l.lender_id into v_lender_id
  from public.listings l
  where l.id = p_listing_id and l.status = 'active';

  if not found then
    raise exception 'DZ-E3003: Listing not available' using errcode = '42501';
  end if;

  if v_lender_id = v_uid then
    raise exception 'DZ-E3004: Cannot message your own listing' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.blocks bl
    where (bl.blocker_id = v_uid and bl.blocked_id = v_lender_id)
       or (bl.blocker_id = v_lender_id and bl.blocked_id = v_uid)
  ) then
    raise exception 'DZ-E3005: You can''t message this user.' using errcode = '42501';
  end if;

  if p_start is not null and p_end is not null and p_end < p_start then
    raise exception 'DZ-E3006: Invalid dates' using errcode = '22023', hint = 'dates';
  end if;

  insert into public.conversations (listing_id, renter_id, lender_id, requested_start, requested_end)
  values (p_listing_id, v_uid, v_lender_id, p_start, p_end)
  on conflict (listing_id, renter_id) do update set
    requested_start = coalesce(excluded.requested_start, conversations.requested_start),
    requested_end = coalesce(excluded.requested_end, conversations.requested_end)
  returning id into v_conv_id;

  return v_conv_id;
end;
$function$;

-- public.unblock_user: 1 refusal(s)
CREATE OR REPLACE FUNCTION public.unblock_user(p_handle text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_target_id uuid;
begin
  if v_uid is null then
    raise exception 'DZ-E1001: Not signed in' using errcode = '42501';
  end if;

  select p.id into v_target_id
  from public.profiles p
  where pg_catalog.lower(pg_catalog.btrim(p.studio_handle)) = pg_catalog.lower(pg_catalog.btrim(coalesce(p_handle, '')))
  limit 1;

  if not found then
    return;
  end if;

  delete from public.blocks
  where blocker_id = v_uid and blocked_id = v_target_id;
end;
$function$;

-- public.unsave_studio: 1 refusal(s)
CREATE OR REPLACE FUNCTION public.unsave_studio(p_handle text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_lender_id uuid;
begin
  if v_uid is null then
    raise exception 'DZ-E1001: Not signed in' using errcode = '42501';
  end if;

  select p.id into v_lender_id
  from public.profiles p
  where pg_catalog.lower(pg_catalog.btrim(p.studio_handle)) = pg_catalog.lower(pg_catalog.btrim(coalesce(p_handle, '')))
  limit 1;

  if not found then
    return;
  end if;

  delete from public.saved_studios
  where user_id = v_uid and lender_id = v_lender_id;
end;
$function$;

-- public.vision_finish_scan: 2 refusal(s)
CREATE OR REPLACE FUNCTION public.vision_finish_scan(p_scan_id uuid, p_photo_set_hash text, p_result jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_listing uuid;
  v_lender uuid;
  v_status text;
  v_verdict text := p_result->>'verdict';
  v_reason text := p_result->>'reason';
  v_suggestions jsonb;
  v_duplicate boolean;
  v_current boolean;
begin
  select s.listing_id, l.lender_id, l.status into v_listing, v_lender, v_status
    from public.listing_scans s
    join public.listings l on l.id = s.listing_id
    where s.id = p_scan_id and s.status = 'running'
    for update of s;
  if not found then
    raise exception 'DZ-E2024: Scan is not running' using errcode = 'P0001';
  end if;
  if v_verdict is null or v_verdict not in ('allowed', 'rejected', 'review') or coalesce(v_reason, '') = ''
     or p_photo_set_hash is null or p_photo_set_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'DZ-E2025: Bad scan result' using errcode = '22023';
  end if;

  -- Only photos that are still on this listing.
  insert into public.photo_scans
    (scan_id, listing_id, photo_id, storage_path, slot, blur_score, brightness_score, framing_score,
     worn_probability, fingerprint, labels, warnings, decision)
  select p_scan_id, v_listing, lp.id, lp.storage_path, lp.slot,
         (e->>'blur_score')::real, (e->>'brightness_score')::real, (e->>'framing_score')::real,
         (e->>'worn_by_person')::real,
         ((e->'fingerprint')::text)::extensions.vector,
         case when pg_catalog.jsonb_typeof(e->'labels') = 'object' then e->'labels' else '{}'::jsonb end
           || pg_catalog.jsonb_build_object('checks', e->'checks', 'looks_like', e->'looks_like'),
         array(select pg_catalog.jsonb_array_elements_text(
           case when pg_catalog.jsonb_typeof(e->'warnings') = 'array' then e->'warnings' else '[]'::jsonb end)),
         e->>'decision'
  from pg_catalog.jsonb_array_elements(
         case when pg_catalog.jsonb_typeof(p_result->'photos') = 'array' then p_result->'photos' else '[]'::jsonb end
       ) e
  join public.listing_photos lp on lp.id = (e->>'photo_id')::uuid and lp.listing_id = v_listing
  where (e->>'ok')::boolean;

  select exists (
    select 1
    from public.photo_scans mine
    join public.photo_scans other on other.listing_id <> v_listing
    join public.listings ol on ol.id = other.listing_id and ol.lender_id <> v_lender
    where mine.scan_id = p_scan_id
      and (mine.fingerprint operator(extensions.<=>) other.fingerprint) <= 0.05
  ) into v_duplicate;
  if v_duplicate and v_verdict <> 'rejected' then
    v_verdict := 'review';
    v_reason := 'This photo matches another listing.';
  end if;

  v_suggestions := case when pg_catalog.jsonb_typeof(p_result->'suggestions') = 'object'
                        then p_result->'suggestions' else '{}'::jsonb end
    || pg_catalog.jsonb_build_object(
         'quality', p_result->'quality',
         'item_key', p_result->'item_key',
         'duplicate', v_duplicate,
         'model', p_result->'model'
       );
  update public.listing_scans
    set status = 'done', verdict = v_verdict, reason = v_reason, suggestions = v_suggestions,
        photo_set_hash = p_photo_set_hash, error = null, finished_at = pg_catalog.now()
    where id = p_scan_id;

  if v_status = 'active' then
    v_current := p_photo_set_hash = app_private.photo_set_hash(v_listing);
    if not v_current then
      perform app_private.recheck_active_listing(v_listing);
    elsif v_verdict <> 'allowed' then
      perform app_private.vision_pause(v_listing, case
        when v_verdict = 'rejected' then 'Paused: ' || v_reason
        else 'Paused: the new photos need a check before this listing can go live again.'
      end);
    end if;
  end if;
  return pg_catalog.jsonb_build_object('verdict', v_verdict, 'duplicate', v_duplicate);
end;
$function$;

-- public.withdraw_measurements_consent: 1 refusal(s)
CREATE OR REPLACE FUNCTION public.withdraw_measurements_consent()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'DZ-E1001: Not signed in' using errcode = '42501';
  end if;
  update public.private_profiles
    set chest_cm = null, waist_cm = null, hips_cm = null,
        shoulder_cm = null, height_cm = null, inseam_cm = null,
        measurements_consent_at = null
    where user_id = v_uid;
end;
$function$;

-- app_private.text_refusal: the three text filter sentences
CREATE OR REPLACE FUNCTION app_private.text_refusal(p_text text, p_where text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_variants text[];
  v_text text;
  v_allowed record;
begin
  if pg_catalog.btrim(coalesce(p_text, '')) = '' then
    return null;
  end if;
  v_variants := array[app_private.filter_normalize(p_text)];
  if pg_catalog.strpos(p_text, '1') > 0 then
    v_variants := v_variants || app_private.filter_normalize(pg_catalog.translate(p_text, '1', 'l'));
  end if;
  foreach v_text in array v_variants loop
    v_text := ' ' || v_text || ' ';
    for v_allowed in select a.pattern from app_private.text_filter_allowed a loop
      v_text := pg_catalog.regexp_replace(v_text, v_allowed.pattern, ' |', 'g');
    end loop;
    if exists (select 1 from app_private.text_filter_terms t where v_text ~ t.pattern) then
      return 'DZ-E1050: This text includes language that isn''t allowed on Dzirent.';
    end if;
  end loop;
  if p_where = 'listing' and app_private.text_has_contact(p_text) then
    return 'DZ-E2050: Please remove contact details from your listing; people can message you in Dzirent.';
  end if;
  if p_where = 'profile' and app_private.text_has_contact(p_text) then
    return 'DZ-E1051: Please remove contact details from your profile; people can message you in Dzirent.';
  end if;
  return null;
end;
$function$;

-- app_private.suspension_message: both suspension sentences
CREATE OR REPLACE FUNCTION app_private.suspension_message(p_user uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case
    when p.suspended_until is null or p.suspended_until <= pg_catalog.now() then null
    when p.suspended_until = 'infinity'::timestamptz then
      'DZ-E1040: Your account is suspended. Reason: ' || coalesce(pg_catalog.rtrim(pg_catalog.btrim(p.suspension_reason), '.'), 'not given') || '.'
    else
      'DZ-E1040: Your account is suspended until ' || pg_catalog.to_char(p.suspended_until at time zone 'UTC', 'Mon FMDD, YYYY')
        || '. Reason: ' || coalesce(pg_catalog.rtrim(pg_catalog.btrim(p.suspension_reason), '.'), 'not given') || '.'
  end
  from public.profiles p where p.id = p_user;
$function$;
