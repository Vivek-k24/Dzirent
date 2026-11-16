// C4: refunds, called only by the database through the outbox ({ "operation_id" } with
// x-payments-secret). The database decides the amount: the cancellation rule (cancel_rental and the
// automatic cancel), an admin refund (admin_refund_rental, admin_end_rental), or a payment that
// arrived after the rental ended. Two kinds of step:
//  - refund: a refund of the rental payment, reverse_transfer (the lender's share comes back) and
//    refund_application_fee (the fee comes back in proportion). charge.refunded confirms it.
//  - payment_cancel: an unpaid PaymentIntent of a cancelled rental is cancelled, so it can't be paid.
// A failure Stripe decides is recorded (admin Payments page) and answered 200; a failure to reach
// Stripe is 503, so the outbox tries again with the same idempotency key.
// Answers DZ-E4030 while payments are off or the Stripe keys are blank.
import { isUuid, readInput } from "../_shared/input.ts";
import { errorBody } from "../_shared/errors.ts";
import { cents, stripeCall, stripeErrorText, type StripeResult } from "../_shared/stripe.ts";
import { corsHeaders, dbRefusal, fromOutbox, json, notAvailable, paymentsReady, refuse, server, type Server } from "../_shared/payments.ts";

function decided(result: StripeResult): boolean {
  return !result.ok && result.status >= 400 && result.status < 500 && result.status !== 429;
}

async function finish(srv: Server, opId: string, ok: boolean, stripeId: string | null, error: string | null, details?: Record<string, unknown>) {
  const done = await srv.db.rpc("payment_operation_finish", {
    p_operation: opId, p_ok: ok, p_stripe_id: stripeId, p_error: error, p_details: details ?? null,
  });
  if (done.error) return refuse("DZ-E9999");
  return json(200, { ok: true, operation_id: opId, state: (done.data as { state?: string } | null)?.state ?? null });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return refuse("DZ-E9005");
  const srv = server();
  if (!srv) return refuse("DZ-E9003");
  const cfg = await paymentsReady(srv);
  if (!cfg) return notAvailable();
  if (!fromOutbox(req)) return refuse("DZ-E9004");

  const input = await readInput(req, { allowed: ["operation_id"], required: ["operation_id"], maxBytes: 1024 });
  if (!input.ok) return json(input.status, errorBody(input.code, input.message));
  const opId = input.body.operation_id;
  if (!isUuid(opId)) return refuse("DZ-E9016");

  try {
    const started = await srv.db.rpc("payment_operation_start", { p_operation: opId });
    if (started.error) return dbRefusal(started.error);
    const op = started.data as Record<string, unknown> & { state: string; kind: string; idempotency_key: string };
    if (op.state !== "running") return json(200, { ok: true, operation_id: opId, state: op.state });
    const intent = typeof op.payment_intent_id === "string" ? op.payment_intent_id : null;

    if (op.kind === "refund") {
      if (!intent || !(Number(op.amount) > 0)) return finish(srv, opId, false, null, "Nothing to refund");
      const res = await stripeCall(cfg, "POST", "/v1/refunds", {
        payment_intent: intent,
        amount: cents(op.amount),
        reverse_transfer: true,
        refund_application_fee: true,
        metadata: { rental_id: op.rental_id, operation_id: opId },
      }, op.idempotency_key);
      if (res.ok) return finish(srv, opId, true, res.body.id, null, { stripe_status: res.body.status, amount: cents(op.amount) });
      return decided(res) ? finish(srv, opId, false, null, stripeErrorText(res)) : refuse("DZ-E4036");
    }

    if (op.kind === "payment_cancel") {
      if (!intent) return finish(srv, opId, true, null, null, { note: "no payment" });
      const res = await stripeCall(cfg, "POST", `/v1/payment_intents/${encodeURIComponent(intent)}/cancel`, {}, op.idempotency_key);
      if (res.ok || res.error?.code === "payment_intent_unexpected_state") {
        return finish(srv, opId, true, intent, null, { stripe_status: res.ok ? res.body.status : "ended" });
      }
      return decided(res) ? finish(srv, opId, false, intent, stripeErrorText(res)) : refuse("DZ-E4036");
    }

    return refuse("DZ-E9016");
  } catch {
    return refuse("DZ-E9999");
  }
});
