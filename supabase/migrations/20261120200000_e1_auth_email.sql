-- E1 (Claude Code, 2026-11-20): sign-in and email.
--  1. Finished profiles: profiles.profile_completed_at (every existing profile counts as finished),
--     set at sign-up when the form asked for the 18+ tick and a name, else by complete_profile()
--     (first Google sign-in). Listing (publishing), renting and messaging refuse an unfinished
--     profile with DZ-E1078 "Finish your profile first." (app_private.require_complete_profile, in
--     the terms_and_limits trigger and rental_guard), whatever the client shows.
--  2. The address's email flag: profiles.email_status ('ok', 'bounced', 'complained') and
--     email_status_at, written only by the server (email-events, Resend's webhook); cleared when
--     the account's email address changes. Admins see it in user lookup.
--  3. Emails: queue_email no longer checks "Email me about rentals"; email_prepare returns the
--     recipient and the facts (the switch, the flag), and send-email decides (rental reminders and
--     the account-deleted email are always sent). email_event_record (bounces and complaints, each
--     event once, kept like the email records), email_unsubscribe (one-click List-Unsubscribe).
--  4. The website's "forgot password" and "resend the confirmation" emails: per network address
--     and per email address limits (auth_email_allowed; settings rate_limit_auth_email_ip and
--     rate_limit_auth_email_address). Keys are stored only as SHA-256 hashes.
-- Function bodies are the current ones (dumped from a database built from every migration), with
-- each E1 edit applied exactly once.

-- 1. Finished profiles -----------------------------------------------------------------------------
alter table public.profiles
  add column profile_completed_at timestamp with time zone,
  add column email_status text not null default 'ok',
  add column email_status_at timestamp with time zone,
  add constraint profiles_email_status_check check (email_status in ('ok', 'bounced', 'complained'));
comment on column public.profiles.profile_completed_at is
  'E1: when the profile was finished (18+ tick, display name). Null for a Google sign-up until it finishes; listing, renting and messaging need it. Server-written.';
comment on column public.profiles.email_status is
  'E1: ok, or bounced / complained (Resend''s webhook through email-events). Non-essential emails stop while it isn''t ok. Cleared when the email address changes. Server-written.';

-- Nobody is locked out: every profile that exists now went through a sign-up form.
update public.profiles set profile_completed_at = created_at where profile_completed_at is null;

create function app_private.keep_profile_server_fields()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if current_user in ('authenticated', 'anon') then
    new.profile_completed_at := old.profile_completed_at;
    new.email_status := old.email_status;
    new.email_status_at := old.email_status_at;
  end if;
  return new;
end;
$function$;
revoke execute on function app_private.keep_profile_server_fields() from public, anon, authenticated;
create trigger profiles_keep_server_fields before update on public.profiles
  for each row execute function app_private.keep_profile_server_fields();

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
    (id, display_name, role, adult_confirmed, city, approx_lat, approx_lng, profile_completed_at)
  values
    (new.id, coalesce(new.raw_user_meta_data->>'display_name', ''),
     coalesce(new.raw_user_meta_data->>'role', 'renter'),
     coalesce((new.raw_user_meta_data->>'adult_confirmed')::boolean, false),
     nullif(new.raw_user_meta_data->>'city', ''), v_lat, v_lng,
     -- E1: a sign-up form that asked for the 18+ tick and a name gives a finished profile. Google
     -- (and any sign-up without them) finishes it with complete_profile.
     case when coalesce((new.raw_user_meta_data->>'adult_confirmed')::boolean, false)
            and pg_catalog.btrim(coalesce(new.raw_user_meta_data->>'display_name', '')) <> ''
          then pg_catalog.now() end);
  return new;
end;
$function$;

create function app_private.require_complete_profile(p_uid uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if p_uid is not null
     and exists (select 1 from public.profiles p where p.id = p_uid and p.profile_completed_at is null) then
    raise exception 'DZ-E1078: Finish your profile first.' using errcode = 'P0001', hint = 'profile';
  end if;
end;
$function$;
revoke execute on function app_private.require_complete_profile(uuid) from public, anon, authenticated;

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
  -- E1: listing, renting and messaging need a finished profile (18+ tick, name) first.
  if v_verify then
    perform app_private.require_complete_profile(v_uid);
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
CREATE OR REPLACE FUNCTION app_private.rental_guard(p_uid uuid, p_other uuid, p_check_block boolean)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_message text;
begin
  if p_uid is null or not exists (select 1 from public.profiles p where p.id = p_uid) then
    raise exception 'DZ-E1001: Not signed in' using errcode = '42501';
  end if;
  if app_private.age_blocked(p_uid) then
    raise exception using errcode = 'P0001', message = 'DZ-E1030: Dzirent is only for people 18 and older.';
  end if;
  v_message := app_private.suspension_message(p_uid);
  if v_message is not null then
    raise exception using message = v_message, errcode = 'P0001';
  end if;
  -- E1: a finished profile first (Google sign-ups finish it after their first sign-in).
  perform app_private.require_complete_profile(p_uid);
  perform app_private.require_current_terms(p_uid);
  if p_check_block and exists (
    select 1 from public.blocks bl
    where (bl.blocker_id = p_uid and bl.blocked_id = p_other)
       or (bl.blocker_id = p_other and bl.blocked_id = p_uid)
  ) then
    raise exception 'DZ-E4003: You can''t rent with this person.' using errcode = '42501';
  end if;
end;
$function$;
-- "Finish your profile": the 18+ tick (required), the display name (prefilled from Google by the
-- clients) and, optionally, the rough location the sign-up form uses (a city and its rounded
-- coordinates). Calling it again on a finished profile just updates those fields.
create function public.complete_profile(p_display_name text, p_adult boolean, p_city text default null,
                                        p_lat double precision default null, p_lng double precision default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_name text := pg_catalog.btrim(coalesce(p_display_name, ''));
  v_city text := nullif(pg_catalog.btrim(coalesce(p_city, '')), '');
  v_done timestamp with time zone;
begin
  if v_uid is null or not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'DZ-E1001: Not signed in' using errcode = '42501';
  end if;
  if not coalesce(p_adult, false) then
    raise exception 'DZ-E1079: Confirm that you are 18 or older.' using errcode = '22023', hint = 'adult';
  end if;
  if v_name = '' or pg_catalog.char_length(v_name) > 80 then
    raise exception 'DZ-E1080: Enter your name (up to 80 characters).' using errcode = '22023', hint = 'display_name';
  end if;
  if (p_lat is null) <> (p_lng is null)
     or (p_lat is not null and (p_lat not between -90 and 90 or p_lng not between -180 and 180))
     or (v_city is not null and (p_lat is null or pg_catalog.char_length(v_city) > 80)) then
    raise exception 'DZ-E1082: Pick your city from the list.' using errcode = '22023', hint = 'city';
  end if;
  update public.profiles p set
    display_name = v_name,
    adult_confirmed = true,
    city = case when p_lat is not null then v_city else p.city end,
    approx_lat = case when p_lat is not null then pg_catalog.round(p_lat::numeric, 2)::double precision else p.approx_lat end,
    approx_lng = case when p_lng is not null then pg_catalog.round(p_lng::numeric, 2)::double precision else p.approx_lng end,
    profile_completed_at = coalesce(p.profile_completed_at, pg_catalog.now())
  where p.id = v_uid
  returning p.profile_completed_at into v_done;
  return pg_catalog.jsonb_build_object('profile_completed_at', v_done);
end;
$function$;

-- 2. The address's email flag ----------------------------------------------------------------------
-- A new address starts clean: the flag belonged to the old one.
create function app_private.email_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.email is distinct from old.email then
    update public.profiles set email_status = 'ok', email_status_at = null
      where id = new.id and email_status <> 'ok';
  end if;
  return null;
end;
$function$;
revoke execute on function app_private.email_changed() from public, anon, authenticated;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row execute function app_private.email_changed();

-- Resend's webhook events, each once (Svix message id), kept like the email records. Never the
-- address or the email's text.
create table app_private.email_events (
  event_id text primary key constraint email_events_id_check check (pg_catalog.char_length(event_id) between 1 and 100),
  event_type text not null constraint email_events_type_check check (pg_catalog.char_length(event_type) between 1 and 60),
  provider_message_id text constraint email_events_message_check check (pg_catalog.char_length(provider_message_id) <= 200),
  user_id uuid references public.profiles (id) on delete set null,
  result text not null constraint email_events_result_check check (result in (
    'flagged_bounced', 'flagged_complained', 'temporary_bounce', 'no_account', 'ignored')),
  received_at timestamp with time zone not null default pg_catalog.now()
);
create index email_events_received_idx on app_private.email_events (received_at);
create index email_events_user_idx on app_private.email_events (user_id);
alter table app_private.email_events enable row level security;
revoke all on app_private.email_events from public, anon, authenticated, service_role;
comment on table app_private.email_events is
  'E1: Resend webhook events (bounced, complained, others ignored) by event id, with the account it was matched to and what was done. Never the address. Kept for email_log_retention_days.';

-- email-events (server key): one webhook event. The account is the one the email was sent to (our
-- own record of Resend's message id), else the account with that address (sign-in emails go
-- through Resend's SMTP, so Dzirent has no record of them). A hard bounce flags 'bounced', a spam
-- complaint 'complained' (a complaint is never turned back into a bounce); a temporary bounce and
-- every other event change nothing.
create function public.email_event_record(p_event_id text, p_type text, p_message_id text,
                                          p_addresses text[], p_bounce_type text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_event text := pg_catalog.btrim(coalesce(p_event_id, ''));
  v_type text := pg_catalog.left(pg_catalog.btrim(coalesce(p_type, '')), 60);
  v_message text := nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_message_id, '')), 200), '');
  v_user uuid;
  v_result text;
begin
  if v_event = '' or pg_catalog.char_length(v_event) > 100 or v_type = '' then
    raise exception 'DZ-E9016: This request isn''t valid.' using errcode = '22023';
  end if;
  if exists (select 1 from app_private.email_events e where e.event_id = v_event) then
    return 'duplicate';
  end if;
  if v_message is not null then
    select em.recipient_id into v_user from app_private.email_messages em
      where em.provider_message_id = v_message and em.recipient_id is not null
      order by em.created_at desc limit 1;
  end if;
  if v_user is null and p_addresses is not null then
    select u.id into v_user from auth.users u
      where pg_catalog.lower(u.email) in (select pg_catalog.lower(pg_catalog.btrim(a)) from pg_catalog.unnest(p_addresses) a)
      order by u.created_at limit 1;
  end if;

  if v_type not in ('email.bounced', 'email.complained') then
    v_result := 'ignored';
  elsif v_user is null then
    v_result := 'no_account';
  elsif v_type = 'email.bounced' and coalesce(pg_catalog.lower(p_bounce_type), 'permanent') <> 'permanent' then
    v_result := 'temporary_bounce';
  elsif v_type = 'email.bounced' then
    update public.profiles set email_status = 'bounced', email_status_at = pg_catalog.now()
      where id = v_user and email_status = 'ok';
    v_result := 'flagged_bounced';
  else
    update public.profiles set email_status = 'complained', email_status_at = pg_catalog.now()
      where id = v_user and email_status <> 'complained';
    v_result := 'flagged_complained';
  end if;

  insert into app_private.email_events (event_id, event_type, provider_message_id, user_id, result)
  values (v_event, v_type, v_message, v_user, v_result)
  on conflict (event_id) do nothing;
  delete from app_private.email_events e
    where e.received_at < pg_catalog.now()
      - pg_catalog.make_interval(days => coalesce((select (s.value #>> '{}')::integer from app_private.settings s
                                                   where s.key = 'email_log_retention_days'), 30));
  return v_result;
end;
$function$;

-- email-unsubscribe (server key, after checking the link's signature): turns "Email me about
-- rentals" off. Rental reminders and account emails still go (they are essential).
create function public.email_unsubscribe(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_user_id is null or not exists (select 1 from public.profiles p where p.id = p_user_id) then
    return 'gone';
  end if;
  insert into public.notification_settings (user_id, email_rentals) values (p_user_id, false)
  on conflict (user_id) do update set email_rentals = false, updated_at = pg_catalog.now();
  return 'unsubscribed';
end;
$function$;

-- 3. Emails: the switch moves to send-email ---------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.queue_email(p_template text, p_recipient uuid, p_rental uuid, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
begin
  if p_recipient is null
     or not exists (select 1 from vault.decrypted_secrets ds where ds.name = 'send_email_url') then
    return null;
  end if;
  -- E1: no switch check here any more: send-email decides (rental reminders and the account
  -- email are always sent; the rest follow "Email me about rentals" and the address's flag).
  insert into app_private.email_messages (template, recipient_id, rental_id, details)
  values (p_template, p_recipient, p_rental, coalesce(p_details, '{}'::jsonb))
  returning id into v_id;
  perform app_private.enqueue_job('send_email', pg_catalog.jsonb_build_object('email_id', v_id));
  return v_id;
exception when others then
  raise warning 'Email skipped: %', sqlerrm;
  return null;
end;
$function$;
CREATE OR REPLACE FUNCTION public.email_prepare(p_email_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_email app_private.email_messages;
  v_rental public.rentals;
  v_to text;
  v_skip text;
  v_role text;
  v_other uuid;
  v_data jsonb;
begin
  select * into v_email from app_private.email_messages e where e.id = p_email_id for update;
  if not found then
    return pg_catalog.jsonb_build_object('state', 'gone');
  end if;
  if v_email.status <> 'queued' then
    return pg_catalog.jsonb_build_object('state', 'finished', 'status', v_email.status);
  end if;

  if v_email.template = 'account_deleted' then
    v_to := v_email.to_address;
    v_data := '{}'::jsonb;
  else
    select u.email into v_to from auth.users u where u.id = v_email.recipient_id;
    -- E1: the switch is checked by send-email (prefs below), so reminders can go out with it off.
    select * into v_rental from public.rentals r where r.id = v_email.rental_id;
    if not found then
      v_skip := coalesce(v_skip, 'rental_gone');
    else
      v_role := case when v_rental.renter_id = v_email.recipient_id then 'renter' else 'lender' end;
      v_other := case when v_role = 'renter' then v_rental.lender_id else v_rental.renter_id end;
      select pg_catalog.jsonb_build_object(
          'role', v_role,
          'name', (select p.display_name from public.profiles p where p.id = v_email.recipient_id),
          'other_name', (select coalesce(nullif(pg_catalog.btrim(p.studio_name), ''), p.display_name) from public.profiles p where p.id = v_other),
          'listing_title', (select l.title from public.listings l where l.id = v_rental.listing_id),
          'status', v_rental.status,
          'start_date', v_rental.start_date,
          'end_date', v_rental.end_date,
          'days', v_rental.days,
          'price_per_day', v_rental.price_per_day,
          'total', v_rental.total,
          'currency', v_rental.currency,
          'fee_amount', v_rental.fee_amount,
          'tax_amount', v_rental.tax_amount,
          'refund_amount', v_rental.refund_amount,
          'deposit_amount', v_rental.deposit_amount,
          'deposit_status', v_rental.deposit_status,
          'deposit_captured_amount', v_rental.deposit_captured_amount,
          'payment_status', v_rental.payment_status,
          'payment_due_at', v_rental.payment_due_at,
          'expires_at', v_rental.expires_at,
          'payments_enabled', app_private.payments_enabled(),
          'timezone', app_private.setting_text('rental_timezone'),
          'chat_path', '/app/messages/' || v_rental.conversation_id,
          'kind', v_email.details ->> 'kind',
          'detail', v_email.details ->> 'detail',
          'claim', (select pg_catalog.jsonb_build_object('amount', c.amount, 'status', c.status, 'decision_amount', c.decision_amount)
                    from public.rental_claims c where c.rental_id = v_rental.id))
        into v_data;
    end if;
  end if;
  if v_to is null or v_to !~ '@' then
    v_skip := coalesce(v_skip, 'no_address');
  end if;

  if v_skip is not null then
    update app_private.email_messages
      set status = 'skipped', skip_reason = v_skip, to_address = null, finished_at = pg_catalog.now()
      where id = v_email.id;
    return pg_catalog.jsonb_build_object('state', 'skipped', 'reason', v_skip);
  end if;
  -- E1: who it is for (the unsubscribe link) and the facts send-email's preference check needs.
  return pg_catalog.jsonb_build_object('state', 'send', 'to', v_to, 'template', v_email.template, 'data', v_data,
    'recipient_id', v_email.recipient_id,
    'prefs', pg_catalog.jsonb_build_object(
      'email_rentals', coalesce((select ns.email_rentals from public.notification_settings ns where ns.user_id = v_email.recipient_id), true),
      'email_status', coalesce((select p.email_status from public.profiles p where p.id = v_email.recipient_id), 'ok')));
end;
$function$;
-- 4. The website's password-reset and confirmation-resend limits ----------------------------------
create table app_private.auth_email_counters (
  kind text not null constraint auth_email_counters_kind_check check (kind in ('recovery', 'signup_resend')),
  scope text not null constraint auth_email_counters_scope_check check (scope in ('ip', 'address')),
  key_hash text not null constraint auth_email_counters_hash_check check (key_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamp with time zone not null,
  hits integer not null,
  constraint auth_email_counters_pkey primary key (kind, scope, key_hash)
);
alter table app_private.auth_email_counters enable row level security;
revoke all on app_private.auth_email_counters from public, anon, authenticated, service_role;
comment on table app_private.auth_email_counters is
  'E1: counters for the website''s "forgot password" and "send the link again" emails, per network address and per email address, stored only as SHA-256 hashes.';

insert into app_private.settings (key, value, note, label, area, value_type, unit, min_value, max_value, decided_by, affects_terms) values
  ('rate_limit_auth_email_ip', '{"max": 20, "window_seconds": 3600}'::jsonb,
   'Password-reset and confirmation emails the website sends for one network address. More get "Too many attempts".',
   'Sign-in emails per network address', 'rate_limits', 'rate_limit', 'per hour', 1, 1000, 'owner', false),
  ('rate_limit_auth_email_address', '{"max": 3, "window_seconds": 3600}'::jsonb,
   'Password-reset and confirmation emails the website sends to one email address. More are not sent, and the page still says the link was sent (so it never tells whether an account exists).',
   'Sign-in emails per email address', 'rate_limits', 'rate_limit', 'per hour', 1, 100, 'owner', false)
on conflict (key) do nothing;

-- One counter: true while under the limit (and counted), false once over it.
create function app_private.auth_email_take(p_kind text, p_scope text, p_value text)
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
  v_hash text := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.lower(pg_catalog.btrim(p_value)), 'UTF8')), 'hex');
  v_hits integer;
begin
  select s.value into v_rule from app_private.settings s where s.key = 'rate_limit_auth_email_' || p_scope;
  if v_rule is null then
    return true;
  end if;
  v_max := (v_rule ->> 'max')::integer;
  v_window := pg_catalog.make_interval(secs => (v_rule ->> 'window_seconds')::double precision);
  insert into app_private.auth_email_counters as c (kind, scope, key_hash, window_started_at, hits)
  values (p_kind, p_scope, v_hash, v_now, 1)
  on conflict (kind, scope, key_hash) do update set
    window_started_at = case when c.window_started_at <= v_now - v_window then v_now else c.window_started_at end,
    hits = case when c.window_started_at <= v_now - v_window then 1 else c.hits + 1 end
  returning c.hits into v_hits;
  if v_hits > v_max then
    update app_private.auth_email_counters c set hits = c.hits - 1
      where c.kind = p_kind and c.scope = p_scope and c.key_hash = v_hash;
    return false;
  end if;
  return true;
end;
$function$;
revoke execute on function app_private.auth_email_take(text, text, text) from public, anon, authenticated;

-- The website asks before sending a password-reset (recovery) or confirmation (signup_resend)
-- email: 'ok', 'ip_limited' (it shows "Too many attempts") or 'address_limited' (it sends nothing
-- and still shows the neutral "we've sent a link"). A blank address (local development) skips
-- the network-address limit.
create function public.auth_email_allowed(p_kind text, p_ip text, p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_ip text := pg_catalog.btrim(coalesce(p_ip, ''));
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, '')));
begin
  if p_kind is null or p_kind not in ('recovery', 'signup_resend')
     or v_email = '' or pg_catalog.char_length(v_email) > 320 or pg_catalog.char_length(v_ip) > 100 then
    raise exception 'DZ-E9016: This request isn''t valid.' using errcode = '22023';
  end if;
  delete from app_private.auth_email_counters c where c.window_started_at < pg_catalog.now() - interval '2 days';
  if v_ip <> '' and not app_private.auth_email_take(p_kind, 'ip', v_ip) then
    return 'ip_limited';
  end if;
  if not app_private.auth_email_take(p_kind, 'address', v_email) then
    return 'address_limited';
  end if;
  return 'ok';
end;
$function$;

-- 5. Admin user lookup: the finished profile and the email flag -----------------------------------
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
      'age_blocked', app_private.age_blocked(p.id),
      -- E1: the finished profile and the address's email flag (bounced or marked as spam).
      'profile_completed_at', p.profile_completed_at,
      'email_status', p.email_status, 'email_status_at', p.email_status_at)), '[]'::jsonb)
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

-- Who may call what ------------------------------------------------------------------------------
revoke execute on function public.complete_profile(text, boolean, text, double precision, double precision) from public, anon;
grant execute on function public.complete_profile(text, boolean, text, double precision, double precision) to authenticated;

-- The website calls it before a reset or resend email, signed in or not.
revoke execute on function public.auth_email_allowed(text, text, text) from public;
grant execute on function public.auth_email_allowed(text, text, text) to anon, authenticated;

-- Edge Functions only (the server key).
revoke execute on function public.email_event_record(text, text, text, text[], text) from public, anon, authenticated;
grant execute on function public.email_event_record(text, text, text, text[], text) to service_role;
revoke execute on function public.email_unsubscribe(uuid) from public, anon, authenticated;
grant execute on function public.email_unsubscribe(uuid) to service_role;
