// C2: one config for every integration script in supabase/tests.
// LOCAL by default: the Docker backend from `supabase start` (URL and keys from `supabase status`),
// the throwaway users in supabase/tests/local.env, and SQL with `supabase db query --local`.
// LIVE (dzirent-server) only with `--live` or DZIRENT_TEST_TARGET=live, and it prints a warning.
// Load tests never run live.
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(HERE, "..", "..", "..");

export const LIVE = process.argv.includes("--live") || process.env.DZIRENT_TEST_TARGET === "live";

export function loadEnvFile(path) {
  const env = {};
  try {
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx !== -1) env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
  } catch {}
  return env;
}

const npmCli = `${process.env.APPDATA ?? ""}/npm/node_modules/supabase/node_modules/@supabase/cli-windows-x64/bin/supabase.exe`;
export const CLI = process.env.SUPABASE_CLI ?? (process.platform === "win32" && existsSync(npmCli) ? npmCli : "supabase");

function localStatus() {
  const out = execFileSync(CLI, ["status", "-o", "env"], { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const env = {};
  for (const line of out.split(/\r?\n/)) {
    const m = /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim());
    if (m) env[m[1]] = m[2];
  }
  return env;
}

let serverEnv;
let userEnv;
if (LIVE) {
  console.warn("\n*** WARNING: running against the LIVE project dzirent-server. This writes to production data. ***\n");
  serverEnv = { ...loadEnvFile("H:/DziRent/secrets/dzirent-server.env"), ...process.env };
  delete serverEnv.SUPABASE_DB_PASSWORD;
  userEnv = { ...loadEnvFile("H:/DziRent/secrets/test-user.env"), ...process.env };
} else {
  const status = localStatus();
  serverEnv = {
    ...process.env,
    SUPABASE_URL: status.API_URL,
    SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY || status.ANON_KEY,
    SUPABASE_SERVICE_KEY: status.SECRET_KEY || status.SERVICE_ROLE_KEY,
    SUPABASE_DB_URL: status.DB_URL,
  };
  userEnv = { ...loadEnvFile(join(HERE, "..", "local.env")) };
}
export { serverEnv, userEnv };

export const SUPABASE_URL = serverEnv.SUPABASE_URL?.replace(/\/$/, "");
export const SUPABASE_KEY = serverEnv.SUPABASE_PUBLISHABLE_KEY;
/** Local only: the stack's service key (never available, never used, against the live project). */
export const SERVICE_KEY = LIVE ? null : serverEnv.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(LIVE ? "Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY" : "The local backend isn't running: supabase start");
  process.exit(1);
}

/** Test setup SQL: the local database, or with --live the linked project. Returns the last statement's rows. */
export function sql(query) {
  // --output-format json: without it the CLI prints a table outside an AI agent session (as in CI).
  const out = execFileSync(CLI, ["db", "query", LIVE ? "--linked" : "--local", query, "--output-format", "json"], {
    cwd: REPO_ROOT, env: { ...process.env, ...(LIVE ? serverEnv : {}) }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });
  // In an AI agent session the CLI wraps the rows ({ boundary, rows, warning }); elsewhere (CI, a
  // person's terminal) it prints the bare array. A statement without rows may print only its
  // command tag ("DELETE 0"), which isn't JSON.
  let parsed;
  try {
    parsed = JSON.parse(out);
  } catch {
    if (/^\s*(INSERT|UPDATE|DELETE|SELECT|DO|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE)\b/m.test(out) || !out.trim()) return [];
    throw new Error(`Unexpected output from supabase db query: ${out.slice(0, 200)}`);
  }
  return Array.isArray(parsed) ? parsed : parsed.rows ?? [];
}

/** The local stub server (pushes and photo checks it handled). Local only. */
export const STUBS_URL = process.env.DZIRENT_STUBS_URL ?? "http://127.0.0.1:8787";
