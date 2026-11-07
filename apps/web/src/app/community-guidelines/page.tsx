// apps/web/src/app/community-guidelines/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout, LegalPlaceholder } from "@/components/legal-layout";
import { LEGAL_CONFIG } from "@/content/legal/config";

export const metadata: Metadata = {
  title: "Community Guidelines — Dzirent",
  description:
    "Standards, allowed categories, photo requirements, and etiquette for lending and renting on Dzirent.",
};

const TOC = [
  { id: "our-values", label: "1. Our Community Values" },
  { id: "allowed-categories", label: "2. Allowed Categories" },
  { id: "prohibited-items", label: "3. Prohibited & Disallowed Items" },
  { id: "photo-standards", label: "4. Photo Standards & Requirements" },
  { id: "photo-scanning", label: "5. How Photo Scanning Works" },
  { id: "communication-conduct", label: "6. Communication & In-Person Conduct" },
  { id: "reporting-enforcement", label: "7. Reporting & Enforcement" },
  { id: "contact-support", label: "8. Questions & Support" },
];

export default function CommunityGuidelinesPage() {
  return (
    <LegalLayout
      title="Community Guidelines"
      subtitle="The standards that keep the Dzirent closet high-quality, welcoming, and safe for everyone."
      version="1.0.0"
      effectiveDate={
        <LegalPlaceholder
          name="EFFECTIVE_DATE_RULES"
          label="rules effective date"
        />
      }
      lastUpdated="November 6, 2026"
      toc={TOC}
    >
      <section id="our-values">
        <h2>1. Our Community Values</h2>
        <p>
          Dzirent connects individuals who love fashion with neighbors and peers who want to rent
          curated pieces for memorable moments. To maintain trust, quality, and mutual respect, every
          member agrees to follow these Community Guidelines whenever they list an item, send a
          message, or arrange an in-person exchange.
        </p>
        <p>
          Our community rests on three core commitments:
        </p>
        <ul>
          <li>
            <strong>Quality curation:</strong> Dzirent is a destination for special, statement, and
            high-craftsmanship pieces—not everyday disposable fast fashion.
          </li>
          <li>
            <strong>Honesty and transparency:</strong> Accurate descriptions, truthful condition
            disclosures, and authentic original photography.
          </li>
          <li>
            <strong>Mutual respect and safety:</strong> Courteous communication, punctuality, and
            careful handling of rented garments.
          </li>
        </ul>
      </section>

      <section id="allowed-categories">
        <h2>2. Allowed Categories</h2>
        <p>
          Dzirent focuses specifically on occasion wear, professional attire, cultural garments, and
          standout wardrobe items. Only items falling into the following categories may be listed:
        </p>

        <div className="legal-card-grid">
          <div className="legal-card">
            <h4>Career & Professional</h4>
            <p>
              Tailored blazers, suits, structured trousers, pencil skirts, professional shifts, and
              curated executive workwear designed for interviews, presentations, or business events.
            </p>
          </div>
          <div className="legal-card">
            <h4>Occasion & Party</h4>
            <p>
              Cocktail dresses, evening gowns, backless maxi dresses, formal tuxedos, party sets,
              statement jumpsuits, and celebratory attire for weddings, galas, and special nights.
            </p>
          </div>
          <div className="legal-card">
            <h4>Cultural & Traditional</h4>
            <p>
              Authentic cultural attire including lehengas, sarees, sherwanis, qipaos, hanboks,
              abayas, kaftans, dirndls, and heritage celebration garments.
            </p>
          </div>
          <div className="legal-card">
            <h4>Everyday</h4>
            <p>
              Elevated tops, blouses, premium knitwear, silk shirts, structured vests, statement
              jackets, and distinctive fashion pieces with exceptional cut, fabric, or design.
            </p>
          </div>
          <div className="legal-card">
            <h4>Outerwear</h4>
            <p>
              Tailored wool coats, classic trench coats, capes, leather or shearling jackets, and
              formal wraps or duster coats.
            </p>
          </div>
          <div className="legal-card">
            <h4>Accessories</h4>
            <p>
              Curated luxury sunglasses, high-end handbags and clutches, designer silk ties,
              non-smart classic watches, statement belt buckles, and costume jewelry accompanied by an
              accessory declaration.
            </p>
          </div>
        </div>
      </section>

      <section id="prohibited-items">
        <h2>3. Prohibited & Disallowed Items</h2>
        <p>
          To protect hygiene, brand identity, and buyer expectations, certain items are strictly
          prohibited from Dzirent. Listings containing any of the following items will be rejected or
          removed:
        </p>

        <div className="legal-callout warning">
          <div className="callout-title">Strictly Prohibited on Dzirent</div>
          <ul style={{ margin: 0, paddingLeft: "20px" }}>
            <li>
              <strong>Everyday basics:</strong> Plain standard T-shirts, graphic tees, basic tank
              tops, ordinary hoodies, fleece sweatshirts, casual track pants, sweatpants, fleece
              joggers, casual athletic shorts, and standard worn denim jeans.
            </li>
            <li>
              <strong>Intimate wear & swimwear:</strong> Lingerie, bras, panties, boxers, briefs,
              shapewear, sleepwear, swimsuits, bikini tops or bottoms, and trunks.
            </li>
            <li>
              <strong>Footwear:</strong> Shoes, boots, heels, sneakers, sandals, slippers, or footwear
              of any kind.
            </li>
            <li>
              <strong>Standard headwear:</strong> Everyday baseball caps, beanies, sun visors, and
              casual hats (formal headpieces or cultural headwear declared with traditional garments
              are allowed).
            </li>
            <li>
              <strong>Hosiery:</strong> Socks, stockings, tights, pantyhose, and leg warmers.
            </li>
            <li>
              <strong>Smart electronics:</strong> Smartwatches, fitness trackers, connected rings, or
              electronic wearables.
            </li>
            <li>
              <strong>Counterfeits & replicas:</strong> Unauthorized fakes, replica designer goods,
              knockoffs, or items infringing intellectual property rights.
            </li>
            <li>
              <strong>Damaged or soiled clothing:</strong> Dirty, unwashed, stained, torn, smoke-scented,
              or visibly degraded garments.
            </li>
            <li>
              <strong>Hazardous or illegal articles:</strong> Any item containing hazardous materials,
              weapons, controlled substances, or illegal goods.
            </li>
          </ul>
        </div>
        <p>
          Additional policy notes:{" "}
          <LegalPlaceholder
            name="PROHIBITED_ITEMS"
            label="prohibited items policy specifics"
          />
        </p>
      </section>

      <section id="photo-standards">
        <h2>4. Photo Standards & Requirements</h2>
        <p>
          High-quality photos ensure borrowers know exactly what to expect and elevate the entire
          catalog. Every listing must meet the following photographic requirements:
        </p>

        <div className="legal-table-wrapper">
          <table className="legal-table">
            <thead>
              <tr>
                <th>Requirement</th>
                <th>Standard</th>
                <th>Why It Matters</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Background</strong></td>
                <td>Clean, plain, light or neutral background (white, off-white, light gray).</td>
                <td>Keeps full focus on the garment silhouette, color, and fabric texture.</td>
              </tr>
              <tr>
                <td><strong>Presentation</strong></td>
                <td>Garment neatly displayed on a wooden or neutral hanger, a clean mannequin, a clean flat-lay, or photographed being worn.</td>
                <td>Preserves garment shape and provides an accurate, versatile representation.</td>
              </tr>
              <tr>
                <td><strong>Front &amp; Back</strong></td>
                <td>At least one high-resolution front photo is required. A back photo is strongly recommended.</td>
                <td>Borrowers need to see zippers, closures, vents, and back cut details.</td>
              </tr>
              <tr>
                <td><strong>Photos Being Worn</strong></td>
                <td>Photos of the item being worn are allowed. If you appear in a photo, it is public like every listing photo. Do not include other people without their permission.</td>
                <td>Shows real drape and fit while respecting personal privacy and consent.</td>
              </tr>
              <tr>
                <td><strong>No Overlays</strong></td>
                <td>No text, price badges, phone numbers, social media handles, or watermarks on photos.</td>
                <td>Maintains an uncluttered experience and prevents off-platform solicitation.</td>
              </tr>
              <tr>
                <td><strong>Original Photography</strong></td>
                <td>You must take original photos of your actual item. Stock or stolen photos are prohibited.</td>
                <td>Reflects authentic current condition and prevents copyright infringement.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section id="photo-scanning">
        <h2>5. How Photo Scanning Works</h2>
        <p>
          To help lenders list accurately and keep the catalog to our rules, Dzirent checks every
          listing photo automatically, using open-source image models:
        </p>
        <ul>
          <li>
            <strong>Item identification:</strong> The check evaluates what kind of item it is, and
            whether it is clothing or an accessory we list (such as dresses, blazers, coats, or approved
            accessories).
          </li>
          <li>
            <strong>Category &amp; policy compliance:</strong> It checks whether the piece belongs to
            an allowed category or an excluded category (such as hoodies, sweatshirts, sweatpants, plain
            basics, or swimwear).
          </li>
          <li>
            <strong>Photo quality:</strong> It evaluates blur, lighting, and whether the whole piece is
            in the frame. Photo quality alone never rejects a listing; it only adds helpful suggestions or
            warnings to that photo.
          </li>
          <li>
            <strong>Photo safety:</strong> Nudity or sexual content is not allowed and is rejected.
            A photo of someone wearing the piece is fine and is never penalized.
          </li>
          <li>
            <strong>Duplicate check:</strong> It compares a numerical summary of each photo with other
            listings, to catch copied photos.
          </li>
        </ul>

        <h3>Scan Outcomes</h3>
        <p>When you submit photos for a listing, the check returns one of three outcomes:</p>
        <ol>
          <li>
            <strong>Allowed:</strong> The photos meet all listing standards. The piece can be published to
            search and browse.
          </li>
          <li>
            <strong>Not allowed:</strong> The item violates a listing policy (for example, it appears to be
            an excluded everyday basic such as a hoodie, sweatshirt, or sweatpants). The check returns a
            clear explanation of why the item cannot be listed.
          </li>
          <li>
            <strong>Under review:</strong> When the automated check is uncertain, when a photo matches
            another listing, or when the piece has a hood, a person at Dzirent looks at the photos. You
            see the reason in the app.
          </li>
        </ol>

        <div className="legal-callout note">
          <div className="callout-title">Changed Photos Are Re-Checked</div>
          <p>
            Whenever you change or replace photos on an active listing, the new photos are checked
            again automatically.
          </p>
        </div>
      </section>

      <section id="communication-conduct">
        <h2>6. Communication & In-Person Conduct</h2>
        <p>
          Dzirent members arrange local handoffs in person. Respectful, transparent communication is
          essential to making every rental smooth and enjoyable.
        </p>

        <h3>In-App Messaging</h3>
        <ul>
          <li>
            <strong>Courteous tone:</strong> Treat other members with kindness, promptness, and
            respect.
          </li>
          <li>
            <strong>Keep transactions on Dzirent:</strong> Discuss availability, sizing, and handoff
            details directly in the in-app chat so there is an official timestamped record.
          </li>
          <li>
            <strong>Zero tolerance for abuse:</strong> We have zero tolerance for hate speech,
            harassment, vulgarity, threats, extortion, sexually explicit remarks, or discriminatory
            treatment based on race, ethnicity, religion, gender, disability, or sexual orientation.
          </li>
        </ul>

        <h3>In-Person Hand-Off Etiquette</h3>
        <ul>
          <li>
            <strong>Punctuality:</strong> Arrive on time for pickup and return meetings. If you are
            running late, communicate immediately through the app.
          </li>
          <li>
            <strong>Inspect together:</strong> Always inspect the garment together at handoff. Check
            zippers, seams, buttons, and fabric condition so both parties agree on its starting state.
          </li>
          <li>
            <strong>Care and return:</strong> Borrowers must treat pieces with utmost care. Do not
            alter garments, apply heavy perfumes, or attempt complex stain removal without consulting
            the lender. Return the garment in the agreed condition on or before the rental end date.
          </li>
        </ul>
      </section>

      <section id="reporting-enforcement">
        <h2>7. Reporting & Enforcement</h2>
        <p>
          We rely on community vigilance to help keep Dzirent safe and inspiring. If you encounter a
          listing, photo, message, or user behavior that violates these guidelines:
        </p>
        <ul>
          <li>
            <strong>Report in the app:</strong> Use the &quot;Report&quot; link on any listing or in your
            conversation view.
          </li>
          <li>
            <strong>Block a user:</strong> You can block another member at any time from your chat
            screen to immediately prevent future messages.
          </li>
        </ul>

        <h3>Enforcement Actions</h3>
        <p>
          Violations are reviewed by our moderation team. Depending on severity and account history,
          enforcement may include:
        </p>
        <ul>
          <li>
            <strong>Educational warning:</strong> For minor or accidental photo and listing mistakes.
          </li>
          <li>
            <strong>Listing removal:</strong> Ineligible or non-compliant listings are unpublished.
          </li>
          <li>
            <strong>Account suspension:</strong> Temporary restriction from listing, messaging, or
            booking.
          </li>
          <li>
            <strong>Permanent ban:</strong> Immediate termination of account access for abusive
            behavior, harassment, counterfeit goods, fraud, or repeated guideline violations.
          </li>
        </ul>
      </section>

      <section id="contact-support">
        <h2>8. Questions & Support</h2>
        <p>
          If you have questions about whether a specific piece is eligible or need assistance with a
          photo review, reach out to our team at{" "}
          <a href={`mailto:${LEGAL_CONFIG.SUPPORT_EMAIL || "support@dzirent.com"}`}>
            {LEGAL_CONFIG.SUPPORT_EMAIL || "support@dzirent.com"}
          </a>
          .
        </p>
        <p>
          You can also visit our <Link href="/safety">Safety Center</Link> for meetup tips or read our
          full <Link href="/terms">Terms of Service</Link>.
        </p>
      </section>
    </LegalLayout>
  );
}
