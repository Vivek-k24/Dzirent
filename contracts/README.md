# Candidate API contract 0.1.0-candidate.1

Status: proposed common Phase 0 baseline, frozen for role work only after foundation review/merge.
Temporary author: Codex integrator. Owner after merge: Claude Code.
Source declarations: `services/api/src/dzirent_api/models.py` and `contract.py`.
Derived files: `openapi.json`, then `packages/client/src/generated/api.ts`.
Run `pnpm contracts:generate`; CI runs `pnpm contracts:check`. Do not hand-edit derived files.

OpenAPI describes the candidate Phase 1 API, not the delivered runtime. Only health routes are mounted
in Phase 0; schema-only declarations never serve as a working catalog backend. The endpoint fixtures in
`fixtures/catalog/examples.json` include one request/response per declared operation, plus common errors.
MSW and the connected backend must consume the same wire shapes and stable reference IDs.

## Routes and ownership

All paths start `/api/v1`, including `/health/live` and `/health/ready`.
Public GETs: `/catalog/products`, `/catalog/products/{slug}`, `/catalog/categories`, `/catalog/facets`,
`/locations/metros`. Authenticated own-profile operations: POST `/me/bootstrap`; GET/PATCH/DELETE `/me`;
GET/PATCH `/me/preferences`; POST `/me/lender-profile`. Bootstrap/enrollment are idempotent by verified
subject. DELETE /me deactivates the application profile and listings, never provider credentials.

Lender operations: GET/POST `/lender/products`; GET/PATCH/DELETE `/lender/products/{id}`.
Connected media milestone only: POST `.../{id}/images/upload-intent` and `.../{id}/images/complete`.
No payment, checkout, reservation, taxonomy-write, admin, arbitrary-user, or token-ticket endpoints.
Checkout preview/cart are client-only sample state; selected dates do not reserve a garment.

Bearer session identity is required on protected operations in the contract. API derives ownership from
the verified subject and stored lender membership. No request accepts owner IDs, role strings, or an admin
flag. Owner mismatch/missing entity consistently returns 404; missing lender enrollment returns 403.
PATCH listing requires `expected_version`, plus `data` (full allowlisted ProductWrite) and/or
`is_available`. Conflicting values/empty patches are 422. DELETE archives with query `expected_version`,
returns ProductDetail, increments version, and preserves history. Stale expected versions return 409.
Create returns 201 and server assigns ID/slug/owner/audit fields. Inline arbitrary image URLs are forbidden;
`image_ids` must reference verified owned media or allowlisted public fixture IDs in explicit demo/test.
POST upload-intent returns a narrowly scoped PUT URL, max 10 MB candidate limit, five-minute example
expiry. Final authorization, image validation/derivatives, expiry limits and trusted media URLs remain
implementation work. Completion attaches only successfully validated owned objects and checks version.

Errors always have `error.code`, `error.message`, `error.details`, `request_id`. Codes/statuses:
401 unauthenticated; 403 lender_required; 404 not_found; 409 stale_version; 422 validation_error;
429 rate_limited; 503 dependency_unavailable. Field details use small objects, never raw input tokens,
stack traces or secrets. Framework-native validation errors must be normalized by Claude in Phase 1B.

## Catalog queries and counts

`collection` is the candidate navigation-context addition described in ADR 0001. `category` is a repeated
root slug filter; `subcategory` is one globally namespaced leaf slug. With category filters empty, use
collection; with both empty, all roots. A subcategory must belong to one effective root or return 422.
Optional groups: repeated `brand` UUID, `color` slug, `band` A/B/C/D, `size` UUID. OR within each
group, AND between groups. Category membership includes descendants/secondary memberships and
deduplicates product IDs. Search `q` is case-insensitive substring in title/brand label/description.

`start`/`end` are paired date-only ISO dates; empty means no date filter. Require end=start+3 days inclusive;
reject malformed, incomplete, reversed or variable-duration ranges with 422. Intervals overlap when
`start <= block.end && end >= block.start`; touching endpoints overlap. Date matching requires
`is_available` and no overlapping block. No implied reservation/booking. No wall-clock expiry in fixtures.

`metro` is one metro slug; `zip` is exactly five digits, using only the small demo map from locations.
ZIP determines metro; unmapped ZIPs use `other-texas` and display “Other Texas / demo location”.
Conflicting explicit metro and ZIP-resolved metro is 422. Metro matches garment location exactly;
there is no distance, coverage, geolocation or delivery guarantee. Unknown API filter identifiers are 422;
the web sanitizes unknown URL values to safe defaults, while malformed date ranges stay visibly invalid.

Public candidates are published listings from active profiles. Without dates, unavailable physical items
remain visible/disabled so the initial seed response has all 40 cards. A date query excludes unavailable
items. This candidate resolves the brief's initial-40/availability tension; review ADR 0001 before merge.
Owner lists also include drafts/archived/unavailable items.

- `collection_total`: distinct published items in navigation context before optional filters, including
  temporarily unavailable items. No collection means all published items.
- `total`: distinct matching items after optional filters, before pagination.
- `available_total`: matching items eligible for the selected dates, or globally available when dates empty;
  before pagination. Do not count secondary membership twice.
- `page` starts at 1; default `page_size=40`, cap 100. Filter then sort then paginate. Out-of-range page returns
  empty items and the correct total. Owner list defaults newest-first; its total includes all owner states.

Sort values: `featured` (rank ascending), `price_asc`, `price_desc`, `newest` (created_at descending),
`top_rated` (sample rating descending, null last). Every tie ends with product UUID string ascending.
No fake count abbreviations for the seed. Category counts deduplicate published primary/secondary
memberships before filters; Designer therefore has 7 memberships but only 5 primary garments.
Facets accept repeated `category` roots and return distinct values from that context before optional filters;
with no category return all facets. Facet arrays use label/key ascending order; bands A/B/C/D.

## Browser state

Canonical URL keys: `collection`, `q`, repeated `category`, `subcategory`, repeated `brand`, `color`,
`band`, `size`, `start`, `end`, `metro`, `zip`, `sort`, `view`, `page`. `view` is client-only grid/list;
the API does not receive it. Serialize keys and repeated values stably, deduplicate selections, omit defaults.
URL owns filters; do not create a second Zustand filter store. Back/Forward restores the whole state.
Top navigation sets collection and clears incompatible subcategory/category overrides; category filter
can then broaden results. Filter sheet drafts apply together; closing without Apply discards changes.
Clear all removes optional q/category/subcategory/facets/dates/location/page but retains navigation
collection, sort and view. “All collections” clears collection too. Fixtures/mocks/backend share semantics.

ProductWrite uses one physical size, cm measurements, explicit currency and integer nonnegative minor
units. Validate band against the half-open sample ranges in taxonomy, not retail value. Cross-field category,
band, date, media ownership and duplicate measurement constraints are mandatory server/MSW implementation
work; wire schemas do not claim to implement those rules. Product details include stretch/alterations/wear,
images/blocks and owner/version/audit fields. Ratings/prices are fictional display data.

## Modes

`modes.json` is canonical: lowercase `demo` or `connected`, default demo. Web environment selector is
`NEXT_PUBLIC_DZIRENT_MODE`; API selector is `DZIRENT_MODE`. Unknown values fail startup.
Demo web uses MSW only after Phase 1A implementation; reset clones the same deterministic seed and
discards sample session/edits. Mock delays are 0–50 ms; initial UI skeleton is 300 ms independently.
Visible simulation labels are required. Only harmless cart/wishlist/location/view data may persist locally.

Connected web uses an API base ending `/api/v1` plus Clerk publishable key. Connected API requires
database URL, Clerk issuer/authorized parties, real token verification and ownership enforcement. Mock
identity is rejected outside `mode=demo` with `environment=local|test`, including staging/production.
Connected requests never fall back to mock success; periodic refresh is 5 seconds, not pushed realtime.

Version changes require an approved architecture/change note and consumer notification. Regenerate
OpenAPI/types in one reviewed change; Claude publishes compatible contract additions before consumers
depend on them. The foundation candidate is not a claim that three agents have already agreed.
