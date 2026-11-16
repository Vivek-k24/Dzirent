// Test sample listing photos
import { readFileSync } from "node:fs";

function loadEnvFile(path) {
  const env = {};
  try {
    const content = readFileSync(path, "utf8");
    for (const line of content.split(/\r?\n/)) {
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

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Sign in failed for a test user (no address shown): HTTP ${res.status}`);
  const data = await res.json();
  return { token: data.access_token, user: data.user };
}

async function verifyPublicUrl(path) {
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/listing-photos/${path}`;
  const res = await fetch(publicUrl);
  return { status: res.status, ok: res.ok, length: res.headers.get("content-length") };
}

async function main() {
  console.log("=== 1. Test browse_listings as guest ===");
  const browseRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/browse_listings`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_limit: 30, p_offset: 0 }),
  });
  if (!browseRes.ok) throw new Error(`browse_listings failed: ${browseRes.status}`);
  const listings = await browseRes.json();
  console.log(`browse_listings returned ${listings.length} listings:`);

  let guestAllOk = true;
  for (const item of listings) {
    if (!item.cover_photo_path) {
      console.error(`FAIL: ${item.title} has NO cover photo path!`);
      guestAllOk = false;
      continue;
    }
    const check = await verifyPublicUrl(item.cover_photo_path);
    if (!check.ok) {
      console.error(`FAIL: ${item.title} cover photo returned HTTP ${check.status} (${item.cover_photo_path})`);
      guestAllOk = false;
    } else {
      console.log(`  OK: [${item.title}] cover: ${item.cover_photo_path} (HTTP ${check.status}, ${check.length} bytes)`);
    }
  }

  console.log("\n=== 2. Sign in as Elena (User 1) ===");
  const u1 = await signIn(userEnv.TEST_USER_1_EMAIL, userEnv.TEST_USER_1_PASSWORD);
  const u1ListingsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/listings?lender_id=eq.${u1.user.id}&select=id,title&order=created_at.asc`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${u1.token}` } }
  );
  const u1Listings = await u1ListingsRes.json();
  for (const l of u1Listings) {
    const pRes = await fetch(
      `${SUPABASE_URL}/rest/v1/listing_photos?listing_id=eq.${l.id}&select=*&order=position.asc`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${u1.token}` } }
    );
    const photos = await pRes.json();
    console.log(`[Elena] ${l.title}: ${photos.length} photo(s)`);
    for (const p of photos) {
      const check = await verifyPublicUrl(p.storage_path);
      console.log(`   - slot=${p.slot}, pos=${p.position}, HTTP ${check.status}, ${check.length} bytes (${p.storage_path})`);
    }
  }

  console.log("\n=== 3. Sign in as Maya (User 2) ===");
  const u2 = await signIn(userEnv.TEST_USER_2_EMAIL, userEnv.TEST_USER_2_PASSWORD);
  const u2ListingsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/listings?lender_id=eq.${u2.user.id}&select=id,title&order=created_at.asc`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${u2.token}` } }
  );
  const u2Listings = await u2ListingsRes.json();
  for (const l of u2Listings) {
    const pRes = await fetch(
      `${SUPABASE_URL}/rest/v1/listing_photos?listing_id=eq.${l.id}&select=*&order=position.asc`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${u2.token}` } }
    );
    const photos = await pRes.json();
    console.log(`[Maya] ${l.title}: ${photos.length} photo(s)`);
    for (const p of photos) {
      const check = await verifyPublicUrl(p.storage_path);
      console.log(`   - slot=${p.slot}, pos=${p.position}, HTTP ${check.status}, ${check.length} bytes (${p.storage_path})`);
    }
  }
}

main().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
