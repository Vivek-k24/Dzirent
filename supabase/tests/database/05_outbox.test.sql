-- C2 pgTAP: the background job outbox (C1, app_private.async_jobs).
-- Retry schedule 1, 5, 30, 120 minutes; dead after the 5th failure; a 2xx answer is done; a dead
-- photo check ends as failed / review; the admin's Retry starts a dead job again and is logged.
-- Nothing leaves the database: pg_net requests queued here are rolled back with the transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

select is(array[app_private.job_backoff(1), app_private.job_backoff(2), app_private.job_backoff(3), app_private.job_backoff(4)],
  array[interval '1 minute', interval '5 minutes', interval '30 minutes', interval '120 minutes'], 'backoff: 1, 5, 30, 120 minutes');
select is(app_private.job_max_attempts(), 5, 'dead after 5 attempts');
select is((select count(*)::int from cron.job where jobname = 'dzirent-async-jobs' and schedule = '* * * * *'), 1, 'the worker runs every minute');

-- A push job: the first attempt goes out at once.
create temp table job on commit drop as
  select app_private.enqueue_job('send_push', '{"kind":"message","pgtap":true}'::jsonb) as id;
grant select on job to authenticated;
select results_eq($$select status, attempts, request_id is not null from app_private.async_jobs where id = (select id from job)$$,
  $$values ('running'::text, 1, true)$$, 'enqueue: running, attempt 1, a pg_net request');

-- Fail it five times, checking each wait, then it is dead.
create temp table waits (attempt int, status text, wait interval) on commit drop;
do $do$
declare
  v_id bigint := (select id from job);
  v_row app_private.async_jobs;
begin
  for i in 1..5 loop
    perform app_private.job_failed(v_id, 'HTTP 400');
    select * into v_row from app_private.async_jobs where id = v_id;
    insert into waits values (v_row.attempts, v_row.status, v_row.next_attempt_at - v_row.updated_at);
    if v_row.status = 'pending' then
      update app_private.async_jobs set next_attempt_at = now() where id = v_id;
      perform app_private.dispatch_job(v_id);
    end if;
  end loop;
end
$do$;
select results_eq('select attempt, status, wait from waits where status = ''pending'' order by attempt',
  $$values (1, 'pending'::text, interval '1 minute'), (2, 'pending', interval '5 minutes'), (3, 'pending', interval '30 minutes'), (4, 'pending', interval '120 minutes')$$,
  'after failures 1-4 the next attempt waits 1, 5, 30, 120 minutes');
select results_eq($$select status, attempts, last_error, finished_at is not null from app_private.async_jobs where id = (select id from job)$$,
  $$values ('dead'::text, 5, 'HTTP 400'::text, true)$$, 'after the 5th failure: dead, 5 attempts, the last error kept');

-- A due pending job is dispatched by the worker; a 2xx answer marks it done.
create temp table job2 on commit drop as
  select app_private.enqueue_job('send_push', '{"kind":"message","pgtap":2}'::jsonb) as id;
insert into net._http_response (id, status_code, content, timed_out, created)
  select request_id, 200, '{}', false, now() from app_private.async_jobs where id = (select id from job2);
select is((app_private.run_async_jobs() ->> 'done')::int >= 1, true, 'the worker reads a 2xx answer');
select is((select status from app_private.async_jobs where id = (select id from job2)), 'done', 'a 2xx answer marks the job done');
-- A non-2xx answer schedules a retry.
create temp table job3 on commit drop as
  select app_private.enqueue_job('send_push', '{"kind":"message","pgtap":3}'::jsonb) as id;
insert into net._http_response (id, status_code, content, timed_out, created)
  select request_id, 503, '{}', false, now() from app_private.async_jobs where id = (select id from job3);
select app_private.run_async_jobs();
select results_eq($$select status, last_error from app_private.async_jobs where id = (select id from job3)$$,
  $$values ('pending'::text, 'HTTP 503'::text)$$, 'a 503 answer schedules a retry with the status as the error');

-- A photo check whose job dies ends as failed / review. (One check at a time per listing: clear any.)
delete from public.listing_scans where listing_id = '2fe0cfa6-a95e-4994-bbe4-f1bfb6760490' and status in ('queued', 'running');
insert into public.listing_scans (id, listing_id) values ('5cab0000-0000-4000-8000-000000000001', '2fe0cfa6-a95e-4994-bbe4-f1bfb6760490');
create temp table scanjob on commit drop as
  select app_private.enqueue_job('scan_listing', '{"scan_id":"5cab0000-0000-4000-8000-000000000001"}'::jsonb) as id;
select is((select status from app_private.async_jobs where id = (select id from scanjob)), 'running', 'a queued check''s job is sent');
do $do$
declare v_id bigint := (select id from scanjob);
begin
  for i in 1..5 loop
    perform app_private.job_failed(v_id, 'HTTP 502');
    update app_private.async_jobs set next_attempt_at = now() where id = v_id and status = 'pending';
    perform app_private.dispatch_job(v_id);
  end loop;
end
$do$;
select is((select status from app_private.async_jobs where id = (select id from scanjob)), 'dead', 'the check''s job is dead after 5 failures');
select results_eq($$select status, verdict, error from public.listing_scans where id = '5cab0000-0000-4000-8000-000000000001'$$,
  $$values ('failed'::text, 'review'::text, 'dispatch_failed'::text)$$, 'the photo check ends failed, verdict review');
-- Retrying a check that already ended: the attempt is skipped (done), nothing is sent.
update app_private.async_jobs set status = 'pending', attempts = 0 where id = (select id from scanjob);
select app_private.dispatch_job((select id from scanjob));
select results_eq($$select status, last_error from app_private.async_jobs where id = (select id from scanjob)$$,
  $$values ('done'::text, 'skipped: the photo check is no longer waiting'::text)$$, 'a check that is no longer queued is skipped');

-- The admin: the dead list (no push text) and Retry, logged.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'role', 'authenticated', 'aal', 'aal2',
  'amr', json_build_array(json_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint)))::text, true);
select ok((public.admin_jobs_status() -> 'kinds' -> 0 ->> 'dead')::int >= 1, 'admin_jobs_status counts the dead push job');
create temp table dead on commit drop as select public.admin_list_dead_jobs(100, 0) as rows;
select ok((select rows from dead) @> jsonb_build_array(jsonb_build_object('id', (select id from job), 'attempts', 5)), 'the dead list has the job');
select is((select count(*)::int from dead, jsonb_array_elements(rows) e where e ? 'payload' or e ? 'title' or e ? 'body'), 0, 'the dead list never shows push text');
select is((public.admin_retry_job((select id from job), 'pgtap') ->> 'attempts')::int, 1, 'Retry starts the dead job again at attempt 1');
select throws_like($$select public.admin_retry_job((select id from job))$$, 'DZ-E5061:%', 'only a dead job can be retried');
reset role;
select ok(exists (select 1 from app_private.admin_actions where action = 'retry_background_job' and target_id = (select id from job)::text), 'the retry is in the admin log');

select * from finish();
rollback;
