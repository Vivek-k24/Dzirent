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
