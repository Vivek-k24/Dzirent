// apps/web/src/app/accessibility/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout } from "@/components/legal-layout";
import { LEGAL_CONFIG } from "@/content/legal/config";

export const metadata: Metadata = {
  title: "Accessibility Statement",
  description:
    "Dzirent's commitment to digital accessibility, conformance with WCAG 2.1 AA standards, known limitations, and how to contact us.",
};

const TOC = [
  { id: "our-commitment", label: "1. Our Commitment" },
  { id: "standards", label: "2. Standards & Technical Specifications" },
  { id: "measures", label: "3. Measures to Support Accessibility" },
  { id: "limitations", label: "4. Known Limitations & Alternatives" },
  { id: "feedback", label: "5. Feedback & Support Contact" },
];

export default function AccessibilityPage() {
  return (
    <LegalLayout
      title="Accessibility Statement"
      subtitle="Dzirent is dedicated to making wardrobe sharing inclusive, dignified, and accessible to everyone."
      version="1.0.0"
      effectiveDate="November 7, 2026"
      lastUpdated="November 7, 2026"
      toc={TOC}
    >
      <section id="our-commitment">
        <h2>1. Our Commitment</h2>
        <p>
          At Dzirent, we believe everyone deserves equal access to exceptional fashion, self-expression,
          and community wardrobe sharing. We are committed to ensuring digital accessibility for people
          with disabilities, continually improving the user experience for everyone, and applying the
          relevant accessibility standards across all of our digital properties.
        </p>
      </section>

      <section id="standards">
        <h2>2. Standards & Technical Specifications</h2>
        <p>
          The Web Content Accessibility Guidelines (WCAG) define requirements for designers and
          developers to improve accessibility for people with disabilities. It defines three levels of
          conformance: Level A, Level AA, and Level AAA.
        </p>
        <p>
          Dzirent strives to conform to <strong>WCAG 2.1 Level AA</strong> across its website and
          applications.
        </p>
        <div className="legal-card" style={{ marginTop: "16px" }}>
          <h3>Technologies Relied Upon</h3>
          <p style={{ margin: "8px 0" }}>
            Accessibility of Dzirent relies on the following technologies to work with the particular
            combination of web browser and assistive technologies or plugins installed on your computer:
          </p>
          <ul style={{ paddingLeft: "20px", margin: "8px 0" }}>
            <li>HTML and WAI-ARIA</li>
            <li>CSS (including modern styling variables and media queries)</li>
            <li>JavaScript / ECMAScript</li>
          </ul>
        </div>
      </section>

      <section id="measures">
        <h2>3. Measures to Support Accessibility</h2>
        <p>Dzirent takes the following measures to ensure accessibility of our platform:</p>

        <div className="legal-card-grid">
          <div className="legal-card">
            <h3>Keyboard Navigation</h3>
            <p>
              All interactive elements, buttons, menus, and form controls are fully navigable via
              keyboard alone, with visible focus outlines and a convenient skip-to-content mechanism.
            </p>
          </div>

          <div className="legal-card">
            <h3>Dialogs & Overlays</h3>
            <p>
              Modals and slide-over drawers trap focus while active, dismiss with the Escape key,
              and restore keyboard focus to the triggering element upon closing.
            </p>
          </div>

          <div className="legal-card">
            <h3>Contrast & Typography</h3>
            <p>
              We maintain a minimum 4.5:1 color contrast ratio for standard body text and 3:1 for
              interactive icons, borders, and large text across both light and dark display modes.
            </p>
          </div>

          <div className="legal-card">
            <h3>Motion & Preferences</h3>
            <p>
              Our design respects system settings, including the <code>prefers-reduced-motion</code>{" "}
              media query, disabling unnecessary transitions and animations for users sensitive to motion.
            </p>
          </div>

          <div className="legal-card">
            <h3>Forms & Validation</h3>
            <p>
              Form inputs feature clear visual and programmatic labels, accessible instructions, and
              immediate, screen-reader-announced error states linked via <code>aria-describedby</code>.
            </p>
          </div>

          <div className="legal-card">
            <h3>Images & Media</h3>
            <p>
              Listing images provide informative, contextual alternative text describing the piece,
              while decorative iconography is properly hidden from assistive technologies.
            </p>
          </div>
        </div>
      </section>

      <section id="limitations">
        <h2>4. Known Limitations & Alternatives</h2>
        <p>
          While we strive for comprehensive WCAG 2.1 AA conformance across the platform, some content
          may present limitations:
        </p>
        <ul>
          <li>
            <strong>User-Generated Media:</strong> Dzirent is a peer-to-peer marketplace where members
            upload their own wardrobe photographs. While our platform automatically applies descriptive
            labels based on piece titles and clothing attributes, user-uploaded images may vary in
            quality or detail.
          </li>
          <li>
            <strong>Peer-to-Peer Chat Messages:</strong> Real-time messages are composed directly by
            community members. While the chat container and conversation flow are fully accessible,
            user-typed contents cannot be standardized.
          </li>
        </ul>
        <p>
          If you encounter an item or conversation that you cannot access due to these limitations,
          please let us know and we will gladly assist you directly.
        </p>
      </section>

      <section id="feedback">
        <h2>5. Feedback & Support Contact</h2>
        <p>
          We welcome your feedback on the accessibility of Dzirent. If you experience accessibility
          barriers or need assistance accessing any content on our website or mobile apps, please
          contact our team:
        </p>
        <div className="legal-card" style={{ maxWidth: "560px", marginTop: "12px" }}>
          <h3>Accessibility Support</h3>
          <p style={{ margin: "8px 0" }}>
            Email:{" "}
            <a href={`mailto:${LEGAL_CONFIG.SUPPORT_EMAIL}`} style={{ fontWeight: 600 }}>
              {LEGAL_CONFIG.SUPPORT_EMAIL}
            </a>
          </p>
          <p style={{ fontSize: "0.88rem", color: "var(--text-muted)", margin: 0 }}>
            Subject: &quot;Accessibility Support Request&quot;. Please include details of the specific
            page or feature and the assistive technology you are using. We aim to respond promptly
            within standard support hours.
          </p>
        </div>
        <p style={{ marginTop: "20px" }}>
          For more information about platform guidelines, visit our{" "}
          <Link href="/help">Help &amp; FAQ Center</Link> or our{" "}
          <Link href="/terms">Terms of Service</Link>.
        </p>
      </section>
    </LegalLayout>
  );
}
