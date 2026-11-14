"use client";
// C5: Stripe's own Payment Element (Stripe.js, @stripe/stripe-js pinned in package.json). The card
// is typed into Stripe's frame: this page never sees it. The client secret comes from stripe-pay
// through the workflow route, with the publishable key it belongs to; nothing is stored here.
// The payment_intent.succeeded webhook marks the rental paid; the chat's card updates live.
import { useEffect, useRef, useState } from "react";
import { loadStripe } from "@stripe/stripe-js/pure";
import type { Stripe, StripeElements } from "@stripe/stripe-js";
import { workflow } from "@/lib/workflows";
import { errorText, shown } from "@/lib/errors";
import { money, payLabel, type RentalView } from "@/lib/rentals";
import { rentalSummary } from "./rental-card";

/** "Dec 5 - Dec 8 · 4 days · $220" (rendered here: rental-card is a client module). */
export function PaySummary({ rental }: { rental: RentalView }) {
  return <p>{rentalSummary(rental)}</p>;
}

export function PayForm({
  rentalId,
  total,
  deposit,
  dueAt,
  chatPath,
}: {
  rentalId: string;
  total: number | null;
  deposit: number | null;
  dueAt: string | null;
  chatPath: string;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const [stripe, setStripe] = useState<Stripe | null>(null);
  const [elements, setElements] = useState<StripeElements | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(async () => {
      try {
        // Back from a bank's check (3-D Secure redirect): Stripe adds redirect_status.
        const back = new URLSearchParams(window.location.search).get("redirect_status");
        if (back === "succeeded") {
          if (!cancelled) setDone(true);
          return;
        }
        const start = await workflow<{ clientSecret: string; publishableKey: string }>("pay", { rentalId });
        const s = await loadStripe(start.publishableKey);
        if (!s) throw new Error(errorText(shown("DZ-E4036")));
        if (cancelled) return;
        const els = s.elements({
          clientSecret: start.clientSecret,
          appearance: { theme: "stripe", variables: { colorPrimary: "#8e1538", borderRadius: "8px" } },
        });
        const element = els.create("payment", { layout: "tabs", wallets: { applePay: "never", googlePay: "never" } });
        if (mount.current) element.mount(mount.current);
        setStripe(s);
        setElements(els);
      } catch (e) {
        if (!cancelled) setError((e as Error).message || errorText(shown("DZ-E4036")));
      } finally {
        if (!cancelled) setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [rentalId]);

  if (done)
    return (
      <div className="rental-panel" role="status">
        <h2>Payment sent</h2>
        <p>The rental shows Paid in the chat in a moment. A receipt goes to your email when rental emails are on.</p>
        {/* A full page load: the chat runs under the site's stricter policy again. */}
        <a className="button" href={chatPath}>
          Back to the chat
        </a>
      </div>
    );

  return (
    <form
      className="pay-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!stripe || !elements || paying) return;
        setPaying(true);
        setError("");
        const result = await stripe.confirmPayment({
          elements,
          redirect: "if_required",
          confirmParams: { return_url: window.location.origin + "/app/pay/" + rentalId },
        });
        if (result.error) {
          // Stripe's own words for a declined card or a field it needs; ours otherwise.
          setError(result.error.message || errorText(shown("DZ-E4050")));
          setPaying(false);
          return;
        }
        setDone(true);
      }}
    >
      {dueAt && (
        <p>
          Pay by{" "}
          <time dateTime={dueAt}>
            {new Date(dueAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
          </time>{" "}
          to keep these dates. Unpaid, the rental is cancelled automatically.
        </p>
      )}
      <p className="muted">
        You pay in our payment processor&apos;s own form. Dzirent never sees your card number.{" "}
        {deposit && deposit > 0
          ? `Your card is kept with the processor so the ${money(deposit)} deposit can be held (not charged) at pickup, and so a claim Dzirent decides can be charged to it, never more than the deposit.`
          : "Your card is kept with the processor for this rental, for example if a refund is due."}
      </p>
      <div ref={mount} className="payment-element" aria-busy={loading} />
      {loading && <p className="muted">Loading the payment form...</p>}
      {error && (
        <p role="alert" className="form-message error">
          {error}
        </p>
      )}
      <button className="button full" disabled={!stripe || !elements || paying || loading}>
        {paying ? "Paying..." : payLabel(total)}
      </button>
    </form>
  );
}
