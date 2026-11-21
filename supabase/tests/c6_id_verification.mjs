// C6 integration: ID verification (local backend only; never Didit itself).
//   node supabase/tests/c6_id_verification.mjs off   functions served with supabase/functions/local.env
//                                                    (the Didit keys blank)
//   node supabase/tests/c6_id_verification.mjs on    functions served with local.didit-stub.env (the
//                                                    stub in supabase/tests/stubs/server.mjs, /didit/...)
// off: every Didit function answers "ID verification isn't available yet."; Settings sees "not started".
// on:  start (session at the stub with our account id, the workflow from the settings and an
//      allow-listed return address); the owner reads the status but not the legal name; a bad
//      signature, a stale timestamp and another application refused and not recorded; a signed
//      Approved event -> verified through the outbox (didit-sync), the badge in the shop window,
//      an 18+ age check from the ID; the same event id again processed once; Declined; a duplicate
//      face -> review, then an admin approves (logged) and resets attempts (logged); the gate refuses
//      an unverified person only while verification_required is on; reconciliation applies a
//      decision without a webhook; Kyc Expired removes the badge; delete-account removes the
//      person's sessions and user record at the stub, then the rows.
// Prints only statuses, codes and counts: never keys, tokens, names or emails.
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { LIVE, SERVICE_KEY, STUBS_URL, SUPABASE_KEY, SUPABASE_URL, sql, userEnv } from "./lib/config.mjs";
import { adminSession, call, fn, fnRaw, rest, rpc, signIn, waitFor } from "./lib/c4.mjs";

if (LIVE) {
  console.error("c6_id_verification runs only against the local backend.");
  process.exit(1);
}
const MODE = process.argv[2];
if (MODE !== "off" && MODE !== "on") {
  console.error("usage: node supabase/tests/c6_id_verification.mjs off|on");
  process.exit(2);
}

const WEBHOOK_SECRET = "local-didit-webhook-secret";
const NOT_AVAILABLE = { code: "DZ-E6002", message: "ID verification isn't available yet." };
const setting = (key) => sql(`select value #>> '{}' as v from app_private.settings where key = '${key}'`)[0].v;
const now = () => Math.floor(Date.now() / 1000);

/** A Didit-style event and its X-Signature (hex HMAC-SHA256 of the exact body bytes). */
function signedEvent(fields, secret = WEBHOOK_SECRET) {
  const body = JSON.stringify({
    event_id: randomUUID(), webhook_type: "status.updated", timestamp: now(), created_at: now(),
    application_id: setting("didit_application_id"), environment: "live", workflow_id: setting("didit_workflow_id"),
    metadata: null, ...fields,
  });
  return { body, signature: createHmac("sha256", secret).update(body).digest("hex") };
}
const postEvent = (e) => fnRaw("didit-webhook", e.body, { "X-Signature": e.signature });
const control = async (sessionId, decision) => {
  const res = await fetch(`${STUBS_URL}/didit/_control/session/${sessionId}`, {
    method: decision ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: decision ? JSON.stringify(decision) : undefined,
  });
  assert.ok(res.ok, `stub control ${res.status}`);
  return res.json();
};
const diditLog = async () => ((await (await fetch(`${STUBS_URL}/log`)).json()).didit ?? []);
const status = async (u) => (await rpc(u.token, "my_verification")).status;
const sessionOf = (u) => sql(`select provider_session_id as s from public.identity_verifications where user_id = '${u.id}'`)[0]?.s;
const eventsCount = () => Number(sql("select count(*) as n from app_private.didit_events")[0].n);

function resetPeople(ids) {
  const list = ids.map((id) => `'${id}'`).join(",");
  sql(`delete from app_private.didit_sessions where user_id in (${list})`);
  sql(`delete from public.identity_verifications where user_id in (${list})`);
  sql(`delete from public.age_checks where source = 'id_verification' and user_id in (${list})`);
  sql("update public.app_settings set enabled = false where key = 'verification_required'");
}

async function off(u1) {
  console.log("1. Keys blank: every Didit function answers \"ID verification isn't available yet.\"");
  const check = await fn("didit-start", { token: u1.token, body: { action: "check" } });
  assert.equal(check.status, 200, `check: ${check.status}`);
  assert.equal(check.data.available, false, "not available while the keys are blank");
  const start = await fn("didit-start", { token: u1.token });
  assert.equal(start.status, 503);
  assert.deepEqual(start.data, NOT_AVAILABLE);
  const hook = await postEvent(signedEvent({ session_id: randomUUID(), status: "Approved", vendor_data: u1.id }));
  assert.equal(hook.status, 503);
  assert.deepEqual(hook.data, NOT_AVAILABLE);
  const sync = await fn("didit-sync", { body: { session_id: randomUUID() }, headers: { "x-didit-job-secret": "local-didit-secret" } });
  assert.equal(sync.status, 503);
  assert.deepEqual(sync.data, NOT_AVAILABLE);
  const unsigned = await fn("didit-sync", { body: { session_id: randomUUID() } });
  assert.equal(unsigned.status, 401, "didit-sync without the outbox secret");
  const noToken = await fn("didit-start", { body: { action: "check" } });
  assert.equal(noToken.status, 401, "didit-start needs a signed-in person");
  console.log(`   check available=false; start, webhook, sync 503 ${NOT_AVAILABLE.code}; sync without the secret 401; start without a token 401`);

  console.log("\n2. Settings > Verification without keys");
  const mine = await rpc(u1.token, "my_verification");
  assert.equal(mine.status, "not_started");
  assert.equal(mine.required, false, "verification_required is off");
  assert.equal(mine.max_attempts, Number(setting("id_verification_max_attempts")));
  console.log(`   my_verification: ${mine.status}, ${mine.attempts_left} of ${mine.max_attempts} checks left, required ${mine.required}`);
}

async function start(u, returnUrl) {
  const res = await fn("didit-start", { token: u.token, body: returnUrl ? { return_url: returnUrl } : {} });
  assert.equal(res.status, 200, `start: ${res.status} ${JSON.stringify(res.data)}`);
  assert.match(res.data.url, /^https:\/\//);
  assert.ok(typeof res.data.session_token === "string" && res.data.session_token.length > 0, "a session token");
  return sessionOf(u);
}

async function on(u1, u2, u3) {
  resetPeople([u1.id, u2.id, u3.id]);
  await fetch(`${STUBS_URL}/log`, { method: "DELETE" });

  console.log("1. Start");
  const check = await fn("didit-start", { token: u1.token, body: { action: "check" } });
  assert.equal(check.data.available, true, "available with the keys set");
  const s1 = await start(u1, "https://dzirent.vercel.app/verify/done");
  const seen = await control(s1);
  assert.equal(seen.vendor_data, u1.id, "our account id is the vendor data");
  assert.equal(seen.workflow_id, setting("didit_workflow_id"), "the workflow from the settings");
  assert.equal(seen.callback, "https://dzirent.vercel.app/verify/done", "the preview site's return address");
  const mine = await rpc(u1.token, "my_verification");
  assert.deepEqual([mine.status, mine.attempts], ["in_progress", 1]);
  const s3 = await start(u3, "https://evil.example/verify/done");
  assert.equal((await control(s3)).callback, "https://dzirent.com/verify/done", "an address off the allow-list falls back to dzirent.com");
  console.log(`   2 sessions at the stub; vendor data, workflow and return addresses as expected; status in_progress, attempts 1`);

  console.log("\n2. What the owner can read");
  const own = await rest(u1.token, `identity_verifications?select=status&user_id=eq.${u1.id}`);
  assert.equal(own.status, 200);
  assert.deepEqual(own.data, [{ status: "in_progress" }]);
  const name = await rest(u1.token, `identity_verifications?select=legal_name&user_id=eq.${u1.id}`);
  assert.ok(name.status === 401 || name.status === 403, `the legal name isn't readable: ${name.status}`);
  const other = await rest(u3.token, `identity_verifications?select=status&user_id=eq.${u1.id}`);
  assert.deepEqual(other.data, [], "another person's row isn't readable");
  console.log(`   status readable (200), legal name refused (${name.status}), another person's row empty`);

  console.log("\n3. Refused events change nothing");
  const before = eventsCount();
  const forged = signedEvent({ session_id: s1, status: "Approved", vendor_data: u1.id }, "not-the-secret");
  assert.equal((await postEvent(forged)).data?.code, "DZ-E6007", "a bad signature");
  const badHex = signedEvent({ session_id: s1, status: "Approved", vendor_data: u1.id });
  assert.equal((await postEvent({ ...badHex, signature: "abc" })).status, 401, "a signature that isn't 64 hex characters");
  const stale = signedEvent({ session_id: s1, status: "Approved", vendor_data: u1.id, timestamp: now() - 301 });
  const staleRes = await postEvent(stale);
  assert.deepEqual([staleRes.status, staleRes.data?.code], [400, "DZ-E6008"], "a stale timestamp");
  const otherApp = signedEvent({ session_id: s1, status: "Approved", vendor_data: u1.id, application_id: randomUUID() });
  const otherRes = await postEvent(otherApp);
  assert.deepEqual([otherRes.status, otherRes.data?.code], [400, "DZ-E6009"], "another application");
  assert.equal(eventsCount(), before, "none of them was recorded");
  assert.equal(await status(u1), "in_progress");
  console.log("   bad signature 401 DZ-E6007, stale 400 DZ-E6008, other application 400 DZ-E6009; 0 events recorded");

  console.log("\n4. A signed Approved event");
  await control(s1, { status: "Approved", first_name: "Stub", last_name: "Person", date_of_birth: "1990-05-15" });
  const approved = signedEvent({ session_id: s1, status: "Approved", vendor_data: u1.id });
  const ok = await postEvent(approved);
  assert.deepEqual([ok.status, ok.data?.result], [200, "queued"], `webhook: ${ok.status} ${JSON.stringify(ok.data)}`);
  assert.ok(await waitFor(async () => (await status(u1)) === "verified", 60), "verified through the outbox");
  const row = sql(`select legal_name is not null as named, is_adult, reason, attempts from public.identity_verifications where user_id = '${u1.id}'`)[0];
  assert.deepEqual([row.named, row.is_adult, row.reason, row.attempts], [true, true, null, 1]);
  const columns = sql("select string_agg(column_name, ',' order by ordinal_position) as c from information_schema.columns where table_schema = 'public' and table_name = 'identity_verifications'")[0].c;
  assert.equal(columns, "user_id,status,provider_session_id,legal_name,is_adult,attempts,reason,verified_at,created_at,updated_at",
    "nothing beyond status, legal name, 18+, attempts, reason and dates");
  const age = sql(`select result, platform from public.age_checks where user_id = '${u1.id}' and source = 'id_verification'`);
  assert.deepEqual(age, [{ result: "adult", platform: "server" }], "an 18+ age check from the ID");
  console.log(`   webhook 200 queued; verified; legal name kept, 18+ true; age check adult from the ID`);

  console.log("\n5. The badge in the shop window");
  const guestCards = await call(null, "browse_listings", { p_limit: 30 });
  const u1Cards = guestCards.data.filter((c) => c.studio_handle === "studiorostova");
  assert.ok(u1Cards.length > 0 && u1Cards.every((c) => c.is_verified === true), "cards of the verified lender");
  assert.ok(guestCards.data.filter((c) => c.studio_handle === "ateliermaya").every((c) => c.is_verified === false), "other cards");
  const page = (await call(null, "get_listing", { p_listing_id: u1Cards[0].id })).data[0];
  assert.equal(page.is_verified, true, "the listing page");
  const studio = (await call(u3.token, "get_studio", { p_handle: "studiorostova" })).data[0];
  assert.equal(studio.is_verified, true, "the studio page");
  assert.ok(studio.listings.every((l) => l.is_verified === true), "the studio's cards");
  const chat = await call(u3.token, "start_conversation", { p_listing_id: u1Cards[0].id });
  assert.equal(chat.status, 200, `chat: ${chat.status}`);
  const header = (await call(u3.token, "my_conversations", { p_conversation_id: chat.data })).data[0];
  assert.equal(header.other_is_verified, true, "the chat header");
  console.log(`   ${u1Cards.length} cards, the listing page, the studio page and the chat header show Verified`);

  console.log("\n6. The same event again");
  const syncsBefore = (await diditLog()).filter((c) => c.path.endsWith("/decision/")).length;
  const again = await postEvent(approved);
  assert.deepEqual([again.status, again.data?.result], [200, "duplicate"]);
  assert.equal(Number(sql(`select count(*) as n from app_private.didit_events where event_id = '${JSON.parse(approved.body).event_id}'`)[0].n), 1);
  await new Promise((r) => setTimeout(r, 3000));
  assert.equal((await diditLog()).filter((c) => c.path.endsWith("/decision/")).length, syncsBefore, "no second decision check");
  console.log("   200 duplicate; recorded once; no second decision check");

  console.log("\n7. The gate (verification_required), on only inside this step");
  sql("update public.app_settings set enabled = true where key = 'verification_required'");
  try {
    const refused = await call(u3.token, "start_conversation", { p_listing_id: u1Cards[1]?.id ?? u1Cards[0].id });
    assert.ok(!refused.ok && /^DZ-E6001:/.test(refused.data?.message ?? ""), `unverified: ${refused.status} ${refused.data?.message}`);
    const mineOn = await rpc(u3.token, "my_verification");
    assert.equal(mineOn.required, true);
    const lenderChat = await call(u1.token, "my_conversations", {});
    assert.equal(lenderChat.status, 200, "reading is never gated");
  } finally {
    sql("update public.app_settings set enabled = false where key = 'verification_required'");
  }
  console.log("   unverified start_conversation refused with DZ-E6001 while on; off again");

  console.log("\n8. Declined");
  await control(s3, { status: "Declined", error_risks: ["LOW_FACE_MATCH_SIMILARITY"] });
  assert.equal((await postEvent(signedEvent({ session_id: s3, status: "Declined", vendor_data: u3.id }))).data?.result, "queued");
  assert.ok(await waitFor(async () => (await status(u3)) === "declined", 60), "declined");
  const declined = sql(`select legal_name, is_adult, reason from public.identity_verifications where user_id = '${u3.id}'`)[0];
  assert.equal(declined.legal_name, null, "no name kept from a declined ID");
  assert.equal(declined.is_adult, null);
  assert.match(declined.reason, /LOW_FACE_MATCH_SIMILARITY/);
  const left = await rpc(u3.token, "my_verification");
  assert.deepEqual([left.can_start, left.attempts_left], [true, Number(setting("id_verification_max_attempts")) - 1]);
  console.log(`   declined; no name, no 18+ result; reason with the provider's risk code; ${left.attempts_left} checks left`);

  console.log("\n9. A duplicate face goes to review; an admin decides");
  const s3b = await start(u3);
  await control(s3b, { status: "Approved", full_name: "Stub Second", date_of_birth: "1988-01-02", duplicate: true });
  await postEvent(signedEvent({ session_id: s3b, status: "Approved", vendor_data: u3.id }));
  assert.ok(await waitFor(async () => (await status(u3)) === "in_review", 60), "in review");
  assert.equal(sql(`select reason from public.identity_verifications where user_id = '${u3.id}'`)[0].reason, "Possible duplicate account");
  assert.equal(sql(`select is_verified from public.profiles where id = '${u3.id}'`)[0].is_verified, false, "no badge while in review");
  const blocked = await fn("didit-start", { token: u3.token });
  assert.equal(blocked.data?.code, "DZ-E6005", "no new check while in review");
  const notAdmin = await call(u3.token, "admin_decide_id_verification", { p_user_id: u3.id, p_decision: "approve", p_reason: "test" });
  assert.match(notAdmin.data?.message ?? "", /^DZ-E5001:/, "a non-admin is refused");
  const admin = await adminSession(userEnv.TEST_ADMIN_EMAIL, userEnv.TEST_ADMIN_PASSWORD);
  try {
    const queue = await rpc(admin.token, "admin_list_id_reviews", {});
    assert.ok(queue.some((q) => q.user_id === u3.id && q.status === "in_review" && q.reason === "Possible duplicate account"));
    assert.ok(queue.every((q) => !("legal_name" in q)), "the queue holds no legal name");
    const logged = () => Number(sql("select count(*) as n from app_private.admin_actions where action in ('decide_id_verification', 'reset_id_attempts')")[0].n);
    const beforeLog = logged();
    const decided = await rpc(admin.token, "admin_decide_id_verification", { p_user_id: u3.id, p_decision: "approve", p_reason: "Checked the provider's console" });
    assert.equal(decided.status, "verified");
    const reset = await rpc(admin.token, "admin_reset_id_attempts", { p_user_id: u3.id, p_reason: "Support request" });
    assert.equal(reset.attempts, 0);
    assert.equal(logged(), beforeLog + 2, "both logged");
    assert.equal(await status(u3), "verified");
    const queues = await rpc(admin.token, "admin_queues");
    assert.equal(typeof queues.id_verification_reviews, "number");
  } finally {
    await admin.close();
  }
  console.log("   in review (Possible duplicate account), no badge, no new start (DZ-E6005); non-admin refused; admin approved and reset attempts, both logged");

  console.log("\n10. Reconciliation without a webhook");
  const s2 = await start(u2);
  await control(s2, { status: "Approved", first_name: "Stub", last_name: "Third", date_of_birth: "1975-12-31" });
  sql(`update public.identity_verifications set updated_at = now() - interval '31 minutes' where user_id = '${u2.id}'`);
  const queued = sql("select app_private.didit_reconcile() as r")[0].r;
  assert.ok((typeof queued === "string" ? JSON.parse(queued) : queued).queued >= 1, "a decision check queued");
  assert.ok(await waitFor(async () => (await status(u2)) === "verified", 60), "verified by reconciliation");
  console.log("   in progress for 31 minutes -> queued -> verified");

  console.log("\n11. Kyc Expired removes the badge");
  const expired = signedEvent({ session_id: s1, status: "Kyc Expired", vendor_data: u1.id, created_at: now() + 1 });
  assert.equal((await postEvent(expired)).data?.result, "expired");
  assert.equal(await status(u1), "expired");
  const after = (await call(null, "browse_listings", { p_limit: 30 })).data.filter((c) => c.studio_handle === "studiorostova");
  assert.ok(after.every((c) => c.is_verified === false), "the badge is gone");
  console.log("   expired; the badge is gone from the cards");

  console.log("\n12. Account deletion removes the sessions and the user record at the provider, then the rows");
  // A throwaway account on the LOCAL stack only (random address and password, never printed).
  const email = `c6-delete-${randomBytes(6).toString("hex")}@dzirent.local`;
  const password = randomBytes(18).toString("base64url");
  const signup = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, data: { display_name: "Delete Test", role: "renter", adult_confirmed: true } }),
  });
  assert.equal(signup.status, 200, `local sign-up: ${signup.status}`);
  // E1: Confirm email is on, so the throwaway account is confirmed with the local service key.
  const pending = await signup.json();
  const confirmed = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${pending.id ?? pending.user?.id}`, {
    method: "PUT",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email_confirm: true }),
  });
  assert.equal(confirmed.status, 200, `local confirm: ${confirmed.status}`);
  const temp = await signIn(email, password);
  const sTemp = await start(temp);
  const del = await fn("delete-account", { token: temp.token });
  assert.equal(del.status, 200, `delete-account: ${del.status} ${JSON.stringify(del.data)}`);
  const calls = await diditLog();
  assert.ok(calls.some((c) => c.method === "DELETE" && c.path === "/v3/session/{id}/delete/" && c.status === 200), "the session deleted at the provider");
  const users = await (await fetch(`${STUBS_URL}/didit/_control/users-deleted`)).json();
  assert.ok(users.vendor_data.includes(temp.id), "the user record deleted at the provider");
  assert.equal((await fetch(`${STUBS_URL}/didit/_control/session/${sTemp}`)).status, 404, "the stub no longer has the session");
  const rows = sql(`select (select count(*) from public.identity_verifications where user_id = '${temp.id}') + (select count(*) from app_private.didit_sessions where user_id = '${temp.id}') as n`)[0].n;
  assert.equal(Number(rows), 0, "no rows left");
  console.log("   200; the session and the user record deleted at the stub; 0 rows left");

  resetPeople([u1.id, u2.id, u3.id]);
}

async function run() {
  const u1 = await signIn(userEnv.TEST_USER_1_EMAIL, userEnv.TEST_USER_1_PASSWORD);
  const u2 = await signIn(userEnv.TEST_USER_2_EMAIL, userEnv.TEST_USER_2_PASSWORD);
  const u3 = await signIn(userEnv.TEST_USER_3_EMAIL, userEnv.TEST_USER_3_PASSWORD);
  try {
    if (MODE === "off") await off(u1);
    else await on(u1, u2, u3);
  } finally {
    sql("update public.app_settings set enabled = false where key = 'verification_required'");
  }
  console.log(`\nAll C6 ID verification checks (${MODE}) PASSED!`);
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
