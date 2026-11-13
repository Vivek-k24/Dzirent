"use client";
// C3: the rental card in a chat, and the "Request to rent" form. Same rules as the apps
// (lib/rentals.ts mirrors mobile/shared/.../util/Rentals.kt); the database decides.
import { useState } from "react";
import { compressPhoto } from "@/lib/drafts";
import { describeError, errorText, shown } from "@/lib/errors";
import {
  actionLabels,
  conditionPhotoStage,
  MIN_CONDITION_PHOTOS,
  rentalActions,
  rentalDatesProblem,
  rentalEventLabel,
  rentalStatusLabel,
  requestTotal,
  type Range,
  type RentalAction,
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

export function RentalCard({
  rental,
  links,
  busy,
  conversationId,
  onStep,
  onCancel,
  onUploaded,
}: {
  rental: RentalView;
  links: Record<string, string>;
  busy: boolean;
  conversationId: string;
  onStep: (path: string, body: object) => Promise<boolean>;
  onCancel: () => void;
  onUploaded: () => Promise<void>;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [allSteps, setAllSteps] = useState(false);
  const lender = rental.your_role === "lender";
  const other = rental.other_name || "the other person";
  const stage = conditionPhotoStage(rental.status);
  const events = rental.events || [];
  const photos = rental.photos || [];
  const minePerStage = (s: string) => photos.filter((p) => p.stage === s && p.by === "you").length;

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
      default:
        return;
    }
  }

  const shownSteps = allSteps ? events : events.slice(-3);
  const actions = rentalActions(rental.status, lender);
  return (
    <section className="rental-card" aria-label="Rental">
      <h2>{rentalStatusLabel(rental.status, lender)}</h2>
      <p>{rentalSummary(rental)}</p>
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
            a === "pickup_photos" || a === "return_photos" ? (
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
                className={"button compact" + (a === "decline" || a === "cancel" ? " secondary" : "")}
                disabled={busy || uploading}
                onClick={() => run(a)}
              >
                {actionLabels[a]}
              </button>
            ),
          )}
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

/** "Request to rent": dates inside the piece's open windows, not booked, with the total. */
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
  const last = rentable.availability.reduce((m, w) => (w.end > m ? w.end : m), today);
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
          : "no open dates yet"}
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
