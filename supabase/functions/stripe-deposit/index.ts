// C4: the deposit hold on the renter's card (a manual-capture PaymentIntent, off-session, with the
// card saved at payment). Two callers:
//  - The lender, at pickup: { "action": "place", "rental_id" } with their token. Places the hold
//    (rental paid, deposit set, 2 pickup photos), stores capture_before, then marks the rental
//    picked up as the lender. A hold Stripe hasn't confirmed yet answers 202 { deposit_status:
//    "pending" }; the amount_capturable_updated webhook confirms it, and calling again marks pickup.
//  - The database, through the outbox: { "operation_id" } with x-payments-secret. Runs one step:
//    deposit_release (cancel the hold), deposit_capture (capture up to the claim; if the hold is
//    gone, an off-session charge for the amount instead) or deposit_renew (a new hold, then the old
//    one released). A failure Stripe decides (a declined card) is recorded and answered 200; a
//    failure to reach Stripe is 503, so the outbox tries again with the same idempotency key.
// Answers DZ-E4030 while payments are off or the Stripe keys are blank.
import { isUuid, readInput } from "../_shared/input.ts";
import { errorBody } from "../_shared/errors.ts";
import { cents, stripeCall, stripeErrorText, type StripeConfig, type StripeObject, type StripeResult } from "../_shared/stripe.ts";
import {
  bearer, callerId, corsHeaders, dbRefusal, fromOutbox, json, notAvailable, paymentsReady, refuse, rpcAsCaller, server, type Server,
} from "../_shared/payments.ts";

/** Stripe's capture_before for a hold (on its charge), as an ISO time, or null. */
function captureBefore(intent: StripeObject): string | null {
  const charge = intent.latest_charge;
  const unix = typeof charge === "object" && charge ? charge.payment_method_details?.card?.capture_before : null;
  return typeof unix === "number" ? new Date(unix * 1000).toISOString() : null;
}

/** Stripe said no for a reason a retry won't change (a declined card, a closed hold). */
function decided(result: StripeResult): boolean {
  return !result.ok && result.status >= 400 && result.status < 500 && result.status !== 429;
}

/** The PaymentIntent was already cancelled, captured or ended: nothing is held any more. */
function alreadyEnded(result: StripeResult): boolean {
  return !result.ok && result.error?.code === "payment_intent_unexpected_state";
}

function holdParams(op: Record<string, unknown>, amount: unknown, kind: string) {
  return {
    amount: cents(amount),
    currency: "usd",
    customer: op.customer_id,
    payment_method: op.payment_method_id,
    // Off-session confirm needs no return address when redirect methods are off.
    automatic_payment_methods: { enabled: true, allow_redirects: "never" },
    off_session: true,
    confirm: true,
    capture_method: "manual",
    transfer_data: { destination: op.lender_account },
    metadata: { rental_id: op.rental_id, kind },
    expand: ["latest_charge"],
  };
}

async function finish(srv: Server, opId: string, ok: boolean, stripeId: string | null, error: string | null, details?: Record<string, unknown>) {
  const done = await srv.db.rpc("payment_operation_finish", {
    p_operation: opId, p_ok: ok, p_stripe_id: stripeId, p_error: error, p_details: details ?? null,
  });
  if (done.error) return refuse("DZ-E9999");
  return json(200, { ok: true, operation_id: opId, state: (done.data as { state?: string } | null)?.state ?? null });
}

async function runOperation(srv: Server, cfg: StripeConfig, opId: string): Promise<Response> {
  const started = await srv.db.rpc("payment_operation_start", { p_operation: opId });
  if (started.error) return dbRefusal(started.error);
  const op = started.data as Record<string, unknown> & { state: string; kind: string; idempotency_key: string };
  if (op.state !== "running") return json(200, { ok: true, operation_id: opId, state: op.state });
  const key = op.idempotency_key;
  const holdId = typeof op.deposit_intent_id === "string" ? op.deposit_intent_id : null;

  if (op.kind === "deposit_release") {
    if (!holdId) return finish(srv, opId, true, null, null, { note: "no hold" });
    const res = await stripeCall(cfg, "POST", `/v1/payment_intents/${encodeURIComponent(holdId)}/cancel`, {}, key);
    if (res.ok || alreadyEnded(res)) return finish(srv, opId, true, holdId, null, { stripe_status: res.ok ? res.body.status : "ended" });
    return decided(res) ? finish(srv, opId, false, holdId, stripeErrorText(res)) : refuse("DZ-E4036");
  }

  if (op.kind === "deposit_capture") {
    if (holdId && ["held", "pending"].includes(String(op.deposit_status))) {
      const res = await stripeCall(cfg, "POST", `/v1/payment_intents/${encodeURIComponent(holdId)}/capture`,
        { amount_to_capture: cents(op.amount) }, key);
      if (res.ok) return finish(srv, opId, true, holdId, null, { captured: cents(op.amount), stripe_status: res.body.status });
      if (!decided(res)) return refuse("DZ-E4036");
      if (!alreadyEnded(res)) return finish(srv, opId, false, holdId, stripeErrorText(res));
    }
    // The hold ended before the claim was settled: charge the saved card for the amount instead.
    if (!op.customer_id || !op.payment_method_id || !op.lender_account) {
      return finish(srv, opId, false, null, "No hold and no saved card to charge");
    }
    const { capture_method: _manual, expand: _expand, ...charge } = holdParams(op, op.amount, "claim");
    const res = await stripeCall(cfg, "POST", "/v1/payment_intents", charge, `${key}-charge`);
    if (res.ok) return finish(srv, opId, true, res.body.id, null, { captured: cents(op.amount), charged_separately: true });
    return decided(res) ? finish(srv, opId, false, null, stripeErrorText(res)) : refuse("DZ-E4036");
  }

  if (op.kind === "deposit_renew") {
    if (!op.customer_id || !op.payment_method_id || !op.lender_account) {
      return finish(srv, opId, false, null, "No saved card for a new hold");
    }
    const res = await stripeCall(cfg, "POST", "/v1/payment_intents", holdParams(op, op.amount, "deposit"), key);
    if (!res.ok) return decided(res) ? finish(srv, opId, false, null, stripeErrorText(res)) : refuse("DZ-E4036");
    if (holdId) {
      // The old hold: released once the new one exists (if this fails, it simply ends on its own).
      await stripeCall(cfg, "POST", `/v1/payment_intents/${encodeURIComponent(holdId)}/cancel`, {}, `${key}-release-old`);
    }
    return finish(srv, opId, true, res.body.id, null, {
      intent: res.body.id, stripe_status: res.body.status, capture_before: captureBefore(res.body), replaced: holdId,
    });
  }

  return refuse("DZ-E9016");
}

async function markPickedUp(srv: Server, token: string, rentalId: string, deposit: string) {
  const res = await rpcAsCaller(srv, token, "mark_picked_up", { p_rental_id: rentalId });
  if (!res.ok) return dbRefusal(res.body as { message?: string } | null);
  return json(200, { ok: true, status: "picked_up", deposit_status: deposit });
}

async function place(srv: Server, cfg: StripeConfig, token: string, uid: string, rentalId: string): Promise<Response> {
  const prep = await srv.db.rpc("payment_deposit_prepare", { p_user: uid, p_rental: rentalId });
  if (prep.error) return dbRefusal(prep.error);
  const p = prep.data as Record<string, unknown> & { needs_hold: boolean; operation_id?: string; idempotency_key?: string };
  if (!p.needs_hold) return markPickedUp(srv, token, rentalId, String(p.deposit_status ?? "none"));

  const record = async (intent: StripeObject | null, error: string | null) => {
    const saved = await srv.db.rpc("payment_deposit_result", {
      p_operation: p.operation_id, p_intent: intent?.id ?? null, p_status: intent?.status ?? null,
      p_capture_before: intent ? captureBefore(intent) : null, p_error: error,
    });
    return saved.error ? null : (saved.data as { deposit_status: string }).deposit_status;
  };

  // A hold from an earlier try that Stripe hadn't confirmed: ask Stripe about it first.
  if (typeof p.pending_intent === "string") {
    const got = await stripeCall(cfg, "GET", `/v1/payment_intents/${encodeURIComponent(p.pending_intent)}`, { expand: ["latest_charge"] });
    if (!got.ok) return refuse("DZ-E4036");
    if (got.body.status === "requires_capture") {
      const status = await record(got.body, null);
      return status === "held" ? markPickedUp(srv, token, rentalId, "held") : refuse("DZ-E9999");
    }
    if (["requires_action", "processing", "requires_confirmation"].includes(got.body.status)) {
      return json(202, { ok: true, status: "paid", deposit_status: "pending" });
    }
    // requires_payment_method or canceled: that try failed; place a new hold below.
  }

  const created = await stripeCall(cfg, "POST", "/v1/payment_intents", holdParams(p, p.amount, "deposit"), p.idempotency_key);
  if (!created.ok) {
    if (decided(created)) {
      await record(null, stripeErrorText(created));
      return refuse("DZ-E4035");
    }
    return refuse("DZ-E4036");
  }
  const status = await record(created.body, null);
  if (status === "held") return markPickedUp(srv, token, rentalId, "held");
  if (status === "pending") return json(202, { ok: true, status: "paid", deposit_status: "pending" });
  return refuse("DZ-E4035");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return refuse("DZ-E9005");
  const srv = server();
  if (!srv) return refuse("DZ-E9003");
  const cfg = await paymentsReady(srv);
  if (!cfg) return notAvailable();

  try {
    if (fromOutbox(req)) {
      const input = await readInput(req, { allowed: ["operation_id"], required: ["operation_id"], maxBytes: 1024 });
      if (!input.ok) return json(input.status, errorBody(input.code, input.message));
      if (!isUuid(input.body.operation_id)) return refuse("DZ-E9016");
      return await runOperation(srv, cfg, input.body.operation_id);
    }
    const token = bearer(req);
    const uid = await callerId(srv, token);
    if (!uid || !token) return refuse("DZ-E1003");
    const input = await readInput(req, { allowed: ["action", "rental_id"], required: ["action", "rental_id"], maxBytes: 1024 });
    if (!input.ok) return json(input.status, errorBody(input.code, input.message));
    // People only place a hold; releases and captures follow the rental and claim rules.
    if (input.body.action !== "place" || !isUuid(input.body.rental_id)) return refuse("DZ-E9016");
    return await place(srv, cfg, token, uid, input.body.rental_id);
  } catch {
    return refuse("DZ-E9999");
  }
});
