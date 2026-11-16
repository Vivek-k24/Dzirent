// C4: Stripe's events. The signature (Stripe-Signature) is checked on the raw body before anything
// is parsed; an unsigned or wrongly signed request gets 400 DZ-E4038 and changes nothing. Each
// event is recorded once in app_private.payment_events (its id is unique; only a hash of the
// payload is kept), so a repeated event is answered 200 and processed once. Handled:
// payment_intent.succeeded / payment_failed / canceled / amount_capturable_updated, charge.refunded,
// charge.dispute.created / closed, account.updated (the database function payment_handle_event).
// A database failure answers 500, so Stripe sends the event again.
// POST /functions/v1/stripe-webhook (Stripe only; no Supabase token)
// Answers DZ-E4030 (503, Stripe retries for up to 3 days) while payments are off or the keys are blank.
import { errorBody } from "../_shared/errors.ts";
import { sha256Hex, stripeCall, verifyStripeSignature } from "../_shared/stripe.ts";
import { json, notAvailable, paymentsReady, refuse, server } from "../_shared/payments.ts";

const MAX_BYTES = 512 * 1024;

Deno.serve(async (req) => {
  if (req.method !== "POST") return refuse("DZ-E9005");
  const srv = server();
  if (!srv) return refuse("DZ-E9003");
  const cfg = await paymentsReady(srv);
  if (!cfg) return notAvailable();

  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_BYTES) return json(413, errorBody("DZ-E9013"));
  let raw: Uint8Array;
  try {
    raw = new Uint8Array(await req.arrayBuffer());
  } catch {
    return refuse("DZ-E9014");
  }
  if (raw.byteLength > MAX_BYTES) return json(413, errorBody("DZ-E9013"));

  // 1. The signature, on the exact bytes Stripe sent.
  if (!(await verifyStripeSignature(raw, req.headers.get("Stripe-Signature"), cfg.webhookSecrets))) {
    return refuse("DZ-E4038");
  }

  // 2. Only now is the body read.
  // deno-lint-ignore no-explicit-any
  let event: any;
  try {
    event = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
  } catch {
    return refuse("DZ-E9010");
  }
  const object = event?.data?.object;
  if (typeof event?.id !== "string" || typeof event?.type !== "string" || !object || typeof object !== "object") {
    return refuse("DZ-E9016");
  }

  try {
    // A hold's end time is on its charge (capture_before), which the event doesn't expand.
    let captureBefore: string | null = null;
    if (event.type === "payment_intent.amount_capturable_updated" && object.latest_charge) {
      const chargeId = typeof object.latest_charge === "string" ? object.latest_charge : object.latest_charge.id;
      if (typeof chargeId === "string") {
        const charge = await stripeCall(cfg, "GET", `/v1/charges/${encodeURIComponent(chargeId)}`);
        const unix = charge.ok ? charge.body.payment_method_details?.card?.capture_before : null;
        if (typeof unix === "number") captureBefore = new Date(unix * 1000).toISOString();
      }
    }
    const handled = await srv.db.rpc("payment_handle_event", {
      p_event_id: event.id,
      p_type: event.type,
      p_payload_hash: await sha256Hex(raw),
      p_object: object,
      p_capture_before: captureBefore,
    });
    if (handled.error) return refuse("DZ-E9999");
    const result = (handled.data as { result?: string } | null)?.result ?? null;
    console.log(JSON.stringify({ fn: "stripe-webhook", type: event.type, result }));
    return json(200, { received: true, result });
  } catch {
    return refuse("DZ-E9999");
  }
});
