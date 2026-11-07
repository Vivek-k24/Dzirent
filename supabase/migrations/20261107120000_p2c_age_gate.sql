-- P2C: age gate (Texas SB 2420, Utah app store age laws).
-- The apps report what the phone's app store says about the user's age (Google Play Age Signals;
-- Apple's Declared Age Range later), and the website records the 18+ confirmation at sign-up.
-- No birthdate is ever asked for or stored: only adult, minor or unknown.
-- When a minor result is recorded, the account can only read its own data and delete itself.

-- 1. The checks. Written only by record_age_check; the owner can read their own.
create table public.age_checks (
  id bigint generated always as identity,
  user_id uuid not null,
  source text not null,
  result text not null,
  platform text not null,
  checked_at timestamp with time zone default pg_catalog.now() not null,
  constraint age_checks_pkey primary key (id),
  constraint age_checks_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade,
  constraint age_checks_source_check check (source in ('store_signal', 'self_declared')),
  constraint age_checks_result_check check (result in ('adult', 'minor', 'unknown')),
  constraint age_checks_platform_check check (platform in ('web', 'android', 'ios'))
);
create index age_checks_user_idx on public.age_checks using btree (user_id, id desc);
alter table public.age_checks enable row level security;
revoke all on public.age_checks from public, anon, authenticated, service_role;
grant select on public.age_checks to authenticated;
create policy age_checks_owner_read on public.age_checks
  for select to authenticated using (user_id = (select auth.uid()));

-- 2. Whether an account is blocked: its latest decisive check says minor. A store's "adult"
-- clears an earlier minor; a self-declared "adult" never does (anyone can tick a box), and an
-- "unknown" changes nothing.
create or replace function app_private.age_blocked(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((
    select c.result = 'minor'
    from public.age_checks c
    where c.user_id = p_user
      and (c.result = 'minor' or (c.source = 'store_signal' and c.result = 'adult'))
    order by c.id desc
    limit 1), false);
$function$;

-- 3. Recording a check. Returns true when the account is blocked after it.
create or replace function public.record_age_check(p_source text, p_result text, p_platform text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_result text := p_result;
  v_adult_confirmed boolean;
  v_last public.age_checks;
  v_was_blocked boolean;
  v_blocked boolean;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_source is null or p_source not in ('store_signal', 'self_declared') then
    raise exception 'Unknown age check source' using errcode = '22023';
  end if;
  if p_result is null or p_result not in ('adult', 'minor', 'unknown') then
    raise exception 'Unknown age check result' using errcode = '22023';
  end if;
  if p_platform is null or p_platform not in ('web', 'android', 'ios') then
    raise exception 'Unknown platform' using errcode = '22023';
  end if;
  select p.adult_confirmed into v_adult_confirmed from public.profiles p where p.id = v_uid;
  if not found then
    raise exception 'Not signed in' using errcode = '42501';
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

-- 4. The block. Every write an app (or a function acting for the user) makes is refused while the
-- caller is blocked. The caller is auth.uid(), so server jobs (no user), admins acting on the
-- account and account deletion (Auth admin API) are not stopped. Deletes are allowed: deleting
-- the account removes everything anyway. Chat read receipts and "inbox seen" are part of reading.
-- dzirent.age_gate_skip is set (for one statement, inside the transaction) only by
-- mark_activity_seen and by record_age_check pausing listings; clients can't set settings.
create or replace function app_private.refuse_minor_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is not null
     and pg_catalog.current_setting('dzirent.age_gate_skip', true) is distinct from 'on'
     and app_private.age_blocked(v_uid) then
    raise exception using errcode = 'P0001', message = 'Dzirent is only for people 18 and older.';
  end if;
  return new;
end;
$function$;

-- Named "age_gate" so it fires before the tables' other BEFORE triggers (they run in name order),
-- and a blocked account sees this message, not a text-filter or photo-check one.
do $do$
declare
  v_table text;
begin
  foreach v_table in array array[
    'accessory_declarations', 'availability', 'blocks', 'conversations', 'device_tokens',
    'legal_acceptances', 'listing_declarations', 'listing_events', 'listing_measurements',
    'listing_photos', 'listing_scans', 'listings', 'messages', 'notification_settings',
    'private_profiles', 'profiles', 'rental_outcomes', 'rentals', 'reports', 'saved_listings',
    'saved_studios', 'suggestion_events'
  ] loop
    execute pg_catalog.format(
      'create trigger age_gate before insert or update on public.%I '
      'for each row execute function app_private.refuse_minor_account()', v_table);
  end loop;
end;
$do$;

-- "Inbox seen" is written while reading the inbox, so a blocked account can still read it.
create or replace function public.mark_activity_seen()
returns void
language plpgsql
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  perform pg_catalog.set_config('dzirent.age_gate_skip', 'on', true);
  insert into public.private_profiles (user_id, activity_seen_at)
  values (v_uid, pg_catalog.now())
  on conflict (user_id) do update set activity_seen_at = pg_catalog.now();
  perform pg_catalog.set_config('dzirent.age_gate_skip', 'off', true);
end;
$function$;

-- 5. Admins see the latest age check and the block in user lookup (same function as P2B, two more fields).
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

-- 6. Access.
revoke execute on function app_private.age_blocked(uuid) from public, anon, authenticated;
revoke execute on function app_private.refuse_minor_account() from public, anon, authenticated;
revoke execute on function public.record_age_check(text, text, text) from public, anon;
grant execute on function public.record_age_check(text, text, text) to authenticated;
revoke execute on function public.mark_activity_seen() from public, anon;
grant execute on function public.mark_activity_seen() to authenticated;
