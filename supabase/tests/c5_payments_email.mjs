// C5 integration against stripe-mock (local backend only; the runner serves the functions with
// supabase/functions/local.stripe-mock.env: Stripe placeholders for stripe-mock, the email provider
// key blank). One rental with payments on, from the request to completed, with a deposit and a
// claim Dzirent decides, through the real API and Edge Functions:
//   request -> accept (payment deadline) -> pay (stripe-pay + signed succeeded webhook) -> the hold
//   at pickup -> return (claim window) -> claim -> disputed -> admin decides $20 -> captured.
// At each step it checks what the outbox queued: the pushes (in the stub's log) and the emails
// (app_private.email_messages), and that send-email, with no provider key, marks every email and
// its job skipped, never failed. Then an unpaid rental past its payment deadline is cancelled with
// pushes to both. Leaves nothing behind. Prints only statuses, codes, amounts, kinds and counts.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LIVE, REPO_ROOT, SERVICE_KEY, STUBS_URL, SUPABASE_KEY, SUPABASE_URL, sql, userEnv } from "./lib/config.mjs";
import {
  adminSession, call, day, fn, fnRaw, rpc, signIn, signedEvent, stripeLog, uploadConditionPhoto, waitFor,
} from "./lib/c4.mjs";

if (LIVE) {
  console.error("c5_payments_email runs only against the local backend.");
  process.exit(1);
}

const L1 = "2fe0cfa6-a95e-4994-bbe4-f1bfb6760490"; // user 1, Emerald Velvet Cocktail Dress, $55/day
const SECRET = "whsec_local_test_secret";
const EMAIL_JOB = { "x-email-secret": "local-email-secret" };
const PHOTO = readFileSync(join(REPO_ROOT, "supabase/seed/images/emerald-velvet-cocktail-dress/front.jpg"));
const RUN = Date.now().toString(36);
let eventNo = 0;

async function webhook(type, object, opts) {
  const e = signedEvent(SECRET, `evt_c5_${RUN}_${++eventNo}`, type, object, opts);
  return fnRaw("stripe-webhook", e.body, { "Stripe-Signature": e.header });
}

const rental = (id) => sql(`select status, payment_status, deposit_status, deposit_intent_id, payment_intent_id,
  deposit_captured_amount::float as captured, payment_due_at is not null as has_due, conversation_id
  from public.rentals where id = '${id}'`)[0];
/** The emails queued for [id]: template and recipient (lender / renter), with status and skip reason. */
const emails = (id, lender) => sql(`select template, case when recipient_id = '${lender}' then 'lender' else 'renter' end as who,
  status, skip_reason from app_private.email_messages where rental_id = '${id}' order by created_at, template`);
const emailJobs = (id) => sql(`select j.status from app_private.async_jobs j join app_private.email_messages e
  on j.payload ->> 'email_id' = e.id::text where e.rental_id = '${id}'`).map((r) => r.status);
const pushKinds = async (conversation) => ((await (await fetch(`${STUBS_URL}/log`)).json()).push ?? [])
  .filter((p) => p.conversation_id === conversation).map((p) => p.kind);

/** pg_net answers arrive in the background; the worker (every minute in cron) reads them. */
async function settleEmails(id) {
  const ok = await waitFor(() => {
    sql("select app_private.run_async_jobs()");
    const jobs = emailJobs(id);
    return jobs.length > 0 && jobs.every((s) => !["pending", "running"].includes(s));
  }, 45);
  assert.ok(ok, `the email jobs should finish (now: ${JSON.stringify(emailJobs(id))})`);
}

async function waitForOperation(rentalId, kind) {
  let op = null;
  const ok = await waitFor(() => {
    op = sql(`select id, status, error from app_private.payment_operations where rental_id = '${rentalId}' and kind = '${kind}' order by created_at desc limit 1`)[0];
    return op && ["done", "failed"].includes(op.status);
  }, 40);
  assert.ok(ok, `the ${kind} step should finish (last: ${op?.status ?? "none"})`);
  assert.equal(op.status, "done", `${kind}: ${op.error ?? ""}`);
  return op;
}

async function run() {
  const u1 = await signIn(userEnv.TEST_USER_1_EMAIL, userEnv.TEST_USER_1_PASSWORD);
  const u3 = await signIn(userEnv.TEST_USER_3_EMAIL, userEnv.TEST_USER_3_PASSWORD);
  const people = `'${u1.id}', '${u3.id}'`;
  const cleanup = () => {
    sql(`delete from app_private.email_messages where recipient_id in (${people}) or rental_id in (select id from public.rentals where listing_id = '${L1}')`);
    sql(`delete from app_private.payment_operations where rental_id in (select id from public.rentals where listing_id = '${L1}')`);
    sql(`delete from public.rentals where listing_id = '${L1}'`);
    sql(`delete from public.payout_accounts where user_id in (${people})`);
    sql(`delete from public.stripe_customers where user_id in (${people})`);
    sql(`delete from public.notification_settings where user_id in (${people})`);
    sql("delete from app_private.rate_counters where action = 'rental_request'");
  };
  sql(`delete from public.blocks where '${u1.id}' in (blocker_id, blocked_id)`);
  cleanup();
  await fetch(`${STUBS_URL}/log`, { method: "DELETE" });
  const tokens = [`c5-lender-${RUN}`, `c5-renter-${RUN}`];
  await rpc(u1.token, "register_push_token", { p_token: tokens[0], p_platform: "android" });
  await rpc(u3.token, "register_push_token", { p_token: tokens[1], p_platform: "android" });
  const admin = await adminSession(userEnv.TEST_ADMIN_EMAIL, userEnv.TEST_ADMIN_PASSWORD);

  try {
    console.log("0. send-email takes only the outbox's calls; the screens' rules are public");
    const stranger = await fn("send-email", { body: { email_id: "00000000-0000-4000-8000-000000000000" } });
    assert.deepEqual([stranger.status, stranger.data?.code], [401, "DZ-E9004"], "without the outbox secret: refused");
    const bad = await fn("send-email", { body: { email_id: "x" }, headers: EMAIL_JOB });
    assert.deepEqual([bad.status, bad.data?.code], [400, "DZ-E9016"], "a bad id: refused");
    const rulesOff = await (await fetch(`${SUPABASE_URL}/rest/v1/rpc/rental_settings`, {
      method: "POST", headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" }, body: "{}",
    })).json();
    assert.deepEqual([rulesOff.payments_enabled, rulesOff.rental_request_hours, rulesOff.payment_deadline_hours], [false, 48, 24]);
    console.log("   send-email: 401 DZ-E9004 without the secret, 400 DZ-E9016 for a bad id; rental_settings for guests: off, 48 h, 24 h");

    sql("update public.app_settings set enabled = true where key = 'payments_enabled'");
    sql(`update public.listings set deposit_amount = 40 where id = '${L1}'`);
    const onboard = await fn("stripe-onboard", { token: u1.token, body: { return_url: "https://dzirent.com/app/settings/studio?payouts=return" } });
    assert.equal(onboard.status, 200, `onboard: ${onboard.status} ${JSON.stringify(onboard.data)}`);
    const account = sql(`select stripe_account_id from public.payout_accounts where user_id = '${u1.id}'`)[0].stripe_account_id;
    const links = (await stripeLog()).filter((c) => c.path === "/v1/account_links");
    assert.equal(links[0]?.params.return_url, "https://dzirent.com/app/settings/studio?payouts=return", "back to My studio after onboarding");
    const ready = await webhook("account.updated", { id: account, object: "account", charges_enabled: true, payouts_enabled: true, details_submitted: true }, { account });
    assert.equal(ready.data?.result, "account_updated");
    console.log("   payments on; the lender's payouts set up (onboarding returns to My studio; account.updated: ready)");

    console.log("\n1. Request and accept: the payment deadline");
    const id = await rpc(u3.token, "request_rental", { p_listing_id: L1, p_start: day(25), p_end: day(28) });
    const conversation = rental(id).conversation_id;
    assert.equal(await rpc(u1.token, "respond_rental", { p_rental_id: id, p_answer: "accept" }), "awaiting_payment");
    const seen = await rpc(u3.token, "get_rental", { p_rental_id: id });
    const dueHours = (Date.parse(seen.payment_due_at) - Date.now()) / 3600000;
    assert.ok(dueHours > 23.9 && dueHours <= 24, `the renter sees the deadline 24 hours out (${dueHours.toFixed(2)})`);
    assert.equal(seen.lender_can_take_payment, true, "the lender can take payments");
    console.log(`   awaiting_payment, payment_due_at in ${dueHours.toFixed(1)} h; the lender can take payments`);

    console.log("\n2. Pay: Stripe's payment sheet gets the client secret; the webhook marks it paid");
    const pay = await fn("stripe-pay", { token: u3.token, body: { rental_id: id } });
    assert.equal(pay.status, 200, `stripe-pay: ${pay.status} ${JSON.stringify(pay.data)}`);
    assert.ok(pay.data.client_secret && pay.data.publishable_key === "pk_test_stripemock" && pay.data.amount === 220);
    const paid = await webhook("payment_intent.succeeded", {
      id: pay.data.payment_intent_id, object: "payment_intent", status: "succeeded", payment_method: "pm_card_visa", amount_received: 22000,
    });
    assert.equal(paid.data?.result, "rental_paid");
    assert.deepEqual([rental(id).status, rental(id).payment_status], ["paid", "paid"]);
    console.log("   $220 client secret for the sheet; succeeded -> paid");

    console.log("\n3. Pickup with the deposit hold, then the return");
    for (let i = 0; i < 2; i++) assert.ok((await uploadConditionPhoto(u1.token, id, "pickup", PHOTO)).ok);
    const placed = await fn("stripe-deposit", { token: u1.token, body: { action: "place", rental_id: id } });
    assert.equal(placed.status, 202, `place: ${placed.status} ${JSON.stringify(placed.data)}`);
    assert.equal((await webhook("payment_intent.amount_capturable_updated", {
      id: rental(id).deposit_intent_id, object: "payment_intent", status: "requires_capture", amount_capturable: 4000, latest_charge: "ch_c5test",
    })).data?.result, "deposit_held");
    const picked = await fn("stripe-deposit", { token: u1.token, body: { action: "place", rental_id: id } });
    assert.deepEqual([picked.status, picked.data?.status], [200, "picked_up"]);
    const evidence = [];
    for (let i = 0; i < 2; i++) {
      const up = await uploadConditionPhoto(u1.token, id, "return", PHOTO);
      assert.ok(up.ok);
      evidence.push(up.path);
    }
    assert.equal(await rpc(u1.token, "mark_returned", { p_rental_id: id }), "returned");
    console.log("   $40 hold placed and held -> picked up; returned, the claim window is open");

    console.log("\n4. Claim, dispute, Dzirent decides");
    const tooMuch = await call(u1.token, "file_claim", { p_rental_id: id, p_amount: 40.01, p_reason: "Torn lining", p_photo_paths: [evidence[0]] });
    assert.ok(!tooMuch.ok && tooMuch.data.message.startsWith("DZ-E4041"), "more than the deposit is refused");
    const claimId = await rpc(u1.token, "file_claim", { p_rental_id: id, p_amount: 30, p_reason: "Torn lining", p_photo_paths: evidence });
    assert.equal(await rpc(u3.token, "respond_claim", { p_claim_id: claimId, p_answer: "dispute", p_note: "It was like that" }), "disputed");
    const decided = await call(admin.token, "admin_decide_claim", { p_claim_id: claimId, p_amount: 20, p_reason: "Pickup photos show no tear; half the claim" });
    assert.ok(decided.ok, `decide: ${decided.status} ${decided.data?.message ?? ""}`);
    assert.equal(rental(id).status, "completed");
    await waitForOperation(id, "deposit_capture");
    const captures = (await stripeLog()).filter((c) => c.method === "POST" && c.path === `/v1/payment_intents/${rental(id).deposit_intent_id}/capture`);
    assert.deepEqual([captures.length, captures[0]?.params.amount_to_capture], [1, "2000"], "$20 captured from the $40 hold");
    const claim = (await rpc(u3.token, "get_rental", { p_rental_id: id })).claim;
    assert.deepEqual([claim.status, claim.decision_amount], ["decided", 20], "both see the outcome");
    console.log("   over the deposit refused (DZ-E4041); $30 claim disputed; decided $20 -> completed, $20 captured through the outbox");

    console.log("\n5. What the outbox queued");
    const expectedPushes = ["rental_request", "rental_accepted", "claim_filed", "claim_decided", "claim_decided"];
    const allThere = async () => {
      const got = await pushKinds(conversation);
      return expectedPushes.every((k) => expectedPushes.filter((x) => x === k).length <= got.filter((x) => x === k).length);
    };
    assert.ok(await waitFor(allThere, 30), `pushes: ${JSON.stringify(await pushKinds(conversation))}`);
    const kinds = await pushKinds(conversation);
    assert.ok(!kinds.includes("rental_completed"), "a decided claim says claim_decided, not completed again");
    console.log(`   pushes: ${kinds.join(", ")}`);
    await settleEmails(id);
    const sent = emails(id, u1.id);
    assert.deepEqual(sent.map((e) => `${e.template}:${e.who}`).sort(), [
      "claim_decided:lender", "claim_decided:renter", "claim_filed:renter", "payment_receipt:renter", "rental_request:lender", "request_accepted:renter",
    ], `emails: ${JSON.stringify(sent.map((e) => e.template + ":" + e.who))}`);
    assert.ok(sent.every((e) => e.status === "skipped" && e.skip_reason === "not_configured"), "no provider key: every email skipped");
    const jobs = emailJobs(id);
    assert.ok(jobs.every((s) => s === "skipped"), `every email job skipped, none failed: ${JSON.stringify(jobs)}`);
    const ownEmail = sql(`select count(*)::int as n from app_private.email_messages where rental_id = '${id}' and to_address is not null`)[0].n;
    assert.equal(ownEmail, 0, "no address stored for a rental email (send-email reads the account's own)");
    console.log(`   emails: ${sent.map((e) => `${e.template} (${e.who})`).join(", ")}; all ${sent.length} skipped (not_configured), jobs skipped`);

    console.log("\n6. The email switch");
    await fetch(`${SUPABASE_URL}/rest/v1/notification_settings`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${u1.token}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ user_id: u1.id, messages: true, show_message_text: false, rental_reminders: true, email_rentals: false }),
    });
    assert.equal(sql(`select email_rentals from public.notification_settings where user_id = '${u1.id}'`)[0]?.email_rentals, false, "the lender turned rental emails off");
    console.log("   the lender turns \"Email me about rentals\" off (their own row, through the API)");

    console.log("\n7. Unpaid past the payment deadline: cancelled, both told");
    const late = await rpc(u3.token, "request_rental", { p_listing_id: L1, p_start: day(45), p_end: day(46) });
    assert.equal(sql(`select count(*)::int as n from app_private.email_messages where rental_id = '${late}' and recipient_id = '${u1.id}'`)[0].n, 0,
      "switched off: no request email to the lender");
    assert.equal(await rpc(u1.token, "respond_rental", { p_rental_id: late, p_answer: "accept" }), "awaiting_payment");
    sql(`update public.rentals set payment_due_at = now() - interval '1 minute' where id = '${late}'`);
    sql("select app_private.expire_rental_requests()");
    assert.equal(rental(late).status, "cancelled");
    const note = sql(`select note from public.rental_events where rental_id = '${late}' order by id desc limit 1`)[0].note;
    assert.equal(note, "Not paid within 24 hours after it was accepted");
    const lateConversation = rental(late).conversation_id;
    assert.ok(await waitFor(async () => (await pushKinds(lateConversation)).filter((k) => k === "rental_cancelled").length >= 2, 30),
      "rental_cancelled to both");
    console.log(`   cancelled by Dzirent ("${note}"), rental_cancelled to both`);

    const total = await stripeLog();
    assert.ok(total.every((c) => c.status < 400), "stripe-mock accepted every request");
    console.log(`\n   Stripe calls through stripe-mock: ${total.length}, all accepted`);
  } finally {
    await admin.close();
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
    sql(`delete from app_private.payment_events where stripe_event_id like 'evt_c5_${RUN}_%'`);
    sql(`update public.listings set deposit_amount = null where id = '${L1}'`);
    sql("update public.app_settings set enabled = false where key = 'payments_enabled'");
    console.log(`\n   cleaned up: ${files.length} condition photo files, the test rentals, emails, payout and customer rows, events; payments off`);
  }
  console.log("\nAll C5 payment and email checks PASSED!");
}

run().catch((err) => {
  const where = String(err.stack ?? "").split(/\r?\n/).slice(1, 4).map((s) => s.trim()).join(" | ");
  console.error(err.message, err.cause ? `(cause: ${err.cause.code ?? err.cause.message})` : "", where);
  process.exit(1);
});
