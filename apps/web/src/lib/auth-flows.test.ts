// E1: node --test --experimental-strip-types (npm test). The rules behind "Forgot password?", the
// reset page, the confirmation link, "Send the link again", Google's return and "Finish your
// profile". The real Auth calls run against the local stack in supabase/tests/e1_auth.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NEUTRAL_RESET,
  RESEND_COOLDOWN_SECONDS,
  afterVerified,
  authErrorCode,
  callbackStep,
  clientAddress,
  emailProblem,
  emailRequestOutcome,
  finishProfileProblem,
  hasPasswordSignIn,
  linkFailurePath,
  needsProfile,
  newPasswordProblem,
  resendWait,
  resetView,
  returnUrl,
  suggestedName,
} from "./auth-flows.ts";

test("forgot password: a malformed address is refused in place, a good one isn't", () => {
  assert.equal(emailProblem("")?.code, "DZ-E1070");
  assert.equal(emailProblem("no-at-sign")?.code, "DZ-E1070");
  assert.equal(emailProblem("a@b")?.field, "email");
  assert.equal(emailProblem(" jordan@example.com "), null);
});

test("forgot password: the answer is neutral whatever the address, except limits on this network", () => {
  // An address with an account, one without (Auth answers 200 for both), Auth's per-address
  // limit (only an existing account reaches it), a failure while sending (same), our own
  // per-address limit: all the same neutral answer.
  assert.deepEqual(emailRequestOutcome("ok", null), { sent: true });
  assert.deepEqual(emailRequestOutcome("ok", { code: "over_email_send_rate_limit", status: 429 }), { sent: true });
  assert.deepEqual(emailRequestOutcome("ok", { status: 500, message: "Error sending recovery email" }), { sent: true });
  assert.deepEqual(emailRequestOutcome("address_limited", null), { sent: true });
  // Not about the address: shown.
  const limited = emailRequestOutcome("ip_limited", null);
  assert.equal(limited.sent, false);
  assert.equal(!limited.sent && limited.error.code, "DZ-E1008");
  const ipAtAuth = emailRequestOutcome("ok", { code: "over_request_rate_limit", status: 429 });
  assert.equal(!ipAtAuth.sent && ipAtAuth.error.code, "DZ-E1008");
  const offline = emailRequestOutcome("ok", { message: "fetch failed", status: 0 });
  assert.equal(!offline.sent && offline.error.code, "DZ-E9002");
  const bad = emailRequestOutcome("ok", { code: "email_address_invalid", status: 400 });
  assert.equal(!bad.sent && bad.error.code, "DZ-E1070");
  // The neutral words never say whether an account exists.
  assert.match(NEUTRAL_RESET, /^If that address has an account/);
});

test("reset: the new password follows the sign-up rules and both fields must match", () => {
  assert.equal(newPasswordProblem("short", "short")?.code, "DZ-E1071");
  assert.equal(newPasswordProblem("long enough 1", "long enough 2")?.code, "DZ-E1072");
  assert.equal(newPasswordProblem("long enough 1", "long enough 2")?.field, "password_confirm");
  assert.equal(newPasswordProblem("long enough 1", "long enough 1"), null);
});

test("reset: Auth's refusals get their own codes (breached, same, weak, expired, limits)", () => {
  assert.equal(authErrorCode({ code: "weak_password", reasons: ["pwned"] }), "DZ-E1073");
  assert.equal(authErrorCode({ code: "weak_password", reasons: ["length"] }), "DZ-E1007");
  assert.equal(authErrorCode({ code: "same_password", status: 422 }), "DZ-E1074");
  assert.equal(authErrorCode({ code: "otp_expired", status: 403 }), "DZ-E1075");
  assert.equal(authErrorCode({ status: 403, message: "Email link is invalid or has expired" }), "DZ-E1075");
  assert.equal(authErrorCode({ status: 429, code: "over_request_rate_limit" }), "DZ-E1008");
  assert.equal(authErrorCode({ status: 500, message: "Error sending recovery email" }), "DZ-E1084");
  assert.equal(authErrorCode({ status: 0, message: "fetch failed" }), "DZ-E9002");
  assert.equal(authErrorCode(null), "DZ-E9999");
});

test("callback: Google's code, an email link, Google's refusal and a broken link", () => {
  assert.deepEqual(callbackStep({ code: "a1b2c3d4-e5f6" }), { step: "exchange", code: "a1b2c3d4-e5f6" });
  assert.deepEqual(callbackStep({ token_hash: "pkce_0123456789abcdef", type: "email" }), { step: "verify", tokenHash: "pkce_0123456789abcdef", type: "email" });
  assert.deepEqual(callbackStep({ error: "access_denied" }), { step: "fail", code: "DZ-E7022" });
  assert.deepEqual(callbackStep({ error: "server_error" }), { step: "fail", code: "DZ-E7020" });
  assert.deepEqual(callbackStep({ token_hash: "0123456789abcdef", type: "unknown" }), { step: "fail", code: "DZ-E1076" });
  assert.deepEqual(callbackStep({}), { step: "fail", code: "DZ-E1076" });
  assert.deepEqual(callbackStep({ code: "bad code with spaces" }), { step: "fail", code: "DZ-E7020" });
});

test("callback: a confirmed sign-up shows You're confirmed; a reset or invite asks for a password; expired links say so", () => {
  assert.deepEqual(afterVerified("email"), { path: "/auth/confirmed", resetWindow: false });
  assert.deepEqual(afterVerified("signup"), { path: "/auth/confirmed", resetWindow: false });
  assert.deepEqual(afterVerified("email_change"), { path: "/auth/confirmed?change=1", resetWindow: false });
  assert.deepEqual(afterVerified("recovery"), { path: "/auth/reset", resetWindow: true });
  assert.deepEqual(afterVerified("invite"), { path: "/auth/reset?invite=1", resetWindow: true });
  // An expired reset link goes back to "Forgot password?" by way of the reset page, never home.
  assert.equal(linkFailurePath("recovery"), "/auth/reset?expired=1");
  assert.equal(linkFailurePath("email"), "/auth/confirmed?error=DZ-E1076");
});

test("reset page: the token is used once; a reload or a reopened link inside the recovery session shows the form, never expired", () => {
  const link = { token_hash: "pkce_0123456789abcdef", type: "recovery" };
  // First open: the form, carrying the token for the one verify (on submit).
  assert.deepEqual(resetView(link, false), { view: "form", tokenHash: "pkce_0123456789abcdef" });
  // The reload case: the same address again once the submit made the recovery session (a refused
  // password, a reload, the back button): the form without the token, so it is never sent twice.
  assert.deepEqual(resetView(link, true), { view: "form", tokenHash: "" });
  assert.deepEqual(resetView({}, true), { view: "form", tokenHash: "" });
  // The email link opened again after its token was used: Supabase answers with an error, or the
  // callback with ?expired=1. With the session: still the form. Without it: expired.
  assert.deepEqual(resetView({ error: "access_denied" }, true), { view: "form", tokenHash: "" });
  assert.deepEqual(resetView({ expired: "1" }, true), { view: "form", tokenHash: "" });
  assert.deepEqual(resetView({ error: "otp_expired" }, false), { view: "expired", code: "DZ-E1075" });
  assert.deepEqual(resetView({ expired: "1" }, false), { view: "expired", code: "DZ-E1075" });
  // Supabase's default template answers with ?code= (PKCE): exchanged once, then back without it.
  assert.deepEqual(resetView({ code: "a1b2c3d4-e5f6" }, false), { view: "exchange", code: "a1b2c3d4-e5f6" });
  assert.deepEqual(resetView({ code: "a1b2c3d4-e5f6" }, true), { view: "form", tokenHash: "" });
  // No link at all.
  assert.deepEqual(resetView({}, false), { view: "expired", code: "DZ-E1083" });
  assert.deepEqual(resetView({ token_hash: "bad token" }, false), { view: "expired", code: "DZ-E1075" });
  assert.deepEqual(resetView({ token_hash: "pkce_0123456789abcdef", type: "email" }, false), { view: "expired", code: "DZ-E1075" });
});

test("check your email: Send the link again waits a minute between emails", () => {
  const now = 1_800_000_000_000;
  assert.equal(resendWait(null, now), 0);
  assert.equal(resendWait(now, now), RESEND_COOLDOWN_SECONDS);
  assert.equal(resendWait(now - 59_000, now), 1);
  assert.equal(resendWait(now - 60_000, now), 0);
  assert.equal(resendWait(Number("not a number"), now), 0);
});

test("finish your profile: needed only while profile_completed_at is empty; its rules", () => {
  assert.equal(needsProfile({ profile_completed_at: null }), true);
  assert.equal(needsProfile({ profile_completed_at: "2026-11-20T10:00:00Z" }), false);
  assert.equal(needsProfile(null), false);
  // A row without the field (a database before the E1 migration) is never sent to the step.
  assert.equal(needsProfile({}), false);
  assert.equal(finishProfileProblem({ name: " ", adult: true, legal: true })?.code, "DZ-E1080");
  assert.equal(finishProfileProblem({ name: "x".repeat(81), adult: true, legal: true })?.code, "DZ-E1080");
  assert.equal(finishProfileProblem({ name: "Jordan", adult: false, legal: true })?.code, "DZ-E1079");
  assert.equal(finishProfileProblem({ name: "Jordan", adult: true, legal: false })?.code, "DZ-E1081");
  assert.equal(finishProfileProblem({ name: "Jordan", adult: true, legal: true }), null);
  // The name comes prefilled from Google.
  assert.equal(suggestedName({ full_name: "Jordan Bell", name: "J" }), "Jordan Bell");
  assert.equal(suggestedName({ name: "  Jordan  " }), "Jordan");
  assert.equal(suggestedName({}), "");
});

test("rate limits use the visitor's address on Vercel only; links come back to this site", () => {
  const h = (v: Record<string, string>) => (n: string) => v[n] ?? null;
  assert.equal(clientAddress(h({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }), true), "203.0.113.9");
  assert.equal(clientAddress(h({ "x-forwarded-for": "203.0.113.9" }), false), "");
  assert.equal(returnUrl("https://dzirent.vercel.app", "/auth/reset"), "https://dzirent.vercel.app/auth/reset");
  assert.equal(returnUrl("http://localhost:3000", "/auth/callback"), "http://localhost:3000/auth/callback");
  assert.equal(returnUrl("http://evil.example", "/auth/reset"), "https://dzirent.com/auth/reset");
  assert.equal(returnUrl(null, "/auth/reset"), "https://dzirent.com/auth/reset");
});

test("account page: a Google-only account has no password yet", () => {
  assert.equal(hasPasswordSignIn({ app_metadata: { providers: ["google"] }, identities: [{ provider: "google" }] }), false);
  assert.equal(hasPasswordSignIn({ app_metadata: { providers: ["email", "google"] } }), true);
  assert.equal(hasPasswordSignIn({ identities: [{ provider: "email" }] }), true);
});
