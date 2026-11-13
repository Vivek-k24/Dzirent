// C1: npm test (Node's test runner, TypeScript stripped): catalog lookups and fallbacks, read
// retries, and the per-day price lines.
import { test } from "node:test";
import assert from "node:assert/strict";
import { describeError, errorText, fromServer, shown, warningText } from "./errors.ts";
import { delayMs, isRead, retryableStatus } from "./retry.ts";
import { daysAndTotal, perDay } from "./types.ts";

test("a known code shows the catalog words, the hint as field, then the code", () => {
  const e = fromServer("DZ-E1050: anything", "title");
  assert.deepEqual(e, { code: "DZ-E1050", message: "This text includes language that isn't allowed on Dzirent.", field: "title" });
  assert.equal(errorText(e!), "This text includes language that isn't allowed on Dzirent. (DZ-E1050)");
  assert.equal(fromServer("DZ-E3006: Invalid dates")?.field, "dates");
});

test("server-detail codes keep the server's words; unknown codes fall back to them", () => {
  assert.equal(
    fromServer("DZ-E7001: You can download your data once a day. Try again after Nov 12, 2026, 6:51 PM UTC.")?.message,
    "You can download your data once a day. Try again after Nov 12, 2026, 6:51 PM UTC.",
  );
  assert.deepEqual(fromServer("DZ-E4999: A newer rule."), { code: "DZ-E4999", message: "A newer rule.", field: undefined });
});

test("anything without a code is DZ-E9999", () => {
  assert.equal(fromServer("duplicate key value"), null);
  assert.deepEqual(describeError({ message: "duplicate key value" }), shown("DZ-E9999"));
  assert.equal(shown("DZ-E9999").message, "Something went wrong. Please try again.");
  assert.equal(describeError(null).code, "DZ-E9999");
  assert.equal(describeError({ code: "DZ-E9011", message: "x" }).code, "DZ-E9011");
  assert.equal(shown("DZ-E0000").code, "DZ-E9999");
});

test("photo warnings get DZ-W2 codes", () => {
  assert.equal(warningText("Too dark: try daylight"), "Too dark: try daylight (DZ-W2002)");
  assert.equal(warningText("Something new"), "Something new");
});

test("only reads are retried, after 0.5 s then 2 s", () => {
  const base = "https://x.supabase.co";
  assert.equal(isRead("GET", `${base}/rest/v1/listings?select=*`), true);
  assert.equal(isRead("POST", `${base}/rest/v1/rpc/browse_listings`), true);
  assert.equal(isRead("POST", `${base}/rest/v1/rpc/start_conversation`), false);
  assert.equal(isRead("POST", `${base}/rest/v1/messages`), false);
  assert.equal(isRead("PATCH", `${base}/rest/v1/listings`), false);
  assert.equal(isRead("POST", `${base}/functions/v1/export-my-data`), false);
  assert.deepEqual([delayMs(1), delayMs(2)], [500, 2000]);
  assert.equal(retryableStatus(503), true);
  assert.equal(retryableStatus(400), false);
});

test("price per day and the days line", () => {
  assert.equal(perDay(25), "$25/day");
  assert.equal(perDay(12.5), "$12.5/day"); // the website's existing price format
  assert.equal(perDay(null), "Ask for price");
  assert.equal(daysAndTotal(1, 25), "1 day · $25");
  assert.equal(daysAndTotal(5, 62.5), "5 days · $62.5");
  assert.equal(daysAndTotal(null, null), null);
});
