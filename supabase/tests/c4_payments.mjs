// C4 integration against stripe-mock (local backend only; the runner serves the functions with
// supabase/functions/local.stripe-mock.env). The stub server records every Stripe call and passes
// it to stripe-mock, which checks each request against Stripe's API definition. Stripe's state
// changes reach Dzirent as webhooks, so this script sends signed events (local test secret).
//  0. payments_enabled off: every payment function answers DZ-E4030 (keys set).
//  1. Onboarding: an Express account (once, however often it's asked), an onboarding link, the
//     status refresh, account.updated.
//  2. Payment: a destination charge with the fee, saved for off-session use; asked twice, one
//     PaymentIntent. Webhooks: unsigned, wrongly signed and stale events refused; succeeded ->
//     paid; the same event again processed once.
//  3. Deposit: pickup refused without the hold; the hold placed (manual capture, off-session);
//     amount_capturable_updated -> held; pickup; return opens the claim window.
//  4. Claim: refusals (who, amount, photos); filed (push to the renter); accepted -> captured
//     through the outbox; the same step retried makes no second Stripe call.
//  5. A second rental: no claim before the window ends -> released, completed.
//  6. A third rental: paid, cancelled by the renter early -> full refund through the outbox.
// Leaves nothing behind. Prints only statuses, codes, amounts and counts.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LIVE, REPO_ROOT, SERVICE_KEY, STUBS_URL, SUPABASE_URL, sql, userEnv } from "./lib/config.mjs";
import {
  call, day, fn, fnRaw, pushes, rest, rpc, signIn, signedEvent, stripeLog, uploadConditionPhoto, waitFor,
} from "./lib/c4.mjs";

if (LIVE) {
  console.error("c4_payments runs only against the local backend.");
  process.exit(1);
}

const L1 = "2fe0cfa6-a95e-4994-bbe4-f1bfb6760490"; // user 1, Emerald Velvet Cocktail Dress, $55/day
const SECRET = "whsec_local_test_secret";
const JOB = { "x-payments-secret": "local-payments-secret" };
const PHOTO = readFileSync(join(REPO_ROOT, "supabase/seed/images/emerald-velvet-cocktail-dress/front.jpg"));
const RUN = Date.now().toString(36);
let eventNo = 0;
const evt = () => `evt_c4_${RUN}_${++eventNo}`;

async function webhook(type, object, opts) {
  const e = signedEvent(SECRET, evt(), type, object, opts);
  const res = await fnRaw("stripe-webhook", e.body, { "Stripe-Signature": e.header });
  return { ...res, event: e };
}

const rental = (id) => sql(`select status, payment_status, deposit_status, payment_intent_id, deposit_intent_id,
  fee_amount::float as fee, refund_amount::float as refunded, deposit_captured_amount::float as captured,
  deposit_capture_before is not null as has_capture_before, claim_window_ends_at is not null as has_window
  from public.rentals where id = '${id}'`)[0];
const operation = (rentalId, kind) => sql(`select id, status, stripe_id, error from app_private.payment_operations
  where rental_id = '${rentalId}' and kind = '${kind}' order by created_at desc limit 1`)[0];
const calls = async (method, pathPrefix) => (await stripeLog()).filter((c) => c.method === method && c.path.startsWith(pathPrefix));

async function waitForOperation(rentalId, kind) {
  let op = null;
  const ok = await waitFor(() => {
    op = operation(rentalId, kind);
    return op && ["done", "failed"].includes(op.status);
  }, 40);
  assert.ok(ok, `the ${kind} step should finish through the outbox (last: ${op?.status ?? "none"})`);
  assert.equal(op.status, "done", `${kind}: ${op.error ?? ""}`);
  return op;
}

/** Request -> accept -> pay -> succeeded webhook: a paid rental. */
async function paidRental(u1, u3, start, end) {
  const id = await rpc(u3.token, "request_rental", { p_listing_id: L1, p_start: day(start), p_end: day(end) });
  assert.equal(await rpc(u1.token, "respond_rental", { p_rental_id: id, p_answer: "accept" }), "awaiting_payment");
  const pay = await fn("stripe-pay", { token: u3.token, body: { rental_id: id } });
  assert.equal(pay.status, 200, `stripe-pay: ${pay.status} ${JSON.stringify(pay.data)}`);
  const ok = await webhook("payment_intent.succeeded", {
    id: pay.data.payment_intent_id, object: "payment_intent", status: "succeeded", payment_method: "pm_card_visa",
    amount_received: Math.round(pay.data.amount * 100),
  });
  assert.equal(ok.data?.result, "rental_paid");
  return id;
}

/** Two lender pickup photos, the hold placed and confirmed, picked up. */
async function pickedUp(u1, id) {
  for (let i = 0; i < 2; i++) { const up = await uploadConditionPhoto(u1.token, id, "pickup", PHOTO); assert.ok(up.ok, `pickup photo: ${up.status} ${up.body ?? ""}`); }
  const placed = await fn("stripe-deposit", { token: u1.token, body: { action: "place", rental_id: id } });
  assert.equal(placed.status, 202, `place: ${placed.status} ${JSON.stringify(placed.data)}`);
  const hold = rental(id).deposit_intent_id;
  assert.equal((await webhook("payment_intent.amount_capturable_updated", {
    id: hold, object: "payment_intent", status: "requires_capture", amount_capturable: 5000, latest_charge: "ch_c4test",
  })).data?.result, "deposit_held");
  const done = await fn("stripe-deposit", { token: u1.token, body: { action: "place", rental_id: id } });
  assert.equal(done.status, 200, `place again: ${done.status} ${JSON.stringify(done.data)}`);
  assert.equal(done.data.status, "picked_up");
  return hold;
}

async function returned(u1, id) {
  const paths = [];
  for (let i = 0; i < 2; i++) {
    const up = await uploadConditionPhoto(u1.token, id, "return", PHOTO);
    assert.ok(up.ok, `return photo: ${up.status} ${up.body ?? ""}`);
    paths.push(up.path);
  }
  assert.equal(await rpc(u1.token, "mark_returned", { p_rental_id: id }), "returned");
  return paths;
}

async function run() {
  const u1 = await signIn(userEnv.TEST_USER_1_EMAIL, userEnv.TEST_USER_1_PASSWORD);
  const u2 = await signIn(userEnv.TEST_USER_2_EMAIL, userEnv.TEST_USER_2_PASSWORD);
  const u3 = await signIn(userEnv.TEST_USER_3_EMAIL, userEnv.TEST_USER_3_PASSWORD);
  const people = `'${u1.id}', '${u3.id}'`;
  const cleanup = () => {
    sql(`delete from app_private.payment_operations where rental_id in (select id from public.rentals where listing_id = '${L1}')`);
    sql(`delete from public.rentals where listing_id = '${L1}'`);
    sql(`delete from public.payout_accounts where user_id in (${people})`);
    sql(`delete from public.stripe_customers where user_id in (${people})`);
    sql("delete from app_private.rate_counters where action = 'rental_request'");
  };
  sql(`delete from public.blocks where '${u1.id}' in (blocker_id, blocked_id)`);
  cleanup();
  await fetch(`${STUBS_URL}/log`, { method: "DELETE" });
  const tokens = [`c4-lender-${RUN}`, `c4-renter-${RUN}`];
  await rpc(u1.token, "register_push_token", { p_token: tokens[0], p_platform: "android" });
  await rpc(u3.token, "register_push_token", { p_token: tokens[1], p_platform: "android" });

  try {
    console.log("0. Keys set, payments_enabled off: every payment function answers DZ-E4030");
    sql("update public.app_settings set enabled = false where key = 'payments_enabled'");
    for (const [name, opts] of [
      ["stripe-onboard", { token: u1.token }],
      ["stripe-pay", { token: u3.token, body: { rental_id: L1 } }],
      ["stripe-deposit", { token: u1.token, body: { action: "place", rental_id: L1 } }],
      ["stripe-refund", { body: { operation_id: L1 }, headers: JOB }],
    ]) {
      const res = await fn(name, opts);
      assert.deepEqual([res.status, res.data?.code], [503, "DZ-E4030"], `${name} while off: ${res.status} ${JSON.stringify(res.data)}`);
    }
    const offHook = await webhook("payment_intent.succeeded", { id: "pi_off" });
    assert.deepEqual([offHook.status, offHook.data?.code], [503, "DZ-E4030"], "the webhook while off");
    console.log("   5 functions: 503 DZ-E4030");

    sql("update public.app_settings set enabled = true where key = 'payments_enabled'");
    sql("update app_private.settings set value = '10'::jsonb where key = 'platform_fee_percent'");
    sql(`update public.listings set deposit_amount = 50 where id = '${L1}'`);

    console.log("\n1. Onboarding");
    const first = await fn("stripe-onboard", { token: u1.token });
    assert.equal(first.status, 200, `onboard: ${first.status} ${JSON.stringify(first.data)}`);
    assert.match(first.data.url, /^https:\/\//);
    const second = await fn("stripe-onboard", { token: u1.token });
    assert.equal(second.status, 200);
    const accounts = await calls("POST", "/v1/accounts");
    assert.equal(accounts.length, 1, "asked twice, one Express account is created");
    assert.deepEqual([accounts[0].params.type, accounts[0].params.country, accounts[0].params["capabilities[transfers][requested]"]],
      ["express", "US", "true"]);
    assert.equal(accounts[0].idempotency_key, `dz-acct-${u1.id}`);
    assert.equal((await calls("POST", "/v1/account_links")).length, 2, "a new onboarding link each time");
    const account = sql(`select stripe_account_id from public.payout_accounts where user_id = '${u1.id}'`)[0].stripe_account_id;
    const status = await fn("stripe-account-status", { token: u1.token });
    assert.equal(status.status, 200);
    assert.equal((await calls("GET", `/v1/accounts/${account}`)).length, 1, "the status is read from Stripe");
    const updated = await webhook("account.updated", { id: account, object: "account", charges_enabled: true, payouts_enabled: true, details_submitted: true }, { account });
    assert.equal(updated.data?.result, "account_updated");
    assert.equal(sql(`select charges_enabled from public.payout_accounts where user_id = '${u1.id}'`)[0].charges_enabled, true);
    const own = await rest(u1.token, "payout_accounts?select=user_id");
    const other = await rest(u3.token, `payout_accounts?select=user_id&user_id=eq.${u1.id}`);
    assert.deepEqual([own.data.length, other.data.length], [1, 0], "only the owner reads their payout account");
    console.log(`   one account (${accounts.length} create, key per person), ${2} links, status refreshed, account.updated -> charges on; others read 0 rows`);

    console.log("\n2. Payment");
    const r1 = await rpc(u3.token, "request_rental", { p_listing_id: L1, p_start: day(20), p_end: day(23) });
    assert.equal(await rpc(u1.token, "respond_rental", { p_rental_id: r1, p_answer: "accept" }), "awaiting_payment", "accept waits for payment");
    const lenderPays = await fn("stripe-pay", { token: u1.token, body: { rental_id: r1 } });
    assert.deepEqual([lenderPays.status, lenderPays.data?.code], [403, "DZ-E4032"], "the lender can't pay");
    const strangerPays = await fn("stripe-pay", { token: u2.token, body: { rental_id: r1 } });
    assert.deepEqual([strangerPays.status, strangerPays.data?.code], [404, "DZ-E4001"], "a stranger can't pay");
    const pay = await fn("stripe-pay", { token: u3.token, body: { rental_id: r1 } });
    assert.equal(pay.status, 200, `stripe-pay: ${pay.status} ${JSON.stringify(pay.data)}`);
    assert.ok(pay.data.client_secret && pay.data.publishable_key === "pk_test_stripemock");
    const again = await fn("stripe-pay", { token: u3.token, body: { rental_id: r1 } });
    assert.equal(again.data.payment_intent_id, pay.data.payment_intent_id, "asked twice, the same PaymentIntent");
    const intents = (await calls("POST", "/v1/payment_intents")).filter((c) => c.params["metadata[rental_id]"] === r1);
    assert.equal(intents.length, 1, "one PaymentIntent create for the rental");
    const p = intents[0].params;
    assert.deepEqual([p.amount, p.currency, p["transfer_data[destination]"], p.application_fee_amount, p.setup_future_usage, p.customer],
      ["22000", "usd", account, "2200", "off_session", sql(`select stripe_customer_id from public.stripe_customers where user_id = '${u3.id}'`)[0].stripe_customer_id]);
    assert.equal(intents[0].idempotency_key, `dz-pay-${r1}`);
    assert.equal((await calls("POST", "/v1/customers")).length, 1, "one customer for the renter");
    assert.deepEqual([rental(r1).payment_status, rental(r1).fee], ["pending", 22]);
    console.log("   $220.00 destination charge to the lender, fee $22.00 (10%), saved for off-session; asked twice: 1 create");

    console.log("\n   Webhooks");
    const succeeded = { id: pay.data.payment_intent_id, object: "payment_intent", status: "succeeded", payment_method: "pm_card_visa", amount_received: 22000 };
    const body = JSON.stringify({ id: evt(), object: "event", type: "payment_intent.succeeded", data: { object: succeeded } });
    const unsigned = await fnRaw("stripe-webhook", body);
    const wrong = await fnRaw("stripe-webhook", body, { "Stripe-Signature": signedEvent("whsec_wrong", "x", "x", {}).header });
    const stale = signedEvent(SECRET, evt(), "payment_intent.succeeded", succeeded, { time: Math.floor(Date.now() / 1000) - 3600 });
    const staleRes = await fnRaw("stripe-webhook", stale.body, { "Stripe-Signature": stale.header });
    for (const [label, res] of [["unsigned", unsigned], ["wrong secret", wrong], ["an hour old", staleRes]]) {
      assert.deepEqual([res.status, res.data?.code], [400, "DZ-E4038"], `${label} event refused`);
    }
    assert.equal(rental(r1).status, "awaiting_payment", "a refused event changes nothing");
    const okEvent = signedEvent(SECRET, evt(), "payment_intent.succeeded", succeeded);
    const firstTime = await fnRaw("stripe-webhook", okEvent.body, { "Stripe-Signature": okEvent.header });
    assert.equal(firstTime.data?.result, "rental_paid");
    const secondTime = await fnRaw("stripe-webhook", okEvent.body, { "Stripe-Signature": okEvent.header });
    assert.deepEqual([secondTime.status, secondTime.data?.result], [200, "duplicate"]);
    const recorded = sql(`select count(*)::int as n, bool_and(processed_at is not null) as done from app_private.payment_events where stripe_event_id = '${JSON.parse(okEvent.body).id}'`)[0];
    const paidEvents = sql(`select count(*)::int as n from public.rental_events where rental_id = '${r1}' and to_status = 'paid'`)[0].n;
    assert.deepEqual([recorded.n, recorded.done, paidEvents, rental(r1).status, rental(r1).payment_status], [1, true, 1, "paid", "paid"]);
    console.log("   unsigned / wrong secret / stale: 400 DZ-E4038; succeeded -> paid; the same event again: duplicate, processed once");

    console.log("\n3. Deposit hold");
    for (let i = 0; i < 2; i++) { const up = await uploadConditionPhoto(u1.token, r1, "pickup", PHOTO); assert.ok(up.ok, `pickup photo: ${up.status}`); }
    const noHold = await call(u1.token, "mark_picked_up", { p_rental_id: r1 });
    assert.ok(!noHold.ok && noHold.data.message.startsWith("DZ-E4033"), "pickup needs the hold first");
    const renterPlaces = await fn("stripe-deposit", { token: u3.token, body: { action: "place", rental_id: r1 } });
    assert.deepEqual([renterPlaces.status, renterPlaces.data?.code], [403, "DZ-E4002"], "only the lender places the hold");
    const lenderReleases = await fn("stripe-deposit", { token: u1.token, body: { action: "release", rental_id: r1 } });
    assert.deepEqual([lenderReleases.status, lenderReleases.data?.code], [400, "DZ-E9016"], "people can't release or capture");
    const hold1 = await pickedUp(u1, r1);
    const holds = (await calls("POST", "/v1/payment_intents")).filter((c) => c.params.capture_method === "manual" && c.params["metadata[rental_id]"] === r1);
    assert.equal(holds.length, 1, `one hold, however often pickup is asked (saw ${holds.length})`);
    const h = holds[0].params;
    assert.deepEqual([h.amount, h.off_session, h.confirm, h.payment_method, h["transfer_data[destination]"]], ["5000", "true", "true", "pm_card_visa", account]);
    assert.match(holds[0].idempotency_key, /^dz-op-[0-9a-f-]{36}$/);
    assert.deepEqual([rental(r1).status, rental(r1).deposit_status, rental(r1).has_capture_before], ["picked_up", "held", true]);
    const evidence = await returned(u1, r1);
    assert.equal(rental(r1).has_window, true, "the claim window is open");
    console.log("   $50.00 manual-capture hold, off-session on the saved card; webhook -> held; picked up; returned, claim window open");

    console.log("\n4. Claim");
    const claimArgs = { p_rental_id: r1, p_amount: 30, p_reason: "Wine stain on the hem", p_photo_paths: [evidence[0]] };
    const byRenter = await call(u3.token, "file_claim", claimArgs);
    assert.ok(!byRenter.ok && byRenter.data.message.startsWith("DZ-E4002"), "only the lender files a claim");
    const tooMuch = await call(u1.token, "file_claim", { ...claimArgs, p_amount: 60 });
    assert.ok(!tooMuch.ok && tooMuch.data.message.startsWith("DZ-E4041") && tooMuch.data.hint === "amount", "up to the deposit");
    const pickupPhoto = sql(`select name from storage.objects where bucket_id = 'rental-photos' and name like '${r1}/pickup/%' limit 1`)[0].name;
    const wrongPhoto = await call(u1.token, "file_claim", { ...claimArgs, p_photo_paths: [pickupPhoto] });
    assert.ok(!wrongPhoto.ok && wrongPhoto.data.message.startsWith("DZ-E4043"), "evidence must be a return photo");
    const claimId = await rpc(u1.token, "file_claim", claimArgs);
    assert.equal(rental(r1).status, "claimed");
    const lenderAnswers = await call(u1.token, "respond_claim", { p_claim_id: claimId, p_answer: "accept" });
    assert.ok(!lenderAnswers.ok && lenderAnswers.data.message.startsWith("DZ-E4032"), "only the renter answers");
    assert.equal(await rpc(u3.token, "respond_claim", { p_claim_id: claimId, p_answer: "accept" }), "accepted");
    assert.equal(rental(r1).status, "completed");
    const capture = await waitForOperation(r1, "deposit_capture");
    const captures = await calls("POST", `/v1/payment_intents/${hold1}/capture`);
    assert.equal(captures.length, 1);
    assert.deepEqual([captures[0].params.amount_to_capture, captures[0].idempotency_key], ["3000", `dz-op-${capture.id}`]);
    assert.deepEqual([rental(r1).deposit_status, rental(r1).captured], ["captured", 30]);
    const retried = await fn("stripe-deposit", { body: { operation_id: capture.id }, headers: JOB });
    assert.deepEqual([retried.status, retried.data?.state], [200, "done"]);
    assert.equal((await calls("POST", `/v1/payment_intents/${hold1}/capture`)).length, 1, "the same step again: no second capture");
    const noSecret = await fn("stripe-deposit", { body: { operation_id: capture.id } });
    assert.equal(noSecret.status, 401, "without the outbox secret a step is a person's call, which needs a token");
    const conversation = sql(`select conversation_id from public.rentals where id = '${r1}'`)[0].conversation_id;
    assert.ok(await waitFor(async () => (await pushes(conversation)).includes("claim_filed"), 30), "the renter gets claim_filed");
    console.log("   refusals: renter files (DZ-E4002), over the deposit (DZ-E4041), a pickup photo (DZ-E4043), lender answers (DZ-E4032)");
    console.log("   filed -> claim_filed push; accepted -> $30.00 captured through the outbox; retried: still 1 capture");

    console.log("\n5. No claim: the hold is released when the window ends");
    const r2 = await paidRental(u1, u3, 40, 41);
    const hold2 = await pickedUp(u1, r2);
    // The hold ends in 10 hours while the piece is out: the nightly job renews it.
    sql(`update public.rentals set deposit_capture_before = now() + interval '10 hours' where id = '${r2}'`);
    const job = sql("select app_private.check_deposit_holds() as r")[0].r;
    assert.ok(job.warned >= 1 && job.renewing >= 1, `check_deposit_holds: ${JSON.stringify(job)}`);
    const renew = await waitForOperation(r2, "deposit_renew");
    const hold2b = rental(r2).deposit_intent_id;
    assert.notEqual(hold2b, hold2, "a new hold replaces the old one");
    const renewals = (await calls("POST", "/v1/payment_intents")).filter((c) => c.idempotency_key === `dz-op-${renew.id}`);
    assert.deepEqual([renewals.length, renewals[0]?.params.capture_method, renewals[0]?.params.off_session], [1, "manual", "true"]);
    const oldReleased = await calls("POST", `/v1/payment_intents/${hold2}/cancel`);
    assert.deepEqual([oldReleased.length, oldReleased[0]?.idempotency_key], [1, `dz-op-${renew.id}-release-old`], "then the old hold is released");
    const r2conversation = sql(`select conversation_id from public.rentals where id = '${r2}'`)[0].conversation_id;
    assert.ok(await waitFor(async () => (await pushes(r2conversation)).filter((k) => k === "deposit_hold_ending").length >= 2, 30),
      "both people are told");
    console.log("   the hold ends within a day: a new hold through the outbox, the old one released, both told");
    await returned(u1, r2);
    sql(`update public.rentals set claim_window_ends_at = now() - interval '1 minute' where id = '${r2}'`);
    sql("select app_private.expire_rental_requests()");
    assert.equal(rental(r2).status, "completed");
    const release = await waitForOperation(r2, "deposit_release");
    const cancels = await calls("POST", `/v1/payment_intents/${hold2b}/cancel`);
    assert.deepEqual([cancels.length, cancels[0]?.idempotency_key, rental(r2).deposit_status], [1, `dz-op-${release.id}`, "released"]);
    console.log("   window ended -> completed; the hold cancelled at Stripe through the outbox -> released");

    console.log("\n6. Cancelled early by the renter: a full refund");
    const r3 = await paidRental(u1, u3, 60, 61);
    assert.equal(await rpc(u3.token, "cancel_rental", { p_rental_id: r3, p_reason: "Plans changed" }), "cancelled");
    const refundOp = await waitForOperation(r3, "refund");
    const refunds = (await calls("POST", "/v1/refunds")).filter((c) => c.params["metadata[rental_id]"] === r3);
    assert.equal(refunds.length, 1);
    const rp = refunds[0].params;
    assert.deepEqual([rp.amount, rp.reverse_transfer, rp.refund_application_fee, refunds[0].idempotency_key],
      ["11000", "true", "true", `dz-op-${refundOp.id}`]);
    assert.deepEqual([rental(r3).refunded, rental(r3).payment_status], [110, "refunded"]);
    const refundedHook = await webhook("charge.refunded", { id: "ch_c4refund", object: "charge", payment_intent: rental(r3).payment_intent_id, amount: 11000, amount_captured: 11000, amount_refunded: 11000 });
    assert.equal(refundedHook.data?.result, "refund_recorded");
    assert.equal(rental(r3).refunded, 110, "the webhook agrees, no double count");
    const r3conversation = sql(`select conversation_id from public.rentals where id = '${r3}'`)[0].conversation_id;
    assert.ok(await waitFor(async () => (await pushes(r3conversation)).includes("rental_cancelled"), 30), "the lender gets rental_cancelled");
    const refundRefused = await fn("stripe-refund", { body: { operation_id: refundOp.id } });
    assert.deepEqual([refundRefused.status, refundRefused.data?.code], [401, "DZ-E9004"], "stripe-refund only for the outbox");
    console.log("   $110.00 refunded (reverse_transfer, fee refunded) through the outbox; charge.refunded agrees; lender told");

    const total = await stripeLog();
    console.log(`\n   Stripe calls through stripe-mock: ${total.length}, all accepted: ${total.every((c) => c.status < 400)}`);
    assert.ok(total.every((c) => c.status < 400), "stripe-mock accepted every request");
  } finally {
    await rpc(u1.token, "unregister_push_token", { p_token: tokens[0] });
    await rpc(u3.token, "unregister_push_token", { p_token: tokens[1] });
    const files = sql(`select name from storage.objects where bucket_id = 'rental-photos'
      and (string_to_array(name, '/'))[1] in (select id::text from public.rentals where listing_id = '${L1}')`);
    if (files.length && SERVICE_KEY) {
      await fetch(`${SUPABASE_URL}/storage/v1/object/rental-photos`, {
        method: "DELETE",
        headers: {
          apikey: SERVICE_KEY,
          ...(SERVICE_KEY.startsWith("sb_secret_") ? {} : { Authorization: `Bearer ${SERVICE_KEY}` }),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prefixes: files.map((f) => f.name) }),
      });
    }
    cleanup();
    sql(`delete from app_private.payment_events where stripe_event_id like 'evt_c4_${RUN}_%'`);
    sql("update app_private.settings set value = '0'::jsonb where key = 'platform_fee_percent'");
    sql(`update public.listings set deposit_amount = null where id = '${L1}'`);
    sql("update public.app_settings set enabled = false where key = 'payments_enabled'");
    console.log(`\n   cleaned up: ${files.length} condition photo files, the test rentals, payout and customer rows, events; payments off`);
  }
  console.log("\nAll C4 payment checks PASSED!");
}

run().catch((err) => {
  // A network failure says where (the cause and the first frames of the stack).
  const where = String(err.stack ?? "").split(/\r?\n/).slice(1, 4).map((s) => s.trim()).join(" | ");
  console.error(err.message, err.cause ? `(cause: ${err.cause.code ?? err.cause.message})` : "", where);
  process.exit(1);
});
