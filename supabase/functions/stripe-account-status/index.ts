// C4: refreshes the caller's payout account from Stripe (charges_enabled, payouts_enabled,
// details_submitted) into payout_accounts and returns it. The account.updated webhook does the same
// on its own; this is for the screen a lender returns to after Stripe's onboarding.
// POST /functions/v1/stripe-account-status  {}
// Answers DZ-E4030 while payments are off or the Stripe keys are blank.
import { readInput } from "../_shared/input.ts";
import { errorBody } from "../_shared/errors.ts";
import { stripeCall } from "../_shared/stripe.ts";
import { bearer, callerId, corsHeaders, dbRefusal, json, notAvailable, paymentsReady, refuse, server } from "../_shared/payments.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return refuse("DZ-E9005");
  const srv = server();
  if (!srv) return refuse("DZ-E9003");
  const cfg = await paymentsReady(srv);
  if (!cfg) return notAvailable();

  const uid = await callerId(srv, bearer(req));
  if (!uid) return refuse("DZ-E1003");
  const input = await readInput(req, { allowed: [], maxBytes: 1024, emptyIsObject: true });
  if (!input.ok) return json(input.status, errorBody(input.code, input.message));

  try {
    const found = await srv.db.rpc("payment_account_for", { p_user: uid });
    if (found.error) return dbRefusal(found.error);
    const account = typeof found.data === "string" ? found.data : null;
    if (!account) return json(200, { ok: true, account: null });
    const got = await stripeCall(cfg, "GET", `/v1/accounts/${encodeURIComponent(account)}`);
    if (!got.ok) return refuse("DZ-E4036");
    const saved = await srv.db.rpc("payment_update_account", {
      p_account: account,
      p_charges: got.body.charges_enabled === true,
      p_payouts: got.body.payouts_enabled === true,
      p_details: got.body.details_submitted === true,
    });
    if (saved.error) return dbRefusal(saved.error);
    return json(200, { ok: true, account: saved.data });
  } catch {
    return refuse("DZ-E9999");
  }
});
