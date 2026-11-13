// C3 integration: the rental lifecycle through the real API, Storage and Edge Functions (local only).
// 1. Full rental: test user 3 requests test user 1's piece, user 1 accepts, both add pickup photos
//    (a stranger can't), user 1 marks it picked up, delete-account refuses user 3 (DZ-E7010), user 1
//    adds return photos and marks it returned -> completed. Signed photo links work for the two people
//    only. The push stub records the request, the acceptance and the completion.
// 2. A decline, 3. a cancel with a reason, 4. an expiry (the request's deadline moved into the past).
// Prints only statuses, codes and counts: never emails, tokens or keys.
// Run: node supabase/tests/c3_rentals.mjs (the runner starts the stubs and functions first)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LIVE, REPO_ROOT, SERVICE_KEY, STUBS_URL, SUPABASE_KEY, SUPABASE_URL, sql, userEnv } from "./lib/config.mjs";

if (LIVE) {
  console.error("c3_rentals runs only against the local backend.");
  process.exit(1);
}

const L1 = "2fe0cfa6-a95e-4994-bbe4-f1bfb6760490"; // user 1, Emerald Velvet Cocktail Dress, $55/day
const L2 = "a79481ab-8f15-426c-b9db-f704b09e94f0"; // user 1, Linen Summer Sundress, $14/day
const PHOTO = readFileSync(join(REPO_ROOT, "supabase/seed/images/emerald-velvet-cocktail-dress/front.jpg"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const random = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`.padEnd(16, "x");

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Sign in failed: ${res.status}`);
  const data = await res.json();
  return { token: data.access_token, id: data.user.id };
}

async function call(token, func, body = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${func}`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, data: text ? JSON.parse(text) : null };
}

async function rpc(token, func, body = {}) {
  const res = await call(token, func, body);
  if (!res.ok) throw new Error(`${func} failed: ${res.status} ${res.data?.message ?? ""}`);
  return res.data;
}

async function upload(token, rentalId, stage) {
  const path = `${rentalId}/${stage}/${random()}.jpg`;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/rental-photos/${path}`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, "Content-Type": "image/jpeg" },
    body: PHOTO,
  });
  return { ok: res.ok, status: res.status, path };
}

async function signedLink(token, path) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/rental-photos/${path}`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 60 }),
  });
  if (!res.ok) return { ok: false, status: res.status };
  const data = await res.json();
  return { ok: true, url: `${SUPABASE_URL}/storage/v1${data.signedURL}` };
}

async function pushes(conversationId) {
  const log = await (await fetch(`${STUBS_URL}/log`)).json();
  return (log.push ?? []).filter((p) => p.conversation_id === conversationId).map((p) => p.kind);
}

async function waitFor(check, seconds) {
  for (let i = 0; i < seconds; i++) {
    if (await check()) return true;
    await sleep(1000);
  }
  return false;
}

async function run() {
  console.log("0. Clean start: no rentals on the two test pieces, no blocks with user 1...");
  sql(`delete from public.rentals where listing_id in ('${L1}', '${L2}')`);
  sql("delete from app_private.rate_counters where action = 'rental_request'");
  const u1 = await signIn(userEnv.TEST_USER_1_EMAIL, userEnv.TEST_USER_1_PASSWORD);
  const u2 = await signIn(userEnv.TEST_USER_2_EMAIL, userEnv.TEST_USER_2_PASSWORD);
  const u3 = await signIn(userEnv.TEST_USER_3_EMAIL, userEnv.TEST_USER_3_PASSWORD);
  sql(`delete from public.blocks where '${u1.id}' in (blocker_id, blocked_id)`);
  const tokens = [`c3-fake-lender-${Date.now()}`, `c3-fake-renter-${Date.now()}`];
  await rpc(u1.token, "register_push_token", { p_token: tokens[0], p_platform: "android" });
  await rpc(u3.token, "register_push_token", { p_token: tokens[1], p_platform: "android" });

  try {
    console.log("\n1. Full rental: request -> accepted -> picked up -> returned -> completed");
    const rentalId = await rpc(u3.token, "request_rental", { p_listing_id: L1, p_start: day(20), p_end: day(23) });
    let rental = await rpc(u3.token, "get_rental", { p_rental_id: rentalId });
    assert.equal(rental.status, "requested");
    assert.deepEqual([rental.price_per_day, rental.days, rental.total, rental.currency], [55, 4, 220, "USD"]);
    console.log(`   requested: ${rental.days} days, $${rental.total}`);

    const listing = (await rpc(u3.token, "my_rentals")).find((r) => r.id === rentalId);
    assert.ok(listing && listing.your_role === "renter", "my_rentals lists it for the renter");
    const lenderFirst = await rpc(u1.token, "my_rentals");
    assert.equal(lenderFirst[0]?.id, rentalId, "the lender sees the incoming request first");

    assert.equal(await rpc(u1.token, "respond_rental", { p_rental_id: rentalId, p_answer: "accept" }), "accepted");
    console.log("   accepted by the lender");

    const deleteRefused = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${u3.token}`, "Content-Type": "application/json" },
      body: "{}",
    });
    const deleteBody = await deleteRefused.json();
    assert.equal(deleteRefused.status, 409, "delete-account must refuse during a rental");
    assert.equal(deleteBody.code, "DZ-E7010");
    console.log(`   delete-account refused during the rental (${deleteRefused.status}, ${deleteBody.code})`);

    const early = await call(u1.token, "mark_picked_up", { p_rental_id: rentalId });
    assert.ok(!early.ok && early.data.message.startsWith("DZ-E4020"), "pickup needs 2 lender photos first");
    const stranger = await upload(u2.token, rentalId, "pickup");
    assert.ok(!stranger.ok, "a stranger's upload must be refused");
    const wrongStage = await upload(u3.token, rentalId, "return");
    assert.ok(!wrongStage.ok, "a return photo before pickup must be refused");
    const lenderPickup = [await upload(u1.token, rentalId, "pickup"), await upload(u1.token, rentalId, "pickup")];
    const renterPickup = await upload(u3.token, rentalId, "pickup");
    assert.ok(lenderPickup.every((u) => u.ok) && renterPickup.ok, "both people add pickup photos");
    console.log(`   photos: stranger ${stranger.status}, wrong stage ${wrongStage.status}, 3 pickup photos stored`);

    assert.equal(await rpc(u1.token, "mark_picked_up", { p_rental_id: rentalId, p_note: "Steamed, no marks" }), "picked_up");
    const lenderReturn = [await upload(u1.token, rentalId, "return"), await upload(u1.token, rentalId, "return")];
    assert.ok(lenderReturn.every((u) => u.ok), "the lender adds return photos");
    assert.equal(await rpc(u1.token, "mark_returned", { p_rental_id: rentalId }), "completed");
    rental = await rpc(u3.token, "get_rental", { p_rental_id: rentalId });
    assert.equal(rental.status, "completed");
    assert.deepEqual(rental.events.map((e) => e.to), ["requested", "accepted", "picked_up", "returned", "completed"]);
    assert.equal(rental.photos.length, 5);
    console.log(`   completed; timeline ${rental.events.length} steps, ${rental.photos.length} photos`);

    const link = await signedLink(u3.token, lenderPickup[0].path);
    assert.ok(link.ok, "the renter gets a signed link to the lender's photo");
    assert.equal((await fetch(link.url)).status, 200);
    const strangerLink = await signedLink(u2.token, lenderPickup[0].path);
    assert.ok(!strangerLink.ok, "a stranger gets no signed link");
    const publicUrl = await fetch(`${SUPABASE_URL}/storage/v1/object/public/rental-photos/${lenderPickup[0].path}`);
    assert.notEqual(publicUrl.status, 200, "the bucket isn't public");
    console.log(`   signed link opens for the renter; stranger ${strangerLink.status}; public address ${publicUrl.status}`);

    const conversationId = rental.conversation_id;
    const seen = await waitFor(async () => {
      const kinds = await pushes(conversationId);
      return ["rental_request", "rental_accepted", "rental_completed"].every((k) => kinds.includes(k));
    }, 30);
    assert.ok(seen, "the push stub should receive rental_request, rental_accepted and rental_completed");
    console.log(`   pushes recorded: ${(await pushes(conversationId)).filter((k) => k.startsWith("rental_")).join(", ")}`);

    console.log("\n2. Decline");
    const declinedId = await rpc(u2.token, "request_rental", { p_listing_id: L2, p_start: day(5), p_end: day(6) });
    assert.equal(await rpc(u1.token, "respond_rental", { p_rental_id: declinedId, p_answer: "decline", p_note: "Away that week" }), "declined");
    assert.equal((await rpc(u2.token, "get_rental", { p_rental_id: declinedId })).status, "declined");
    console.log("   declined");

    console.log("\n3. Cancel after acceptance, with a reason");
    const cancelId = await rpc(u2.token, "request_rental", { p_listing_id: L1, p_start: day(30), p_end: day(31) });
    assert.equal(await rpc(u1.token, "respond_rental", { p_rental_id: cancelId, p_answer: "accept" }), "accepted");
    const overlap = await call(u3.token, "request_rental", { p_listing_id: L1, p_start: day(31), p_end: day(33) });
    assert.ok(!overlap.ok && overlap.data.message.startsWith("DZ-E4009") && overlap.data.hint === "dates", "booked days refuse a new request");
    assert.equal(await rpc(u2.token, "cancel_rental", { p_rental_id: cancelId, p_reason: "Plans changed" }), "cancelled");
    const cancelled = await rpc(u1.token, "get_rental", { p_rental_id: cancelId });
    assert.equal(cancelled.status, "cancelled");
    assert.equal(cancelled.events.at(-1).note, "Plans changed");
    console.log("   overlap refused (DZ-E4009), then cancelled by the renter with the reason in the timeline");

    console.log("\n4. Expiry");
    const expiryId = await rpc(u3.token, "request_rental", { p_listing_id: L2, p_start: day(8), p_end: day(9) });
    sql(`update public.rentals set expires_at = now() - interval '1 minute' where id = '${expiryId}'`);
    sql("select app_private.expire_rental_requests()");
    const expired = await rpc(u3.token, "get_rental", { p_rental_id: expiryId });
    assert.equal(expired.status, "expired");
    assert.equal(expired.events.at(-1).by, "dzirent");
    const late = await call(u1.token, "respond_rental", { p_rental_id: expiryId, p_answer: "accept" });
    assert.ok(!late.ok && late.data.message.startsWith("DZ-E4012"), "an expired request can't be accepted");
    console.log("   expired by the system; accepting it afterwards is refused (DZ-E4012)");
  } finally {
    await rpc(u1.token, "unregister_push_token", { p_token: tokens[0] });
    await rpc(u3.token, "unregister_push_token", { p_token: tokens[1] });
    // Leave nothing behind for the other suites: the condition photo files (through the Storage
    // API with the local stack's service key; people can't delete them), these rentals, and the
    // chats test user 2 started with test user 1.
    const files = sql(`select name from storage.objects where bucket_id = 'rental-photos'
      and (string_to_array(name, '/'))[1] in (select id::text from public.rentals where listing_id in ('${L1}', '${L2}'))`);
    if (files.length && SERVICE_KEY) {
      await fetch(`${SUPABASE_URL}/storage/v1/object/rental-photos`, {
        method: "DELETE",
        // A new-style secret key goes in apikey only; the legacy service_role key is also the bearer.
        headers: {
          apikey: SERVICE_KEY,
          ...(SERVICE_KEY.startsWith("sb_secret_") ? {} : { Authorization: `Bearer ${SERVICE_KEY}` }),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prefixes: files.map((f) => f.name) }),
      });
    }
    sql(`delete from public.rentals where listing_id in ('${L1}', '${L2}')`);
    sql(`delete from public.conversations where renter_id = '${u2.id}' and lender_id = '${u1.id}'`);
    console.log(`\n   cleaned up: ${files.length} condition photo files, the test rentals and user 2's chats with user 1`);
  }

  console.log("\nAll C3 rental checks PASSED!");
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
