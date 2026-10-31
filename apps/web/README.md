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
use verified cookie sessions through @supabase/ssr. Only the signed-in owner's
profile and saved-listing rows are accessed directly. Studio saves, blocking and
reporting use the handle-based contract RPCs. No service-role key is used.

Images come from the public listing-photos bucket. Listing cards contain only
photo, title, and price/distance, with under 1 mi for zero distance.

The default location is Austin, TX. The city picker uses search_cities. Browser
location can supply approximate coordinates; a city selection confirms the label
without introducing an external reverse-geocoding service.

Signup confirmation uses the exact /auth/callback path. A short-lived cookie
holds the safe return path. Preview auth routes use the stable
https://dzirent.vercel.app host so PKCE cookies and confirmation land on the same
origin. The two website callback URLs are allowlisted in Supabase Auth.

Messaging, listing creation, closet and settings intentionally show the
Available in the app panel for Step 2A. Measurements can be managed in the app;
the website's signed-in fit page uses fit_listings.

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
