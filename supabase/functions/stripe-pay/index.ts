// C4: the renter pays an accepted rental (awaiting_payment). Creates one destination-charge
// PaymentIntent per rental: the total from the C3 price snapshot (plus the sales tax hook, $0),
// transfer_data.destination = the lender's Stripe account, application_fee_amount from the
// platform_fee_percent setting, and setup_future_usage = off_session so the same card can carry
// the deposit hold and a claim later. Returns the client secret for Stripe's payment sheet; the
// payment_intent.succeeded webhook moves the rental to paid.
// Calling it again returns the same PaymentIntent (stored on the rental; idempotency key per rental).
// POST /functions/v1/stripe-pay  { "rental_id": "<uuid>" }
// Answers DZ-E4030 while payments are off or the Stripe keys are blank.
import { isUuid, readInput } from "../_shared/input.ts";
import { errorBody } from "../_shared/errors.ts";
import { cents, stripeCall, type StripeObject } from "../_shared/stripe.ts";
import { bearer, callerId, corsHeaders, dbRefusal, json, notAvailable, paymentsReady, refuse, server } from "../_shared/payments.ts";

type Prepared = {
  rental_id: string;
  currency: string;
  amount: number;
  fee: number;
  tax: number;
  lender_account: string;
  customer_id: string | null;
  payment_intent_id: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return refuse("DZ-E9005");
  const srv = server();
  if (!srv) return refuse("DZ-E9003");
  const cfg = await paymentsReady(srv);
  if (!cfg) return notAvailable();

  const uid = await callerId(srv, bearer(req));
  if (!uid) return refuse("DZ-E1003");
  const input = await readInput(req, { allowed: ["rental_id"], required: ["rental_id"], maxBytes: 1024 });
  if (!input.ok) return json(input.status, errorBody(input.code, input.message));
  const rentalId = input.body.rental_id;
  if (!isUuid(rentalId)) return refuse("DZ-E9016");

  try {
    const prep = await srv.db.rpc("payment_pay_prepare", { p_user: uid, p_rental: rentalId });
    if (prep.error) return dbRefusal(prep.error);
    const p = prep.data as Prepared;

    let customer = p.customer_id;
    if (!customer) {
      const created = await stripeCall(cfg, "POST", "/v1/customers", { metadata: { dzirent_user: uid } }, `dz-cus-${uid}`);
      if (!created.ok || typeof created.body.id !== "string") return refuse("DZ-E4036");
      const saved = await srv.db.rpc("payment_save_customer", { p_user: uid, p_customer: created.body.id });
      if (saved.error || typeof saved.data !== "string") return refuse("DZ-E9999");
      customer = saved.data;
    }

    let intent: StripeObject | null = null;
    if (!p.payment_intent_id) {
      const fee = cents(p.fee);
      const created = await stripeCall(cfg, "POST", "/v1/payment_intents", {
        amount: cents(p.amount),
        currency: p.currency,
        customer,
        // No redirect-based methods: what the renter pays with can carry the deposit hold later.
        automatic_payment_methods: { enabled: true, allow_redirects: "never" },
        setup_future_usage: "off_session",
        transfer_data: { destination: p.lender_account },
        ...(fee > 0 ? { application_fee_amount: fee } : {}),
        metadata: { rental_id: p.rental_id, kind: "rental" },
      }, `dz-pay-${p.rental_id}`);
      if (!created.ok || typeof created.body.id !== "string") return refuse("DZ-E4036");
      const saved = await srv.db.rpc("payment_save_intent", {
        p_rental: p.rental_id, p_intent: created.body.id, p_fee: p.fee, p_tax: p.tax,
      });
      if (saved.error || typeof saved.data !== "string") return refuse("DZ-E9999");
      intent = saved.data === created.body.id ? created.body : null;
      p.payment_intent_id = saved.data;
    }
    if (!intent) {
      const got = await stripeCall(cfg, "GET", `/v1/payment_intents/${encodeURIComponent(p.payment_intent_id!)}`);
      if (!got.ok) return refuse("DZ-E4036");
      intent = got.body;
    }
    console.log(JSON.stringify({ fn: "stripe-pay", ok: true }));
    return json(200, {
      ok: true,
      rental_id: p.rental_id,
      payment_intent_id: intent.id,
      client_secret: intent.client_secret,
      publishable_key: cfg.publishableKey,
      amount: p.amount,
      currency: p.currency,
    });
  } catch {
    return refuse("DZ-E9999");
  }
});
