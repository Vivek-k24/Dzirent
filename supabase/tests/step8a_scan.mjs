// Step 8A test script: a photo check from request_scan to a finished scan.
// 1. Guests read the policy and the flags; they can't read scans or ask for one.
// 2. Test user 1 asks for a check on their sample listing "Emerald Velvet Cocktail Dress";
//    asking again while it runs returns the same scan, and test user 3 can't ask for it.
// 3. The scan finishes (done) with a verdict, a reason and suggestions, and every photo has a
//    photo_scans row with a 768-number fingerprint. Test user 3 can't read any of it.
// 4. scan-listing refuses a caller without the shared secret.
// Run with Node 18+: node supabase/tests/step8a_scan.mjs
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
// Test user 1's sample listing (supabase/seed/sample_photos.mjs).
const LISTING_ID = "2fe0cfa6-a95e-4994-bbe4-f1bfb6760490";

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

// token null = a guest (publishable key only).
async function request(token, path, { method = "GET", body } = {}) {
  const headers = { apikey: SUPABASE_KEY };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, data: text ? JSON.parse(text) : null };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  console.log("1. Guest access...");
  const policy = await request(null, "policy_item_types?select=key,allowed&order=position");
  assert.ok(policy.ok && policy.data.length > 100, "guests read the policy");
  const flags = await request(null, "app_settings?select=key,enabled&order=key");
  assert.deepEqual(flags.data, [
    { key: "payments_enabled", enabled: false },
    { key: "verification_required", enabled: false },
    { key: "vision_required", enabled: false },
  ], "all three flags exist and are off");
  const guestScans = await request(null, "listing_scans?select=id");
  assert.ok(!guestScans.ok, "guests can't read scans");
  const guestRequest = await request(null, "rpc/request_scan", { method: "POST", body: { p_listing_id: LISTING_ID } });
  assert.ok(!guestRequest.ok, "guests can't ask for a scan");
  console.log(`   policy rows ${policy.data.length}, flags off, guest scans ${guestScans.status}, guest request ${guestRequest.status}`);

  console.log("\n2. Test user 1 asks for a check...");
  const u1 = await signIn(userEnv.TEST_USER_1_EMAIL, userEnv.TEST_USER_1_PASSWORD);
  const u3 = await signIn(userEnv.TEST_USER_3_EMAIL, userEnv.TEST_USER_3_PASSWORD);
  const asked = Date.now();
  const first = await request(u1.token, "rpc/request_scan", { method: "POST", body: { p_listing_id: LISTING_ID } });
  assert.ok(first.ok, `request_scan failed: ${first.status} ${JSON.stringify(first.data)}`);
  const scanId = first.data;
  const again = await request(u1.token, "rpc/request_scan", { method: "POST", body: { p_listing_id: LISTING_ID } });
  assert.equal(again.data, scanId, "asking again while it runs returns the same scan");
  const other = await request(u3.token, "rpc/request_scan", { method: "POST", body: { p_listing_id: LISTING_ID } });
  assert.ok(!other.ok && other.data?.code === "42501", "another user can't ask for a check on this listing");
  console.log(`   scan ${scanId} queued; second call returned the same scan; user 3 refused (${other.status})`);

  console.log("\n3. Waiting for the scan to finish...");
  let scan;
  for (let i = 0; i < 60; i++) {
    scan = (await request(u1.token, `listing_scans?select=*&id=eq.${scanId}`)).data?.[0];
    if (scan && ["done", "failed"].includes(scan.status)) break;
    await sleep(3000);
  }
  const seconds = Math.round((Date.now() - asked) / 1000);
  assert.ok(scan, "the owner can read their scan");
  console.log(`   status ${scan.status} after ${seconds} s: ${scan.verdict} - ${scan.reason}`);
  assert.equal(scan.status, "done", `scan ended ${scan.status}: ${scan.error}`);
  assert.ok(["allowed", "rejected", "review"].includes(scan.verdict), "a verdict");
  assert.ok(scan.suggestions?.title && scan.suggestions?.category, "suggestions with a title and category");
  assert.match(scan.photo_set_hash, /^[0-9a-f]{64}$/, "a photo set hash");
  console.log(`   suggestions: "${scan.suggestions.title}" / ${scan.suggestions.category} / ${scan.suggestions.garment_type}` +
    ` / colors ${JSON.stringify(scan.suggestions.colors)} / styles ${JSON.stringify(scan.suggestions.styles)}`);
  console.log(`   quality: ${scan.suggestions.quality?.summary}; duplicate: ${scan.suggestions.duplicate}`);

  const photos = (await request(u1.token, `listing_photos?select=id&listing_id=eq.${LISTING_ID}`)).data;
  const rows = (await request(u1.token, `photo_scans?select=photo_id,decision,blur_score,brightness_score,framing_score,worn_probability,fingerprint&scan_id=eq.${scanId}`)).data;
  assert.equal(rows.length, photos.length, "one photo_scans row per photo");
  for (const row of rows) {
    const fingerprint = JSON.parse(row.fingerprint);
    assert.equal(fingerprint.length, 768, "a 768-number fingerprint");
    console.log(`   photo ${row.photo_id.slice(0, 8)}: ${row.decision}, blur ${row.blur_score}, brightness ` +
      `${row.brightness_score}, framing ${row.framing_score}, worn ${row.worn_probability}, fingerprint ${fingerprint.length} numbers`);
  }
  const stranger = await request(u3.token, `photo_scans?select=id&scan_id=eq.${scanId}`);
  const strangerScan = await request(u3.token, `listing_scans?select=id&id=eq.${scanId}`);
  assert.ok(stranger.ok && stranger.data.length === 0 && strangerScan.data.length === 0, "other users see none of it");
  console.log("   test user 3 reads no scan rows");

  console.log("\n4. scan-listing without the shared secret...");
  const direct = await fetch(`${SUPABASE_URL}/functions/v1/scan-listing`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-scan-listing-secret": "wrong" },
    body: JSON.stringify({ scan_id: scanId }),
  });
  assert.equal(direct.status, 401, "wrong secret refused");
  console.log(`   refused (${direct.status})`);

  console.log("\nAll Step 8A scan checks PASSED!");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
