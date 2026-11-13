-- C3 (2026-11-13): the rental lifecycle.
--
-- 1. States: requested, accepted, declined, expired, awaiting_payment, paid, picked_up, returned,
--    completed, cancelled, claimed, disputed. awaiting_payment, paid, claimed and disputed are used only
--    while payments_enabled is on; while it is off, accept goes straight to accepted and returned
--    straight to completed. Old rows: active -> picked_up, returned -> completed, cancelled stays.
-- 2. Writes only through functions (request_rental, respond_rental, cancel_rental, mark_picked_up,
--    mark_returned, complete_rental); the direct insert and update policies are gone. Every
--    transition writes rental_events.
-- 3. A price snapshot at request time; dates inside the listing's availability; no double booking
--    (btree_gist exclusion constraint, back-to-back allowed); 48-hour expiry (pg_cron).
-- 4. Private condition photos (bucket rental-photos), rental pushes and daily reminders, rental
--    reports, a retention setting and a count-only cleanup job for the photos.
-- rental_outcomes (the old "did it happen?" answers) stays as it was, readable for old data.

create extension if not exists btree_gist with schema extensions;

-- 1. States and the new columns ---------------------------------------------------------------
alter table public.rentals drop constraint rentals_status_check;
update public.rentals set status = case status when 'active' then 'picked_up' when 'returned' then 'completed' else status end
where status in ('active', 'returned');
alter table public.rentals alter column status set default 'requested';
alter table public.rentals add constraint rentals_status_check check (status = any (array[
  'requested', 'accepted', 'declined', 'expired', 'awaiting_payment', 'paid', 'picked_up', 'returned',
  'completed', 'cancelled', 'claimed', 'disputed']));

alter table public.rentals
  add column price_per_day numeric,
  add column days integer,
  add column total numeric,
  add column currency text not null default 'USD',
  add column expires_at timestamp with time zone,
  add column responded_at timestamp with time zone,
  add column picked_up_at timestamp with time zone,
  add column returned_at timestamp with time zone,
  add column completed_at timestamp with time zone,
  add column cancelled_at timestamp with time zone;
alter table public.rentals add constraint rentals_currency_check check (currency = 'USD');
alter table public.rentals add constraint rentals_snapshot_check
  check (price_per_day is null or (price_per_day > 0 and days > 0 and total >= 0));
update public.rentals set completed_at = updated_at where status = 'completed' and completed_at is null;
update public.rentals set cancelled_at = updated_at where status = 'cancelled' and cancelled_at is null;
update public.rentals set picked_up_at = coalesce(start_date::timestamptz, created_at) where status = 'picked_up' and picked_up_at is null;

comment on column public.rentals.status is 'C3 state machine (pranalika/architecture.md Appendix A.3); written only by the rental functions.';
comment on column public.rentals.price_per_day is 'Snapshot of listings.price_usd when the rental was requested (C3).';
comment on column public.rentals.days is 'Days in the rental, both ends counted (app_private.rental_days), at request time.';
comment on column public.rentals.total is 'price_per_day x days at request time, in currency.';
comment on column public.rentals.expires_at is 'A request with no answer by then becomes expired (48 hours, C3).';

-- A chat can hold several rentals over time (one after another), but only one open at a time.
alter table public.rentals drop constraint rentals_conversation_id_key;
create index if not exists rentals_conversation_id_idx on public.rentals (conversation_id);
create unique index rentals_one_open_per_chat on public.rentals (conversation_id)
  where status in ('requested', 'accepted', 'awaiting_payment', 'paid', 'picked_up', 'returned', 'claimed', 'disputed');
create index rentals_requested_expiry_idx on public.rentals (expires_at) where status = 'requested';

-- No double booking: one listing can't have two rentals with overlapping days in the states that
-- hold the piece. Days are inclusive (Nov 5 - 8 is 4 days), so Nov 5 - 8 and Nov 9 - 12 are
-- back-to-back and allowed; Nov 5 - 8 and Nov 8 - 10 share Nov 8 and are refused.
alter table public.rentals add constraint rentals_no_double_booking
  exclude using gist (listing_id with =, daterange(start_date, end_date, '[]') with &&)
  where (status in ('accepted', 'awaiting_payment', 'paid', 'picked_up') and start_date is not null and end_date is not null);

-- 2. Writes only through functions -------------------------------------------------------------
drop policy if exists rentals_participant_insert on public.rentals;
drop policy if exists rentals_participant_update on public.rentals;
revoke insert, update, delete on public.rentals from anon, authenticated;
revoke update (status, start_date, end_date, updated_by) on public.rentals from authenticated;
-- rentals_participant_read (select by the renter or the lender) stays.

-- Every transition, append-only. Participants read their rentals' events; only the functions write.
create table public.rental_events (
  id bigint generated always as identity primary key,
  rental_id uuid not null references public.rentals (id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_id uuid references public.profiles (id) on delete set null,
  actor_role text not null check (actor_role in ('renter', 'lender', 'system')),
  note text check (char_length(note) <= 300),
  created_at timestamp with time zone not null default pg_catalog.now()
);
create index rental_events_rental_idx on public.rental_events (rental_id, id);
create index rental_events_actor_idx on public.rental_events (actor_id);
alter table public.rental_events enable row level security;
revoke all on public.rental_events from anon, authenticated;
grant select on public.rental_events to authenticated;
create policy rental_events_participant_read on public.rental_events
  for select to authenticated using (exists (
    select 1 from public.rentals r
    where r.id = rental_events.rental_id and (select auth.uid()) in (r.renter_id, r.lender_id)));
comment on table public.rental_events is 'C3: one row per rental state change (from, to, who, when, note). Written only by the rental functions.';

-- The rows from before C3 get one event each, so their timeline isn't empty.
insert into public.rental_events (rental_id, from_status, to_status, actor_id, actor_role, note, created_at)
select r.id, null, r.status, null, 'system', 'Recorded before rental requests existed', r.updated_at
from public.rentals r;

-- 3. Settings ---------------------------------------------------------------------------------
alter table app_private.rate_counters drop constraint rate_counters_action_check;
alter table app_private.rate_counters add constraint rate_counters_action_check
  check (action = any (array['message', 'new_chat', 'report', 'new_listing', 'photo_scan', 'rental_request']));

insert into app_private.settings (key, value, note) values
  ('rate_limit_rental_request', '{"max": 20, "window_seconds": 86400}'::jsonb,
   'Rental requests a person can send per day (C3).'),
  ('rental_request_hours', '48'::jsonb,
   'A rental request with no answer for this many hours becomes expired (C3). Owner decides.'),
  ('rental_overdue_reminder_days', '3'::jsonb,
   'Overdue return reminders go out once a day for this many days after the end date (C3). Owner decides.'),
  ('condition_photo_retention_days', '365'::jsonb,
   'Condition photos (pickup and return) are deleted this many days after the rental ends. '
   'Placeholder (1 year) until the attorney sets the period (compliance.md, legal-placeholders.md DATA_RETENTION).')
on conflict (key) do nothing;

insert into public.app_settings (key, enabled, description) values
  ('cleanup_old_condition_photos', false,
   'Cleanup job: rental condition photos 365 days after the rental ended (attorney to set), and photos whose rental is gone. Off: counts only. On: deletes the files.')
on conflict (key) do nothing;

-- Rental reminders switch (Settings > Notifications), on by default.
alter table public.notification_settings add column rental_reminders boolean not null default true;
grant select (rental_reminders), insert (rental_reminders), update (rental_reminders) on public.notification_settings to authenticated;
comment on column public.notification_settings.rental_reminders is 'Pickup, return and overdue reminders (C3). Default on.';

-- 4. Helpers (closed to every API role) ----------------------------------------------------------
create function app_private.rental_today()
returns date
language sql
stable
set search_path = ''
as $$
  -- Dzirent's pilot market is Austin: "tomorrow" and "overdue" are Austin days.
  select (pg_catalog.now() at time zone 'America/Chicago')::date;
$$;

create function app_private.payments_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.enabled from public.app_settings s where s.key = 'payments_enabled'), false);
$$;

-- Who may act at all: signed in, not age-blocked, not suspended, current terms accepted, and
-- (when p_check_block) not blocked with the other person in either direction.
create function app_private.rental_guard(p_uid uuid, p_other uuid, p_check_block boolean)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
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
  perform app_private.require_current_terms(p_uid);
  if p_check_block and exists (
    select 1 from public.blocks bl
    where (bl.blocker_id = p_uid and bl.blocked_id = p_other)
       or (bl.blocker_id = p_other and bl.blocked_id = p_uid)
  ) then
    raise exception 'DZ-E4003: You can''t rent with this person.' using errcode = '42501';
  end if;
end;
$$;

-- The rental, locked, if the caller is one of its two people.
create function app_private.rental_for_actor(p_rental uuid, p_uid uuid)
returns public.rentals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rental public.rentals;
begin
  if p_uid is null then
    raise exception 'DZ-E1001: Not signed in' using errcode = '42501';
  end if;
  select * into v_rental from public.rentals r where r.id = p_rental for update;
  if not found or p_uid not in (v_rental.renter_id, v_rental.lender_id) then
    raise exception 'DZ-E4001: Rental not found' using errcode = 'P0002';
  end if;
  return v_rental;
end;
$$;

create function app_private.rental_note(p_note text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_note text := nullif(pg_catalog.btrim(coalesce(p_note, '')), '');
begin
  if pg_catalog.char_length(v_note) > 300 then
    raise exception 'DZ-E4017: Keep the note under 300 characters.' using errcode = '22023', hint = 'note';
  end if;
  return v_note;
end;
$$;

-- One state change: the row and its event. The caller has already checked who and from where.
create function app_private.rental_move(p_rental public.rentals, p_to text, p_actor uuid, p_note text)
returns public.rentals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.rentals;
  v_role text := case when p_actor is null then 'system'
                      when p_actor = p_rental.renter_id then 'renter' else 'lender' end;
begin
  update public.rentals r set
    status = p_to,
    updated_by = p_actor,
    responded_at = case when p_to in ('accepted', 'awaiting_payment', 'declined') then pg_catalog.now() else r.responded_at end,
    picked_up_at = case when p_to = 'picked_up' then pg_catalog.now() else r.picked_up_at end,
    returned_at = case when p_to = 'returned' then pg_catalog.now() else r.returned_at end,
    completed_at = case when p_to = 'completed' then pg_catalog.now() else r.completed_at end,
    cancelled_at = case when p_to = 'cancelled' then pg_catalog.now() else r.cancelled_at end
  where r.id = p_rental.id
  returning * into v_row;
  insert into public.rental_events (rental_id, from_status, to_status, actor_id, actor_role, note)
  values (p_rental.id, p_rental.status, p_to, p_actor, v_role, p_note);
  return v_row;
end;
$$;

-- Condition photos of a stage uploaded by one person (counted for the lender's two-photo rule).
create function app_private.rental_photo_count(p_rental uuid, p_stage text, p_owner uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.count(*)::integer from storage.objects o
  where o.bucket_id = 'rental-photos'
    and o.name like p_rental::text || '/' || p_stage || '/%'
    and o.owner_id = p_owner::text;
$$;

-- The pushes a rental sends. Titles and bodies never carry contact details (push_safe_text).
-- Requests, answers and completion follow the Messages switch; pickup, return and overdue
-- reminders follow the Rental reminders switch. Nothing between blocked people, nothing without
-- a registered phone, nothing when push isn't set up. Returns true when a push was queued.
create function app_private.queue_rental_push(p_kind text, p_rental public.rentals, p_recipient uuid, p_sender uuid default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_messages boolean;
  v_reminders boolean;
  v_name text;
  v_listing text;
  v_dates text;
  v_title text;
  v_body text;
begin
  if p_recipient is null or p_recipient = p_sender then
    return false;
  end if;
  if exists (
    select 1 from public.blocks bl
    where (bl.blocker_id = p_rental.renter_id and bl.blocked_id = p_rental.lender_id)
       or (bl.blocker_id = p_rental.lender_id and bl.blocked_id = p_rental.renter_id)
  ) then
    return false;
  end if;
  select ns.messages, ns.rental_reminders into v_messages, v_reminders
  from public.notification_settings ns where ns.user_id = p_recipient;
  if not found then
    v_messages := true;
    v_reminders := true;
  end if;
  if (p_kind in ('pickup_tomorrow', 'return_tomorrow', 'return_overdue') and not v_reminders)
     or (p_kind in ('rental_request', 'rental_accepted', 'rental_declined', 'rental_completed') and not v_messages)
     or not exists (select 1 from public.device_tokens dt where dt.user_id = p_recipient)
     or not exists (select 1 from vault.decrypted_secrets ds where ds.name = 'send_push_url') then
    return false;
  end if;

  select app_private.push_safe_text(coalesce(nullif(pg_catalog.btrim(p.studio_name), ''), p.display_name), 60)
    into v_name from public.profiles p where p.id = p_sender;
  select app_private.push_safe_text(l.title, 80) into v_listing from public.listings l where l.id = p_rental.listing_id;
  v_dates := case when p_rental.start_date is not null and p_rental.end_date is not null
                  then app_private.push_dates_label(p_rental.start_date, p_rental.end_date) end;

  case p_kind
    when 'rental_request' then
      v_title := 'Rental request' || coalesce(' from ' || v_name, '');
      v_body := pg_catalog.concat_ws(' · ', v_dates, v_listing,
        case when p_rental.total is not null then p_rental.days || case when p_rental.days = 1 then ' day' else ' days' end
          || ' · $' || pg_catalog.to_char(p_rental.total, 'FM999999990.00') end);
    when 'rental_accepted' then
      v_title := coalesce(v_name, 'The lender') || ' accepted your request';
      v_body := pg_catalog.concat_ws(' · ', v_dates, v_listing);
    when 'rental_declined' then
      v_title := coalesce(v_name, 'The lender') || ' declined your request';
      v_body := pg_catalog.concat_ws(' · ', v_dates, v_listing);
    when 'pickup_tomorrow' then
      v_title := 'Pickup tomorrow';
      v_body := pg_catalog.concat_ws(' · ', v_listing, v_dates);
    when 'return_tomorrow' then
      v_title := 'Return due tomorrow';
      v_body := pg_catalog.concat_ws(' · ', v_listing, v_dates);
    when 'return_overdue' then
      v_title := 'Return overdue';
      v_body := coalesce(v_listing, 'The piece') || ' was due back '
        || pg_catalog.to_char(p_rental.end_date::timestamp, 'Mon FMDD') || '.';
    when 'rental_completed' then
      v_title := 'Rental completed';
      v_body := pg_catalog.concat_ws(' · ', v_listing, v_dates);
    else
      return false;
  end case;

  perform app_private.enqueue_job('send_push', pg_catalog.jsonb_build_object(
    'kind', p_kind,
    'conversation_id', p_rental.conversation_id,
    'recipient_id', p_recipient,
    'title', v_title,
    'body', nullif(v_body, '')));
  return true;
exception when others then
  -- A push never stops a rental change.
  raise warning 'Rental push skipped: %', sqlerrm;
  return false;
end;
$$;

-- 5. The rental functions (signed-in callers) ---------------------------------------------------
-- request_rental: by the renter. Dates default to the chat's requested dates. Refused outside the
-- listing's availability, over booked days, for one's own piece, with an open rental in the chat,
-- and after 20 requests a day.
create function public.request_rental(p_listing_id uuid, p_start date default null, p_end date default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_listing public.listings;
  v_conv public.conversations;
  v_start date := p_start;
  v_end date := p_end;
  v_days integer;
  v_rental public.rentals;
  v_hours numeric := coalesce(app_private.setting_number('rental_request_hours'), 48);
begin
  if v_uid is null then
    raise exception 'DZ-E1001: Not signed in' using errcode = '42501';
  end if;
  select * into v_listing from public.listings l where l.id = p_listing_id;
  if not found or v_listing.status <> 'active' or v_listing.hold is not null or v_listing.price_usd is null then
    raise exception 'DZ-E4011: This piece isn''t available to rent right now.' using errcode = 'P0001';
  end if;
  if v_listing.lender_id = v_uid then
    raise exception 'DZ-E4004: You can''t rent your own piece.' using errcode = '42501';
  end if;
  perform app_private.rental_guard(v_uid, v_listing.lender_id, true);

  select * into v_conv from public.conversations c where c.listing_id = p_listing_id and c.renter_id = v_uid;
  if found and (v_start is null or v_end is null) then
    v_start := coalesce(v_start, v_conv.requested_start);
    v_end := coalesce(v_end, v_conv.requested_end);
  end if;
  if v_start is null or v_end is null then
    raise exception 'DZ-E4005: Choose the dates you want to rent.' using errcode = '22023', hint = 'dates';
  end if;
  if v_end < v_start then
    raise exception 'DZ-E4007: The last day can''t be before the first day.' using errcode = '22023', hint = 'dates';
  end if;
  if v_start < app_private.rental_today() then
    raise exception 'DZ-E4006: Pick dates from today on.' using errcode = '22023', hint = 'dates';
  end if;
  if not coalesce((
    select pg_catalog.range_agg(pg_catalog.daterange(av.start_date, av.end_date, '[]'))
    from public.availability av where av.listing_id = p_listing_id
  ) operator(pg_catalog.@>) pg_catalog.daterange(v_start, v_end, '[]'), false) then
    raise exception 'DZ-E4008: Those dates aren''t open for this piece. Pick dates inside its available dates.'
      using errcode = 'P0001', hint = 'dates';
  end if;
  if exists (
    select 1 from public.rentals r
    where r.listing_id = p_listing_id
      and r.status in ('accepted', 'awaiting_payment', 'paid', 'picked_up')
      and pg_catalog.daterange(r.start_date, r.end_date, '[]') operator(pg_catalog.&&) pg_catalog.daterange(v_start, v_end, '[]')
  ) then
    raise exception 'DZ-E4009: Those dates are already booked. Pick other dates.' using errcode = 'P0001', hint = 'dates';
  end if;

  if v_conv.id is null then
    perform public.start_conversation(p_listing_id, null, null);
    select * into v_conv from public.conversations c where c.listing_id = p_listing_id and c.renter_id = v_uid;
  end if;
  if exists (
    select 1 from public.rentals r
    where r.conversation_id = v_conv.id
      and r.status in ('requested', 'accepted', 'awaiting_payment', 'paid', 'picked_up', 'returned', 'claimed', 'disputed')
  ) then
    raise exception 'DZ-E4010: You already have a rental for this piece in progress.' using errcode = 'P0001';
  end if;

  -- Counted last, so a refused request isn't counted.
  perform app_private.enforce_rate_limit(v_uid, 'rental_request');

  v_days := app_private.rental_days(v_start, v_end);
  insert into public.rentals (conversation_id, listing_id, renter_id, lender_id, status, start_date, end_date,
                              updated_by, price_per_day, days, total, currency, expires_at)
  values (v_conv.id, p_listing_id, v_uid, v_listing.lender_id, 'requested', v_start, v_end,
          v_uid, v_listing.price_usd, v_days, v_listing.price_usd * v_days, 'USD',
          pg_catalog.now() + pg_catalog.make_interval(hours => v_hours::integer))
  returning * into v_rental;
  insert into public.rental_events (rental_id, from_status, to_status, actor_id, actor_role)
  values (v_rental.id, null, 'requested', v_uid, 'renter');
  perform app_private.queue_rental_push('rental_request', v_rental, v_rental.lender_id, v_uid);
  return v_rental.id;
end;
$$;

-- respond_rental: by the lender, while requested. 'accept' -> accepted (awaiting_payment with
-- payments on); 'decline' -> declined.
create function public.respond_rental(p_rental_id uuid, p_answer text, p_note text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_rental public.rentals := app_private.rental_for_actor(p_rental_id, auth.uid());
  v_note text := app_private.rental_note(p_note);
  v_to text;
begin
  if v_uid <> v_rental.lender_id then
    raise exception 'DZ-E4002: Only the lender can do this.' using errcode = '42501';
  end if;
  perform app_private.rental_guard(v_uid, v_rental.renter_id, true);
  if p_answer is null or p_answer not in ('accept', 'decline') then
    raise exception 'DZ-E4016: Answer accept or decline.' using errcode = '22023';
  end if;
  if v_rental.status <> 'requested' then
    raise exception 'DZ-E4012: This rental can''t be changed now.' using errcode = 'P0001';
  end if;
  if v_rental.expires_at is not null and v_rental.expires_at <= pg_catalog.now() then
    raise exception 'DZ-E4013: This request has expired.' using errcode = 'P0001';
  end if;

  if p_answer = 'accept' then
    v_to := case when app_private.payments_enabled() then 'awaiting_payment' else 'accepted' end;
    begin
      v_rental := app_private.rental_move(v_rental, v_to, v_uid, v_note);
    exception when exclusion_violation then
      raise exception 'DZ-E4009: Those dates are already booked. Pick other dates.' using errcode = 'P0001', hint = 'dates';
    end;
    perform app_private.queue_rental_push('rental_accepted', v_rental, v_rental.renter_id, v_uid);
  else
    v_to := 'declined';
    v_rental := app_private.rental_move(v_rental, v_to, v_uid, v_note);
    perform app_private.queue_rental_push('rental_declined', v_rental, v_rental.renter_id, v_uid);
  end if;
  return v_to;
end;
$$;

-- cancel_rental: a request by the renter (the lender declines instead); accepted,
-- awaiting_payment or paid by either. Never after pickup. Allowed between blocked people, so a
-- block never leaves a booking in place.
create function public.cancel_rental(p_rental_id uuid, p_reason text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_rental public.rentals := app_private.rental_for_actor(p_rental_id, auth.uid());
  v_note text := app_private.rental_note(p_reason);
begin
  perform app_private.rental_guard(v_uid, case when v_uid = v_rental.renter_id then v_rental.lender_id else v_rental.renter_id end, false);
  if v_rental.status = 'requested' then
    if v_uid <> v_rental.renter_id then
      raise exception 'DZ-E4018: To turn down a request, decline it.' using errcode = 'P0001';
    end if;
  elsif v_rental.status not in ('accepted', 'awaiting_payment', 'paid') then
    raise exception 'DZ-E4014: This rental can''t be cancelled now.' using errcode = 'P0001';
  end if;
  perform app_private.rental_move(v_rental, 'cancelled', v_uid, v_note);
  return 'cancelled';
end;
$$;

-- mark_picked_up: by the lender, from accepted (payments off) or paid, after adding at least two
-- pickup photos.
create function public.mark_picked_up(p_rental_id uuid, p_note text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_rental public.rentals := app_private.rental_for_actor(p_rental_id, auth.uid());
  v_note text := app_private.rental_note(p_note);
begin
  if v_uid <> v_rental.lender_id then
    raise exception 'DZ-E4002: Only the lender can do this.' using errcode = '42501';
  end if;
  perform app_private.rental_guard(v_uid, v_rental.renter_id, true);
  if v_rental.status not in ('accepted', 'paid') then
    raise exception 'DZ-E4012: This rental can''t be changed now.' using errcode = 'P0001';
  end if;
  if app_private.rental_photo_count(v_rental.id, 'pickup', v_uid) < 2 then
    raise exception 'DZ-E4020: Add at least 2 photos of the piece first.' using errcode = 'P0001', hint = 'photos';
  end if;
  perform app_private.rental_move(v_rental, 'picked_up', v_uid, v_note);
  return 'picked_up';
end;
$$;

-- mark_returned: by the lender, from picked_up, after adding at least two return photos. With
-- payments off the rental is completed at once. Allowed between blocked people (it ends the rental).
create function public.mark_returned(p_rental_id uuid, p_note text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_rental public.rentals := app_private.rental_for_actor(p_rental_id, auth.uid());
  v_note text := app_private.rental_note(p_note);
begin
  if v_uid <> v_rental.lender_id then
    raise exception 'DZ-E4002: Only the lender can do this.' using errcode = '42501';
  end if;
  perform app_private.rental_guard(v_uid, v_rental.renter_id, false);
  if v_rental.status <> 'picked_up' then
    raise exception 'DZ-E4012: This rental can''t be changed now.' using errcode = 'P0001';
  end if;
  if app_private.rental_photo_count(v_rental.id, 'return', v_uid) < 2 then
    raise exception 'DZ-E4020: Add at least 2 photos of the piece first.' using errcode = 'P0001', hint = 'photos';
  end if;
  v_rental := app_private.rental_move(v_rental, 'returned', v_uid, v_note);
  if app_private.payments_enabled() then
    return 'returned';
  end if;
  v_rental := app_private.rental_move(v_rental, 'completed', null, 'Completed on return (payments are off)');
  perform app_private.queue_rental_push('rental_completed', v_rental, v_rental.renter_id, v_uid);
  return 'completed';
end;
$$;

-- complete_rental: returned -> completed, by the lender or by the server (no signed-in user).
create function public.complete_rental(p_rental_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_rental public.rentals;
begin
  if v_uid is null then
    -- Only the server gets here: execute is granted to authenticated (always with a user) and
    -- service_role; pg_cron and migrations run as postgres.
    if coalesce(auth.role(), '') in ('anon', 'authenticated') then
      raise exception 'DZ-E1001: Not signed in' using errcode = '42501';
    end if;
    select * into v_rental from public.rentals r where r.id = p_rental_id for update;
    if not found then
      raise exception 'DZ-E4001: Rental not found' using errcode = 'P0002';
    end if;
  else
    v_rental := app_private.rental_for_actor(p_rental_id, v_uid);
    if v_uid <> v_rental.lender_id then
      raise exception 'DZ-E4002: Only the lender can do this.' using errcode = '42501';
    end if;
    perform app_private.rental_guard(v_uid, v_rental.renter_id, false);
  end if;
  if v_rental.status <> 'returned' then
    raise exception 'DZ-E4012: This rental can''t be changed now.' using errcode = 'P0001';
  end if;
  v_rental := app_private.rental_move(v_rental, 'completed', v_uid, null);
  perform app_private.queue_rental_push('rental_completed', v_rental, v_rental.renter_id, v_uid);
  return 'completed';
end;
$$;

-- 6. Reading rentals (the two people only) -------------------------------------------------------
-- One rental as the caller sees it: the other person only by name and handle, the timeline, and
-- the condition photos (storage paths; clients make signed links).
create function app_private.rental_json(p_rental public.rentals, p_uid uuid, p_full boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'id', p_rental.id,
    'conversation_id', p_rental.conversation_id,
    'listing_id', p_rental.listing_id,
    'listing_title', l.title,
    'cover_photo_path', (select lp.storage_path from public.listing_photos lp
                         where lp.listing_id = p_rental.listing_id order by lp.position, lp.id limit 1),
    'your_role', case when p_rental.renter_id = p_uid then 'renter' else 'lender' end,
    'other_name', coalesce(nullif(pg_catalog.btrim(o.studio_name), ''), o.display_name),
    'other_handle', o.studio_handle,
    'status', p_rental.status,
    'start_date', p_rental.start_date,
    'end_date', p_rental.end_date,
    'price_per_day', p_rental.price_per_day,
    'days', p_rental.days,
    'total', p_rental.total,
    'currency', p_rental.currency,
    'expires_at', p_rental.expires_at,
    'created_at', p_rental.created_at,
    'updated_at', p_rental.updated_at,
    'payments_enabled', app_private.payments_enabled())
  || case when not p_full then '{}'::jsonb else pg_catalog.jsonb_build_object(
    'events', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'from', e.from_status, 'to', e.to_status,
        'by', case when e.actor_role = 'system' then 'dzirent' when e.actor_id = p_uid then 'you' else 'other' end,
        'by_role', e.actor_role, 'note', e.note, 'at', e.created_at) order by e.id)
      from public.rental_events e where e.rental_id = p_rental.id), '[]'::jsonb),
    'photos', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'storage_path', ob.name, 'stage', (pg_catalog.string_to_array(ob.name, '/'))[2],
        'by', case when ob.owner_id = p_uid::text then 'you' else 'other' end,
        'by_role', case when ob.owner_id = p_rental.lender_id::text then 'lender' else 'renter' end,
        'uploaded_at', ob.created_at) order by ob.created_at, ob.name)
      from storage.objects ob
      where ob.bucket_id = 'rental-photos' and ob.name like p_rental.id::text || '/%'), '[]'::jsonb)) end
  from public.listings l
  left join public.profiles o on o.id = case when p_rental.renter_id = p_uid then p_rental.lender_id else p_rental.renter_id end
  where l.id = p_rental.listing_id;
$$;

-- get_rental: one rental by id, or the latest rental of a chat; null when there is none.
create function public.get_rental(p_rental_id uuid default null, p_conversation_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_rental public.rentals;
begin
  if v_uid is null then
    raise exception 'DZ-E1001: Not signed in' using errcode = '42501';
  end if;
  select * into v_rental from public.rentals r
  where (p_rental_id is not null and r.id = p_rental_id
         or p_rental_id is null and r.conversation_id = p_conversation_id)
    and v_uid in (r.renter_id, r.lender_id)
  order by r.created_at desc, r.id desc
  limit 1;
  if not found then
    return null;
  end if;
  return app_private.rental_json(v_rental, v_uid, true);
end;
$$;

-- my_rentals: every rental the caller is in, incoming requests to the lender first, then by state.
create function public.my_rentals(p_limit integer default 30, p_offset integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'DZ-E1001: Not signed in' using errcode = '42501';
  end if;
  return coalesce((
    select pg_catalog.jsonb_agg(app_private.rental_json(x.rental, v_uid, false)
                                order by x.ord, x.sort_date nulls last, x.created_at desc)
    from (
      select r as rental, r.created_at,
        case when r.status = 'requested' and r.lender_id = v_uid then 0
             when r.status = 'requested' then 1
             when r.status in ('accepted', 'awaiting_payment', 'paid') then 2
             when r.status in ('picked_up', 'returned', 'claimed', 'disputed') then 3
             else 4 end as ord,
        case when r.status in ('completed', 'cancelled', 'declined', 'expired') then null else r.start_date end as sort_date
      from public.rentals r
      where v_uid in (r.renter_id, r.lender_id)
      order by ord, sort_date nulls last, r.created_at desc
      limit least(greatest(coalesce(p_limit, 30), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
    ) x), '[]'::jsonb);
end;
$$;

-- 7. Expiry and reminders (pg_cron) ------------------------------------------------------------
create function app_private.expire_rental_requests()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rental public.rentals;
  v_count integer := 0;
begin
  for v_rental in
    select * from public.rentals r
    where r.status = 'requested' and r.expires_at <= pg_catalog.now()
    order by r.expires_at for update skip locked
  loop
    perform app_private.rental_move(v_rental, 'expired', null, 'No answer in 48 hours');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- One reminder per rental, kind, person and day (Austin).
create table app_private.rental_reminders (
  rental_id uuid not null references public.rentals (id) on delete cascade,
  kind text not null check (kind in ('pickup_tomorrow', 'return_tomorrow', 'return_overdue')),
  recipient_id uuid not null,
  sent_on date not null,
  queued boolean not null,
  created_at timestamp with time zone not null default pg_catalog.now(),
  constraint rental_reminders_pkey primary key (rental_id, kind, recipient_id, sent_on)
);
revoke all on app_private.rental_reminders from public, anon, authenticated;

-- Daily at 15:00 UTC (9 AM in Austin): pickup tomorrow (accepted or paid), return tomorrow and
-- return overdue (picked up; overdue once a day for up to 3 days), to both people.
create function app_private.queue_rental_reminders()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := app_private.rental_today();
  v_overdue integer := coalesce(app_private.setting_number('rental_overdue_reminder_days'), 3)::integer;
  v_rental public.rentals;
  v_kind text;
  v_person uuid;
  v_new integer;
  v_considered integer := 0;
  v_queued integer := 0;
begin
  for v_rental in
    select * from public.rentals r
    where (r.status in ('accepted', 'paid') and r.start_date = v_today + 1)
       or (r.status = 'picked_up' and r.end_date = v_today + 1)
       or (r.status = 'picked_up' and r.end_date < v_today and r.end_date >= v_today - v_overdue)
  loop
    v_kind := case when v_rental.status in ('accepted', 'paid') then 'pickup_tomorrow'
                   when v_rental.end_date = v_today + 1 then 'return_tomorrow'
                   else 'return_overdue' end;
    foreach v_person in array array[v_rental.renter_id, v_rental.lender_id] loop
      insert into app_private.rental_reminders (rental_id, kind, recipient_id, sent_on, queued)
      values (v_rental.id, v_kind, v_person, v_today, false)
      on conflict do nothing;
      get diagnostics v_new = row_count;
      if v_new = 1 then
        v_considered := v_considered + 1;
        if app_private.queue_rental_push(v_kind, v_rental, v_person, null) then
          update app_private.rental_reminders set queued = true
          where rental_id = v_rental.id and kind = v_kind and recipient_id = v_person and sent_on = v_today;
          v_queued := v_queued + 1;
        end if;
      end if;
    end loop;
  end loop;
  delete from app_private.rental_reminders where sent_on < v_today - 30;
  return pg_catalog.jsonb_build_object('considered', v_considered, 'queued', v_queued);
end;
$$;

select cron.schedule('dzirent-rental-expiry', '*/10 * * * *', 'select app_private.expire_rental_requests()');
select cron.schedule('dzirent-rental-reminders', '0 15 * * *', 'select app_private.queue_rental_reminders()');

-- 8. Condition photos: private bucket rental-photos ---------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rental-photos', 'rental-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Read: the rental's two people and admins (two-step, fresh), through signed links.
create policy rental_photos_read on storage.objects
  for select to authenticated using (
    bucket_id = 'rental-photos' and (
      exists (select 1 from public.rentals r
              where r.id::text = (storage.foldername(name))[1]
                and (select auth.uid()) in (r.renter_id, r.lender_id))
      or (select public.is_admin())));

-- Write: {rental_id}/{pickup|return}/{random}.jpg by either person, only in the matching state:
-- pickup while accepted, paid or picked up; return while picked up or returned. No updates or
-- deletes by people: the photos are the record of the piece's condition.
create policy rental_photos_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'rental-photos'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(pickup|return)/[A-Za-z0-9_-]{16,64}\.jpg$'
    and exists (select 1 from public.rentals r
                where r.id::text = (storage.foldername(name))[1]
                  and (select auth.uid()) in (r.renter_id, r.lender_id)
                  and (((storage.foldername(name))[2] = 'pickup' and r.status in ('accepted', 'paid', 'picked_up'))
                    or ((storage.foldername(name))[2] = 'return' and r.status in ('picked_up', 'returned')))));

-- 9. Everything else that reads rentals ---------------------------------------------------------
-- get_studio: rental_count counts completed rentals.
create or replace function public.get_studio(p_handle text, p_lat double precision default null, p_lng double precision default null)
returns table(studio_name text, studio_handle text, studio_bio text, style_tags text[], city text, pickup_area text, rental_count integer, reply_minutes integer, is_saved boolean, listings jsonb, is_own boolean, since text)
language plpgsql
stable security definer
set search_path = ''
as $function$
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

-- browse_listings: with dates, a listing whose booked days overlap them isn't listed.
create or replace function public.browse_listings(p_lat double precision default null, p_lng double precision default null, p_radius_miles double precision default null, p_query text default null, p_category text default null, p_item_type text default null, p_garment_type text default null, p_size text default null, p_styles text[] default null, p_start_date date default null, p_end_date date default null, p_min_price numeric default null, p_max_price numeric default null, p_new_days integer default null, p_saved_only boolean default false, p_saved_studios_only boolean default false, p_sort text default null, p_limit integer default 20, p_offset integer default 0)
returns table(id uuid, title text, price numeric, distance integer, city text, category text, cover_photo_path text, studio_name text, studio_handle text, price_per_day numeric, price_unit text, days integer, total numeric)
language plpgsql
stable security definer
set search_path = ''
as $function$
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
    case when v_days is not null then f.price * v_days end
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

-- get_listing: adds booked (the booked days as { start_date, end_date }, never who booked them).
drop function public.get_listing(uuid, double precision, double precision, date, date);
create function public.get_listing(p_listing_id uuid, p_lat double precision default null, p_lng double precision default null, p_start_date date default null, p_end_date date default null)
returns table(id uuid, title text, category text, item_type text, garment_type text, size_label text, description text, price numeric, price_note text, deposit_note text, retail_value numeric, listing_styles text[], city text, distance integer, studio_name text, studio_handle text, photos jsonb, measurements jsonb, availability jsonb, created_at timestamp with time zone, price_per_day numeric, price_unit text, days integer, total numeric, booked jsonb)
language plpgsql
stable security definer
set search_path = ''
as $function$
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
    ), '[]'::jsonb) as booked
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

-- 10. Reports about a rental (target_type rental) ----------------------------------------------
alter table public.reports drop constraint reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type = any (array['listing', 'user', 'message', 'rental']));

create or replace function app_private.report_target_user(p_reporter uuid, p_type text, p_target uuid)
returns uuid
language plpgsql
stable security definer
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
      raise exception 'DZ-E5012: You can only report messages in your own chats.' using errcode = 'P0001';
    end if;
  elsif p_type = 'rental' then
    -- C3: only the rental's two people report it; it is about the other one.
    select case when r.renter_id = p_reporter then r.lender_id else r.renter_id end into v_user
    from public.rentals r
    where r.id = p_target and p_reporter in (r.renter_id, r.lender_id);
    if not found then
      raise exception 'DZ-E5015: You can only report your own rentals.' using errcode = 'P0001';
    end if;
  elsif p_type = 'listing' then
    select l.lender_id into v_user from public.listings l where l.id = p_target;
  else
    v_user := p_target;
  end if;
  return v_user;
end;
$function$;

create or replace function app_private.report_snapshot(p_type text, p_target uuid)
returns jsonb
language plpgsql
stable security definer
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
  elsif p_type = 'rental' then
    -- C3: the rental, its whole timeline and its condition photo paths, as they were.
    select pg_catalog.jsonb_build_object(
      'type', 'rental', 'rental_id', r.id, 'conversation_id', r.conversation_id,
      'listing_id', r.listing_id, 'listing_title', l.title,
      'renter_id', r.renter_id, 'renter_name', coalesce(nullif(rp.studio_name, ''), rp.display_name), 'renter_handle', rp.studio_handle,
      'lender_id', r.lender_id, 'lender_name', coalesce(nullif(lp.studio_name, ''), lp.display_name), 'lender_handle', lp.studio_handle,
      'status', r.status, 'start_date', r.start_date, 'end_date', r.end_date,
      'price_per_day', r.price_per_day, 'days', r.days, 'total', r.total, 'currency', r.currency,
      'created_at', r.created_at,
      'events', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'from', e.from_status, 'to', e.to_status, 'actor_id', e.actor_id, 'actor_role', e.actor_role,
          'note', e.note, 'at', e.created_at) order by e.id)
        from public.rental_events e where e.rental_id = r.id), '[]'::jsonb),
      'photos', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'storage_path', o.name, 'stage', (pg_catalog.string_to_array(o.name, '/'))[2],
          'by_role', case when o.owner_id = r.lender_id::text then 'lender' else 'renter' end,
          'uploaded_at', o.created_at) order by o.created_at, o.name)
        from storage.objects o where o.bucket_id = 'rental-photos' and o.name like r.id::text || '/%'), '[]'::jsonb))
    into v_snapshot
    from public.rentals r
    left join public.listings l on l.id = r.listing_id
    left join public.profiles rp on rp.id = r.renter_id
    left join public.profiles lp on lp.id = r.lender_id
    where r.id = p_target;
    return coalesce(v_snapshot, pg_catalog.jsonb_build_object('type', 'rental', 'missing', true));
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

-- A rental report has nothing to remove: admins warn, suspend, ban or dismiss.
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
    raise exception 'DZ-E5010: Report not found' using errcode = 'P0002';
  end if;
  if v_report.status <> 'open' then
    raise exception 'DZ-E5011: This report is already closed' using errcode = 'P0001';
  end if;
  if v_report.target_type = 'rental' then
    raise exception 'DZ-E5016: A rental report has no content to remove. Warn, suspend or dismiss instead.' using errcode = 'P0001';
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

-- Admin user lookup: a person's rentals with their timeline and condition photo paths (logged).
create function public.admin_user_rentals(p_user_id uuid, p_limit integer default 20)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_rows jsonb;
begin
  select coalesce(pg_catalog.jsonb_agg(app_private.report_snapshot('rental', x.id) order by x.created_at desc), '[]'::jsonb)
  into v_rows
  from (select r.id, r.created_at from public.rentals r
        where p_user_id in (r.renter_id, r.lender_id)
        order by r.created_at desc limit least(greatest(coalesce(p_limit, 20), 1), 50)) x;
  perform app_private.log_admin_action(v_admin, 'view_user_rentals', 'user', p_user_id::text, null, null,
    pg_catalog.jsonb_build_object('count', pg_catalog.jsonb_array_length(v_rows)));
  return v_rows;
end;
$$;

-- 11. Download my data: rentals with price, timeline and the caller's own condition photos.
create or replace function public.export_my_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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
        'rental_reminders', ns.rental_reminders, 'updated_at', ns.updated_at)
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

-- delete-account asks this (with the server key): true while the person has a rental from accepted
-- until it is completed or cancelled. A request alone doesn't block deletion.
create function public.account_has_rental_in_progress(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.rentals r
    where p_user in (r.renter_id, r.lender_id)
      and r.status in ('accepted', 'awaiting_payment', 'paid', 'picked_up', 'returned', 'claimed', 'disputed'));
$$;
revoke execute on function public.account_has_rental_in_progress(uuid) from public, anon, authenticated;
grant execute on function public.account_has_rental_in_progress(uuid) to service_role;

-- 12. Cleanup: condition photo files (a file job, run by cleanup-files through the Storage API).
alter table app_private.job_runs drop constraint job_runs_job_check;
alter table app_private.job_runs add constraint job_runs_job_check check (job = any (array[
  'abandoned_drafts', 'orphan_photos', 'old_condition_photos', 'old_photo_checks', 'expired_reports',
  'old_data_exports', 'old_age_checks', 'old_suggestion_choices', 'old_declarations', 'stale_device_tokens']));

create or replace function public.cleanup_file_plan()
returns jsonb
language plpgsql
stable security definer
set search_path = ''
as $function$
declare
  v_draft_days numeric := app_private.setting_number('draft_retention_days');
  v_orphan_days numeric := app_private.setting_number('orphan_photo_days');
  v_condition_days numeric := coalesce(app_private.setting_number('condition_photo_retention_days'), 365);
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
              order by o2.created_at limit 1000) o), '[]'::jsonb)),
    -- C3: condition photos of rentals that ended more than N days ago, and of rentals that are gone.
    'old_condition_photos', pg_catalog.jsonb_build_object(
      'delete', app_private.cleanup_deletes('old_condition_photos'),
      'paths', coalesce((select pg_catalog.jsonb_agg(o.name)
        from (select o2.name from storage.objects o2
              left join public.rentals r on r.id::text = (pg_catalog.string_to_array(o2.name, '/'))[1]
              where o2.bucket_id = 'rental-photos'
                and (r.id is null
                     or (r.status in ('completed', 'cancelled', 'declined', 'expired')
                         and coalesce(r.completed_at, r.cancelled_at, r.updated_at)
                             < pg_catalog.now() - pg_catalog.make_interval(days => v_condition_days::integer)))
              order by o2.created_at limit 1000) o), '[]'::jsonb)));
end;
$function$;

create or replace function public.cleanup_record_run(p_job text, p_mode text, p_counts jsonb, p_error text, p_started_at timestamp with time zone)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_job not in ('abandoned_drafts', 'orphan_photos', 'old_condition_photos') then
    raise exception 'DZ-E9015: Unknown file job' using errcode = '22023';
  end if;
  perform app_private.record_job_run(p_job, p_mode, p_counts, p_error, p_started_at);
end;
$function$;

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
    from pg_catalog.unnest(array['abandoned_drafts', 'orphan_photos', 'old_condition_photos']) j;
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
  from pg_catalog.unnest(array['abandoned_drafts', 'orphan_photos', 'old_condition_photos', 'old_photo_checks',
                               'expired_reports', 'old_data_exports', 'old_age_checks', 'old_suggestion_choices',
                               'old_declarations', 'stale_device_tokens']) with ordinality as j(job, ord)
  left join public.app_settings s on s.key = 'cleanup_' || j.job;
  perform app_private.log_admin_action(v_admin, 'view_cleanup_jobs', null, null, null, null,
    pg_catalog.jsonb_build_object('count', pg_catalog.jsonb_array_length(v_rows)));
  return v_rows;
end;
$function$;

-- 13. Who may call what -------------------------------------------------------------------------
revoke execute on function app_private.rental_today() from public, anon, authenticated;
revoke execute on function app_private.payments_enabled() from public, anon, authenticated;
revoke execute on function app_private.rental_guard(uuid, uuid, boolean) from public, anon, authenticated;
revoke execute on function app_private.rental_for_actor(uuid, uuid) from public, anon, authenticated;
revoke execute on function app_private.rental_note(text) from public, anon, authenticated;
revoke execute on function app_private.rental_move(public.rentals, text, uuid, text) from public, anon, authenticated;
revoke execute on function app_private.rental_photo_count(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function app_private.queue_rental_push(text, public.rentals, uuid, uuid) from public, anon, authenticated;
revoke execute on function app_private.rental_json(public.rentals, uuid, boolean) from public, anon, authenticated;
revoke execute on function app_private.expire_rental_requests() from public, anon, authenticated;
revoke execute on function app_private.queue_rental_reminders() from public, anon, authenticated;

revoke execute on function public.request_rental(uuid, date, date) from public, anon;
revoke execute on function public.respond_rental(uuid, text, text) from public, anon;
revoke execute on function public.cancel_rental(uuid, text) from public, anon;
revoke execute on function public.mark_picked_up(uuid, text) from public, anon;
revoke execute on function public.mark_returned(uuid, text) from public, anon;
revoke execute on function public.complete_rental(uuid) from public, anon;
revoke execute on function public.get_rental(uuid, uuid) from public, anon;
revoke execute on function public.my_rentals(integer, integer) from public, anon;
revoke execute on function public.admin_user_rentals(uuid, integer) from public, anon;
grant execute on function public.request_rental(uuid, date, date) to authenticated;
grant execute on function public.respond_rental(uuid, text, text) to authenticated;
grant execute on function public.cancel_rental(uuid, text) to authenticated;
grant execute on function public.mark_picked_up(uuid, text) to authenticated;
grant execute on function public.mark_returned(uuid, text) to authenticated;
grant execute on function public.complete_rental(uuid) to authenticated, service_role;
grant execute on function public.get_rental(uuid, uuid) to authenticated;
grant execute on function public.my_rentals(integer, integer) to authenticated;
grant execute on function public.admin_user_rentals(uuid, integer) to authenticated;
