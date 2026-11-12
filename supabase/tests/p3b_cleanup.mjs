// P3B test script: every cleanup job once, in count-only mode, against dzirent-server.
// 1. All nine switches (app_settings cleanup_<job>) must be off (count only).
// 2. Snapshot of every table the jobs touch, the photo files in Storage, and the 12 sample listings.
// 3. The seven database jobs: app_private.run_cleanup_jobs() (what pg_cron runs nightly).
// 4. The two file jobs: app_private.request_file_cleanup() (what pg_cron runs nightly), which
//    calls the cleanup-files Edge Function through pg_net with the Vault secret; then waits for
//    its two job_runs rows.
// 5. Nothing was deleted (the snapshot is the same), the sample listings are untouched, and
//    job_runs has exactly one new row per job, all count-only and without errors.
// Run from the repo root with Node 18+ and the Supabase CLI linked: node supabase/tests/p3b_cleanup.mjs

import assert from "node:assert/strict";
import { sql, CLI } from "./lib/config.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const JOBS = ["abandoned_drafts", "orphan_photos", "old_photo_checks", "expired_reports", "old_data_exports",
  "old_age_checks", "old_suggestion_choices", "old_declarations", "stale_device_tokens"];
const SAMPLE_TITLES = [
  "Silk Halter Evening Gown", "Tailored Charcoal Blazer", "Emerald Velvet Cocktail Dress", "Cashmere Belted Trench Coat",
  "Pleated Wide-Leg Trousers", "Linen Summer Sundress", "Embroidered Silk Lehenga Set", "Modern Qipao Midi Dress",
  "Minimalist Wool Day Coat", "Structured Silk Work Shirt", "Vintage Denim Jumpsuit", "Satin Backless Maxi Dress",
];
const titles = SAMPLE_TITLES.map((t) => `'${t.replace(/'/g, "''")}'`).join(",");

function snapshot() {
  return sql(`select
    (select count(*) from public.listings) listings,
    (select count(*) from public.listing_photos) listing_photos,
    (select count(*) from storage.objects where bucket_id = 'listing-photos') photo_files,
    (select count(*) from public.listing_scans) photo_checks,
    (select count(*) from public.photo_scans) photo_results,
    (select count(*) from public.reports) reports,
    (select count(*) from app_private.report_evidence) evidence,
    (select count(*) from public.data_exports) data_exports,
    (select count(*) from public.age_checks) age_checks,
    (select count(*) from public.suggestion_events) suggestion_choices,
    (select count(*) from public.accessory_declarations) accessory_declarations,
    (select count(*) from public.listing_declarations) listing_declarations,
    (select count(*) from public.device_tokens) device_tokens`)[0];
}
function samples() {
  return sql(`select l.id, l.title, l.status,
      (select count(*) from public.listing_photos p where p.listing_id = l.id) photos,
      (select count(*) from storage.objects o where o.bucket_id = 'listing-photos' and o.name like l.id::text || '/%') files
    from public.listings l where l.title in (${titles}) order by l.title, l.id`);
}

async function run() {
  console.log("1. Switches...");
  const on = sql(`select key from public.app_settings where key like 'cleanup_%' and enabled`);
  assert.equal(on.length, 0, `every cleanup job must be count-only; on: ${on.map((r) => r.key).join(", ")}`);
  const switches = sql(`select count(*) n from public.app_settings where key like 'cleanup_%'`)[0].n;
  assert.equal(Number(switches), 9, "nine switches");
  console.log("   9 switches, all off (count only)");

  console.log("\n2. Snapshot...");
  const before = snapshot();
  const samplesBefore = samples();
  assert.equal(samplesBefore.length, 12, `12 sample listings expected, found ${samplesBefore.length}`);
  const lastRun = Number(sql(`select coalesce(max(id), 0) id from app_private.job_runs`)[0].id);
  console.log(`   ${JSON.stringify(before)}`);
  console.log(`   12 sample listings, ${samplesBefore.reduce((n, s) => n + Number(s.photos), 0)} photo rows, ${samplesBefore.reduce((n, s) => n + Number(s.files), 0)} files`);

  console.log("\n3. Database jobs (run_cleanup_jobs)...");
  const dbCounts = sql(`select app_private.run_cleanup_jobs() as c`)[0].c;
  console.log(`   ${JSON.stringify(dbCounts)}`);

  console.log("\n4. File jobs (request_file_cleanup -> cleanup-files)...");
  const requestId = sql(`select app_private.request_file_cleanup() as id`)[0].id;
  assert.ok(requestId, "pg_net request queued");
  let fileRuns = [];
  for (let i = 0; i < 30; i++) {
    await sleep(3000);
    fileRuns = sql(`select job from app_private.job_runs where id > ${lastRun} and job in ('abandoned_drafts', 'orphan_photos')`);
    if (fileRuns.length >= 2) break;
  }
  const response = sql(`select status_code, left(content, 400) content from net._http_response where id = ${Number(requestId)}`)[0];
  console.log(`   cleanup-files answered ${response?.status_code ?? "(no reply yet)"}: ${response?.content ?? ""}`);
  assert.equal(fileRuns.length, 2, "both file jobs recorded a run");

  console.log("\n5. Results...");
  const runs = sql(`select job, mode, counts, error from app_private.job_runs where id > ${lastRun} order by id`);
  for (const job of JOBS) {
    const mine = runs.filter((r) => r.job === job);
    assert.equal(mine.length, 1, `${job}: one run, found ${mine.length}`);
    assert.equal(mine[0].mode, "count", `${job}: count-only`);
    assert.equal(mine[0].error, null, `${job}: error ${mine[0].error}`);
    console.log(`   ${job}: ${JSON.stringify(mine[0].counts)}`);
  }
  assert.equal(runs.length, JOBS.length, `exactly ${JOBS.length} new runs, found ${runs.length}`);
  const after = snapshot();
  assert.deepEqual(after, before, "nothing was deleted");
  assert.deepEqual(samples(), samplesBefore, "the 12 sample listings are untouched");
  console.log(`   nothing deleted (snapshot unchanged); 12 sample listings unchanged; ${runs.length} runs, one per job`);

  console.log("\nP3B cleanup test PASSED");
}

run().catch((e) => {
  console.error("\nP3B cleanup test FAILED:", e.message);
  process.exit(1);
});
