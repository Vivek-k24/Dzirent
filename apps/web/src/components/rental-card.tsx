"use client";
// C3: the rental card in a chat, and the "Request to rent" form. Same rules as the apps
// (lib/rentals.ts mirrors mobile/shared/.../util/Rentals.kt); the database decides.
import { useState } from "react";
import { compressPhoto } from "@/lib/drafts";
import { describeError, errorText, shown } from "@/lib/errors";
import {
  actionLabels,
  claimAmountProblem,
  claimLine,
  claimPhotosProblem,
  claimReasonProblem,
  conditionPhotoStage,
  depositLine,
  MIN_CONDITION_PHOTOS,
  money,
  payLabel,
  paymentFacts,
  rentalActions,
  rentalDatesProblem,
  rentalEventLabel,
  rentalReceipt,
  rentalStatusLabel,
  requestTotal,
  type Range,
  type RentalAction,
  type RentalSettings,
  type RentalView,
} from "@/lib/rentals";
import { dateRange, isoToday } from "@/lib/workflows";
import { price } from "@/lib/types";

export function rentalSummary(r: RentalView): string {
  const dates = r.start_date ? dateRange(r.start_date, r.end_date) : "";
  const money =
    r.days != null && r.total != null
      ? (r.days === 1 ? "1 day" : r.days + " days") + " · " + price(r.total)
      : "";
  return [dates, money].filter(Boolean).join(" · ");
}

/** "Nov 15, 3:00 PM" in the visitor's time zone. */
function when(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * C5: the payment lines under the summary (the apps' rentalPaymentLines): the payment deadline,
 * the lender's set-up notice (DZ-W4001), the deposit, the claim window's end, the claim, a refund.
 */
export function rentalPaymentLines(r: RentalView, now = Date.now()): string[] {
  const lines: string[] = [];
  const lender = r.your_role === "lender";
  if (r.status === "requested" && r.payments_enabled && lender && !r.lender_can_take_payment) lines.push(errorText(shown("DZ-W4001")));
  if (r.status === "awaiting_payment" && r.payments_enabled) {
    const due = when(r.payment_due_at);
    lines.push(
      lender
        ? `The renter has ${due ? "until " + due : "a limited time"} to pay. Unpaid, it's cancelled automatically.`
        : `${payLabel(r.total)}${due ? " by " + due : ""} to keep these dates. Unpaid, it's cancelled automatically.`,
    );
    if (!lender && !r.lender_can_take_payment) lines.push("The lender is still setting up payouts. You can pay once they're ready.");
  }
  if ((r.payment_status ?? "none") !== "none" || (r.deposit_status ?? "none") !== "none" || r.payments_enabled) {
    const d = depositLine(r.deposit_amount, r.deposit_status, r.deposit_captured_amount);
    if (d) lines.push(d);
  }
  if (r.status === "returned" && r.claim_window_ends_at && Date.parse(r.claim_window_ends_at) > now) {
    lines.push(
      (lender ? "You can file a claim against the deposit until " : "The lender can file a claim against the deposit until ") +
        when(r.claim_window_ends_at) + ". Without one the hold is released.",
    );
  }
  const c = claimLine(r.claim?.status, r.claim?.amount, r.claim?.decision_amount, lender);
  if (c) lines.push(c);
  if ((r.refund_amount ?? 0) > 0) lines.push("Refunded " + money(r.refund_amount!));
  return lines;
}

export function RentalCard({
  rental,
  links,
  busy,
  conversationId,
  onStep,
  onCancel,
  onUploaded,
  settings,
}: {
  rental: RentalView;
  links: Record<string, string>;
  busy: boolean;
  conversationId: string;
  onStep: (path: string, body: object) => Promise<boolean>;
  onCancel: () => void;
  onUploaded: () => Promise<void>;
  /** C5: the server's rules (request answer time). */
  settings?: RentalSettings | null;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [allSteps, setAllSteps] = useState(false);
  // C5: the claim form, the claim answer and the receipt open inside the card.
  const [panel, setPanel] = useState<"claim" | "accept_claim" | "dispute_claim" | "receipt" | null>(null);
  const [claimAmount, setClaimAmount] = useState("");
  const [claimReason, setClaimReason] = useState("");
  const [claimPhotos, setClaimPhotos] = useState<string[] | null>(null);
  const [answerNote, setAnswerNote] = useState("");
  const [holdNotice, setHoldNotice] = useState("");
  const lender = rental.your_role === "lender";
  const other = rental.other_name || "the other person";
  const stage = conditionPhotoStage(rental.status);
  const events = rental.events || [];
  const photos = rental.photos || [];
  const minePerStage = (s: string) => photos.filter((p) => p.stage === s && p.by === "you").length;
  const returnPhotos = photos.filter((p) => p.stage === "return");

  async function upload(files: FileList | null) {
    if (!files?.length || !stage) return;
    setUploading(true);
    setUploadError("");
    try {
      for (const file of Array.from(files).slice(0, 6)) {
        const blob = await compressPhoto(file);
        const body = new FormData();
        body.set("photo", blob, "photo.jpg");
        body.set("rentalId", rental.id);
        body.set("stage", stage);
        const response = await fetch("/api/workflows/chat/" + conversationId + "/rental-photo", { method: "POST", body });
        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          throw new Error(result.error || errorText(shown("DZ-E9999")));
        }
      }
      await onUploaded();
    } catch (e) {
      setUploadError((e as Error).message || errorText(describeError(e)));
    } finally {
      setUploading(false);
    }
  }

  function run(action: RentalAction) {
    const body = { rentalId: rental.id };
    switch (action) {
      case "accept":
        return void onStep("rental_respond", { ...body, answer: "accept" });
      case "decline":
        return void onStep("rental_respond", { ...body, answer: "decline" });
      case "cancel":
        return onCancel();
      case "picked_up":
        return void onStep("rental_pickup", body);
      case "returned":
        return void onStep("rental_return", body);
      case "complete":
        return void onStep("rental_complete", body);
      case "place_hold":
        setHoldNotice("");
        return void onStep("rental_hold", body).then(async (ok) => {
          if (!ok) return;
          // Still being confirmed when the card hasn't moved to picked up yet.
          setHoldNotice("If the card still shows Paid, the hold is being confirmed: try again in a moment.");
        });
      case "file_claim":
        setClaimAmount("");
        setClaimReason("");
        setClaimPhotos(returnPhotos.map((p) => p.storage_path));
        return setPanel("claim");
      case "accept_claim":
      case "dispute_claim":
        setAnswerNote("");
        return setPanel(action);
      case "receipt":
        return setPanel(panel === "receipt" ? null : "receipt");
      default:
        return;
    }
  }

  const chosenPhotos = claimPhotos ?? returnPhotos.map((p) => p.storage_path);
  const amountProblem = claimAmount.trim() ? claimAmountProblem(claimAmount, rental.deposit_amount) : null;
  const claimProblem =
    claimAmountProblem(claimAmount, rental.deposit_amount) || claimReasonProblem(claimReason) || claimPhotosProblem(chosenPhotos.length);
  const shownSteps = allSteps ? events : events.slice(-3);
  const actions = rentalActions(rental.status, lender, paymentFacts(rental));
  const paymentLines = rentalPaymentLines(rental);
  return (
    <section className="rental-card" aria-label="Rental">
      <h2>{rentalStatusLabel(rental.status, lender, settings?.rental_request_hours)}</h2>
      <p>{rentalSummary(rental)}</p>
      {paymentLines.map((line) => (
        <p key={line} className="rental-payment-line">
          {line}
        </p>
      ))}
      {(["pickup", "return"] as const).map((s) => {
        const list = photos.filter((p) => p.stage === s);
        if (!list.length) return null;
        return (
          <div key={s} className="rental-photos">
            <strong>{s === "pickup" ? "At pickup" : "At return"} ({list.length})</strong>
            <div className="rental-photo-row">
              {list.map((p) =>
                links[p.storage_path] ? (
                  <a key={p.storage_path} href={links[p.storage_path]} target="_blank" rel="noreferrer">
                    {/* Signed, short-lived links to private photos: a plain img is enough here. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={links[p.storage_path]}
                      alt={(s === "pickup" ? "At pickup" : "At return") + ", by " + (p.by === "you" ? "you" : other)}
                      width={72}
                      height={72}
                    />
                  </a>
                ) : null,
              )}
            </div>
          </div>
        );
      })}
      {stage && lender && minePerStage(stage) < MIN_CONDITION_PHOTOS && (
        <p className="muted">
          Add at least {MIN_CONDITION_PHOTOS} photos of the piece before marking it{" "}
          {stage === "pickup" ? "picked up" : "returned"} ({minePerStage(stage)} so far).
        </p>
      )}
      <ol className="rental-timeline">
        {shownSteps.map((e, i) => (
          <li key={i}>
            {rentalEventLabel(e.to, e.by, other)} ·{" "}
            <time dateTime={e.at}>
              {new Date(e.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </time>
            {e.note ? " · “" + e.note + "”" : ""}
          </li>
        ))}
      </ol>
      {events.length > 3 && (
        <button className="text-button" onClick={() => setAllSteps(!allSteps)}>
          {allSteps ? "Show fewer steps" : "Show all " + events.length + " steps"}
        </button>
      )}
      {actions.length > 0 && (
        <div className="button-row">
          {actions.map((a) =>
            a === "pay" ? (
              // Stripe.js loads only on the pay page, which has its own Content-Security-Policy, so
              // this is a full page load (a plain link), never a client-side navigation.
              <a key={a} href={"/app/pay/" + rental.id} className={"button compact" + (busy ? " disabled" : "")} aria-disabled={busy}>
                {payLabel(rental.total)}
              </a>
            ) : a === "pickup_photos" || a === "return_photos" ? (
              <label key={a} className={"button secondary compact" + (busy || uploading ? " disabled" : "")}>
                {uploading ? "Uploading..." : actionLabels[a]}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="sr-only"
                  disabled={busy || uploading}
                  onChange={(e) => {
                    void upload(e.currentTarget.files);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
            ) : (
              <button
                key={a}
                className={"button compact" + (["decline", "cancel", "dispute_claim", "receipt", "file_claim"].includes(a) ? " secondary" : "")}
                disabled={busy || uploading}
                aria-expanded={a === "receipt" ? panel === "receipt" : undefined}
                onClick={() => run(a)}
              >
                {actionLabels[a]}
              </button>
            ),
          )}
        </div>
      )}
      {holdNotice && <p className="muted" aria-live="polite">{holdNotice}</p>}
      {panel === "claim" && (
        <form
          className="rental-panel"
          aria-label="File a claim"
          onSubmit={(e) => {
            e.preventDefault();
            if (claimProblem) return;
            void onStep("rental_claim", {
              rentalId: rental.id,
              amount: Number(claimAmount.trim().replace(/^\$/, "").replace(/,/g, "")),
              reason: claimReason.trim(),
              photos: chosenPhotos,
            }).then((ok) => ok && setPanel(null));
          }}
        >
          <h3>File a claim</h3>
          <p className="muted">
            Claim up to the deposit ({rental.deposit_amount != null ? money(rental.deposit_amount) : "none"}). The renter can accept or
            dispute it; Dzirent decides a dispute.
          </p>
          <label className="field">
            <span>Amount ($)</span>
            <input inputMode="decimal" value={claimAmount} maxLength={10} onChange={(e) => setClaimAmount(e.target.value)} aria-invalid={!!amountProblem} required />
            {amountProblem && <small className="form-message error">{errorText(shown(amountProblem))}</small>}
          </label>
          <label className="field">
            <span>What&apos;s damaged or missing</span>
            <textarea value={claimReason} maxLength={500} rows={3} onChange={(e) => setClaimReason(e.target.value)} required />
            <small className="muted">{claimReason.trim().length}/500</small>
          </label>
          <fieldset className="field">
            <legend>Return photos as evidence ({chosenPhotos.length} chosen)</legend>
            {!returnPhotos.length && <small className="form-message error">{errorText(shown("DZ-E4043"))}</small>}
            <div className="rental-photo-row">
              {returnPhotos.map((p, i) => (
                <label key={p.storage_path} className="claim-photo">
                  <input
                    type="checkbox"
                    checked={chosenPhotos.includes(p.storage_path)}
                    onChange={(e) =>
                      setClaimPhotos(e.target.checked ? [...chosenPhotos, p.storage_path] : chosenPhotos.filter((x) => x !== p.storage_path))
                    }
                  />
                  {links[p.storage_path] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={links[p.storage_path]} alt={"Return photo " + (i + 1)} width={56} height={56} />
                  ) : (
                    <span>Photo {i + 1}</span>
                  )}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="button-row">
            <button className="button compact" disabled={busy || !!claimProblem}>
              File claim
            </button>
            <button type="button" className="button secondary compact" onClick={() => setPanel(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {(panel === "accept_claim" || panel === "dispute_claim") && rental.claim && (
        <form
          className="rental-panel"
          aria-label={panel === "accept_claim" ? "Accept the claim" : "Dispute the claim"}
          onSubmit={(e) => {
            e.preventDefault();
            void onStep("rental_claim_answer", {
              rentalId: rental.id,
              claimId: rental.claim!.id,
              answer: panel === "accept_claim" ? "accept" : "dispute",
              note: answerNote.trim(),
            }).then((ok) => ok && setPanel(null));
          }}
        >
          <h3>{panel === "accept_claim" ? "Accept the claim?" : "Dispute the claim?"}</h3>
          <p>
            {panel === "accept_claim"
              ? money(rental.claim.amount) + " is charged from your deposit and the rest of the hold is released."
              : "Dzirent looks at both sides, the photos and the timeline, and decides. You both see the outcome."}
          </p>
          <label className="field">
            <span>Note (optional)</span>
            <textarea value={answerNote} maxLength={300} rows={2} onChange={(e) => setAnswerNote(e.target.value)} />
          </label>
          <div className="button-row">
            <button className="button compact" disabled={busy}>
              {panel === "accept_claim" ? "Accept" : "Dispute"}
            </button>
            <button type="button" className="button secondary compact" onClick={() => setPanel(null)}>
              Not now
            </button>
          </div>
        </form>
      )}
      {panel === "receipt" && (
        <div className="rental-panel" role="region" aria-label="Receipt">
          <h3>Receipt</h3>
          <p>
            {rental.listing_title || "Rental"} · {rental.start_date ? dateRange(rental.start_date, rental.end_date) : ""}
          </p>
          <table className="receipt">
            <tbody>
              {rentalReceipt(rental).map((line, i, all) => (
                <tr key={line.label} className={i === all.length - 1 ? "total" : undefined}>
                  <th scope="row">{line.label}</th>
                  <td>{line.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(rental.completed_at || rental.cancelled_at) && (
            <p className="muted">
              {rental.completed_at ? "Completed " + when(rental.completed_at) : "Cancelled " + when(rental.cancelled_at)}
            </p>
          )}
          <p className="muted">With {other}. Card details stay with the payment processor.</p>
        </div>
      )}
      {uploadError && (
        <p role="alert" className="form-message error">
          {uploadError}
        </p>
      )}
    </section>
  );
}

/** "Request to rent": dates inside the piece's open windows (any day when it has none), not booked, with the total. */
export function RentalRequestForm({
  rentable,
  initial,
  busy,
  onSubmit,
}: {
  rentable: { price: number | null; availability: Range[]; booked: Range[] };
  initial: Range;
  busy: boolean;
  onSubmit: (range: Range) => void;
}) {
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const today = isoToday();
  // No windows: every day from today is open (no last day).
  const last = rentable.availability.length
    ? rentable.availability.reduce((m, w) => (w.end > m ? w.end : m), today)
    : undefined;
  const range = { start, end };
  const problem = start && end ? rentalDatesProblem(range, rentable.availability, rentable.booked, today) : "DZ-E4005";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!problem) onSubmit(range);
      }}
    >
      <p className="muted">
        Open:{" "}
        {rentable.availability.length
          ? rentable.availability.map((w) => dateRange(w.start, w.end)).join(", ")
          : "any day from today"}
        {rentable.booked.length > 0 && (
          <>
            <br />
            Booked: {rentable.booked.map((b) => dateRange(b.start, b.end)).join(", ")}
          </>
        )}
      </p>
      <div className="form-pair">
        <label className="field">
          <span>From</span>
          <input type="date" name="start" min={today} max={last} value={start} onChange={(e) => setStart(e.target.value)} required disabled={busy} />
        </label>
        <label className="field">
          <span>To</span>
          <input type="date" name="end" min={start || today} max={last} value={end} onChange={(e) => setEnd(e.target.value)} required disabled={busy} />
        </label>
      </div>
      <p aria-live="polite">
        <strong>
          {problem
            ? errorText(shown(problem))
            : rentable.price != null
              ? requestTotal(rentable.price, range)
              : dateRange(start, end)}
        </strong>
      </p>
      <button className="button full" disabled={busy || !!problem}>
        Send request
      </button>
    </form>
  );
}
