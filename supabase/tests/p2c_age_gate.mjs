// P2C test script: the age gate and the preview label through the API.
// 1. Guests read the preview_label flag (it must be on).
// 2. Test user 3 records a store signal "minor": record_age_check returns true, and publishing a
//    listing, sending a message and editing the profile are refused with the 18+ message. Reading
//    their own data and "inbox seen" still work. A self-declared "adult" doesn't lift the block.
// 3. A store signal "adult" lifts it: the listing can be created and published, and the message goes.
// 4. Clean-up, also after a failure: test user 3 ends as adult (latest store signal "adult"), and
//    the test listing is deleted. The test message stays in the test chat.
// Bad input is refused (unknown source, result or platform; guests).
// Run from the repo root with Node 18+: node supabase/tests/p2c_age_gate.mjs
import { readFileSync } from "node:fs";
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
const MESSAGE = "Dzirent is only for people 18 and older.";

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
  assert.ok(res.ok, `sign-in failed: ${res.status}`);
  return { token: res.data.access_token, id: res.data.user.id };
}
const rest = (token, path, opts = {}) => http(`/rest/v1/${path}`, { token, ...opts });
async function rpc(token, name, args = {}) {
  const res = await rest(token, `rpc/${name}`, { method: "POST", body: args });
  if (!res.ok) throw new Error(`RPC ${name} failed: ${res.status} ${JSON.stringify(res.data)}`);
  return res.data;
}
const ageCheck = (u, source, result, platform = "android") =>
  rpc(u.token, "record_age_check", { p_source: source, p_result: result, p_platform: platform });

function assertBlocked(res, what) {
  assert.ok(!res.ok, `${what} must be refused while blocked`);
  assert.equal(res.data?.code, "P0001", `${what}: ${JSON.stringify(res.data)}`);
  assert.equal(res.data?.message, MESSAGE, `${what}: ${JSON.stringify(res.data)}`);
}

async function run() {
  console.log("1. The preview label flag (as a guest)...");
  const flag = await rest(null, "app_settings?select=key,enabled&key=eq.preview_label");
  assert.ok(flag.ok, `guests read app_settings: ${flag.status}`);
  assert.equal(flag.data[0]?.enabled, true, "preview_label must be on");
  console.log("   preview_label = true");

  console.log("\n2. Bad input...");
  const guest = await rest(null, "rpc/record_age_check", { method: "POST", body: { p_source: "store_signal", p_result: "adult", p_platform: "web" } });
  assert.ok(!guest.ok, "guests can't record an age check");
  const u3 = await signIn(userEnv.TEST_USER_3_EMAIL, userEnv.TEST_USER_3_PASSWORD);
  const u1 = await signIn(userEnv.TEST_USER_1_EMAIL, userEnv.TEST_USER_1_PASSWORD);
  for (const [s, r, p] of [["phone", "adult", "web"], ["store_signal", "teen", "web"], ["store_signal", "adult", "tv"]]) {
    const res = await rest(u3.token, "rpc/record_age_check", { method: "POST", body: { p_source: s, p_result: r, p_platform: p } });
    assert.equal(res.data?.code, "22023", `${s}/${r}/${p} must be refused: ${JSON.stringify(res.data)}`);
  }
  console.log(`   guest refused (${guest.status}); unknown source, result and platform refused (22023)`);

  // A chat between test user 3 and an active listing of test user 1, made while adult.
  const listing = (await rest(u1.token, `listings?select=id&status=eq.active&lender_id=eq.${u1.id}&limit=1`)).data[0];
  assert.ok(listing, "test user 1 needs an active listing");
  assert.equal(await ageCheck(u3, "store_signal", "adult"), false, "test user 3 starts unblocked");
  const conversationId = await rpc(u3.token, "start_conversation", { p_listing_id: listing.id });
  const lat = 30.27, lng = -97.74;
  let testListing = null;

  try {
    console.log("\n3. A store signal says minor...");
    assert.equal(await ageCheck(u3, "store_signal", "minor"), true, "minor blocks the account");
    const own = await rest(u3.token, `profiles?select=id&id=eq.${u3.id}`);
    assert.ok(own.ok && own.data.length === 1, "a blocked account still reads its own profile");
    const checks = await rest(u3.token, `age_checks?select=source,result,platform&order=id.desc&limit=1`);
    assert.equal(checks.data[0]?.result, "minor", "the owner reads their own age checks");
    await rpc(u3.token, "mark_activity_seen");
    assertBlocked(await rest(u3.token, "listings", {
      method: "POST", body: { lender_id: u3.id, title: "P2C age gate test", category: "Occasion & Party", approx_lat: lat, approx_lng: lng, status: "paused" },
    }), "creating a listing");
    assertBlocked(await rest(u3.token, "messages", { method: "POST", body: { conversation_id: conversationId, sender_id: u3.id, body: "P2C while blocked" } }), "sending a message");
    assertBlocked(await rest(u3.token, `profiles?id=eq.${u3.id}`, { method: "PATCH", body: { studio_bio: "P2C" } }), "editing the profile");
    console.log("   blocked: creating a listing, sending a message and editing the profile refused with the 18+ message; own data and inbox-seen still work");

    assert.equal(await ageCheck(u3, "self_declared", "adult", "web"), true, "a self-declared adult doesn't lift a store's minor");
    console.log("   a self-declared adult afterwards keeps the block");

    console.log("\n4. A store signal says adult...");
    assert.equal(await ageCheck(u3, "store_signal", "adult"), false, "adult lifts the block");
    const created = await rest(u3.token, "listings", {
      method: "POST", prefer: "return=representation",
      body: { lender_id: u3.id, title: "P2C age gate test", category: "Occasion & Party", approx_lat: lat, approx_lng: lng, status: "paused" },
    });
    assert.ok(created.ok, `creating a listing after the block: ${created.status} ${JSON.stringify(created.data)}`);
    testListing = created.data[0].id;
    const publish = await rest(u3.token, `listings?id=eq.${testListing}`, { method: "PATCH", body: { status: "active" } });
    assert.ok(publish.ok, `publishing after the block: ${publish.status} ${JSON.stringify(publish.data)}`);
    const sent = await rest(u3.token, "messages", { method: "POST", body: { conversation_id: conversationId, sender_id: u3.id, body: "P2C after the block" } });
    assert.ok(sent.ok, `messaging after the block: ${sent.status} ${JSON.stringify(sent.data)}`);
    console.log("   unblocked: listing created and published, message sent");
  } finally {
    console.log("\n5. Clean-up...");
    const blocked = await ageCheck(u3, "store_signal", "adult");
    if (testListing) {
      const del = await rest(u3.token, `listings?id=eq.${testListing}`, { method: "DELETE" });
      console.log(`   test listing deleted: ${del.ok}`);
    }
    console.log(`   test user 3 left as adult (blocked = ${blocked})`);
  }
  console.log("\nP2C age gate test PASSED");
}

run().catch((e) => {
  console.error("\nP2C age gate test FAILED:", e.message);
  process.exit(1);
});
