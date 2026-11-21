#!/usr/bin/env node
// E1: puts the repo's sign-in emails on the live project's Auth, and nothing else, through the
// Management API (PATCH /v1/projects/{ref}/config/auth with only the keys below).
// `supabase config push` can't do this safely: it pushes the whole [auth] section of config.toml,
// whose values are the local stack's (site_url 127.0.0.1, its redirect list, its rate limits).
//
//   node supabase/scripts/push_auth_emails.mjs                 dry run: what would change (default)
//   node supabase/scripts/push_auth_emails.mjs --apply         send it, then read it back and compare
//   --confirm-email-on                also turn "Confirm email" on (mailer_autoconfirm = false)
//   --add-redirect=<url>              also add one address to the redirect allow list (kept as is otherwise)
//
// What it sends: for confirmation, recovery, magic_link, email_change and invite, the subject from
// supabase/config.toml ([auth.email.template.<name>] subject) and the HTML from
// supabase/templates/<name>.html. The access token comes from H:\DziRent\secrets\dzirent-server.env
// (SUPABASE_ACCESS_TOKEN) or the environment; it is never printed. Prints key names, lengths and
// SHA-256 prefixes only.
//
// Fallback without the API: Supabase dashboard > Authentication > Emails > Templates: for each of
// the five, paste the subject and the whole HTML file; Authentication > Sign In / Providers > Email:
// "Confirm email" on; URL Configuration: add the redirect.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REF = process.env.SUPABASE_PROJECT_REF ?? "pwfzkyjeivadbtkfkdxr";
const TEMPLATES = ["confirmation", "recovery", "magic_link", "email_change", "invite"];
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const confirmOn = args.includes("--confirm-email-on");
const addRedirect = args.find((a) => a.startsWith("--add-redirect="))?.slice("--add-redirect=".length);

function token() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  const file = "H:/DziRent/secrets/dzirent-server.env";
  if (!existsSync(file)) throw new Error("No SUPABASE_ACCESS_TOKEN (environment or dzirent-server.env)");
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*SUPABASE_ACCESS_TOKEN\s*=\s*"?([^"\s]+)"?\s*$/.exec(line);
    if (m) return m[1];
  }
  throw new Error("SUPABASE_ACCESS_TOKEN is not in dzirent-server.env");
}

/** [auth.email.template.<name>] subject = "..." from config.toml. */
function subjects() {
  const toml = readFileSync(join(ROOT, "supabase", "config.toml"), "utf8");
  const out = {};
  for (const name of TEMPLATES) {
    const section = new RegExp(`^\\[auth\\.email\\.template\\.${name}\\]\\s*$([\\s\\S]*?)(?=^\\[|(?![\\s\\S]))`, "m").exec(toml)?.[1] ?? "";
    const subject = /^subject\s*=\s*"((?:[^"\\]|\\.)*)"\s*$/m.exec(section)?.[1];
    if (!subject) throw new Error(`config.toml has no subject for ${name}`);
    out[name] = JSON.parse(`"${subject}"`);
  }
  return out;
}

const sha = (s) => createHash("sha256").update(String(s ?? "")).digest("hex").slice(0, 12);
const api = async (method, body) => {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/config/auth`, {
    method,
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Management API ${method}: HTTP ${res.status}`);
  return res.json();
};

const wanted = {};
const subjectOf = subjects();
for (const name of TEMPLATES) {
  wanted[`mailer_subjects_${name}`] = subjectOf[name];
  wanted[`mailer_templates_${name}_content`] = readFileSync(join(ROOT, "supabase", "templates", `${name}.html`), "utf8");
}
if (confirmOn) wanted.mailer_autoconfirm = false;

const live = await api("GET");
if (addRedirect) {
  const list = String(live.uri_allow_list ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!list.includes(addRedirect)) wanted.uri_allow_list = [...list, addRedirect].join(",");
}
const changes = Object.fromEntries(Object.entries(wanted).filter(([k, v]) => live[k] !== v));
for (const [k, v] of Object.entries(wanted)) {
  const show = (x) => (typeof x === "string" && k.endsWith("_content") ? `${x.length} chars, ${sha(x)}` : JSON.stringify(x));
  console.log(`${k in changes ? "change" : "same  "}  ${k}: ${k in changes ? `${show(live[k])} -> ` : ""}${show(v)}`);
}
if (!Object.keys(changes).length) {
  console.log("Nothing to change.");
} else if (!apply) {
  console.log(`\nDry run: ${Object.keys(changes).length} key(s) would change. Add --apply to send them.`);
} else {
  await api("PATCH", changes);
  const after = await api("GET");
  const wrong = Object.keys(changes).filter((k) => after[k] !== changes[k]);
  if (wrong.length) throw new Error(`Read back differs for: ${wrong.join(", ")}`);
  console.log(`\nApplied ${Object.keys(changes).length} key(s); read back and identical.`);
}
