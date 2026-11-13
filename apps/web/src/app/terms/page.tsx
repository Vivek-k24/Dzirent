// apps/web/src/app/terms/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout, LegalPlaceholder } from "@/components/legal-layout";
import { LEGAL_CONFIG } from "@/content/legal/config";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "Terms and conditions governing your use of the Dzirent platform.",
};

const toc = [
  { id: "marketplace-role", label: "1. The Marketplace Role (Dzirent Connects People)" },
  { id: "eligibility", label: "2. Eligibility & 18+ Requirement" },
  { id: "accounts", label: "3. Accounts & Security" },
  { id: "listing-rules", label: "4. Listing Rules & Prohibited Items" },
  { id: "user-content", label: "5. Content You Post & Photo Licenses" },
  { id: "zero-tolerance", label: "6. Zero Tolerance for Abuse & Bad Behavior" },
  { id: "safety-meetings", label: "7. Meeting Safely & In-Person Hand-Offs" },
  { id: "deposits-damage", label: "8. Deposits, Damage, Loss, & Cleaning" },
  { id: "taxes", label: "9. Taxes & Reporting" },
  { id: "copyright", label: "10. Copyright & Intellectual Property" },
  { id: "disclaimers", label: "11. Disclaimers & 'As-Is' Operation" },
  { id: "liability", label: "12. Limitation of Liability" },
  { id: "disputes", label: "13. Governing Law & Dispute Resolution" },
  { id: "termination", label: "14. Account Closure & Termination" },
  { id: "changes-contact", label: "15. Updates to Terms & Contact" },
];

export default function TermsPage() {
  return (
    <LegalLayout
      title="Terms of Use"
      subtitle="Welcome to Dzirent. These Terms of Use explain how our platform operates, what we expect from lenders and renters, and the mutual commitments that keep our neighborhood fashion community safe."
      version={LEGAL_CONFIG.TERMS_VERSION}
      effectiveDate={
        <LegalPlaceholder
          name="EFFECTIVE_DATE_TERMS"
          label="effective date"
        />
      }
      lastUpdated="November 6, 2026"
      toc={toc}
    >
      <section id="marketplace-role">
        <h2>1. The Marketplace Role (Dzirent Connects People)</h2>
        <div className="legal-callout">
          <p>
            <strong>Dzirent connects people:</strong> {LEGAL_CONFIG.BRAND_NAME}{" "}
            provides a peer-to-peer technology platform that enables individual
            clothing owners (&ldquo;lenders&rdquo;) and people looking for outfits
            (&ldquo;renters&rdquo;) to find each other, communicate, and coordinate
            garment rentals.
          </p>
        </div>
        <p>
          {LEGAL_CONFIG.BRAND_NAME} is <strong>not</strong> a clothing rental
          company, dry cleaner, retailer, or shipping carrier. We are not a party
          to any rental agreement, transaction, or meeting arranged between users.
          We do not process payments, collect rental fees, hold security deposits,
          or inspect clothing in person.
        </p>
        <p>
          All rental arrangements&mdash;including pickup logistics, condition
          reviews, care expectations, return deadlines, and payment
          methods&mdash;are decided and agreed upon directly between the renter
          and the lender.
        </p>
      </section>

      <section id="eligibility">
        <h2>2. Eligibility &amp; 18+ Requirement</h2>
        <p>
          To create an account, list clothing, or arrange a rental on{" "}
          {LEGAL_CONFIG.BRAND_NAME}, you must be at least{" "}
          <LegalPlaceholder
            name="MINIMUM_AGE"
            label="minimum age"
          />{" "}
          years of age.
        </p>
        <p>
          By creating an account, you affirm that you are 18 years of age or older
          and legally competent to enter into these Terms{" "}
          <LegalPlaceholder
            name="AGE_REQUIREMENT_WORDING"
            label="exact age requirement wording from attorney"
          />
          . If we discover or have reason to believe that an account belongs to
          someone under 18, we will immediately suspend and delete the account.
        </p>
      </section>

      <section id="accounts">
        <h2>3. Accounts &amp; Security</h2>
        <ul>
          <li>
            <strong>Accurate Information:</strong> You agree to provide accurate,
            current information when registering and to keep your profile updated.
          </li>
          <li>
            <strong>Account Responsibility:</strong> You are responsible for
            maintaining the confidentiality of your login credentials and for all
            activities that take place under your account.
          </li>
          <li>
            <strong>One Account:</strong> Each user may maintain only one active
            account. You may not impersonate others or transfer your account.
          </li>
        </ul>
      </section>

      <section id="listing-rules">
        <h2>4. Listing Rules &amp; Prohibited Items</h2>
        <p>
          {LEGAL_CONFIG.BRAND_NAME} focuses on quality occasion wear, formal
          clothing, traditional garments, and statement pieces. To maintain a
          curated catalog, we enforce clear listing rules:
        </p>
        <ul>
          <li>
            <strong>Allowed Garments:</strong> Career &amp; Professional, Occasion
            &amp; Party, Cultural &amp; Traditional, Everyday, Outerwear, and select approved
            Accessories (sunglasses, handbags, ties, non-smart watches, belt
            buckles, and costume jewelry).
          </li>
          <li>
            <strong>Prohibited Items:</strong> Everyday basics (T-shirts, tank
            tops, hoodies, sweatshirts, sweatpants, plain jeans); lingerie,
            underwear, and swimwear; shoes, boots, sneakers, hats, caps, socks,
            and smartwatches; counterfeits and replicas, and damaged or dirty items.
          </li>
          <li>
            <strong>Authenticity &amp; Ownership:</strong> You may only list items
            that you lawfully own and have the right to lend. Counterfeits,
            replicas, and stolen goods are strictly forbidden. Lenders listing
            accessories must complete an accessory attestation.
          </li>
        </ul>
        <p>
          Review our complete item catalog guidelines in our{" "}
          <Link href="/community-guidelines">Community Guidelines</Link>.
        </p>
      </section>

      <section id="user-content">
        <h2>5. Content You Post &amp; Photo Licenses</h2>
        <p>
          When you upload photos, descriptions, studio bios, and messages to{" "}
          {LEGAL_CONFIG.BRAND_NAME}:
        </p>
        <ul>
          <li>
            <strong>You keep ownership:</strong> You retain all intellectual
            property rights to your original photographs and written descriptions.
          </li>
          <li>
            <strong>License to Dzirent:</strong> You grant {LEGAL_CONFIG.BRAND_NAME}{" "}
            a non-exclusive, worldwide, royalty-free license to store, format,
            resize, and display your content on our website and mobile apps
            solely to operate, promote, and provide the service.
          </li>
          <li>
            <strong>Your representations:</strong> You confirm that you own or
            have obtained all necessary permissions to publish the photos and text
            you upload, and that your content does not violate anyone else&apos;s
            copyright, trademark, or privacy rights.
          </li>
          <li>
            <strong>Photo standards:</strong> Photos must depict the actual
            garment on a hanger, clean mannequin, clean flat-lay, or being worn against
            a clean, light background. Photos of the item being worn are allowed (if you
            appear in a photo, it is public like every listing photo; you must not include other
            people without their permission). Stock photos, or photos containing overlaid
            text, prices, phone numbers, social media handles, or watermarks are not permitted.
          </li>
        </ul>
      </section>

      <section id="zero-tolerance">
        <h2>6. Zero Tolerance for Abuse &amp; Bad Behavior</h2>
        <div className="legal-callout">
          <p>
            <strong>Zero tolerance policy:</strong> We have zero tolerance for
            objectionable content, abusive behavior, fraud, harassment, hate
            speech, threats, or discrimination of any kind.
          </p>
        </div>
        <p>
          Violations will result in immediate removal of offending content,
          suspension of access, and permanent account termination.
        </p>
        <p>
          Every user has access to in-app reporting and blocking tools. If you
          encounter suspicious activity or improper behavior, you can block the
          user immediately and file a report with our moderation team.
        </p>
      </section>

      <section id="safety-meetings">
        <h2>7. Meeting Safely &amp; In-Person Hand-Offs</h2>
        <p>
          Because rentals are arranged in person:
        </p>
        <ul>
          <li>
            <strong>Public locations:</strong> Always meet in a busy, well-lit,
            public location (such as a local coffee shop or shopping center)
            during daylight hours.
          </li>
          <li>
            <strong>Check the garment:</strong> Renters and lenders should inspect
            the piece together at pickup. Agree on its condition, verify seams and
            zippers, and confirm care and return expectations.
          </li>
          <li>
            <strong>Keep chats in the app:</strong> Conduct all rental communications
            within {LEGAL_CONFIG.BRAND_NAME} in-app chat so there is an objective
            record of your agreements.
          </li>
        </ul>
        <p>
          For more practical tips, please read our dedicated{" "}
          <Link href="/safety">Safety Guidelines</Link>.
        </p>
      </section>

      <section id="deposits-damage">
        <h2>8. Deposits, Damage, Loss, &amp; Cleaning</h2>
        <p>
          While {LEGAL_CONFIG.BRAND_NAME} does not process integrated checkout or
          security deposits on the platform:
        </p>
        <ul>
          <li>
            <strong>Deposits:</strong> Lenders are strongly encouraged to request
            a refundable security deposit for valuable designer or delicate
            pieces, arranged directly with the renter.
          </li>
          <li>
            <strong>Condition &amp; care:</strong> Lenders should clearly state
            cleaning guidelines (e.g. professional dry cleaning only). Renters
            must treat borrowed garments with care.
          </li>
          <li>
            <strong>Resolving issues:</strong> Renters and lenders settle any
            accidental damage, stains, repair costs, loss, or late return
            adjustments directly between themselves.
          </li>
        </ul>
      </section>

      <section id="taxes">
        <h2>9. Taxes &amp; Reporting</h2>
        <p>
          Lenders who earn money by sharing their wardrobe are independent
          individuals and are solely responsible for understanding and fulfilling
          their own tax obligations{" "}
          <LegalPlaceholder
            name="LENDER_TAX_STATEMENT"
            label="lender tax reporting statement from tax adviser"
          />
          .
        </p>
        <p>
          <LegalPlaceholder
            name="SALES_TAX_STATEMENT"
            label="sales tax statement regarding peer-to-peer rentals"
          />
        </p>
      </section>

      <section id="copyright">
        <h2>10. Copyright &amp; Intellectual Property</h2>
        <p>
          We respect intellectual property rights and comply with the Digital
          Millennium Copyright Act (DMCA). If you believe material hosted on{" "}
          {LEGAL_CONFIG.BRAND_NAME} infringes your copyright, please consult our{" "}
          <Link href="/copyright">Copyright &amp; DMCA Policy</Link> for
          instructions on filing a notice of infringement with our designated
          agent.
        </p>
      </section>

      <section id="disclaimers">
        <h2>11. Disclaimers &amp; &ldquo;As-Is&rdquo; Operation</h2>
        <p>
          <LegalPlaceholder
            name="MARKETPLACE_ROLE"
            label="marketplace disclaimer"
          />
        </p>
        <p>
          Dzirent makes no representations or warranties regarding the condition,
          cleanliness, quality, authenticity, safety, or legality of any garments
          listed by users, or the truthfulness or accuracy of any user descriptions
          or communications.
        </p>
      </section>

      <section id="liability">
        <h2>12. Limitation of Liability</h2>
        <p>
          <LegalPlaceholder
            name="LIABILITY_CAP"
            label="limitation of liability clause and maximum liability cap from attorney"
          />
        </p>
      </section>

      <section id="disputes">
        <h2>13. Governing Law &amp; Dispute Resolution</h2>
        <p>
          These Terms and any dispute between you and {LEGAL_CONFIG.BRAND_NAME}{" "}
          shall be governed by and construed in accordance with the laws of the
          State of{" "}
          <LegalPlaceholder
            name="GOVERNING_LAW_STATE"
            label="governing law state, e.g. Texas"
          />
          , without regard to conflict of law principles.
        </p>
        <p>
          Any legal action or proceeding arising under these Terms shall be
          brought exclusively in the courts located in{" "}
          <LegalPlaceholder
            name="VENUE"
            label="court venue, county and state"
          />
          .
        </p>
        <p>
          <LegalPlaceholder
            name="DISPUTE_PROCESS"
            label="informal resolution, arbitration, and class action waiver provisions from attorney"
          />
        </p>
      </section>

      <section id="termination">
        <h2>14. Account Closure &amp; Termination</h2>
        <p>
          You may delete your account at any time via Settings or at{" "}
          <Link href="/delete-account">/delete-account</Link>.
        </p>
        <p>
          We reserve the right to suspend or terminate your account, remove your
          listings, or restrict your access to the platform immediately, with or
          without prior notice, if you breach these Terms, violate our Community
          Guidelines, or engage in fraudulent, harmful, or abusive conduct.
        </p>
      </section>

      <section id="changes-contact">
        <h2>15. Updates to Terms &amp; Contact</h2>
        <p>
          We may modify these Terms at any time. When we make material changes,
          we will update the effective date and notify users{" "}
          <LegalPlaceholder
            name="CHANGE_NOTICE"
            label="notice process and timeframe from attorney"
          />
          . Continued use of the platform after changes become effective constitutes
          acceptance of the revised Terms.
        </p>
        <p>
          For questions or notices regarding these Terms, contact:
        </p>
        <ul>
          <li>
            <strong>Email:</strong>{" "}
            <a href={`mailto:${LEGAL_CONFIG.SUPPORT_EMAIL}`}>
              {LEGAL_CONFIG.SUPPORT_EMAIL}
            </a>
          </li>
          <li>
            <strong>Address:</strong>{" "}
            <LegalPlaceholder
              name="REGISTERED_ADDRESS"
              label="registered corporate address"
            />
          </li>
        </ul>
      </section>
    </LegalLayout>
  );
}
