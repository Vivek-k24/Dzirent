// Makes app_private.admin_users match ADMIN_EMAILS (P2B): adds every listed account, removes every
// admin that isn't listed, and writes each change to the admin log. Data, so not a migration.
// ADMIN_EMAILS (comma-separated) comes from H:/DziRent/secrets/providers.env or the environment.
// An empty list is refused, so a missing setting can't remove every admin.
// Run from the repo root with Node 18+ and the Supabase CLI linked to dzirent-server:
//   node supabase/seed/admins.mjs
// Emails are never printed; only counts are.
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

function loadEnvFile(path) {
  const env = {};
  try {
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx !== -1) env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    }
  } catch {}
  return env;
}

const env = {
  ...loadEnvFile("H:/DziRent/secrets/dzirent-server.env"),
  ...loadEnvFile("H:/DziRent/secrets/providers.env"),
  ...process.env,
};
const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
const emails = [...new Set((env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean))];

if (emails.length === 0) {
  console.error("ADMIN_EMAILS is empty or missing; nothing changed.");
  process.exit(1);
}
const bad = emails.filter((e) => !EMAIL.test(e));
if (bad.length > 0) {
  console.error(`${bad.length} entr${bad.length === 1 ? "y" : "ies"} in ADMIN_EMAILS don't look like email addresses; nothing changed.`);
  process.exit(1);
}

const list = emails.map((e) => `'${e}'`).join(", ");
const sql = `
with wanted as (select u.id from auth.users u where pg_catalog.lower(u.email) = any(array[${list}])),
added as (
  insert into app_private.admin_users (user_id, added_by)
  select w.id, 'seed script (ADMIN_EMAILS)' from wanted w
  on conflict (user_id) do nothing
  returning user_id),
removed as (
  delete from app_private.admin_users a where a.user_id not in (select w.id from wanted w)
  returning a.user_id),
log_added as (
  insert into app_private.admin_actions (admin_id, action, target_type, target_id, reason)
  select null, 'admin_added', 'user', ad.user_id::text, 'ADMIN_EMAILS seed script' from added ad
  returning 1),
log_removed as (
  insert into app_private.admin_actions (admin_id, action, target_type, target_id, reason)
  select null, 'admin_removed', 'user', r.user_id::text, 'ADMIN_EMAILS seed script' from removed r
  returning 1)
select ${emails.length} as listed,
       (select pg_catalog.count(*) from wanted) as accounts_found,
       (select pg_catalog.count(*) from added) as added,
       (select pg_catalog.count(*) from removed) as removed,
       (select pg_catalog.count(*) from log_added) + (select pg_catalog.count(*) from log_removed) as logged`;

// The CLI binary itself (no shell, so the SQL reaches it as one argument). SUPABASE_CLI overrides.
const npmCli = `${process.env.APPDATA ?? ""}/npm/node_modules/supabase/node_modules/@supabase/cli-windows-x64/bin/supabase.exe`;
const cli = env.SUPABASE_CLI ?? (process.platform === "win32" && existsSync(npmCli) ? npmCli : "supabase");
const out = execFileSync(cli, ["db", "query", "--linked", sql.replace(/\s+/g, " "), "-o", "json"], {
  env: { ...process.env, ...env },
  encoding: "utf8",
  stdio: ["ignore", "pipe", "ignore"],
});
const row = JSON.parse(out).rows?.[0] ?? {};
console.log(`Listed: ${row.listed}, accounts found: ${row.accounts_found}, added: ${row.added}, removed: ${row.removed}, logged: ${row.logged}`);
if (Number(row.accounts_found) < emails.length) {
  console.log("Some listed emails have no Dzirent account yet: sign up with them, then run this again.");
}
