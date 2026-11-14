# Legal placeholders

Every fill-in the website's legal pages (P1A part 2) will need. The pages will read them from one config, so each value is entered once. Values are blank on purpose: this repo is public, and none of them may be guessed.

Who fills:
- **Owner**: the business owner.
- **Attorney**: the owner's attorney (or tax adviser where it says so).
- **Owner + attorney**: the owner decides, the attorney checks the wording.
- **Engineering**: an agent fills it from `compliance.md` or the code; the owner confirms.

Pages: Privacy (privacy policy), Terms (terms of use), Rules (community rules and prohibited items), Copyright (copyright and DMCA), Safety (safety tips), Delete (delete-account page), Support (support and contact).

## 1. Company and contact

| Key | What it is, in plain words | Who fills | Used on | Value |
| --- | --- | --- | --- | --- |
| `COMPANY_LEGAL_NAME` | The company's exact legal name, as on its formation papers. It must match the developer name on Google Play and Apple (P8A, P8B) | Owner | All pages | |
| `COMPANY_ENTITY_TYPE` | What kind of company it is (for example a limited liability company) | Owner | Terms, Privacy | |
| `COMPANY_STATE_OF_FORMATION` | The state where the company was formed | Owner | Terms | |
| `BRAND_NAME` | The name users see. Today "Dzirent". If it differs from the legal name, the trade name the company registered | Owner | All pages | |
| `REGISTERED_ADDRESS` | A postal address where legal notices and letters reach the company. Also the postal address that marketing emails must show later (P6C). Whether a PO box is enough: attorney | Owner | Terms, Privacy, Copyright, Support | |
| `CONTACT_EMAIL` | General contact address | Owner | Support, Terms | |
| `SUPPORT_EMAIL` | Where users get help. The apps and website already link to `support@dzirent.com` (`AppLinks.SUPPORT_EMAIL`, `apps/web/src/components/shell.tsx`), so confirm that mailbox exists and someone reads it, or give the new address | Owner | Support, Safety, Delete | |
| `PRIVACY_EMAIL` | Where people send privacy requests: see their data, correct it, delete it, appeal a refusal | Owner | Privacy, Delete | |
| `SECURITY_EMAIL` | Where people report a security problem | Owner | Support, Privacy | |
| `SUPPORT_RESPONSE_TIME` | How soon support answers, in plain words (for example "within 2 business days") | Owner | Support | |

## 2. Dates and versions

| Key | What it is | Who fills | Used on | Value |
| --- | --- | --- | --- | --- |
| `EFFECTIVE_DATE_TERMS`, `EFFECTIVE_DATE_PRIVACY`, `EFFECTIVE_DATE_RULES`, `EFFECTIVE_DATE_COPYRIGHT` | The date each page starts to apply | Owner + attorney | Each page | |
| `TERMS_VERSION`, `PRIVACY_VERSION` | A version number for each, recorded with the date when someone accepts them at sign-up (P1B) | Engineering | Terms, Privacy, sign-up | |
| `CHANGE_NOTICE` | How users are told about changes to the terms or privacy policy (email, in-app notice) and how many days before the change applies | Attorney | Terms, Privacy | |

## 3. Law, disputes and the marketplace role

| Key | What it is | Who fills | Used on | Value |
| --- | --- | --- | --- | --- |
| `GOVERNING_LAW_STATE` | Which state's law governs the terms | Attorney | Terms | |
| `VENUE` | Which courts (county and state, or federal district) hear disputes that go to court | Attorney | Terms | |
| `DISPUTE_PROCESS` | What happens when there is a dispute: contact first and how many days to try to settle, then arbitration or court; the arbitration provider and rules if any; whether claims must be brought one person at a time; how to opt out and by when; the small-claims option | Attorney | Terms | |
| `LIABILITY_CAP` | The most the company can owe a user, and the exclusions | Attorney | Terms | |
| `MARKETPLACE_ROLE` | That Dzirent only connects people: it is not a party to rentals and takes no payments today (README product rules; users already tick "I understand Dzirent only connects people" at sign-up) | Attorney | Terms, Safety | |
| `DAMAGE_AND_LOSS` | That renters and lenders settle damage, loss, cleaning and late returns between themselves while there are no payments | Owner + attorney | Terms, Safety | |
| `DEPOSIT_RECOMMENDATION` | The recommendation that lenders ask for a deposit on high-value pieces (README product rule), and the value from which a piece counts as high-value | Owner | Terms, Safety | |
| `SERVICE_AREA` | Where the service is offered. Today only US cities can be chosen (`us_cities`, "City, ST") | Owner | Terms, Privacy | |

## 4. Age

| Key | What it is | Who fills | Used on | Value |
| --- | --- | --- | --- | --- |
| `MINIMUM_AGE` | The minimum age to make an account. Today 18 (sign-up tick on all three platforms) | Owner + attorney | Terms, Privacy, sign-up | |
| `AGE_REQUIREMENT_WORDING` | The exact sentence, for example whether it says "18 or older" or "18 or the age of majority where you live" | Attorney | Terms, sign-up | |
| `MINOR_ACCOUNT_PROCESS` | What happens when an account turns out to belong to someone under the minimum age (for example suspended, then deleted), and how a parent can report it | Owner + attorney | Terms, Privacy | |

## 5. Taxes

| Key | What it is | Who fills | Used on | Value |
| --- | --- | --- | --- | --- |
| `LENDER_TAX_STATEMENT` | That lenders are responsible for reporting their rental income. Once payments are live (P6B), which tax forms the payment provider may send and when | Attorney (tax adviser) | Terms | |
| `SALES_TAX_STATEMENT` | Who is responsible for any sales tax on rentals today, while Dzirent takes no payments; and later, whether Dzirent collects it as a marketplace (the sales tax hook in P6B starts off) | Attorney (tax adviser) | Terms | |

## 6. Privacy policy details

| Key | What it is | Who fills | Used on | Value |
| --- | --- | --- | --- | --- |
| `DATA_RETENTION` | How long each kind of data is kept. See the table below | Owner + attorney decide; Engineering applies it in P3B | Privacy | See below |
| `PRIVACY_REQUEST_PROCESS` | How a person asks to see, correct, download or delete their data, how the company checks it is really them, and how many days the company takes to answer | Attorney | Privacy | |
| `APPEAL_PROCESS` | How a person appeals when a privacy request is refused, and how long the answer takes | Attorney | Privacy | |
| `SALE_AND_ADS_STATEMENT` | That the company does not sell personal data or use it for targeted ads. True today: `compliance.md` section 3 found no analytics, ads or tracking | Attorney | Privacy | |
| `SERVICE_PROVIDERS` | The outside services that handle data, what they get and why | Engineering (from `compliance.md` section 2) | Privacy | |
| `COOKIES_LIST` | Every cookie and browser storage item the website uses | Engineering (from `compliance.md` 1.13) | Privacy | |
| `LOCATION_STATEMENT` | How location is used and how coarse it is: rounded to about 1 km before it is stored; only distance in whole miles is shown | Engineering (from `compliance.md` 1.4); attorney checks whether this counts as "precise" anywhere | Privacy | |
| `CONSUMER_HEALTH_DATA` | Whether body measurements count as consumer health data in Washington. If yes, a separate consumer health data policy and consent are needed | Attorney | Privacy | |
| `SENSITIVE_DATA_REVIEW` | Whether anything collected counts as sensitive data: style interests (cultural styles), the "Maternity" studio tag, photos of people | Attorney | Privacy | |
| `BIOMETRIC_STATEMENT` | That photo checks store a general image fingerprint for duplicate checks, not face data; later, what ID verification does with faces (P6A) | Attorney | Privacy | |
| `WHAT_STAYS_AFTER_DELETION` | What remains after an account is deleted. Today: chats and rentals disappear for both people; accessory and listing declarations stay without the account link; server logs stay until they expire (`compliance.md` 1.8, 1.10, 1.12; gaps 1, 2, 10) | Owner + attorney | Privacy, Delete | |
| `DELETE_ACCOUNT_URL` | The public page that explains how to delete an account. Google Play requires a web address for it | Engineering (P1A part 2) | Delete, store forms | |

### Retention periods to decide (`DATA_RETENTION`)

Today's column is from `compliance.md`. The last column is for the owner and attorney.

| Data | Today | Period to decide |
| --- | --- | --- |
| Account, profile and studio | Until the account is deleted | |
| Body measurements, fit profile, style interests | Until the user removes them or deletes the account | |
| Listings, photos, garment measurements, availability | Until the lender deletes them or the account | |
| Chats and messages | Until either person's account or the listing is deleted | |
| Rentals and rental answers | Until either person's account is deleted | |
| Rental condition photos (C3, pickup and return) | `condition_photo_retention_days` = 365 days after the rental ends (placeholder), then deleted by a cleanup job once it is switched on | Attorney: how long photos are needed for disputes |
| Reports | Until the reporter's account is deleted | |
| Blocks | Until unblocked or either account is deleted | |
| Accessory and listing declarations | Kept with no end date, also after account deletion | |
| Photo check results | Until the listing is deleted | |
| Suggestion outcomes and listing activity events | Kept with no end date | |
| Push tokens | Until sign-out, a dead token, or account deletion | |
| Sign-in sessions | No forced end | |
| Server logs (Supabase, Vercel, Google Cloud) | Each provider's own period, partly unconfirmed | |
| Backups | Provider's backup period, unconfirmed | |

## 7. Copyright and DMCA

| Key | What it is | Who fills | Used on | Value |
| --- | --- | --- | --- | --- |
| `DMCA_AGENT_NAME` | The person or role that receives copyright notices. It must match the designation filed with the US Copyright Office | Owner | Copyright | |
| `DMCA_AGENT_ADDRESS` | That agent's postal address (as filed) | Owner | Copyright | |
| `DMCA_AGENT_EMAIL` | That agent's email (as filed) | Owner | Copyright | |
| `DMCA_AGENT_PHONE` | That agent's phone number (as filed) | Owner | Copyright | |
| `DMCA_DESIGNATION_NUMBER` | The number the Copyright Office gives the filing. The filing has to be renewed from time to time; attorney to confirm the schedule | Owner | Copyright | |
| `REPEAT_INFRINGER_RULE` | When an account is closed for repeated copyright problems | Attorney | Copyright, Terms | |
| `COUNTER_NOTICE_PROCESS` | How a user disputes a takedown, and the waiting period before a listing can come back | Attorney | Copyright | |

## 8. Community rules, prohibited items and safety

| Key | What it is | Who fills | Used on | Value |
| --- | --- | --- | --- | --- |
| `PROHIBITED_ITEMS` | What can't be listed. From the README product rules and `policy_item_types` (114 rows): no lingerie, underwear or swimwear; no everyday basics; the accessory list | Engineering; Owner confirms | Rules | |
| `COMMUNITY_RULES` | How people must behave, and what happens when they don't (warning, listing removed, suspension, ban) | Owner + attorney | Rules, Terms | |
| `REPORT_HANDLING` | What happens after a report and how soon someone looks at it (the admin tool comes in P2B) | Owner | Rules, Safety | |
| `SAFETY_TIPS` | Advice for pickup and return, for example meeting in a public place and checking the piece together | Owner | Safety | |

## 9. Later phases

Filled when the phase arrives; listed now so the config has room for them.

| Key | What it is | Who fills | Phase |
| --- | --- | --- | --- |
| `ID_VERIFICATION_PROVIDER`, `ID_DATA_RETENTION` | The ID check provider, what it collects (ID document, face photo, date of birth) and how long each side keeps it | Owner + attorney | P6A |
| `PAYMENT_PROVIDER`, `PAYMENT_PROVIDER_TERMS_URL` | The payment provider and the terms lenders accept with it | Owner + attorney | P6B |
| `FEES`, `REFUND_POLICY`, `DEPOSIT_RULES`, `CANCELLATION_POLICY` | What Dzirent charges, when money comes back, how deposits are held and released, what happens when a rental is cancelled | Owner + attorney | P6B, P6C |
| `EMAIL_SENDER_NAME`, `EMAIL_FROM_ADDRESS`, `EMAIL_FOOTER_ADDRESS` | Who emails come from and the postal address in their footer | Owner | P6C |
| `STORE_DEVELOPER_NAME` | The developer name on Google Play and Apple. Must equal `COMPANY_LEGAL_NAME` | Owner | P8A, P8B |
| `PRIVACY_POLICY_URL`, `TERMS_URL`, `SUPPORT_URL` | The page addresses the store forms ask for | Engineering | P8A, P8B |
| `ACCESSIBILITY_CONTACT` | Where people report an accessibility problem | Owner | P4A |

## 10. Payment settings (C4)

The payments backend (built in C4, switched off) reads these from the closed settings table; admins change them on the admin website's Settings page (each change needs a reason and is logged). The values below are the pilot defaults the owner gave; each still needs the person named here to confirm it, and the Terms of Use must describe it before payments are switched on. "Owner" here is the business owner, as everywhere in this file.

| Setting | What it is, in plain words | Default | Who decides | Used on | Value |
| --- | --- | --- | --- | --- | --- |
| `platform_fee_percent` | Dzirent's fee, as a percent of the rental price, taken from each rental payment | 0 | Owner | Terms (`FEES`) | |
| `claim_window_hours` | How long after a return the lender can claim part of the deposit for damage | 48 hours | Owner (attorney checks the wording) | Terms (`DEPOSIT_RULES`) | |
| `cancellation_refund_cutoff_hours` | Until how long before the start date a renter who cancels gets a full refund | 48 hours | Owner (attorney checks the wording) | Terms (`CANCELLATION_POLICY`, `REFUND_POLICY`) | |
| `late_cancellation_refund_percent` | How much of the rental price a renter gets back when cancelling after that cutoff (also for the automatic cancel when a piece isn't picked up) | 0% (the lender keeps the rental price) | Owner (attorney checks the wording) | Terms (`CANCELLATION_POLICY`) | |
| Lender cancellation | A lender who cancels always refunds the renter in full (a fixed rule, not a setting) | Full refund | Owner confirms | Terms (`CANCELLATION_POLICY`) | |
| `sales_tax_enabled` | Whether Dzirent adds sales tax to rentals. Only a hook today: it adds $0 even when on, until the tax adviser says how it is computed | Off | Attorney (tax adviser) | Terms (`SALES_TAX_STATEMENT`) | |
| `rental_autocancel_days` | A rental not picked up this many days after its start date is cancelled automatically | 2 days | Owner | Terms | |
| `deposit_hold_warning_hours` | A card hold lasts about a week; this long before it ends, while the piece is still out, Dzirent places a new hold and tells both people | 24 hours | Owner | Terms (`DEPOSIT_RULES`) | |
| Charges to a saved card | The renter's card is saved at payment so the deposit hold and a decided claim can be charged without them present | Always | Attorney (consent wording) | Terms, pay screen (C5) | |
| `PAYMENT_PROVIDER` | The payment processor's name for the Terms (the website's privacy page says "a payment processor" on purpose) | - | Owner + attorney | Terms, Privacy | |
</content>
</invoke>
