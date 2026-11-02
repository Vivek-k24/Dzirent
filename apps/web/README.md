# Dzirent web

Next.js App Router and TypeScript website, with the mobile app's black/white/maroon
palette, original vector logos and locally bundled Roboto font.

## Run

Use Node 22 or newer. Supply these environment variables to both the build and
server processes; never put their values in tracked files:

- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

Then run npm ci, npm run lint, npm run build, and npm start from apps/web.
The app deliberately fails if either required variable is absent.

## Data and sessions

Guest reads use the shop-window RPCs in pranalika/contract.md. Personalized pages
use verified cookie sessions through @supabase/ssr. Direct reads and writes are limited to the signed-in owner's or chat participant's
contract tables. Public browsing and other studios use the shop-window RPCs.
Every workflow API request verifies the Auth user; mutations check the public
Origin/host, and Supabase RLS remains authoritative. No service-role key is used.

Images come from the public listing-photos bucket. Listing cards contain only
photo, title, and price/distance, with under 1 mi for zero distance.

The default location is Austin, TX. The city picker uses search_cities. Browser
location can supply approximate coordinates; a city selection confirms the label
without introducing an external reverse-geocoding service.

Signup confirmation uses the exact /auth/callback path. A short-lived cookie
holds the safe return path. Preview auth routes use the stable
https://dzirent.vercel.app host so PKCE cookies and confirmation land on the same
origin. The two website callback URLs are allowlisted in Supabase Auth.

## Signed-in workflows

The two-step listing editor follows mobile/shared: Photos and details, then Size,
price and dates. Photos from a file picker or camera are compressed to JPEG
(1,600 px maximum side) before upload. Paths are listing UUID/random UUID.jpg.
The requested web smoke test permits one photo; no AI suggestions or checks run.
Local IndexedDB drafts are scoped to the account. Publishing keeps the row paused
until photos, measurements, availability and required declarations finish, and
retains the stable listing/upload IDs for retry. New listings publish active;
edits preserve Active/Paused. The V1.0 editor has one availability range and keeps
existing extra ranges when editing older data. Full deletion calls delete-listing.

Inbox has Messages and Activity tabs, participant chats, requested-date changes,
read receipts, reports, blocks and rental actions. Realtime messages/rentals wait
for confirmed Postgres subscription readiness, then reload history to close the
subscription race; message IDs deduplicate live/history results. Periodic and
focus refreshes recover missed updates.

Closet contains owner listings/sort/status controls and rental tabs. Profile and
settings include Rent/Lend/Both, studio fields, private body measurements/styles,
blocked users, local preferences, password change, sign out and delete-account.
The last operation requires DELETE and the Edge Function rechecks active rentals.
Measurements remain private; fit results use fit_listings.

The contract currently documents rental_outcomes as SELECT/INSERT while the app
uses upsert. This website inserts the caller's first answer without undocumented
updates; rental status can still be changed. See the Step 2B handoff request.

Verification uses the existing test accounts supplied through environment
variables. Never create test users, change their passwords, or delete accounts
as a smoke test. Remove disposable listings through delete-listing, including
their Storage objects. Test chat messages remain because the contract has no
client message deletion.

## Vercel

The project is dzirent, Root Directory apps/web, Next.js framework. Both required
public environment variables are configured for Preview and Production.
Server functions use pdx1. The existing git.deploymentEnabled=false setting was
preserved; the presentation Preview was deployed manually. No ignoreCommand
existed in the source config, and none was added or altered.

For a manual deployment from the repository root, explicitly select
apps/web/vercel.json with --local-config, target preview, and retain the existing
project protection. The stable Preview alias is https://dzirent.vercel.app.
Production traffic was not promoted or redeployed by Step 2A.
