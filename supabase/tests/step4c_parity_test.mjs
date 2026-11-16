// Step 4C test script: verifies my_blocked_users name return, unblock, is_own flag and since line in get_studio.
import assert from "node:assert/strict";
import { userEnv, SUPABASE_URL, SUPABASE_KEY } from "./lib/config.mjs";

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`Sign in failed for a test user (no address shown): HTTP ${res.status} ${(await res.json().catch(() => ({}))).error_code ?? ""}`);
  }
  const data = await res.json();
  return { token: data.access_token, user: data.user };
}

async function rpc(token, func, body = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${func}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`RPC ${func} failed: ${res.status} ${await res.text()}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function getProfile(token) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=*`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Get profile failed: ${res.status} ${await res.text()}`);
  }
  const rows = await res.json();
  return rows[0];
}

async function run() {
  console.log("1. Authenticating test users...");
  const u1 = await signIn(userEnv.TEST_USER_1_EMAIL, userEnv.TEST_USER_1_PASSWORD);
  const u2 = await signIn(userEnv.TEST_USER_2_EMAIL, userEnv.TEST_USER_2_PASSWORD);
  const u3 = await signIn(userEnv.TEST_USER_3_EMAIL, userEnv.TEST_USER_3_PASSWORD);

  const prof1 = await getProfile(u1.token);
  const prof2 = await getProfile(u2.token);
  const prof3 = await getProfile(u3.token);

  console.log("User 1 handle:", prof1.studio_handle);
  console.log("User 2 handle:", prof2.studio_handle);
  console.log("User 3 handle:", prof3.studio_handle);

  assert.ok(prof1.studio_handle, "User 1 should have a studio handle");
  assert.ok(prof2.studio_handle, "User 2 should have a studio handle");
  assert.ok(prof3.studio_handle, "User 3 should have a studio handle");

  console.log("\n2. Testing block_user and my_blocked_users...");
  // Make sure not blocked before
  try {
    await rpc(u1.token, "unblock_user", { p_handle: prof3.studio_handle });
  } catch {}

  // User 1 blocks User 3
  await rpc(u1.token, "block_user", { p_handle: prof3.studio_handle });
  console.log("User 1 blocked User 3");

  const blockedList = await rpc(u1.token, "my_blocked_users");
  console.log("Blocked list count:", blockedList.length);
  const user3Blocked = blockedList.find(b => b.studio_handle === prof3.studio_handle);
  assert.ok(user3Blocked, "User 3 should be in user 1's blocked list");
  console.log("User 3 blocked item:", user3Blocked);
  assert.notEqual(user3Blocked.display_name, "Dzirent member", "Should not be generic Dzirent member");
  assert.ok(user3Blocked.display_name || user3Blocked.studio_name, "Should have real display or studio name");

  // User 1 unblocks User 3
  await rpc(u1.token, "unblock_user", { p_handle: prof3.studio_handle });
  console.log("User 1 unblocked User 3");

  const blockedAfter = await rpc(u1.token, "my_blocked_users");
  const user3BlockedAfter = blockedAfter.find(b => b.studio_handle === prof3.studio_handle);
  assert.strictEqual(user3BlockedAfter, undefined, "User 3 should no longer be in blocked list");

  console.log("\n3. Testing get_studio is_own flag and since line...");
  // User 1 inspects own studio
  const ownStudioRes = await rpc(u1.token, "get_studio", { p_handle: prof1.studio_handle });
  const ownStudio = Array.isArray(ownStudioRes) ? ownStudioRes[0] : ownStudioRes;
  console.log("User 1 own studio is_own:", ownStudio.is_own);
  console.log("User 1 own studio since:", ownStudio.since);
  assert.strictEqual(ownStudio.is_own, true, "Own studio must have is_own = true");
  assert.ok(ownStudio.since && ownStudio.since.startsWith("Since "), "Own studio must return Since line");

  // User 1 inspects User 2's studio
  const otherStudioRes = await rpc(u1.token, "get_studio", { p_handle: prof2.studio_handle });
  const otherStudio = Array.isArray(otherStudioRes) ? otherStudioRes[0] : otherStudioRes;
  console.log("User 2 studio from User 1 is_own:", otherStudio.is_own);
  console.log("User 2 studio since:", otherStudio.since);
  assert.strictEqual(otherStudio.is_own, false, "Other studio must have is_own = false");
  assert.ok(otherStudio.since && otherStudio.since.startsWith("Since "), "Other studio must return Since line");

  console.log("\n4. Testing my_saved_listings...");
  const savedList = await rpc(u1.token, "my_saved_listings", { p_limit: 10, p_offset: 0 });
  console.log("User 1 saved listings count:", Array.isArray(savedList) ? savedList.length : savedList);
  assert.ok(Array.isArray(savedList), "my_saved_listings must return an array");

  console.log("\nAll Step 4C API parity checks PASSED!");
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
