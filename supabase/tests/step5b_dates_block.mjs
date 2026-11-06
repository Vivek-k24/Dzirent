// Step 5B test script: set_conversation_dates is refused between blocked users.
// 1. Test user 1 blocks test user 3: user 3 changing their chat's dates is refused.
// 2. Unblock: the date change works again, then the original dates are put back.
// Run with Node 18+: node supabase/tests/step5b_dates_block.mjs
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

function loadEnvFile(path) {
  const env = {};
  try {
    const content = readFileSync(path, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
      }
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

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`Sign in failed: ${res.status}`);
  }
  const data = await res.json();
  return { token: data.access_token, id: data.user.id };
}

async function request(token, path, { method = "GET", body, prefer } = {}) {
  const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, data: text ? JSON.parse(text) : null };
}

async function rpc(token, func, body = {}) {
  const res = await request(token, `rpc/${func}`, { method: "POST", body });
  if (!res.ok) {
    throw new Error(`RPC ${func} failed: ${res.status} ${JSON.stringify(res.data)}`);
  }
  return res.data;
}

const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

async function run() {
  console.log("1. Signing in test users 1 and 3...");
  const u1 = await signIn(userEnv.TEST_USER_1_EMAIL, userEnv.TEST_USER_1_PASSWORD);
  const u3 = await signIn(userEnv.TEST_USER_3_EMAIL, userEnv.TEST_USER_3_PASSWORD);
  const prof3 = (await request(u3.token, "profiles?select=studio_handle")).data[0];
  assert.ok(prof3?.studio_handle, "Test user 3 needs a studio handle for block_user");

  // Start unblocked in both directions (own rows only).
  await request(u1.token, `blocks?blocker_id=eq.${u1.id}&blocked_id=eq.${u3.id}`, { method: "DELETE" });
  await request(u3.token, `blocks?blocker_id=eq.${u3.id}&blocked_id=eq.${u1.id}`, { method: "DELETE" });

  console.log("\n2. Chat between user 3 (renter) and user 1 (lender)...");
  const listings = await request(u1.token, `listings?select=id&status=eq.active&lender_id=eq.${u1.id}&limit=1`);
  assert.ok(listings.ok && listings.data.length === 1, "Test user 1 needs an active listing");
  const conversationId = await rpc(u3.token, "start_conversation", { p_listing_id: listings.data[0].id });
  assert.ok(conversationId, "start_conversation should return the chat id");
  const datesOf = async () =>
    (await request(u3.token, `conversations?select=requested_start,requested_end&id=eq.${conversationId}`)).data[0];
  const before = await datesOf();
  console.log("   chat ready");

  console.log("\n3. User 1 blocks user 3: user 3's date change is refused...");
  await rpc(u1.token, "block_user", { p_handle: prof3.studio_handle });
  let unblocked = false;
  try {
    const blocked = await request(u3.token, "rpc/set_conversation_dates", {
      method: "POST",
      body: { p_conversation_id: conversationId, p_start: day(50), p_end: day(52) },
    });
    assert.ok(!blocked.ok, "a blocked pair's date change must be refused");
    assert.equal(blocked.data?.code, "42501", "refusal should be a permission error");
    assert.deepEqual(await datesOf(), before, "refused change must leave the dates untouched");
    console.log(`   refused (${blocked.status}, ${blocked.data.code}); dates unchanged`);

    console.log("\n4. Unblock: the date change works again...");
    await rpc(u1.token, "unblock_user", { p_handle: prof3.studio_handle });
    unblocked = true;
    await rpc(u3.token, "set_conversation_dates", {
      p_conversation_id: conversationId, p_start: day(50), p_end: day(52),
    });
    assert.deepEqual(await datesOf(), { requested_start: day(50), requested_end: day(52) });
    console.log("   dates changed");
  } finally {
    if (!unblocked) await rpc(u1.token, "unblock_user", { p_handle: prof3.studio_handle });
  }

  if (before?.requested_start && before?.requested_end) {
    await rpc(u3.token, "set_conversation_dates", {
      p_conversation_id: conversationId,
      p_start: before.requested_start,
      p_end: before.requested_end,
    });
    console.log("   original dates restored");
  }

  console.log("\nAll Step 5B date-change checks PASSED!");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
