// apps/web/src/app/safety/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout, LegalPlaceholder } from "@/components/legal-layout";
import { LEGAL_CONFIG } from "@/content/legal/config";

export const metadata: Metadata = {
  title: "Trust & Safety Guide",
  description:
    "Practical safety advice, in-person meetup recommendations, security deposits, and reporting tools for Dzirent members.",
};

const TOC = [
  { id: "our-approach", label: "1. Trust & Safety at Dzirent" },
  { id: "in-person-meetups", label: "2. Safe In-Person Meetups" },
  { id: "inspect-together", label: "3. Inspecting Garments Together" },
  { id: "in-app-messaging", label: "4. Keeping Communication in the App" },
  { id: "security-deposits", label: "5. Deposits for High-Value Pieces" },
  { id: "resolving-issues", label: "6. Handling Stains, Damage & Delays" },
  { id: "reporting-blocking", label: "7. How to Report or Block a User" },
  { id: "emergency-support", label: "8. Emergency & Immediate Help" },
];

export default function SafetyPage() {
  return (
    <LegalLayout
      title="Trust & Safety Guide"
      subtitle="How to arrange secure meetups, protect valuable wardrobe pieces, and rent with confidence."
      version="1.0.0"
      effectiveDate="November 6, 2026"
      lastUpdated="November 6, 2026"
      toc={TOC}
    >
      <section id="our-approach">
        <h2>1. Trust & Safety at Dzirent</h2>
        <p>
          Dzirent is built to make sharing exceptional wardrobes easy, sustainable, and neighborly.
          Because rentals are exchanged locally between community members in person, safe habits and
          clear agreements make every experience rewarding.
        </p>
        <p>
          We encourage all lenders and borrowers to read this guide carefully before arranging their
          first rental handoff.
        </p>
      </section>

      <section id="in-person-meetups">
        <h2>2. Safe In-Person Meetups</h2>
        <p>
          When scheduling a pickup or return with another member, always prioritize your personal
          comfort and safety:
        </p>

        <div className="legal-card-grid">
          <div className="legal-card">
            <h3>Meet in Public Places</h3>
            <p>
              Choose a busy, well-lit public location for your handoff—such as a popular local café,
              public library, community center, or shopping galleria.
            </p>
          </div>
          <div className="legal-card">
            <h3>Meet During Daylight Hours</h3>
            <p>
              Arrange handoffs during standard daytime or early evening hours whenever feasible. Avoid
              late-night meetings or isolated parking structures.
            </p>
          </div>
          <div className="legal-card">
            <h3>Bring or Notify a Friend</h3>
            <p>
              Let a family member, roommate, or friend know where you are going, who you are meeting,
              and your estimated return time. If you feel hesitant, invite a friend along.
            </p>
          </div>
          <div className="legal-card">
            <h3>Never Compromise Comfort</h3>
            <p>
              If a meeting location feels uncomfortable, ask to change it to a public venue. If
              anything feels wrong upon arrival, leave immediately.
            </p>
          </div>
        </div>

        <p style={{ marginTop: "16px" }}>
          Additional guidance:{" "}
          <LegalPlaceholder
            name="SAFETY_TIPS"
            label="meetup safety guidelines"
          />
        </p>
      </section>

      <section id="inspect-together">
        <h2>3. Inspecting Garments Together</h2>
        <p>
          Both lenders and borrowers benefit from taking two minutes during the handoff to inspect the
          garment together in good light:
        </p>

        <div className="legal-table-wrapper">
          <table className="legal-table">
            <thead>
              <tr>
                <th>Inspection Area</th>
                <th>What to Check</th>
                <th>Why It Protects Both Sides</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Zippers & Closures</strong></td>
                <td>Test the main zipper pull, hook-and-eye clasps, buttons, and snaps.</td>
                <td>Confirms all hardware functions properly before the rental begins.</td>
              </tr>
              <tr>
                <td><strong>Seams & Hemlines</strong></td>
                <td>Look along armholes, side seams, split hems, and lining edges.</td>
                <td>Distinguishes preexisting loose threads from fresh wear.</td>
              </tr>
              <tr>
                <td><strong>Fabric & Stains</strong></td>
                <td>Inspect collar, underarms, cuffs, and lower skirt for spots or marks.</td>
                <td>Prevents disagreements about when a mark occurred upon return.</td>
              </tr>
              <tr>
                <td><strong>Hanger & Garment Bag</strong></td>
                <td>Note any garment cover, specialty hanger, or accessory bag provided.</td>
                <td>Ensures borrower returns everything that accompanied the piece.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="legal-callout note">
          <div className="callout-title">Pro Tip: Take Quick Reference Photos</div>
          <p>
            Snap a quick photo of the garment on your phone at pickup. This establishes an agreed
            timestamped record of the garment&apos;s condition when handing it over.
          </p>
        </div>
      </section>

      <section id="in-app-messaging">
        <h2>4. Keeping Communication in the App</h2>
        <p>
          Always conduct discussions about rental dates, sizing questions, handoff points, and care
          instructions directly inside the Dzirent messaging feature.
        </p>
        <ul>
          <li>
            <strong>Timestamped record:</strong> In-app messages cannot be tampered with and provide a
            clear history of what both parties agreed upon.
          </li>
          <li>
            <strong>Privacy protection:</strong> Messaging inside Dzirent protects your personal phone
            number, email address, and home details.
          </li>
          <li>
            <strong>Dispute assistance:</strong> If an issue arises, our support team can only review
            communication that occurred within the platform.
          </li>
        </ul>
      </section>

      <section id="security-deposits">
        <h2>5. Deposits for High-Value Pieces</h2>
        <p>
          Dzirent operates as a peer-to-peer discovery venue and does not currently process escrow or
          in-person security deposit funds.
        </p>
        <p>
          <LegalPlaceholder
            name="DEPOSIT_RECOMMENDATION"
            label="deposit policy recommendation"
          />
        </p>

        <h3>Best Practices for Deposits</h3>
        <ul>
          <li>
            <strong>Disclose upfront:</strong> Mention in your listing description and chat if you
            require a deposit, the exact amount, and the accepted method.
          </li>
          <li>
            <strong>Receipt & Return:</strong> Confirm in writing upon pickup that the deposit was
            received, and agree that it will be returned immediately when the garment is returned in
            good condition.
          </li>
        </ul>
      </section>

      <section id="resolving-issues">
        <h2>6. Handling Stains, Damage & Delays</h2>
        <p>
          Even with utmost care, accidents happen. When an issue occurs:
        </p>
        <ul>
          <li>
            <strong>Communicate immediately:</strong> If you are a borrower and spill something or
            tear a seam, notify the lender right away with a clear photo.
          </li>
          <li>
            <strong>Do not DIY complex cleaning:</strong> Delicate silks, embellishments, and dry-clean-only
            fabrics can be ruined by home stain removers. Always consult the owner first.
          </li>
          <li>
            <strong>Direct settlement:</strong> As stated in our <Link href="/terms">Terms of Service</Link>,
            lenders and borrowers settle cleaning fees, repair costs, or replacement expenses directly
            between each other.
          </li>
          <li>
            <strong>Late returns:</strong> If you cannot return on time, ask the lender immediately. Late
            returns inconvenience subsequent bookings and may incur additional daily rental fees agreed
            between both users.
          </li>
        </ul>
      </section>

      <section id="reporting-blocking">
        <h2>7. How to Report or Block a User</h2>
        <p>
          If a member behaves inappropriately, sends offensive messages, or violates community
          guidelines, you can take immediate action in the app:
        </p>

        <h3>To Report a User or Listing</h3>
        <ol>
          <li>Open the listing or message conversation.</li>
          <li>Tap or click the three dots (&hellip;) or the &quot;Report&quot; link.</li>
          <li>Select the reason (e.g., inappropriate content, fake item, offensive behavior).</li>
          <li>Submit any relevant context. Our moderation team reviews all reports.</li>
        </ol>

        <h3>To Block a User</h3>
        <ol>
          <li>Open the conversation with that member.</li>
          <li>Select &quot;Block User&quot;.</li>
          <li>
            Once blocked, the user can no longer send you messages, view your active listings, or
            request rentals.
          </li>
        </ol>
      </section>

      <section id="emergency-support">
        <h2>8. Emergency & Immediate Help</h2>
        <div className="legal-callout danger">
          <div className="callout-title">Emergency Situations</div>
          <p>
            If you ever feel in immediate danger, feel physically threatened, or believe a crime has
            occurred during an in-person exchange, <strong>call local emergency services (911 in the U.S.)
            immediately</strong>.
          </p>
        </div>
        <p style={{ marginTop: "16px" }}>
          For platform safety concerns, security reports, or account issues, contact our support team at{" "}
          <a href={`mailto:${LEGAL_CONFIG.SUPPORT_EMAIL}`}>
            {LEGAL_CONFIG.SUPPORT_EMAIL}
          </a>
          .
        </p>
      </section>
    </LegalLayout>
  );
}
