// apps/web/src/app/support/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout, LegalPlaceholder } from "@/components/legal-layout";
import { LEGAL_CONFIG } from "@/content/legal/config";

export const metadata: Metadata = {
  title: "Help & Support — Dzirent",
  description:
    "Get help with your Dzirent account, find answers to common questions, or contact our support and safety teams.",
};

const TOC = [
  { id: "contact-channels", label: "1. Contacting Our Team" },
  { id: "help-directory", label: "2. Help & Policy Directory" },
  { id: "common-questions", label: "3. Common Questions" },
  { id: "reporting-issues", label: "4. Reporting Safety & Security" },
  { id: "accessibility", label: "5. Accessibility Inquiries" },
];

export default function SupportPage() {
  return (
    <LegalLayout
      title="Help & Support"
      subtitle="Find answers, explore our policies, or get in touch with the Dzirent support team."
      version="1.0.0"
      lastUpdated="November 6, 2026"
      toc={TOC}
    >
      <section id="contact-channels">
        <h2>1. Contacting Our Team</h2>
        <p>
          We are here to help you get the most out of Dzirent. Choose the appropriate channel below
          to reach the right team:
        </p>

        <div className="legal-card-grid">
          <div className="legal-card">
            <h4>Customer Support</h4>
            <p>For questions about listings, account settings, or using the app.</p>
            <p style={{ fontWeight: 600, marginTop: "8px" }}>
              <a href={`mailto:${LEGAL_CONFIG.SUPPORT_EMAIL}`}>
                {LEGAL_CONFIG.SUPPORT_EMAIL}
              </a>
            </p>
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: 0 }}>
              Typical response time:{" "}
              <LegalPlaceholder
                name="SUPPORT_RESPONSE_TIME"
                label="support response time"
              />
            </p>
          </div>

          <div className="legal-card">
            <h4>Privacy & Data Rights</h4>
            <p>For data export, deletion assistance, or privacy questions.</p>
            <p style={{ fontWeight: 600, marginTop: "8px" }}>
              <a href={`mailto:${LEGAL_CONFIG.SUPPORT_EMAIL}`}>
                {LEGAL_CONFIG.SUPPORT_EMAIL}
              </a>
            </p>
          </div>

          <div className="legal-card">
            <h4>Trust, Safety & Abuse</h4>
            <p>To report abusive behavior, safety concerns, or fraud.</p>
            <p style={{ fontWeight: 600, marginTop: "8px" }}>
              <a href={`mailto:${LEGAL_CONFIG.SUPPORT_EMAIL}`}>
                {LEGAL_CONFIG.SUPPORT_EMAIL}
              </a>
            </p>
          </div>

          <div className="legal-card">
            <h4>Security Disclosures</h4>
            <p>For security researchers reporting platform vulnerabilities.</p>
            <p style={{ fontWeight: 600, marginTop: "8px" }}>
              <a href={`mailto:${LEGAL_CONFIG.SUPPORT_EMAIL}`}>
                {LEGAL_CONFIG.SUPPORT_EMAIL}
              </a>
            </p>
          </div>
        </div>
      </section>

      <section id="help-directory">
        <h2>2. Help & Policy Directory</h2>
        <p>Explore our complete documentation, legal terms, and safety policies:</p>

        <div className="legal-card-grid">
          <Link href="/privacy" className="legal-card" style={{ textDecoration: "none" }}>
            <h4 style={{ color: "var(--brand-primary)" }}>Privacy Policy &rarr;</h4>
            <p style={{ color: "var(--text-secondary)", margin: 0 }}>
              How we collect, use, and protect your information, location precision, and rights.
            </p>
          </Link>

          <Link href="/terms" className="legal-card" style={{ textDecoration: "none" }}>
            <h4 style={{ color: "var(--brand-primary)" }}>Terms of Service &rarr;</h4>
            <p style={{ color: "var(--text-secondary)", margin: 0 }}>
              The rules governing marketplace use, eligibility, listings, and peer agreements.
            </p>
          </Link>

          <Link href="/community-guidelines" className="legal-card" style={{ textDecoration: "none" }}>
            <h4 style={{ color: "var(--brand-primary)" }}>Community Guidelines &rarr;</h4>
            <p style={{ color: "var(--text-secondary)", margin: 0 }}>
              Allowed categories, prohibited items, photo standards, and how photo checks work.
            </p>
          </Link>

          <Link href="/safety" className="legal-card" style={{ textDecoration: "none" }}>
            <h4 style={{ color: "var(--brand-primary)" }}>Trust & Safety Guide &rarr;</h4>
            <p style={{ color: "var(--text-secondary)", margin: 0 }}>
              In-person meetup recommendations, joint garment inspection, and security deposits.
            </p>
          </Link>

          <Link href="/copyright" className="legal-card" style={{ textDecoration: "none" }}>
            <h4 style={{ color: "var(--brand-primary)" }}>Copyright & DMCA &rarr;</h4>
            <p style={{ color: "var(--text-secondary)", margin: 0 }}>
              DMCA takedown notice requirements, counter-notices, and designated agent details.
            </p>
          </Link>

          <Link href="/delete-account" className="legal-card" style={{ textDecoration: "none" }}>
            <h4 style={{ color: "var(--brand-primary)" }}>Delete Account &rarr;</h4>
            <p style={{ color: "var(--text-secondary)", margin: 0 }}>
              Step-by-step account deletion guide and explanation of what data is purged.
            </p>
          </Link>

          <Link href="/about" className="legal-card" style={{ textDecoration: "none" }}>
            <h4 style={{ color: "var(--brand-primary)" }}>About Dzirent &rarr;</h4>
            <p style={{ color: "var(--text-secondary)", margin: 0 }}>
              Our story, mission, and why peer-to-peer wardrobe sharing matters.
            </p>
          </Link>
        </div>
      </section>

      <section id="common-questions">
        <h2>3. Common Questions</h2>

        <h3>How do rentals work on Dzirent?</h3>
        <p>
          Dzirent is a peer-to-peer wardrobe discovery platform. Lenders list statement pieces from
          their closet, and borrowers browse local styles. When you find a piece you love, you message
          the lender directly to agree on dates, sizing, and a convenient in-person handoff.
        </p>

        <h3>Does Dzirent charge a booking fee?</h3>
        <p>
          Currently, Dzirent is a peer-to-peer discovery platform that connects members without
          charging transaction commission fees. Lenders and borrowers agree on rental rates and
          arrange payments and deposits directly.
        </p>

        <h3>What should I do if a garment is returned stained or damaged?</h3>
        <p>
          Inspect every item together at both pickup and return. In case of accidental damage or stains,
          lenders and borrowers settle cleaning or repair expenses directly between each other, as
          detailed in our <Link href="/safety">Safety Guide</Link> and <Link href="/terms">Terms of Service</Link>.
        </p>

        <h3>Can I list everyday clothes like T-shirts or workout wear?</h3>
        <p>
          No. Dzirent is specifically dedicated to special occasion wear, professional attire, cultural
          garments, and standout pieces. Standard everyday basics (T-shirts, hoodies, sneakers, casual
          sweatpants) are prohibited. See our{" "}
          <Link href="/community-guidelines">Community Guidelines</Link> for the complete list.
        </p>
      </section>

      <section id="reporting-issues">
        <h2>4. Reporting Safety & Security</h2>
        <p>
          If you encounter any harassing messages, fraudulent listings, or abusive behavior, please
          use the in-app reporting button immediately.
        </p>
        <p>
          In any emergency or immediate threat to physical safety, always contact your local emergency
          services (e.g. 911 in the United States) without delay.
        </p>
      </section>

      <section id="accessibility">
        <h2>5. Accessibility Inquiries</h2>
        <p>
          Dzirent strives to ensure that its website and mobile applications are accessible to all
          individuals, including those with visual, auditory, motor, or cognitive disabilities.
        </p>
        <p>
          If you encounter any accessibility barriers on our platform or have suggestions for
          improvement, please contact us at{" "}
          <LegalPlaceholder
            name="ACCESSIBILITY_CONTACT"
            label="accessibility contact email"
          />
          .
        </p>
      </section>
    </LegalLayout>
  );
}
