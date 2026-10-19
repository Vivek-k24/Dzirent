# Proposed additive Studio workflow contract

Approved scope by the user's two-workflow instruction; implementation owner Claude Code. Existing
catalog paths, product IDs, wire fields and default API sort remain backward-compatible in this batch.
Publish the exact additive OpenAPI/client/example change in the Studio PR; never hand-edit generated types.

One Studio belongs to one lender profile. The server derives its owner from the verified principal.
Create a unique stable public handle server-side; changing a display name must not break public URLs.
Suggested routes, all under `/api/v1`:

| Route | Behavior |
| --- | --- |
| `GET /me/studio` | Authenticated lender's private Studio settings/current version; no arbitrary owner ID |
| `PUT /me/studio` | Create/update own Studio display name, bio and public visibility; validate expected version |
| `GET /studios` | Paginated active/public Studios with actual distinct published-product counts |
| `GET /studios/{handle}` | Public Studio profile; 404 for missing/private/inactive |
| `GET /studios/{handle}/products` | Paginated published products belonging to that Studio, stable ordering |

Public Studio fields: stable id/handle, display_name, bio, state_code=`TX`, published_product_count.
Private settings add is_public and version; do not expose private address/email/auth subject in public DTOs.
Existing product-card DTO supplies images, title and size. Full Studio wardrobe can reuse those cards;
the directory's rotating previews show only image/title/size for the product. Client must fetch remaining
pages to include all outfits. Missing pictures use the existing local placeholder.

Zero-product public Studios may show a real empty-state profile but are excluded from the default
directory. Published unavailable garments remain visible (availability is distinct from publication).
Private/draft/archived products and inactive owners never leak. Validate pagination and bounded strings,
reject cross-owner writes, and return 409 for stale edits. Reuse existing error envelopes and one Alembic head.
Use the existing seed lender and 40 products initially; do not redistribute ownership or fabricate counts.
Faker may generate labeled non-image development/integration fixtures, never real verified identities.

## Implemented (Claude Code, issue #16) — contract `0.1.0-candidate.2`

Additive only. A structural comparison against `0.1.0-candidate.1` finds **no removed or changed path,
operation or schema**; the only modified value is the version string (`info.version` and the `Health`
default). Generated TypeScript was regenerated with `pnpm contracts:generate`, never hand-edited.

| Operation | Route | Request / response |
| --- | --- | --- |
| `getMyStudio` | `GET /api/v1/me/studio` (bearer) | → `StudioSettings`; 404 `studio_not_found` before creation; 403 `lender_required` |
| `saveMyStudio` | `PUT /api/v1/me/studio` (bearer) | `StudioUpdate` → `StudioSettings` (200 for create and update) |
| `listStudios` | `GET /api/v1/studios?page&page_size` | → `StudioPage` (default 24, max 100) |
| `getStudio` | `GET /api/v1/studios/{handle}` | → `Studio`; 404 `not_found` if missing/private/inactive |
| `listStudioProducts` | `GET /api/v1/studios/{handle}/products?page&page_size` | → `StudioProductPage` of existing `ProductCard` items (default 24, max 100) |

New schemas: `Studio {id, handle, display_name, bio, state_code: "TX", published_product_count}`,
`StudioSettings = Studio + {is_public, version, created_at, updated_at}`,
`StudioUpdate {display_name 1–80, bio ≤600 (default ""), is_public, expected_version?}`,
`StudioPage` and `StudioProductPage` (existing `Pagination` fields + `items`).

Semantics:

- One Studio per lender profile (unique key); owner comes only from the verified principal. Requests
  carrying `id`, `handle`, `lender_profile_id` or other unknown fields are 422.
- `PUT` without `expected_version` creates; with it, updates. A stale or unexpected version is 409
  `stale_version` with `details: [{field: "expected_version", current_version}]` (`null` when none exists).
- `handle` is server-assigned from the first display name (`[a-z0-9-]`, ≤64), suffixed with six hex
  characters of the Studio ID on collision, and never changes on rename.
- Public = `is_public` and the owner's lender profile and account are active. `published_product_count`
  counts distinct published listings of that owner (published-but-unavailable included; draft/archived
  excluded). The directory omits zero-product Studios and orders by `handle`, then `id`.
- Studio products order by `created_at` descending, then product UUID; out-of-range pages are empty with
  the true `total`. Public DTOs never include email, auth subject, address, settings or drafts.
- Migration `0002_studios` (single head) adds only the `studios` table. The seed adds one Studio for the
  existing seed lender (`handle: sample-lender`, `manifest.json` → `seed_studio`); no product ownership,
  ID or image changed. MSW (`apps/web/src/mocks/studios/handlers.ts`) mirrors these rules for demo mode.
