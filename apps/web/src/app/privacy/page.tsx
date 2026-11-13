// apps/web/src/app/privacy/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout, LegalPlaceholder } from "@/components/legal-layout";
import { LEGAL_CONFIG } from "@/content/legal/config";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Dzirent collects, uses, protects, and handles your personal data.",
};

const toc = [
  { id: "overview", label: "1. Overview & Philosophy" },
  { id: "what-we-collect", label: "2. What We Collect and Why" },
  { id: "location", label: "3. Approximate Location & Rounding" },
  { id: "photos", label: "4. Photos & Image Analysis" },
  { id: "measurements", label: "5. Private Body Measurements" },
  { id: "cookies", label: "6. Cookies & Browser Storage" },
  { id: "who-sees-what", label: "7. Who Can See Your Information" },
  { id: "outside-services", label: "8. Outside Service Providers" },
  { id: "no-tracking-no-ads", label: "9. No Ads, No Tracking, No Selling" },
  { id: "retention", label: "10. Data Retention" },
  { id: "deletion", label: "11. Account Deletion & What Remains" },
  { id: "display-names", label: "12. Display Names on Public Listings" },
  { id: "your-rights", label: "13. Your Rights & Choices" },
  { id: "children", label: "14. Age Requirement (18+)" },
  { id: "security", label: "15. Security Safeguards" },
  { id: "changes", label: "16. Policy Updates & Contact" },
];

export default function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      subtitle="We believe peer-to-peer clothing rental should be respectful, transparent, and private. Here is an honest, plain-English breakdown of what data we collect, why we collect it, and how it is handled."
      version={LEGAL_CONFIG.PRIVACY_VERSION}
      effectiveDate={
        <LegalPlaceholder
          name="EFFECTIVE_DATE_PRIVACY"
          label="effective date"
        />
      }
      lastUpdated="November 7, 2026"
      toc={toc}
    >
      <section id="overview">
        <h2>1. Overview & Philosophy</h2>
        <p>
          {LEGAL_CONFIG.BRAND_NAME} is operated by{" "}
          <LegalPlaceholder
            name="COMPANY_LEGAL_NAME"
            label="company legal name"
          />
          {" ("}
          <LegalPlaceholder
            name="COMPANY_ENTITY_TYPE"
            label="entity type, e.g. a limited liability company"
          />
          {")"}. We connect neighbors to share fine clothing, occasion wear,
          and statement accessories.
        </p>
        <p>
          We collect as little as we can. We do not track you across the web, we
          do not show advertising, we do not sell your personal information, and
          we do not use analytics trackers. Guests can browse everything without
          creating an account. When you sign up or list an item, we collect only
          what is needed to run the service safely.
        </p>
      </section>

      <section id="what-we-collect">
        <h2>2. What We Collect and Why</h2>
        <p>
          Depending on how you use {LEGAL_CONFIG.BRAND_NAME}, we collect the
          following categories of information:
        </p>

        <h3>Account and Sign-In Information</h3>
        <ul>
          <li>
            <strong>Email address:</strong> Used to create your account, sign you
            in, and deliver essential account emails such as password resets.
          </li>
          <li>
            <strong>Password:</strong> Your password is protected with one-way
            encryption, so no one, including us, can read it.
          </li>
          <li>
            <strong>Adult confirmation:</strong> Your confirmation that you are
            at least 18 years old.
          </li>
          <li>
            <strong>Age check:</strong> In some states, we use your app
            store&apos;s age check to confirm you are 18 or older. We keep only
            the answer (18 or older, under 18, or no answer), where it came from
            (your app store or your own confirmation), and when. We never ask for
            or store your birthdate.
          </li>
          <li>
            <strong>Terms acceptance:</strong> Which version of the Terms of Use
            and Privacy Policy you agreed to, and when.
          </li>
          <li>
            <strong>Sign-in records:</strong> When you sign in, we keep your IP
            address, the browser or app you used, and the time, to keep you
            signed in and to spot misuse.
          </li>
        </ul>

        <h3>Profile and Studio Information</h3>
        <ul>
          <li>
            <strong>Display name:</strong> Used in direct messages, notification
            titles, and as your lender name on public listing cards if you have
            not created a studio name.
          </li>
          <li>
            <strong>Role:</strong> Whether you participate as a renter, lender,
            or both.
          </li>
          <li>
            <strong>Studio details (lenders):</strong> Studio name, handle,
            short bio, style tags (such as Occasion, Cultural, or Maternity),
            general neighborhood pickup area, and the month and year your account
            was created (&ldquo;Since Mon YYYY&rdquo;).
          </li>
        </ul>

        <h3>Messages and Rentals</h3>
        <ul>
          <li>
            <strong>In-app conversations:</strong> Messages between renters and
            lenders about sizing, dates, pickup, and return. They are stored on
            our server so both people can read them, and Dzirent staff can read
            them when handling a report.
          </li>
          <li>
            <strong>Rental records:</strong> Each rental request and its
            dates, the price per day, number of days and total shown when it
            was requested, and every step after it (accepted, declined,
            cancelled with the reason given, picked up, returned, completed),
            with who took it and when. Older records may also hold a
            post-rental answer (&ldquo;did the rental happen?&rdquo;).
          </li>
          <li>
            <strong>Condition photos:</strong> At pickup and at return, the
            lender adds photos of the piece, and the renter may add theirs.
            These photos are private: only the two people in that rental can
            see them, and Dzirent staff when they handle a report about it.
            They are never shown in the shop or on a listing. They are kept
            for{" "}
            <LegalPlaceholder
              name="DATA_RETENTION"
              label="condition photo retention period (currently 1 year after the rental ends, pending attorney review)"
            />
            .
          </li>
          <li>
            <strong>Saved items:</strong> The pieces and studios you choose to
            bookmark.
          </li>
        </ul>

        <h3>Accessory and Listing Attestations</h3>
        <ul>
          <li>
            <strong>Accessory declarations:</strong> Before listing accessories
            (such as watches, sunglasses, or costume jewelry), lenders sign a
            declaration. We record your full legal name, email address, city, IP
            address, the browser or app you used, and the time, to deter
            counterfeits and confirm lawful ownership.
          </li>
        </ul>

        <h3>Reports You Make</h3>
        <ul>
          <li>
            <strong>Reports:</strong> When you report a listing, a person, or a
            message, we keep your reason and details, and we save a copy of what
            you reported as it was at that moment. For a message, that copy
            includes a few messages before and after it in that chat, so the
            report still makes sense if the original is edited or deleted.
          </li>
        </ul>

        <h3>Notifications (Android app)</h3>
        <ul>
          <li>
            <strong>Notification registration:</strong> If you use our Android
            app, your phone is registered for notifications so we can tell you
            about new messages, date changes, rental requests and answers, and
            completed rentals. Our notification provider
            delivers them for us, and its software in the app sends the provider
            an identifier for the app installation and delivery details.
          </li>
          <li>
            <strong>Rental reminders:</strong> The day before a pickup or a
            return, and once a day for up to 3 days when a return is overdue,
            both people in the rental get a reminder. Turn them off in
            Settings &gt; Notifications (&ldquo;Rental reminders&rdquo;). There
            are no reminders between people who have blocked each other.
          </li>
          <li>
            <strong>Safe notification text:</strong> Notifications never include
            phone numbers, email addresses, street addresses, map links, or
            coordinates, even if a message contains them.
          </li>
        </ul>

        <h3>Server Logs</h3>
        <ul>
          <li>
            Like almost all internet services, the providers that host Dzirent
            automatically record standard access logs: your IP address, the
            browser or app you used, the page or action requested, and the
            time. We use these logs only for security, fraud prevention, and
            fixing problems.
          </li>
        </ul>
      </section>

      <section id="location">
        <h2>3. Approximate Location & Rounding</h2>
        <p>
          {LEGAL_CONFIG.BRAND_NAME} connects people locally. Because proximity
          matters, we calculate distance between renters and pieces, but we take
          deliberate precautions to safeguard your privacy:
        </p>
        <div className="legal-callout">
          <p>
            <strong>Location is always rounded before it is saved:</strong> If
            you allow your phone&apos;s or browser&apos;s location service, we
            round your position to about 1 kilometer (0.6 miles) before saving
            it. The point we keep can be up to about half a mile from where you
            really are.
          </p>
        </div>
        <ul>
          <li>
            <strong>Distance only:</strong> Other people never see your location
            or a pin on a map. They see only your city (&ldquo;City, ST&rdquo;)
            and a distance in whole miles (for example &ldquo;3 miles
            away&rdquo;).
          </li>
          <li>
            <strong>No location service needed:</strong> You can type your city
            instead, and we use the center of that city.
          </li>
          <li>
            <strong>Approximate only:</strong> Our apps ask your phone only for
            an approximate location, only while you use them. We never ask for
            precise or background location.
          </li>
        </ul>
      </section>

      <section id="photos">
        <h2>4. Photos & Image Analysis</h2>
        <p>
          Listing photos are essential for renters to inspect clothing quality,
          cut, and condition. Here is how photos are processed:
        </p>

        <h3>Hidden Photo Information Is Removed</h3>
        <p>
          Photos carry hidden information from the camera, such as the GPS
          location where they were taken. When you pick or take a photo in the{" "}
          {LEGAL_CONFIG.BRAND_NAME} website or apps, we make a fresh copy of
          the image before it is uploaded, and that copy carries none of it.
        </p>

        <h3>Listing Photos Are Public</h3>
        <p>
          Listing photos are public: anyone with the direct web link can view
          them, which is what lets guests browse quickly. Photo links are
          random and never contain your account, email, or name.
        </p>

        <h3>Automatic Photo Checks</h3>
        <p>
          To keep the catalog to our rules and protect against scams, every
          listing photo is checked automatically by our photo-check service,
          which uses open-source image models:
        </p>
        <ul>
          <li>
            <strong>What it is:</strong> Whether the piece is clothing or an
            accessory we list, and not a prohibited item (such as everyday
            basics or underwear).
          </li>
          <li>
            <strong>Photo safety:</strong> Nudity or sexual content is not
            allowed. A photo of someone wearing the piece is fine.
          </li>
          <li>
            <strong>Photo quality:</strong> Lighting, blur, and framing, to
            suggest improvements to the lender. Quality never rejects a listing.
          </li>
          <li>
            <strong>Copied photos:</strong> The check keeps a numerical summary
            of what each photo looks like and compares it with other listings to
            catch copied or stolen photos.{" "}
            <strong>
              This describes the garment, not a person. It is not biometric data
              or a facial recognition template.
            </strong>
          </li>
        </ul>
        <p>
          The photo-check service keeps no copies of your photos. When the
          check isn&apos;t sure, a person at Dzirent looks at the photos.
        </p>
      </section>

      <section id="measurements">
        <h2>5. Private Body Measurements</h2>
        <p>
          To help you find clothes that fit, you may save your body measurements
          (chest, waist, hips, shoulder, height, and inseam) and fit
          preferences. We ask for your consent before the first save.
        </p>
        <div className="legal-callout">
          <p>
            <strong>Your measurements are strictly private:</strong> They are
            never shown to lenders, never on your public profile, and never
            included when others browse. We use them only to mark pieces
            &ldquo;Likely to fit you&rdquo; by comparing them with the garment
            measurements lenders provide.
          </p>
        </div>
        <p>
          You can change or clear your measurements at any time in Profile
          &amp; Settings. Withdrawing your consent there deletes them.
        </p>
      </section>

      <section id="cookies">
        <h2>6. Cookies & Browser Storage</h2>
        <p>
          The website stores a few things in your browser. All of them are ours
          and are used only to make the site work for you. There are no
          advertising cookies and no tracking across other sites.
        </p>
        <ul>
          <li>
            <strong>Essential:</strong> Keep you signed in and keep the site
            secure. Needed for the site to work. They last until you sign out.
          </li>
          <li>
            <strong>Preferences:</strong> Remember your choices, such as theme,
            units, your city, and your rental dates. They last up to a year.
          </li>
          <li>
            <strong>Drafts and reminders:</strong> Save an unfinished listing on
            this device, and remember messages you&apos;ve dismissed, such as the
            welcome note and safety tips. They last until you clear your browser.
          </li>
        </ul>
      </section>

      <section id="who-sees-what">
        <h2>7. Who Can See Your Information</h2>
        <ul>
          <li>
            <strong>Guests &amp; the Public:</strong> Anyone visiting the site
            can see active listings, garment measurements, prices, city name,
            distance in miles, rental availability, and studio profiles (or the
            display name of a lender without a studio). Guests cannot see your
            email, body measurements, exact location, or chat messages.
          </li>
          <li>
            <strong>Other Users in Chat:</strong> When you start a conversation,
            the other participant sees your display name, requested dates, and
            chat messages.
          </li>
          <li>
            <strong>Lenders &amp; Renters:</strong> Do not receive each
            other&apos;s personal contact information or private measurements.
            Pickup and return arrangements are coordinated directly in in-app
            chat.
          </li>
          <li>
            <strong>Dzirent staff:</strong> A few people at Dzirent can see
            reports (with the messages, listing, or profile they are about),
            photos waiting for review, and account details, to handle reports and
            keep the service running. They must sign in with two-step
            verification, and every action they take is recorded.
          </li>
        </ul>
      </section>

      <section id="outside-services">
        <h2>8. Outside Service Providers</h2>
        <p>
          A few trusted service providers help us run {LEGAL_CONFIG.BRAND_NAME}:
          they host our database and photos, run our website, check listing
          photos, and send app notifications. They handle data only to run
          Dzirent for us, in the United States.
        </p>
      </section>

      <section id="no-tracking-no-ads">
        <h2>9. No Ads, No Tracking, No Selling</h2>
        <p>
          We believe in straightforward software. Our revenue model is based on
          facilitating peer-to-peer wardrobe sharing, not monetizing your
          attention or personal life:
        </p>
        <ul>
          <li>We do <strong>not</strong> sell your personal data to anyone.</li>
          <li>We do <strong>not</strong> rent or trade personal information with data brokers.</li>
          <li>We do <strong>not</strong> partner with advertising networks or participate in cross-context behavioral tracking.</li>
          <li>We do <strong>not</strong> put tracking pixels, social media buttons, or marketing analytics on our pages or in our apps.</li>
        </ul>
      </section>

      <section id="retention">
        <h2>10. Data Retention</h2>
        <p>
          We retain your information according to the following principles:
        </p>
        <ul>
          <li>
            <strong>Active accounts:</strong> Your profile, listings, messages,
            and saved pieces remain accessible while your account is active, or
            until you remove them.
          </li>
          <li>
            <strong>Deleted listings:</strong> When you delete a listing, the
            listing, its garment measurements, its dates, and its photo files
            are permanently removed. A deleted photo may stay reachable at its
            old link for a short time afterwards (how long:{" "}
            <LegalPlaceholder
              name="DATA_RETENTION"
              label="how long a deleted photo can stay reachable"
            />
            ).
          </li>
          <li>
            <strong>Reports:</strong> A report and the copy of what was reported
            are kept after the report is closed for{" "}
            <LegalPlaceholder
              name="DATA_RETENTION"
              label="report retention period (currently 2 years, pending attorney review)"
            />
            , even if the reporter or the reported person deletes their account.
          </li>
          <li>
            <strong>Server logs:</strong> Access logs (including IP addresses and
            what was requested) are kept for security and troubleshooting for a
            limited period{" "}
            <LegalPlaceholder
              name="DATA_RETENTION"
              label="server log retention period"
            />
            , then expire automatically.
          </li>
          <li>
            <strong>Backups:</strong> Copies of our database are kept for
            disaster recovery for{" "}
            <LegalPlaceholder
              name="DATA_RETENTION"
              label="backup retention period"
            />
            .
          </li>
        </ul>

        <h3>Automatic Clean-ups</h3>
        <p>
          Every night, automatic clean-ups remove information we no longer
          need:
        </p>
        <ul>
          <li>
            <strong>Unfinished listings:</strong> a listing you started but
            never published is deleted, with its photos, once you haven&apos;t
            changed it for 60 days.
          </li>
          <li>
            <strong>Stray photos:</strong> a photo file that isn&apos;t part of
            any listing is deleted after a day.
          </li>
          <li>
            <strong>Photo checks:</strong> we keep the latest check of each
            listing. Older checks are deleted after 90 days.
          </li>
          <li>
            <strong>Data downloads:</strong> the record of when you downloaded
            your data is kept for 30 days.
          </li>
          <li>
            <strong>Age checks:</strong> we keep only your latest age check, and
            the one that decides whether the account can be used.
          </li>
          <li>
            <strong>Suggestion choices:</strong> whether you kept or changed the
            suggestions filled in from your photos is kept for one year.
          </li>
          <li>
            <strong>Notifications:</strong> a phone&apos;s notification
            registration is removed when that phone hasn&apos;t opened the app
            for 90 days.
          </li>
          <li>
            <strong>Accessory and listing declarations:</strong> kept for{" "}
            <LegalPlaceholder
              name="DATA_RETENTION"
              label="declaration retention period (currently 7 years, pending attorney review)"
            />
            , then deleted.
          </li>
          <li>
            <strong>Reports:</strong> deleted when the report retention period
            above ends.
          </li>
          <li>
            <strong>Condition photos:</strong> deleted{" "}
            <LegalPlaceholder
              name="DATA_RETENTION"
              label="condition photo retention period (currently 1 year after the rental ends, pending attorney review)"
            />
            , and as soon as their rental no longer exists.
          </li>
        </ul>
        <p>
          We are switching these clean-ups on one at a time. Until a clean-up is
          on, that information is kept as the rest of this policy describes.
          Records of what our staff did, and copyright takedown requests, are
          kept and not cleaned up.
        </p>
      </section>

      <section id="deletion">
        <h2>11. Account Deletion &amp; What Remains</h2>
        <p>
          You have full control over your account. You can permanently delete your
          account at any time through our apps or directly on our public{" "}
          <Link href="/delete-account">Account Deletion Page</Link>.
        </p>

        <h3>What Is Immediately Deleted</h3>
        <p>
          When you confirm account deletion:
        </p>
        <ul>
          <li>Your account, email address, and sign-in details are deleted.</li>
          <li>Your profile, display name, handle, bio, and studio information are deleted.</li>
          <li>Your private body measurements and style interests are deleted.</li>
          <li>All your listings, garment measurements, and availability dates are deleted.</li>
          <li>
            All photos you uploaded are permanently removed (a deleted photo may
            stay reachable at its old link for a short time afterwards; how long:{" "}
            <LegalPlaceholder
              name="DATA_RETENTION"
              label="how long a deleted photo can stay reachable"
            />
            ).
          </li>
          <li>Your phone is no longer registered for notifications.</li>
          <li>Your saved pieces and studios, your terms acceptance, your age checks, and any warnings on your account are deleted.</li>
        </ul>

        <div className="legal-callout">
          <p>
            <strong>Important notice regarding conversation history:</strong>{" "}
            Because conversations and rental records are linked between two
            parties, deleting your account also deletes the associated message
            threads and rental records for both you and the other participant.
          </p>
        </div>

        <h3>What Remains After Deletion</h3>
        <ul>
          <li>
            <strong>Accessory declarations:</strong> If you signed an accessory
            declaration, that record (your legal name, email, city, IP address,
            and the time) is kept to deter counterfeits and for legal purposes,
            no longer linked to an account, for{" "}
            <LegalPlaceholder
              name="DATA_RETENTION"
              label="declaration retention period"
            />
            .
          </li>
          <li>
            <strong>Reports:</strong> Reports you made, and reports about you,
            are kept with the copy of what was reported for{" "}
            <LegalPlaceholder
              name="DATA_RETENTION"
              label="report retention period (currently 2 years, pending attorney review)"
            />{" "}
            after they are closed. Your name is removed from them.
          </li>
          <li>
            <strong>Server logs:</strong> Access logs recorded before your
            deletion stay for a limited period{" "}
            <LegalPlaceholder
              name="DATA_RETENTION"
              label="server log retention period"
            />{" "}
            before expiring.
          </li>
          <li>
            <strong>Records of Dzirent&apos;s own actions:</strong> If Dzirent
            staff acted on a report about you, the record of that action is kept.
          </li>
        </ul>
      </section>

      <section id="display-names">
        <h2>12. Display Names on Public Listings</h2>
        <p>
          When you list a piece on {LEGAL_CONFIG.BRAND_NAME}, renters need to
          know who is offering the garment:
        </p>
        <ul>
          <li>
            If you create a <strong>Studio Name</strong> (e.g. &ldquo;Atelier
            Elena&rdquo;), your studio name and handle are shown on your listing
            cards and studio page.
          </li>
          <li>
            If you do not create a studio name, your account{" "}
            <strong>Display Name</strong> is displayed to guests and renters on
            your listing cards as the lender identifier.
          </li>
        </ul>
        <p>
          You can adjust your display name or set up a dedicated studio name at
          any time in your Profile &amp; Settings.
        </p>
      </section>

      <section id="your-rights">
        <h2>13. Your Rights &amp; Choices</h2>
        <p>
          Depending on where you live (including under the Texas Data Privacy and
          Security Act and other state privacy laws), you have specific rights
          regarding your personal information:
        </p>
        <ul>
          <li>
            <strong>Access and View:</strong> You can see all your profile data,
            measurements, listings, messages, and saved items directly inside the
            app.
          </li>
          <li>
            <strong>Correction:</strong> You can edit and update your name,
            measurements, city, role, and listings at any time.
          </li>
          <li>
            <strong>Deletion:</strong> You can delete any listing, photo, or
            measurement, or delete your entire account through Settings or at{" "}
            <Link href="/delete-account">our account deletion page</Link>.
          </li>
          <li>
            <strong>Download Your Data:</strong> You can download one file with the
            information we keep about you, in the app under Settings &gt; Privacy
            &amp; safety &gt; Download my data, or on the website under Profile
            &amp; settings &gt; Settings &gt; Privacy &amp; safety. It works once a
            day. Other people appear in it only by their name and studio handle.
          </li>
          <li>
            <strong>Notification Controls:</strong> You can disable push
            notifications on your phone or toggle &ldquo;Show message text&rdquo;
            off in Settings &gt; Notifications.
          </li>
          <li>
            <strong>Privacy Inquiries &amp; Appeals:</strong> To exercise your
            rights or appeal a decision, contact our support team at{" "}
            <a href={`mailto:${LEGAL_CONFIG.SUPPORT_EMAIL}`}>
              {LEGAL_CONFIG.SUPPORT_EMAIL}
            </a>
            .
          </li>
        </ul>
      </section>

      <section id="children">
        <h2>14. Age Requirement (18+)</h2>
        <p>
          {LEGAL_CONFIG.BRAND_NAME} is strictly intended for adults. You must be
          at least 18 years old to create an account, list clothing, or rent
          garments.
        </p>
        <p>
          Everyone confirms they are 18 or older when they sign up. In some
          states, we also use your app store&apos;s age check to confirm you are
          18 or older. We never ask for or store your birthdate. If your app
          store says you are under 18, your account can no longer be used,
          except to see your own information and delete the account.
        </p>
        <p>
          We do not knowingly collect personal data from children under 18. If we
          learn that an account belongs to a minor under 18 years of age, we will
          promptly suspend and delete the account and its associated data. Parents
          or guardians who believe their child has created an account may contact
          us at{" "}
          <a href={`mailto:${LEGAL_CONFIG.SUPPORT_EMAIL}`}>
            {LEGAL_CONFIG.SUPPORT_EMAIL}
          </a>
          .
        </p>
      </section>

      <section id="security">
        <h2>15. Security Safeguards</h2>
        <p>
          We take care of your information in these ways:
        </p>
        <ul>
          <li>
            <strong>Your data is yours:</strong> Each person can see and change
            only their own data. Guests see only what listings show publicly.
          </li>
          <li>
            <strong>Encrypted connections:</strong> Everything between your
            browser or app and Dzirent travels over an encrypted connection.
          </li>
          <li>
            <strong>Encrypted storage:</strong> Our providers encrypt the stored
            data, photos, and backups.
          </li>
          <li>
            <strong>Passwords:</strong> Your password is protected with one-way
            encryption, so no one, including us, can read it.
          </li>
          <li>
            <strong>Limited staff access:</strong> Only a few people at Dzirent
            have admin access. They must sign in with two-step verification, and
            every action they take is recorded.
          </li>
        </ul>
        <p>For your security, you are signed out after 30 days without using Dzirent.</p>
      </section>

      <section id="changes">
        <h2>16. Policy Updates &amp; Contact</h2>
        <p>
          We may update this Privacy Policy from time to time to reflect product
          improvements, new features, or evolving legal requirements. When we
          make meaningful changes, we will update the version number and effective
          date at the top of this page, and provide notice{" "}
          <LegalPlaceholder
            name="CHANGE_NOTICE"
            label="change notification method and notice period"
          />
          .
        </p>
        <p>
          If you have questions, feedback, or privacy requests, please reach out
          to us:
        </p>
        <ul>
          <li>
            <strong>Email &amp; Support:</strong>{" "}
            <a href={`mailto:${LEGAL_CONFIG.SUPPORT_EMAIL}`}>
              {LEGAL_CONFIG.SUPPORT_EMAIL}
            </a>
          </li>
          <li>
            <strong>Mailing Address:</strong>{" "}
            <LegalPlaceholder
              name="REGISTERED_ADDRESS"
              label="company registered postal address"
            />
          </li>
        </ul>
      </section>
    </LegalLayout>
  );
}
