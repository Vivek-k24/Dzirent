// apps/web/src/app/delete-account/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout, LegalPlaceholder } from "@/components/legal-layout";
import { LEGAL_CONFIG } from "@/content/legal/config";

export const metadata: Metadata = {
  title: "Delete Your Account — Dzirent",
  description:
    "How to delete your Dzirent account, what data is permanently erased, and what minimal records are retained.",
};

const TOC = [
  { id: "overview", label: "1. Account Deletion Overview" },
  { id: "how-to-delete", label: "2. How to Request Deletion" },
  { id: "prerequisites", label: "3. Active Rental Prerequisites" },
  { id: "what-is-deleted", label: "4. What Data Is Permanently Deleted" },
  { id: "what-is-retained", label: "5. What Records May Be Retained" },
  { id: "cascade-warning", label: "6. Impact on Shared Chats & Records" },
  { id: "support-assistance", label: "7. Help If You Cannot Sign In" },
];

export default function DeleteAccountPage() {
  return (
    <LegalLayout
      title="Delete Your Account"
      subtitle="Complete instructions on permanently deleting your Dzirent account and personal data across our mobile apps and website."
      version="1.0.0"
      effectiveDate="November 6, 2026"
      lastUpdated="November 6, 2026"
      toc={TOC}
    >
      <section id="overview">
        <h2>1. Account Deletion Overview</h2>
        <p>
          You have full control over your personal data. You can delete your Dzirent account at any
          time, directly from our mobile apps or website, without needing to speak with a customer
          service representative.
        </p>
        <p>
          This public page complies with Google Play and Apple App Store account deletion requirements
          and explains exactly what happens when you delete your account.
        </p>
      </section>

      <section id="how-to-delete">
        <h2>2. How to Request Deletion</h2>
        <p>You can delete your account using any of the following methods:</p>

        <div className="legal-card-grid">
          <div className="legal-card">
            <h4>On Android or iOS App</h4>
            <ol style={{ paddingLeft: "20px", margin: "8px 0" }}>
              <li>Open the Dzirent app and tap <strong>Profile</strong>.</li>
              <li>Go to <strong>Settings</strong> &gt; <strong>Account</strong>.</li>
              <li>Tap <strong>Delete account</strong>.</li>
              <li>Confirm your decision when prompted.</li>
            </ol>
          </div>
          <div className="legal-card">
            <h4>On the Dzirent Website</h4>
            <ol style={{ paddingLeft: "20px", margin: "8px 0" }}>
              <li>Sign in at <strong>dzirent.com</strong>.</li>
              <li>Click your profile avatar &gt; <strong>Profile &amp; Settings</strong>.</li>
              <li>Scroll to the <strong>Danger Zone</strong> section.</li>
              <li>Click <strong>Delete account</strong> and confirm.</li>
            </ol>
          </div>
        </div>

        <div className="legal-callout note" style={{ marginTop: "16px" }}>
          <div className="callout-title">It Happens Right Away</div>
          <p>
            When you confirm deletion in the app or on the website, your account and its data are
            deleted immediately. You are signed out and your public profile disappears.
          </p>
        </div>
      </section>

      <section id="prerequisites">
        <h2>3. Active Rental Prerequisites</h2>
        <div className="legal-callout warning">
          <div className="callout-title">Ongoing Rentals Must Be Concluded</div>
          <p>
            If you have an active rental in progress—either as a lender who has an item out on loan, or
            as a borrower who has not yet returned a piece—your account <strong>cannot be deleted</strong>
            until the rental is completed and marked as returned by both parties.
          </p>
          <p style={{ marginTop: "8px" }}>
            This requirement protects both users against abandoned rentals and ensures accountability
            for borrowed pieces.
          </p>
        </div>
      </section>

      <section id="what-is-deleted">
        <h2>4. What Data Is Permanently Deleted</h2>
        <p>When you confirm account deletion, the following is permanently deleted:</p>
        <ul>
          <li>
            <strong>Sign-in details:</strong> Your email address and your password (which we only
            ever hold in a scrambled form that can&apos;t be read back).
          </li>
          <li>
            <strong>Profile:</strong> Your display name, studio name and handle, bio, pickup area,
            city, and approximate location.
          </li>
          <li>
            <strong>Listings &amp; photos:</strong> Every piece in your closet, with its photos,
            garment measurements, dates, and photo-check results. A deleted photo may stay reachable
            at its old link for a short time afterwards (how long:{" "}
            <LegalPlaceholder
              name="DATA_RETENTION"
              label="how long a deleted photo can stay reachable"
            />
            ).
          </li>
          <li>
            <strong>Private measurements:</strong> Your body measurements, fit preference, and style
            interests.
          </li>
          <li>
            <strong>Saved pieces and studios</strong>, your notification registration and settings,
            your record of agreeing to the terms, and any warnings on your account.
          </li>
          <li>
            <strong>Messages and rental records</strong>, for both you and the other person (see
            section 6).
          </li>
        </ul>
      </section>

      <section id="what-is-retained">
        <h2>5. What Records May Be Retained</h2>
        <p>
          A few records stay after deletion:
        </p>
        <ul>
          <li>
            <strong>Accessory declarations:</strong> If you signed an accessory declaration before
            listing accessories, that record (your legal name, email, city, IP address, and the time)
            is kept to deter counterfeits and for legal purposes, no longer linked to an account, for{" "}
            <LegalPlaceholder
              name="DATA_RETENTION"
              label="declaration retention period"
            />
            .
          </li>
          <li>
            <strong>Reports:</strong> Reports you made, and reports about you, are kept with the copy
            of what was reported for{" "}
            <LegalPlaceholder
              name="DATA_RETENTION"
              label="report retention period (currently 2 years, pending attorney review)"
            />{" "}
            after they are closed. Your name is removed from them. Only Dzirent staff can see them.
          </li>
          <li>
            <strong>Server logs:</strong> Access logs (which record IP addresses and what was
            requested) are kept for security and troubleshooting for a limited period{" "}
            <LegalPlaceholder
              name="DATA_RETENTION"
              label="server log retention period"
            />
            , then expire automatically.
          </li>
        </ul>
        <p>
          Retention statement:{" "}
          <LegalPlaceholder
            name="WHAT_STAYS_AFTER_DELETION"
            label="post-deletion record retention details"
          />
        </p>
      </section>

      <section id="cascade-warning">
        <h2>6. Impact on Shared Chats & Records</h2>
        <div className="legal-callout danger">
          <div className="callout-title">Important Notice on Shared Conversations</div>
          <p>
            Deleting your account also deletes your chats and rental records, because they belong to
            two people and we don&apos;t keep half a conversation.
          </p>
          <p style={{ marginTop: "8px" }}>
            This means that past conversation threads with you will also disappear from the message
            inbox of other users you spoke with. If you need a personal record of past communications or
            rental agreements, please save or screenshot them before initiating account deletion.
          </p>
        </div>
      </section>

      <section id="support-assistance">
        <h2>7. Help If You Cannot Sign In</h2>
        <p>
          If you are unable to sign in to your Dzirent account (for example, if you lost access to your
          email or two-factor device), you can request manual deletion by contacting our support team:
        </p>
        <div className="legal-card" style={{ maxWidth: "560px", marginTop: "12px" }}>
          <h4>Manual Deletion Request</h4>
          <p style={{ margin: "8px 0" }}>
            Email us from the address associated with your account:
          </p>
          <p style={{ fontWeight: 600 }}>
            <a href={`mailto:${LEGAL_CONFIG.SUPPORT_EMAIL}`}>
              {LEGAL_CONFIG.SUPPORT_EMAIL}
            </a>
          </p>
          <p style={{ fontSize: "0.88rem", color: "var(--text-muted)", margin: 0 }}>
            Subject: &quot;Manual Account Deletion Request&quot;. We may request verification of account
            ownership before completing the deletion. Requests are processed within{" "}
            <LegalPlaceholder
              name="SUPPORT_RESPONSE_TIME"
              label="privacy request turnaround time"
            />
            .
          </p>
        </div>
        <p style={{ marginTop: "20px" }}>
          For further details on how we handle personal information, please review our{" "}
          <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </section>
    </LegalLayout>
  );
}
