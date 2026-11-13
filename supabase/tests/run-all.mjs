// C2: runs every integration script in supabase/tests, in order, against the LOCAL backend.
//   supabase start                      (once; the database comes from migrations + supabase/seed.sql)
//   node supabase/tests/run-all.mjs     (starts the stubs and `functions serve`, uploads seed photos,
//                                        runs every script, then stops what it started)
// Options: --only=step1b,p2b   run some scripts;  --keep   leave the stubs and functions running.
// --live runs them against dzirent-server instead: it prints a warning, needs the secrets files and
// writes to production test users; never use it for load or for routine checks.
import { spawn, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LIVE, REPO_ROOT, SUPABASE_URL, SUPABASE_KEY, CLI, sql } from "./lib/config.mjs";
import { startStubs, stopStubs } from "./stubs/run.mjs";
import { uploadSeedPhotos } from "./lib/local_photos.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
// Any photo will do for step 8B locally: the vision stub rejects it by the name it is uploaded under.
const SEED_PHOTO = join(REPO_ROOT, "supabase/seed/images/emerald-velvet-cocktail-dress/front.jpg");

/** In order: the older steps first, then the phases. Each is independent of the others' leftovers. */
export const SCRIPTS = [
  ["node --test", "delete_listing.test.mjs"],
  ["python", "guest_rest.py"],
  ["node", "step1b.mjs"],
  ["node", "step4c_parity_test.mjs"],
  ["node", "step5b_dates_block.mjs"],
  ["node", "p1b_legal_consent.mjs"],
  ["node", "p2a_text_filter.mjs"],
  ["node", "p2c_age_gate.mjs"],
  ["node", "p3a_data_export.mjs"],
  ["node", "step7a_push.mjs"],
  ["node", "step8a_scan.mjs"],
  ["node", "step8b_recheck.mjs", { args: ["off", SEED_PHOTO] }],
  ["node", "step8b_recheck.mjs", { args: ["on", SEED_PHOTO], local: true,
    before: () => sql("update public.app_settings set enabled = true where key = 'vision_required'"),
    after: () => sql("update public.app_settings set enabled = false where key = 'vision_required'") }],
  ["node", "p2b_admin.mjs"],
  ["node", "p3b_cleanup.mjs"],
  ["node", "c1_codes_price_jobs.mjs"],
  ["node", "c3_rentals.mjs", { local: true }],
];

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith("--only="))?.slice(7).split(",").filter(Boolean);
const keep = args.includes("--keep");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function functionsUp() {
  // Without the local env file, send-push refuses the local secret (401). With it, the secret is
  // accepted and the empty body gets 400, or 503 because Firebase isn't configured locally.
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-send-push-secret": "local-push-secret" },
      body: "{}",
      signal: AbortSignal.timeout(5000),
    });
    return res.status === 400 || res.status === 503;
  } catch {
    return false;
  }
}

async function startFunctions() {
  if (await functionsUp()) return null;
  const child = spawn(CLI, ["functions", "serve", "--env-file", join(REPO_ROOT, "supabase/functions/local.env")], {
    cwd: REPO_ROOT, stdio: ["ignore", "ignore", "ignore"], shell: process.platform === "win32",
  });
  for (let i = 0; i < 120; i++) {
    if (await functionsUp()) return child;
    await sleep(1000);
  }
  child.kill();
  throw new Error("supabase functions serve didn't come up");
}

async function main() {
  // A pending fetch doesn't keep Node running; this timer does, until the summary.
  const keepAlive = setInterval(() => {}, 1000);
  try {
    await runAll();
  } finally {
    clearInterval(keepAlive);
  }
}

async function runAll() {
  console.log(LIVE ? "Target: LIVE dzirent-server" : `Target: local backend ${SUPABASE_URL}`);
  let functions = null;
  if (!LIVE) {
    console.log("starting the stubs...");
    await startStubs();
    console.log("starting supabase functions serve with supabase/functions/local.env...");
    functions = await startFunctions();
    console.log("uploading seed photos...");
    const photos = await uploadSeedPhotos();
    console.log(`stubs up, functions served with supabase/functions/local.env, seed photos ${photos.uploaded} uploaded / ${photos.present} present\n`);
  }
  const results = [];
  try {
    for (const [runner, file, opts = {}] of SCRIPTS) {
      const name = file.replace(/\.(mjs|py)$/, "");
      if (only && !only.includes(name)) continue;
      if (opts.local && LIVE) continue;
      const [cmd, ...pre] = runner.split(" ");
      const started = Date.now();
      const label = [file, ...(opts.args ?? []).slice(0, 1)].join(" ");
      console.log(`=== ${label}`);
      if (opts.before) opts.before();
      const r = spawnSync(cmd, [...pre, join(HERE, file), ...(opts.args ?? []), ...(LIVE ? ["--live"] : [])], {
        cwd: REPO_ROOT,
        stdio: "inherit",
        // A script that hangs fails after 10 minutes instead of holding up the whole run.
        timeout: 10 * 60 * 1000,
        env: { ...process.env, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY: SUPABASE_KEY, ...(LIVE ? { DZIRENT_TEST_TARGET: "live" } : {}) },
        shell: process.platform === "win32" && cmd === "python",
      });
      if (opts.after) opts.after();
      results.push({ file: label, ok: r.status === 0, seconds: Math.round((Date.now() - started) / 1000) });
      const why = r.signal ? `stopped by ${r.signal}, over 10 minutes?` : `exit ${r.status}`;
      console.log(`--- ${label}: ${r.status === 0 ? "passed" : `FAILED (${why})`}\n`);
    }
  } finally {
    if (!LIVE && !keep) {
      if (functions) functions.kill();
      stopStubs();
    }
  }
  console.log("Summary:");
  for (const r of results) console.log(`  ${r.ok ? "pass" : "FAIL"}  ${r.file} (${r.seconds} s)`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`${results.length - failed} of ${results.length} passed`);
  process.exitCode = failed ? 1 : 0;
}

let finished = false;
// If the event loop empties while a step still waits (a promise that never settles), Node would
// exit 0 with nothing run. Make that a failure, so CI can't pass without running the scripts.
process.on("beforeExit", () => {
  if (!finished) {
    console.error("run-all stopped before the summary (a step never finished)");
    process.exit(1);
  }
});
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => {
    finished = true;
  });
