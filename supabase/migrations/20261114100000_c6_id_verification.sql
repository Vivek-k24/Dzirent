-- C6 (2026-11-14): one-time ID verification with Didit.
--
-- Two separate switches:
--   * AVAILABLE: anyone can verify from Settings whenever the Didit keys are set (DIDIT_API_KEY and
--     DIDIT_WEBHOOK_SECRET, Edge Function secrets). Without them every Didit function answers
--     DZ-E6002 "ID verification isn't available yet."
--   * REQUIRED: only while the app_settings flag verification_required is on (it stays off): then
--     starting a chat, sending a message and publishing a listing refuse an unverified caller with
--     DZ-E6001 "Verify your ID once to continue." (app_private.require_verified).
--
-- What Dzirent keeps (public.identity_verifications, server-written; the owner reads the status
-- only): the status, the legal name from the ID (private), whether the ID shows 18 or older, the
-- attempts, a reason for admins, the provider's session id and dates. Never ID images, selfies,
-- the birthdate, document numbers, addresses, nationality or IP data: the Edge Functions read the
-- decision in memory and pass on only those fields.
--
-- Flow: didit-start (signed-in person) reserves an attempt (didit_start_prepare), creates the Didit
-- session with our account id as vendor_data, and records it (didit_start_record). Didit's signed
-- webhook (didit-webhook) is verified, deduplicated on event_id (app_private.didit_events) and
-- answered at once; status-only steps apply immediately and the final ones (Approved, Declined, In
-- Review) queue an outbox job (kind didit_sync) whose Edge Function reads the decision and applies it
-- (didit_apply_decision). A 10-minute cron job (dzirent-didit-reconcile) queues the same check for
-- sessions still in progress after 30 minutes, because Didit retries a webhook only twice.
--
-- Status mapping (Didit's strings, case-sensitive): Approved -> verified; Declined -> declined;
-- In Review -> in_review; Not Started, In Progress, Awaiting User, Resubmitted -> in_progress;
-- Abandoned, Expired -> expired (the attempt counts); Kyc Expired -> expired and the badge goes.
-- An approved ID with a duplicate-face warning goes to in_review ("Possible duplicate account");
-- an approved ID of someone under 18 is declined ("Under 18") and blocks the account.
--
-- Age: the Edge Function computes is_adult from the ID's date of birth and drops the date. An
-- approved ID records an age check with source id_verification (adult or minor), which outranks the
-- store signals and the self-declared check (app_private.age_blocked).
--
-- Admins: a queue of in_review and declined checks, approve or reject with a reason, reset attempts
-- (two-step sign-in, every call logged). The badge (profiles.is_verified) follows the status and is
-- returned by the shop window: listing cards and pages, studio pages, chat headers.

-- 1. Settings: the verification area, an id type, and three settings ------------------------------
alter table app_private.settings drop constraint settings_area_check;
alter table app_private.settings add constraint settings_area_check
  check (area in ('payments', 'rentals', 'rate_limits', 'retention', 'verification'));
alter table app_private.settings drop constraint settings_type_check;
alter table app_private.settings add constraint settings_type_check
  check (value_type in ('integer', 'number', 'boolean', 'timezone', 'choice', 'rate_limit', 'uuid'));

CREATE OR REPLACE FUNCTION app_private.setting_value_problem(p_type text, p_value jsonb, p_min numeric, p_max numeric, p_choices text[], p_unit text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_number numeric;
  v_range text := case when p_min is not null and p_max is not null
    then 'Enter a value from ' || pg_catalog.trim_scale(p_min) || ' to ' || pg_catalog.trim_scale(p_max)
         || coalesce(' (' || p_unit || ')', '') || '.' end;
begin
  case p_type
    when 'integer', 'number' then
      if pg_catalog.jsonb_typeof(p_value) <> 'number' then
        return 'DZ-E5072: Enter a number.';
      end if;
      v_number := (p_value #>> '{}')::numeric;
      if p_type = 'integer' and v_number <> pg_catalog.trunc(v_number) then
        return 'DZ-E5072: Enter a whole number.';
      end if;
      if (p_min is not null and v_number < p_min) or (p_max is not null and v_number > p_max) then
        return 'DZ-E5070: ' || v_range;
      end if;
    when 'boolean' then
      if pg_catalog.jsonb_typeof(p_value) <> 'boolean' then
        return 'DZ-E5072: Choose on or off.';
      end if;
    when 'timezone' then
      if pg_catalog.jsonb_typeof(p_value) <> 'string'
         or not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p_value #>> '{}') then
        return 'DZ-E5072: Enter a time zone name such as America/Chicago.';
      end if;
    when 'choice' then
      if pg_catalog.jsonb_typeof(p_value) <> 'string' or not ((p_value #>> '{}') = any (p_choices)) then
        return 'DZ-E5072: Choose one of: ' || pg_catalog.array_to_string(p_choices, ', ') || '.';
      end if;
    when 'rate_limit' then
      if pg_catalog.jsonb_typeof(p_value) <> 'object'
         or (select pg_catalog.array_agg(k order by k) from pg_catalog.jsonb_object_keys(p_value) k) <> array['max', 'window_seconds']
         or pg_catalog.jsonb_typeof(p_value -> 'max') <> 'number'
         or (p_value ->> 'window_seconds') not in ('60', '3600', '86400') then
        return 'DZ-E5072: Enter how many are allowed per window.';
      end if;
      v_number := (p_value ->> 'max')::numeric;
      if v_number <> pg_catalog.trunc(v_number) then
        return 'DZ-E5072: Enter a whole number.';
      end if;
      if (p_min is not null and v_number < p_min) or (p_max is not null and v_number > p_max) then
        return 'DZ-E5070: ' || v_range;
      end if;
    when 'uuid' then
      -- C6: an id from an outside service (the verification provider's workflow and application).
      if pg_catalog.jsonb_typeof(p_value) <> 'string'
         or (p_value #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        return 'DZ-E5072: Enter an id such as 123e4567-e89b-42d3-a456-426614174000.';
      end if;
    else
      return 'DZ-E5072: Unknown setting type.';
  end case;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_list_settings()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin uuid := app_private.require_admin();
  v_rows jsonb;
begin
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'key', s.key, 'label', s.label, 'area', s.area, 'value', s.value, 'type', s.value_type,
      'unit', s.unit, 'min', s.min_value, 'max', s.max_value, 'choices', pg_catalog.to_jsonb(s.choices),
      'description', s.note, 'decided_by', s.decided_by, 'affects_terms', s.affects_terms,
      'updated_at', s.updated_at)
    order by pg_catalog.array_position(array['payments', 'rentals', 'rate_limits', 'retention', 'verification'], s.area), s.label), '[]'::jsonb)
  into v_rows
  from app_private.settings s;
  perform app_private.log_admin_action(v_admin, 'view_settings', null, null, null, null,
    pg_catalog.jsonb_build_object('count', pg_catalog.jsonb_array_length(v_rows)));
  return v_rows;
end;
$function$;

-- Not secrets: the workflow and application ids are configuration (the webhook secret and API key
-- are Edge Function secrets). Admins change them on the Settings page.
insert into app_private.settings
  (key, value, note, label, area, value_type, unit, min_value, max_value, choices, decided_by, affects_terms)
values
  ('didit_workflow_id', '"7051bbe4-0793-49c0-a9a3-39483e7af5da"'::jsonb,
   'The verification provider''s workflow every ID check uses (ID document, passive liveness, face match, device and IP analysis).',
   'Verification workflow', 'verification', 'uuid', null, null, null, null, 'owner', false),
  ('didit_application_id', '"dd05b583-4e74-405d-8b3c-f0da541218b1"'::jsonb,
   'The verification provider''s application. Webhook events for any other application are refused.',
   'Verification application', 'verification', 'uuid', null, null, null, null, 'owner', false),
  ('id_verification_max_attempts', '3'::jsonb,
   'How many ID checks a person can start. After that they contact support; admins can reset the count.',
   'ID check attempts', 'verification', 'integer', 'checks per person', 1, 10, null, 'owner', false)
on conflict (key) do nothing;

-- 2. Age checks: a result from the ID outranks the others -----------------------------------------
alter table public.age_checks drop constraint age_checks_source_check;
alter table public.age_checks add constraint age_checks_source_check
  check (source in ('store_signal', 'self_declared', 'id_verification'));
-- An ID check is recorded by the server, not by an app.
alter table public.age_checks drop constraint age_checks_platform_check;
alter table public.age_checks add constraint age_checks_platform_check
  check (platform in ('web', 'android', 'ios', 'server'));

-- Blocked: the latest ID verification result decides when there is one; otherwise, as before, the
-- latest decisive check (a minor, or a store's adult). record_age_check still refuses the
-- id_verification source from apps (DZ-E1031).
create or replace function app_private.age_blocked(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    (select c.result = 'minor'
     from public.age_checks c
     where c.user_id = p_user and c.source = 'id_verification' and c.result in ('adult', 'minor')
     order by c.id desc
     limit 1),
    (select c.result = 'minor'
     from public.age_checks c
     where c.user_id = p_user
       and (c.result = 'minor' or (c.source = 'store_signal' and c.result = 'adult'))
     order by c.id desc
     limit 1),
    false);
$function$;

CREATE OR REPLACE FUNCTION app_private.cleanup_old_age_checks(p_delete boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ids bigint[];
begin
  select coalesce(pg_catalog.array_agg(x.id), '{}') into v_ids
  from (
    select c.id,
      pg_catalog.row_number() over (partition by c.user_id order by c.id desc) as latest,
      pg_catalog.row_number() over (partition by c.user_id,
        (c.result = 'minor' or (c.source = 'store_signal' and c.result = 'adult')) order by c.id desc) as latest_of_kind,
      (c.result = 'minor' or (c.source = 'store_signal' and c.result = 'adult')) as decisive,
      -- C6: the latest ID verification result outranks the others, so it is always kept.
      c.source = 'id_verification' as from_id,
      pg_catalog.row_number() over (partition by c.user_id, (c.source = 'id_verification') order by c.id desc) as latest_of_source
    from public.age_checks c
  ) x
  where x.latest > 1 and not (x.decisive and x.latest_of_kind = 1) and not (x.from_id and x.latest_of_source = 1);
  if p_delete then
    delete from public.age_checks c where c.id = any (v_ids);
  end if;
  return pg_catalog.jsonb_build_object('age_checks', pg_catalog.cardinality(v_ids));
end;
$function$;

-- The age check from an approved ID (server only). A minor result blocks the account like the store
-- signal does: its active listings are paused with the 18+ reason.
create function app_private.record_id_age_check(p_user uuid, p_is_adult boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_was_blocked boolean := app_private.age_blocked(p_user);
  v_blocked boolean;
begin
  if p_user is null or p_is_adult is null then
    return v_was_blocked;
  end if;
  insert into public.age_checks (user_id, source, result, platform)
  values (p_user, 'id_verification', case when p_is_adult then 'adult' else 'minor' end, 'server');
  v_blocked := app_private.age_blocked(p_user);
  if v_blocked and not v_was_blocked then
    perform pg_catalog.set_config('dzirent.age_gate_skip', 'on', true);
    update public.listings
      set status = 'paused', auto_paused_reason = 'Paused: Dzirent is only for people 18 and older.'
      where lender_id = p_user and status = 'active';
    perform pg_catalog.set_config('dzirent.age_gate_skip', 'off', true);
  end if;
  return v_blocked;
end;
$function$;
revoke execute on function app_private.record_id_age_check(uuid, boolean) from public, anon, authenticated;

-- 3. The badge: profiles.is_verified, written only by the server -----------------------------------
alter table public.profiles add column is_verified boolean not null default false;
comment on column public.profiles.is_verified is
  'C6: the "Verified" badge. True while the person''s ID verification is verified; kept by the server from identity_verifications, never written by apps.';

create function app_private.keep_verified()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if current_user in ('authenticated', 'anon') then
    new.is_verified := old.is_verified;
  end if;
  return new;
end;
$function$;
revoke execute on function app_private.keep_verified() from public, anon, authenticated;
create trigger profiles_keep_verified before update on public.profiles
  for each row execute function app_private.keep_verified();

-- 4. The verification row (one per person) --------------------------------------------------------
create table public.identity_verifications (
  user_id uuid not null,
  status text not null default 'not_started',
  provider_session_id text,
  legal_name text,
  is_adult boolean,
  attempts integer not null default 0,
  reason text,
  verified_at timestamp with time zone,
  created_at timestamp with time zone not null default pg_catalog.now(),
  updated_at timestamp with time zone not null default pg_catalog.now(),
  constraint identity_verifications_pkey primary key (user_id),
  constraint identity_verifications_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade,
  constraint identity_verifications_status_check
    check (status in ('not_started', 'in_progress', 'in_review', 'verified', 'declined', 'expired')),
  constraint identity_verifications_attempts_check check (attempts >= 0),
  constraint identity_verifications_legal_name_check check (legal_name is null or pg_catalog.char_length(legal_name) <= 200),
  constraint identity_verifications_reason_check check (reason is null or pg_catalog.char_length(reason) <= 300)
);
comment on table public.identity_verifications is
  'C6: one ID verification per person. Server-written. The owner reads the status only (column grants); the legal name is private to the server and the person''s own data download. No images, birthdate or document details.';
create index identity_verifications_status_idx on public.identity_verifications (status, updated_at);
alter table public.identity_verifications enable row level security;
revoke all on public.identity_verifications from public, anon, authenticated, service_role;
grant select (user_id, status, updated_at) on public.identity_verifications to authenticated;
create policy identity_verifications_owner_read on public.identity_verifications
  for select to authenticated using (user_id = (select auth.uid()));
-- The apps wait for the result on Realtime (status only: the other columns aren't readable).
alter publication supabase_realtime add table public.identity_verifications;

-- The badge follows the status.
create function app_private.sync_is_verified()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' then
    update public.profiles set is_verified = false where id = old.user_id and is_verified;
    return null;
  end if;
  update public.profiles set is_verified = (new.status = 'verified')
  where id = new.user_id and is_verified is distinct from (new.status = 'verified');
  return null;
end;
$function$;
revoke execute on function app_private.sync_is_verified() from public, anon, authenticated;
create trigger identity_verifications_badge after insert or update of status or delete on public.identity_verifications
  for each row execute function app_private.sync_is_verified();

-- Didit sessions Dzirent started (closed): for webhooks, reconciliation and account deletion.
create table app_private.didit_sessions (
  session_id text not null,
  user_id uuid not null,
  status text,
  event_created_at bigint,
  checked_at timestamp with time zone,
  admin_decision text,
  created_at timestamp with time zone not null default pg_catalog.now(),
  updated_at timestamp with time zone not null default pg_catalog.now(),
  constraint didit_sessions_pkey primary key (session_id),
  constraint didit_sessions_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade,
  constraint didit_sessions_session_id_check check (session_id ~ '^[0-9A-Za-z_-]{8,100}$'),
  constraint didit_sessions_admin_decision_check check (admin_decision is null or admin_decision in ('approved', 'rejected'))
);
create index didit_sessions_user_idx on app_private.didit_sessions (user_id, created_at desc);
revoke all on app_private.didit_sessions from public, anon, authenticated, service_role;
comment on table app_private.didit_sessions is
  'C6: each Didit session Dzirent started: the person, the provider''s last status, when it was last checked, an admin decision. No personal data from the ID.';

-- Webhook events, once each (the event id is unique). Kept 30 days.
create table app_private.didit_events (
  event_id uuid not null,
  webhook_type text not null,
  session_id text,
  status text,
  received_at timestamp with time zone not null default pg_catalog.now(),
  result text,
  constraint didit_events_pkey primary key (event_id)
);
revoke all on app_private.didit_events from public, anon, authenticated, service_role;
comment on table app_private.didit_events is
  'C6: Didit webhook events by event id (deduplication), with the session, status and what was done. Never the payload.';

-- 5. The gate (only while verification_required is on) ----------------------------------------------
create function app_private.require_verified(p_uid uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if p_uid is not null
     and exists (select 1 from public.app_settings s where s.key = 'verification_required' and s.enabled)
     and not exists (select 1 from public.identity_verifications v where v.user_id = p_uid and v.status = 'verified') then
    raise exception 'DZ-E6001: Verify your ID once to continue.' using errcode = 'P0001';
  end if;
end;
$function$;
revoke execute on function app_private.require_verified(uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION app_private.terms_and_limits()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_terms boolean := true;
  v_action text;
  -- C6: the one-time ID check, only while verification_required is on (app_private.require_verified).
  v_verify boolean := false;
begin
  if v_uid is null then
    return new;
  end if;
  case tg_table_name
    when 'messages' then
      v_owner := new.sender_id;
      v_action := 'message';
      v_verify := true;
    when 'conversations' then
      v_owner := new.renter_id;
      -- start_conversation upserts: reopening an existing chat is not a new chat.
      if exists (select 1 from public.conversations c
                 where c.listing_id = new.listing_id and c.renter_id = new.renter_id) then
        return new;
      end if;
      v_action := 'new_chat';
      v_verify := true;
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
      v_verify := v_terms;
    else
      return new;
  end case;
  if v_owner is distinct from v_uid then
    return new;
  end if;
  if v_terms then
    perform app_private.require_current_terms(v_uid);
  end if;
  if v_verify then
    perform app_private.require_verified(v_uid);
  end if;
  if v_action is not null then
    perform app_private.enforce_rate_limit(v_uid, v_action);
  end if;
  return new;
end;
$function$;

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

  -- C6: the one-time ID check (only while verification_required is on).
  perform app_private.require_verified(v_uid);

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

-- 6. Status mapping ---------------------------------------------------------------------------------
create function app_private.didit_status_map(p_status text)
returns text
language sql
immutable
set search_path = ''
as $function$
  -- Didit's strings, compared case-sensitively; anything else is unknown (null).
  select case p_status
    when 'Approved' then 'verified'
    when 'Declined' then 'declined'
    when 'In Review' then 'in_review'
    when 'Not Started' then 'in_progress'
    when 'In Progress' then 'in_progress'
    when 'Awaiting User' then 'in_progress'
    when 'Resubmitted' then 'in_progress'
    when 'Abandoned' then 'expired'
    when 'Expired' then 'expired'
    when 'Kyc Expired' then 'expired'
  end;
$function$;
revoke execute on function app_private.didit_status_map(text) from public, anon, authenticated;

-- What a person sees about their own check (no legal name, no reason).
create function app_private.verification_json(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_row public.identity_verifications;
  v_max integer := app_private.setting_int('id_verification_max_attempts');
  v_status text;
  v_attempts integer;
begin
  select * into v_row from public.identity_verifications v where v.user_id = p_user;
  v_status := coalesce(v_row.status, 'not_started');
  v_attempts := coalesce(v_row.attempts, 0);
  return pg_catalog.jsonb_build_object(
    'status', v_status,
    'attempts', v_attempts,
    'max_attempts', v_max,
    'attempts_left', greatest(v_max - v_attempts, 0),
    'can_start', v_status not in ('verified', 'in_review') and v_attempts < v_max,
    'required', exists (select 1 from public.app_settings s where s.key = 'verification_required' and s.enabled),
    'verified_at', v_row.verified_at,
    'updated_at', v_row.updated_at);
end;
$function$;
revoke execute on function app_private.verification_json(uuid) from public, anon, authenticated;

-- Signed-in people: my own check. { status, attempts, max_attempts, attempts_left, can_start,
-- required, verified_at, updated_at }. Whether verification is available (the keys are set) comes
-- from didit-start { action: "check" }.
create function public.my_verification()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'DZ-E1001: Not signed in' using errcode = '42501';
  end if;
  return app_private.verification_json(v_uid);
end;
$function$;
revoke execute on function public.my_verification() from public, anon;
grant execute on function public.my_verification() to authenticated;

-- 7. Server steps (the Edge Functions, server key only) ----------------------------------------------

-- didit-start, before creating the session: checks the person and reserves an attempt.
create function public.didit_start_prepare(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row public.identity_verifications;
  v_max integer := app_private.setting_int('id_verification_max_attempts');
begin
  if p_user is null or not exists (select 1 from public.profiles p where p.id = p_user) then
    raise exception 'DZ-E1001: Not signed in' using errcode = '42501';
  end if;
  insert into public.identity_verifications (user_id) values (p_user) on conflict (user_id) do nothing;
  select * into v_row from public.identity_verifications v where v.user_id = p_user for update;
  if v_row.status = 'verified' then
    raise exception 'DZ-E6004: Your ID is already verified.' using errcode = 'P0001';
  end if;
  if v_row.status = 'in_review' then
    raise exception 'DZ-E6005: Someone at Dzirent is checking your ID.' using errcode = 'P0001';
  end if;
  if v_row.attempts >= v_max then
    raise exception 'DZ-E6003: Contact support to verify.' using errcode = 'P0001';
  end if;
  update public.identity_verifications set attempts = attempts + 1, updated_at = pg_catalog.now()
    where user_id = p_user;
  return pg_catalog.jsonb_build_object(
    'workflow_id', app_private.setting_text('didit_workflow_id'),
    'attempts', v_row.attempts + 1,
    'max_attempts', v_max);
end;
$function$;

-- didit-start, when the session couldn't be created: the attempt is given back.
create function public.didit_start_release(p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $function$
  update public.identity_verifications set attempts = greatest(attempts - 1, 0), updated_at = pg_catalog.now()
  where user_id = p_user;
$function$;

-- didit-start, after the session was created.
create function public.didit_start_record(p_user uuid, p_session_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into app_private.didit_sessions (session_id, user_id, status) values (p_session_id, p_user, 'Not Started')
  on conflict (session_id) do nothing;
  update public.identity_verifications
    set status = 'in_progress', provider_session_id = p_session_id, reason = null, updated_at = pg_catalog.now()
    where user_id = p_user;
  return app_private.verification_json(p_user);
end;
$function$;

-- A status that needs no decision data: in progress, abandoned or expired, KYC expired.
create function app_private.didit_apply_status(p_session_id text, p_status text)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_session app_private.didit_sessions;
  v_row public.identity_verifications;
  v_mapped text := app_private.didit_status_map(p_status);
  v_current boolean;
begin
  select * into v_session from app_private.didit_sessions s where s.session_id = p_session_id;
  if not found then
    return 'unknown_session';
  end if;
  select * into v_row from public.identity_verifications v where v.user_id = v_session.user_id for update;
  if not found then
    return 'no_verification';
  end if;
  v_current := v_row.provider_session_id is not distinct from p_session_id;
  if not v_current then
    return 'not_current';
  end if;
  if p_status = 'Kyc Expired' then
    -- The verification expired: the badge goes. The person can verify again (attempts permitting).
    update public.identity_verifications
      set status = 'expired', reason = 'The verification expired', updated_at = pg_catalog.now()
      where user_id = v_session.user_id;
    return 'expired';
  end if;
  -- A verified person isn't moved back by a late event of the same session, and an admin's decision
  -- on this session stands.
  if v_row.status = 'verified' or v_session.admin_decision is not null then
    return 'kept';
  end if;
  if v_mapped = v_row.status then
    return 'unchanged';
  end if;
  update public.identity_verifications
    set status = v_mapped,
        reason = case when v_mapped = 'expired' then 'The check wasn''t finished' end,
        updated_at = pg_catalog.now()
    where user_id = v_session.user_id;
  return v_mapped;
end;
$function$;
revoke execute on function app_private.didit_apply_status(text, text) from public, anon, authenticated;

-- didit-webhook: the event, once. The Edge Function has checked the signature and the timestamp;
-- here: our application, the event id once, a session Dzirent started for this person. Status-only
-- steps apply now; Approved, Declined and In Review queue a decision check (outbox didit_sync).
create function public.didit_webhook_received(p_event_id uuid, p_type text, p_application_id text,
                                              p_session_id text, p_vendor_data text, p_status text,
                                              p_created_at bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_session app_private.didit_sessions;
  v_mapped text := app_private.didit_status_map(p_status);
  v_result text;
  v_new integer;
begin
  if p_application_id is distinct from app_private.setting_text('didit_application_id') then
    raise exception 'DZ-E6009: This verification event is for another application.' using errcode = '22023';
  end if;
  insert into app_private.didit_events (event_id, webhook_type, session_id, status)
  values (p_event_id, coalesce(p_type, ''), p_session_id, p_status)
  on conflict (event_id) do nothing;
  get diagnostics v_new = row_count;
  if v_new = 0 then
    return pg_catalog.jsonb_build_object('result', 'duplicate');
  end if;

  select * into v_session from app_private.didit_sessions s where s.session_id = p_session_id for update;
  if not found then
    v_result := 'unknown_session';
  elsif p_vendor_data is distinct from v_session.user_id::text then
    v_result := 'wrong_person';
  elsif p_type is null or p_type not in ('status.updated', 'data.updated') then
    v_result := 'ignored';
  elsif v_mapped is null then
    v_result := 'unknown_status';
  elsif p_created_at is not null and v_session.event_created_at is not null and p_created_at < v_session.event_created_at then
    -- Delivery order isn't guaranteed: an older event than the last one applied changes nothing.
    v_result := 'older';
  else
    update app_private.didit_sessions
      set status = p_status, event_created_at = coalesce(p_created_at, event_created_at), updated_at = pg_catalog.now()
      where session_id = p_session_id;
    if p_status in ('Approved', 'Declined', 'In Review') then
      perform app_private.enqueue_job('didit_sync', pg_catalog.jsonb_build_object('session_id', p_session_id));
      v_result := 'queued';
    else
      v_result := app_private.didit_apply_status(p_session_id, p_status);
    end if;
  end if;
  update app_private.didit_events set result = v_result where event_id = p_event_id;
  return pg_catalog.jsonb_build_object('result', v_result);
end;
$function$;

-- didit-sync: the decision as the provider has it now, reduced to what Dzirent keeps. p_is_adult
-- comes from the ID's date of birth (the date itself is never sent); p_duplicate from a duplicate-face
-- warning; p_reason a short plain reason for a decline (for admins).
create function public.didit_apply_decision(p_session_id text, p_status text, p_legal_name text,
                                            p_is_adult boolean, p_duplicate boolean, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_session app_private.didit_sessions;
  v_row public.identity_verifications;
  v_mapped text := app_private.didit_status_map(p_status);
  v_status text;
  v_reason text;
  v_current boolean;
begin
  select * into v_session from app_private.didit_sessions s where s.session_id = p_session_id for update;
  if not found then
    return pg_catalog.jsonb_build_object('result', 'unknown_session');
  end if;
  -- (Event order is compared on Didit's own created_at only, in didit_webhook_received.)
  update app_private.didit_sessions
    set status = coalesce(p_status, status), checked_at = pg_catalog.now(), updated_at = pg_catalog.now()
    where session_id = p_session_id;
  if v_mapped is null then
    return pg_catalog.jsonb_build_object('result', 'unknown_status');
  end if;
  if v_mapped in ('in_progress', 'expired') then
    return pg_catalog.jsonb_build_object('result', app_private.didit_apply_status(p_session_id, p_status));
  end if;
  select * into v_row from public.identity_verifications v where v.user_id = v_session.user_id for update;
  if not found then
    return pg_catalog.jsonb_build_object('result', 'no_verification');
  end if;
  v_current := v_row.provider_session_id is not distinct from p_session_id;

  -- An approved ID of someone under 18 blocks the account, whichever session it came from.
  if v_mapped = 'verified' and p_is_adult is false then
    perform app_private.record_id_age_check(v_session.user_id, false);
  end if;

  if v_session.admin_decision is not null then
    return pg_catalog.jsonb_build_object('result', 'kept');
  end if;

  if v_mapped = 'verified' and p_is_adult is false then
    v_status := 'declined';
    v_reason := 'Under 18 (from the ID)';
  elsif v_mapped = 'verified' and coalesce(p_duplicate, false) then
    v_status := 'in_review';
    v_reason := 'Possible duplicate account';
  elsif v_mapped = 'verified' then
    v_status := 'verified';
    v_reason := null;
  elsif v_mapped = 'in_review' then
    v_status := 'in_review';
    v_reason := case when coalesce(p_duplicate, false) then 'Possible duplicate account'
                     else 'The verification provider is reviewing it' end;
  else
    v_status := 'declined';
    v_reason := pg_catalog.left(coalesce(nullif(pg_catalog.btrim(p_reason), ''), 'Declined by the verification provider'), 300);
  end if;

  -- An older session never moves the person back; it can still verify them. For the current session
  -- the provider's latest decision wins.
  if not v_current and v_status <> 'verified' then
    return pg_catalog.jsonb_build_object('result', 'not_current');
  end if;

  update public.identity_verifications
    set status = v_status,
        provider_session_id = p_session_id,
        -- The name and the 18+ result are kept only from an ID the provider approved.
        legal_name = case when v_mapped = 'verified'
                          then pg_catalog.left(nullif(pg_catalog.btrim(p_legal_name), ''), 200) else legal_name end,
        is_adult = case when v_mapped = 'verified' then p_is_adult else is_adult end,
        reason = v_reason,
        verified_at = case when v_status = 'verified' then pg_catalog.now() else verified_at end,
        updated_at = pg_catalog.now()
    where user_id = v_session.user_id;

  if v_status = 'verified' and p_is_adult is true then
    perform app_private.record_id_age_check(v_session.user_id, true);
  end if;
  return pg_catalog.jsonb_build_object('result', v_status);
end;
$function$;

-- delete-account: the person's sessions (to delete them at Didit), then the rows.
create function public.didit_sessions_for(p_user uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(pg_catalog.array_agg(s.session_id order by s.created_at), '{}')
  from app_private.didit_sessions s where s.user_id = p_user;
$function$;

create function public.didit_forget(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  delete from app_private.didit_sessions where user_id = p_user;
  delete from public.identity_verifications where user_id = p_user;
end;
$function$;

do $grants$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.didit_start_prepare(uuid)', 'public.didit_start_release(uuid)', 'public.didit_start_record(uuid, text)',
    'public.didit_webhook_received(uuid, text, text, text, text, text, bigint)',
    'public.didit_apply_decision(text, text, text, boolean, boolean, text)',
    'public.didit_sessions_for(uuid)', 'public.didit_forget(uuid)'
  ] loop
    execute pg_catalog.format('revoke execute on function %s from public, anon, authenticated', v_fn);
    execute pg_catalog.format('grant execute on function %s to service_role', v_fn);
  end loop;
end
$grants$;

-- 8. The outbox: decision checks (Edge Function didit-sync) ------------------------------------------
alter table app_private.async_jobs drop constraint async_jobs_kind_check;
alter table app_private.async_jobs add constraint async_jobs_kind_check
  check (kind in ('send_push', 'scan_listing', 'stripe_deposit', 'stripe_refund', 'send_email', 'didit_sync'));

-- Vault: where didit-sync lives and the secret that proves the database is calling (generated here;
-- the same value is the function secret DIDIT_JOB_SECRET).
do $vault$
begin
  if not exists (select 1 from vault.secrets s where s.name = 'didit_job_secret') then
    perform vault.create_secret(pg_catalog.encode(extensions.gen_random_bytes(32), 'hex'), 'didit_job_secret',
      'Proves to the didit-sync Edge Function that this database is calling');
  end if;
  if not exists (select 1 from vault.secrets s where s.name = 'didit_sync_url') then
    perform vault.create_secret('https://pwfzkyjeivadbtkfkdxr.supabase.co/functions/v1/didit-sync',
      'didit_sync_url', 'Address of the didit-sync Edge Function');
  end if;
end
$vault$;

CREATE OR REPLACE FUNCTION app_private.dispatch_job(p_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_job app_private.async_jobs;
  v_url text;
  v_secret text;
  v_header text;
  v_request bigint;
begin
  select * into v_job from app_private.async_jobs j where j.id = p_id for update;
  if not found or v_job.status <> 'pending' then
    return;
  end if;
  if v_job.kind = 'scan_listing' and not exists (
    select 1 from public.listing_scans s
    where s.id = (v_job.payload->>'scan_id')::uuid and s.status = 'queued'
  ) then
    update app_private.async_jobs
      set status = 'done', last_error = 'skipped: the photo check is no longer waiting',
          finished_at = pg_catalog.now(), updated_at = pg_catalog.now()
      where id = p_id;
    return;
  end if;
  if v_job.kind in ('stripe_deposit', 'stripe_refund') and not exists (
    select 1 from app_private.payment_operations o
    where o.id = (v_job.payload->>'operation_id')::uuid and o.status in ('queued', 'running')
  ) then
    update app_private.async_jobs
      set status = 'done', last_error = 'skipped: the payment step already finished',
          finished_at = pg_catalog.now(), updated_at = pg_catalog.now()
      where id = p_id;
    return;
  end if;

  if v_job.kind = 'send_email' and not exists (
    select 1 from app_private.email_messages e
    where e.id = (v_job.payload->>'email_id')::uuid and e.status = 'queued'
  ) then
    update app_private.async_jobs
      set status = 'done', last_error = 'skipped: the email already finished',
          finished_at = pg_catalog.now(), updated_at = pg_catalog.now()
      where id = p_id;
    return;
  end if;

  -- C6: a decision check for a session that no longer exists (the account was deleted) is skipped.
  if v_job.kind = 'didit_sync' and not exists (
    select 1 from app_private.didit_sessions s where s.session_id = v_job.payload->>'session_id'
  ) then
    update app_private.async_jobs
      set status = 'done', last_error = 'skipped: the verification session is gone',
          finished_at = pg_catalog.now(), updated_at = pg_catalog.now()
      where id = p_id;
    return;
  end if;

  if v_job.kind = 'send_push' then
    select ds.decrypted_secret into v_url from vault.decrypted_secrets ds where ds.name = 'send_push_url';
    select ds.decrypted_secret into v_secret from vault.decrypted_secrets ds where ds.name = 'send_push_secret';
    v_header := 'x-send-push-secret';
  elsif v_job.kind = 'scan_listing' then
    select ds.decrypted_secret into v_url from vault.decrypted_secrets ds where ds.name = 'scan_listing_url';
    select ds.decrypted_secret into v_secret from vault.decrypted_secrets ds where ds.name = 'scan_listing_secret';
    v_header := 'x-scan-listing-secret';
  elsif v_job.kind = 'send_email' then
    select ds.decrypted_secret into v_url from vault.decrypted_secrets ds where ds.name = 'send_email_url';
    select ds.decrypted_secret into v_secret from vault.decrypted_secrets ds where ds.name = 'email_job_secret';
    v_header := 'x-email-secret';
  elsif v_job.kind = 'didit_sync' then
    select ds.decrypted_secret into v_url from vault.decrypted_secrets ds where ds.name = 'didit_sync_url';
    select ds.decrypted_secret into v_secret from vault.decrypted_secrets ds where ds.name = 'didit_job_secret';
    v_header := 'x-didit-job-secret';
  else
    select ds.decrypted_secret into v_url from vault.decrypted_secrets ds
      where ds.name = case v_job.kind when 'stripe_deposit' then 'stripe_deposit_url' else 'stripe_refund_url' end;
    select ds.decrypted_secret into v_secret from vault.decrypted_secrets ds where ds.name = 'payments_job_secret';
    v_header := 'x-payments-secret';
  end if;

  update app_private.async_jobs
    set attempts = attempts + 1, dispatched_at = pg_catalog.now(), updated_at = pg_catalog.now()
    where id = p_id;
  if v_url is null or v_secret is null then
    perform app_private.job_failed(p_id, 'not configured: the address or secret is missing in Vault');
    return;
  end if;

  v_request := net.http_post(
    url := v_url,
    body := v_job.payload,
    headers := pg_catalog.jsonb_build_object('Content-Type', 'application/json', v_header, v_secret),
    timeout_milliseconds := 10000
  );
  update app_private.async_jobs
    set status = 'running', request_id = v_request, updated_at = pg_catalog.now()
    where id = p_id;
end;
$function$;

-- 9. Reconciliation: Didit retries a webhook only twice ----------------------------------------------
-- Every 10 minutes: a decision check for each session still in progress after 30 minutes (each
-- session at most every 30 minutes); webhook events older than 30 days go.
create function app_private.didit_reconcile()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  r record;
  v_queued integer := 0;
  v_removed integer;
begin
  for r in
    select s.session_id
    from public.identity_verifications v
    join app_private.didit_sessions s on s.session_id = v.provider_session_id and s.user_id = v.user_id
    where v.status = 'in_progress'
      and v.updated_at < pg_catalog.now() - interval '30 minutes'
      and (s.checked_at is null or s.checked_at < pg_catalog.now() - interval '30 minutes')
      and not exists (
        select 1 from app_private.async_jobs j
        where j.kind = 'didit_sync' and j.status in ('pending', 'running') and j.payload->>'session_id' = s.session_id)
    order by v.updated_at
    limit 50
    for update of s skip locked
  loop
    update app_private.didit_sessions set checked_at = pg_catalog.now() where session_id = r.session_id;
    perform app_private.enqueue_job('didit_sync', pg_catalog.jsonb_build_object('session_id', r.session_id));
    v_queued := v_queued + 1;
  end loop;
  delete from app_private.didit_events e where e.received_at < pg_catalog.now() - interval '30 days';
  get diagnostics v_removed = row_count;
  return pg_catalog.jsonb_build_object('queued', v_queued, 'events_removed', v_removed);
end;
$function$;
revoke execute on function app_private.didit_reconcile() from public, anon, authenticated;
select cron.schedule('dzirent-didit-reconcile', '*/10 * * * *', 'select app_private.didit_reconcile()');

-- 10. Admins: the review queue, decisions, attempts (two-step sign-in, logged) ------------------------
CREATE OR REPLACE FUNCTION public.admin_queues()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    -- C6: ID checks waiting for an admin (a possible duplicate, or the provider's own review).
    'id_verification_reviews', (select pg_catalog.count(*) from public.identity_verifications v where v.status = 'in_review'))
  into v_result;
  perform app_private.log_admin_action(v_admin, 'view_queues', null, null, null, null, v_result);
  return v_result;
end;
$function$;

drop function public.admin_list_id_reviews();
-- p_status: 'in_review', 'declined' or null for both. Never images or the legal name.
create function public.admin_list_id_reviews(p_status text default null, p_limit integer default 30, p_offset integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := app_private.require_admin();
  v_rows jsonb;
begin
  if p_status is not null and p_status not in ('in_review', 'declined') then
    raise exception 'DZ-E9016: This request isn''t valid.' using errcode = '22023';
  end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'user_id', v.user_id,
      'display_name', p.display_name,
      'studio_name', p.studio_name,
      'studio_handle', p.studio_handle,
      'status', v.status,
      'reason', v.reason,
      'attempts', v.attempts,
      'max_attempts', app_private.setting_int('id_verification_max_attempts'),
      'session_id', v.provider_session_id,
      'is_adult', v.is_adult,
      'verified_at', v.verified_at,
      'created_at', v.created_at,
      'updated_at', v.updated_at)
    order by case v.status when 'in_review' then 0 else 1 end, v.updated_at), '[]'::jsonb)
  into v_rows
  from (
    select * from public.identity_verifications iv
    where (p_status is null and iv.status in ('in_review', 'declined')) or iv.status = p_status
    order by case iv.status when 'in_review' then 0 else 1 end, iv.updated_at
    limit least(greatest(coalesce(p_limit, 30), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
  ) v
  join public.profiles p on p.id = v.user_id;
  perform app_private.log_admin_action(v_admin, 'view_id_reviews', null, null, null, null,
    pg_catalog.jsonb_build_object('count', pg_catalog.jsonb_array_length(v_rows), 'status', p_status));
  return v_rows;
end;
$function$;
revoke execute on function public.admin_list_id_reviews(text, integer, integer) from public, anon;
grant execute on function public.admin_list_id_reviews(text, integer, integer) to authenticated;

-- Approve (verified) or reject (declined) a check that is in review or was declined.
create function public.admin_decide_id_verification(p_user_id uuid, p_decision text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := app_private.require_admin();
  v_reason text := app_private.require_reason(p_reason);
  v_row public.identity_verifications;
  v_status text;
begin
  if p_decision is null or p_decision not in ('approve', 'reject') then
    raise exception 'DZ-E6012: Decide approve or reject.' using errcode = '22023';
  end if;
  select * into v_row from public.identity_verifications v where v.user_id = p_user_id for update;
  if not found then
    raise exception 'DZ-E6010: Verification not found' using errcode = 'P0002';
  end if;
  if not (v_row.status = 'in_review' or (v_row.status = 'declined' and p_decision = 'approve')) then
    raise exception 'DZ-E6011: This verification can''t be changed now.' using errcode = 'P0001';
  end if;
  v_status := case when p_decision = 'approve' then 'verified' else 'declined' end;
  update public.identity_verifications
    set status = v_status,
        reason = pg_catalog.left(case when p_decision = 'approve' then 'Approved by Dzirent: ' else 'Rejected by Dzirent: ' end || v_reason, 300),
        verified_at = case when v_status = 'verified' then pg_catalog.now() else verified_at end,
        updated_at = pg_catalog.now()
    where user_id = p_user_id;
  if v_row.provider_session_id is not null then
    update app_private.didit_sessions
      set admin_decision = case when p_decision = 'approve' then 'approved' else 'rejected' end, updated_at = pg_catalog.now()
      where session_id = v_row.provider_session_id;
  end if;
  -- An approved ID that shows 18 or older counts as the ID's age check.
  if v_status = 'verified' and v_row.is_adult is true then
    perform app_private.record_id_age_check(p_user_id, true);
  end if;
  perform app_private.log_admin_action(v_admin, 'decide_id_verification', 'user', p_user_id::text, v_reason,
    pg_catalog.jsonb_build_object('status', v_row.status, 'attempts', v_row.attempts),
    pg_catalog.jsonb_build_object('status', v_status, 'decision', p_decision));
  return pg_catalog.jsonb_build_object('user_id', p_user_id, 'status', v_status);
end;
$function$;
revoke execute on function public.admin_decide_id_verification(uuid, text, text) from public, anon;
grant execute on function public.admin_decide_id_verification(uuid, text, text) to authenticated;

-- Give a person their attempts back (after they contacted support).
create function public.admin_reset_id_attempts(p_user_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_admin uuid := app_private.require_admin();
  v_reason text := app_private.require_reason(p_reason);
  v_row public.identity_verifications;
begin
  select * into v_row from public.identity_verifications v where v.user_id = p_user_id for update;
  if not found then
    raise exception 'DZ-E6010: Verification not found' using errcode = 'P0002';
  end if;
  update public.identity_verifications set attempts = 0, updated_at = pg_catalog.now() where user_id = p_user_id;
  perform app_private.log_admin_action(v_admin, 'reset_id_attempts', 'user', p_user_id::text, v_reason,
    pg_catalog.jsonb_build_object('attempts', v_row.attempts, 'status', v_row.status),
    pg_catalog.jsonb_build_object('attempts', 0));
  return app_private.verification_json(p_user_id);
end;
$function$;
revoke execute on function public.admin_reset_id_attempts(uuid, text) from public, anon;
grant execute on function public.admin_reset_id_attempts(uuid, text) to authenticated;

-- 11. Download my data: the check (with the legal name: it is the person's own data) ------------------
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
  v_hours integer := app_private.setting_int('data_export_interval_hours');
begin
  if v_uid is null or not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'DZ-E1001: Not signed in' using errcode = '42501';
  end if;

  -- Once per data_export_interval_hours (24 = once a day; a setting since C4). The lock keeps two exports started at the same moment from both passing.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('data_export:' || v_uid::text));
  select max(e.exported_at) into v_last from public.data_exports e where e.user_id = v_uid;
  if v_last is not null and v_last > pg_catalog.now() - pg_catalog.make_interval(hours => v_hours) then
    raise exception using errcode = 'P0001', message =
      'DZ-E7001: You can download your data once '
      || case when v_hours = 24 then 'a day' else 'every ' || v_hours || ' hours' end
      || '. Try again after '
      || pg_catalog.to_char((v_last + pg_catalog.make_interval(hours => v_hours)) at time zone 'UTC', 'Mon FMDD, YYYY, FMHH12:MI AM')
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

    -- Rentals with the price agreed and every step (C3).
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
        'price_per_day', rt.price_per_day,
        'days', rt.days,
        'total', rt.total,
        'currency', rt.currency,
        'deposit_amount', rt.deposit_amount,
        'payment_status', rt.payment_status,
        'fee', rt.fee_amount,
        'refunded', rt.refund_amount,
        'deposit_status', rt.deposit_status,
        'deposit_captured', rt.deposit_captured_amount,
        'last_changed_by', case when rt.updated_by is null then null
                                when rt.updated_by = v_uid then 'you' else 'other person' end,
        'created_at', rt.created_at,
        'updated_at', rt.updated_at,
        'events', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'from', e.from_status, 'to', e.to_status,
            'by', case when e.actor_role = 'system' then 'Dzirent' when e.actor_id = v_uid then 'you' else 'other person' end,
            'note', e.note, 'at', e.created_at) order by e.id)
          from public.rental_events e where e.rental_id = rt.id), '[]'::jsonb)) order by rt.created_at)
      from public.rentals rt join public.listings l on l.id = rt.listing_id
      where v_uid in (rt.renter_id, rt.lender_id)), '[]'::jsonb),

    -- Condition photos the caller took at pickup or return (the export adds a link to each).
    'condition_photos', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'rental_id', (pg_catalog.string_to_array(o.name, '/'))[1],
        'stage', (pg_catalog.string_to_array(o.name, '/'))[2],
        'storage_path', o.name,
        'uploaded_at', o.created_at) order by o.created_at, o.name)
      from storage.objects o
      where o.bucket_id = 'rental-photos' and o.owner_id = v_uid::text), '[]'::jsonb),

    -- Claims on the caller's rentals (C4), as lender or renter.
    'claims', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'rental_id', c.rental_id,
        'your_role', case when c.lender_id = v_uid then 'lender' else 'renter' end,
        'amount', c.amount, 'reason', c.reason, 'evidence_paths', pg_catalog.to_jsonb(c.evidence_paths),
        'status', c.status, 'renter_note', c.renter_note,
        'decision_amount', c.decision_amount, 'decision', c.decision,
        'created_at', c.created_at, 'responded_at', c.responded_at, 'decided_at', c.decided_at) order by c.created_at)
      from public.rental_claims c where v_uid in (c.lender_id, c.renter_id)), '[]'::jsonb),

    -- Payment set-up (C4): Stripe holds the card and bank details; Dzirent keeps only these.
    'payments', pg_catalog.jsonb_build_object(
      'payment_profile_created_at', (select sc.created_at from public.stripe_customers sc where sc.user_id = v_uid),
      'payout_account', (select pg_catalog.jsonb_build_object('stripe_account_id', pa.stripe_account_id,
          'charges_enabled', pa.charges_enabled, 'payouts_enabled', pa.payouts_enabled,
          'details_submitted', pa.details_submitted, 'updated_at', pa.updated_at)
        from public.payout_accounts pa where pa.user_id = v_uid)),

    'blocked_people', coalesce((select pg_catalog.jsonb_agg(app_private.export_person(b.blocked_id))
      from public.blocks b where b.blocker_id = v_uid), '[]'::jsonb),

    -- Reports the caller filed. Not reports about them, and not the outcome, admin notes or
    -- evidence (those describe moderation of the other person).
    'reports_filed', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', rp.id,
        'about', rp.target_type,
        'person', app_private.export_person(rp.target_user_id),
        'listing_id', case when rp.target_type = 'listing' then rp.target_id end,
        'rental_id', case when rp.target_type = 'rental' then rp.target_id end,
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
        'messages', ns.messages, 'show_message_text', ns.show_message_text,
        'rental_reminders', ns.rental_reminders, 'email_rentals', ns.email_rentals, 'updated_at', ns.updated_at)
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
  ) || pg_catalog.jsonb_build_object(
    -- C5: the emails Dzirent sent you (or skipped) in the last 30 days: which one and when, not their text.
    'emails', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'email', em.template, 'status', em.status, 'created_at', em.created_at, 'finished_at', em.finished_at)
        order by em.created_at)
      from app_private.email_messages em where em.recipient_id = v_uid), '[]'::jsonb),
    -- C6: your ID verification: the result, your legal name (private) and the 18+ result. Dzirent keeps
    -- no ID images, selfies, birthdate or document details, so there are none to include.
    'id_verification', (select pg_catalog.jsonb_build_object(
        'status', iv.status, 'legal_name', iv.legal_name, 'is_adult', iv.is_adult, 'attempts', iv.attempts,
        'verified_at', iv.verified_at, 'updated_at', iv.updated_at)
      from public.identity_verifications iv where iv.user_id = v_uid)
  ) into v_result;

  insert into public.data_exports (user_id) values (v_uid);
  return v_result;
end;
$function$;

-- 12. The shop window: the "Verified" badge ----------------------------------------------------------
-- Listing cards (browse, fit, saved), the listing page, the studio page (and its cards) and chat
-- headers (my_conversations: the other person's). Return types change, so each is dropped and made again
-- with the same grants as before.
drop function public.browse_listings(double precision, double precision, double precision, text, text, text, text,
  text, text[], date, date, numeric, numeric, integer, boolean, boolean, text, integer, integer);
CREATE OR REPLACE FUNCTION public.browse_listings(p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_radius_miles double precision DEFAULT NULL::double precision, p_query text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_item_type text DEFAULT NULL::text, p_garment_type text DEFAULT NULL::text, p_size text DEFAULT NULL::text, p_styles text[] DEFAULT NULL::text[], p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_min_price numeric DEFAULT NULL::numeric, p_max_price numeric DEFAULT NULL::numeric, p_new_days integer DEFAULT NULL::integer, p_saved_only boolean DEFAULT false, p_saved_studios_only boolean DEFAULT false, p_sort text DEFAULT NULL::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, title text, price numeric, distance integer, city text, category text, cover_photo_path text, studio_name text, studio_handle text, price_per_day numeric, price_unit text, days integer, total numeric, is_verified boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_q text := nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_query, ''))), '');
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 30);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_sort text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_sort, '')));
  v_new_cutoff timestamp with time zone := case
    when p_new_days is not null and p_new_days > 0
    then pg_catalog.now() - (p_new_days || ' days')::interval
    else null
  end;
  v_norm_size text := nullif(pg_catalog.lower(pg_catalog.replace(coalesce(p_size, ''), ' ', '')), '');
  v_days integer := app_private.rental_days(p_start_date, p_end_date);
begin
  if v_q is not null then
    perform pg_catalog.set_config('pg_trgm.word_similarity_threshold', '0.3', true);
  end if;

  return query
  with filtered as (
    select
      l.id,
      l.title,
      l.price_usd as price,
      l.price_unit,
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
      p.is_verified,
      l.created_at,
      case
        when v_q is not null then
          greatest(
            extensions.word_similarity(v_q, pg_catalog.lower(l.title)),
            extensions.word_similarity(v_q, pg_catalog.lower(coalesce(l.description, '')))
          )
        else 0.0
      end as similarity_score
    from public.listings l
    join public.profiles p on p.id = l.lender_id
    where l.status = 'active'
      and (v_uid is null or l.lender_id <> v_uid)
      and (v_uid is null or not exists (
        select 1 from public.blocks bl
        where (bl.blocker_id = v_uid and bl.blocked_id = l.lender_id)
           or (bl.blocker_id = l.lender_id and bl.blocked_id = v_uid)
      ))
      and (
        v_q is null
        or pg_catalog.lower(l.title) like '%' || v_q || '%'
        or pg_catalog.lower(coalesce(l.description, '')) like '%' || v_q || '%'
        or extensions.word_similarity(v_q, pg_catalog.lower(l.title)) >= 0.3
        or extensions.word_similarity(v_q, pg_catalog.lower(coalesce(l.description, ''))) >= 0.3
      )
      and (p_category is null or l.category = p_category)
      and (p_item_type is null or l.item_type = p_item_type)
      and (p_garment_type is null or l.garment_type = p_garment_type)
      and (
        v_norm_size is null
        or (l.size_label is not null and (
          pg_catalog.lower(pg_catalog.replace(l.size_label, ' ', '')) = v_norm_size
          or v_norm_size = any(
            pg_catalog.string_to_array(
              pg_catalog.lower(pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(l.size_label, ' ', ''), '/', ','), '|', ',')),
              ','
            )
          )
        ))
      )
      and (
        p_styles is null
        or pg_catalog.cardinality(p_styles) = 0
        or l.listing_styles operator(pg_catalog.&&) p_styles
      )
      and (
        p_start_date is null or p_end_date is null
        or not exists (select 1 from public.availability av where av.listing_id = l.id)
        or (
          select coalesce(
            pg_catalog.range_agg(pg_catalog.daterange(av.start_date, av.end_date, '[]')),
            pg_catalog.datemultirange()
          )
          from public.availability av
          where av.listing_id = l.id
        ) operator(pg_catalog.@>) pg_catalog.daterange(p_start_date, p_end_date, '[]')
      )
      -- C3: booked days (accepted, awaiting payment, paid, picked up) are unavailable.
      and (
        p_start_date is null or p_end_date is null
        or not exists (
          select 1 from public.rentals rt
          where rt.listing_id = l.id
            and rt.status in ('accepted', 'awaiting_payment', 'paid', 'picked_up')
            and pg_catalog.daterange(rt.start_date, rt.end_date, '[]') operator(pg_catalog.&&)
                pg_catalog.daterange(p_start_date, p_end_date, '[]'))
      )
      and (p_min_price is null or l.price_usd >= p_min_price)
      and (p_max_price is null or l.price_usd <= p_max_price)
      and (v_new_cutoff is null or l.created_at >= v_new_cutoff)
      and (
        not p_saved_only
        or (v_uid is not null and exists (
          select 1 from public.saved_listings sl
          where sl.user_id = v_uid and sl.listing_id = l.id
        ))
      )
      and (
        not p_saved_studios_only
        or (v_uid is not null and exists (
          select 1 from public.saved_studios ss
          where ss.user_id = v_uid and ss.lender_id = l.lender_id
        ))
      )
  )
  select
    f.id,
    f.title,
    f.price,
    f.distance,
    f.city,
    f.category,
    f.cover_photo_path,
    f.studio_name,
    f.studio_handle,
    f.price,
    f.price_unit,
    v_days,
    case when v_days is not null then f.price * v_days end,
    f.is_verified
  from filtered f
  where (p_radius_miles is null or (f.distance is not null and f.distance <= p_radius_miles))
  order by
    case when v_sort = 'price_low' then f.price end asc nulls last,
    case when v_sort = 'price_high' then f.price end desc nulls last,
    case when v_sort = 'newest' then f.created_at end desc,
    case when v_sort = 'nearest' then f.distance end asc nulls last,
    case when v_sort = '' and v_q is not null then f.similarity_score end desc,
    case when v_sort = '' and p_lat is not null and p_lng is not null then f.distance end asc nulls last,
    f.created_at desc
  limit v_limit
  offset v_offset;
end;
$function$;
grant execute on function public.browse_listings(double precision, double precision, double precision, text, text, text, text,
  text, text[], date, date, numeric, numeric, integer, boolean, boolean, text, integer, integer) to anon, authenticated, service_role;

drop function public.get_listing(uuid, double precision, double precision, date, date);
CREATE OR REPLACE FUNCTION public.get_listing(p_listing_id uuid, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date)
 RETURNS TABLE(id uuid, title text, category text, item_type text, garment_type text, size_label text, description text, price numeric, price_note text, deposit_note text, retail_value numeric, listing_styles text[], city text, distance integer, studio_name text, studio_handle text, photos jsonb, measurements jsonb, availability jsonb, created_at timestamp with time zone, price_per_day numeric, price_unit text, days integer, total numeric, booked jsonb, is_verified boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_days integer := app_private.rental_days(p_start_date, p_end_date);
begin
  return query
  select
    l.id,
    l.title,
    l.category,
    l.item_type,
    l.garment_type,
    l.size_label,
    l.description,
    l.price_usd as price,
    l.price_note,
    l.deposit_note,
    l.retail_value,
    l.listing_styles,
    coalesce(nullif(l.city, ''), nullif(p.city, '')) as city,
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
    coalesce(nullif(p.studio_name, ''), nullif(p.display_name, ''), 'Studio') as studio_name,
    p.studio_handle,
    coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'storage_path', lp.storage_path,
          'position', lp.position,
          'slot', lp.slot
        ) order by lp.position asc, lp.id asc
      )
      from public.listing_photos lp
      where lp.listing_id = l.id
    ), '[]'::jsonb) as photos,
    coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'label', lm.label,
          'value', lm.value,
          'unit', lm.unit
        ) order by lm.label asc
      )
      from public.listing_measurements lm
      where lm.listing_id = l.id
    ), '[]'::jsonb) as measurements,
    coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'start_date', av.start_date,
          'end_date', av.end_date
        ) order by av.start_date asc
      )
      from public.availability av
      where av.listing_id = l.id
    ), '[]'::jsonb) as availability,
    l.created_at,
    l.price_usd as price_per_day,
    l.price_unit,
    v_days as days,
    case when v_days is not null then l.price_usd * v_days end as total,
    coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('start_date', rt.start_date, 'end_date', rt.end_date)
        order by rt.start_date asc)
      from public.rentals rt
      where rt.listing_id = l.id
        and rt.status in ('accepted', 'awaiting_payment', 'paid', 'picked_up')
        and rt.end_date >= app_private.rental_today()
    ), '[]'::jsonb) as booked,
    p.is_verified
  from public.listings l
  join public.profiles p on p.id = l.lender_id
  where l.id = p_listing_id
    and l.status = 'active'
    and (v_uid is null or not exists (
      select 1 from public.blocks bl
      where (bl.blocker_id = v_uid and bl.blocked_id = l.lender_id)
         or (bl.blocker_id = l.lender_id and bl.blocked_id = v_uid)
    ));
end;
$function$;
grant execute on function public.get_listing(uuid, double precision, double precision, date, date) to anon, authenticated, service_role;

drop function public.fit_listings(double precision, double precision, double precision, integer, integer);
CREATE OR REPLACE FUNCTION public.fit_listings(p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_radius_miles double precision DEFAULT NULL::double precision, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, title text, price numeric, distance integer, city text, category text, cover_photo_path text, studio_name text, studio_handle text, is_verified boolean)
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
      p.is_verified,
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
    r.studio_handle,
    r.is_verified
  from results r
  where (p_radius_miles is null or (r.distance is not null and r.distance <= p_radius_miles))
  order by r.distance asc nulls last, r.created_at desc
  limit v_limit
  offset v_offset;
end;
$function$;
revoke execute on function public.fit_listings(double precision, double precision, double precision, integer, integer) from public, anon;
grant execute on function public.fit_listings(double precision, double precision, double precision, integer, integer) to authenticated, service_role;

drop function public.my_saved_listings(double precision, double precision, integer, integer);
CREATE OR REPLACE FUNCTION public.my_saved_listings(p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_limit integer DEFAULT 30, p_offset integer DEFAULT 0)
 RETURNS TABLE(listing_id uuid, is_available boolean, title text, price numeric, distance integer, city text, category text, cover_photo_path text, studio_name text, studio_handle text, created_at timestamp with time zone, is_verified boolean)
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
    sl.created_at,
    coalesce(l.id is not null and l.status = 'active' and p.is_verified, false) as is_verified
  from public.saved_listings sl
  left join public.listings l on l.id = sl.listing_id
  left join public.profiles p on p.id = l.lender_id
  where sl.user_id = v_uid
  order by sl.created_at desc
  limit v_limit
  offset v_offset;
end;
$function$;
revoke execute on function public.my_saved_listings(double precision, double precision, integer, integer) from public, anon;
grant execute on function public.my_saved_listings(double precision, double precision, integer, integer) to authenticated, service_role;

drop function public.get_studio(text, double precision, double precision);
CREATE OR REPLACE FUNCTION public.get_studio(p_handle text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision)
 RETURNS TABLE(studio_name text, studio_handle text, studio_bio text, style_tags text[], city text, pickup_area text, rental_count integer, reply_minutes integer, is_saved boolean, listings jsonb, is_own boolean, since text, is_verified boolean)
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

  -- C3: completed rentals only.
  select pg_catalog.count(*)::integer into v_rental_count
  from public.rentals r
  where r.lender_id = v_lender.id and r.status = 'completed';

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
        'studio_handle', v_lender.studio_handle,
        'is_verified', coalesce(v_lender.is_verified, false)
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
    v_since,
    coalesce(v_lender.is_verified, false);
end;
$function$;
revoke execute on function public.get_studio(text, double precision, double precision) from public, anon;
grant execute on function public.get_studio(text, double precision, double precision) to authenticated, service_role;

drop function public.my_conversations(uuid, integer, integer);
CREATE OR REPLACE FUNCTION public.my_conversations(p_conversation_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, listing_id uuid, listing_title text, cover_photo_path text, price numeric, other_name text, other_handle text, last_message text, last_message_at timestamp with time zone, unread boolean, requested_start date, requested_end date, other_is_verified boolean)
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
    c.requested_end,
    coalesce(other_p.is_verified, false) as other_is_verified
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
revoke execute on function public.my_conversations(uuid, integer, integer) from public, anon;
grant execute on function public.my_conversations(uuid, integer, integer) to authenticated, service_role;
