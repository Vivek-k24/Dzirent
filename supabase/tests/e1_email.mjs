// E1 integration (local backend only; the runner serves the functions with
// supabase/functions/local.resend-fake.env: a placeholder key and the stub's fake Resend, never
// Resend). Rental emails through the outbox to the real send-email function:
//   1. A request emails the lender: from Dzirent <no-reply@mail.dzirent.com>, replies to
//      support@dzirent.com, HTML and a plain-text part, one-click List-Unsubscribe, sent once
//      (the email's id as Resend's Idempotency-Key), recorded with Resend's id.
//   2. Resend's webhook (email-events): a bad signature is refused (DZ-E7030); a signed hard bounce
//      flags the lender's address once.
//   3. With the address flagged, a new request isn't emailed ("suppressed"); a pickup reminder (an
//      essential email) still is, without List-Unsubscribe.
//   4. The one-click unsubscribe (POST) turns "Email me about rentals" off; a GET only redirects.
// Leaves nothing behind. Prints only statuses, templates and counts.
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { LIVE, STUBS_URL, SUPABASE_URL, sql, userEnv } from "./lib/config.mjs";
import { day, fnRaw, rpc, signIn, waitFor } from "./lib/c4.mjs";

if (LIVE) {
  console.error("e1_email runs only against the local backend.");
  process.exit(1);
}

const L1 = "2fe0cfa6-a95e-4994-bbe4-f1bfb6760490"; // user 1's listing
// The webhook test secret in local.resend-fake.env (a placeholder only the local function knows).
const WEBHOOK_SECRET = "whsec_bG9jYWwtcmVzZW5kLXdlYmhvb2stdGVzdC1rZXktMDE=";
const RUN = randomBytes(4).toString("hex");

const emails = (rental) => sql(`select id, template, recipient_id::text as recipient, status, skip_reason, provider_message_id
  from app_private.email_messages where rental_id = '${rental}' order by created_at, template`);
const resendLog = async () => ((await (await fetch(`${STUBS_URL}/log`)).json()).resend ?? []);

async function settle(rental, count) {
  const ok = await waitFor(() => {
    sql("select app_private.run_async_jobs()");
    const rows = emails(rental);
    return rows.length >= count && rows.every((e) => e.status !== "queued");
  }, 60);
  assert.ok(ok, `the emails should finish (now: ${JSON.stringify(emails(rental).map((e) => [e.template, e.status]))})`);
  return emails(rental);
}

function svix(payload, { secret = WEBHOOK_SECRET, id = `msg_${RUN}_${randomBytes(3).toString("hex")}`, ts = Math.floor(Date.now() / 1000) } = {}) {
  const body = JSON.stringify(payload);
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const sig = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
  return { body, headers: { "svix-id": id, "svix-timestamp": String(ts), "svix-signature": `v1,${sig}` } };
}

async function run() {
  const u1 = await signIn(userEnv.TEST_USER_1_EMAIL, userEnv.TEST_USER_1_PASSWORD);
  const u3 = await signIn(userEnv.TEST_USER_3_EMAIL, userEnv.TEST_USER_3_PASSWORD);
  const people = `'${u1.id}', '${u3.id}'`;
  const cleanup = () => {
    sql(`delete from app_private.email_messages where recipient_id in (${people}) or rental_id in (select id from public.rentals where listing_id = '${L1}')`);
    sql(`delete from public.rentals where listing_id = '${L1}'`);
    sql(`delete from public.notification_settings where user_id in (${people})`);
    sql(`update public.profiles set email_status = 'ok', email_status_at = null where id in (${people})`);
    sql(`delete from app_private.email_events where event_id like 'msg_${RUN}_%'`);
    sql("delete from app_private.rate_counters where action = 'rental_request'");
  };
  cleanup();
  await fetch(`${STUBS_URL}/log`, { method: "DELETE" });
  try {
    console.log("1. A rental request emails the lender through Resend (the fake), once, with a text part");
    const r1 = await rpc(u3.token, "request_rental", { p_listing_id: L1, p_start: day(20), p_end: day(21) });
    const first = (await settle(r1, 1)).find((e) => e.template === "rental_request");
    assert.equal(first.status, "sent", `rental_request: ${first.status} ${first.skip_reason ?? ""}`);
    assert.match(first.provider_message_id ?? "", /^fake-resend-\d+$/, "recorded with Resend's id");
    const sent = (await resendLog()).filter((m) => m.idempotency_key === first.id);
    assert.equal(sent.length, 1, "one call for this email (its id is the Idempotency-Key)");
    const m = sent[0];
    assert.equal(m.from, "Dzirent <no-reply@mail.dzirent.com>");
    assert.equal(m.reply_to, "support@dzirent.com");
    assert.deepEqual(m.to, [userEnv.TEST_USER_1_EMAIL]);
    assert.ok(m.html?.includes("<html"), "an HTML part");
    assert.ok(m.text && !m.text.includes("<") && m.text.includes("wants to rent"), "a plain-text part");
    assert.equal(m.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
    const unsubscribe = /^<(.+)>$/.exec(m.headers["List-Unsubscribe"] ?? "")?.[1];
    assert.ok(unsubscribe?.includes("/functions/v1/email-unsubscribe?u=" + u1.id), "the one-click link names the lender's account");
    console.log(`   sent (${first.provider_message_id}); from, reply-to, text part and List-Unsubscribe as expected`);

    console.log("2. Resend's webhook: a bad signature is refused; a signed hard bounce flags the address once");
    const bounce = { type: "email.bounced", created_at: new Date().toISOString(), data: { email_id: first.provider_message_id, to: [userEnv.TEST_USER_1_EMAIL], subject: "x", bounce: { type: "Permanent", subType: "General" } } };
    const forged = svix(bounce, { secret: "whsec_" + Buffer.from("not-the-secret").toString("base64") });
    const refused = await fnRaw("email-events", forged.body, forged.headers);
    assert.equal(refused.status, 401);
    assert.equal(refused.data?.code, "DZ-E7030");
    const old = svix(bounce, { ts: Math.floor(Date.now() / 1000) - 600 });
    assert.equal((await fnRaw("email-events", old.body, old.headers)).data?.code, "DZ-E7031", "an old event is refused");
    assert.equal(sql(`select email_status from public.profiles where id = '${u1.id}'`)[0].email_status, "ok", "nothing changed yet");
    const good = svix(bounce);
    const accepted = await fnRaw("email-events", good.body, good.headers);
    assert.equal(accepted.status, 200, `email-events: ${accepted.status} ${JSON.stringify(accepted.data)}`);
    assert.equal(accepted.data?.result, "flagged_bounced");
    assert.equal((await fnRaw("email-events", good.body, good.headers)).data?.result, "duplicate", "Resend's retry of the same event changes nothing");
    assert.equal(sql(`select email_status from public.profiles where id = '${u1.id}'`)[0].email_status, "bounced", "the lender's address is flagged");
    console.log("   forged 401 DZ-E7030, old DZ-E7031; signed: flagged_bounced, then duplicate");

    console.log("3. Flagged: a new request isn't emailed; a pickup reminder still is");
    assert.equal(await rpc(u3.token, "cancel_rental", { p_rental_id: r1, p_reason: "Test done" }), "cancelled");
    // Reminders go for rentals starting tomorrow in the rental time zone (Austin), not UTC.
    const austin = (n) => sql(`select ((now() at time zone 'America/Chicago')::date + ${n})::text as d`)[0].d;
    const r2 = await rpc(u3.token, "request_rental", { p_listing_id: L1, p_start: austin(1), p_end: austin(2) });
    const second = (await settle(r2, 1)).find((e) => e.template === "rental_request");
    assert.deepEqual([second.status, second.skip_reason], ["skipped", "suppressed"], "the request email is skipped for the flagged address");
    assert.equal(await rpc(u1.token, "respond_rental", { p_rental_id: r2, p_answer: "accept" }), "accepted");
    sql("select app_private.queue_rental_reminders()");
    const all = await settle(r2, 4);
    const reminders = all.filter((e) => e.template === "pickup_reminder");
    assert.equal(reminders.length, 2, "a pickup reminder for each person");
    assert.ok(reminders.every((e) => e.status === "sent"), `both sent, the flagged lender's too: ${JSON.stringify(reminders.map((e) => e.status))}`);
    const lenderReminder = (await resendLog()).find((x) => x.idempotency_key === reminders.find((e) => e.recipient === u1.id).id);
    assert.equal(lenderReminder.headers["List-Unsubscribe"], undefined, "an essential email has no unsubscribe link");
    assert.ok(lenderReminder.text.includes("Rental reminders are always sent"));
    console.log("   request: skipped (suppressed); reminders: sent to both, no List-Unsubscribe");

    console.log("4. One-click unsubscribe: POST turns rental emails off; a GET changes nothing");
    const local = new URL(unsubscribe);
    const target = `${SUPABASE_URL}${local.pathname}${local.search}`;
    const get = await fetch(target, { redirect: "manual" });
    assert.equal(get.status, 303, "a GET (someone opening the link) goes to Settings");
    assert.equal(sql(`select count(*)::int as n from public.notification_settings where user_id = '${u1.id}' and not email_rentals`)[0].n, 0, "and changes nothing");
    const bad = await fetch(target.replace(/t=[^&]+/, "t=wrong"), { method: "POST", body: "List-Unsubscribe=One-Click" });
    assert.equal(bad.status, 400, "a wrong token is refused (DZ-E7033)");
    const post = await fetch(target, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" });
    assert.equal(post.status, 200, `one-click: ${post.status}`);
    assert.equal(sql(`select email_rentals from public.notification_settings where user_id = '${u1.id}'`)[0].email_rentals, false, '"Email me about rentals" is off');
    console.log("   GET 303, wrong token 400, POST 200: rental emails off");
  } finally {
    cleanup();
  }
  console.log("\nAll E1 email checks PASSED!");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
