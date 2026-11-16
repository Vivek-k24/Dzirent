"use client";
// C5: My studio > Payouts (the apps' PayoutsSection). "Set up payouts" opens the payment
// processor's onboarding; coming back (?payouts=return or refresh) asks for the account's state
// again (stripe-account-status). Shown only while payments are on.
import { useEffect, useState } from "react";
import { workflow, type PayoutAccount } from "@/lib/workflows";
import { payoutLabels, payoutState } from "@/lib/rentals";
import { Notice } from "./workflow-ui";

export function Payouts({ initial }: { initial: PayoutAccount | null }) {
  const [account, setAccount] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const back = new URLSearchParams(window.location.search).get("payouts");
    if (back !== "return" && back !== "refresh") return;
    let cancelled = false;
    Promise.resolve().then(async () => {
      setBusy(true);
      try {
        const r = await workflow<{ account: PayoutAccount | null }>("payouts/status", {});
        if (!cancelled) setAccount(r.account ?? null);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setBusy(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const state = payoutState(account);
  return (
    <div className="account-section payouts">
      <h3>Payouts</h3>
      <p>
        <strong aria-live="polite">{busy ? "Checking..." : payoutLabels[state].label}</strong>
      </p>
      <p className="muted">
        {state === "ready"
          ? "Renters can pay you in Dzirent. Payments reach your bank through our payment processor."
          : state === "finish_setup"
            ? "The payment processor needs a few more details before renters can pay you."
            : "Set up payouts before you accept a rental: the renter pays in Dzirent and the money reaches your bank. Your bank and tax details go to our payment processor, never to Dzirent."}
      </p>
      <button
        type="button"
        className="button secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const { url } = await workflow<{ url: string }>("payouts/link", {});
            window.location.assign(url);
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        }}
      >
        {payoutLabels[state].button}
      </button>
      <Notice message={error} error />
    </div>
  );
}
