// apps/web/src/app/help/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout } from "@/components/legal-layout";

export const metadata: Metadata = {
  title: "Help Center & FAQ",
  description:
    "Frequently asked questions about renting, lending, private measurements, safety meetups, and account settings on Dzirent.",
};

const TOC = [
  { id: "getting-started", label: "1. Getting started" },
  { id: "renting", label: "2. Renting" },
  { id: "lending", label: "3. Lending" },
  { id: "fit-measurements", label: "4. Fit & measurements" },
  { id: "account-privacy", label: "5. Account & privacy" },
  { id: "safety", label: "6. Safety" },
];

export default function HelpPage() {
  return (
    <LegalLayout
      title="Help Center & FAQ"
      subtitle="Answers to common questions about finding pieces, listing your wardrobe, local handoffs, and privacy."
      version="1.0.0"
      effectiveDate="November 6, 2026"
      lastUpdated="November 7, 2026"
      toc={TOC}
    >
      <section id="getting-started" className="faq-section">
        <h2 className="faq-section-title">1. Getting started</h2>
        <div className="faq-list">
          <details className="faq-item">
            <summary className="faq-question">What is Dzirent?</summary>
            <div className="faq-answer">
              <p>
                Dzirent is a peer-to-peer fashion rental community that connects wardrobe owners
                with fashion lovers nearby. Instead of purchasing clothes for single occasions or
                leaving standout items unused in closets, Dzirent members share garments locally
                and sustainably.
              </p>
              <p>
                Every rental handoff is arranged locally between neighbors, fostering a circular
                fashion economy close to home.
              </p>
            </div>
          </details>

          <details className="faq-item">
            <summary className="faq-question">Can I browse as a guest?</summary>
            <div className="faq-answer">
              <p>
                Yes! Anyone is welcome to explore the Dzirent catalog without creating an account.
                You can search by keyword, filter by garment category, style silhouette, size,
                distance radius, and rental price.
              </p>
              <p>
                When you are ready to save pieces to your wishlist, message a lender, reserve
                rental dates, or list pieces from your own closet, you will be prompted to create
                an account or sign in.
              </p>
            </div>
          </details>

          <details className="faq-item">
            <summary className="faq-question">How do I create an account?</summary>
            <div className="faq-answer">
              <p>
                To create an account, select &ldquo;Sign in / sign up&rdquo; from the top bar or
                account menu. Enter your name, email address, and a secure password of at least 8
                characters.
              </p>
              <p>
                You must confirm that you are at least 18 years of age and agree to our{" "}
                <Link href="/terms" className="accent">
                  Terms of Use
                </Link>{" "}
                and{" "}
                <Link href="/privacy" className="accent">
                  Privacy Policy
                </Link>
                .
              </p>
            </div>
          </details>

          <details className="faq-item">
            <summary className="faq-question">Why is Dzirent 18+ only?</summary>
            <div className="faq-answer">
              <p>
                Dzirent rentals involve in-person physical exchanges, peer-to-peer rental agreements,
                and financial transactions for security deposits and fees. For safety, compliance,
                and contract enforceability, all account holders must be at least 18 years old.
              </p>
              <p>
                In some states, we use your app store&apos;s age check to confirm you are 18 or
                older. We never ask for or store your birthdate. If your app store says you are
                under 18, the account can no longer be used, except to see your own information and
                delete the account.
              </p>
            </div>
          </details>
        </div>
      </section>

      <section id="renting" className="faq-section">
        <h2 className="faq-section-title">2. Renting</h2>
        <div className="faq-list">
          <details className="faq-item">
            <summary className="faq-question">How do I find pieces to rent?</summary>
            <div className="faq-answer">
              <p>
                Use the search bar at the top of any page to search for specific brands, items, or
                occasions. You can also open the filter panel to filter by:
              </p>
              <ul>
                <li>Garment category (Dresses, Outerwear, Tops, Trousers, Suits, Accessories)</li>
                <li>Size and silhouette</li>
                <li>Distance from your neighborhood</li>
                <li>Daily rental price range</li>
              </ul>
            </div>
          </details>

          <details className="faq-item">
            <summary className="faq-question">How do rental dates work?</summary>
            <div className="faq-answer">
              <p>
                Click on the calendar date chip in the top search bar to specify your desired start
                and end dates. The catalog updates to show pieces that are available for that exact
                window.
              </p>
              <p>
                Always confirm your pickup and return schedule with the lender in chat before
                finalizing your rental plans.
              </p>
            </div>
          </details>

          <details className="faq-item">
            <summary className="faq-question">How do I contact the lender?</summary>
            <div className="faq-answer">
              <p>
                On any listing page, tap &ldquo;Message lender&rdquo; to start a direct in-app
                conversation. You can ask questions about fit, fabric care, accessories included,
                and mutually convenient meeting times.
              </p>
              <p>
                Always keep all conversations inside Dzirent messaging for your safety and record.
              </p>
            </div>
          </details>

          <details className="faq-item">
            <summary className="faq-question">How do in-person meetups work?</summary>
            <div className="faq-answer">
              <p>
                Rentals are exchanged directly in person between community members. When planning a
                meetup:
              </p>
              <ul>
                <li>Meet during daylight hours in a busy, well-lit public location (such as a local cafe, library, or shopping plaza).</li>
                <li>Inspect the garment together at pickup and at return to verify condition, zippers, seams, and cleanliness.</li>
                <li>Never share private home addresses or personal financial credentials in chat.</li>
              </ul>
              <p>
                Read our full{" "}
                <Link href="/safety" className="accent">
                  Trust & Safety Guide
                </Link>{" "}
                for detailed meetup advice.
              </p>
            </div>
          </details>

          <details className="faq-item">
            <summary className="faq-question">How are security deposits handled?</summary>
            <div className="faq-answer">
              <p>
                Security deposits on Dzirent are peer-to-peer arrangements agreed directly between
                the lender and borrower (for example, through peer payment apps or cash upon handoff).
                Dzirent does not hold escrow funds.
              </p>
              <p>
                Lenders clearly state the replacement value and any deposit requirement in the
                listing or chat. When the garment is returned in its agreed condition at the end of
                the rental period, the lender returns the deposit immediately.
              </p>
            </div>
          </details>
        </div>
      </section>

      <section id="lending" className="faq-section">
        <h2 className="faq-section-title">3. Lending</h2>
        <div className="faq-list">
          <details className="faq-item">
            <summary className="faq-question">How do I list a piece from my closet?</summary>
            <div className="faq-answer">
              <p>
                When signed in, click &ldquo;List a piece&rdquo; (+) in the top navigation bar. Fill
                out the piece title, description, category, size, style, garment silhouette,
                replacement value, and daily rental price.
              </p>
              <p>
                Upload clear front and back photos of the garment. Once uploaded, automated photo
                checks verify the images before your listing goes live.
              </p>
            </div>
          </details>

          <details className="faq-item">
            <summary className="faq-question">
              What are photo checks and what do the verdicts mean?
            </summary>
            <div className="faq-answer">
              <p>
                Every uploaded photo is checked automatically for catalog quality, safety, and
                authenticity. The check gives one of three results:
              </p>
              <ul>
                <li>
                  <strong>Allowed:</strong> The photos show an item we list. The piece can be
                  published.
                </li>
                <li>
                  <strong>Under review:</strong> The check wasn&apos;t sure, the photo matches another
                  listing, or the piece has a hood. A person at Dzirent looks at it, and the app
                  tells you why.
                </li>
                <li>
                  <strong>Not allowed:</strong> The item is one we don&apos;t list (such as everyday
                  basics or footwear), or the photo shows nudity or sexual content. The app tells you
                  the reason, and you can replace the photos.
                </li>
              </ul>
            </div>
          </details>

          <details className="faq-item">
            <summary className="faq-question">Are photos of people wearing the clothes allowed?</summary>
            <div className="faq-answer">
              <p>
                Yes! Photos of the garment being worn by a person, modeled on a dress form, or hung
                neatly on a hanger are completely acceptable.
              </p>
              <p>
                Please ensure the photos remain tasteful, respectful, well-lit, and focused on the
                piece itself, in accordance with our{" "}
                <Link href="/community-guidelines" className="accent">
                  Community Guidelines
                </Link>
                .
              </p>
            </div>
          </details>

          <details className="faq-item">
            <summary className="faq-question">What items are allowed and prohibited?</summary>
            <div className="faq-answer">
              <p>
                <strong>Allowed items:</strong> Clean, authentic outerwear, evening gowns, suits,
                everyday dresses, separates, cultural wear, and select accessories (handbags,
                sunglasses, ties, non-smart watches, costume jewelry, belt buckles).
              </p>
              <p>
                <strong>Prohibited items:</strong> Underwear, intimate apparel, swimwear, shoes or
                footwear, counterfeit items, soiled or damaged goods, and items restricted by law.
                See our{" "}
                <Link href="/community-guidelines" className="accent">
                  Community Guidelines
                </Link>{" "}
                for the full list.
              </p>
            </div>
          </details>

          <details className="faq-item">
            <summary className="faq-question">How do I pause or delete my listing?</summary>
            <div className="faq-answer">
              <p>
                Navigate to &ldquo;My closet&rdquo; via the hanger icon in the top bar. You can view
                all your active pieces, edit their details, or pause availability whenever you are
                away or wearing the piece yourself.
              </p>
              <p>
                You can permanently delete any listing as long as there are no active or pending
                rental reservations associated with it.
              </p>
            </div>
          </details>
        </div>
      </section>

      <section id="fit-measurements" className="faq-section">
        <h2 className="faq-section-title">4. Fit & measurements</h2>
        <div className="faq-list">
          <details className="faq-item">
            <summary className="faq-question">How does fit matching work?</summary>
            <div className="faq-answer">
              <p>
                Fit matching analyzes garment silhouettes, stated manufacturer sizes, and optional
                body measurements you choose to save. When you view pieces, Dzirent highlights
                items marked &ldquo;Likely to fit you&rdquo; to reduce sizing uncertainty before you
                meet up.
              </p>
            </div>
          </details>

          <details className="faq-item">
            <summary className="faq-question">Are my body measurements private?</summary>
            <div className="faq-answer">
              <p>
                <strong>Yes, absolutely.</strong> Your body measurements (chest, waist, hips,
                shoulder, height, inseam) are strictly private.
              </p>
              <p>
                They are never displayed on your public profile, never shared with lenders, and
                never visible to any other member of the community. They are used solely on your
                behalf to calculate sizing suggestions.
              </p>
            </div>
          </details>

          <details className="faq-item">
            <summary className="faq-question">
              How does measurements consent work, and how can I withdraw it?
            </summary>
            <div className="faq-answer">
              <p>
                Before you save any body measurements for the first time, Dzirent asks for your
                explicit consent.
              </p>
              <p>
                You can withdraw your consent at any time:
              </p>
              <ol>
                <li>Go to Profile & settings &gt; Measurements consent.</li>
                <li>Click &ldquo;Withdraw consent&rdquo;.</li>
                <li>Confirm &ldquo;Withdraw and delete&rdquo;.</li>
              </ol>
              <p>
                Withdrawing consent immediately and permanently deletes your saved body
                measurements, and pauses &ldquo;Likely to fit you&rdquo; until you choose to enter
                measurements again.
              </p>
            </div>
          </details>
        </div>
      </section>

      <section id="account-privacy" className="faq-section">
        <h2 className="faq-section-title">5. Account & privacy</h2>
        <div className="faq-list">
          <details className="faq-item">
            <summary className="faq-question">How do I edit my profile?</summary>
            <div className="faq-answer">
              <p>
                Click on the account icon in the top right bar and choose &ldquo;Profile &
                settings&rdquo;. From there you can update your name, bio, home city, preferred
                distance units (miles or kilometers), and style interests.
              </p>
            </div>
          </details>

          <details className="faq-item">
            <summary className="faq-question">How do I block or report another user?</summary>
            <div className="faq-answer">
              <p>
                If a member behaves inappropriately, sends unsolicited messages, or violates
                community rules, you can report them from their profile or message thread.
              </p>
              <p>
                You can also block members to prevent them from contacting you or seeing your
                listings. If you need immediate assistance with a safety matter, please reach out to
                our support team at{" "}
                <Link href="/support" className="accent">
                  Support
                </Link>
                .
              </p>
            </div>
          </details>

          <details className="faq-item">
            <summary className="faq-question">How do I delete my account?</summary>
            <div className="faq-answer">
              <p>
                You can delete your account at any time by visiting our{" "}
                <Link href="/delete-account" className="accent">
                  Delete Account
                </Link>{" "}
                page or through Settings.
              </p>
              <p>
                Account deletion permanently removes your profile, listings, saved items,
                measurements, and your record of agreeing to the terms, as described in our{" "}
                <Link href="/privacy" className="accent">
                  Privacy Policy
                </Link>
                .
              </p>
            </div>
          </details>

          <details className="faq-item">
            <summary className="faq-question">Can I download a copy of my data?</summary>
            <div className="faq-answer">
              <p>
                Yes. In the app, go to Settings &gt; Privacy &amp; safety &gt; Download my data. On
                the website, go to Profile &amp; settings &gt; Settings, then Privacy &amp; safety
                &gt; Download my data. You get one file with your account, profile, measurements,
                listings and photos, chats, saved pieces and more. Other people appear in it only by
                their name and studio handle.
              </p>
              <p>
                You can download your data once a day. If something is missing, contact us at{" "}
                <Link href="/support" className="accent">
                  Support
                </Link>
                .
              </p>
            </div>
          </details>
        </div>
      </section>

      <section id="safety" className="faq-section">
        <h2 className="faq-section-title">6. Safety</h2>
        <div className="faq-list">
          <details className="faq-item">
            <summary className="faq-question">Where can I find complete safety tips?</summary>
            <div className="faq-answer">
              <p>
                Community trust and personal safety are central to Dzirent. We have prepared an
                in-depth guide with recommendations for choosing meetup spots, inspecting items,
                safeguarding high-value garments, and resolving disputes.
              </p>
              <p>
                Please read the full guide here:{" "}
                <Link href="/safety" className="accent" style={{ fontWeight: 600 }}>
                  Dzirent Trust & Safety Guide &rarr;
                </Link>
              </p>
            </div>
          </details>
        </div>
      </section>
    </LegalLayout>
  );
}
