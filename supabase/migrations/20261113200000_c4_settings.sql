-- C4 Part 6 (2026-11-13): admin-controlled settings, no hardcoding.
--
-- Every business number and rule lives in the closed table app_private.settings. Each row now says
-- what it is: a label, an area (for the admin Settings page), a type, a unit, a minimum and maximum
-- (or the allowed choices), a plain description (the existing "note") and who decides it (the
-- owner, the business owner or the attorney). A value outside its range or of the wrong type is
-- refused for everyone, migrations included (trigger settings_check).
--
-- Admins read and change them with admin_list_settings / admin_set_setting (two-step sign-in, a
-- reason, logged in admin_actions). Settings that the legal pages describe (fee, refunds, claim
-- window, the retention periods the privacy page names) are marked affects_terms, so the website
-- warns that the pages may need updating. Changing the reminder hour or time zone reschedules the
-- reminder cron job.
--
-- New settings: the payment rules (C4), the automatic cancel after the start date, the reminder
-- hour and time zone (were 9 AM and Austin in code), and the download-my-data interval (was 24
-- hours in code). Technical constants stay in code on purpose: the outbox retry schedule, the
-- 24-hour admin two-step freshness (a security rule), the photo-check timeout, cron cadences.

-- 1. The metadata columns ---------------------------------------------------------------------
alter table app_private.settings
  add column label text,
  add column area text,
  add column value_type text,
  add column unit text,
  add column min_value numeric,
  add column max_value numeric,
  add column choices text[],
  add column decided_by text,
  add column affects_terms boolean not null default false;

comment on column app_private.settings.note is 'Plain description of the setting (shown on the admin Settings page).';
comment on column app_private.settings.decided_by is 'Who decides the value: owner, business_owner or attorney.';
comment on column app_private.settings.affects_terms is 'True when the legal pages state this value: changing it may need a legal page update.';

-- 2. The new settings -------------------------------------------------------------------------
insert into app_private.settings (key, value, note) values
  ('platform_fee_percent', '0'::jsonb,
   'Dzirent''s fee, as a percent of the rental price, taken from each rental payment (0 for the pilot).'),
  ('claim_window_hours', '48'::jsonb,
   'After a return, the lender has this long to file a damage claim against the deposit. With no claim, the deposit hold is released and the rental completes.'),
  ('cancellation_refund_cutoff_hours', '48'::jsonb,
   'A renter who cancels a paid rental at least this long before the start date gets a full refund. A lender who cancels always refunds in full.'),
  ('late_cancellation_refund_percent', '0'::jsonb,
   'After the cutoff, the share of the rental price refunded when the renter cancels (0: the lender keeps the rental price). Also used for the automatic cancel after the start date.'),
  ('sales_tax_enabled', 'false'::jsonb,
   'Sales tax on rentals. Only a hook for now: it adds $0 until the tax adviser decides.'),
  ('deposit_hold_warning_hours', '24'::jsonb,
   'A deposit hold that ends within this many hours while the piece is still picked up is replaced with a new hold, and both people are told.'),
  ('rental_autocancel_days', '2'::jsonb,
   'A rental that is accepted or paid but not marked picked up this many days after its start date is cancelled automatically.'),
  ('rental_reminder_hour', '9'::jsonb,
   'The hour (in the rental time zone) when pickup, return and overdue reminders go out each day.'),
  ('rental_timezone', '"America/Chicago"'::jsonb,
   'The time zone for rental days: today, tomorrow, overdue, the reminder hour and the cancellation cutoff (Austin for the pilot).'),
  ('data_export_interval_hours', '24'::jsonb,
   'How often a person can download their data.')
on conflict (key) do nothing;

-- 3. Metadata for every setting ------------------------------------------------------------------
update app_private.settings s set
  label = m.label, area = m.area, value_type = m.value_type, unit = m.unit,
  min_value = m.min_value, max_value = m.max_value, choices = m.choices,
  decided_by = m.decided_by, affects_terms = m.affects_terms
from (values
  -- Payments (C4)
  ('platform_fee_percent', 'Platform fee', 'payments', 'number', 'percent of the rental price', 0, 30, null::text[], 'business_owner', true),
  ('claim_window_hours', 'Claim window after return', 'payments', 'integer', 'hours', 1, 336, null, 'business_owner', true),
  ('cancellation_refund_cutoff_hours', 'Full-refund cutoff', 'payments', 'integer', 'hours before the start date', 0, 720, null, 'business_owner', true),
  ('late_cancellation_refund_percent', 'Refund after the cutoff', 'payments', 'number', 'percent of the rental price', 0, 100, null, 'business_owner', true),
  ('sales_tax_enabled', 'Sales tax', 'payments', 'boolean', null, null, null, null, 'attorney', true),
  ('deposit_hold_warning_hours', 'Deposit hold renewal notice', 'payments', 'integer', 'hours before the hold ends', 1, 72, null, 'owner', false),
  -- Rentals
  ('rental_request_hours', 'Time to answer a request', 'rentals', 'integer', 'hours', 1, 336, null, 'owner', false),
  ('rental_autocancel_days', 'Automatic cancel if not picked up', 'rentals', 'integer', 'days after the start date', 0, 14, null, 'owner', false),
  ('rental_overdue_reminder_days', 'Overdue return reminders', 'rentals', 'integer', 'days after the end date', 0, 14, null, 'owner', false),
  ('rental_reminder_hour', 'Reminder time', 'rentals', 'integer', 'hour of the day (0-23)', 0, 23, null, 'owner', false),
  ('rental_timezone', 'Rental time zone', 'rentals', 'timezone', null, null, null, null, 'owner', false),
  -- Rate limits ({ max, window_seconds }; the range is for max)
  ('rate_limit_message', 'Chat messages', 'rate_limits', 'rate_limit', 'per minute', 1, 1000, null, 'owner', false),
  ('rate_limit_new_chat', 'New chats', 'rate_limits', 'rate_limit', 'per day', 1, 1000, null, 'owner', false),
  ('rate_limit_report', 'Reports', 'rate_limits', 'rate_limit', 'per day', 1, 1000, null, 'owner', false),
  ('rate_limit_new_listing', 'New listings', 'rate_limits', 'rate_limit', 'per day', 1, 1000, null, 'owner', false),
  ('rate_limit_photo_scan', 'Photo checks', 'rate_limits', 'rate_limit', 'per hour', 1, 1000, null, 'owner', false),
  ('rate_limit_rental_request', 'Rental requests', 'rate_limits', 'rate_limit', 'per day', 1, 1000, null, 'owner', false),
  ('data_export_interval_hours', 'Download my data', 'rate_limits', 'integer', 'hours between downloads', 1, 168, null, 'owner', false),
  -- Retention
  ('report_retention_days', 'Closed reports', 'retention', 'integer', 'days after closing', 30, 3650, null, 'attorney', true),
  ('condition_photo_retention_days', 'Condition photos', 'retention', 'integer', 'days after the rental ends', 30, 3650, null, 'attorney', true),
  ('declaration_retention_years', 'Accessory and listing declarations', 'retention', 'integer', 'years', 1, 20, null, 'attorney', true),
  ('draft_retention_days', 'Unpublished drafts', 'retention', 'integer', 'days without an edit', 7, 3650, null, 'owner', false),
  ('orphan_photo_days', 'Photo files without a listing', 'retention', 'integer', 'days', 1, 365, null, 'owner', false),
  ('photo_check_retention_days', 'Older photo checks', 'retention', 'integer', 'days', 7, 3650, null, 'owner', false),
  -- At least 8 days, so the record behind the download interval (at most 7 days) is never gone first.
  ('data_export_retention_days', 'Download records', 'retention', 'integer', 'days', 8, 3650, null, 'owner', false),
  ('age_checks_keep', 'Age checks', 'retention', 'choice', null, null, null, array['latest'], 'owner', false),
  ('suggestion_retention_days', 'Suggestion choices', 'retention', 'integer', 'days', 1, 3650, null, 'owner', false),
  ('device_token_stale_days', 'Unused push tokens', 'retention', 'integer', 'days without use', 7, 3650, null, 'owner', false)
) as m(key, label, area, value_type, unit, min_value, max_value, choices, decided_by, affects_terms)
where s.key = m.key;

-- The descriptions without the "Owner decides." / "Attorney decides." tails (decided_by holds it now).
update app_private.settings set note = pg_catalog.btrim(pg_catalog.regexp_replace(note, '\s*(Owner|Attorney) decides\.\s*', ' ', 'g'));

do $check$
begin
  if exists (select 1 from app_private.settings where value_type is null) then
    raise exception 'C4: a setting has no metadata: %',
      (select pg_catalog.string_agg(key, ', ') from app_private.settings where value_type is null);
  end if;
end
$check$;

alter table app_private.settings
  alter column label set not null,
  alter column area set not null,
  alter column value_type set not null,
  alter column decided_by set not null,
  add constraint settings_area_check check (area in ('payments', 'rentals', 'rate_limits', 'retention')),
  add constraint settings_type_check check (value_type in ('integer', 'number', 'boolean', 'timezone', 'choice', 'rate_limit')),
  add constraint settings_decided_by_check check (decided_by in ('owner', 'business_owner', 'attorney')),
  add constraint settings_range_check check (min_value is null or max_value is null or min_value <= max_value);

-- 4. Values are checked against their type and range, for every writer ---------------------------
create function app_private.setting_value_problem(p_type text, p_value jsonb, p_min numeric, p_max numeric,
                                                  p_choices text[], p_unit text)
returns text
language plpgsql
stable
set search_path = ''
as $$
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
    else
      return 'DZ-E5072: Unknown setting type.';
  end case;
  return null;
end;
$$;

create function app_private.settings_check()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_problem text := app_private.setting_value_problem(new.value_type, new.value, new.min_value, new.max_value,
                                                       new.choices, new.unit);
begin
  if v_problem is not null then
    raise exception using errcode = '22023', message = v_problem, hint = 'value';
  end if;
  if tg_op = 'UPDATE' and new.value is distinct from old.value then
    new.updated_at := pg_catalog.now();
  end if;
  return new;
end;
$$;
create trigger settings_check before insert or update on app_private.settings
  for each row execute function app_private.settings_check();

-- 5. Typed readers: a missing setting is an error (DZ-E9020), never a value hidden in code --------
create function app_private.setting_required(p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_value jsonb;
begin
  select s.value into v_value from app_private.settings s where s.key = p_key;
  if v_value is null then
    raise exception 'DZ-E9020: A setting is missing: %', p_key using errcode = 'P0001';
  end if;
  return v_value;
end;
$$;

create function app_private.setting_int(p_key text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$ select (app_private.setting_required(p_key) #>> '{}')::numeric::integer $$;

create function app_private.setting_num(p_key text)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$ select (app_private.setting_required(p_key) #>> '{}')::numeric $$;

create function app_private.setting_bool(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select (app_private.setting_required(p_key) #>> '{}')::boolean $$;

create function app_private.setting_text(p_key text)
returns text
language sql
stable
security definer
set search_path = ''
as $$ select app_private.setting_required(p_key) #>> '{}' $$;

-- 6. Rental days and reminders read the time zone and hour ---------------------------------------
create or replace function app_private.rental_today()
returns date
language sql
stable
set search_path = ''
as $$
  -- "Today" for rentals: the rental time zone's day (setting rental_timezone).
  select (pg_catalog.now() at time zone app_private.setting_text('rental_timezone'))::date;
$$;

-- Schedules dzirent-rental-reminders at the next occurrence of the reminder hour in the rental time
-- zone, as a UTC cron time. Run when either setting changes and after each reminder run, so a
-- daylight-saving change moves the UTC time the next day. Returns the cron schedule.
create function app_private.schedule_rental_reminders()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz text := app_private.setting_text('rental_timezone');
  v_hour integer := app_private.setting_int('rental_reminder_hour');
  v_local_day date := (pg_catalog.now() at time zone v_tz)::date;
  v_next timestamp with time zone := (v_local_day + pg_catalog.make_time(v_hour, 0, 0)) at time zone v_tz;
  v_utc timestamp;
  v_schedule text;
begin
  if v_next <= pg_catalog.now() then
    v_next := ((v_local_day + 1) + pg_catalog.make_time(v_hour, 0, 0)) at time zone v_tz;
  end if;
  v_utc := v_next at time zone 'UTC';
  v_schedule := pg_catalog.date_part('minute', v_utc)::integer || ' ' || pg_catalog.date_part('hour', v_utc)::integer || ' * * *';
  perform cron.schedule('dzirent-rental-reminders', v_schedule, 'select app_private.queue_rental_reminders()');
  return v_schedule;
end;
$$;

-- The daily reminders (C3), with the overdue days from the setting, then the next run scheduled.
create or replace function app_private.queue_rental_reminders()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := app_private.rental_today();
  v_overdue integer := app_private.setting_int('rental_overdue_reminder_days');
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
  perform app_private.schedule_rental_reminders();
  return pg_catalog.jsonb_build_object('considered', v_considered, 'queued', v_queued);
end;
$$;

-- The condition photo job without its hardcoded fallback (the setting always exists).
create or replace function public.cleanup_file_plan()
returns jsonb
language plpgsql
stable security definer
set search_path = ''
as $function$
declare
  v_draft_days integer := app_private.setting_int('draft_retention_days');
  v_orphan_days integer := app_private.setting_int('orphan_photo_days');
  v_condition_days integer := app_private.setting_int('condition_photo_retention_days');
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
                and l2.updated_at < pg_catalog.now() - pg_catalog.make_interval(days => v_draft_days)
              order by l2.updated_at limit 200) l), '[]'::jsonb)),
    'orphan_photos', pg_catalog.jsonb_build_object(
      'delete', app_private.cleanup_deletes('orphan_photos'),
      'paths', coalesce((select pg_catalog.jsonb_agg(o.name)
        from (select o2.name from storage.objects o2
              where o2.bucket_id = 'listing-photos'
                and o2.created_at < pg_catalog.now() - pg_catalog.make_interval(days => v_orphan_days)
                and not exists (select 1 from public.listing_photos p where p.storage_path = o2.name)
              order by o2.created_at limit 1000) o), '[]'::jsonb)),
    'old_condition_photos', pg_catalog.jsonb_build_object(
      'delete', app_private.cleanup_deletes('old_condition_photos'),
      'paths', coalesce((select pg_catalog.jsonb_agg(o.name)
        from (select o2.name from storage.objects o2
              left join public.rentals r on r.id::text = (pg_catalog.string_to_array(o2.name, '/'))[1]
              where o2.bucket_id = 'rental-photos'
                and (r.id is null
                     or (r.status in ('completed', 'cancelled', 'declined', 'expired')
                         and coalesce(r.completed_at, r.cancelled_at, r.updated_at)
                             < pg_catalog.now() - pg_catalog.make_interval(days => v_condition_days)))
              order by o2.created_at limit 1000) o), '[]'::jsonb)));
end;
$function$;

-- 7. Admin: list and change settings (two-step sign-in, a reason, logged) ------------------------
create function public.admin_list_settings()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_rows jsonb;
begin
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'key', s.key, 'label', s.label, 'area', s.area, 'value', s.value, 'type', s.value_type,
      'unit', s.unit, 'min', s.min_value, 'max', s.max_value, 'choices', pg_catalog.to_jsonb(s.choices),
      'description', s.note, 'decided_by', s.decided_by, 'affects_terms', s.affects_terms,
      'updated_at', s.updated_at)
    order by pg_catalog.array_position(array['payments', 'rentals', 'rate_limits', 'retention'], s.area), s.label), '[]'::jsonb)
  into v_rows
  from app_private.settings s;
  perform app_private.log_admin_action(v_admin, 'view_settings', null, null, null, null,
    pg_catalog.jsonb_build_object('count', pg_catalog.jsonb_array_length(v_rows)));
  return v_rows;
end;
$$;

-- p_value: the new value as JSON (a number, true/false, or a string). For a rate limit, a number
-- is the new maximum (the window stays). A number sent as a string ("48") is read as a number.
create function public.admin_set_setting(p_key text, p_value jsonb, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_reason text := app_private.require_reason(p_reason);
  v_row app_private.settings;
  v_new jsonb := p_value;
  v_schedule text;
begin
  select * into v_row from app_private.settings s where s.key = p_key for update;
  if not found then
    raise exception 'DZ-E5071: Setting not found' using errcode = 'P0002';
  end if;
  if v_new is null then
    raise exception 'DZ-E5072: Enter a value.' using errcode = '22023', hint = 'value';
  end if;
  -- Website forms send text: "48" -> 48, "true" -> true.
  if pg_catalog.jsonb_typeof(v_new) = 'string' then
    if v_row.value_type in ('integer', 'number', 'rate_limit') and (v_new #>> '{}') ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' then
      v_new := pg_catalog.to_jsonb(pg_catalog.btrim(v_new #>> '{}')::numeric);
    elsif v_row.value_type = 'boolean' and pg_catalog.lower(v_new #>> '{}') in ('true', 'false') then
      v_new := pg_catalog.to_jsonb(pg_catalog.lower(v_new #>> '{}')::boolean);
    end if;
  end if;
  if v_row.value_type = 'rate_limit' and pg_catalog.jsonb_typeof(v_new) = 'number' then
    v_new := pg_catalog.jsonb_set(v_row.value, '{max}', v_new);
  end if;

  -- The trigger checks the type and range (DZ-E5070 / DZ-E5072).
  update app_private.settings set value = v_new where key = p_key;

  if p_key in ('rental_reminder_hour', 'rental_timezone') then
    v_schedule := app_private.schedule_rental_reminders();
  end if;
  perform app_private.log_admin_action(v_admin, 'set_setting', 'setting', p_key, v_reason,
    pg_catalog.jsonb_build_object('value', v_row.value),
    pg_catalog.jsonb_build_object('value', v_new, 'affects_terms', v_row.affects_terms)
      || case when v_schedule is null then '{}'::jsonb else pg_catalog.jsonb_build_object('reminder_schedule_utc', v_schedule) end);
  return pg_catalog.jsonb_build_object('key', p_key, 'old_value', v_row.value, 'new_value', v_new,
    'affects_terms', v_row.affects_terms, 'reminder_schedule_utc', v_schedule);
end;
$$;

-- 8. Who may call what --------------------------------------------------------------------------
revoke execute on function app_private.setting_value_problem(text, jsonb, numeric, numeric, text[], text) from public, anon, authenticated;
revoke execute on function app_private.settings_check() from public, anon, authenticated;
revoke execute on function app_private.setting_required(text) from public, anon, authenticated;
revoke execute on function app_private.setting_int(text) from public, anon, authenticated;
revoke execute on function app_private.setting_num(text) from public, anon, authenticated;
revoke execute on function app_private.setting_bool(text) from public, anon, authenticated;
revoke execute on function app_private.setting_text(text) from public, anon, authenticated;
revoke execute on function app_private.schedule_rental_reminders() from public, anon, authenticated;
revoke execute on function app_private.rental_today() from public, anon, authenticated;
revoke execute on function app_private.queue_rental_reminders() from public, anon, authenticated;
revoke execute on function public.admin_list_settings() from public, anon;
revoke execute on function public.admin_set_setting(text, jsonb, text) from public, anon;
grant execute on function public.admin_list_settings() to authenticated;
grant execute on function public.admin_set_setting(text, jsonb, text) to authenticated;

-- The reminder job now runs at the reminder hour in the rental time zone (9 AM Austin = 15:00 UTC
-- in winter, 14:00 UTC in summer), rescheduled after each run.
select app_private.schedule_rental_reminders();
