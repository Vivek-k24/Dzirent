// C1 test script: error codes, price per day, and the background job outbox, against dzirent-server.
// 1. Known refusals return their DZ-E code with the field in the hint (database), and an Edge
//    Function answers { code, message } with the catalog status. No rows are written.
// 2. browse_listings and get_listing with dates return price_per_day, days and total
//    (a month and year boundary, and a single day); without dates days and total are null.
// 3. A send_push job that send-push refuses (a payload without its required fields, HTTP 400) is
//    tried again on schedule (1, 5, 30, 120 minutes; the waits are checked, then skipped by
//    setting next_attempt_at, SQL test setup only) and is dead after 5 attempts.
// 4. Test user 1 is made an admin (SQL, test setup only), signs in with a TOTP factor (aal2) and
//    sees the job in admin_jobs_status and admin_list_dead_jobs, then admin_retry_job starts it
//    again (attempt 1) and the admin log has the retry. A non-admin is refused with DZ-E5001.
// 5. Clean-up, also after a failure: the test job deleted, the factor deleted, test user 1 removed
//    from admin_users. Admin log rows stay (the log is append-only by design).
// Run from the repo root with Node 18+ and the Supabase CLI linked: node supabase/tests/c1_codes_price_jobs.mjs

import { createHmac } from "node:crypto";
import assert from "node:assert/strict";
import { userEnv, SUPABASE_URL, SUPABASE_KEY, sql, CLI } from "./lib/config.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- TOTP (RFC 6238, SHA-1, 6 digits, 30 s), as in the P2B test ----
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
async function http(path, { method = "GET", token, body } = {}) {
  const headers = { apikey: SUPABASE_KEY };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
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
  assert.ok(res.ok, `sign in: ${res.status}`);
  return { token: res.data.access_token, id: res.data.user.id };
}
const rpcRaw = (token, name, args = {}) => http(`/rest/v1/rpc/${name}`, { method: "POST", token, body: args });
async function rpc(token, name, args = {}) {
  const res = await rpcRaw(token, name, args);
  if (!res.ok) throw new Error(`RPC ${name} failed: ${res.status} ${JSON.stringify(res.data)}`);
  return res.data;
}

const BACKOFF_MINUTES = [1, 5, 30, 120];

function jobRow(id) {
  return sql(`select status, attempts, last_error, request_id is not null as has_request,
    round(extract(epoch from (next_attempt_at - updated_at)) / 60.0, 3) as wait_minutes
    from app_private.async_jobs where id = ${id}`)[0];
}

/** Waits for the current attempt's answer, running the worker (what pg_cron runs every minute). */
async function settle(id) {
  for (let i = 0; i < 20; i++) {
    sql("select app_private.run_async_jobs()");
    const row = jobRow(id);
    if (row.status !== "running") return row;
    await sleep(3000);
  }
  throw new Error(`job ${id} is still running after a minute`);
}

async function run() {
  const state = { jobId: null, factorId: null, admin: null, u1: null };
  try {
    console.log("1. Refusals carry their codes...");
    const guestCheck = await rpc(null, "check_text", { p_text: "Call me at 512-555-0123", p_where: "listing" });
    assert.ok(String(guestCheck).startsWith("DZ-E2050: Please remove contact details from your listing"), `check_text: ${guestCheck}`);
    const u1 = await signIn(userEnv.TEST_USER_1_EMAIL, userEnv.TEST_USER_1_PASSWORD);
    const u3 = await signIn(userEnv.TEST_USER_3_EMAIL, userEnv.TEST_USER_3_PASSWORD);
    state.u1 = u1;
    const name = await rpcRaw(u1.token, "record_accessory_declaration", { p_full_legal_name: " ", p_declaration_version: 1, p_app_version: "c1-test" });
    assert.equal(name.status, 400);
    assert.equal(name.data?.message, "DZ-E2041: Type your full legal name");
    assert.equal(name.data?.hint, "full_legal_name");
    const dates = await rpcRaw(u1.token, "set_conversation_dates", { p_conversation_id: "00000000-0000-0000-0000-000000000000", p_start: "2026-12-05", p_end: "2026-12-01" });
    assert.ok(String(dates.data?.message).startsWith("DZ-E3006: Invalid dates"), `dates: ${JSON.stringify(dates.data)}`);
    assert.equal(dates.data?.hint, "dates");
    const notAdmin = await rpcRaw(u3.token, "admin_retry_job", { p_job_id: 1 });
    assert.equal(notAdmin.data?.message, "DZ-E5001: Admins only");
    const edge = await http("/functions/v1/delete-listing", { method: "POST", token: u1.token, body: { bogus: 1 } });
    assert.equal(edge.status, 400);
    assert.deepEqual(edge.data, { code: "DZ-E9011", message: "This request has fields that aren't accepted." });
    const noAuth = await http("/functions/v1/export-my-data", { method: "POST", body: {} });
    assert.equal(noAuth.status, 401);
    assert.equal(noAuth.data?.code, "DZ-E1003");
    console.log("   check_text DZ-E2050; DZ-E2041 hint full_legal_name; DZ-E3006 hint dates; DZ-E5001; delete-listing 400 DZ-E9011; export-my-data 401 DZ-E1003");

    console.log("\n2. Price per day, days and total...");
    const cards = await rpc(null, "browse_listings", { p_start_date: "2026-12-30", p_end_date: "2027-01-02", p_limit: 3 });
    assert.ok(cards.length > 0, "browse_listings returns cards for the dates");
    for (const c of cards) {
      assert.equal(c.price_per_day, c.price);
      assert.equal(c.price_unit, "per_day");
      assert.equal(c.days, 4, "Dec 30 - Jan 2 is 4 days");
      assert.equal(Number(c.total), Number(c.price) * 4);
    }
    const id = cards[0].id;
    const one = (await rpc(null, "get_listing", { p_listing_id: id, p_start_date: "2026-11-20", p_end_date: "2026-11-20" }))[0];
    assert.equal(one.days, 1);
    assert.equal(Number(one.total), Number(one.price_per_day));
    const five = (await rpc(null, "get_listing", { p_listing_id: id, p_start_date: "2027-02-26", p_end_date: "2027-03-02" }))[0];
    assert.equal(five.days, 5, "Feb 26 - Mar 2, 2027 is 5 days");
    assert.equal(Number(five.total), Number(five.price_per_day) * 5);
    const none = (await rpc(null, "get_listing", { p_listing_id: id }))[0];
    assert.equal(none.days, null);
    assert.equal(none.total, null);
    console.log(`   ${cards.length} cards: days 4, total = price x 4; one listing: 1 day, 5 days across Feb/Mar, none without dates (price ${one.price_per_day}/day)`);

    console.log("\n3. A failing push job is retried on schedule, then dead...");
    state.jobId = sql(`select app_private.enqueue_job('send_push', '{"kind":"message","c1_test":true}'::jsonb) as id`)[0].id;
    console.log(`   job ${state.jobId} added (send-push refuses it: required fields missing)`);
    for (let attempt = 1; attempt <= 5; attempt++) {
      const row = await settle(state.jobId);
      assert.equal(row.attempts, attempt, `attempts after attempt ${attempt}`);
      assert.equal(row.last_error, "HTTP 400");
      if (attempt < 5) {
        assert.equal(row.status, "pending");
        assert.equal(Number(row.wait_minutes), BACKOFF_MINUTES[attempt - 1], `wait after attempt ${attempt}`);
        console.log(`   attempt ${attempt}: HTTP 400, next in ${row.wait_minutes} min`);
        sql(`update app_private.async_jobs set next_attempt_at = now() where id = ${state.jobId}`);
        sql("select app_private.run_async_jobs()");
      } else {
        assert.equal(row.status, "dead");
        console.log(`   attempt 5: HTTP 400, dead`);
      }
    }

    console.log("\n4. Admin: status, dead list, Retry...");
    sql(`insert into app_private.admin_users (user_id, added_by) values ('${u1.id}', 'C1 API test (temporary)') on conflict do nothing`);
    const me = await http("/auth/v1/user", { token: u1.token });
    for (const f of me.data?.factors ?? []) {
      if (f.status !== "verified") await http(`/auth/v1/factors/${f.id}`, { method: "DELETE", token: u1.token });
    }
    assert.ok(!(me.data?.factors ?? []).some((f) => f.status === "verified"), "test user 1 must not already have a verified factor");
    const enrolled = await http("/auth/v1/factors", { method: "POST", token: u1.token, body: { factor_type: "totp", friendly_name: `c1-test-${Date.now()}` } });
    assert.ok(enrolled.ok, `enroll: ${enrolled.status}`);
    state.factorId = enrolled.data.id;
    const challenge = await http(`/auth/v1/factors/${state.factorId}/challenge`, { method: "POST", token: u1.token, body: {} });
    const verified = await http(`/auth/v1/factors/${state.factorId}/verify`, {
      method: "POST", token: u1.token, body: { challenge_id: challenge.data.id, code: totp(enrolled.data.totp.secret) },
    });
    assert.ok(verified.ok, `verify: ${verified.status}`);
    state.admin = verified.data.access_token;
    const status = await rpc(state.admin, "admin_jobs_status");
    const push = status.kinds.find((k) => k.kind === "send_push");
    assert.ok(push.dead >= 1, "admin_jobs_status counts the dead push job");
    const deadList = await rpc(state.admin, "admin_list_dead_jobs", { p_limit: 50 });
    const listed = deadList.find((j) => j.id === state.jobId);
    assert.ok(listed, "the job is in the dead list");
    assert.equal(listed.attempts, 5);
    assert.ok(!("payload" in listed) && !("title" in listed), "no push text in the dead list");
    const retried = await rpc(state.admin, "admin_retry_job", { p_job_id: state.jobId, p_reason: "C1 test" });
    assert.equal(retried.attempts, 1);
    assert.equal(retried.status, "running");
    const again = await rpcRaw(state.admin, "admin_retry_job", { p_job_id: state.jobId });
    assert.equal(again.data?.message, "DZ-E5061: Only a dead background job can be retried");
    const after = await settle(state.jobId);
    assert.equal(after.status, "pending");
    assert.equal(after.attempts, 1);
    const log = await rpc(state.admin, "admin_audit_log", { p_limit: 20 });
    assert.ok(log.some((r) => r.action === "retry_background_job" && String(r.target_id) === String(state.jobId)), "the retry is in the admin log");
    console.log(`   send_push dead ${push.dead}; job ${state.jobId} listed (5 attempts); Retry -> attempt 1 running, then pending after HTTP 400; a second Retry refused DZ-E5061; logged`);
  } finally {
    console.log("\n5. Clean-up...");
    if (state.jobId) sql(`delete from app_private.async_jobs where id = ${state.jobId}`);
    if (state.factorId && state.admin) {
      const del = await http(`/auth/v1/factors/${state.factorId}`, { method: "DELETE", token: state.admin });
      if (!del.ok) console.log(`   factor delete: ${del.status}`);
    }
    if (state.u1) sql(`delete from app_private.admin_users where user_id = '${state.u1.id}'`);
    if (state.u1) {
      const left = sql(`select (select count(*) from app_private.admin_users where user_id = '${state.u1.id}') as admin_rows,
        (select count(*) from auth.mfa_factors where user_id = '${state.u1.id}') as factors,
        (select count(*) from app_private.async_jobs where payload ? 'c1_test') as test_jobs`)[0];
      console.log(`   test user 1 admin rows: ${left.admin_rows}, factors: ${left.factors}; test jobs left: ${left.test_jobs}`);
    }
  }
}

run().then(() => console.log("\nC1 API test passed.")).catch((e) => {
  console.error("\nC1 API test FAILED:", e.message);
  process.exitCode = 1;
});
