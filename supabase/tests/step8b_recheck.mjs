// Step 8B test script: changing the photos of an active listing re-checks it on the server,
// and while vision_required is on a result that isn't allowed pauses it with a reason.
// Run with Node 18+: node supabase/tests/step8b_recheck.mjs <off|on> <photo.jpg>
//   off: the flag must be off. Test user 1 adds the photo to their active sample listing
//        "Emerald Velvet Cocktail Dress": a new check runs, the listing stays active (re-check
//        only, never a pause). The photo is removed again (another check, of the original photos).
//   on:  the flag must be on. Adding the photo: the check pauses the listing with
//        auto_paused_reason. Then the photo is removed, the photos are checked again (allowed)
//        and the owner republishes: active, the reason cleared.
// The photo should be one the check won't allow (a generated photo of a typed page works). Locally
// any photo works: it is uploaded as reject_<random>.jpg and the vision stub rejects that name.
// The runner (run-all.mjs) runs both phases locally and switches vision_required for "on".
import { readFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { userEnv, SUPABASE_URL, SUPABASE_KEY, LIVE } from "./lib/config.mjs";

// Test user 1's sample listing (supabase/seed/sample_photos.mjs).
const LISTING_ID = "2fe0cfa6-a95e-4994-bbe4-f1bfb6760490";
const [phase, photoPath] = process.argv.slice(2);

if (!SUPABASE_URL || !SUPABASE_KEY || !["off", "on"].includes(phase) || !photoPath) {
  console.error("usage: node supabase/tests/step8b_recheck.mjs <off|on> <photo.jpg> (and the server env)");
  process.exit(1);
}

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Sign in failed: ${res.status}`);
  return (await res.json()).access_token;
}

let token;
async function request(path, { method = "GET", body, headers = {} } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, data: text ? JSON.parse(text) : null };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const listing = async () => (await request(`listings?select=status,auto_paused_reason&id=eq.${LISTING_ID}`)).data[0];
const latestScan = async () =>
  (await request(`listing_scans?select=id,status,verdict,reason,created_at&listing_id=eq.${LISTING_ID}&order=created_at.desc&limit=1`)).data[0];

/** The listing's newest scan once it is a newer one than [previous] and has finished. Compares
 * ids, not times: this computer's clock and the server's can be a second or more apart. */
async function nextFinishedScan(previous, label) {
  const started = Date.now();
  for (let i = 0; i < 70; i++) {
    const scan = await latestScan();
    if (scan && scan.id !== previous?.id && ["done", "failed"].includes(scan.status)) {
      console.log(`   ${label}: ${scan.status} / ${scan.verdict} - ${scan.reason} (${Math.round((Date.now() - started) / 1000)} s)`);
      return scan;
    }
    await sleep(3000);
  }
  throw new Error(`${label}: no finished scan within 210 s`);
}

async function addPhoto() {
  // Locally (C2) the vision stub answers by file name: "reject_" makes it a photo the check won't allow.
  const path = `${LISTING_ID}/${LIVE ? "" : "reject_"}${randomBytes(8).toString("hex")}.jpg`;
  const up = await fetch(`${SUPABASE_URL}/storage/v1/object/listing-photos/${path}`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, "Content-Type": "image/jpeg" },
    body: readFileSync(photoPath),
  });
  assert.ok(up.ok, `upload failed: ${up.status}`);
  const id = randomUUID();
  const row = await request("listing_photos", {
    method: "POST",
    body: { id, listing_id: LISTING_ID, storage_path: path, position: 2, slot: "extra_1" },
  });
  assert.ok(row.ok, `photo row failed: ${row.status} ${JSON.stringify(row.data)}`);
  return { id, path };
}

async function removePhoto(photo) {
  const del = await request(`listing_photos?id=eq.${photo.id}`, { method: "DELETE" });
  assert.ok(del.ok, `photo row delete failed: ${del.status}`);
  await fetch(`${SUPABASE_URL}/storage/v1/object/listing-photos`, {
    method: "DELETE",
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: [photo.path] }),
  });
}

async function run() {
  token = await signIn(userEnv.TEST_USER_1_EMAIL, userEnv.TEST_USER_1_PASSWORD);
  const flag = (await request("app_settings?select=enabled&key=eq.vision_required")).data[0].enabled;
  assert.equal(flag, phase === "on", `vision_required should be ${phase}`);
  const before = await listing();
  assert.equal(before.status, "active", "the sample listing starts active");
  console.log(`vision_required ${phase}; listing active`);

  console.log("\n1. Adding a photo the check won't allow...");
  const previous = await latestScan();
  let photo = await addPhoto();
  try {
    const during = await listing();
    assert.equal(during.status, "active", "the listing stays active while the check runs");
    console.log("   listing still active right after the change");
    const check = await nextFinishedScan(previous, "automatic re-check");
    assert.notEqual(check.verdict, "allowed", "the check shouldn't allow this photo");
    const after = await listing();
    if (phase === "off") {
      assert.deepEqual(after, { status: "active", auto_paused_reason: null }, "flag off: re-check only, never a pause");
      console.log("   flag off: listing still active, no pause reason");
    } else {
      assert.equal(after.status, "paused", "flag on: the listing is paused");
      assert.ok(after.auto_paused_reason, "with a reason");
      console.log(`   flag on: listing paused - "${after.auto_paused_reason}"`);
    }

    console.log("\n2. Restoring the listing...");
    await removePhoto(photo);
    photo = null;
    if (phase === "off") {
      // Still active, so the server checks the original photos again by itself.
      await nextFinishedScan(check, "re-check of the original photos");
    } else {
      // Paused: the owner asks for the check, then republishes through the gate.
      const asked = await request("rpc/request_scan", { method: "POST", body: { p_listing_id: LISTING_ID } });
      assert.ok(asked.ok, `request_scan failed: ${asked.status} ${JSON.stringify(asked.data)}`);
      const scan = await nextFinishedScan(check, "owner's check of the original photos");
      assert.equal(scan.verdict, "allowed", "the original photos are allowed");
      const publish = await request(`listings?id=eq.${LISTING_ID}`, { method: "PATCH", body: { status: "active" } });
      assert.ok(publish.ok, `republish refused: ${publish.status} ${JSON.stringify(publish.data)}`);
    }
    const end = await listing();
    assert.deepEqual(end, { status: "active", auto_paused_reason: null }, "the listing ends active, no pause reason");
    console.log("   listing active again, no pause reason");
  } finally {
    if (photo) {
      await removePhoto(photo).catch(() => {});
      console.log("   (test photo removed after a failure)");
    }
  }
  console.log(`\nStep 8B re-check (${phase}) PASSED!`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
