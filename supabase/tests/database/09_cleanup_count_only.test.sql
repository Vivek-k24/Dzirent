-- C2 pgTAP: the nightly cleanup jobs (P3B) in count-only mode: every switch is off, a run records
-- one count-mode row per database job and deletes nothing.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select is((select count(*)::int from public.app_settings where key like 'cleanup_%'), 10, 'ten cleanup switches (C3 adds old_condition_photos)');
select is((select count(*)::int from public.app_settings where key like 'cleanup_%' and enabled), 0, 'all off: count only');
select is((select count(*)::int from cron.job where jobname in ('dzirent-cleanup-database', 'dzirent-cleanup-files')), 2, 'both nightly jobs are scheduled');

create temp table before on commit drop as
  select (select count(*) from public.listings) listings, (select count(*) from public.listing_photos) photos,
         (select count(*) from public.listing_scans) scans, (select count(*) from public.reports) reports,
         (select count(*) from public.data_exports) exports, (select count(*) from public.age_checks) age_checks,
         (select count(*) from public.device_tokens) tokens, (select max(id) from app_private.job_runs) last_run;
select app_private.run_cleanup_jobs();

select is((select count(*)::int from app_private.job_runs where id > coalesce((select last_run from before), 0)), 7, 'one run row per database job');
select is((select count(*)::int from app_private.job_runs where id > coalesce((select last_run from before), 0) and (mode <> 'count' or error is not null)),
  0, 'every run counted only, without errors');
select results_eq($$select (select count(*) from public.listings), (select count(*) from public.listing_photos),
    (select count(*) from public.listing_scans), (select count(*) from public.reports), (select count(*) from public.data_exports),
    (select count(*) from public.age_checks), (select count(*) from public.device_tokens)$$,
  $$select listings, photos, scans, reports, exports, age_checks, tokens from before$$, 'nothing was deleted');

select * from finish();
rollback;
