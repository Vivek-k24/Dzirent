// apps/web/src/app/privacy/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout, LegalPlaceholder } from "@/components/legal-layout";
import { LEGAL_CONFIG } from "@/content/legal/config";

export const metadata: Metadata = {
  title: "Privacy Policy | Dzirent",
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
      lastUpdated="November 6, 2026"
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
          Our technical architecture is built around data minimization: we do
          not track you across the web, we do not run third-party advertising,
          we do not sell your personal information, and we do not use third-party
          analytics trackers. Guests can freely browse the shop window without
          creating an account. When you choose to sign up or list an item, we
          collect only what is genuinely needed to provide the service safely and
          reliably.
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
            <strong>Password:</strong> Encrypted and hashed using modern cryptographic
            algorithms by our authentication provider (Supabase Auth). We never
            see or store your plain-text password.
          </li>
          <li>
            <strong>Adult confirmation:</strong> An attestation confirming you are
            at least 18 years of age.
          </li>
          <li>
            <strong>Session records:</strong> Technical records of active sign-in
            sessions, including IP address, browser or client user agent, and
            timestamps, to keep you signed in securely.
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
            <strong>In-app conversations:</strong> Messages sent between renters
            and lenders to discuss sizing, dates, pickup, and return. Messages
            are stored as plain text on the server to deliver them to both
            participants.
          </li>
          <li>
            <strong>Rental records:</strong> Requested date ranges, status
            updates (such as arranged or completed), and post-rental outcome
            answers (&ldquo;did the rental happen?&rdquo;).
          </li>
          <li>
            <strong>Saved items:</strong> The pieces and studios you choose to
            bookmark.
          </li>
        </ul>

        <h3>Accessory and Listing Attestations</h3>
        <ul>
          <li>
            <strong>Legal declarations:</strong> When lenders list items in our
            approved accessory categories (such as fine watches, sunglasses, or
            costume jewelry), we record an attestation including full legal name,
            email address, city, IP address, user agent, and session ID to deter
            counterfeits and confirm lawful ownership.
          </li>
        </ul>

        <h3>Push Notification Tokens & Firebase SDKs</h3>
        <ul>
          <li>
            <strong>Device tokens:</strong> If you use our Android mobile app, a
            Firebase Cloud Messaging (FCM) device token is registered so our server
            can notify you of new messages or date adjustments.
          </li>
          <li>
            <strong>Firebase SDK data:</strong> The Android app includes the
            Google Firebase Messaging, Firebase Installations, and Firebase
            DataTransport SDKs. These SDKs collect anonymous app installation
            identifiers and message delivery metadata required to route push
            notifications reliably.
          </li>
          <li>
            <strong>Safe notification text:</strong> Our notification delivery
            pipeline automatically scrubs phone numbers, email addresses, street
            addresses, map links, and coordinates from push notification
            payloads.
          </li>
        </ul>

        <h3>Server Access Logs</h3>
        <ul>
          <li>
            Like almost all internet services, our infrastructure providers
            (Supabase, Vercel, and Cloudflare) automatically record standard
            HTTP request logs. These logs capture your IP address, browser user
            agent, request path, timestamp, and status code. These logs are used
            strictly for system security, fraud detection, and diagnosing
            operational errors.
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
            <strong>Location is always rounded before storage:</strong> Whenever
            you grant device location permission or pick a city, your coordinates
            are rounded to 2 decimal places (about 0.01&deg;, or roughly 1 km /
            0.6 miles). The point saved on the server is up to 2,400 feet away
            from your real position.
          </p>
        </div>
        <ul>
          <li>
            <strong>Distance only:</strong> Other users never see your coordinates
            or an exact pin on a map. They see only the city name (&ldquo;City,
            ST&rdquo;) and calculated distance in whole miles (e.g. &ldquo;3
            miles away&rdquo;).
          </li>
          <li>
            <strong>City selection without GPS:</strong> You do not need to share
            your device GPS. You can always type your city name to select the
            geographic center of that city from our public US cities directory.
          </li>
          <li>
            <strong>Coarse permissions:</strong> Our mobile apps request only
            coarse / approximate location permissions from Android and iOS. We
            never request precise, background, or continuous GPS tracking.
          </li>
        </ul>
      </section>

      <section id="photos">
        <h2>4. Photos & Image Analysis</h2>
        <p>
          Listing photos are essential for renters to inspect clothing quality,
          cut, and condition. Here is how photos are processed:
        </p>

        <h3>Automatic Removal of EXIF and GPS Metadata</h3>
        <p>
          When you pick or take a photo inside the {LEGAL_CONFIG.BRAND_NAME} web
          or mobile apps, our client-side software redraws the image (via web
          canvas, Android Bitmap, or iOS UIGraphics) before upload. This process
          completely strips camera metadata, including embedded GPS latitude and
          longitude coordinates and device serial numbers.
        </p>

        <h3>Public Photo Storage</h3>
        <p>
          Listing photos are stored in our public storage bucket with randomly
          generated file names (e.g. <code>listing-id/random-uuid.jpg</code>).
          Anyone with the direct web link can view the photo, which allows fast
          browsing for guests without server bottlenecks. Photo file names never
          contain your account ID, email, or real name.
        </p>

        <h3>Automated Photo Checks & Mathematical Fingerprints</h3>
        <p>
          To maintain catalog standards and protect against scams, uploaded
          photos are evaluated by our vision service running the open-source
          Marqo-FashionSigLIP model on Google Cloud Run:
        </p>
        <ul>
          <li>
            <strong>Policy checking:</strong> The model checks whether the garment
            belongs to an approved category and is not a prohibited item (such as
            everyday loungewear or underwear).
          </li>
          <li>
            <strong>Quality checks:</strong> The model evaluates lighting, blur,
            and framing to offer helpful listing suggestions to the lender.
          </li>
          <li>
            <strong>Mathematical image fingerprint:</strong> The service computes
            a 768-number numerical vector representing visual garment features.
            This fingerprint is compared against other listings to detect duplicate
            or stolen photos.{" "}
            <strong>
              This is a visual product descriptor, not biometric data or a facial
              recognition template.
            </strong>{" "}
            The vision service runs in temporary memory and does not retain photo
            files on disk.
          </li>
        </ul>
      </section>

      <section id="measurements">
        <h2>5. Private Body Measurements</h2>
        <p>
          To help renters find clothes that actually fit, you may optionally save
          your body measurements (chest, waist, hips, shoulder, height, and
          inseam) and fit preferences in your private profile.
        </p>
        <div className="legal-callout">
          <p>
            <strong>Your measurements are strictly private:</strong> They are
            never visible to lenders, never shown on your public profile, and
            never returned in browse queries. They are processed on our server
            solely to compute personalized fit match tags (&ldquo;Likely to fit
            you&rdquo;) by comparing your numbers with garment measurements
            provided by lenders.
          </p>
        </div>
        <p>
          You can edit, update, or clear your body measurements at any time in
          your Profile &amp; Settings.
        </p>
      </section>

      <section id="cookies">
        <h2>6. Cookies & Browser Storage</h2>
        <p>
          We use only first-party cookies and standard browser storage mechanisms
          necessary to keep you signed in, remember your preferences, and save
          local drafts. We do not use third-party advertising cookies or cross-site
          tracking scripts.
        </p>

        <div className="legal-table-wrapper">
          <table className="legal-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Type</th>
                <th>Purpose</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>sb-*-auth-token</code></td>
                <td>Cookie (Secure)</td>
                <td>Keeps you securely signed in to your account.</td>
                <td>Session / Login duration</td>
              </tr>
              <tr>
                <td><code>dzirent-location</code></td>
                <td>Cookie (HttpOnly)</td>
                <td>Remembers your approximate city and rounded coordinates for browsing.</td>
                <td>1 year</td>
              </tr>
              <tr>
                <td><code>dzirent-dates</code></td>
                <td>Cookie (HttpOnly)</td>
                <td>Remembers chosen rental dates while browsing pieces.</td>
                <td>1 year</td>
              </tr>
              <tr>
                <td><code>dzirent-welcome</code></td>
                <td>Cookie (HttpOnly)</td>
                <td>Ensures the introductory welcome modal is shown only once.</td>
                <td>1 year</td>
              </tr>
              <tr>
                <td><code>dzirent-auth-next</code></td>
                <td>Cookie (HttpOnly)</td>
                <td>Remembers destination page during email sign-up confirmation.</td>
                <td>1 hour</td>
              </tr>
              <tr>
                <td><code>dzirent-web-settings</code></td>
                <td>Cookie &amp; LocalStorage</td>
                <td>Saves theme preference (Light/Dark) and unit preferences (in/cm, mi/km).</td>
                <td>1 year</td>
              </tr>
              <tr>
                <td><code>dzirent-desktop-filter-panel</code></td>
                <td>LocalStorage</td>
                <td>Remembers whether the desktop filter sidebar is open or docked.</td>
                <td>Until cleared</td>
              </tr>
              <tr>
                <td><code>dzirent-safety-*</code></td>
                <td>LocalStorage</td>
                <td>Dismisses in-chat safety reminders once read.</td>
                <td>Until cleared</td>
              </tr>
              <tr>
                <td><code>dzirent-listing-drafts</code></td>
                <td>IndexedDB</td>
                <td>Saves unsubmitted listing drafts locally so you don&apos;t lose work if you refresh.</td>
                <td>Until cleared</td>
              </tr>
            </tbody>
          </table>
        </div>
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
            <strong>Platform Administrators:</strong> Designated staff can view
            user reports, moderation queues, and database records via secure
            administrative tools strictly for customer support, safety, and
            platform operation.
          </li>
        </ul>
      </section>

      <section id="outside-services">
        <h2>8. Outside Service Providers</h2>
        <p>
          We rely on reputable cloud and technology infrastructure providers to
          run {LEGAL_CONFIG.BRAND_NAME}. Each provider processes data on our
          behalf under strict security commitments:
        </p>

        <div className="legal-table-wrapper">
          <table className="legal-table">
            <thead>
              <tr>
                <th>Service Provider</th>
                <th>Role &amp; Data Received</th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Supabase</strong></td>
                <td>Primary database, authentication service, and photo file storage. Receives account records, listings, and encrypted passwords.</td>
                <td>AWS US West (Oregon, <code>us-west-2</code>) with Cloudflare global CDN</td>
              </tr>
              <tr>
                <td><strong>Vercel</strong></td>
                <td>Website hosting and serverless web rendering. Receives web requests, visitor IP addresses, and uploaded web assets in transit.</td>
                <td>Functions in Portland (<code>pdx1</code>) with global edge network</td>
              </tr>
              <tr>
                <td><strong>Google Cloud Run</strong></td>
                <td>Hosts our private photo-scanning service. Downloads public listing photo URLs into temporary memory to evaluate clothing categories and quality.</td>
                <td>Google Cloud US West (Oregon, <code>us-west1</code>)</td>
              </tr>
              <tr>
                <td><strong>Firebase Cloud Messaging (Google)</strong></td>
                <td>Delivers push notifications to Android devices. Receives push device tokens, notification titles, and conversation identifiers.</td>
                <td>United States (Google Cloud)</td>
              </tr>
              <tr>
                <td><strong>Google Play / Apple Location Services</strong></td>
                <td>On-device operating system location frameworks that provide approximate coordinates when permitted by the user.</td>
                <td>Processed locally on user device</td>
              </tr>
            </tbody>
          </table>
        </div>
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
          <li>We do <strong>not</strong> embed third-party tracking pixels, social media widgets, or marketing analytics scripts.</li>
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
            <strong>Deleted listings:</strong> When you delete a listing, its
            database entry, garment measurements, availability dates, and photo
            files in storage are permanently removed.
          </li>
          <li>
            <strong>Server logs:</strong> Standard server access logs (including
            IP addresses and request paths) are retained for operational
            troubleshooting and security auditing for a limited period{" "}
            <LegalPlaceholder
              name="DATA_RETENTION"
              label="server log retention period, e.g. 30 days"
            />
            , after which they expire automatically.
          </li>
          <li>
            <strong>Backup archives:</strong> Encrypted system database backups
            are maintained for disaster recovery for a standard rotation window{" "}
            <LegalPlaceholder
              name="DATA_RETENTION"
              label="database backup retention period"
            />
            .
          </li>
        </ul>
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
          <li>Your user account, email address, and authentication credentials are deleted.</li>
          <li>Your profile, display name, handle, bio, and studio information are deleted.</li>
          <li>Your private body measurements and style interests are deleted.</li>
          <li>All your listings, garment measurements, and availability schedules are deleted.</li>
          <li>All photo files you uploaded to Supabase Storage are permanently removed.</li>
          <li>Your push notification device tokens are revoked and deleted.</li>
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
            <strong>Legal Declarations:</strong> If you listed items requiring an
            accessory declaration or listing attestation, that legal record (legal
            name, email, timestamp, and IP address) is retained to comply with
            fraud prevention and legal audit requirements, with your user ID
            disassociated.
          </li>
          <li>
            <strong>Server Infrastructure Logs:</strong> Technical server access
            logs recorded prior to your deletion remain in rolling operational
            archives until their scheduled expiration.
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
            <Link href="/delete-account">/delete-account</Link>.
          </li>
          <li>
            <strong>Data Portability:</strong> We are building a dedicated
            self-service download tool. In the meantime, you can request an export
            of your data by contacting us.
          </li>
          <li>
            <strong>Notification Controls:</strong> You can disable push
            notifications on your phone or toggle &ldquo;Show message text&rdquo;
            off in Settings &gt; Notifications.
          </li>
          <li>
            <strong>Privacy Inquiries &amp; Appeals:</strong> To exercise your
            rights or appeal a decision, contact our privacy contact at{" "}
            <LegalPlaceholder
              name="PRIVACY_EMAIL"
              label="privacy email address"
              fallback={LEGAL_CONFIG.SUPPORT_EMAIL}
            />
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
          We do not knowingly collect personal data from children under 18. If we
          learn that an account belongs to a minor under 18 years of age, we will
          promptly suspend and delete the account and its associated data. Parents
          or guardians who believe their child has created an account may contact
          us at{" "}
          <LegalPlaceholder
            name="SUPPORT_EMAIL"
            label="support email address"
            fallback="support@dzirent.com"
          />
          .
        </p>
      </section>

      <section id="security">
        <h2>15. Security Safeguards</h2>
        <p>
          We employ robust technical and organizational security controls to
          protect your personal information:
        </p>
        <ul>
          <li>
            <strong>Database Row Level Security (RLS):</strong> Every table in
            our database is protected with PostgreSQL Row Level Security. Users
            can only read and write their own data; guests have zero access to
            raw database tables.
          </li>
          <li>
            <strong>Encryption in Transit:</strong> All web traffic and mobile API
            calls use industry-standard Transport Layer Security (TLS / HTTPS).
          </li>
          <li>
            <strong>Encryption at Rest:</strong> Database tables, storage buckets,
            and backup volumes are encrypted at rest by our cloud infrastructure
            providers.
          </li>
          <li>
            <strong>Access Restrictions:</strong> Administrative keys and vision
            service secrets are isolated in secure Vault storage with principle of
            least privilege access.
          </li>
        </ul>
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
            label="change notification method and notice period, e.g. via email or in-app notice 30 days prior"
          />
          .
        </p>
        <p>
          If you have questions, feedback, or privacy requests, please reach out
          to us:
        </p>
        <ul>
          <li>
            <strong>Email:</strong>{" "}
            <LegalPlaceholder
              name="PRIVACY_EMAIL"
              label="privacy email address"
              fallback={LEGAL_CONFIG.SUPPORT_EMAIL}
            />
          </li>
          <li>
            <strong>Support:</strong>{" "}
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
