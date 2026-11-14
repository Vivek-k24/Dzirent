// C6: what the Edge Functions keep from a Didit decision (and what they never keep), the 18+ result,
// the webhook signature and timestamp, and the return address. Run by the website's `npm test`
// (Node, type stripping), like the email template test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { adultFrom, freshTimestamp, summarizeDecision, verifyDiditSignature, verifyReturnUrl } from "./didit.ts";

const decision = {
  session_id: "11111111-2222-4333-8444-555555555555",
  status: "Approved",
  vendor_data: "user-1",
  id_verifications: [{
    status: "Approved", first_name: "Ana", last_name: "Ruiz", full_name: "Ana  Maria Ruiz", date_of_birth: "2000-06-15",
    document_number: "X1234567", address: "1 Main St, Austin, TX", nationality: "USA", portrait_image: "https://img.example/p.jpg",
    warnings: [],
  }],
  liveness_checks: [{ status: "Approved", score: 98, warnings: [{ risk: "POSSIBLE_DUPLICATED_FACE", log_type: "warning" }] }],
  face_matches: [{ status: "Approved", score: 95, warnings: [] }],
  ip_analyses: [{ status: "Approved", ip_address: "203.0.113.9", warnings: [] }],
};

test("a decision keeps only the status, the legal name, an 18+ result, a duplicate flag and a reason", () => {
  const s = summarizeDecision(decision, new Date("2026-11-14T12:00:00Z"));
  assert.deepEqual(s, { status: "Approved", legalName: "Ana Maria Ruiz", isAdult: true, duplicate: true, reason: null });
  const text = JSON.stringify(s);
  for (const kept of ["2000-06-15", "X1234567", "Main St", "USA", "img.example", "203.0.113.9"]) {
    assert.ok(!text.includes(kept), `never kept: ${kept}`);
  }
});

test("the name falls back to first and last name; a decline gives the provider's risk codes", () => {
  const declined = {
    status: "Declined",
    id_verifications: [{ first_name: "Ana", last_name: "Ruiz", date_of_birth: "1990-01-01", warnings: [
      { risk: "LOW_FACE_MATCH_SIMILARITY", log_type: "error" }, { risk: "QR_NOT_DETECTED", log_type: "information" }] }],
  };
  const s = summarizeDecision(declined);
  assert.equal(s.legalName, "Ana Ruiz");
  assert.equal(s.reason, "Declined by the verification provider (LOW_FACE_MATCH_SIMILARITY)");
  assert.equal(s.duplicate, false);
  assert.deepEqual(summarizeDecision({ status: "In Progress" }), { status: "In Progress", legalName: null, isAdult: null, duplicate: false, reason: null });
});

test("18 or older is computed from the birthdate on the day", () => {
  const day = new Date("2026-11-14T12:00:00Z");
  assert.equal(adultFrom("2008-11-14", day), true, "the 18th birthday counts");
  assert.equal(adultFrom("2008-11-15", day), false, "one day short");
  assert.equal(adultFrom("1950-02-28", day), true);
  assert.equal(adultFrom("not a date", day), null);
  assert.equal(adultFrom(null, day), null);
  assert.equal(adultFrom("2030-01-01", day), null, "a future date is no answer");
});

test("the signature is the hex HMAC-SHA256 of the raw body, compared exactly", async () => {
  const body = new TextEncoder().encode('{"event_id":"e","status":"Approved"}');
  const good = createHmac("sha256", "s3cret").update(body).digest("hex");
  assert.equal(await verifyDiditSignature(body, good, "s3cret"), true);
  assert.equal(await verifyDiditSignature(body, good.toUpperCase(), "s3cret"), true, "hex in either case");
  assert.equal(await verifyDiditSignature(body, good, "other"), false, "another secret");
  assert.equal(await verifyDiditSignature(new TextEncoder().encode('{"event_id":"e","status":"Declined"}'), good, "s3cret"), false, "another body");
  assert.equal(await verifyDiditSignature(body, good.slice(0, 63), "s3cret"), false, "not 64 characters");
  assert.equal(await verifyDiditSignature(body, null, "s3cret"), false);
});

test("the body timestamp must be within 5 minutes", () => {
  assert.equal(freshTimestamp(1000, 1300), true);
  assert.equal(freshTimestamp(1000, 1301), false);
  assert.equal(freshTimestamp(1300, 1000), true);
  assert.equal(freshTimestamp("1000", 1000), true);
  assert.equal(freshTimestamp(undefined, 1000), false);
});

test("the return address is the verify page on Dzirent's own sites only", () => {
  assert.equal(verifyReturnUrl("https://dzirent.vercel.app/verify/done"), "https://dzirent.vercel.app/verify/done");
  assert.equal(verifyReturnUrl("https://dzirent.com/verify/done?x=1"), "https://dzirent.com/verify/done");
  assert.equal(verifyReturnUrl("https://evil.example/verify/done"), "https://dzirent.com/verify/done");
  assert.equal(verifyReturnUrl("http://dzirent.com/verify/done"), "https://dzirent.com/verify/done");
  assert.equal(verifyReturnUrl("https://dzirent.com/app/settings"), "https://dzirent.com/verify/done");
  assert.equal(verifyReturnUrl(undefined), "https://dzirent.com/verify/done");
});
