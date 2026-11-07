// apps/web/src/app/copyright/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout, LegalPlaceholder } from "@/components/legal-layout";
import { LEGAL_CONFIG } from "@/content/legal/config";

export const metadata: Metadata = {
  title: "Copyright & DMCA Policy — Dzirent",
  description:
    "How Dzirent respects intellectual property rights, handles DMCA takedown notices, counter-notices, and addresses repeat infringement.",
};

const TOC = [
  { id: "overview", label: "1. Overview & Policy" },
  { id: "dmca-agent", label: "2. Designated Copyright Agent" },
  { id: "takedown-notice", label: "3. Submitting a DMCA Takedown Notice" },
  { id: "counter-notice", label: "4. Counter-Notification Procedure" },
  { id: "repeat-infringers", label: "5. Repeat Infringer Policy" },
  { id: "good-faith", label: "6. Good-Faith Statements & Penalties" },
  { id: "contact-support", label: "7. General IP Questions" },
];

export default function CopyrightPage() {
  return (
    <LegalLayout
      title="Copyright & DMCA Policy"
      subtitle="Procedures for reporting copyright infringement and submitting counter-notifications in compliance with the Digital Millennium Copyright Act (17 U.S.C. § 512)."
      version="1.0.0"
      effectiveDate={
        <LegalPlaceholder
          name="EFFECTIVE_DATE_COPYRIGHT"
          label="copyright effective date"
        />
      }
      lastUpdated="November 6, 2026"
      toc={TOC}
    >
      <section id="overview">
        <h2>1. Overview & Policy</h2>
        <p>
          Dzirent respects the intellectual property rights of creators, photographers, brands, and
          designers, and expects its community members to do the same. In accordance with the Digital
          Millennium Copyright Act (&quot;DMCA&quot;), Title 17, United States Code, Section 512, we respond
          expeditiously to notices of alleged copyright infringement that comply with statutory
          requirements.
        </p>
        <p>
          Members must only upload photos, images, and text descriptions that they own or have the
          express legal authority to publish. Taking images from commercial catalogs, designer websites,
          social media accounts, or other users without permission is strictly prohibited.
        </p>
      </section>

      <section id="dmca-agent">
        <h2>2. Designated Copyright Agent</h2>
        <p>
          Notices of claimed copyright infringement should be delivered directly to our Designated
          Copyright Agent:
        </p>

        <div className="legal-card" style={{ maxWidth: "600px", marginTop: "16px" }}>
          <h4 style={{ marginBottom: "12px", borderBottom: "1px solid var(--border-subtle)", paddingBottom: "8px" }}>
            Designated DMCA Agent Contact
          </h4>
          <div style={{ display: "grid", gap: "8px", fontSize: "0.95rem" }}>
            <div>
              <strong>Agent Name:</strong>{" "}
              <LegalPlaceholder name="DMCA_AGENT_NAME" label="DMCA agent name" />
            </div>
            <div>
              <strong>Company:</strong>{" "}
              <LegalPlaceholder name="COMPANY_LEGAL_NAME" label="company legal name" />
            </div>
            <div>
              <strong>Mailing Address:</strong>{" "}
              <LegalPlaceholder name="DMCA_AGENT_ADDRESS" label="DMCA agent physical address" />
            </div>
            <div>
              <strong>Email:</strong>{" "}
              <LegalPlaceholder name="DMCA_AGENT_EMAIL" label="DMCA agent email address" />
            </div>
            <div>
              <strong>Telephone:</strong>{" "}
              <LegalPlaceholder name="DMCA_AGENT_PHONE" label="DMCA agent phone number" />
            </div>
            <div>
              <strong>U.S. Copyright Office Designation Number:</strong>{" "}
              <LegalPlaceholder name="DMCA_DESIGNATION_NUMBER" label="U.S. Copyright Office designation number" />
            </div>
          </div>
        </div>
      </section>

      <section id="takedown-notice">
        <h2>3. Submitting a DMCA Takedown Notice</h2>
        <p>
          If you believe in good faith that any content hosted on Dzirent (such as listing photographs
          or descriptive text) infringes your copyright, please send a written notification containing
          the following six elements to our team by email at{" "}
          <a href={`mailto:${LEGAL_CONFIG.SUPPORT_EMAIL}`}>
            {LEGAL_CONFIG.SUPPORT_EMAIL}
          </a>{" "}
          with the subject &quot;Copyright notice&quot; (or deliver it to our Designated Copyright Agent above):
        </p>

        <ol>
          <li>
            <strong>Physical or electronic signature:</strong> A signature of the copyright owner or a
            person authorized to act on behalf of the owner of an exclusive right that is allegedly
            infringed.
          </li>
          <li>
            <strong>Identification of copyrighted work:</strong> Clear identification of the
            copyrighted work claimed to have been infringed, or, if multiple works at a single site are
            covered, a representative list of such works.
          </li>
          <li>
            <strong>Identification of infringing material:</strong> Specific identification of the
            material that is claimed to be infringing and that is to be removed or access to which is to
            be disabled, including the exact URL(s), listing title, or owner handle on Dzirent so that we
            can locate it.
          </li>
          <li>
            <strong>Contact information:</strong> Information reasonably sufficient to permit us to
            contact you, including your full legal name, physical address, telephone number, and email
            address.
          </li>
          <li>
            <strong>Good-faith statement:</strong> A statement that you have a good-faith belief that
            use of the material in the manner complained of is not authorized by the copyright owner, its
            agent, or the law.
          </li>
          <li>
            <strong>Statement of accuracy and authority:</strong> A statement that the information in
            the notification is accurate, and under penalty of perjury, that you are authorized to act on
            behalf of the owner of an exclusive right that is allegedly infringed.
          </li>
        </ol>

        <div className="legal-callout note">
          <div className="callout-title">Notice Receipt & Action</div>
          <p>
            Upon receipt of an effective DMCA notice containing all required elements, we will promptly
            remove or disable access to the infringing content and notify the user who posted it.
          </p>
        </div>
      </section>

      <section id="counter-notice">
        <h2>4. Counter-Notification Procedure</h2>
        <p>
          If material you posted was removed or disabled as a result of a DMCA takedown notice, and you
          believe that the removal was the result of mistake or misidentification (for example, you own
          the photo or have an express license), you may submit a counter-notification to our Designated
          Agent.
        </p>

        <p>Your counter-notification must be in writing and include all of the following:</p>
        <ol>
          <li>
            <strong>Your physical or electronic signature.</strong>
          </li>
          <li>
            <strong>Identification of the material:</strong> The material that was removed or disabled
            and the location (URL or listing reference) where it appeared before removal.
          </li>
          <li>
            <strong>Statement under penalty of perjury:</strong> A statement under penalty of perjury
            that you have a good-faith belief that the material was removed or disabled as a result of
            mistake or misidentification of the material.
          </li>
          <li>
            <strong>Contact info and consent to jurisdiction:</strong> Your full name, address, and
            telephone number, and a statement that you consent to the jurisdiction of the Federal
            District Court for the judicial district in which your address is located (or if you reside
            outside the United States, for any judicial district in which Dzirent may be found), and that
            you will accept service of process from the person who provided the original takedown notice
            or their agent.
          </li>
        </ol>

        <div className="legal-callout warning">
          <div className="callout-title">Statutory Waiting Period (10–14 Business Days)</div>
          <p>
            Upon receiving an effective counter-notification, we promptly forward a copy to the original
            complaining party. Under federal law (17 U.S.C. § 512(g)), Dzirent will restore the removed
            material in not less than 10 nor more than 14 business days following receipt of the
            counter-notice, unless the original copyright owner notifies us that they have filed a court
            action seeking a court order against the user.
          </p>
        </div>
      </section>

      <section id="repeat-infringers">
        <h2>5. Repeat Infringer Policy</h2>
        <p>
          Dzirent maintains a strict policy regarding repeat intellectual property infringement.{" "}
          <LegalPlaceholder
            name="REPEAT_INFRINGER_RULE"
            label="repeat infringer rule details"
          />
        </p>
        <p>
          Users who repeatedly upload stolen catalog imagery, infringe designer trademarks, or receive
          multiple substantiated DMCA notices will have their active listings permanently deleted and
          their platform access permanently revoked.
        </p>
      </section>

      <section id="good-faith">
        <h2>6. Good-Faith Statements & Penalties</h2>
        <p>
          Please be aware that under 17 U.S.C. § 512(f), any person who knowingly materially
          misrepresents that material or activity is infringing, or that material or activity was removed
          or disabled by mistake or misidentification, may be subject to liability for damages, including
          costs and attorney fees incurred by the alleged infringer, by any copyright owner or
          authorized licensee, or by Dzirent.
        </p>
        <p>
          If you are unsure whether material on Dzirent infringes your copyright, please consider
          consulting an attorney before submitting a notice.
        </p>
      </section>

      <section id="contact-support">
        <h2>7. General IP Questions</h2>
        <p>
          For general intellectual property questions or trademark inquiries that do not involve DMCA
          copyright takedowns, you may contact our legal team at{" "}
          <a href={`mailto:${LEGAL_CONFIG.SUPPORT_EMAIL}`}>
            {LEGAL_CONFIG.SUPPORT_EMAIL}
          </a>
          .
        </p>
        <p>
          To review our broader community rules and photo guidelines, visit our{" "}
          <Link href="/community-guidelines">Community Guidelines</Link> and{" "}
          <Link href="/terms">Terms of Service</Link>.
        </p>
      </section>
    </LegalLayout>
  );
}
