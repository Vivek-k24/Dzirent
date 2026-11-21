// E1: node --test --experimental-strip-types (run from apps/web's npm test). send-email, email-events
// and email-unsubscribe with a fake database and a fake Resend: no network. The full outbox path on
// the local stack (the real functions, the stub's fake Resend) is supabase/tests/e1_email.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { handleSendEmail } from "./send-email.ts";
import { handleEmailEvents, svixSignature, verifySvix } from "./email-events.ts";
import { handleUnsubscribe } from "./email-unsubscribe.ts";
import { EMAIL_FROM, EMAIL_REPLY_TO, emailConfig } from "./email.ts";
import { emailDecision, isEssential, unsubscribeToken } from "./email-policy.ts";

const EMAIL_ID = "0b6c4e9e-1f2a-4c3d-8e5f-6a7b8c9d0e1f";
const USER = "1f2e3d4c-5b6a-4978-8a1b-2c3d4e5f6a7b";
const SECRET = "local-email-secret";

type Call = { fn: string; args: Record<string, unknown> };
function fakeDb(prepared: Record<string, unknown>) {
  const calls: Call[] = [];
  return {
    calls,
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      if (fn === "email_prepare") return { data: prepared, error: null };
      if (fn === "email_finish") return { data: args.p_status, error: null };
      return { data: null, error: { message: "unexpected " + fn } };
    },
  };
}
function fakeResend(status = 200) {
  const sent: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  return {
    sent,
    fetch: async (url: string, init: RequestInit) => {
      sent.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify(status < 300 ? { id: "re-msg-1" } : { message: "no" }), { status });
    },
  };
}
const env = (extra: Record<string, string> = {}) => (n: string) =>
  ({ EMAIL_JOB_SECRET: SECRET, RESEND_API_KEY: "test-key", SUPABASE_URL: "https://project.supabase.co", EMAIL_API_URL: "https://fake.resend.test/emails", ...extra })[n];
const outbox = () =>
  new Request("https://x/functions/v1/send-email", {
    method: "POST",
    headers: { "x-email-secret": SECRET, "Content-Type": "application/json" },
    body: JSON.stringify({ email_id: EMAIL_ID }),
  });
const rentalRequest = {
  state: "send",
  to: "lender@example.test",
  template: "rental_request",
  recipient_id: USER,
  prefs: { email_rentals: true, email_status: "ok" },
  data: { role: "lender", name: "Jordan", other_name: "Maya", listing_title: "Silk saree", start_date: "2026-12-05", end_date: "2026-12-08", days: 4, total: 220 },
};

test("send: one Resend call from Dzirent, replies to support, HTML and a plain-text part, once per email", async () => {
  const db = fakeDb(rentalRequest);
  const resend = fakeResend();
  const res = await handleSendEmail(outbox(), { env: env(), rpc: db.rpc, fetch: resend.fetch });
  assert.equal(res.status, 200);
  assert.equal(resend.sent.length, 1);
  const { body, headers, url } = resend.sent[0];
  assert.equal(url, "https://fake.resend.test/emails");
  assert.equal(body.from, EMAIL_FROM);
  assert.equal(body.from, "Dzirent <no-reply@mail.dzirent.com>");
  assert.equal(body.reply_to, EMAIL_REPLY_TO);
  assert.deepEqual(body.to, ["lender@example.test"]);
  assert.ok(String(body.html).includes("<html"), "an HTML part");
  assert.ok(typeof body.text === "string" && String(body.text).includes("Maya wants to rent Silk saree"), "a plain-text part");
  assert.ok(!String(body.text).includes("<"), "the text part has no markup");
  assert.equal(headers["Idempotency-Key"], EMAIL_ID, "an outbox retry can't send it twice");
  assert.equal(headers.Authorization, "Bearer test-key");
  const finish = db.calls.find((c) => c.fn === "email_finish");
  assert.deepEqual(finish?.args, { p_email_id: EMAIL_ID, p_status: "sent", p_reason: null, p_provider_id: "re-msg-1" });
});

test("send: non-essential emails carry one-click List-Unsubscribe; reminders and account emails don't", async () => {
  const resend = fakeResend();
  await handleSendEmail(outbox(), { env: env(), rpc: fakeDb(rentalRequest).rpc, fetch: resend.fetch });
  const h = resend.sent[0].body.headers as Record<string, string>;
  const token = await unsubscribeToken(SECRET, USER);
  assert.equal(h["List-Unsubscribe"], `<https://project.supabase.co/functions/v1/email-unsubscribe?u=${USER}&t=${token}>`);
  assert.equal(h["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");

  const reminder = { ...rentalRequest, template: "pickup_reminder", data: { ...rentalRequest.data, kind: "pickup_tomorrow" } };
  const r2 = fakeResend();
  await handleSendEmail(outbox(), { env: env(), rpc: fakeDb(reminder).rpc, fetch: r2.fetch });
  assert.equal(r2.sent[0].body.headers, undefined, "a reminder has no unsubscribe link");
  assert.ok(String(r2.sent[0].body.text).includes("Rental reminders are always sent"));
});

test("preference check: rental emails off or a flagged address skip non-essential emails; reminders always go", async () => {
  assert.deepEqual(emailDecision("rental_request", { email_rentals: false, email_status: "ok" }), { send: false, reason: "turned_off" });
  assert.deepEqual(emailDecision("claim_filed", { email_rentals: true, email_status: "bounced" }), { send: false, reason: "suppressed" });
  assert.deepEqual(emailDecision("payment_receipt", { email_rentals: true, email_status: "complained" }), { send: false, reason: "suppressed" });
  assert.deepEqual(emailDecision("rental_request", null), { send: true });
  for (const t of ["pickup_reminder", "return_reminder", "account_deleted"]) {
    assert.ok(isEssential(t));
    assert.deepEqual(emailDecision(t, { email_rentals: false, email_status: "bounced" }), { send: true }, t);
  }
  // Through the function: skipped with its reason, nothing sent.
  const off = fakeDb({ ...rentalRequest, prefs: { email_rentals: false, email_status: "ok" } });
  const resend = fakeResend();
  const res = await handleSendEmail(outbox(), { env: env(), rpc: off.rpc, fetch: resend.fetch });
  assert.equal(res.status, 200);
  assert.equal(resend.sent.length, 0);
  assert.equal(off.calls.find((c) => c.fn === "email_finish")?.args.p_reason, "turned_off");
  const reminderOff = fakeDb({ ...rentalRequest, template: "return_reminder", prefs: { email_rentals: false, email_status: "bounced" } });
  const r2 = fakeResend();
  await handleSendEmail(outbox(), { env: env(), rpc: reminderOff.rpc, fetch: r2.fetch });
  assert.equal(r2.sent.length, 1, "the reminder is sent anyway");
});

test("send: no key means skipped before anything is read; only the outbox may call; Resend's answers", async () => {
  assert.equal(emailConfig(env({ RESEND_API_KEY: "" })), null);
  const db = fakeDb(rentalRequest);
  const res = await handleSendEmail(outbox(), { env: env({ RESEND_API_KEY: "" }), rpc: db.rpc, fetch: fakeResend().fetch });
  assert.equal(res.status, 200);
  assert.deepEqual(db.calls.map((c) => c.fn), ["email_finish"]);
  assert.equal(db.calls[0].args.p_reason, "not_configured");

  const wrong = new Request("https://x", { method: "POST", headers: { "x-email-secret": "nope" }, body: "{}" });
  assert.equal((await handleSendEmail(wrong, { env: env(), rpc: db.rpc })).status, 401);

  const refused = fakeDb(rentalRequest);
  await handleSendEmail(outbox(), { env: env(), rpc: refused.rpc, fetch: fakeResend(422).fetch });
  assert.equal(refused.calls.find((c) => c.fn === "email_finish")?.args.p_status, "failed");
  const down = await handleSendEmail(outbox(), { env: env(), rpc: fakeDb(rentalRequest).rpc, fetch: fakeResend(503).fetch });
  assert.equal(down.status, 503, "no answer, 429 or 5xx: the outbox retries");
});

const WEBHOOK_SECRET = "whsec_" + Buffer.from("unit-test-webhook-secret-0123456").toString("base64");
const NOW = 1_800_000_000;
async function signedWebhook(payload: unknown, opts: { secret?: string; ts?: number; id?: string } = {}) {
  const body = JSON.stringify(payload);
  const id = opts.id ?? "msg_2pXq1";
  const ts = String(opts.ts ?? NOW);
  const sig = await svixSignature(opts.secret ?? WEBHOOK_SECRET, id, ts, body);
  return new Request("https://x/functions/v1/email-events", {
    method: "POST",
    headers: { "svix-id": id, "svix-timestamp": ts, "svix-signature": `v1,bogus v1,${sig}`, "Content-Type": "application/json" },
    body,
  });
}
const bounce = { type: "email.bounced", created_at: "2026-11-20T10:00:00Z", data: { email_id: "re-msg-1", to: ["lender@example.test"], subject: "never stored", bounce: { type: "Permanent", subType: "General" } } };

test("bounce webhook: a good signature records the event once; bad and old signatures are refused", async () => {
  const db = { calls: [] as Call[], rpc: async (fn: string, args: Record<string, unknown>) => { db.calls.push({ fn, args }); return { data: "flagged_bounced", error: null }; } };
  const deps = { env: (n: string) => (n === "RESEND_WEBHOOK_SECRET" ? WEBHOOK_SECRET : undefined), rpc: db.rpc, nowSeconds: () => NOW };
  const ok = await handleEmailEvents(await signedWebhook(bounce), deps);
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { ok: true, result: "flagged_bounced" });
  assert.deepEqual(db.calls[0], {
    fn: "email_event_record",
    args: { p_event_id: "msg_2pXq1", p_type: "email.bounced", p_message_id: "re-msg-1", p_addresses: ["lender@example.test"], p_bounce_type: "Permanent" },
  });
  // Wrong secret, missing headers, a changed body, an old timestamp: nothing recorded.
  const wrong = await handleEmailEvents(await signedWebhook(bounce, { secret: "whsec_" + Buffer.from("another-secret").toString("base64") }), deps);
  assert.equal(wrong.status, 401);
  assert.equal((await wrong.json()).code, "DZ-E7030");
  const unsigned = await handleEmailEvents(new Request("https://x", { method: "POST", body: JSON.stringify(bounce) }), deps);
  assert.equal((await unsigned.json()).code, "DZ-E7030");
  const signed = await signedWebhook(bounce);
  const tampered = new Request("https://x", { method: "POST", headers: signed.headers, body: JSON.stringify({ ...bounce, type: "email.complained" }) });
  assert.equal((await (await handleEmailEvents(tampered, deps)).json()).code, "DZ-E7030");
  const stale = await handleEmailEvents(await signedWebhook(bounce, { ts: NOW - 301 }), deps);
  assert.equal((await stale.json()).code, "DZ-E7031");
  assert.equal(db.calls.length, 1, "only the good one reached the database");
  // No secret yet: 503, and other events are answered without a database call.
  const noSecret = await handleEmailEvents(await signedWebhook(bounce), { ...deps, env: () => undefined });
  assert.equal((await noSecret.json()).code, "DZ-E7032");
  const delivered = await handleEmailEvents(await signedWebhook({ type: "email.delivered", data: { email_id: "x", to: ["a@b.c"] } }), deps);
  assert.deepEqual(await delivered.json(), { ok: true, result: "ignored" });
  assert.equal(db.calls.length, 1);
});

test("svix: any of several signatures may match", async () => {
  const body = "{}";
  const sig = await svixSignature(WEBHOOK_SECRET, "id1", String(NOW), body);
  assert.equal(await verifySvix(WEBHOOK_SECRET, { id: "id1", timestamp: String(NOW), signature: `v1,${sig}` }, body, NOW), "ok");
  assert.equal(await verifySvix(WEBHOOK_SECRET, { id: "id1", timestamp: String(NOW), signature: `v2,${sig}` }, body, NOW), "bad_signature");
  assert.equal(await verifySvix(WEBHOOK_SECRET, { id: null, timestamp: String(NOW), signature: `v1,${sig}` }, body, NOW), "unsigned");
});

test("unsubscribe: one-click POST with a good token turns rental emails off; a GET changes nothing", async () => {
  const calls: Call[] = [];
  const deps = { env: (n: string) => (n === "EMAIL_JOB_SECRET" ? SECRET : undefined), rpc: async (fn: string, args: Record<string, unknown>) => { calls.push({ fn, args }); return { data: "unsubscribed", error: null }; } };
  const token = await unsubscribeToken(SECRET, USER);
  const ok = await handleUnsubscribe(new Request(`https://x/functions/v1/email-unsubscribe?u=${USER}&t=${token}`, { method: "POST", body: "List-Unsubscribe=One-Click" }), deps);
  assert.equal(ok.status, 200);
  assert.deepEqual(calls, [{ fn: "email_unsubscribe", args: { p_user_id: USER } }]);
  const bad = await handleUnsubscribe(new Request(`https://x/functions/v1/email-unsubscribe?u=${USER}&t=${token}x`, { method: "POST" }), deps);
  assert.equal((await bad.json()).code, "DZ-E7033");
  const other = await handleUnsubscribe(new Request(`https://x/functions/v1/email-unsubscribe?u=0b6c4e9e-1f2a-4c3d-8e5f-6a7b8c9d0e1f&t=${token}`, { method: "POST" }), deps);
  assert.equal(other.status, 400, "a token is only good for its own account");
  const get = await handleUnsubscribe(new Request(`https://x/functions/v1/email-unsubscribe?u=${USER}&t=${token}`), deps);
  assert.equal(get.status, 303);
  assert.equal(calls.length, 1, "neither the bad token nor the GET changed anything");
});
