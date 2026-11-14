// C5: node --test --experimental-strip-types (run from apps/web's npm test). Every template renders a
// subject, HTML and text; nothing outside the allowed fields reaches an email (no message text, no
// measurements, no places); values are escaped; amounts and dates are worded as on the screens.
import { test } from "node:test";
import assert from "node:assert/strict";
import { datesLabel, escapeHtml, money, renderEmail, TEMPLATES } from "./email-templates.ts";

const data = {
  role: "renter",
  name: "Jordan",
  other_name: "Studio Rostova",
  listing_title: "Silk saree <b>gold</b>",
  status: "awaiting_payment",
  start_date: "2026-12-05",
  end_date: "2026-12-08",
  days: 4,
  price_per_day: 55,
  total: 220,
  fee_amount: 0,
  tax_amount: 0,
  deposit_amount: 40,
  payments_enabled: true,
  timezone: "America/Chicago",
  payment_due_at: "2026-11-15T21:00:00Z",
  expires_at: "2026-11-16T15:00:00Z",
  chat_path: "/app/messages/1f2e3d4c-5b6a-4978-8a1b-2c3d4e5f6a7b",
  detail: "$30.00 from the deposit",
  kind: "return_overdue",
  // Never shown, whatever the data holds:
  message: "SECRET-MESSAGE-TEXT meet me at 12 Oak St",
  body: "SECRET-MESSAGE-TEXT",
  reason: "SECRET-CLAIM-REASON",
  bust_cm: 91.5,
  waist_cm: 72,
  pickup_area: "SECRET-PLACE Riverside",
  approx_lat: 30.27,
  approx_lng: -97.74,
};

test("every template renders a subject, HTML and text", () => {
  for (const t of TEMPLATES) {
    const r = renderEmail(t, data);
    assert.ok(r, t);
    assert.ok(r.subject.length > 5 && r.subject.length < 120, t + " subject");
    assert.match(r.html, /^<!doctype html>/, t);
    assert.match(r.html, /#8e1538/, t + " uses the Dzirent accent");
    assert.match(r.text, /^Dzirent\n/, t);
  }
  assert.equal(renderEmail("unknown", data), null);
});

test("no message text, claim reason, measurements or places in any email", () => {
  for (const t of TEMPLATES) {
    const r = renderEmail(t, data)!;
    for (const part of [r.subject, r.html, r.text]) {
      assert.doesNotMatch(part, /SECRET/, t);
      assert.doesNotMatch(part, /91\.5|Oak St|Riverside|30\.27|-97\.74/, t);
      assert.doesNotMatch(part, /measurement/i, t);
    }
  }
});

test("values are escaped in HTML", () => {
  const r = renderEmail("rental_request", { ...data, role: "lender" })!;
  assert.doesNotMatch(r.html, /<b>gold<\/b>/);
  assert.match(r.html, /&lt;b&gt;gold&lt;\/b&gt;/);
  assert.equal(escapeHtml(`"a" & 'b'`), "&quot;a&quot; &amp; &#39;b&#39;");
});

test("receipts, deadlines and reminders are worded as on the screens", () => {
  assert.equal(money(220), "$220.00");
  assert.equal(datesLabel("2026-12-05", "2026-12-08"), "Dec 5 - Dec 8");
  const receipt = renderEmail("payment_receipt", data)!;
  assert.match(receipt.text, /\$55\.00 × 4 days: \$220\.00/);
  assert.match(receipt.text, /Paid: \$220\.00/);
  assert.match(receipt.text, /held, not charged/);
  const accepted = renderEmail("request_accepted", data)!;
  assert.match(accepted.text, /Pay \$220\.00 in Dzirent by Nov 15, 3:00 PM/);
  const off = renderEmail("request_accepted", { ...data, status: "accepted", payments_enabled: false })!;
  assert.doesNotMatch(off.text, /Pay /);
  assert.match(renderEmail("return_reminder", data)!.subject, /^Return overdue/);
  assert.match(renderEmail("return_reminder", { ...data, kind: "return_tomorrow" })!.subject, /^Return due tomorrow/);
  assert.match(renderEmail("claim_filed", data)!.text, /\$30\.00 from the deposit/);
  // The chat link only for a path the database wrote.
  assert.match(accepted.text, /https:\/\/dzirent\.com\/app\/messages\/1f2e3d4c-/);
  assert.match(renderEmail("rental_request", { ...data, chat_path: "https://evil.example/x" })!.text, /https:\/\/dzirent\.com\/app\/messages\n/);
});

test("the account-deleted email carries nothing from the account", () => {
  const r = renderEmail("account_deleted", data)!;
  assert.doesNotMatch(r.text, /Jordan|Rostova|saree|\$/);
  assert.doesNotMatch(r.text, /Settings > Notifications/);
});
