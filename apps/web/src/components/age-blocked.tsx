"use client";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/app/actions";
import { workflow } from "@/lib/workflows";
import { WorkflowModal, Notice } from "./workflow-ui";

/**
 * The full page for an account the age gate blocked (P2C), the same as the apps' blocked screen.
 * The database refuses everything but reading and deleting, so the only ways on are deleting the
 * account, signing out, or contacting support.
 */
export function AgeBlockedPage() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function deleteAccount() {
    setBusy(true);
    setError("");
    try {
      await workflow("account/delete", { confirm: "DELETE" });
      // Signed out with the account gone: reload the layout as a guest.
      router.push("/");
      router.refresh();
    } catch (e) {
      setError((e as Error).message || "Couldn't delete your account. Please try again.");
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <main id="main" className="age-blocked-page page-width">
      <Image src="/logo-mark.svg" alt="" width={56} height={56} priority />
      <h1>Dzirent is only for people 18 and older.</h1>
      <p>
        Your app store says you&apos;re under 18, so this account can&apos;t list, rent, save or
        message. You can delete the account, or sign out.
      </p>
      <Notice message={error} error />
      <div className="age-blocked-actions">
        <button
          type="button"
          className="button danger"
          disabled={busy}
          onClick={() => setConfirming(true)}
        >
          {busy ? "Just a moment..." : "Delete my account"}
        </button>
        <form action={signOut}>
          <button className="button secondary" disabled={busy}>
            Sign out
          </button>
        </form>
        <Link className="text-button" href="/support">
          Think this is a mistake? Contact support
        </Link>
      </div>
      {confirming && (
        <WorkflowModal title="Delete your account?" busy={busy} onClose={() => setConfirming(false)}>
          <p style={{ margin: "0 0 20px" }}>
            Your profile, listings, photos and chats are deleted for good. This can&apos;t be undone.
          </p>
          <div className="button-row" style={{ justifyContent: "flex-end" }}>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
            <button type="button" className="button danger" disabled={busy} onClick={deleteAccount}>
              {busy ? "Deleting..." : "Delete"}
            </button>
          </div>
        </WorkflowModal>
      )}
    </main>
  );
}
