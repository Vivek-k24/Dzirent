"use client";
import Link from "next/link";
import { useState } from "react";
import { workflow } from "@/lib/workflows";
import {
  needsSupport,
  verificationAction,
  verificationDetail,
  verificationLabel,
  VERIFY_NEXT_KEY,
  type VerificationData,
} from "@/lib/verification";
import { WorkflowModal, Notice } from "./workflow-ui";
import { VerifiedBadge } from "./verified-badge";

/**
 * C6: Settings > Verification. The status and, whenever checks are available, "Verify ID". First a
 * short note of what Dzirent keeps and never keeps; the verification provider then shows its own
 * consent screen (what it collects, why, and its deletion period), so Dzirent asks for no second
 * consent. The provider's pages bring the person back to /verify/done.
 */
export function Verification({ initial, next }: { initial: VerificationData; next: string | null }) {
  const [data, setData] = useState(initial);
  const [explainer, setExplainer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const action = verificationAction(data);

  async function start() {
    setBusy(true);
    setError("");
    try {
      try {
        if (next) sessionStorage.setItem(VERIFY_NEXT_KEY, next);
        else sessionStorage.removeItem(VERIFY_NEXT_KEY);
      } catch {}
      const { url } = await workflow<{ url: string }>("verification/start", {});
      // The provider's own pages (a full page load), then back to /verify/done.
      window.location.assign(url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
      setExplainer(false);
      try {
        setData(await workflow<VerificationData>("verification"));
      } catch {}
    }
  }

  return (
    <div className="account-section">
      <h2>ID verification</h2>
      <div className="verification-status">
        <strong>{verificationLabel(data.status)}</strong>
        <VerifiedBadge verified={data.status === "verified"} />
      </div>
      <p className="muted">{verificationDetail(data, data.available)}</p>
      {data.required && data.status !== "verified" && (
        <p className="policy-note">Dzirent asks for a one-time ID check before you message someone or publish a listing.</p>
      )}
      {action && (
        <button type="button" className="button" disabled={busy} onClick={() => setExplainer(true)}>
          {action}
        </button>
      )}
      {data.available && needsSupport(data) && (
        <p>
          <Link className="text-link accent" href="/support">
            Contact support
          </Link>{" "}
          to verify.
        </p>
      )}
      <Notice message={error} error />
      <p className="muted" style={{ fontSize: "12px" }}>
        <Link className="text-link" href="/privacy#id-verification">
          How Dzirent handles ID checks
        </Link>
      </p>
      {explainer && (
        <WorkflowModal title="Before you verify" busy={busy} onClose={() => setExplainer(false)}>
          <p>
            It takes a few minutes: a photo of your ID and a short selfie, on the verification provider&apos;s own pages.
          </p>
          <div className="verification-keeps">
            <div>
              <strong>Dzirent keeps</strong>
              <ul>
                <li>The result, and a Verified badge others see</li>
                <li>Your legal name from the ID, kept private</li>
                <li>Whether you&apos;re 18 or older</li>
              </ul>
            </div>
            <div>
              <strong>Dzirent never keeps</strong>
              <ul>
                <li>Photos of your ID</li>
                <li>Your selfie</li>
                <li>Your birthdate</li>
                <li>Your document details</li>
              </ul>
            </div>
          </div>
          <p className="muted">
            Next, the verification provider shows its own consent screen: what it collects, why, and when it deletes it.
          </p>
          <div className="button-row">
            <button type="button" className="button" disabled={busy} onClick={() => void start()}>
              {busy ? "Opening..." : "Continue"}
            </button>
            <button type="button" className="button secondary" disabled={busy} onClick={() => setExplainer(false)}>
              Cancel
            </button>
          </div>
        </WorkflowModal>
      )}
    </div>
  );
}
