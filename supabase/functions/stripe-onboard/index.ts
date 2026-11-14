// C4: a lender sets up payouts. Creates the caller's Stripe Express account (once: the first one
// is kept, and the create call's idempotency key is the account owner's id) and returns a link to
// Stripe's onboarding page. Stripe collects identity, bank and tax details; Dzirent stores only the
// account id and its three status flags (payout_accounts).
// POST /functions/v1/stripe-onboard  { "return_url"?: "https://dzirent.com/...", "refresh_url"?: ... }
// Answers DZ-E4030 while payments are off or the Stripe keys are blank.
import { readInput } from "../_shared/input.ts";
import { errorBody } from "../_shared/errors.ts";
import { stripeCall } from "../_shared/stripe.ts";
import {
  bearer, callerId, corsHeaders, dbRefusal, json, notAvailable, paymentsReady, refuse, safeReturnUrl, server,
} from "../_shared/payments.ts";

const DEFAULT_RETURN = "https://dzirent.com/app/settings/payouts?stripe=return";
const DEFAULT_REFRESH = "https://dzirent.com/app/settings/payouts?stripe=refresh";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return refuse("DZ-E9005");
  const srv = server();
  if (!srv) return refuse("DZ-E9003");
  const cfg = await paymentsReady(srv);
  if (!cfg) return notAvailable();

  const uid = await callerId(srv, bearer(req));
  if (!uid) return refuse("DZ-E1003");
  const input = await readInput(req, { allowed: ["return_url", "refresh_url"], maxBytes: 2048, emptyIsObject: true });
  if (!input.ok) return json(input.status, errorBody(input.code, input.message));

  try {
    const prep = await srv.db.rpc("payment_onboard_prepare", { p_user: uid });
    if (prep.error) return dbRefusal(prep.error);
    let account = (prep.data as { account_id?: string | null } | null)?.account_id ?? null;
    if (!account) {
      const created = await stripeCall(cfg, "POST", "/v1/accounts", {
        type: "express",
        country: "US",
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        metadata: { dzirent_user: uid },
      }, `dz-acct-${uid}`);
      if (!created.ok || typeof created.body.id !== "string") return refuse("DZ-E4036");
      const saved = await srv.db.rpc("payment_save_account", { p_user: uid, p_account: created.body.id });
      if (saved.error || typeof saved.data !== "string") return refuse("DZ-E9999");
      account = saved.data;
    }
    // An onboarding link is single-use and short-lived: each request asks for a new one.
    const link = await stripeCall(cfg, "POST", "/v1/account_links", {
      account,
      type: "account_onboarding",
      return_url: safeReturnUrl(input.body.return_url, DEFAULT_RETURN),
      refresh_url: safeReturnUrl(input.body.refresh_url, DEFAULT_REFRESH),
    }, `dz-link-${crypto.randomUUID()}`);
    if (!link.ok || typeof link.body.url !== "string") return refuse("DZ-E4036");
    console.log(JSON.stringify({ fn: "stripe-onboard", ok: true }));
    return json(200, { ok: true, url: link.body.url });
  } catch {
    return refuse("DZ-E9999");
  }
});
