// C6: npm test: ID verification labels, sentences, the button, the gate's refusal and the way back.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isVerificationGate,
  needsSupport,
  safeReturnPath,
  settled,
  verificationAction,
  verificationDetail,
  verificationLabel,
  verifyHref,
  type VerificationData,
} from "./verification.ts";

const base: VerificationData = {
  status: "not_started", attempts: 0, max_attempts: 3, attempts_left: 3, can_start: true, required: false,
  verified_at: null, updated_at: null, available: true,
};

test("every status has a label, and unknown ones read as not verified", () => {
  assert.equal(verificationLabel("verified"), "Verified");
  assert.equal(verificationLabel("in_progress"), "In progress");
  assert.equal(verificationLabel("in_review"), "In review");
  assert.equal(verificationLabel("declined"), "Not verified");
  assert.equal(verificationLabel("expired"), "Expired");
  assert.equal(verificationLabel("not_started"), "Not verified");
  assert.equal(verificationLabel(null), "Not verified");
  assert.equal(verificationLabel("something_new"), "Not verified");
});

test("the button follows the status and the tries left", () => {
  assert.equal(verificationAction(base), "Verify ID");
  assert.equal(verificationAction({ ...base, status: "in_progress", attempts: 1, attempts_left: 2 }), "Start again");
  assert.equal(verificationAction({ ...base, status: "declined", attempts: 1, attempts_left: 2 }), "Try again");
  assert.equal(verificationAction({ ...base, status: "expired", attempts: 1, attempts_left: 2 }), "Try again");
  assert.equal(verificationAction({ ...base, status: "verified", can_start: false }), null);
  assert.equal(verificationAction({ ...base, status: "in_review", can_start: false }), null);
  assert.equal(verificationAction({ ...base, available: false }), null, "no button while checks aren't available");
  assert.equal(verificationAction({ ...base, status: "declined", attempts: 3, attempts_left: 0, can_start: false }), null);
});

test("out of tries points to support", () => {
  assert.equal(needsSupport({ status: "declined", can_start: false }), true);
  assert.equal(needsSupport({ status: "verified", can_start: false }), false);
  assert.equal(needsSupport({ status: "in_review", can_start: false }), false);
  assert.match(verificationDetail({ status: "declined", attempts_left: 0 }), /Contact support to verify\./);
  assert.match(verificationDetail({ status: "declined", attempts_left: 1 }), /1 try left/);
  assert.match(verificationDetail({ status: "declined", attempts_left: 2 }), /2 tries left/);
  assert.match(verificationDetail(base, false), /isn't available yet/);
});

test("the Checking page waits only while the check is in progress", () => {
  assert.equal(settled("in_progress"), false);
  assert.equal(settled("not_started"), false);
  for (const s of ["verified", "declined", "in_review", "expired"]) assert.equal(settled(s), true, s);
});

test("the gate's refusal is recognized by its code or its shown words", () => {
  assert.equal(isVerificationGate({ code: "DZ-E6001", message: "x" }), true);
  assert.equal(isVerificationGate("Verify your ID once to continue. (DZ-E6001)"), true);
  assert.equal(isVerificationGate("DZ-E6001: Verify your ID once to continue."), true);
  assert.equal(isVerificationGate("You can't message this user. (DZ-E3005)"), false);
  assert.equal(isVerificationGate({ code: "DZ-E1010" }), false);
  assert.equal(isVerificationGate(null), false);
});

test("the way back stays on the site", () => {
  assert.equal(verifyHref("/listing/abc?resume=message"), "/app/settings/verification?next=%2Flisting%2Fabc%3Fresume%3Dmessage");
  assert.equal(verifyHref("https://evil.example/"), "/app/settings/verification");
  assert.equal(verifyHref("//evil.example/"), "/app/settings/verification");
  assert.equal(verifyHref(null), "/app/settings/verification");
  assert.equal(safeReturnPath("/%2fevil"), null);
  assert.equal(safeReturnPath("/app/messages/1"), "/app/messages/1");
});
