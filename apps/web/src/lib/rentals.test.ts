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
  groupTitles,
  requestTotal,
  rentalDays,
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
  assert.equal(rentalDatesProblem(r("2026-11-14", "2026-11-15"), [], booked, today), "DZ-E4008");
});

test("timeline wording", () => {
  assert.equal(rentalEventLabel("accepted", "you", "Studio Rostova"), "Accepted by you");
  assert.equal(rentalEventLabel("requested", "other", "Jordan"), "Requested by Jordan");
  assert.equal(rentalEventLabel("expired", "dzirent", "Jordan"), "Expired (Dzirent)");
});
