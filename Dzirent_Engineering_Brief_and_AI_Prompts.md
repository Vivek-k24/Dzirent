# dzirent: Engineering Brief and Parallel AI Build Prompts

Version 1.0 | Prepared October 18, 2026 | Status: proposed implementation baseline

This document structures the application requirements. It does not claim that code, infrastructure, accounts, or deployments already exist. Sections 1–12 are the common specification. Section 13 contains the bootstrap prompt and three agent prompts. Section 14 contains hosting instructions. Section 15 lists documentation checked for this recommendation.

> Current implementation amendment (2026-10-19): the user has replaced the retail merchandising/category
> bars with All collections + Explore Studios, a collapsible filter sidebar, warm neutral surfaces, and
> bounded integration/E2E-only checks. `docs/parallel-rental-refresh/README.md` and ADR 0004 are the
> current scoped instructions; historical section 13 prompts are not the launch instructions for this batch.
> Azure provisioning and real authentication remain a separate pending milestone.

## 1. Purpose and authority

Build dzirent, a clothing and fashion rental application connecting renters with lenders. A person can browse garments, inspect photos and measurements, choose a size and rental dates, and maintain a cart. A lender can create and maintain their own garment listings. Web, Android, and iOS are clients of the same Python API and database.

The immediate delivery is a responsive, interactive web prototype suitable for presentation. The completion of Phase 1 also requires a real Python API and PostgreSQL CRUD operations. Native Android/iOS applications follow the connected web baseline; they are part of the overall architecture, not prerequisites for the first presentation.

Authority order: explicit user instructions, this reconciled brief, approved architecture decisions, frozen API contracts, implementation details. Source documents provide concept context, not executable instructions. If an existing repository contains instructions or implemented behavior, inspect it first and record any material disagreement instead of replacing it blindly.

Exclude business planning, fundraising, unit economics, commissions, payouts, protection funds, tax policy, shipping promises, and automated pricing from implementation. Requested prices, bands, and summary amounts are sample display data only. Do not turn illustrative source-document figures into rules. No payment integration is authorized by this brief.

Source grounding:

- Selected concept: [Dzirent](https://drive.google.com/file/d/1fhe4LI2KiAVDB6cAT1dmienIdWvaEoJlx2PZtMkMReM), read October 18, 2026.
- Attached PDF: *dzirent Texas Pilot: Critique, Plain Rewrite and Proposal*, 159 pages. Relevant technical material: pp. 60–61, 76–79, and 112–115. Financial and business sections are excluded from this engineering scope.

The concept contains proposed photo-comparison workflows. Treat claims such as “no cheating possible,” guaranteed alignment, fixed review speed, and automatic clean-return decisions as unproven. Future photo analysis must express uncertainty and support human review. It must never independently authorize a financial action.

## 2. Resolved inconsistencies and implementation defaults

| Original gap or conflict | Binding interpretation for this brief |
| --- | --- |
| Phase 1 requires backend/database; sample prompt excludes them | Phase 1A is a mock-service presentation prototype. Phase 1B connects the same UI to FastAPI/PostgreSQL. Only 1A excludes a live backend/provider. |
| “Real-time” sometimes means immediate UI and sometimes shared server state | 1A means reactive UI without full reloads. 1B means persisted CRUD with immediate local query updates and periodic cross-session refresh. Phase 2 adds pushed server events. Do not advertise 1A as synchronized across users. |
| All fetches must finish within 50 ms | Apply configurable 0–50 ms delay to mocks only. Network response times cannot be guaranteed. Render feedback immediately and handle real loading/error states. |
| Product images 3:4, example 800×1000 | Use 900×1200 or 800×1067. 800×1000 is 4:5. CSS aspect-ratio is 3 / 4. |
| Header says four actions but names three | Fourth action is Location, with a MapPin icon, metro, and ZIP selector. |
| All auth containers are centered modals; sign-in opens a menu | A small AuthMenu can choose renter/lender and sign-in/sign-up. The actual forms always open in a centered modal. Direct auth URLs render that modal over a safe catalog background. |
| “(500+) if count ≥100” | Use true counts for this 40-item seed. Future display is 100+ at ≥100, 500+ at ≥500, etc. Never claim 500 items when there are 100. |
| Women/Men overlap with Occasion/Designer/Bridal | Use the eight requested labels as navigation collections. Each product has exactly one primary seed collection and optional secondary memberships. Garment type, audience, occasion, fabric, and brand are separate structured attributes. Counts always deduplicate product IDs. |
| Every collection needs five subcategories | Seed the explicit five per collection in Section 6. Five primary products per collection means 40 unique garments, not 40 duplicated memberships. |
| “Occasion, Fabric, Price” called subcategories | These are facets in the mega-menu. True subcategories remain garment/style groups. Price labels refer only to configurable demo bands. |
| Broken heading “7.5”; undefined four homepage sections | Four content sections are merchandising preview, catalog context, filter controls, and results. Header/category navigation are shared page chrome. |
| 150 ms transition vs 300 ms skeleton on every change | Initial mock load uses a 300 ms skeleton. Filter changes use up to a 150 ms fade; show skeletons only if still pending after 150 ms. Avoid deliberately slowing every interaction. |
| “Band tag” text actually says Retail | Show both a compact “Band A” tag and “Retail $…” sample text. Neither is a business rule. |
| Signed-in lender always redirected | Redirect after lender login and lender-only intents. A lender can still browse the public catalog afterward. Renter login returns to the intended public page or /. |
| Cart says Checkout but payments are out of scope | Button opens /checkout/preview, a read-only demo summary. It creates no payment, paid order, or reservation. |
| Policy-like trust badges have no approved policy | Use “Cleaning details — demo” and “Cancellation details — demo”; their popovers explain that final terms are not configured. Do not publish unconditional promises. |
| Picsum gives arbitrary photos | Prefer a curated, licensed fashion-image fixture set. Picsum is a development fallback only. Broken images use a local garment placeholder. No Google scraping or search API dependency is needed. |
| Geographic source documents disagree | Use configurable Texas location data. Seed Austin, Dallas–Fort Worth, Houston, San Antonio, and Other Texas. Do not encode delivery coverage or time guarantees. ZIP-to-metro lookup is explicitly a small demo map until replaced. |
| Admin approval exists in concept but admin panel excluded | Phase 1 uses owner draft/published/archived state without an approval claim. Moderation and an admin interface are future work. |

## 3. Selected technology stack

These are implementation choices, not a catalog of alternatives. During bootstrap, choose mutually compatible stable releases, record exact versions in lockfiles, and record the Node/Python/Expo compatibility matrix. Do not let three agents independently run “upgrade to latest.” Python 3.12 and Node.js 22 are conservative candidate baselines, subject to framework support checks at bootstrap.

| Layer | Selection | Purpose / timing |
| --- | --- | --- |
| Web | TypeScript, React, Next.js App Router | Responsive catalog, shareable URLs, product pages; Phase 1A |
| Styling | Tailwind CSS, shadcn/ui components built on Radix primitives | Consistent monochrome design and accessible dialogs/drawers/popovers |
| Icons / typography | lucide-react; self-hosted Playfair Display for wordmark and a readable sans-serif for UI | Restrained visual identity; bundle fonts to avoid presentation-time dependencies |
| Data / UI state | TanStack Query; Zustand for cart and transient UI | API caching separately from cart/UI state; URL owns catalog filters |
| Forms / validation | React Hook Form and Zod | Listing forms and client validation; server validation remains authoritative |
| Calendar | react-day-picker with date-fns | Two-month range picker on desktop; single month on small screens |
| Mock API | Mock Service Worker (MSW) | API-shaped fixtures and error simulation in 1A; same wire contract as 1B |
| Android / iOS | React Native, Expo, Expo Router, TypeScript | One native codebase; Phase 2 |
| Mobile device services | expo-secure-store, expo-camera, expo-image-picker | Secure token handling; future guided capture; normal listing photos may use gallery |
| Mobile build/release | Expo EAS Build and Submit | Android/iOS build and distribution pipeline; store release is a later milestone |
| Python API | FastAPI, Uvicorn, Pydantic v2, pydantic-settings | Modular monolith; request validation and OpenAPI |
| Database access | SQLAlchemy 2, psycopg 3, Alembic | Typed persistence, PostgreSQL driver, ordered migrations |
| Database | PostgreSQL on Neon | Managed relational storage; local PostgreSQL through Docker Compose |
| API contracts | OpenAPI JSON generated from FastAPI; openapi-typescript-generated TypeScript types | One contract shared by mock API, web, native, and QA |
| Identity | Mock identity in 1A; Clerk in 1B and native clients | Centered custom forms; Python validates provider session tokens using the official backend SDK |
| Media | AWS S3, boto3; CloudFront for public optimized catalog images | Separate public catalog derivatives from private future evidence; no secrets in clients |
| Web hosting | Vercel connected to GitHub | Web previews and production domain |
| API/worker compute | Render Docker services | Long-running Python API now; worker and realtime support later |
| Background work / shared events | Celery and managed Redis-compatible Render Key Value | Add in Phase 2 when jobs, fan-out, or upload processing are needed; no cache dependency in 1A/1B |
| Pushed updates | FastAPI WebSockets, Redis pub/sub, durable DB event/outbox records where required | Phase 2; events invalidate queries, database remains authoritative |
| Packaging / local dev | Git, GitHub monorepo, pnpm workspaces, uv, Docker, Docker Compose | Reproducible JS/Python dependencies and isolated services |
| Web verification | Vitest, React Testing Library, Playwright, axe-core | Components, browser workflows, keyboard behavior, regressions |
| API verification | pytest, HTTPX, disposable PostgreSQL | API integration, authorization, migrations and relational integrity |
| Native verification | React Native Testing Library; Maestro for device journeys | Add when apps/mobile exists; browser emulation does not prove native compatibility |
| Static checks | ESLint, TypeScript, Ruff, mypy, pre-commit | Consistent code quality |
| CI / security | GitHub Actions, Dependabot, CodeQL where available, pip-audit, Trivy, Gitleaks | Required checks, dependency/container/secret scanning; use supported repository features |
| Observability | Structured JSON logs, request IDs, Sentry; OpenTelemetry in Phase 2 | Debuggability now, traces across API/workers later; redact identity tokens and private data |

No Kubernetes, microservices split, GraphQL, Elasticsearch, vector database, or AI runtime is needed for Phase 1. PostgreSQL search/indexes are sufficient for 40 garments. Reconsider infrastructure only against measured needs.

Clerk manages credentials; PostgreSQL stores application profiles and lender membership. Do not create a second password system. User display-name/profile CRUD is in scope; arbitrary user administration is not. In 1A, use sample identities and do not retain entered passwords or accept real credentials.

## 4. Architecture and boundaries

Web and mobile consume /api/v1 on the Python API. Next.js owns presentation, rendering, and routing. It must not become a second catalog or authorization backend. All persistent product validation and ownership enforcement live in FastAPI.

FastAPI has internal modules for identity/profile, catalog, taxonomy, location, media, and later rentals/evidence/review. Keep one deployment with clear module boundaries. PostgreSQL is authoritative. Redis is disposable coordination infrastructure. Object storage holds file bytes; database rows hold metadata and object keys.

Mode selection is explicit:

- DEMO mode: MSW + deterministic fixtures; cart and harmless demo preferences may persist locally. A visible demo indicator prevents misunderstanding. Seed reset returns to the same 40 products. No shared private data.
- CONNECTED mode: Clerk + FastAPI + PostgreSQL. Protected writes fail closed. A failed API request must not silently fall back to mocks or claim success.
- Server startup refuses mock-identity mode in connected/production environments. The web demo can be hosted publicly only as an explicitly simulated presentation.

For real media, issue short-lived, narrowly scoped upload authorization after verifying ownership. Validate extension, MIME type, decoded content, file size, and image dimensions; generate safe derivatives and remove unnecessary metadata. Use unique server-controlled object keys. Never overwrite private evidence via a predictable public upload path.

Security baseline: HTTPS, exact CORS origins, provider token signature/issuer/expiry/authorized-party validation, row-level ownership checks in API code, input limits, safe ORM queries, private secrets, rate limits at trusted boundaries, dependency scanning, and redacted logs. UI route guards are convenience; API authorization is mandatory. Use provider-supported web session handling; mobile tokens use SecureStore. Do not place live access tokens in application localStorage. If a future cookie-authenticated write endpoint is added, it also needs CSRF defenses.

## 5. Delivery phases and gates

| Phase | Deliverable | Exit gate |
| --- | --- | --- |
| 0: Shared foundation | Inspect repository, agree brief, create monorepo skeleton, stable fixture IDs and API contract, file ownership and first CI | All three agents use the same baseline SHA; mocks and backend agree on fields/endpoints |
| 1A: Presentation web prototype | Complete PLP/PDP/cart, renter/lender modal simulation, location selector, lender listing forms/table; 40 products; deployed preview | Browser acceptance suite passes; public presentation link works; all simulated behavior identified |
| 1B: Connected CRUD | Real FastAPI, migrations, PostgreSQL schema, managed identity, profile CRUD, owner-scoped product CRUD, real catalog filtering and media metadata | Write through UI → API → PostgreSQL → reload → observe persisted value; cross-owner write denied |
| 2: Native and shared live updates | Expo Android/iOS clients; real identity/API; favorites/cart sync if approved; pushed listing availability updates; media uploads and jobs | Native smoke journeys on Android and iOS; second client receives listing change without manual reload |
| 3: Technical rental and condition workflows | Explicit rental state machine, availability conflicts, guided capture sessions, evidence storage, receipt attachment, reviewer workflow and notifications | Tested transitions, access control, evidence isolation, retry handling, human review and uncertain-result handling |

Phase 3 has no payment, payout, tax, protection, shipping-label purchase, or automated pricing implementation. These require a separately authorized scope. A technical rental workflow may be tested with simulated reservations, but must not claim that a customer has paid or that fulfillment is guaranteed.

The short path to presentation is Phase 0 → 1A deployment. Claude can develop 1B while Codex completes 1A. Antigravity can write independent acceptance tests once the contract and routes are frozen. Native apps and condition analysis must not block that first presentation.

Suggested work batches, not a delivery-time guarantee:

1. Bootstrap contract and seed manifest.
2. Header, category navigation, PLP and filtering; parallel database/API and QA scaffold.
3. PDP, cart, modal auth, location and lender forms; parallel protected CRUD and integration tests.
4. Presentation deployment, keyboard/mobile/browser verification and fixes.
5. Connect real services, verify persistence and ownership, publish connected preview.

## 6. Frontend specification

### 6.1 Visual system and layout

White, black, and multiple neutral grays. A very light warm neutral is permitted for the category bar. Self-hosted lowercase serif dzirent wordmark, tight letter spacing. Main content max-width approximately 1440 px, with responsive side padding. Buttons, outlines, cards, typography, spacing, and overlays use shared design tokens. Product photography supplies color.

The four homepage content sections, below shared navigation:

1. Compact merchandising preview: contained placeholder panels for trends/categories/news/offers, approximately 160–220 px tall on desktop and 120–160 px on mobile. No viewport-sized hero, required carousel arrows, or autoplay. At common desktop heights, the catalog heading/controls or start of products should be visible; small screens scroll naturally.
2. Catalog context: breadcrumbs, title/count/availability text, subcategory pills.
3. Catalog controls: filter/sort/view bar, plus active-filter chips when applicable.
4. Results: responsive product grid/list, skeletons, error/empty states, load-more control.

Use eight skeletons on initial mock load, then show all 40 seed products without an additional request. Connected API supports pagination; use accessible Load more, not forced infinite scrolling. Results are not hidden behind merchandising panels.

### 6.2 Header and location

One sticky white header row with thin bottom border. Left: wordmark links to /. Center: wide pill search with 18 px Search icon and placeholder “What are you looking for?”. Right: User, Shirt+Plus, ShoppingBag, and MapPin actions with 12 px labels. ShoppingBag badge counts cart units, not distinct lines.

On narrow screens keep one top row: compact wordmark and actions; search expands in a dialog/overlay from a search trigger when a full input cannot fit. Icon buttons retain accessible names even when labels collapse. Category links scroll horizontally below.

Search matches title, brand, and description; debounce text input about 200 ms, reset pagination, update q in URL. Escape clears a focused search field only when no dialog is consuming the key. Location opens a centered dialog with metro selection and five-digit ZIP input. Validate syntactically, label unmapped ZIPs “Other Texas / demo location,” and never infer live delivery availability. ZIP and metro persist as preferences and URL parameters for shared catalog results. No browser geolocation permission is required.

### 6.3 Category navigation and seed taxonomy

Second bar: light tinted background, top/bottom borders. Left “Shop All” Menu button opens a left drawer; overlay dims page. Drawer header, close button, all categories/subcategories and footer “Sign in as lender” link. About 250 ms slide animation with prefers-reduced-motion support. Focus trap, Esc, scroll lock, and focus restoration.

Eight horizontal navigation collections and five true subcategories each:

| Collection | Five subcategories |
| --- | --- |
| Women | Dresses; Gowns; Jumpsuits; Co-ords; Skirts & Tops |
| Men | Blazers; Dress Shirts; Trousers; Waistcoats; Ensembles |
| Party & Cocktail | Mini Dresses; Midi Dresses; Sequin Outfits; Party Sets; Evening Separates |
| Suits & Tuxedos | Two-Piece Suits; Three-Piece Suits; Tuxedos; Dinner Jackets; Suit Separates |
| Wedding Guest | Daytime; Formal; Black Tie; Outdoor; Festive |
| Indian & Cultural | Sarees; Lehengas; Sherwanis; Kurta Sets; Anarkalis |
| Designer | Dresses; Gowns; Suits; Sets; Statement Pieces |
| Bridal | Wedding Gowns; Reception Looks; Bridal Separates; Veils & Capes; Bridal Ensembles |

Desktop hover and keyboard focus/click open the same mega-dropdown. Touch uses tap. Three columns: Occasion, Fabric, Price; show category subcategory links in a clearly labeled area. Featured image tile is optional and must not delay core functionality. No hover-only destination.

Seed one primary garment in each listed subcategory: five per collection, 40 total. One seed lender owns all 40. Include varied brands, fabrics, colors, sizes, sample ratings, sample price bands, metro assignments, available/unavailable items, and deterministic date blocks so each filter is demonstrable. Secondary collection membership is allowed but must not duplicate cards or inflate totals.

### 6.4 Context and pills

Home title “Trending outfits”; category navigation reuses the same PLP with a category parameter. Breadcrumbs link home and current category. H1 32–40 px on desktop, smaller on mobile. Title count is unique published products in the selected collection and descendant subcategories before optional filters. Right subtext is the true filtered available count. Use singular/plural correctly.

Pills: All plus the selected collection's five subcategories; single horizontally scrolling row, scroll snap, hidden visual scrollbar without disabling scrolling. White bordered pills; active black/white. Overflow-aware circular left/right chevrons move about 200 px and disappear at the ends. Home “All collections” shows only All until a collection is selected, avoiding an arbitrary five-item list.

### 6.5 Filter, sort, and view controls

Filter sheet opens from right. Groups: Rental Dates, Category, Brand, Color, Price Band, Size. Location lives in the header; retain its selection when opening filters. Individual popovers expose the same values and state. Filter sheet uses draft selections; “Show n results” commits them, Clear all clears the draft, closing without Apply discards draft edits. Individual popovers apply changes immediately. n is the count for the draft state.

- Rental Dates: Phase 1 uses an inclusive four-day interval: selecting a start auto-selects end = start + 3 calendar days. The two-month picker shows that interval; variable rental durations are future work. Reject incomplete or incompatible URL ranges. Demo blocks simulate availability; no reservation occurs. Empty dates mean no date filtering. Treat dates as date-only ISO strings, not shifted UTC timestamps.
- Category: multi-select collections. Selecting the top navigation first resets subcategory; filter Category can then broaden results.
- Brand: distinct brands, alphabetical, searchable.
- Color: swatches with text names, not color alone.
- Price Band: A/B/C/D, with ranges from sample configuration, never copied from source economics. Presentation-only four-day rental ranges: A below $50; B $50–$99.99; C $100–$149.99; D $150 and above. Represent boundaries as 0/5000/10000/15000 minor units and use non-overlapping half-open intervals. Persist and validate band against this sample configuration; do not infer it from retail value. These values are replaceable fixtures, not approved pricing policy.
- Size: alpha and numeric chips labeled with their sizing system. A garment is a single physical item in one labeled size; listed measurements explain fit. PDP is not a warehouse of stock in every size.

OR within each filter group; AND between groups. Category matching includes descendants and secondary memberships, with unique products. A subcategory selection applies only to its parent collection and clears on incompatible category changes. Availability/date/location semantics must be identical in fixtures and backend. Include inactive/unavailable garments in owner dashboard; public results show only published, active garments matching selection.

Active controls show labels such as “Color · 2” and an independent clear affordance; avoid nested buttons. Chip strip lists every applied search/filter including dates/location, each removable, plus Clear all. Global Clear all removes optional search/filters/dates/location/subcategory and resets page, retaining the currently navigated primary category, view, and sort; “All collections” navigation removes that category too. Document this distinction in tests.

Sort: Featured Items; Price Low to High; Price High to Low; Newest; Top Rated. Use stable secondary ordering by product ID; null ratings sort last. LayoutGrid and LayoutList toggle actual rendering; list cards have a horizontal image/details layout.

URL is the canonical state: q, category, subcategory, brand, color, band, size, start, end, metro, zip, sort, view, page. Use repeated parameters for multiselects, stable sorted serialization, and safe defaults for unknown values. Back/Forward restores controls and results. Selected values are not duplicated in an independent Zustand filter store. Date validation errors remain visible and do not apply malformed queries.

### 6.6 Product cards, PDP, cart, and errors

Grid breakpoints: 4 columns ≥1280; 3 at 1024–1279; 2 at 640–1023; 1 below 640. Desktop gap-x 24 px, gap-y 40 px. Fixed 3:4 image box, object-cover, subtle neutral background, rounded corners. Meaningful alt text is brand + title. No layout jump when image loads/fails.

Hover: second image crossfade or 1.02× scale, Rent now bottom-left, heart top-right. Equivalent controls appear on keyboard focus and remain discoverable on touch. Product title/image link to PDP; heart is a separate button, never an interactive element nested in a link. Wishlist toggles locally in 1A; connected persistence can wait for Phase 2.

Text: uppercase bold 13 px brand; one-line muted 14 px title; rental price “$… · 4 days”; compact Band A label; muted “Retail $…”. Cards do not add to cart. Featured position, created timestamp, rating, and price exist in fixtures to make every sort real.

PDP /products/[slug]: two-column desktop, stacked mobile; main photo plus three thumbnails, with graceful fallback when fewer exist. Right: brand, title, sample rating/count, price, size/measurements, selected rental dates, add-to-cart, demo cleaning/cancellation details. Show description, fabric, stretch, alterations, known wear, and location. One garment usually has one size; do not invent sizes as available inventory.

Add-to-cart requires valid size and dates. Default interval can be four days starting from a deterministic demo date or the next selectable real date; show it explicitly. Cart line identity is garment + size + dates. One physical garment cannot be added twice for overlapping intervals. Cart badge and accessible live announcement update immediately.

Cart /cart: portrait thumbnail, brand/title/size/dates, sample rental price, remove control, subtotal, sample cleaning/tax lines, total. All displayed amounts use integer minor units and explicit sample configuration. No commission or tax engine. /checkout/preview shows a non-transactional summary labeled “Presentation preview”; no payment collection or implied booking.

Empty state: SearchX, friendly message and Clear all filters. Error state: explain catalog request failure and offer Retry. Invalid product slug shows a proper not-found page. Missing images use a bundled local placeholder with no retry loop. Eight initial skeletons reserve the final card dimensions; use aria-busy and respect reduced motion.

### 6.7 Authentication and lender workspace

Auth modes: renter sign-in/sign-up and lender sign-in/sign-up. All web forms are centered, focus-trapped modals with Esc/close, focus restoration, validation, and show/hide password. Preserve a safe same-origin returnTo. Expose password requirements matching the actual provider configuration in connected mode; do not invent a length rule separately.

1A simulates sign-in/sign-up with sample profiles and a clear demo label. It does not verify identity, store passwords, send emails, reset passwords, or implement 2FA. 1B uses Clerk; if its configuration requires an additional provider step, follow it rather than bypassing it. Full recovery/MFA product flows remain outside Phase 1.

A user can have renter and lender roles. A lender profile is an application record, not a role string accepted from arbitrary requests. Self-enrollment creates a lender profile through an authenticated endpoint; ownership always derives from the verified subject. Admin role is never self-assignable.

List an Outfit: lender → /lender/dashboard; other users → /lender/signup, which opens lender enrollment/auth modal. After successful lender enrollment/login → dashboard. Direct /auth/lender/login renders the same modal. Unauthorized dashboard access opens lender auth; an authenticated renter sees lender enrollment instead of a login loop.

Dashboard: 40 seed-owned listings in a table with thumbnails, title, band, rental price, and availability toggle; searchable if time permits. Stat cards: Active listings (real derived count), Rentals this month (mock), Earnings (mock). Mock labels remain visible and numbers are not linked to transactions.

Complete the missing CRUD UI: New listing, edit listing, save draft/publish, and archive with confirmation. Forms include structured garment information, primary category/subcategory, optional secondary collections, sample display prices, images, location and availability. Phase 1A edits are simulated and resettable; 1B edits persist. Dashboard explains failed saves, prevents duplicate submissions and rolls back optimistic changes on errors.

## 7. Phase 1B database design

Use UUID primary keys, UTC timestamptz audit fields, foreign keys, unique constraints, and validated enums/check constraints. Store date-only rental blocks separately from timestamps. Use one catalog product per physical garment. Schema names/tables below are the logical baseline; final Alembic migration is owned by Claude Code.

| Table | Principal fields and constraints |
| --- | --- |
| users | id; auth_provider; auth_subject unique with provider; display_name; profile email; status; created_at; updated_at. No password column. |
| user_roles | user_id + role composite key; role renter/lender; privileged roles provisioned separately |
| lender_profiles | id; user_id unique FK; display_name; metro_id; status; created_at |
| user_preferences | user_id unique FK; metro_id nullable; postal_code nullable; updated_at |
| metros | id; slug unique; label; region; country_code; active. Coverage is not inferred. |
| categories | id; slug unique; name; parent_id nullable FK; sort_order; active. Seed eight roots + forty children; enforce acyclic parent changes in service logic. |
| brands | id; normalized_name unique; display_name |
| colors | id; slug unique; name; swatch_hex validated |
| sizes | id; sizing_system; label; unique(system,label) |
| products | id; slug unique; lender_profile_id FK; primary_category_id FK to leaf; brand_id FK; title; description; garment_type; audience; fabric; occasion; stretch; alterations; known_wear; size_id FK; metro_id FK; band A–D; rental_price_minor; retail_price_minor; currency; featured_rank; sample_rating nullable; sample_rating_count; status draft/published/archived; is_available; version; created_at; updated_at |
| product_categories | product_id + category_id composite key for optional secondary memberships; descendant queries must deduplicate |
| product_colors | product_id + color_id composite key |
| product_measurements | id; product_id FK; measurement_key; value_decimal >0; unit cm/in; unique(product_id,measurement_key). API may normalize to cm. |
| product_images | id; product_id FK; object_key or allowlisted fixture URL; alt_text; sort_order; width; height; media_status; unique(product_id,sort_order). Do not accept arbitrary fetch URLs from uploads. |
| product_unavailability | id; product_id FK; start_date; end_date; reason; check(end_date >= start_date). Phase 1 blocks are owner metadata, not booking locks. |

Required indexes: foreign keys used in joins, product status/availability, lender ownership, primary category, metro, price, created_at and featured order. Add title/brand search indexing if query measurement warrants it. Every money-like display field is nonnegative integer minor units; currency is explicit. Rating is either null or 0–5, count nonnegative, and clearly sample data until reviews exist.

Root category counts include descendant primary and secondary membership with COUNT(DISTINCT product.id). Avoid hard-coding the number 40 in application logic. Seed scripts are idempotent using stable IDs and restricted to disposable development/demo environments; production migrations never reseed user data.

Product updates use version-based optimistic concurrency: reject a stale version with 409. Archive rather than hard-delete a garment with history. Profile deletion in Phase 1 deactivates the account's application profile and owner listings; provider identity removal/retention is a separate documented operation. There is no open DELETE /users/{any_id} endpoint.

Later tables, not Phase 1 migrations: rental_requests, rental_items, availability_reservations, rental_events, capture_sessions, evidence_objects, comparison_runs, review_cases, cleaning_receipts, notifications, job_runs and outbox_events. Guided evidence stages should distinguish owner dispatch, renter arrival, renter pre-return, and owner receipt; post-cleaning images are an optional additional stage. Do not collapse these into ambiguous before/after columns.

## 8. API contract baseline

All application endpoints use /api/v1. API subject determines ownership. REST/JSON and generated OpenAPI are the contract; mock handlers must implement the same request/response shapes. Do not implement protected data access in Next.js server actions as an alternative API.

| Method and route | Behavior |
| --- | --- |
| GET /health/live; GET /health/ready | Process health; readiness checks DB without revealing secrets |
| GET /catalog/products | Filter/search/sort/page public published products; response items, total, page, page_size |
| GET /catalog/products/{slug} | Public garment details; unpublished items unavailable to public |
| GET /catalog/categories | Roots, children, deduplicated counts |
| GET /catalog/facets | Brands/colors/sizes/bands/occasions/fabrics for current category; stable semantics documented |
| GET /locations/metros | Configured locations, explicitly not a shipping promise |
| POST /me/bootstrap | Idempotently create application profile for verified provider subject |
| GET /me; PATCH /me; DELETE /me | Own profile read/update/deactivate, with field allowlists |
| GET /me/preferences; PATCH /me/preferences | Own location preferences |
| POST /me/lender-profile | Idempotent authenticated lender enrollment; never accepts another user_id |
| GET /lender/products | Only listings owned by current lender, including drafts/archived |
| POST /lender/products | Create own listing; validate metadata and category consistency |
| GET /lender/products/{id} | Read own unpublished/published listing |
| PATCH /lender/products/{id} | Update own listing/availability, required expected version |
| DELETE /lender/products/{id} | Archive own listing, return updated status or documented no-content response |
| POST /lender/products/{id}/images/upload-intent | Connected media milestone: authorize upload for owned product |
| POST /lender/products/{id}/images/complete | Validate resulting object and attach metadata after successful processing |

Taxonomy, brands and sizes are read-only seeded reference data in Phase 1; no public taxonomy writes and no admin UI. The backend creates/reads/updates/deletes owned products and own user profiles. Broader taxonomy administration is later scope.

Common error body: error.code, error.message, error.details, request_id. Use 401 for missing/invalid identity, 403 or non-enumerating 404 consistently for ownership denial, 404 missing product, 409 stale edit, 422 validation, 429 rate limiting and 503 temporary dependency failure. Never return stack traces or secrets.

Catalog query contract uses repeated parameters for multi-selects and date-only start/end. Default page_size 40 for seed presentation, cap 100, deterministic sort. Filtering before pagination; total means matching unique products, not current page length. Brand/size identifiers use stable IDs/slugs, not ambiguous display labels.

The Phase 0 contract must include ProductCard, ProductDetail, ProductWrite, CategoryTree, Facets, CurrentUser, LenderProfile, Pagination and Error schemas plus at least one request/response fixture per endpoint used by the web UI. API-generated TypeScript is checked for drift in CI. Make backwards-compatible additions or coordinate a contract version change before clients implement breaking changes.

## 9. Realtime and performance behavior

Phase 1A: React updates state immediately, cart via Zustand, catalog via URL+Query. MSW is an explicit simulation. No claim of shared inventory locks or actual bookings.

Phase 1B: update local queries after confirmed write; optimistic availability toggle may roll back on failure. Refetch when focus returns and approximately every five seconds while a live catalog is visible. This is periodic refresh, not pushed realtime. Display pending/errors rather than disguising them with a permanent skeleton.

Phase 2: API publishes listing.updated and availability.changed events after committed DB changes. WebSocket clients receive entity/version identifiers and invalidate appropriate queries. Use short-lived, single-use connection tickets issued by an authenticated API; restrict Origin, subscriptions and user channels; never put long-lived bearer tokens in a connection URL. Redis handles multi-process fan-out, not authoritative state. Reconnect with backoff and refetch a snapshot to recover missed events. Durable workflows use outbox records; lossy pub/sub alone is insufficient. Proposed verification target: a committed listing change appears in a second connected client within two seconds under the documented test setup.

No actual reservation can rely on UI filtering or Redis locks alone. Future overlapping rentals need transactional PostgreSQL constraints/locking, idempotency and concurrent-request tests. Dates selected in a cart confer no hold.

Presentation performance: responsive input and immediate feedback; optimized local/approved media, fixed dimensions, limited above-fold image priority, lazy-load below fold. Record test device/network and measurements. Do not state universal ≤50 ms API latency or 100% availability.

## 10. Repository layout and ownership

One GitHub monorepo. Directory paths below are proposed relative paths, not claims about an existing repository.

| Path | Sole author / owner |
| --- | --- |
| apps/web/** | Codex |
| apps/mobile/** | Codex, Phase 2 |
| packages/design-tokens/** | Codex |
| packages/client/** generated client wrapper and types | Codex consumes contract; generated files never hand-edited |
| services/api/**, services/worker/** | Claude Code |
| services/api/alembic/** | Claude Code only; one migration head |
| contracts/**, fixtures/catalog/** | Claude Code after joint baseline agreement |
| tests/e2e/**, tests/contracts/**, tests/native/** | Antigravity |
| docs/qa/**, docs/runbooks/** | Antigravity |
| .github/workflows/**, infra/ci/** | Antigravity |
| infra/runtime/**, API Dockerfile, API env template | Claude Code |
| web Dockerfile and web env template | Codex |
| Root package.json, pnpm-workspace.yaml, pnpm-lock.yaml, compose.yaml, AGENTS.md, README.md, CODEOWNERS, docs/architecture/** | Codex as integrator; other agents submit requested changes |
| services/api/pyproject.toml and uv.lock | Claude Code |
| docs/agents/codex.md; claude.md; antigravity.md | Each agent writes only its own file |
| docs/PROJECT_STATUS.md | Codex integrator only; summaries reference immutable commits and test reports |

Antigravity reads and tests all code but normally reports production-code fixes to its owner. It may implement a fix in another domain only after an explicit ownership handoff recorded in GitHub. Agent names do not imply unique technical capability; assignments are about reducing collisions.

## 11. Parallel work protocol

Use separate clones or Git worktrees and branches: codex/web-phase1, claude/api-phase1, antigravity/qa-phase1. Separate working directories are mandatory. Never let all three edit the same checkout. Separate local ports and disposable test databases too.

GitHub is the shared source of truth. Local notes become shared only after commit and push. An unpushed local logbook cannot synchronize remote assistants. Commit only nonsecret project notes; never credentials, raw tokens or private user evidence.

Rules for every agent:

1. Fetch and read AGENTS.md, this brief, current architecture, contract version and all three status files before starting a task. Record your base SHA. Do not discard pre-existing uncommitted user work.
2. Select a scoped GitHub issue and claim its path ownership before editing. An issue/label/comment or integration-controlled registry is the claim; concurrent edits to one shared markdown “lock” are not a reliable mutex.
3. Work only inside owned paths. Request cross-boundary changes through an issue/PR rather than silently editing them. Only the integrator edits shared JS lockfiles or root manifests; other agents submit the dependency request.
4. Commit small coherent units; push the branch and update your own status file after meaningful milestones. Include changed files, contract changes, tests run, failures, blockers and next step.
5. Open a PR. No direct pushes or force pushes to main. Required checks and CODEOWNERS review must pass. Bot review is useful but does not replace the independent verification lane.
6. Codex integrates one PR at a time. Resolve conflicts with the relevant owner, regenerate derived clients after contract changes, rerun affected checks on the merged candidate, then merge.
7. Pull or rebase after integration before continuing. No agent may change another agent's history. Do not overwrite deployment settings while another release is in progress.
8. Contract changes need an approved ADR/change note and consumer notification. Backend changes first publish a backward-compatible contract when possible; consumers then adapt. Do not break a running presentation to merge backend work.

Per-agent log template:

```text
Task / GitHub issue:
Branch:
Base SHA:
Current pushed SHA:
Owned paths:
Milestone: Phase 0 / 1A / 1B / 2 / 3
Status: in progress / ready for review / blocked
Implemented behavior:
Files changed:
Contract version / compatibility notes:
Checks: command, result, environment
Known failures / blockers:
Requested changes from another owner:
Next action:
```

Do not write “tested” without the actual command/result. Do not write “deployed” without the deployment URL and commit SHA. Do not mark work complete because a static page resembles the design while controls remain inert.

## 12. Verification and acceptance

### Phase 1A presentation gate

- Exactly eight collection roots, five subcategories per root, 40 unique primary garments and five primary garments per root; one seed lender owns all 40.
- Four content sections and shared header/category bar render without a viewport-sized hero.
- Search, all filters, draft filter sheet, individual clears, chips, sorting, pills, list/grid, browser Back/Forward and reload preserve documented URL behavior.
- Eight skeleton cards on initial load; no forced skeleton delay on every keystroke; empty, failed request, image failure and not-found states are usable.
- PDP gallery, single-garment size/measurements and dates work; cart count increments, overlapping duplicate item is blocked, removal and sample totals work; checkout preview cannot create a transaction.
- Renter and lender modal simulations, signup, logout, post-login destinations and safe returnTo work. Provider authentication is not falsely claimed.
- Shop All drawer, mega-menus, popovers, dialogs and filter sheet work with keyboard and touch. Esc/focus restoration, visible 2 px black outline offset 2 px, accessible names, dialog headings, live announcements and reduced motion are checked.
- Images are 3:4, meaningful alt text exists, loading has reserved space, fallback does not loop; the catalog does not rely on arbitrary landscape photos for presentation.
- ZIP/metro changes are instant and labeled as demo location data. No inferred shipping promise.
- Lender listing create/read/edit/archive/availability simulation works and can reset deterministically.
- No uncaught browser errors, hydration errors, failed essential assets, severe automated accessibility violations or committed secrets.
- Test at least Chromium, Firefox and WebKit; verify widths around 390, 768, 1100 and 1440 px. WebKit automation is useful but also smoke-test a real iPhone Safari and Android Chrome before a mobile-facing presentation when devices are available.
- Deployed preview is tested directly, including refreshing a PDP URL and opening a shared filtered link. Tag the passed commit demo-v0.1.0 and keep a rollback target.

### Phase 1B connected gate

- Alembic upgrade succeeds on empty PostgreSQL; seed is repeatable; migration changes preserve existing rows.
- Product/profile create/read/update/archive/deactivate routes meet documented behavior. Anonymous writes fail; lender A cannot view private drafts or mutate lender B's products; user cannot self-assign admin.
- Invalid category relations, amounts, sizes, date blocks and stale versions fail with the documented error shape. ORM queries do not accept untrusted SQL fragments.
- UI edit → network request → committed database row → reload from a second session confirms persistence. Simulated auth or seed fallbacks cannot satisfy this test.
- Provider failures, expired tokens, API outages, duplicate submissions and concurrent edits produce safe visible errors. Allowed/denied CORS origins are exercised; untrusted returnTo cannot redirect offsite.
- Upload intents are scoped and validation works if real uploads are enabled. Catalog objects and private future evidence never share unrestricted access policy.
- Health/readiness, structured logs, secret scanning, CI gates, dependency scans, backup configuration and a restore rehearsal are documented. Check the selected provider's actual backup/restore features rather than assuming a retention period.

### Phase 2/3 verification additions

Native app tests cover authenticated browsing, background/foreground, deep links, token storage, camera permission denial, interrupted uploads and low connectivity. Device builds and actual device results are recorded separately from simulators.

Realtime tests cover two clients, reconnect, stale events, unauthorized subscriptions, multiple API processes and missed-event snapshot recovery. Rental-state tests cover concurrency, overlapping intervals, retries and invalid transitions. Condition workflows keep capture stages distinct, store private evidence with audit metadata, support abstention and accessible human-assisted recapture. No claim of image-based truth or accuracy is made without evaluation.

## 13. Copy-ready AI assistant prompts

### 13.1 Bootstrap prompt: run once with Codex before parallel editing

```text
Act as the dzirent integration owner. Read Dzirent_Engineering_Brief_and_AI_Prompts.md in full. This is a planning-to-implementation handoff; do not import business or money rules from other source documents.

Inspect the existing repository, Git status and AGENTS.md. Preserve existing work. If a requirement conflicts with existing code, record the conflict and propose the smallest compatible change.

Complete Phase 0 only: create/align the monorepo skeleton, version baseline, root scripts, README, AGENTS.md, CODEOWNERS, architecture note, ownership rules, agent status files and canonical demo/connected mode definitions. Prepare a candidate API contract and deterministic taxonomy/40-item fixture manifest sufficient for independent UI/API/QA work. This temporary bootstrap authorship ends when the foundation is merged; Claude then owns contracts and fixtures.

Do not build a full application in this bootstrap task. Do not deploy, modify DNS, create cloud services, or ask other agents to edit shared files before the baseline is merged. State the exact baseline commit and contract version, worktree/branch assignments, startup scripts and next tasks for all three agents. If credentials or provider accounts are missing, list the concrete setup dependency without blocking local mock work.

Record actual validation. Never claim an unrun command passed. Open a reviewable foundation PR, or provide the committed local handoff if GitHub access is unavailable. Stop after the foundation is ready so the three role prompts can run against one agreed baseline.
```

### 13.2 Codex prompt: clients and integration owner

```text
You own dzirent's web client, later native clients, shared design tokens/client adapter, and integration of approved PRs. Read Dzirent_Engineering_Brief_and_AI_Prompts.md, AGENTS.md, architecture decisions, the frozen API contract, fixtures and all agent logs before editing. Use an isolated worktree on codex/web-phase1. Record the base SHA and claim a scoped issue.

Implement Phase 1A first. Use Next.js, TypeScript, Tailwind, shadcn/Radix, Lucide, TanStack Query, Zustand, React Hook Form, Zod, react-day-picker and MSW according to the brief. Build the complete responsive four-section PLP, search/location, eight collection navigation, Shop All drawer, keyboard-accessible mega-menus, subcategory pills, URL-based filters, draft filter sheet, stable sort, actual grid/list switch, 3:4 product cards, PDP, working cart and non-transactional checkout preview. Include mock renter/lender centered auth and lender listing create/edit/archive/availability flows. Include visible mock labels where required.

Use all 40 canonical products and meaningful fashion-image fixtures; do not scrape Google or use API keys in client code. Add loading, empty, error, image-failure and not-found behavior. Forms, overlays and navigation must be keyboard/touch accessible. No inert buttons or invented policy promises.

Consume contracts and fixtures; do not edit Claude's API/schema/migrations. Request contract changes explicitly. Root manifests/JS lockfiles are your integration responsibility; incorporate other agents' dependency requests serially. Antigravity owns independent browser/contract tests; add focused component checks within apps/web when useful.

When Phase 1A passes, prepare the Vercel preview configuration and a reviewable release candidate; publish only within the user's deployment authorization. Keep the presentation tag stable while connecting Phase 1B through the same API adapter. Never silently substitute mocks for a failed connected API. Later implement apps/mobile with Expo against the same contract; do not claim mobile-browser compatibility is a shipped native app.

Work in small commits, update only docs/agents/codex.md for your own status, and update docs/PROJECT_STATUS.md as integrator. Report implemented behavior, commit SHA, actual checks, blockers and next action. Integrate other agents' approved PRs one at a time, run affected checks and respect file ownership. Never force-push main, erase user work, or add business/payment integrations.
```

### 13.3 Claude Code prompt: Python API, database and runtime

```text
You own dzirent's Python API, PostgreSQL schema/Alembic migrations, canonical contracts/fixtures after bootstrap, and API/worker runtime configuration. Read Dzirent_Engineering_Brief_and_AI_Prompts.md, AGENTS.md, architecture decisions, contract baseline and all agent logs. Use an isolated worktree on claude/api-phase1. Record the base SHA and claim a scoped issue.

Implement Phase 1B in parallel with Codex's presentation UI. Use FastAPI, Uvicorn, Pydantic v2/settings, SQLAlchemy 2, psycopg 3, Alembic, uv and PostgreSQL. Follow the specified tables and API baseline. Create idempotent deterministic demo seeds with eight roots, forty subcategories, forty unique garments and one seed lender. Preserve the approved contract; publish proposed changes before breaking clients.

Implement public catalog search/filter/sort/pagination and deduplicated counts, current-user profile/preferences CRUD, lender enrollment and owner-scoped listing create/read/update/archive/availability. Validate parent/child relations, prices as integer minor units, garment size and measurements, date blocks and version-based concurrent updates. Seed reference taxonomy is read-only in Phase 1. No admin panel or arbitrary user administration.

Use Clerk's official supported Python token verification for connected identity. Derive subject and ownership server-side; never trust incoming user_id, lender_id or admin role. Isolate test/mock identity and reject it outside explicit disposable demo/test settings. Do not build a password database. Add health endpoints, structured redacted logs, stable errors, exact CORS configuration, safe query handling and environment templates without secrets.

Write pytest/HTTPX integration tests against PostgreSQL for meaningful behavior: persistence, invalid inputs, anonymous access, cross-owner denial, stale edits, migration/seed repeatability and dependency failures. If uploads enter the milestone, use authorized short-lived S3 intents and validate uploaded content before attachment. Provide Docker runtime and proposed Compose changes to Codex for shared-root integration. Do not edit web/mobile components or shared JS lockfiles.

Later phases add worker/realtime/rental/evidence modules only when their milestone is activated. No payments, payouts, tax engine, protection fund, automatic pricing or unsupported image-verification promises. Update docs/agents/claude.md, push small commits and open scoped PRs. Report actual commands/results and explicit blockers, not assumed success. Do not deploy infrastructure or modify DNS without deployment authorization.
```

### 13.4 Antigravity prompt: independent verification, alignment and release checks

```text
You own independent verification and architectural alignment for dzirent, plus CI workflows, QA reports and deployment runbooks. Read Dzirent_Engineering_Brief_and_AI_Prompts.md, AGENTS.md, architecture decisions, frozen contract/fixtures and all agent logs. Use an isolated worktree on antigravity/qa-phase1. Record the base SHA and claim a scoped issue.

Build a requirements-to-tests matrix before marking features complete. Implement Playwright browser tests, axe-core checks and independent API contract/integration smoke tests in your owned test paths. Test actual behavior against the phase-specific acceptance gates, not just element presence or mocked happy paths.

Phase 1A: verify exactly eight roots/forty garments, four content sections, URL filters/history, drawer and mega-menu keyboard behavior, modal auth simulations/redirects, PDP, cart badge, overlapping duplicate protection, location demo behavior, lender CRUD simulation, loading/error/empty/fallback states and grid/list. Test Chromium, Firefox, WebKit and stated responsive widths. Capture console/network failures. Label provider/auth/backend simulation honestly.

Phase 1B: verify the full UI → API → PostgreSQL → reload flow against real connected services. Exercise anonymous/cross-owner access, invalid inputs, stale edits, contract drift, migration/seed behavior, provider failures, CORS restrictions, secret exposure and failed optimistic saves. Mocks cannot satisfy connected acceptance. Use isolated disposable test data; never run destructive tests against production.

Set up GitHub Actions for JS/Python static checks, appropriate tests, secret/dependency/container scanning and deployment smoke checks. Ask Codex to integrate shared root dependencies/manifests; do not compete for lockfiles. Review that Next.js does not duplicate backend business logic, API contracts remain canonical, demo mode cannot bypass connected authorization, and database correctness does not depend on Redis.

Write docs/qa reports tied to tested commit SHA, URL, browser/device and commands. Classify defects as blocking/major/minor with steps to reproduce and expected/actual results; route product-code fixes to their owner. Do not rewrite production code or approve your own fix without an explicit ownership handoff. Maintain docs/agents/antigravity.md and deployment/rollback runbooks. Provide a release verdict with failed or untested checks visible. Do not claim security certification or native-device verification from browser emulation. No business or money implementation.
```

## 14. Hosting dzirent.com

### 14.1 Recommended initial arrangement

Keep the domain registered with Squarespace. Registration and application hosting are separate. Prefer keeping existing DNS management in place for the first release, provided the domain currently uses that DNS provider. Check authoritative nameservers before choosing where records must be edited.

| Proposed hostname | Service | First use |
| --- | --- | --- |
| demo.dzirent.com | Vercel web project | Isolated presentation prototype |
| dzirent.com | Vercel web project | Main app when the selected release is ready |
| www.dzirent.com | Redirect to chosen canonical main domain | Avoid two competing canonical web origins |
| api.dzirent.com | Render Python service | Connected CRUD API |
| media.dzirent.com | CloudFront public catalog distribution | Real catalog assets after upload milestone |

These hostnames are proposed configuration targets, not verified live links. Vercel's generated preview URL is sufficient for presentation before custom-domain DNS resolves. DNS changes and TLS issuance can take time; do not make them a prerequisite for demonstrating the UI.

### 14.2 Presentation deployment sequence

1. Use an existing authorized GitHub repo if one is provided; otherwise create a private dzirent monorepo when repository creation is authorized. Commit the agreed foundation and feature branches; protect main and require CI checks.
2. Connect the repo to a Vercel project, set root directory apps/web and the monorepo install/build commands from the repository. Verify workspace dependency access and pin the agreed Node version.
3. Deploy Phase 1A in explicit demo mode with public fixture data only. No database connection or secret key is needed for this milestone. Do not place server secrets in NEXT_PUBLIC_* variables.
4. Test the generated Vercel deployment URL directly with the full acceptance suite. Record SHA and demo tag. Configure preview access deliberately so the intended presentation audience can open it without an unexpected account wall.
5. Add demo.dzirent.com in Vercel Domains. Copy the exact CNAME/TXT records shown for that project into the current authoritative DNS provider. Do not guess target records or copy an old Vercel IP from an example.
6. In Squarespace-managed DNS, open the domain's DNS settings and add the supplied records. If nameservers point elsewhere, edit that provider instead. Preserve MX, email SPF/DKIM/DMARC TXT, and unrelated records. Remove only conflicting records for the exact hostname being changed.
7. Wait for domain verification and HTTPS provisioning, then verify the custom URL, deep-link refresh, filtered links and all image assets. Retain the tested provider URL as a fallback.
8. Add apex dzirent.com and www when ready. Use Vercel's exact current apex/CNAME instructions and configure one canonical redirect. A domain transfer or Squarespace website subscription is not required simply to point DNS to externally hosted code.

### 14.3 Connected deployment sequence

1. Provision a dedicated development/staging Neon database and least-privilege API credentials; choose region near API compute. Use provider-supported TLS. Configure runtime pooling deliberately; migrations use a direct connection where required. Do not embed database URLs in web/mobile bundles.
2. Configure Clerk development identity and exact allowed web origins/redirects. Create production identity separately when activating production. API verifies tokens and maps identity subjects to application users.
3. Deploy services/api to Render using its Dockerfile. Keep secrets in platform configuration; run Alembic migrations as a single serialized release step, not concurrently in every API replica. Seed only disposable demo databases.
4. Add api.dzirent.com to Render and install the exact DNS records it returns. Confirm HTTPS and health/readiness.
5. Set connected web configuration to the API URL and appropriate publishable identity key. Add exact known web origins to API CORS. Preview deployments use a dedicated staging API/identity environment; no broad credentialed wildcard CORS.
6. Connect protected S3 media only when real uploads are in scope. Keep private evidence buckets separate from public catalog derivatives. CORS permits only intended upload origins and operations.
7. Run the connected persistence/authorization tests on the deployed preview. Check DB restore, logs and rollback procedure. A code rollback does not automatically reverse a destructive schema migration; prefer backward-compatible expand/contract changes.
8. Promote the passed release, record app/API SHAs and migration revision. Keep demo and connected environment settings explicit. Configure budgets/alerts operationally if desired, without putting business forecasts into application code.

Do not attach a sleeping/expiring service to a time-sensitive presentation without testing cold starts and availability. Check current provider limits and use the appropriate service configuration; this brief makes no free-tier or cost guarantee.

### 14.4 Alternatives, if hosting constraints change

- Simpler provider consolidation: host the Next.js Node app and Python Docker API on Render; retain PostgreSQL/S3. Validate web performance and deployment workflow before switching.
- AWS consolidation later: ECS/Fargate for API/workers, RDS PostgreSQL, S3/CloudFront and managed Redis. This adds infrastructure setup and is not selected for the initial prototype.

No hosting changes have been executed by this planning document. App Store/Google Play distribution is separate from domain hosting; native clients still use the same API.

## 15. Official documentation checked

Documentation was checked October 18, 2026. Recheck exact release versions and provider configuration at implementation; do not pin “latest” implicitly.

- [Next.js documentation](https://nextjs.org/docs)
- [FastAPI features and OpenAPI support](https://fastapi.tiangolo.com/features/)
- [Expo EAS Build](https://docs.expo.dev/build/introduction/)
- [Expo authentication guidance](https://docs.expo.dev/develop/authentication/)
- [Expo Clerk integration](https://docs.expo.dev/guides/using-clerk/)
- [Clerk Python backend authentication](https://clerk.com/articles/how-to-add-authentication-to-a-python-backend)
- [Render FastAPI deployment](https://render.com/docs/deploy-fastapi)
- [Render Docker deployment](https://render.com/docs/docker)
- [Neon connection pooling](https://neon.com/docs/connect/connection-pooling)
- [S3 presigned uploads](https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html)
- [Vercel custom domains](https://vercel.com/docs/domains/working-with-domains/add-a-domain)
- [Squarespace DNS record management](https://support.squarespace.com/hc/en-us/articles/360002101888-Edit-your-domain-s-DNS-records)

## 16. First-run handoff

Give the full brief to all three assistants. Run the Phase 0 bootstrap prompt with Codex once. After the baseline merges, give each assistant its role prompt and the same baseline SHA. Start Codex's Phase 1A, Claude's Phase 1B and Antigravity's independent verification in separate worktrees. The first milestone to present is the passed Phase 1A web deployment; Phase 1 is complete only after Phase 1B persistence and authorization gates pass.
