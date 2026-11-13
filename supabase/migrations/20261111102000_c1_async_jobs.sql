-- C1 Part 3: retries and a dead-letter list for the two background calls (send-push, scan-listing).
-- Before: the triggers called pg_net directly, and a failed call was lost.
-- Now: they add a row to app_private.async_jobs (the outbox) and the first attempt goes out at once.
-- A pg_cron worker every minute reads each attempt's answer from pg_net and dispatches due retries:
--   attempt 1 fails -> again after 1 minute, then 5, 30 and 120 minutes; a 5th failure is "dead".
--   A 2xx answer is "done". No answer 10 minutes after an attempt counts as a failure.
-- A photo check whose job dies ends as failed with verdict review (vision_fail_scan), as before.
-- Admins see counts and the dead jobs, and retry one (logged): admin_jobs_status,
-- admin_list_dead_jobs, admin_retry_job. Done jobs are kept 1 day, dead jobs 30 days.

create table app_private.async_jobs (
  id bigint generated always as identity primary key,
  kind text not null constraint async_jobs_kind_check check (kind in ('send_push', 'scan_listing')),
  payload jsonb not null,
  status text not null default 'pending'
    constraint async_jobs_status_check check (status in ('pending', 'running', 'done', 'dead')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default pg_catalog.now(),
  last_error text,
  request_id bigint,
  dispatched_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);
comment on table app_private.async_jobs is
  'C1 outbox: send-push and scan-listing calls with retries (1, 5, 30, 120 minutes), dead after 5 attempts.';
create index async_jobs_due_idx on app_private.async_jobs using btree (next_attempt_at) where status = 'pending';
create index async_jobs_running_idx on app_private.async_jobs using btree (id) where status = 'running';
create index async_jobs_status_idx on app_private.async_jobs using btree (status, finished_at);
alter table app_private.async_jobs enable row level security;
revoke all on app_private.async_jobs from public, anon, authenticated, service_role;

-- Wait before the next attempt, after [p_attempts] failed ones: 1, 5, 30, then 120 minutes.
create function app_private.job_backoff(p_attempts integer)
returns interval
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.make_interval(mins => (array[1, 5, 30, 120])[least(greatest(coalesce(p_attempts, 1), 1), 4)]);
$$;

create function app_private.job_max_attempts()
returns integer
language sql
immutable
set search_path = ''
as $$ select 5 $$;

-- One attempt failed: schedule the next one, or mark the job dead after the last.
create function app_private.job_failed(p_id bigint, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job app_private.async_jobs;
begin
  select * into v_job from app_private.async_jobs j where j.id = p_id for update;
  if not found then
    return;
  end if;
  if v_job.attempts >= app_private.job_max_attempts() then
    update app_private.async_jobs
      set status = 'dead', last_error = pg_catalog.left(coalesce(p_error, 'failed'), 300), request_id = null,
          finished_at = pg_catalog.now(), updated_at = pg_catalog.now()
      where id = p_id;
    if v_job.kind = 'scan_listing' then
      -- The photo check ends like any failed check: failed, verdict review.
      perform public.vision_fail_scan((v_job.payload->>'scan_id')::uuid, 'dispatch_failed');
    end if;
  else
    update app_private.async_jobs
      set status = 'pending', last_error = pg_catalog.left(coalesce(p_error, 'failed'), 300), request_id = null,
          next_attempt_at = pg_catalog.now() + app_private.job_backoff(v_job.attempts),
          updated_at = pg_catalog.now()
      where id = p_id;
  end if;
end;
$$;

-- Sends one attempt of a pending job through pg_net (it goes out when the transaction commits).
create function app_private.dispatch_job(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
    -- The check already started, finished or timed out: nothing left to send.
    update app_private.async_jobs
      set status = 'done', last_error = 'skipped: the photo check is no longer waiting',
          finished_at = pg_catalog.now(), updated_at = pg_catalog.now()
      where id = p_id;
    return;
  end if;

  if v_job.kind = 'send_push' then
    select ds.decrypted_secret into v_url from vault.decrypted_secrets ds where ds.name = 'send_push_url';
    select ds.decrypted_secret into v_secret from vault.decrypted_secrets ds where ds.name = 'send_push_secret';
    v_header := 'x-send-push-secret';
  else
    select ds.decrypted_secret into v_url from vault.decrypted_secrets ds where ds.name = 'scan_listing_url';
    select ds.decrypted_secret into v_secret from vault.decrypted_secrets ds where ds.name = 'scan_listing_secret';
    v_header := 'x-scan-listing-secret';
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
$$;

-- What the triggers call: add the job and send its first attempt now.
create function app_private.enqueue_job(p_kind text, p_payload jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  insert into app_private.async_jobs (kind, payload) values (p_kind, p_payload) returning id into v_id;
  perform app_private.dispatch_job(v_id);
  return v_id;
end;
$$;

-- The worker (pg_cron, every minute): answers of running attempts, then due retries, then old rows.
create function app_private.run_async_jobs()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_code integer;
  v_timed_out boolean;
  v_error text;
  v_done integer := 0;
  v_failed integer := 0;
  v_sent integer := 0;
  v_removed integer := 0;
begin
  for r in
    select j.id, j.request_id, j.dispatched_at from app_private.async_jobs j
    where j.status = 'running' order by j.id for update skip locked
  loop
    select h.status_code, h.timed_out, h.error_msg into v_code, v_timed_out, v_error
    from net._http_response h where h.id = r.request_id;
    if found then
      if v_code between 200 and 299 then
        update app_private.async_jobs
          set status = 'done', finished_at = pg_catalog.now(), updated_at = pg_catalog.now(), request_id = null
          where id = r.id;
        v_done := v_done + 1;
      else
        perform app_private.job_failed(r.id, case
          when coalesce(v_timed_out, false) then 'timed out'
          when v_code is null then 'no answer: ' || coalesce(v_error, 'unknown')
          else 'HTTP ' || v_code end);
        v_failed := v_failed + 1;
      end if;
    elsif r.dispatched_at < pg_catalog.now() - interval '10 minutes' then
      perform app_private.job_failed(r.id, 'no answer after 10 minutes');
      v_failed := v_failed + 1;
    end if;
  end loop;

  for r in
    select j.id from app_private.async_jobs j
    where j.status = 'pending' and j.next_attempt_at <= pg_catalog.now()
    order by j.next_attempt_at limit 100 for update skip locked
  loop
    perform app_private.dispatch_job(r.id);
    v_sent := v_sent + 1;
  end loop;

  delete from app_private.async_jobs j
  where (j.status = 'done' and j.finished_at < pg_catalog.now() - interval '1 day')
     or (j.status = 'dead' and j.finished_at < pg_catalog.now() - interval '30 days');
  get diagnostics v_removed = row_count;

  return pg_catalog.jsonb_build_object('done', v_done, 'failed', v_failed, 'dispatched', v_sent, 'removed', v_removed);
end;
$$;

-- Push: the same checks and wording as before; the call goes through the outbox.
create or replace function app_private.queue_push(p_kind text, p_conversation_id uuid, p_sender uuid, p_recipient uuid, p_text text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_messages boolean;
  v_show_text boolean;
  v_name text;
  v_listing text;
  v_dates text;
  v_title text;
  v_body text;
begin
  if p_recipient is null or p_sender is null or p_recipient = p_sender then
    return;
  end if;
  if exists (
    select 1 from public.blocks bl
    where (bl.blocker_id = p_sender and bl.blocked_id = p_recipient)
       or (bl.blocker_id = p_recipient and bl.blocked_id = p_sender)
  ) then
    return;
  end if;

  select ns.messages, ns.show_message_text into v_messages, v_show_text
  from public.notification_settings ns where ns.user_id = p_recipient;
  if not found then
    v_messages := true;
    v_show_text := false;
  end if;
  if not v_messages
     or not exists (select 1 from public.device_tokens dt where dt.user_id = p_recipient) then
    return;
  end if;

  -- The sender as the recipient's inbox shows them: studio name, else display name.
  select app_private.push_safe_text(coalesce(nullif(pg_catalog.btrim(p.studio_name), ''), p.display_name), 60)
    into v_name
  from public.profiles p where p.id = p_sender;

  select app_private.push_safe_text(l.title, 80),
         case when c.requested_start is not null and c.requested_end is not null
              then app_private.push_dates_label(c.requested_start, c.requested_end) end
    into v_listing, v_dates
  from public.conversations c
  left join public.listings l on l.id = c.listing_id
  where c.id = p_conversation_id;

  if p_kind = 'message' then
    v_title := 'New message' || coalesce(' from ' || v_name, '');
    v_body := case when v_show_text then app_private.push_safe_text(p_text, 200) end;
  elsif p_kind = 'new_chat' then
    v_title := 'New chat' || coalesce(' from ' || v_name, '');
    v_body := pg_catalog.concat_ws(' · ', v_listing, v_dates);
  elsif p_kind = 'dates' and v_dates is not null then
    v_title := 'New dates' || coalesce(' from ' || v_name, '');
    v_body := pg_catalog.concat_ws(' · ', v_dates, v_listing);
  else
    return;
  end if;

  -- Push not set up (no address in Vault): nothing to send, as before.
  if not exists (select 1 from vault.decrypted_secrets ds where ds.name = 'send_push_url') then
    return;
  end if;

  perform app_private.enqueue_job('send_push', pg_catalog.jsonb_build_object(
    'kind', p_kind,
    'conversation_id', p_conversation_id,
    'recipient_id', p_recipient,
    'title', v_title,
    'body', nullif(v_body, '')
  ));
end;
$function$;

create or replace function app_private.queue_scan(p_listing_id uuid, p_lender uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_status text;
  v_hash text;
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

  if not exists (select 1 from vault.decrypted_secrets ds where ds.name = 'scan_listing_url')
     or not exists (select 1 from vault.decrypted_secrets ds where ds.name = 'scan_listing_secret') then
    raise exception 'DZ-E2011: Photo checks are not set up' using errcode = 'P0001';
  end if;

  insert into public.listing_scans (listing_id) values (p_listing_id) returning id into v_id;
  -- Through the outbox: the first attempt goes out when this transaction commits, retries after.
  perform app_private.enqueue_job('scan_listing', pg_catalog.jsonb_build_object('scan_id', v_id));
  return v_id;
end;
$function$;

-- Admin (two-step sign-in, logged like every admin call).
create function public.admin_jobs_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_result jsonb;
begin
  select pg_catalog.jsonb_build_object(
      'kinds', (
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'kind', k.kind,
            'pending', (select count(*) from app_private.async_jobs j where j.kind = k.kind and j.status = 'pending'),
            'running', (select count(*) from app_private.async_jobs j where j.kind = k.kind and j.status = 'running'),
            'done_day', (select count(*) from app_private.async_jobs j where j.kind = k.kind and j.status = 'done'
                           and j.finished_at > pg_catalog.now() - interval '1 day'),
            'dead', (select count(*) from app_private.async_jobs j where j.kind = k.kind and j.status = 'dead'),
            'retrying', (select count(*) from app_private.async_jobs j where j.kind = k.kind and j.status = 'pending'
                           and j.attempts > 0))
          order by k.ord)
        from pg_catalog.unnest(array['send_push', 'scan_listing']) with ordinality as k(kind, ord)),
      'oldest_waiting_at', (select min(j.created_at) from app_private.async_jobs j where j.status in ('pending', 'running')),
      'last_dead_at', (select max(j.finished_at) from app_private.async_jobs j where j.status = 'dead'),
      'schedule_minutes', pg_catalog.jsonb_build_array(1, 5, 30, 120),
      'max_attempts', app_private.job_max_attempts())
    into v_result;
  perform app_private.log_admin_action(v_admin, 'view_background_jobs', null, null, null, null, null);
  return v_result;
end;
$$;

-- Dead jobs, newest first. Push text is never shown: only what the job was for.
create function public.admin_list_dead_jobs(p_limit integer default 30, p_offset integer default 0)
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
      'id', j.id,
      'kind', j.kind,
      'attempts', j.attempts,
      'last_error', j.last_error,
      'created_at', j.created_at,
      'died_at', j.finished_at,
      'push_kind', case when j.kind = 'send_push' then j.payload->>'kind' end,
      'conversation_id', case when j.kind = 'send_push' then j.payload->>'conversation_id' end,
      'scan_id', case when j.kind = 'scan_listing' then j.payload->>'scan_id' end)
      order by j.finished_at desc, j.id desc), '[]'::jsonb)
    into v_rows
  from (
    select * from app_private.async_jobs d where d.status = 'dead'
    order by d.finished_at desc, d.id desc
    limit least(greatest(coalesce(p_limit, 30), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
  ) j;
  perform app_private.log_admin_action(v_admin, 'view_dead_jobs', null, null, null, null,
    pg_catalog.jsonb_build_object('count', pg_catalog.jsonb_array_length(v_rows)));
  return v_rows;
end;
$$;

-- Starts a dead job again from attempt 1 (the first attempt goes out at once).
create function public.admin_retry_job(p_job_id bigint, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app_private.require_admin();
  v_job app_private.async_jobs;
begin
  select * into v_job from app_private.async_jobs j where j.id = p_job_id for update;
  if not found then
    raise exception 'DZ-E5060: Background job not found' using errcode = 'P0002';
  end if;
  if v_job.status <> 'dead' then
    raise exception 'DZ-E5061: Only a dead background job can be retried' using errcode = 'P0001';
  end if;
  update app_private.async_jobs
    set status = 'pending', attempts = 0, next_attempt_at = pg_catalog.now(), finished_at = null,
        request_id = null, updated_at = pg_catalog.now()
    where id = p_job_id;
  perform app_private.dispatch_job(p_job_id);
  select * into v_job from app_private.async_jobs j where j.id = p_job_id;
  perform app_private.log_admin_action(v_admin, 'retry_background_job', 'async_job', p_job_id::text,
    nullif(pg_catalog.btrim(coalesce(p_reason, '')), ''),
    pg_catalog.jsonb_build_object('status', 'dead', 'kind', v_job.kind),
    pg_catalog.jsonb_build_object('status', v_job.status, 'attempts', v_job.attempts));
  return pg_catalog.jsonb_build_object('id', v_job.id, 'kind', v_job.kind, 'status', v_job.status,
    'attempts', v_job.attempts, 'last_error', v_job.last_error);
end;
$$;

revoke execute on function app_private.job_backoff(integer) from public, anon, authenticated;
revoke execute on function app_private.job_max_attempts() from public, anon, authenticated;
revoke execute on function app_private.job_failed(bigint, text) from public, anon, authenticated;
revoke execute on function app_private.dispatch_job(bigint) from public, anon, authenticated;
revoke execute on function app_private.enqueue_job(text, jsonb) from public, anon, authenticated;
revoke execute on function app_private.run_async_jobs() from public, anon, authenticated;
revoke execute on function public.admin_jobs_status() from public, anon;
revoke execute on function public.admin_list_dead_jobs(integer, integer) from public, anon;
revoke execute on function public.admin_retry_job(bigint, text) from public, anon;
grant execute on function public.admin_jobs_status() to authenticated;
grant execute on function public.admin_list_dead_jobs(integer, integer) to authenticated;
grant execute on function public.admin_retry_job(bigint, text) to authenticated;

select cron.schedule('dzirent-async-jobs', '* * * * *', 'select app_private.run_async_jobs()');
