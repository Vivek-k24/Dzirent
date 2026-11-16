// C3: npm test: rental totals, the state-to-actions mapping, grouping and the request dates
// (the same cases as the apps' RentalRulesTest).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  conditionPhotoStage,
  rentalActions,
  rentalDatesProblem,
  rentalEventLabel,
  rentalGroup,
  rentalStatusLabel,
  groupTitles,
  requestTotal,
  rentalDays,
  claimAmountProblem,
  claimLine,
  claimPhotosProblem,
  claimReasonProblem,
  depositLine,
  parseDepositAmount,
  payLabel,
  payoutLabels,
  payoutState,
  rentalReceipt,
} from "./rentals.ts";

const r = (start: string, end: string) => ({ start, end });

test("totals count both ends", () => {
  assert.equal(rentalDays(r("2026-12-30", "2027-01-02")), 4);
  assert.equal(requestTotal(15, r("2026-12-01", "2026-12-05")), "5 days · $75");
  assert.equal(requestTotal(55, r("2026-12-30", "2027-01-02")), "4 days · $220");
  assert.equal(requestTotal(14, r("2026-12-01", "2026-12-01")), "1 day · $14");
});

test("actions per state and role", () => {
  assert.deepEqual(rentalActions("requested", true), ["accept", "decline"]);
  assert.deepEqual(rentalActions("requested", false), ["cancel"]);
  assert.deepEqual(rentalActions("accepted", true), ["pickup_photos", "picked_up", "cancel"]);
  assert.deepEqual(rentalActions("accepted", false), ["pickup_photos", "cancel"]);
  assert.deepEqual(rentalActions("picked_up", true), ["return_photos", "returned"]);
  assert.deepEqual(rentalActions("picked_up", false), ["return_photos"]);
  assert.deepEqual(rentalActions("awaiting_payment", false), ["cancel"]);
  assert.deepEqual(rentalActions("returned", true), ["return_photos", "complete"]);
  for (const ended of ["completed", "cancelled", "declined", "expired"]) {
    assert.deepEqual(rentalActions(ended, true), []);
    assert.deepEqual(rentalActions(ended, false), []);
  }
});

test("photo stages follow the bucket rules", () => {
  assert.equal(conditionPhotoStage("accepted"), "pickup");
  assert.equal(conditionPhotoStage("picked_up"), "return");
  assert.equal(conditionPhotoStage("requested"), null);
  assert.equal(conditionPhotoStage("completed"), null);
});

test("lenders see incoming requests first", () => {
  assert.equal(rentalGroup("requested", true), "requests_for_you");
  assert.equal(rentalGroup("requested", false), "waiting");
  assert.equal(rentalGroup("accepted", false), "upcoming");
  assert.equal(rentalGroup("picked_up", true), "in_progress");
  assert.equal(rentalGroup("expired", true), "past");
  assert.equal(groupTitles[0][0], "requests_for_you");
});

test("request dates follow the database", () => {
  const today = "2026-11-13";
  const windows = [r("2026-11-13", "2026-11-30"), r("2026-12-01", "2026-12-20")];
  const booked = [r("2026-11-20", "2026-11-23")];
  assert.equal(rentalDatesProblem(r("2026-11-24", "2026-11-26"), windows, booked, today), null, "back-to-back");
  assert.equal(rentalDatesProblem(r("2026-11-28", "2026-12-03"), windows, booked, today), null, "adjacent windows join");
  assert.equal(rentalDatesProblem(r("2026-11-23", "2026-11-25"), windows, booked, today), "DZ-E4009");
  assert.equal(rentalDatesProblem(r("2026-12-19", "2026-12-22"), windows, booked, today), "DZ-E4008");
  assert.equal(rentalDatesProblem(r("2026-11-12", "2026-11-14"), windows, booked, today), "DZ-E4006");
});

test("C5: no availability windows means every day from today is open, as the server", () => {
  const today = "2026-11-13";
  const booked = [r("2026-11-20", "2026-11-23")];
  assert.equal(rentalDatesProblem(r("2026-11-14", "2026-11-15"), [], booked, today), null);
  assert.equal(rentalDatesProblem(r("2027-06-01", "2027-06-30"), [], [], today), null, "far ahead too");
  assert.equal(rentalDatesProblem(r("2026-11-13", "2026-11-13"), [], booked, today), null, "today");
  assert.equal(rentalDatesProblem(r("2026-11-12", "2026-11-13"), [], booked, today), "DZ-E4006", "never the past");
  assert.equal(rentalDatesProblem(r("2026-11-19", "2026-11-20"), [], booked, today), "DZ-E4009", "booked days stay closed");
});

test("C5: the request answer time comes from the server", () => {
  assert.equal(rentalStatusLabel("requested", true, 24), "Rental request: answer within 24 hours");
  assert.equal(rentalStatusLabel("expired", false, 72), "Expired: no answer in 72 hours");
  assert.equal(rentalStatusLabel("requested", true, 1), "Rental request: answer within 1 hour");
  assert.doesNotMatch(rentalStatusLabel("requested", true), /\d/, "not loaded: no number, never a hard-coded one");
  assert.doesNotMatch(rentalStatusLabel("expired", true), /\d/);
});

test("C5: every payment state's label and actions for each person", () => {
  const on = { paymentsOn: true, depositAmount: 40 };
  assert.deepEqual(rentalActions("awaiting_payment", false, on), ["pay", "cancel"]);
  assert.deepEqual(rentalActions("awaiting_payment", true, on), ["cancel"]);
  assert.deepEqual(rentalActions("awaiting_payment", false, { ...on, paymentsOn: false }), ["cancel"], "payments off: no Pay");
  assert.equal(rentalStatusLabel("awaiting_payment", false), "Accepted: pay to confirm");
  assert.equal(rentalStatusLabel("awaiting_payment", true), "Accepted: waiting for the renter's payment");
  assert.equal(payLabel(220), "Pay $220");
  assert.equal(payLabel(1250.5), "Pay $1,250.50");
  assert.deepEqual(rentalActions("paid", true, on), ["pickup_photos", "place_hold", "cancel"]);
  assert.deepEqual(rentalActions("paid", false, on), ["pickup_photos", "cancel"]);
  assert.deepEqual(rentalActions("paid", true, { ...on, depositAmount: null }), ["pickup_photos", "picked_up", "cancel"]);
  assert.deepEqual(rentalActions("paid", true, { ...on, depositStatus: "held" }), ["pickup_photos", "picked_up", "cancel"]);
  const held = { ...on, depositStatus: "held", claimWindowOpen: true };
  assert.deepEqual(rentalActions("returned", true, held), ["return_photos", "file_claim", "complete"]);
  assert.deepEqual(rentalActions("returned", true, { ...held, claimWindowOpen: false }), ["return_photos", "complete"]);
  assert.deepEqual(rentalActions("returned", false, held), ["return_photos"]);
  const claimed = { ...held, claimStatus: "open" };
  assert.deepEqual(rentalActions("claimed", false, claimed), ["accept_claim", "dispute_claim"]);
  assert.deepEqual(rentalActions("claimed", true, claimed), []);
  assert.deepEqual(rentalActions("disputed", false, { ...claimed, claimStatus: "disputed" }), []);
  assert.equal(rentalStatusLabel("claimed", false), "Claim filed: accept or dispute it");
  assert.equal(rentalStatusLabel("claimed", true), "Claim filed: waiting for the renter");
  assert.equal(rentalStatusLabel("disputed", true), "In dispute: Dzirent will decide");
  for (const ended of ["completed", "cancelled"]) {
    assert.deepEqual(rentalActions(ended, true, { ...on, paymentStatus: "paid" }), ["receipt"]);
    assert.deepEqual(rentalActions(ended, false, { ...on, paymentStatus: "refunded" }), ["receipt"]);
    assert.deepEqual(rentalActions(ended, false), []);
  }
  assert.equal(depositLine(40, "held", 0), "Deposit $40: held on the renter's card, not charged");
  assert.equal(depositLine(40, "captured", 30), "Deposit $40: $30 charged for the claim");
  assert.equal(depositLine(40, "released", 0), "Deposit $40: released, nothing charged");
  assert.equal(depositLine(null, "none", null), null);
  assert.equal(claimLine("decided", 30, 20, false), "Claim decided: $20 from the deposit");
  assert.equal(claimLine("decided", 30, 0, true), "Claim decided: no charge, the hold is released");
});

test("C5: payments off (now): no payment step anywhere", () => {
  for (const status of ["requested", "accepted", "awaiting_payment", "paid", "picked_up", "returned"]) {
    for (const lender of [true, false]) {
      const actions = rentalActions(status, lender, { paymentsOn: false });
      assert.ok(actions.every((a) => !["pay", "place_hold", "file_claim", "receipt"].includes(a)), status);
    }
  }
});

test("C5: claim amount limits, reason and photos; the listing deposit", () => {
  assert.equal(claimAmountProblem("40", 40), null, "the whole deposit");
  assert.equal(claimAmountProblem("$12.50", 40), null);
  assert.equal(claimAmountProblem("40.01", 40), "DZ-E4041", "above the deposit");
  assert.equal(claimAmountProblem("0", 40), "DZ-E4041");
  assert.equal(claimAmountProblem("-5", 40), "DZ-E4041");
  assert.equal(claimAmountProblem("1.234", 40), "DZ-E4041", "at most cents");
  assert.equal(claimAmountProblem("abc", 40), "DZ-E4041");
  assert.equal(claimAmountProblem("10", null), "DZ-E4041", "no deposit");
  assert.equal(claimReasonProblem("ok"), "DZ-E4042");
  assert.equal(claimReasonProblem("Torn hem"), null);
  assert.equal(claimReasonProblem("x".repeat(501)), "DZ-E4042");
  assert.equal(claimPhotosProblem(0), "DZ-E4043");
  assert.equal(claimPhotosProblem(1), null);
  assert.equal(claimPhotosProblem(11), "DZ-E4043");
  assert.equal(parseDepositAmount(""), null);
  assert.equal(parseDepositAmount("40"), 40);
  assert.equal(parseDepositAmount("100000"), "DZ-E4051");
  assert.equal(parseDepositAmount("0"), "DZ-E4051");
});

test("C5: receipt totals for each side", () => {
  const base = { your_role: "renter" as const, price_per_day: 55, days: 4, total: 220, tax_amount: 0, fee_amount: 0, refund_amount: 0, deposit_amount: 40, deposit_status: "released", deposit_captured_amount: 0 };
  assert.deepEqual(rentalReceipt(base), [
    { label: "$55.00 × 4 days", amount: "$220.00" },
    { label: "Paid", amount: "$220.00" },
    { label: "Total", amount: "$220.00" },
    { label: "Deposit hold $40.00", amount: "released" },
  ]);
  const claimed = rentalReceipt({ ...base, deposit_status: "captured", deposit_captured_amount: 30 });
  assert.deepEqual(claimed[2], { label: "Charged from the deposit", amount: "$30.00" });
  assert.deepEqual(claimed[claimed.length - 1], { label: "Total", amount: "$250.00" });
  const refunded = rentalReceipt({ ...base, price_per_day: 50, days: 2, total: 100, refund_amount: 100, deposit_amount: null, deposit_status: "none" });
  assert.deepEqual(refunded[2], { label: "Refunded", amount: "-$100.00" });
  assert.deepEqual(refunded[refunded.length - 1], { label: "Total", amount: "$0.00" });
  const lender = rentalReceipt({ ...base, your_role: "lender", price_per_day: 50, days: 2, total: 100, fee_amount: 10, refund_amount: 50, deposit_status: "captured", deposit_captured_amount: 20 });
  assert.deepEqual(lender, [
    { label: "$50.00 × 2 days", amount: "$100.00" },
    { label: "Dzirent fee", amount: "-$5.00" },
    { label: "Refunded to the renter", amount: "-$50.00" },
    { label: "From the deposit", amount: "$20.00" },
    { label: "You receive", amount: "$65.00" },
  ]);
});

test("C5: My studio's payout states", () => {
  assert.equal(payoutState(null), "not_set_up");
  assert.equal(payoutState({ charges_enabled: true, payouts_enabled: false }), "finish_setup");
  assert.equal(payoutState({ charges_enabled: true, payouts_enabled: true }), "ready");
  assert.equal(payoutLabels.ready.label, "Payouts ready");
});

test("timeline wording", () => {
  assert.equal(rentalEventLabel("accepted", "you", "Studio Rostova"), "Accepted by you");
  assert.equal(rentalEventLabel("requested", "other", "Jordan"), "Requested by Jordan");
  assert.equal(rentalEventLabel("expired", "dzirent", "Jordan"), "Expired (Dzirent)");
});
