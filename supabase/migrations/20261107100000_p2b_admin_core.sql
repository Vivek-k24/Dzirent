-- P2B part 1 (core): admins with two-step sign-in, the append-only admin log, report evidence
-- that outlives the people involved, suspensions, and server holds that hide listings.
-- The admin functions themselves are in the next migration.

-- 1. Admins. Closed to every API role; changed only by the seed script (supabase/seed/admins.mjs).
create table app_private.admin_users (
  user_id uuid not null,
  added_at timestamp with time zone default pg_catalog.now() not null,
  added_by text not null,
  constraint admin_users_pkey primary key (user_id),
  constraint admin_users_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade
);
alter table app_private.admin_users enable row level security;
revoke all on app_private.admin_users from public, anon, authenticated, service_role;

-- True only for an admin signed in with two-step verification (JWT aal2).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((select auth.jwt()->>'aal') = 'aal2', false)
     and exists (select 1 from app_private.admin_users a where a.user_id = (select auth.uid()));
$function$;

-- Every admin function calls this first. Returns the admin's id.
create or replace function app_private.require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (select 1 from app_private.admin_users a where a.user_id = v_uid) then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if coalesce(auth.jwt()->>'aal', '') <> 'aal2' then
    raise exception 'Sign in with two-step verification to use admin tools' using errcode = '42501';
  end if;
  return v_uid;
end;
$function$;

-- 2. The admin log: one row per admin function call. Append-only for everyone.
create table app_private.admin_actions (
  id bigint generated always as identity,
  admin_id uuid,
  action text not null,
  target_type text,
  target_id text,
  reason text,
  before jsonb,
  after jsonb,
  created_at timestamp with time zone default pg_catalog.now() not null,
  constraint admin_actions_pkey primary key (id)
);
create index admin_actions_created_idx on app_private.admin_actions using btree (created_at desc);
create index admin_actions_target_idx on app_private.admin_actions using btree (target_type, target_id);
alter table app_private.admin_actions enable row level security;
revoke all on app_private.admin_actions from public, anon, authenticated, service_role;

create or replace function app_private.admin_actions_append_only()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception 'The admin log is append-only' using errcode = '42501';
end;
$function$;
create trigger admin_actions_no_update_delete before update or delete on app_private.admin_actions
  for each row execute function app_private.admin_actions_append_only();
create trigger admin_actions_no_truncate before truncate on app_private.admin_actions
  for each statement execute function app_private.admin_actions_append_only();

create or replace function app_private.log_admin_action(
  p_admin uuid, p_action text, p_target_type text, p_target_id text, p_reason text,
  p_before jsonb default null, p_after jsonb default null
)
returns void
language sql
security definer
set search_path = ''
as $function$
  insert into app_private.admin_actions (admin_id, action, target_type, target_id, reason, before, after)
  values (p_admin, p_action, p_target_type, p_target_id, p_reason, p_before, p_after);
$function$;

-- 3. Settings that aren't on/off flags.
create table app_private.settings (
  key text not null,
  value jsonb not null,
  note text not null,
  updated_at timestamp with time zone default pg_catalog.now() not null,
  constraint settings_pkey primary key (key)
);
alter table app_private.settings enable row level security;
revoke all on app_private.settings from public, anon, authenticated, service_role;
insert into app_private.settings (key, value, note) values
  ('report_retention_days', '730'::jsonb,
   'How long a closed report and its evidence are kept, also after either person deletes their account. '
   'Placeholder (2 years) until the attorney sets the period (compliance.md, legal-placeholders.md DATA_RETENTION).');

-- 4. Suspensions. Written only by admin functions: apps can't change them.
alter table public.profiles
  add column suspended_until timestamp with time zone,
  add column suspension_reason text,
  add constraint profiles_suspension_reason_length check (pg_catalog.char_length(suspension_reason) <= 500);

-- The plain-words refusal for a suspended account, or null.
create or replace function app_private.suspension_message(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when p.suspended_until is null or p.suspended_until <= pg_catalog.now() then null
    when p.suspended_until = 'infinity'::timestamptz then
      'Your account is suspended. Reason: ' || coalesce(pg_catalog.rtrim(pg_catalog.btrim(p.suspension_reason), '.'), 'not given') || '.'
    else
      'Your account is suspended until ' || pg_catalog.to_char(p.suspended_until at time zone 'UTC', 'Mon FMDD, YYYY')
        || '. Reason: ' || coalesce(pg_catalog.rtrim(pg_catalog.btrim(p.suspension_reason), '.'), 'not given') || '.'
  end
  from public.profiles p where p.id = p_user;
$function$;

create or replace function app_private.keep_suspension()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if current_user in ('authenticated', 'anon') then
    new.suspended_until := old.suspended_until;
    new.suspension_reason := old.suspension_reason;
  end if;
  return new;
end;
$function$;
create trigger profiles_keep_suspension before update on public.profiles
  for each row execute function app_private.keep_suspension();

create or replace function app_private.refuse_suspended_sender()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_message text := app_private.suspension_message(new.sender_id);
begin
  if v_message is not null then
    raise exception using message = v_message, errcode = 'P0001';
  end if;
  return new;
end;
$function$;
create trigger messages_refuse_suspended before insert on public.messages
  for each row execute function app_private.refuse_suspended_sender();

create or replace function app_private.refuse_suspended_renter()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_message text := app_private.suspension_message(new.renter_id);
begin
  if v_message is not null then
    raise exception using message = v_message, errcode = 'P0001';
  end if;
  return new;
end;
$function$;
create trigger conversations_refuse_suspended before insert on public.conversations
  for each row execute function app_private.refuse_suspended_renter();

-- 5. Listing holds: the server pauses a listing and keeps it paused. 'hidden' = an admin hid it
-- (a report, a takedown); 'suspended' = its owner is suspended or banned. The shop window shows
-- active listings only, so a held listing is hidden everywhere; auto_paused_reason tells the owner why.
alter table public.listings
  add column hold text,
  add column hold_reason text,
  add column hold_restores boolean default false not null,
  add constraint listings_hold_check check (hold is null or hold in ('hidden', 'suspended')),
  add constraint listings_hold_reason_length check (pg_catalog.char_length(hold_reason) <= 500);

-- Apps can't set or clear a hold, can't make a held listing active, and a suspended owner can't
-- publish. Server roles (admin functions, photo checks) are not stopped here.
create or replace function app_private.listing_hold_guard()
returns trigger
language plpgsql
set search_path = ''
as $function$
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
        'This listing is hidden by Dzirent: ' || coalesce(pg_catalog.rtrim(pg_catalog.btrim(new.hold_reason), '.'), 'no reason given')
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
create trigger listings_admin_hold before insert or update on public.listings
  for each row execute function app_private.listing_hold_guard();

-- Puts [p_hold] on a listing (an admin hide wins over a suspension hold).
create or replace function app_private.hold_listing(p_listing uuid, p_hold text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_listing public.listings%rowtype;
begin
  select * into v_listing from public.listings l where l.id = p_listing for update;
  if not found or (v_listing.hold = 'hidden' and p_hold = 'suspended') then
    return;
  end if;
  update public.listings set
    hold_restores = case when v_listing.hold is null then v_listing.status = 'active' else v_listing.hold_restores end,
    status = 'paused',
    hold = p_hold,
    hold_reason = p_reason,
    auto_paused_reason = case p_hold
      when 'hidden' then pg_catalog.left('Hidden by Dzirent: ' || coalesce(pg_catalog.rtrim(pg_catalog.btrim(p_reason), '.'), 'no reason given') || '.', 300)
      else 'Paused while your account is suspended.' end
  where id = p_listing;
end;
$function$;

-- Lifts [p_hold]. A hidden listing whose owner is suspended moves to the suspension hold instead.
create or replace function app_private.release_listing(p_listing uuid, p_hold text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_listing public.listings%rowtype;
begin
  select * into v_listing from public.listings l where l.id = p_listing for update;
  if not found or v_listing.hold is distinct from p_hold then
    return;
  end if;
  if p_hold = 'hidden' and app_private.suspension_message(v_listing.lender_id) is not null then
    update public.listings set hold = 'suspended', hold_reason = null,
      auto_paused_reason = 'Paused while your account is suspended.'
    where id = p_listing;
    return;
  end if;
  update public.listings set
    status = case when v_listing.hold_restores then 'active' else v_listing.status end,
    hold = null, hold_reason = null, hold_restores = false, auto_paused_reason = null
  where id = p_listing;
end;
$function$;

-- 6. Reports: who and what they are about, an outcome, and evidence that never changes.
-- The reporter's account going no longer deletes the report (kept for report_retention_days).
alter table public.reports alter column reporter_id drop not null;
alter table public.reports drop constraint reports_reporter_id_fkey;
alter table public.reports add constraint reports_reporter_id_fkey foreign key (reporter_id)
  references public.profiles(id) on delete set null;
alter table public.reports
  add column target_user_id uuid,
  add column status text default 'open' not null,
  add column outcome text,
  add column outcome_note text,
  add column closed_at timestamp with time zone,
  add column closed_by uuid,
  add constraint reports_status_check check (status in ('open', 'closed')),
  add constraint reports_outcome_check check (outcome is null or outcome in
    ('dismissed', 'warned', 'content_removed', 'suspended', 'banned')),
  add constraint reports_outcome_note_length check (pg_catalog.char_length(outcome_note) <= 1000);
create index reports_status_created_idx on public.reports using btree (status, created_at);
create index reports_target_user_idx on public.reports using btree (target_user_id);

create table app_private.report_evidence (
  report_id uuid not null,
  target_user_id uuid,
  snapshot jsonb not null,
  captured_at timestamp with time zone default pg_catalog.now() not null,
  constraint report_evidence_pkey primary key (report_id),
  constraint report_evidence_report_id_fkey foreign key (report_id) references public.reports(id) on delete cascade
);
alter table app_private.report_evidence enable row level security;
revoke all on app_private.report_evidence from public, anon, authenticated, service_role;

create or replace function app_private.report_evidence_frozen()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception 'Report evidence never changes' using errcode = '42501';
end;
$function$;
create trigger report_evidence_no_update before update on app_private.report_evidence
  for each row execute function app_private.report_evidence_frozen();

-- Who a report is about, refusing what can't be reported. Elevated: reads other people's rows.
create or replace function app_private.report_target_user(p_reporter uuid, p_type text, p_target uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $function$
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
      raise exception 'You can only report messages in your own chats.' using errcode = 'P0001';
    end if;
  elsif p_type = 'listing' then
    select l.lender_id into v_user from public.listings l where l.id = p_target;
  else
    v_user := p_target;
  end if;
  return v_user;
end;
$function$;

-- The snapshot an admin reviews: what was reported, as it was at that moment.
create or replace function app_private.report_snapshot(p_type text, p_target uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_message public.messages%rowtype;
  v_snapshot jsonb;
begin
  if p_type = 'message' then
    select * into v_message from public.messages m where m.id = p_target;
    if not found then
      return pg_catalog.jsonb_build_object('type', 'message', 'missing', true);
    end if;
    select pg_catalog.jsonb_build_object(
      'type', 'message',
      'conversation_id', c.id,
      'listing_id', c.listing_id,
      'listing_title', l.title,
      'renter_id', c.renter_id,
      'lender_id', c.lender_id,
      'messages', (
        select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'id', x.id, 'sender_id', x.sender_id,
          'sender_name', coalesce(nullif(p.studio_name, ''), p.display_name),
          'sender_handle', p.studio_handle, 'body', x.body, 'created_at', x.created_at,
          'reported', x.id = v_message.id) order by x.created_at, x.id), '[]'::jsonb)
        from (
          (select * from public.messages b where b.conversation_id = v_message.conversation_id
             and (b.created_at, b.id) < (v_message.created_at, v_message.id) order by b.created_at desc, b.id desc limit 5)
          union all
          (select * from public.messages r where r.id = v_message.id)
          union all
          (select * from public.messages a where a.conversation_id = v_message.conversation_id
             and (a.created_at, a.id) > (v_message.created_at, v_message.id) order by a.created_at, a.id limit 5)
        ) x
        left join public.profiles p on p.id = x.sender_id))
    into v_snapshot
    from public.conversations c left join public.listings l on l.id = c.listing_id
    where c.id = v_message.conversation_id;
    return v_snapshot;
  elsif p_type = 'listing' then
    select pg_catalog.jsonb_build_object(
      'type', 'listing', 'listing_id', l.id, 'lender_id', l.lender_id,
      'lender_name', coalesce(nullif(p.studio_name, ''), p.display_name), 'lender_handle', p.studio_handle,
      'title', l.title, 'description', l.description, 'price_note', l.price_note, 'deposit_note', l.deposit_note,
      'category', l.category, 'status', l.status, 'created_at', l.created_at,
      'photos', (select coalesce(pg_catalog.jsonb_agg(ph.storage_path order by ph.position), '[]'::jsonb)
                 from public.listing_photos ph where ph.listing_id = l.id))
    into v_snapshot
    from public.listings l left join public.profiles p on p.id = l.lender_id
    where l.id = p_target;
    return coalesce(v_snapshot, pg_catalog.jsonb_build_object('type', 'listing', 'missing', true));
  else
    select pg_catalog.jsonb_build_object(
      'type', 'user', 'user_id', p.id, 'display_name', p.display_name, 'studio_name', p.studio_name,
      'studio_handle', p.studio_handle, 'studio_bio', p.studio_bio, 'pickup_area', p.pickup_area,
      'city', p.city, 'style_tags', p.style_tags)
    into v_snapshot
    from public.profiles p where p.id = p_target;
    return coalesce(v_snapshot, pg_catalog.jsonb_build_object('type', 'user', 'missing', true));
  end if;
end;
$function$;

create or replace function app_private.capture_report_evidence(p_report uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_report public.reports%rowtype;
begin
  select * into v_report from public.reports r where r.id = p_report;
  insert into app_private.report_evidence (report_id, target_user_id, snapshot)
  values (v_report.id, v_report.target_user_id, app_private.report_snapshot(v_report.target_type, v_report.target_id))
  on conflict (report_id) do nothing;
end;
$function$;

create or replace function app_private.report_prepare()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if current_user in ('authenticated', 'anon') then
    new.status := 'open';
    new.outcome := null;
    new.outcome_note := null;
    new.closed_at := null;
    new.closed_by := null;
  end if;
  new.target_user_id := app_private.report_target_user(new.reporter_id, new.target_type, new.target_id);
  return new;
end;
$function$;

create or replace function app_private.report_capture()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  perform app_private.capture_report_evidence(new.id);
  return null;
end;
$function$;

create trigger reports_prepare before insert on public.reports
  for each row execute function app_private.report_prepare();
create trigger reports_capture_evidence after insert on public.reports
  for each row execute function app_private.report_capture();

-- Report details may quote what was said, so they skip the text filter (P2A); the reason is still checked.
create or replace function app_private.filter_report_text()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' or new.reason is distinct from old.reason then
    perform app_private.check_text_field(new.reason, 'report', 'reason');
  end if;
  return new;
end;
$function$;

-- Closed reports past the retention period, with their evidence. Not scheduled yet (P3B).
create or replace function app_private.purge_expired_reports()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_days integer := (select (s.value)::text::integer from app_private.settings s where s.key = 'report_retention_days');
  v_count integer;
begin
  delete from public.reports r
  where r.status = 'closed' and r.closed_at < pg_catalog.now() - pg_catalog.make_interval(days => v_days);
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

-- 7. Warnings an admin gives a user (the user can read their own).
create table public.user_warnings (
  id uuid default pg_catalog.gen_random_uuid() not null,
  user_id uuid not null,
  note text not null,
  report_id uuid,
  created_by uuid,
  created_at timestamp with time zone default pg_catalog.now() not null,
  constraint user_warnings_pkey primary key (id),
  constraint user_warnings_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade,
  constraint user_warnings_report_id_fkey foreign key (report_id) references public.reports(id) on delete set null,
  constraint user_warnings_note_length check (pg_catalog.char_length(note) between 1 and 1000)
);
create index user_warnings_user_idx on public.user_warnings using btree (user_id);
alter table public.user_warnings enable row level security;
revoke all on public.user_warnings from public, anon, authenticated, service_role;
grant select on public.user_warnings to authenticated;
create policy user_warnings_owner_read on public.user_warnings
  for select to authenticated using (user_id = (select auth.uid()));

-- 8. Copyright takedown requests (entered by admins from support emails). Closed to API roles.
create table app_private.takedown_requests (
  id uuid default pg_catalog.gen_random_uuid() not null,
  claimant_name text not null,
  claimant_contact text not null,
  work text not null,
  urls text[] default '{}'::text[] not null,
  listing_ids uuid[] default '{}'::uuid[] not null,
  received_at timestamp with time zone default pg_catalog.now() not null,
  status text default 'received' not null,
  notes text,
  counter_notice text,
  counter_received_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone default pg_catalog.now() not null,
  updated_at timestamp with time zone default pg_catalog.now() not null,
  constraint takedown_requests_pkey primary key (id),
  constraint takedown_requests_status_check check (status in ('received', 'actioned', 'rejected', 'countered', 'restored'))
);
alter table app_private.takedown_requests enable row level security;
revoke all on app_private.takedown_requests from public, anon, authenticated, service_role;

-- 9. The admin's decision on a photo check can carry a reason the lender sees.
alter table public.listing_scans
  add column admin_reason text,
  add constraint listing_scans_admin_reason_length check (pg_catalog.char_length(admin_reason) <= 300);

-- 10. Access. The triggers run as the person writing and call these elevated helpers in
-- app_private (not exposed through the API).
revoke execute on function app_private.require_admin() from public, anon, authenticated;
revoke execute on function app_private.log_admin_action(uuid, text, text, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function app_private.admin_actions_append_only() from public, anon, authenticated;
revoke execute on function app_private.keep_suspension() from public, anon, authenticated;
revoke execute on function app_private.refuse_suspended_sender() from public, anon, authenticated;
revoke execute on function app_private.refuse_suspended_renter() from public, anon, authenticated;
revoke execute on function app_private.listing_hold_guard() from public, anon, authenticated;
revoke execute on function app_private.hold_listing(uuid, text, text) from public, anon, authenticated;
revoke execute on function app_private.release_listing(uuid, text) from public, anon, authenticated;
revoke execute on function app_private.report_evidence_frozen() from public, anon, authenticated;
revoke execute on function app_private.report_snapshot(text, uuid) from public, anon, authenticated;
revoke execute on function app_private.report_prepare() from public, anon, authenticated;
revoke execute on function app_private.report_capture() from public, anon, authenticated;
revoke execute on function app_private.purge_expired_reports() from public, anon, authenticated;
revoke execute on function app_private.suspension_message(uuid) from public, anon;
grant execute on function app_private.suspension_message(uuid) to authenticated, service_role;
revoke execute on function app_private.report_target_user(uuid, text, uuid) from public, anon;
grant execute on function app_private.report_target_user(uuid, text, uuid) to authenticated, service_role;
revoke execute on function app_private.capture_report_evidence(uuid) from public, anon;
grant execute on function app_private.capture_report_evidence(uuid) to authenticated, service_role;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

notify pgrst, 'reload schema';
