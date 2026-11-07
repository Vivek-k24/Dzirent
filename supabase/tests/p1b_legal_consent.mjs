// P1B part 1 test script, as test user 1:
// 1. needs_legal_acceptance() is true until accept_legal('android'), then false; the rows carry
//    the versions in legal_documents (seeded from the website's TERMS_VERSION and PRIVACY_VERSION).
// 2. A body measurement is refused without consent, and the consent time can't be set directly;
//    after give_measurements_consent() it saves; withdraw_measurements_consent() deletes it.
// Run with Node 18+: node supabase/tests/p1b_legal_consent.mjs
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

// The same upsert the apps make (merge on user_id).
const saveChest = (u, cm) =>
  request(u.token, "private_profiles?on_conflict=user_id", {
    method: "POST",
    body: { user_id: u.id, chest_cm: cm },
    prefer: "resolution=merge-duplicates,return=representation",
  });

const myProfile = async (u) =>
  (await request(u.token, `private_profiles?select=chest_cm,measurements_consent_at&user_id=eq.${u.id}`)).data[0] ?? null;

async function run() {
  console.log("1. Signing in test user 1...");
  const u1 = await signIn(userEnv.TEST_USER_1_EMAIL, userEnv.TEST_USER_1_PASSWORD);

  console.log("\n2. Terms and privacy acceptance...");
  const docs = await request(u1.token, "legal_documents?select=document,version&order=document");
  assert.ok(docs.ok, "legal_documents must be readable");
  console.log(`   current versions: ${docs.data.map((d) => `${d.document} ${d.version}`).join(", ")}`);
  const versionOf = Object.fromEntries(docs.data.map((d) => [d.document, d.version]));
  assert.deepEqual(Object.keys(versionOf).sort(), ["privacy", "terms"]);

  const before = await request(u1.token, "legal_acceptances?select=document,version,platform");
  const acceptedBefore = before.data.filter((r) => versionOf[r.document] === r.version).length;
  const needsBefore = await rpc(u1.token, "needs_legal_acceptance");
  if (acceptedBefore === 0) {
    assert.equal(needsBefore, true, "a user who accepted nothing must need to accept");
    console.log("   needs_legal_acceptance() before: true");
  } else {
    console.log(`   already accepted ${acceptedBefore} of 2 earlier; needs_legal_acceptance() before: ${needsBefore}`);
  }

  await rpc(u1.token, "accept_legal", { p_platform: "android" });
  assert.equal(await rpc(u1.token, "needs_legal_acceptance"), false, "accept_legal must clear it");
  console.log("   accept_legal('android') -> needs_legal_acceptance() false");

  const rows = (await request(u1.token, "legal_acceptances?select=document,version,platform,accepted_at&order=document")).data;
  for (const doc of ["privacy", "terms"]) {
    const row = rows.find((r) => r.document === doc && r.version === versionOf[doc]);
    assert.ok(row, `an acceptance row for ${doc} ${versionOf[doc]}`);
    console.log(`   row: ${row.document} ${row.version} on ${row.platform}`);
  }
  const anon = await fetch(`${SUPABASE_URL}/rest/v1/rpc/accept_legal`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ p_platform: "android" }),
  });
  assert.ok(!anon.ok, "guests can't call accept_legal");
  console.log(`   guest call refused (${anon.status})`);

  console.log("\n3. Measurements consent...");
  await rpc(u1.token, "withdraw_measurements_consent");
  assert.equal((await myProfile(u1))?.measurements_consent_at ?? null, null, "start without consent");

  const refused = await saveChest(u1, 92);
  assert.ok(!refused.ok, "a measurement without consent must be refused");
  assert.equal(refused.data?.code, "P0001");
  console.log(`   without consent: refused (${refused.status}, "${refused.data.message}")`);

  // An app can't give itself consent by writing the column.
  await request(u1.token, `private_profiles?user_id=eq.${u1.id}`, {
    method: "PATCH",
    body: { measurements_consent_at: new Date().toISOString() },
  });
  assert.equal((await myProfile(u1))?.measurements_consent_at ?? null, null, "the consent time is server-only");
  console.log("   writing measurements_consent_at directly: ignored");

  const consentAt = await rpc(u1.token, "give_measurements_consent");
  assert.ok(consentAt, "give_measurements_consent returns the consent time");
  const saved = await saveChest(u1, 92);
  assert.ok(saved.ok, `with consent the measurement must save: ${JSON.stringify(saved.data)}`);
  const afterSave = await myProfile(u1);
  assert.equal(afterSave.chest_cm, 92);
  assert.ok(afterSave.measurements_consent_at, "consent time is kept");
  console.log("   after give_measurements_consent(): chest saved");

  await rpc(u1.token, "withdraw_measurements_consent");
  const afterWithdraw = await myProfile(u1);
  assert.equal(afterWithdraw.chest_cm, null, "withdrawal deletes the measurements");
  assert.equal(afterWithdraw.measurements_consent_at, null, "withdrawal clears the consent time");
  console.log("   after withdraw_measurements_consent(): measurements and consent cleared");

  console.log("\nAll P1B part 1 checks PASSED!");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
