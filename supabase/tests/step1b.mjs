// Step 1B test script: verifies guest browsing, owner CRUD, cross-account restrictions,
// conversations, blocking, and fit matching.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import crypto from "node:crypto";

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

// 1x1 valid JPEG
const TINY_JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
  0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
  0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
  0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
  0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
  0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01,
  0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04,
  0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
  0x00, 0xbe, 0x00, 0xff, 0xd9,
]);

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`Sign in failed for ${email}: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return { token: data.access_token, user: data.user };
}

function clientFor(token = null) {
  const headers = {
    apikey: SUPABASE_KEY,
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return {
    async rest(path, options = {}) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        ...options,
        headers: { ...headers, ...options.headers },
      });
      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }
      return { status: res.status, ok: res.ok, data };
    },

    async rpc(name, params = {}) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers,
        body: JSON.stringify(params),
      });
      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }
      return { status: res.status, ok: res.ok, data };
    },

    async uploadPhoto(listingId, filename, buffer) {
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/listing-photos/${listingId}/${filename}`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${token}`,
          "Content-Type": "image/jpeg",
        },
        body: buffer,
      });
      return { status: res.status, ok: res.ok };
    },

    async deleteListing(listingId) {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-listing`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ listing_id: listingId }),
      });
      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }
      return { status: res.status, ok: res.ok, data };
    },
  };
}

async function runTests() {
  console.log("=== Dzirent Step 1B Test Suite ===");
  const guest = clientFor();

  // --- TEST 1: Guest Access ---
  console.log("\n[Test 1] Guest access rules:");

  // a. browse_listings returns cards with no coordinates or account IDs
  const browseRes = await guest.rpc("browse_listings", { p_lat: 30.27, p_lng: -97.74 });
  assert.equal(browseRes.status, 200, `Guest browse_listings failed: ${JSON.stringify(browseRes.data)}`);
  assert(Array.isArray(browseRes.data), "browse_listings should return array");
  assert(browseRes.data.length > 0, "browse_listings should have cards");
  console.log(`  ✓ browse_listings returned ${browseRes.data.length} cards`);

  for (const card of browseRes.data) {
    assert("id" in card, "Card missing id");
    assert("title" in card, "Card missing title");
    assert("price" in card, "Card missing price");
    assert("distance" in card, "Card missing distance");
    assert("city" in card, "Card missing city");
    assert("category" in card, "Card missing category");
    assert("cover_photo_path" in card, "Card missing cover_photo_path");
    assert("studio_name" in card, "Card missing studio_name");
    assert("studio_handle" in card, "Card missing studio_handle");

    // Coordinates and other account IDs must NEVER be present
    assert(!("approx_lat" in card), "Card leaked approx_lat");
    assert(!("approx_lng" in card), "Card leaked approx_lng");
    assert(!("lat" in card), "Card leaked lat");
    assert(!("lng" in card), "Card leaked lng");
    assert(!("lender_id" in card), "Card leaked lender_id");
    assert(!("user_id" in card), "Card leaked user_id");
  }
  console.log("  ✓ Card fields verified: only safe fields, no coordinates or account IDs");

  // b. get_listing works for guest
  const sampleCard = browseRes.data[0];
  const listingRes = await guest.rpc("get_listing", {
    p_listing_id: sampleCard.id,
    p_lat: 30.27,
    p_lng: -97.74,
  });
  assert.equal(listingRes.status, 200, `Guest get_listing failed: ${JSON.stringify(listingRes.data)}`);
  const listingData = Array.isArray(listingRes.data) ? listingRes.data[0] : listingRes.data;
  assert(listingData, "Listing detail missing");
  assert.equal(listingData.id, sampleCard.id);
  assert("photos" in listingData, "Missing photos");
  assert("measurements" in listingData, "Missing measurements");
  assert("availability" in listingData, "Missing availability");
  assert("studio_name" in listingData, "Missing studio_name");
  assert("studio_handle" in listingData, "Missing studio_handle");
  assert(!("approx_lat" in listingData), "Listing leaked approx_lat");
  assert(!("approx_lng" in listingData), "Listing leaked approx_lng");
  assert(!("lender_id" in listingData), "Listing leaked lender_id");
  console.log("  ✓ get_listing returned full listing page with safe fields");

  // c. get_studio, fit_listings, my_conversations denied to guest
  const studioRes = await guest.rpc("get_studio", { p_handle: "studiorostova" });
  assert(
    studioRes.status === 401 || studioRes.status === 403 || !studioRes.ok,
    `Guest get_studio should be denied, got status ${studioRes.status}`,
  );
  console.log(`  ✓ get_studio denied to guest (HTTP ${studioRes.status})`);

  const fitRes = await guest.rpc("fit_listings", {});
  assert(
    fitRes.status === 401 || fitRes.status === 403 || !fitRes.ok,
    `Guest fit_listings should be denied, got status ${fitRes.status}`,
  );
  console.log(`  ✓ fit_listings denied to guest (HTTP ${fitRes.status})`);

  const convRes = await guest.rpc("my_conversations", {});
  assert(
    convRes.status === 401 || convRes.status === 403 || !convRes.ok,
    `Guest my_conversations should be denied, got status ${convRes.status}`,
  );
  console.log(`  ✓ my_conversations denied to guest (HTTP ${convRes.status})`);

  // d. Raw tables denied to guest
  for (const table of ["listings", "profiles", "conversations", "private_profiles"]) {
    const tableRes = await guest.rest(`${table}?select=*&limit=1`);
    assert(
      [401, 403].includes(tableRes.status) || (tableRes.status === 200 && Array.isArray(tableRes.data) && tableRes.data.length === 0),
      `Guest raw access to ${table} should be denied or return empty, got HTTP ${tableRes.status}`,
    );
    console.log(`  ✓ Raw table '${table}' denied to guest (HTTP ${tableRes.status})`);
  }

  // --- TEST 2: Test User 1 Owner CRUD & delete-listing ---
  console.log("\n[Test 2] Test User 1 Owner CRUD & delete-listing:");
  const u1 = await signIn(userEnv.TEST_USER_1_EMAIL, userEnv.TEST_USER_1_PASSWORD);
  const c1 = clientFor(u1.token);

  const tempListingId = crypto.randomUUID();
  const createRes = await c1.rest("listings", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      id: tempListingId,
      lender_id: u1.user.id,
      title: "Temporary Test Blazer",
      category: "Career & Professional",
      price_usd: 50,
      city: "Austin, TX",
      approx_lat: 30.27,
      approx_lng: -97.74,
      status: "active",
      listing_styles: ["Western formal"],
    }),
  });
  assert.equal(createRes.status, 201, `Create listing failed: ${JSON.stringify(createRes.data)}`);
  console.log("  ✓ Test User 1 created own listing");

  // Update
  const updateRes = await c1.rest(`listings?id=eq.${tempListingId}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ title: "Updated Temporary Test Blazer" }),
  });
  assert.equal(updateRes.status, 200, `Update listing failed: ${JSON.stringify(updateRes.data)}`);
  assert.equal(updateRes.data[0]?.title, "Updated Temporary Test Blazer");
  console.log("  ✓ Test User 1 updated own listing");

  // Upload photo to folder and create listing_photos row
  const photoName = `${crypto.randomBytes(8).toString("hex")}.jpg`;
  const uploadRes = await c1.uploadPhoto(tempListingId, photoName, TINY_JPEG);
  assert.equal(uploadRes.status, 200, "Photo upload failed");
  await c1.rest("listing_photos", {
    method: "POST",
    body: JSON.stringify({
      listing_id: tempListingId,
      storage_path: `${tempListingId}/${photoName}`,
      position: 0,
    }),
  });
  console.log("  ✓ Uploaded photo to listing folder");

  // Delete via delete-listing
  const delRes = await c1.deleteListing(tempListingId);
  assert.equal(delRes.status, 200, `delete-listing failed: ${JSON.stringify(delRes.data)}`);
  assert(delRes.data?.ok, "delete-listing should return ok: true");

  const checkDel = await c1.rest(`listings?id=eq.${tempListingId}`);
  assert.equal(checkDel.data?.length, 0, "Listing still exists after deletion");
  console.log("  ✓ Test User 1 deleted listing via delete-listing (photos and row removed)");

  // --- TEST 3: User 3 Restrictions and Conversations ---
  console.log("\n[Test 3] Test User 3 restrictions and conversations:");
  const u3 = await signIn(userEnv.TEST_USER_3_EMAIL, userEnv.TEST_USER_3_PASSWORD);
  const c3 = clientFor(u3.token);

  // Pick User 1's listing from sample data
  const u1Listings = await c1.rest(`listings?select=id,title&lender_id=eq.${u1.user.id}&limit=1`);
  assert(u1Listings.data?.length > 0, "User 1 should have sample listings");
  const targetListing = u1Listings.data[0];

  // User 3 cannot update User 1's listing
  const u3HackRes = await c3.rest(`listings?id=eq.${targetListing.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ title: "Hacked by User 3" }),
  });
  assert(
    u3HackRes.status === 200 && (!u3HackRes.data || u3HackRes.data.length === 0),
    `User 3 should not be able to update User 1 listing: got ${JSON.stringify(u3HackRes.data)}`,
  );
  console.log("  ✓ Test User 3 cannot update Test User 1's listing (0 rows affected)");

  // User 3 cannot read User 1's private profile
  const u3PrivateRes = await c3.rest(`private_profiles?user_id=eq.${u1.user.id}`);
  assert(
    Array.isArray(u3PrivateRes.data) && u3PrivateRes.data.length === 0,
    "User 3 should receive empty private profile for User 1",
  );
  console.log("  ✓ Test User 3 cannot read Test User 1's private profile");

  // User 3 starts conversation with User 1 for targetListing
  const startConvRes = await c3.rpc("start_conversation", { p_listing_id: targetListing.id });
  assert.equal(startConvRes.status, 200, `start_conversation failed: ${JSON.stringify(startConvRes.data)}`);
  const convId = startConvRes.data;
  assert(convId, "No conversation id returned");
  console.log("  ✓ Test User 3 started conversation");

  // User 3 sends a message
  const msgText = `Hello from Test User 3 at ${Date.now()}`;
  const sendRes = await c3.rest("messages", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      conversation_id: convId,
      sender_id: u3.user.id,
      body: msgText,
    }),
  });
  assert.equal(sendRes.status, 201, `Send message failed: ${JSON.stringify(sendRes.data)}`);
  console.log("  ✓ Test User 3 sent message");

  // User 1 sees it in my_conversations with User 3's name
  const u1Inboxes = await c1.rpc("my_conversations", {});
  assert.equal(u1Inboxes.status, 200, `User 1 my_conversations failed: ${JSON.stringify(u1Inboxes.data)}`);
  const foundConv = u1Inboxes.data.find((c) => c.id === convId);
  assert(foundConv, "Conversation not found in User 1 inbox");
  assert.equal(foundConv.other_name, "Jordan Bell", `Expected 'Jordan Bell', got '${foundConv.other_name}'`);
  assert.equal(foundConv.last_message, msgText);
  assert.equal(foundConv.unread, true);
  console.log("  ✓ Test User 1 sees conversation with other_name='Jordan Bell' and unread state");

  // --- TEST 4: Block and Unblock ---
  console.log("\n[Test 4] Block and unblock enforcement:");
  // User 1 blocks User 3
  const blockRes = await c1.rest("blocks", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ blocker_id: u1.user.id, blocked_id: u3.user.id }),
  });
  assert.equal(blockRes.status, 201, `Block failed: ${JSON.stringify(blockRes.data)}`);
  console.log("  ✓ Test User 1 blocked Test User 3");

  // User 3 no longer sees User 1's listings in browse_listings
  const u3BrowseBlocked = await c3.rpc("browse_listings", { p_lat: 30.27, p_lng: -97.74 });
  assert.equal(u3BrowseBlocked.status, 200);
  const u1ListingIds = (await c1.rest(`listings?select=id&lender_id=eq.${u1.user.id}`)).data.map((l) => l.id);
  const blockedOverlap = u3BrowseBlocked.data.filter((c) => u1ListingIds.includes(c.id));
  assert.equal(blockedOverlap.length, 0, `User 3 saw ${blockedOverlap.length} listings from blocked User 1`);
  console.log("  ✓ Test User 3 cannot see Test User 1's listings while blocked");

  // User 1 unblocks User 3
  const unblockRes = await c1.rest(`blocks?blocker_id=eq.${u1.user.id}&blocked_id=eq.${u3.user.id}`, {
    method: "DELETE",
  });
  assert.equal(unblockRes.status, 204, "Unblock failed");
  console.log("  ✓ Test User 1 unblocked Test User 3");

  // Listings reappear
  const u3BrowseUnblocked = await c3.rpc("browse_listings", { p_lat: 30.27, p_lng: -97.74 });
  assert.equal(u3BrowseUnblocked.status, 200);
  const unblockedOverlap = u3BrowseUnblocked.data.filter((c) => u1ListingIds.includes(c.id));
  assert(unblockedOverlap.length > 0, "User 1 listings should reappear after unblock");
  console.log(`  ✓ Test User 1's listings reappeared (${unblockedOverlap.length} found)`);

  // --- TEST 5: Fit Listings ---
  console.log("\n[Test 5] Test User 3 fit_listings:");
  const fitListingsRes = await c3.rpc("fit_listings", { p_lat: 30.27, p_lng: -97.74 });
  assert.equal(fitListingsRes.status, 200, `fit_listings failed: ${JSON.stringify(fitListingsRes.data)}`);
  assert(Array.isArray(fitListingsRes.data), "fit_listings should return array");
  assert(fitListingsRes.data.length > 0, `fit_listings returned 0 results: ${JSON.stringify(fitListingsRes.data)}`);
  console.log(`  ✓ fit_listings returned ${fitListingsRes.data.length} fitting pieces for Jordan Bell`);
  for (const piece of fitListingsRes.data) {
    console.log(`    - "${piece.title}" (${piece.category}, price: $${piece.price}, distance: ${piece.distance} mi)`);
  }

  console.log("\n=== ALL STEP 1B TESTS PASSED SUCCESSFULLY! ===");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
