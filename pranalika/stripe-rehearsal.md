# Stripe test-mode rehearsal checklist (C5)

The first run of the payment screens against Stripe itself, in **test mode**, before any live key exists. Everything Dzirent does with Stripe has been tested only against stripe-mock and signed test events (`testing.md`, G38). This checklist is what that left unverified, in the order to do it. Run it once with test keys, record the results in the agent's handoff, and only then repeat steps 1-4 of the runbook in `contract.md` section 7 with live keys.

**Who:** an agent with the Supabase CLI and `H:\DziRent\secrets\` (keys never printed, never committed), plus the owner on his own Android phone and a desktop browser. **Where:** the live project with test keys, two test users (a lender and a renter from `test-user.env`) and one sample listing. Keep `payments_enabled` on only for the rehearsal and switch it off at the end.

## 0. Before

- [ ] Test-mode keys (`sk_test_…`, `pk_test_…`) and both webhook endpoints registered in **test mode** (`contract.md` section 7, steps 1-2): account events and Connect `account.updated`. Their signing secrets set as function secrets with the two keys (step 3), from a temporary env file deleted at once.
- [ ] Admin website > Integrations: Payments **configured**. `supabase secrets list` shows the four names; `STRIPE_API_BASE` is **not** set.
- [ ] The lender's test listing has a deposit: switch Flags > `payments_enabled` on, then edit the listing and enter **Deposit $40** (the field appears only while payments are on).
- [ ] Note the time: every step below is in the Stripe dashboard's test-mode logs and in Admin > Payments.

## 1. Payouts (lender, Android and website)

- [ ] Android: Profile > My studio > Payouts shows **Not set up** and **Set up payouts**. Tapping it opens Stripe's onboarding in the browser.
- [ ] Complete Express onboarding with Stripe's test data (test phone, `000-000-0000` SSN, test bank `110000000` / `000123456789`).
- [ ] Back in the app (switch back from the browser): the section refreshes to **Payouts ready**. If it says **Finish setup**, Stripe still needs something: tap it and finish.
- [ ] Website: Settings > My studio shows the same state; the onboarding's return lands on `/app/settings/studio?payouts=return` and shows the refreshed state.
- [ ] Stripe dashboard (test): one connected Express account for the lender, `charges_enabled` and `payouts_enabled` true. Webhook `account.updated` delivered with 200.
- [ ] Before payouts are ready, a second lender's incoming request shows the notice "Set up payouts in My studio first … (DZ-W4001)" above Accept.

## 2. Request, accept, payment deadline

- [ ] Renter requests 3 days. The lender's card shows the answer time from the setting ("answer within 48 hours").
- [ ] Lender accepts: the card says **Accepted: pay to confirm** (renter) / **waiting for the renter's payment** (lender), with the pay-by time 24 hours ahead.
- [ ] Push "… accepted your request" on the renter's phone.

## 3. Pay (Android sheet and website Payment Element)

- [ ] Android: **Pay $X** shows the pay dialog (card kept for the deposit hold and a decided claim; Dzirent never sees the card), then Stripe's sheet.
  - [ ] Card `4242 4242 4242 4242`, any future date, any CVC: the sheet closes, "Payment sent …", and within seconds the card shows **Paid**. Webhook `payment_intent.succeeded` delivered with 200.
  - [ ] Repeat on a second rental with `4000 0025 0000 3155` (3-D Secure): the bank challenge appears inside the sheet; approving it pays.
  - [ ] A decline with `4000 0000 0000 9995`: the sheet shows Stripe's decline message; the rental stays awaiting payment.
- [ ] Website: on a third rental, **Pay** opens `/app/pay/<id>` (a full page load). The Payment Element renders (no CSP error in the browser console), `4242…` pays, the page says "Payment sent", and the chat card shows Paid.
  - [ ] 3-D Secure on the website (`4000 0025 0000 3155`): the challenge opens in Stripe's frame; after approval the page shows "Payment sent".
- [ ] The browser console on `/app/pay/…` has no Content-Security-Policy violation; any other page (the chat) still has the strict policy (no `js.stripe.com` in its CSP header).
- [ ] Stripe dashboard: each payment is a destination charge to the lender's account, `application_fee_amount` absent at 0% (set the fee to 10% in Admin > Settings for one rental to see it), `setup_future_usage` = off_session.
- [ ] A receipt email is **skipped** while `EMAIL_API_KEY` is blank (Admin > Background jobs: Emails "… skipped (not set up)").

## 4. Payment deadline (one rental, left unpaid)

- [ ] Accept a rental and don't pay. In Admin > Settings set **Time to pay after acceptance** to 1 hour first (or wait 24 hours). After the deadline plus up to 10 minutes: the rental is **Cancelled** with the timeline note "Not paid within 1 hour after it was accepted", and both phones get "Rental cancelled · … · Not paid in time". If a PaymentIntent was created, Admin > Payments shows a done `payment_cancel` step. Set the setting back to 24.

## 5. Deposit hold at pickup

- [ ] The lender adds 2 pickup photos, then **Place deposit hold and mark picked up**.
- [ ] First tap: either picked up at once, or "The deposit hold is being confirmed …"; tap again after a few seconds: **Picked up**. The card shows "Deposit $40: held on the renter's card, not charged".
- [ ] Stripe dashboard: a separate PaymentIntent, `capture_method=manual`, off-session on the same card, status `requires_capture`, `capture_before` about 7 days out. Webhook `amount_capturable_updated` delivered.
- [ ] A rental with the hold failing (renter's saved card replaced with `4000 0000 0000 0341` in a fresh rental): "The deposit hold couldn't be placed … (DZ-E4035)".

## 6. Return, claim window, claim, dispute, decision

- [ ] 2 return photos, **Mark returned**: the card shows the claim window's end (48 hours).
- [ ] Lender: **File a claim** for more than the deposit: refused in the form ("… up to the deposit … (DZ-E4041)"). File $30 with a reason and the return photos.
- [ ] Renter: push "… filed a claim", the card shows **Accept the claim** / **Dispute the claim**. Dispute with a note.
- [ ] Admin > Payments: the disputed claim with evidence photos; Decide $20 with a reason.
- [ ] Both phones: "Claim decided · … $20.00 from the deposit". The card shows "Claim decided: $20 from the deposit" and **Completed**.
- [ ] Stripe dashboard: the hold captured for $20.00 (`amount_to_capture` 2000); the remaining $20 released.
- [ ] A second rental with no claim: after the window ends (set **Claim window after return** to 1 hour for the test), the hold is **released** and the rental completes.

## 7. Receipts and refunds

- [ ] **Receipt** on the completed rental: renter "Paid $X", "Charged from the deposit $20.00", total; lender "You receive …". Website and Android agree.
- [ ] A paid rental cancelled by the renter more than 48 hours before the start: refunded in full; `charge.refunded` delivered; the card shows "Refunded $X"; the receipt shows "Refunded -$X".
- [ ] Admin > Payments > Refund on another paid rental (partial): `partially_refunded`.

## 8. Card disputes and webhooks

- [ ] A payment with `4000 0000 0000 0259` (disputed): Admin > Payments lists the card dispute after `charge.dispute.created`.
- [ ] Stripe dashboard > Webhooks: every delivery 200 (a 503 means `payments_enabled` was off or a key was missing; Stripe retries for 3 days).

## 9. After

- [ ] Flags > `payments_enabled` **off**. Settings changed for the test set back (fee 0, claim window 48, payment deadline 24).
- [ ] The test rentals cancelled or completed; the lender's test listing deposit cleared.
- [ ] Record in the handoff: each box above, the Stripe event ids (not keys), and anything that differed from stripe-mock (G38). Then decide with the owner whether to swap to live keys (`contract.md` section 7, steps 1-4 again).

Not covered here: the iPhone payment sheet (Mac session: the Stripe iOS SDK's PaymentSheet behind `rememberPaymentSheetLauncher`; until then iPhone Pay says "Pay on dzirent.com (DZ-E4049)").
