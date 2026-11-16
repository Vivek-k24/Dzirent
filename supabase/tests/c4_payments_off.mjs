// C4 integration, with the Stripe keys BLANK (supabase/functions/local.env; local backend only):
// 1. Every payment function answers 503 DZ-E4030 "Payments aren't available yet.", with
//    payments_enabled off and with it on (the keys are still blank).
// 2. The admin Integrations check: a non-admin is refused; the admin (two-step) sees payments
//    "not configured", and the answer holds no secret values. The read is in the admin log.
// Prints only statuses, codes and counts.
// Run: node supabase/tests/c4_payments_off.mjs (the runner serves the functions with local.env)
import assert from "node:assert/strict";
import { LIVE, sql, userEnv } from "./lib/config.mjs";
import { adminSession, fn, fnRaw, signIn, signedEvent } from "./lib/c4.mjs";

if (LIVE) {
  console.error("c4_payments_off runs only against the local backend.");
  process.exit(1);
}

const ZERO = "00000000-0000-0000-0000-000000000000";
const NOT_AVAILABLE = { code: "DZ-E4030", message: "Payments aren't available yet." };

async function everyFunctionRefuses(u1, u3, label) {
  const calls = [
    ["stripe-onboard", () => fn("stripe-onboard", { token: u1.token })],
    ["stripe-account-status", () => fn("stripe-account-status", { token: u1.token })],
    ["stripe-pay", () => fn("stripe-pay", { token: u3.token, body: { rental_id: ZERO } })],
    ["stripe-deposit (place)", () => fn("stripe-deposit", { token: u1.token, body: { action: "place", rental_id: ZERO } })],
    ["stripe-deposit (outbox)", () => fn("stripe-deposit", { body: { operation_id: ZERO }, headers: { "x-payments-secret": "local-payments-secret" } })],
    ["stripe-refund", () => fn("stripe-refund", { body: { operation_id: ZERO }, headers: { "x-payments-secret": "local-payments-secret" } })],
    ["stripe-webhook", () => {
      const e = signedEvent("whsec_local_test_secret", `evt_c4off_${Date.now()}`, "payment_intent.succeeded", { id: "pi_x" });
      return fnRaw("stripe-webhook", e.body, { "Stripe-Signature": e.header });
    }],
  ];
  for (const [name, run] of calls) {
    const res = await run();
    assert.equal(res.status, 503, `${name} (${label}): ${res.status} ${JSON.stringify(res.data)}`);
    assert.deepEqual(res.data, NOT_AVAILABLE, `${name} (${label}) answers DZ-E4030`);
  }
  console.log(`   ${calls.length} payment calls, ${label}: all 503 ${NOT_AVAILABLE.code} "${NOT_AVAILABLE.message}"`);
}

async function run() {
  const u1 = await signIn(userEnv.TEST_USER_1_EMAIL, userEnv.TEST_USER_1_PASSWORD);
  const u3 = await signIn(userEnv.TEST_USER_3_EMAIL, userEnv.TEST_USER_3_PASSWORD);
  let admin = null;
  try {
    console.log("1. Keys blank: every payment function answers \"Payments aren't available yet.\"");
    sql("update public.app_settings set enabled = false where key = 'payments_enabled'");
    await everyFunctionRefuses(u1, u3, "payments_enabled off");
    sql("update public.app_settings set enabled = true where key = 'payments_enabled'");
    await everyFunctionRefuses(u1, u3, "payments_enabled on, keys blank");
    sql("update public.app_settings set enabled = false where key = 'payments_enabled'");

    console.log("\n2. The Integrations page check");
    const refused = await fn("admin-integrations", { token: u3.token });
    assert.equal(refused.status, 403, `a non-admin: ${refused.status}`);
    assert.equal(refused.data?.code, "DZ-E5008");
    admin = await adminSession(userEnv.TEST_ADMIN_EMAIL, userEnv.TEST_ADMIN_PASSWORD);
    const before = Number(sql("select count(*) as n from app_private.admin_actions where action = 'view_integrations'")[0].n);
    const res = await fn("admin-integrations", { token: admin.token });
    assert.equal(res.status, 200, `admin-integrations: ${res.status} ${JSON.stringify(res.data)}`);
    const payments = res.data.integrations.find((i) => i.key === "payments");
    assert.deepEqual([payments.configured, payments.status], [false, "not configured"], "payments: not configured while the keys are blank");
    assert.deepEqual(res.data.integrations.map((i) => i.key), ["payments", "id_checks", "notifications", "email", "photo_checks"]);
    const text = JSON.stringify(res.data);
    for (const secret of ["local-payments-secret", "local-push-secret", "local-scan-secret", "whsec_", "sk_test_"]) {
      assert.ok(!text.includes(secret), "the answer holds no secret values");
    }
    const after = Number(sql("select count(*) as n from app_private.admin_actions where action = 'view_integrations'")[0].n);
    assert.equal(after, before + 1, "the read is in the admin log");
    console.log(`   non-admin ${refused.status} ${refused.data.code}; admin: ${res.data.integrations.map((i) => `${i.key} ${i.status}`).join(", ")}; logged`);
  } finally {
    sql("update public.app_settings set enabled = false where key = 'payments_enabled'");
    if (admin) await admin.close();
  }
  console.log("\nAll C4 payments-off checks PASSED!");
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
