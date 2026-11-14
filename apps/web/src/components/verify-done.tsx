"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase/client";
import { workflow } from "@/lib/workflows";
import {
  safeReturnPath,
  settled,
  verificationDetail,
  VERIFY_NEXT_KEY,
  VERIFY_PATH,
  type VerificationData,
} from "@/lib/verification";
import { VerifiedBadge } from "./verified-badge";

/** How long the page waits before saying the result is still on its way. */
const WAIT_MS = 3 * 60 * 1000;
const POLL_MS = 3000;

/**
 * C6: "Checking..." until the check has an outcome: live through Realtime (the person's own row,
 * status only), with a read every 3 seconds as the fallback. Once verified it continues to the page
 * whose action was refused (kept in sessionStorage before leaving for the provider's pages).
 */
export function VerifyDone({ me, initial }: { me: string; initial: VerificationData | null }) {
  const [data, setData] = useState<VerificationData | null>(initial);
  const [waitedTooLong, setWaitedTooLong] = useState(false);
  const [next, setNext] = useState<string | null>(null);
  const done = settled(data?.status);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        setNext(safeReturnPath(sessionStorage.getItem(VERIFY_NEXT_KEY)));
      } catch {}
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (done || waitedTooLong) return;
    let disposed = false;
    const client = browserClient();
    const refresh = async () => {
      try {
        const latest = await workflow<VerificationData>("verification");
        if (!disposed) setData(latest);
      } catch {
        /* The next read tries again. */
      }
    };
    const channel = client
      .channel("web-verify-" + me)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "identity_verifications", filter: "user_id=eq." + me },
        () => void refresh(),
      )
      .subscribe();
    const poll = setInterval(refresh, POLL_MS);
    const wait = setTimeout(() => setWaitedTooLong(true), WAIT_MS);
    return () => {
      disposed = true;
      clearInterval(poll);
      clearTimeout(wait);
      void client.removeChannel(channel);
    };
  }, [done, waitedTooLong, me]);

  // Verified: continue to the refused action's page.
  useEffect(() => {
    if (data?.status !== "verified" || !next) return;
    const timer = setTimeout(() => {
      try {
        sessionStorage.removeItem(VERIFY_NEXT_KEY);
      } catch {}
      window.location.assign(next);
    }, 1500);
    return () => clearTimeout(timer);
  }, [data?.status, next]);

  const continueTo = next ?? VERIFY_PATH;
  return (
    <div className="page-width workflow-page verify-done" aria-live="polite">
      {!data ? (
        <>
          <h1>Your ID check</h1>
          <p className="muted">This page couldn&apos;t load your check. Settings shows the result.</p>
          <Link className="button" href={VERIFY_PATH}>
            Open ID verification
          </Link>
        </>
      ) : !done ? (
        <>
          <h1>{waitedTooLong ? "Still checking" : "Checking…"}</h1>
          <p className="muted">
            {waitedTooLong
              ? "The result hasn't arrived yet. You can leave this page: ID verification in Settings shows it as soon as it's in."
              : "Waiting for the result from the verification provider. This usually takes under a minute."}
          </p>
          {waitedTooLong && (
            <Link className="button secondary" href={VERIFY_PATH}>
              Open ID verification
            </Link>
          )}
        </>
      ) : data.status === "verified" ? (
        <>
          <h1>
            You&apos;re verified <VerifiedBadge verified />
          </h1>
          <p className="muted">{verificationDetail(data)}</p>
          <Link className="button" href={continueTo}>
            Continue
          </Link>
        </>
      ) : (
        <>
          <h1>{data.status === "in_review" ? "Your ID is being checked" : "Not verified"}</h1>
          <p className="muted">{verificationDetail(data)}</p>
          <Link className="button" href={VERIFY_PATH}>
            Back to ID verification
          </Link>
        </>
      )}
    </div>
  );
}
