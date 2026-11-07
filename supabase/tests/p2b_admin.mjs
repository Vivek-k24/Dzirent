// P2B part 1 test script: the admin backend through the API.
// 1. A non-admin (test user 3) is refused by every admin function and by the admin-actions Edge Function.
// 2. Test user 1 is made an admin (SQL, test setup only) and is still refused at aal1.
// 3. Test user 1 enrolls a TOTP factor through the Auth API and signs in at aal2. Then:
//    queues; report evidence (test user 3 reports a message with a filtered word in the details;
//    the snapshot holds the message and its context, and stays the same after the message is
//    removed); dismiss a report; suspend test user 3 (can't send a message), unsuspend; ban and
//    unban test user 3 through the Edge Function; a flag on and off; metrics; user lookup; every
//    action in the admin log; the log refuses an update.
// 4. Clean-up, also after a failure: unban, unsuspend, flags off, the factor deleted, test user 1
//    removed from admin_users.
// Test messages and reports stay (reports and their evidence are kept by design).
// Run from the repo root with Node 18+ and the Supabase CLI linked: node supabase/tests/p2b_admin.mjs
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import assert from "node:assert/strict";

function loadEnvFile(path) {
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

const serverEnv = { ...loadEnvFile("H:/DziRent/secrets/dzirent-server.env"), ...process.env };
const userEnv = { ...loadEnvFile("H:/DziRent/secrets/test-user.env"), ...process.env };
const SUPABASE_URL = serverEnv.SUPABASE_URL?.replace(/\/$/, "");
const SUPABASE_KEY = serverEnv.SUPABASE_PUBLISHABLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY");
  process.exit(1);
}
const ZERO = "00000000-0000-0000-0000-000000000000";
// A slur from the word list, kept encoded so it isn't plain text in the repo (as in the P2A test).
const SLUR = Buffer.from("dG93ZWxoZWFk", "base64").toString("utf8");

// ---- SQL through the linked CLI (test setup and clean-up only) ----
const npmCli = `${process.env.APPDATA ?? ""}/npm/node_modules/supabase/node_modules/@supabase/cli-windows-x64/bin/supabase.exe`;
const CLI = serverEnv.SUPABASE_CLI ?? (process.platform === "win32" && existsSync(npmCli) ? npmCli : "supabase");
function sql(query) {
  const out = execFileSync(CLI, ["db", "query", "--linked", query, "-o", "json"], {
    env: { ...process.env, ...serverEnv }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(out).rows ?? [];
}

// ---- TOTP (RFC 6238, SHA-1, 6 digits, 30 s) ----
function base32(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, value = 0;
  const bytes = [];
  for (const c of secret.replace(/=+$/, "").toUpperCase()) {
    value = (value << 5) | alphabet.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}
function totp(secret) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", base32(secret)).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1000000).padStart(6, "0");
}

// ---- HTTP ----
async function http(path, { method = "GET", token, body, prefer } = {}) {
  const headers = { apikey: SUPABASE_KEY };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${SUPABASE_URL}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: res.ok, status: res.status, data };
}
async function signIn(email, password) {
  const res = await http("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } });
  return res.ok ? { token: res.data.access_token, id: res.data.user.id } : { error: res };
}
const rest = (token, path, opts = {}) => http(`/rest/v1/${path}`, { token, ...opts });
async function rpc(token, name, args = {}) {
  const res = await rest(token, `rpc/${name}`, { method: "POST", body: args });
  if (!res.ok) throw new Error(`RPC ${name} failed: ${res.status} ${JSON.stringify(res.data)}`);
  return res.data;
}
const adminAction = (token, body) => http("/functions/v1/admin-actions", { method: "POST", token, body });

const ADMIN_CALLS = [
  ["admin_queues", {}],
  ["admin_list_reports", { p_status: "open" }],
  ["admin_list_scan_reviews", {}],
  ["admin_list_takedowns", {}],
  ["admin_list_id_reviews", {}],
  ["admin_dismiss_report", { p_report_id: ZERO, p_reason: "test" }],
  ["admin_warn_user", { p_user_id: ZERO, p_note: "test" }],
  ["admin_remove_reported_content", { p_report_id: ZERO, p_reason: "test" }],
  ["admin_suspend_user", { p_user_id: ZERO, p_days: 1, p_reason: "test" }],
  ["admin_unsuspend_user", { p_user_id: ZERO, p_reason: "test" }],
  ["admin_record_ban", { p_user_id: ZERO, p_banned: true, p_reason: "test" }],
  ["admin_decide_scan", { p_scan_id: ZERO, p_decision: "approved", p_reason: "test" }],
  ["admin_hide_listing", { p_listing_id: ZERO, p_reason: "test" }],
  ["admin_unhide_listing", { p_listing_id: ZERO, p_reason: "test" }],
  ["admin_create_takedown", { p_claimant_name: "x", p_claimant_contact: "x", p_work: "x" }],
  ["admin_takedown_remove_listing", { p_takedown_id: ZERO, p_listing_id: ZERO, p_reason: "test" }],
  ["admin_remove_photos", { p_listing_id: ZERO, p_photo_ids: [ZERO], p_reason: "test" }],
  ["admin_record_counter_notice", { p_takedown_id: ZERO, p_notice: "x" }],
  ["admin_set_takedown_status", { p_takedown_id: ZERO, p_status: "rejected", p_note: "test" }],
  ["set_flag", { p_key: "payments_enabled", p_enabled: true }],
  ["admin_metrics", {}],
  ["admin_find_user", { p_query: "abc" }],
  ["admin_audit_log", {}],
];

async function expectAllRefused(token, who, messagePart) {
  for (const [name, args] of ADMIN_CALLS) {
    const res = await rest(token, `rpc/${name}`, { method: "POST", body: args });
    assert.ok(!res.ok, `${who}: ${name} must be refused`);
    assert.equal(res.data?.code, "42501", `${who}: ${name} should be a permission refusal, got ${JSON.stringify(res.data)}`);
    assert.ok(String(res.data?.message).includes(messagePart), `${who}: ${name} said "${res.data?.message}"`);
  }
  assert.equal(await rpc(token, "is_admin"), false, `${who}: is_admin() must be false`);
  const edge = await adminAction(token, { action: "ban", user_id: ZERO, reason: "test" });
  assert.equal(edge.status, 403, `${who}: the admin-actions function must refuse (${edge.status})`);
  console.log(`   ${ADMIN_CALLS.length} admin functions, is_admin() and the admin-actions function: all refused`);
}

async function run() {
  const state = { admin: null, factorId: null, banned: false, suspended: false, suspended2: false, hidden: null, flagOn: false, u2: null, u3: null };
  console.log("1. Signing in test users 1 and 3...");
  const u1 = await signIn(userEnv.TEST_USER_1_EMAIL, userEnv.TEST_USER_1_PASSWORD);
  const u3 = await signIn(userEnv.TEST_USER_3_EMAIL, userEnv.TEST_USER_3_PASSWORD);
  assert.ok(u1.token && u3.token, "both test users sign in");
  state.u3 = u3;

  try {
    console.log("\n2. A non-admin is refused...");
    await expectAllRefused(u3.token, "test user 3", "Admins only");

    console.log("\n3. An admin without two-step sign-in is refused...");
    sql(`insert into app_private.admin_users (user_id, added_by) values ('${u1.id}', 'P2B API test (temporary)') on conflict do nothing`);
    await expectAllRefused(u1.token, "test user 1 at aal1", "two-step");

    console.log("\n4. Two-step sign-in (TOTP)...");
    const me = await http("/auth/v1/user", { token: u1.token });
    for (const f of me.data?.factors ?? []) {
      if (f.status !== "verified") await http(`/auth/v1/factors/${f.id}`, { method: "DELETE", token: u1.token });
    }
    assert.ok(!(me.data?.factors ?? []).some((f) => f.status === "verified"), "test user 1 must not already have a verified factor");
    const enrolled = await http("/auth/v1/factors", { method: "POST", token: u1.token, body: { factor_type: "totp", friendly_name: `p2b-test-${Date.now()}` } });
    assert.ok(enrolled.ok, `enroll: ${enrolled.status} ${JSON.stringify(enrolled.data)}`);
    state.factorId = enrolled.data.id;
    const challenge = await http(`/auth/v1/factors/${state.factorId}/challenge`, { method: "POST", token: u1.token, body: {} });
    assert.ok(challenge.ok, `challenge: ${challenge.status}`);
    const verified = await http(`/auth/v1/factors/${state.factorId}/verify`, {
      method: "POST", token: u1.token, body: { challenge_id: challenge.data.id, code: totp(enrolled.data.totp.secret) },
    });
    assert.ok(verified.ok, `verify: ${verified.status} ${JSON.stringify(verified.data)}`);
    const admin = verified.data.access_token;
    state.admin = admin;
    assert.equal(await rpc(admin, "is_admin"), true, "is_admin() at aal2");
    console.log("   factor enrolled and verified; is_admin() is true at aal2");
    const startId = (await rpc(admin, "admin_audit_log", { p_limit: 1 }))[0]?.id ?? 0;

    console.log("\n5. Queues...");
    const queues = await rpc(admin, "admin_queues");
    for (const k of ["open_reports", "scans_in_review", "open_takedowns", "id_verification_reviews"]) assert.ok(k in queues, k);
    console.log(`   ${JSON.stringify(queues)}`);

    console.log("\n6. Report evidence...");
    const listing = (await rest(u1.token, `listings?select=id,title&status=eq.active&lender_id=eq.${u1.id}&limit=1`)).data[0];
    assert.ok(listing, "test user 1 needs an active listing");
    const conversationId = await rpc(u3.token, "start_conversation", { p_listing_id: listing.id });
    const stamp = Date.now();
    const sent = await rest(u1.token, "messages", { method: "POST", body: { conversation_id: conversationId, sender_id: u1.id, body: `P2B evidence test ${stamp}` }, prefer: "return=representation" });
    assert.ok(sent.ok, `message: ${JSON.stringify(sent.data)}`);
    const reported = sent.data[0];
    const after = await rest(u3.token, "messages", { method: "POST", body: { conversation_id: conversationId, sender_id: u3.id, body: `P2B reply ${stamp}` }, prefer: "return=minimal" });
    assert.ok(after.ok, "reply");
    const report = await rest(u3.token, "reports", {
      method: "POST", prefer: "return=representation",
      body: { reporter_id: u3.id, target_type: "message", target_id: reported.id, reason: "Harassment", details: `They called me a ${SLUR}.` },
    });
    assert.ok(report.ok, `a report quoting a filtered word must be accepted: ${JSON.stringify(report.data)}`);
    const reportId = report.data[0].id;
    assert.equal(report.data[0].status, "open");
    const open = await rpc(admin, "admin_list_reports", { p_status: "open", p_limit: 100 });
    const listed = open.find((r) => r.id === reportId);
    assert.ok(listed, "the report is in the open queue");
    const evidence = listed.evidence;
    assert.equal(evidence.type, "message");
    const flagged = evidence.messages.filter((m) => m.reported);
    assert.equal(flagged.length, 1);
    assert.equal(flagged[0].body, reported.body);
    const before = evidence.messages.filter((m) => m.created_at < reported.created_at);
    const later = evidence.messages.filter((m) => m.body === `P2B reply ${stamp}`);
    assert.ok(before.length >= 1 && before.length <= 5, `context before: ${before.length}`);
    assert.equal(later.length, 1, "context after holds the reply");
    assert.equal(listed.target_user_id, u1.id);
    console.log(`   report accepted with a filtered word in the details; evidence: ${evidence.messages.length} messages (${before.length} before, the reported one, ${evidence.messages.length - before.length - 1} after)`);

    const removed = await rpc(admin, "admin_remove_reported_content", { p_report_id: reportId, p_reason: "P2B test: remove the reported message" });
    assert.equal(removed.message_deleted, true);
    const gone = await rest(u3.token, `messages?select=id&id=eq.${reported.id}`);
    assert.equal(gone.data.length, 0, "the message is deleted");
    const closed = (await rpc(admin, "admin_list_reports", { p_status: "closed", p_limit: 100 })).find((r) => r.id === reportId);
    assert.equal(closed.outcome, "content_removed");
    assert.deepEqual(closed.evidence, evidence, "the evidence must not change when the message is deleted");
    console.log("   remove content: message deleted, report closed (content_removed), evidence unchanged");

    console.log("\n7. Dismiss a report (listing evidence)...");
    const listingReport = await rest(u3.token, "reports", {
      method: "POST", prefer: "return=representation",
      body: { reporter_id: u3.id, target_type: "listing", target_id: listing.id, reason: "Other", details: "P2B test report" },
    });
    assert.ok(listingReport.ok, JSON.stringify(listingReport.data));
    const lr = (await rpc(admin, "admin_list_reports", { p_status: "open", p_limit: 100 })).find((r) => r.id === listingReport.data[0].id);
    assert.equal(lr.evidence.title, listing.title);
    const dismissed = await rpc(admin, "admin_dismiss_report", { p_report_id: lr.id, p_reason: "P2B test: nothing wrong" });
    assert.equal(dismissed.outcome, "dismissed");
    console.log(`   listing evidence holds the title and ${lr.evidence.photos.length} photo paths; report dismissed`);

    console.log("\n8. Suspend test user 3 for 1 day...");
    const activeBefore = (await rest(u3.token, `listings?select=id&status=eq.active&lender_id=eq.${u3.id}`)).data.length;
    const suspended = await rpc(admin, "admin_suspend_user", { p_user_id: u3.id, p_days: 1, p_reason: "P2B test suspension" });
    state.suspended = true;
    assert.ok(suspended.suspended_until, "suspended_until set");
    const blocked = await rest(u3.token, "messages", { method: "POST", body: { conversation_id: conversationId, sender_id: u3.id, body: "P2B while suspended" } });
    assert.ok(!blocked.ok, "a suspended user can't send a message");
    assert.ok(String(blocked.data?.message).startsWith("Your account is suspended until"), blocked.data?.message);
    const blockedReport = await rest(u3.token, "reports", { method: "POST", body: { reporter_id: u3.id, target_type: "listing", target_id: listing.id, reason: "Other" } });
    assert.ok(!blockedReport.ok, "a suspended user can't report");
    const activeDuring = (await rest(u3.token, `listings?select=id&status=eq.active&lender_id=eq.${u3.id}`)).data.length;
    assert.equal(activeDuring, 0, "a suspended user's listings are not active");
    console.log(`   message refused ("${blocked.data.message}"); report refused; active listings ${activeBefore} -> ${activeDuring}`);

    await rpc(admin, "admin_unsuspend_user", { p_user_id: u3.id, p_reason: "P2B test: lift the suspension" });
    state.suspended = false;
    const activeAfter = (await rest(u3.token, `listings?select=id&status=eq.active&lender_id=eq.${u3.id}`)).data.length;
    assert.equal(activeAfter, activeBefore, "unsuspending restores the active listings");
    const allowed = await rest(u3.token, "messages", { method: "POST", body: { conversation_id: conversationId, sender_id: u3.id, body: `P2B after unsuspend ${stamp}` } });
    assert.ok(allowed.ok, "after unsuspend the user can send");
    console.log(`   unsuspended: active listings back to ${activeAfter}, sending works`);

    console.log("\n8b. Listing holds: hide and unhide, and a lender with active listings suspended...");
    const hidden = await rpc(admin, "admin_hide_listing", { p_listing_id: listing.id, p_reason: "P2B test hide" });
    state.hidden = listing.id;
    assert.equal(hidden.hold, "hidden");
    assert.equal(hidden.status, "paused");
    assert.equal((await rpc(null, "get_listing", { p_listing_id: listing.id })).length, 0, "guests can't see a hidden listing");
    const republish = await rest(u1.token, `listings?id=eq.${listing.id}`, { method: "PATCH", body: { status: "active" } });
    assert.ok(!republish.ok, "the owner can't republish a hidden listing");
    assert.ok(String(republish.data?.message).startsWith("This listing is hidden by Dzirent"), republish.data?.message);
    const reasonShown = (await rest(u1.token, `listings?select=auto_paused_reason&id=eq.${listing.id}`)).data[0].auto_paused_reason;
    const unhidden = await rpc(admin, "admin_unhide_listing", { p_listing_id: listing.id, p_reason: "P2B test unhide" });
    state.hidden = null;
    assert.equal(unhidden.status, "active");
    assert.equal(unhidden.hold, null);
    assert.equal((await rpc(null, "get_listing", { p_listing_id: listing.id })).length, 1, "guests see it again");
    console.log(`   hidden: guests can't see it, republish refused ("${republish.data.message}"), owner sees "${reasonShown}"; unhidden: active again`);

    const u2 = await signIn(userEnv.TEST_USER_2_EMAIL, userEnv.TEST_USER_2_PASSWORD);
    assert.ok(u2.token, "test user 2 signs in");
    state.u2 = u2;
    const u2Active = async () => (await rest(u2.token, `listings?select=id&status=eq.active&lender_id=eq.${u2.id}`)).data.length;
    const u2Before = await u2Active();
    assert.ok(u2Before > 0, "test user 2 needs active listings");
    await rpc(admin, "admin_suspend_user", { p_user_id: u2.id, p_days: 1, p_reason: "P2B test: listing holds" });
    state.suspended2 = true;
    const u2During = await u2Active();
    const held = (await rest(u2.token, `listings?select=hold,auto_paused_reason&lender_id=eq.${u2.id}&hold=eq.suspended`)).data;
    assert.equal(u2During, 0, "a suspended lender's listings are not active");
    assert.equal(held.length, u2Before, "each of them is held");
    assert.ok(held.every((l) => l.auto_paused_reason === "Paused while your account is suspended."));
    await rpc(admin, "admin_unsuspend_user", { p_user_id: u2.id, p_reason: "P2B test: lift the listing holds" });
    state.suspended2 = false;
    assert.equal(await u2Active(), u2Before, "unsuspending restores every held listing");
    console.log(`   test user 2 suspended: active listings ${u2Before} -> ${u2During} (held, with the reason shown); unsuspended: ${u2Before} again`);

    console.log("\n9. Ban and unban test user 3 (Edge Function)...");
    const ban = await adminAction(admin, { action: "ban", user_id: u3.id, reason: "P2B test ban" });
    assert.equal(ban.status, 200, JSON.stringify(ban.data));
    state.banned = true;
    const bannedSignIn = await signIn(userEnv.TEST_USER_3_EMAIL, userEnv.TEST_USER_3_PASSWORD);
    assert.ok(bannedSignIn.error, "a banned user can't sign in");
    const unban = await adminAction(admin, { action: "unban", user_id: u3.id, reason: "P2B test: lift the ban" });
    assert.equal(unban.status, 200, JSON.stringify(unban.data));
    state.banned = false;
    const backIn = await signIn(userEnv.TEST_USER_3_EMAIL, userEnv.TEST_USER_3_PASSWORD);
    assert.ok(backIn.token, "after unban the user can sign in");
    console.log(`   banned: sign-in refused (${bannedSignIn.error.status}); unbanned: sign-in works`);

    console.log("\n10. A flag on and off...");
    await rpc(admin, "set_flag", { p_key: "payments_enabled", p_enabled: true });
    state.flagOn = true;
    let flag = (await rest(null, "app_settings?select=enabled&key=eq.payments_enabled")).data[0];
    assert.equal(flag.enabled, true);
    await rpc(admin, "set_flag", { p_key: "payments_enabled", p_enabled: false });
    state.flagOn = false;
    flag = (await rest(null, "app_settings?select=enabled&key=eq.payments_enabled")).data[0];
    assert.equal(flag.enabled, false);
    console.log("   payments_enabled on, then off");

    console.log("\n11. Metrics and user lookup...");
    const metrics = await rpc(admin, "admin_metrics");
    for (const k of ["users", "new_users_week", "active_listings", "scans_week", "open_reports", "messages_week"]) assert.ok(k in metrics, k);
    const handle = (await rest(u3.token, `profiles?select=studio_handle&id=eq.${u3.id}`)).data[0]?.studio_handle;
    const found = await rpc(admin, "admin_find_user", { p_query: handle ? `@${handle}` : u3.id });
    assert.equal(found.length, 1);
    assert.equal(found[0].id, u3.id);
    assert.equal(found[0].suspended_until, null);
    // P2C: the latest age check and the block are part of the lookup.
    assert.ok("age_check" in found[0], "lookup has age_check");
    assert.equal(found[0].age_blocked, false, "test user 3 is not age-blocked");
    console.log(`   metrics: users ${metrics.users}, active listings ${metrics.active_listings}, open reports ${metrics.open_reports}; lookup found test user 3 (${found[0].reports_made} reports made, age check ${JSON.stringify(found[0].age_check)})`);

    console.log("\n12. The admin log...");
    const log = (await rpc(admin, "admin_audit_log", { p_limit: 200 })).filter((r) => r.id > startId && r.admin_id === u1.id);
    const actions = new Set(log.map((r) => r.action));
    const expected = ["view_queues", "view_reports", "remove_reported_content", "dismiss_report", "suspend_user", "unsuspend_user",
      "hide_listing", "unhide_listing", "ban_user", "unban_user", "set_flag", "view_metrics", "find_user"];
    for (const a of expected) assert.ok(actions.has(a), `admin log has ${a}`);
    assert.equal(log.filter((r) => r.action === "set_flag").length, 2);
    let appendOnly = false;
    try {
      sql(`update app_private.admin_actions set reason = 'changed' where id = ${log[0].id}`);
    } catch {
      appendOnly = true;
    }
    assert.ok(appendOnly, "the admin log must refuse an update");
    console.log(`   ${log.length} rows by test user 1 in this run, every action logged; an update is refused`);

    console.log("\nAll P2B part 1 checks PASSED!");
  } finally {
    console.log("\nClean-up...");
    if (state.admin) {
      if (state.banned) await adminAction(state.admin, { action: "unban", user_id: state.u3.id, reason: "P2B test clean-up" });
      if (state.suspended) await rest(state.admin, "rpc/admin_unsuspend_user", { method: "POST", body: { p_user_id: state.u3.id, p_reason: "P2B test clean-up" } });
      if (state.suspended2) await rest(state.admin, "rpc/admin_unsuspend_user", { method: "POST", body: { p_user_id: state.u2.id, p_reason: "P2B test clean-up" } });
      if (state.hidden) await rest(state.admin, "rpc/admin_unhide_listing", { method: "POST", body: { p_listing_id: state.hidden, p_reason: "P2B test clean-up" } });
      if (state.flagOn) await rest(state.admin, "rpc/set_flag", { method: "POST", body: { p_key: "payments_enabled", p_enabled: false } });
      if (state.factorId) {
        const del = await http(`/auth/v1/factors/${state.factorId}`, { method: "DELETE", token: state.admin });
        console.log(`   TOTP factor deleted: ${del.ok}`);
      }
    }
    sql(`delete from app_private.admin_users where user_id = '${u1.id}'`);
    const left = sql(`select (select count(*) from app_private.admin_users where user_id = '${u1.id}') as admin_rows, (select count(*) from public.app_settings where enabled) as flags_on, (select count(*) from auth.mfa_factors where user_id = '${u1.id}') as factors, (select coalesce(suspended_until::text, 'none') from public.profiles where id = '${state.u3.id}') as u3_suspended, (select coalesce(banned_until::text, 'none') from auth.users where id = '${state.u3.id}') as u3_banned`)[0];
    console.log(`   test user 1 admin rows: ${left.admin_rows}, factors: ${left.factors}; flags on: ${left.flags_on}; test user 3 suspended: ${left.u3_suspended}, banned: ${left.u3_banned}`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
