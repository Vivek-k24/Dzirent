// Step 7A test script: push notifications through the database trigger and send-push.
// 1. send-push refuses callers without the database's shared secret.
// 2. A fake token for test user 1 + a message from test user 3: a push is due.
//    Live: send-push runs, Firebase rejects the token, and send-push removes it.
//    Local (C2): the outbox sends it to the push stub, which records it: recipient, kind and title
//    "New message from <name>", and no body while "Show message text" is off.
// 3. With user 1 blocking user 3 there is no send attempt (the fake token stays), then unblock.
// Run with Node 18+: node supabase/tests/step7a_push.mjs
import assert from "node:assert/strict";
import { userEnv, SUPABASE_URL, SUPABASE_KEY, LIVE, STUBS_URL } from "./lib/config.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

async function myTokens(user) {
  const res = await request(user.token, "device_tokens?select=token,platform");
  assert.ok(res.ok, `device_tokens read failed: ${res.status}`);
  return res.data.map((row) => row.token);
}

/** Waits until [check] is true, up to [seconds]. */
async function waitFor(check, seconds) {
  for (let i = 0; i < seconds; i++) {
    if (await check()) return true;
    await sleep(1000);
  }
  return check();
}

async function run() {
  console.log("1. send-push refuses callers without the shared secret...");
  const anonymous = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-send-push-secret": "wrong" },
    body: JSON.stringify({}),
  });
  assert.equal(anonymous.status, 401, "send-push must refuse a wrong secret");
  console.log("   401 for a wrong secret");

  console.log("\n2. Signing in test users 1 and 3...");
  const u1 = await signIn(userEnv.TEST_USER_1_EMAIL, userEnv.TEST_USER_1_PASSWORD);
  const u3 = await signIn(userEnv.TEST_USER_3_EMAIL, userEnv.TEST_USER_3_PASSWORD);
  const prof3 = (await request(u3.token, "profiles?select=studio_handle")).data[0];
  assert.ok(prof3?.studio_handle, "Test user 3 needs a studio handle for block_user");

  // Start unblocked in both directions (own rows only).
  await request(u1.token, `blocks?blocker_id=eq.${u1.id}&blocked_id=eq.${u3.id}`, { method: "DELETE" });
  await request(u3.token, `blocks?blocker_id=eq.${u3.id}&blocked_id=eq.${u1.id}`, { method: "DELETE" });

  // Defaults (messages on), so the message below is due a push.
  const settings = await request(u1.token, "notification_settings", {
    method: "POST",
    body: { user_id: u1.id, messages: true, show_message_text: false },
    prefer: "resolution=merge-duplicates,return=representation",
  });
  assert.ok(settings.ok, `notification_settings upsert failed: ${settings.status}`);
  assert.equal(settings.data[0].messages, true);
  console.log("   user 1 notification settings saved (Messages on, text hidden)");

  console.log("\n3. Chat between user 3 (renter) and user 1 (lender)...");
  const listings = await request(u1.token, `listings?select=id&status=eq.active&lender_id=eq.${u1.id}&limit=1`);
  assert.ok(listings.ok && listings.data.length === 1, "Test user 1 needs an active listing");
  const conversationId = await rpc(u3.token, "start_conversation", { p_listing_id: listings.data[0].id });
  assert.ok(conversationId, "start_conversation should return the chat id");
  console.log("   chat ready");

  console.log("\n4. Fake token for user 1, message from user 3...");
  const fakeToken = `step7a-fake-${Date.now()}`;
  await rpc(u1.token, "register_push_token", { p_token: fakeToken, p_platform: "android" });
  assert.ok((await myTokens(u1)).includes(fakeToken), "user 1 should see the registered token");
  assert.deepEqual(await myTokens(u3), [], "user 3 must not see user 1's tokens");
  console.log("   registered; only user 1 can read it");

  const sent = await request(u3.token, "messages", {
    method: "POST",
    body: { conversation_id: conversationId, sender_id: u3.id, body: "Step 7A push test" },
    prefer: "return=minimal",
  });
  assert.ok(sent.ok, `message insert failed: ${sent.status}`);
  if (LIVE) {
    const removed = await waitFor(async () => !(await myTokens(u1)).includes(fakeToken), 60);
    assert.ok(removed, "send-push should remove the token Firebase rejected");
    console.log("   message sent; send-push removed the fake token after Firebase rejected it");
  } else {
    const recorded = async () =>
      ((await (await fetch(`${STUBS_URL}/log`)).json()).push ?? []).filter((p) => p.conversation_id === conversationId);
    assert.ok(await waitFor(async () => (await recorded()).length > 0, 30), "the push stub should receive the push");
    const push = (await recorded()).at(-1);
    assert.equal(push.recipient_id, u1.id);
    assert.equal(push.kind, "message");
    assert.equal(push.title, "New message from Jordan Bell");
    assert.ok(!push.body, "no message text while Show message text is off");
    console.log(`   message sent; the push stub recorded "${push.title}" for user 1, without the text`);
    await rpc(u1.token, "unregister_push_token", { p_token: fakeToken });
  }

  console.log("\n5. User 1 blocks user 3: no send attempt...");
  const blockedToken = `step7a-blocked-${Date.now()}`;
  await rpc(u1.token, "register_push_token", { p_token: blockedToken, p_platform: "android" });
  await rpc(u1.token, "block_user", { p_handle: prof3.studio_handle });
  const blockedMessage = await request(u3.token, "messages", {
    method: "POST",
    body: { conversation_id: conversationId, sender_id: u3.id, body: "Step 7A blocked test" },
    prefer: "return=minimal",
  });
  assert.ok(!blockedMessage.ok, "a blocked user's message must be refused");
  console.log(`   user 3's message refused (${blockedMessage.status})`);

  // Since Step 5B a blocked pair's date change is refused too.
  const before = (await request(u3.token, `conversations?select=requested_start,requested_end&id=eq.${conversationId}`)).data[0];
  const start = new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10);
  const end = new Date(Date.now() + 42 * 86400000).toISOString().slice(0, 10);
  const blockedDates = await request(u3.token, "rpc/set_conversation_dates", {
    method: "POST",
    body: { p_conversation_id: conversationId, p_start: start, p_end: end },
  });
  assert.ok(!blockedDates.ok, "a blocked user's date change must be refused");
  await sleep(20000);
  assert.ok((await myTokens(u1)).includes(blockedToken), "no push may be attempted for a blocked pair");
  console.log("   message and date change refused; after 20 s the fake token is untouched (no send attempt)");

  console.log("\n6. Unblock and clean up...");
  await rpc(u1.token, "unblock_user", { p_handle: prof3.studio_handle });
  await rpc(u1.token, "unregister_push_token", { p_token: blockedToken });
  assert.ok(!(await myTokens(u1)).includes(blockedToken), "unregister_push_token should remove the token");
  if (before?.requested_start && before?.requested_end) {
    // No tokens left, so putting the dates back sends nothing.
    await rpc(u3.token, "set_conversation_dates", {
      p_conversation_id: conversationId,
      p_start: before.requested_start,
      p_end: before.requested_end,
    });
  }
  const blocksLeft = await request(u1.token, `blocks?select=blocked_id&blocked_id=eq.${u3.id}`);
  assert.deepEqual(blocksLeft.data, [], "user 1 should no longer block user 3");
  console.log("   unblocked, token unregistered, dates restored");

  console.log("\nAll Step 7A push checks PASSED!");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
