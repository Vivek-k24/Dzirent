// P2A test script: the database text filter, through the API.
// 1. A listing title with a phone number is refused (P0001, HINT "title"); the title is unchanged.
// 2. The same phone number in a chat message is accepted (contact details are fine in chat).
// 3. A slur in a chat message is refused.
// 4. Normal words that contain a listed word inside them ("cocktail") and allowlisted words
//    ("nude heels") are accepted.
// 5. check_text works for guests (sign-up's display name check).
// Messages 2 and 4 stay in the test chat between test users 1 and 3 (apps can't delete messages).
// Run with Node 18+: node supabase/tests/p2a_text_filter.mjs
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

// A slur from the word list, kept encoded so it isn't plain text in the repo.
const SLUR_MESSAGE = Buffer.from("eW91IHRvd2VsaGVhZA==", "base64").toString("utf8");
const PHONE = "Call me at 512-555-0123";

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
  const headers = { apikey: SUPABASE_KEY };
  if (token) headers.Authorization = `Bearer ${token}`;
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

const send = (u, conversationId, body) =>
  request(u.token, "messages", {
    method: "POST",
    body: { conversation_id: conversationId, sender_id: u.id, body },
    prefer: "return=minimal",
  });

async function run() {
  console.log("1. Signing in test users 1 and 3...");
  const u1 = await signIn(userEnv.TEST_USER_1_EMAIL, userEnv.TEST_USER_1_PASSWORD);
  const u3 = await signIn(userEnv.TEST_USER_3_EMAIL, userEnv.TEST_USER_3_PASSWORD);

  console.log("\n2. A phone number in a listing title is refused...");
  const listings = await request(u1.token, `listings?select=id,title&status=eq.active&lender_id=eq.${u1.id}&limit=1`);
  assert.ok(listings.ok && listings.data.length === 1, "Test user 1 needs an active listing");
  const listing = listings.data[0];
  const refused = await request(u1.token, `listings?id=eq.${listing.id}`, {
    method: "PATCH",
    body: { title: `Velvet dress, ${PHONE}` },
  });
  assert.ok(!refused.ok, "a phone number in a listing title must be refused");
  assert.equal(refused.data?.code, "P0001");
  assert.equal(refused.data?.hint, "title", "the refusal names the field");
  const after = (await request(u1.token, `listings?select=title&id=eq.${listing.id}`)).data[0];
  assert.equal(after.title, listing.title, "the refused title must not be saved");
  console.log(`   refused (${refused.status}, hint ${refused.data.hint}): "${refused.data.message}"`);

  console.log("\n3. Chat between user 3 (renter) and user 1 (lender)...");
  const conversationId = await rpc(u3.token, "start_conversation", { p_listing_id: listing.id });
  assert.ok(conversationId, "start_conversation should return the chat id");

  const phoneInChat = await send(u1, conversationId, PHONE);
  assert.ok(phoneInChat.ok, `a phone number in chat must be accepted: ${JSON.stringify(phoneInChat.data)}`);
  console.log("   phone number in a chat message: accepted");

  const slur = await send(u1, conversationId, SLUR_MESSAGE);
  assert.ok(!slur.ok, "a slur in a chat message must be refused");
  assert.equal(slur.data?.code, "P0001");
  assert.equal(slur.data?.hint, "body");
  console.log(`   slur in a chat message: refused (${slur.status}): "${slur.data.message}"`);

  const normal = await send(u1, conversationId, "The cocktail dress goes well with nude heels, a classic look.");
  assert.ok(normal.ok, `normal words must be accepted: ${JSON.stringify(normal.data)}`);
  console.log('   "cocktail", "classic" and allowlisted "nude heels" in chat: accepted');

  console.log("\n4. check_text for a guest...");
  assert.equal(await rpc(null, "check_text", { p_text: "Jane Doe", p_where: "profile" }), null);
  const guestRefusal = await rpc(null, "check_text", { p_text: "Jane jane@example.com", p_where: "profile" });
  assert.ok(guestRefusal?.startsWith("Please remove contact details"), "contact details in a profile are refused");
  console.log(`   "Jane Doe": fine; with an email: "${guestRefusal}"`);

  console.log("\nAll P2A text filter checks PASSED!");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
