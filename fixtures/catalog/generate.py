"""Reproducible candidate fixtures. Run via uv from services/api; no random/time inputs."""

import copy
import json
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID, uuid5

from dzirent_api.models import CONTRACT_VERSION, ProductCard

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
NAMESPACE = UUID("6b20db36-0e5a-4d6a-a484-9dfd13f269f9")


def uid(key: str) -> str:
    return str(uuid5(NAMESPACE, f"dzirent:v1:{key}"))


def slug(label: str) -> str:
    return label.lower().replace(" & ", "-").replace(" ", "-").replace("–", "-")


def write(name: str, value: object) -> None:
    content = json.dumps(value, indent=2, ensure_ascii=False) + "\n"
    target = HERE / name
    if "--check" in sys.argv:
        if not target.exists() or target.read_text(encoding="utf-8") != content:
            raise SystemExit(f"Fixture drift: {name}")
    else:
        target.write_text(content, encoding="utf-8")


COLLECTIONS = [
    ("Women", ["Dresses", "Gowns", "Jumpsuits", "Co-ords", "Skirts & Tops"]),
    ("Men", ["Blazers", "Dress Shirts", "Trousers", "Waistcoats", "Ensembles"]),
    (
        "Party & Cocktail",
        ["Mini Dresses", "Midi Dresses", "Sequin Outfits", "Party Sets", "Evening Separates"],
    ),
    (
        "Suits & Tuxedos",
        ["Two-Piece Suits", "Three-Piece Suits", "Tuxedos", "Dinner Jackets", "Suit Separates"],
    ),
    ("Wedding Guest", ["Daytime", "Formal", "Black Tie", "Outdoor", "Festive"]),
    ("Indian & Cultural", ["Sarees", "Lehengas", "Sherwanis", "Kurta Sets", "Anarkalis"]),
    ("Designer", ["Dresses", "Gowns", "Suits", "Sets", "Statement Pieces"]),
    (
        "Bridal",
        [
            "Wedding Gowns",
            "Reception Looks",
            "Bridal Separates",
            "Veils & Capes",
            "Bridal Ensembles",
        ],
    ),
]
roots = []
for i, (name, children) in enumerate(COLLECTIONS):
    root_slug = slug(name)
    root_id = uid(f"category:{root_slug}")
    roots.append(
        {
            "id": root_id,
            "slug": root_slug,
            "label": name,
            "parent_id": None,
            "sort_order": i,
            "product_count": 5,
            "children": [
                {
                    "id": uid(f"category:{root_slug}-{slug(child)}"),
                    "slug": f"{root_slug}-{slug(child)}",
                    "label": child,
                    "parent_id": root_id,
                    "sort_order": j,
                    "product_count": 1,
                    "children": [],
                }
                for j, child in enumerate(children)
            ],
        }
    )

metros = [
    {
        "id": uid(f"metro:{s}"),
        "slug": s,
        "label": label,
        "region": "TX",
        "country_code": "US",
        "location_note": "Demo location; no delivery coverage inferred.",
    }
    for s, label in [
        ("austin", "Austin"),
        ("dallas-fort-worth", "Dallas–Fort Worth"),
        ("houston", "Houston"),
        ("san-antonio", "San Antonio"),
        ("other-texas", "Other Texas"),
    ]
]
brands = [
    {"id": uid(f"brand:{i}"), "slug": f"sample-studio-{i + 1}", "label": f"Sample Studio {i + 1}"}
    for i in range(8)
]
colors = [
    {"id": uid(f"color:{name}"), "slug": name, "label": name.title(), "swatch_hex": value}
    for name, value in [
        ("black", "#111111"),
        ("ivory", "#f6f1e6"),
        ("navy", "#253b60"),
        ("red", "#a72e35"),
        ("green", "#386b50"),
        ("gold", "#b28a43"),
        ("pink", "#dca0ae"),
        ("gray", "#888888"),
    ]
]
sizes = [
    {"id": uid(f"size:{system}:{label}"), "sizing_system": system, "label": label}
    for system, label in [
        ("alpha", "XS"),
        ("alpha", "S"),
        ("alpha", "M"),
        ("alpha", "L"),
        ("alpha", "XL"),
        ("US-women", "4"),
        ("US-women", "8"),
        ("US-men", "38"),
        ("US-men", "42"),
    ]
]
bands = [
    {"id": name, "label": f"Band {name} · sample", "min_minor": low, "max_minor_exclusive": high}
    for name, low, high in [
        ("A", 0, 5000),
        ("B", 5000, 10000),
        ("C", 10000, 15000),
        ("D", 15000, None),
    ]
]
fabrics = ["Cotton", "Silk", "Linen", "Velvet", "Wool", "Satin", "Chiffon", "Brocade"]
occasions = ["Dinner", "Celebration", "Formal", "Wedding", "Outdoor"]
sample_lender = {
    "id": uid("lender:seed"),
    "display_name": "Sample Lender",
    "metro_id": metros[0]["id"],
    "status": "active",
}
timestamp = datetime(2026, 10, 1, 12, tzinfo=UTC)
products = []
for i in range(40):
    collection = roots[i // 5]
    leaf = collection["children"][i % 5]
    title = f"{colors[i % 8]['label']} {leaf['label']} {i + 1:02}"
    image = {
        "id": uid(f"image:{i}"),
        "url": "/fixtures/garment-placeholder.svg",
        "alt_text": f"{brands[i % 8]['label']} {title} — demo placeholder",
        "width": 900,
        "height": 1200,
        "sort_order": 0,
        "media_status": "fixture",
    }
    # Two secondary memberships demonstrate deduplication without changing primary cardinalities.
    secondary = [roots[6]["id"]] if i in [0, 10] else []
    size_pool = sizes[7:] if i // 5 in [1, 3] else sizes[:7]
    product = {
        "id": uid(f"product:{i + 1:02}"),
        "slug": f"demo-{leaf['slug']}-{i + 1:02}",
        "title": title,
        "brand": brands[i % 8],
        "primary_collection_id": collection["id"],
        "primary_category_id": leaf["id"],
        "secondary_category_ids": secondary,
        "size": size_pool[i % len(size_pool)],
        "colors": [colors[i % 8]],
        "metro": metros[i % 5],
        "band": bands[i % 4]["id"],
        "rental_price_minor": [3500, 7500, 12500, 17500][i % 4] + (i // 4) * 50,
        "retail_price_minor": 20000 + i * 1000,
        "currency": "USD",
        "sample_rating": None if i % 9 == 0 else round(3.8 + (i % 7) * 0.2, 1),
        "sample_rating_count": 0 if i % 9 == 0 else 3 + i,
        "featured_rank": 40 - i,
        "status": "published",
        "is_available": i % 7 != 0,
        "image": image,
        "version": 1,
        "created_at": (timestamp + timedelta(days=i % 12)).isoformat(),
        "updated_at": (timestamp + timedelta(days=i % 12)).isoformat(),
        "lender_profile_id": sample_lender["id"],
        "description": f"Fictional sample {leaf['label'].lower()} for local demonstration. No policy or transaction is implied.",
        "garment_type": leaf["label"],
        "audience": "men" if i // 5 in [1, 3] else "women",
        "fabric": fabrics[i % 8],
        "occasion": occasions[i % 5],
        "stretch": "Slight stretch" if i % 2 else "No stretch",
        "alterations": "None recorded — sample",
        "known_wear": "Light sample wear" if i % 3 == 0 else "None recorded — sample",
        "measurements": [
            {"key": "chest", "value": 82 + i % 15, "unit": "cm"},
            {"key": "length", "value": 90 + i % 30, "unit": "cm"},
        ],
        "images": [image],
        "date_blocks": [{"start": "2026-11-05", "end": "2026-11-08", "reason": "demo-block"}]
        if i % 3 == 0
        else [],
    }
    products.append(product)

for root in roots:
    root["product_count"] = sum(
        1
        for p in products
        if p["primary_collection_id"] == root["id"] or root["id"] in p["secondary_category_ids"]
    )

taxonomy = {
    "contract_version": CONTRACT_VERSION,
    "categories": {"items": roots},
    "facets": {
        "brands": sorted(brands, key=lambda item: item["label"]),
        "colors": sorted(colors, key=lambda item: item["label"]),
        "sizes": sorted(sizes, key=lambda item: (item["sizing_system"], item["label"])),
        "bands": bands,
        "occasions": sorted(occasions),
        "fabrics": sorted(fabrics),
    },
    "locations": {
        "items": metros,
        "demo_zip_map": {
            "78701": metros[0]["id"],
            "75201": metros[1]["id"],
            "77002": metros[2]["id"],
            "78205": metros[3]["id"],
        },
        "unmapped_zip_metro_id": metros[4]["id"],
    },
}
manifest = {
    "contract_version": CONTRACT_VERSION,
    "fixture_version": "0.1.0",
    "uuid_namespace": str(NAMESPACE),
    "demo_start_date": "2026-11-02",
    "demo_end_date": "2026-11-05",
    "notice": "Fictional public display data only. No prices, ratings, location coverage, or booking promises are approved business rules.",
    "sample_summary_lines": {
        "cleaning_minor": 0,
        "tax_minor": 0,
        "label": "Sample amounts; final terms not configured",
    },
    "seed_user_id": uid("user:seed"),
    "seed_lender": sample_lender,
    "products": products,
}

p = products[1]
card_list = [
    ProductCard.model_validate(
        {k: v for k, v in item.items() if k in ProductCard.model_fields}
    ).model_dump(mode="json")
    for item in sorted(products, key=lambda item: (item["featured_rank"], item["id"]))
]
user = {
    "id": manifest["seed_user_id"],
    "display_name": "Sample Lender",
    "email": "lender@example.invalid",
    "roles": ["renter", "lender"],
    "status": "active",
    "lender_profile": sample_lender,
    "created_at": timestamp.isoformat(),
    "updated_at": timestamp.isoformat(),
}
# One real seeded Studio: the existing seed lender's public profile. Counts are derived, never padded.
seed_studio = {
    "id": uid("studio:seed"),
    "handle": "sample-lender",
    "display_name": "Sample Lender",
    "bio": "A fictional demo Studio. Every outfit here is an illustrative sample listing; "
    "no rental, payment or delivery is offered.",
    "state_code": "TX",
    "published_product_count": sum(item["status"] == "published" for item in products),
    "is_public": True,
    "version": 1,
    "created_at": timestamp.isoformat(),
    "updated_at": timestamp.isoformat(),
}
manifest["seed_studio"] = seed_studio
manifest["sample_profiles"] = {
    "lender": user,
    "renter": {
        **user,
        "id": uid("user:renter"),
        "display_name": "Sample Renter",
        "email": "renter@example.invalid",
        "roles": ["renter"],
        "lender_profile": None,
    },
}
write_body = {
    k: p[k]
    for k in [
        "title",
        "description",
        "primary_category_id",
        "secondary_category_ids",
        "metro",
        "band",
        "rental_price_minor",
        "retail_price_minor",
        "currency",
        "garment_type",
        "audience",
        "fabric",
        "occasion",
        "stretch",
        "alterations",
        "known_wear",
        "measurements",
        "date_blocks",
        "status",
        "is_available",
    ]
}
write_body.pop("metro")
write_body.update(
    {
        "brand_id": p["brand"]["id"],
        "size_id": p["size"]["id"],
        "color_ids": [c["id"] for c in p["colors"]],
        "metro_id": p["metro"]["id"],
        "image_ids": [p["image"]["id"]],
    }
)
updated = copy.deepcopy(p)
updated.update({"version": 2, "is_available": False, "updated_at": "2026-11-02T12:00:00Z"})
archived = copy.deepcopy(updated)
archived["status"] = "archived"
preferences = {"metro_id": metros[0]["id"], "postal_code": "78701"}
cases = []


def example(
    op: str,
    method: str,
    path: str,
    response: object,
    *,
    body: object = None,
    query: str = "",
    status: int = 200,
    protected: bool = False,
    content_type: str = "application/json",
) -> None:
    cases.append(
        {
            "operation_id": op,
            "request": {
                "method": method,
                "path": "/api/v1" + path,
                "query": query,
                "body": body,
                "identity": "sample-lender (MSW only); verified native cookie with exact Origin/CSRF in connected"
                if protected
                else "anonymous",
            },
            "response": {"status": status, "body": response},
        }
    )
    if content_type != "application/json":
        cases[-1]["request"]["content_type"] = content_type


example(
    "getLiveness", "GET", "/health/live", {"status": "live", "contract_version": CONTRACT_VERSION}
)
example(
    "getReadiness",
    "GET",
    "/health/ready",
    {"status": "ready", "contract_version": CONTRACT_VERSION},
)
example(
    "listCatalogProducts",
    "GET",
    "/catalog/products",
    {
        "items": card_list,
        "total": 40,
        "page": 1,
        "page_size": 40,
        "collection_total": 40,
        "available_total": sum(p["is_available"] for p in products),
    },
    query="page=1&page_size=40&sort=featured",
)
example("getCatalogProduct", "GET", f"/catalog/products/{p['slug']}", p)
example("getCategoryTree", "GET", "/catalog/categories", taxonomy["categories"])
example("getCatalogFacets", "GET", "/catalog/facets", taxonomy["facets"])
example("getMetros", "GET", "/locations/metros", taxonomy["locations"])
example("bootstrapMe", "POST", "/me/bootstrap", user, protected=True)
example("getMe", "GET", "/me", user, protected=True)
example(
    "updateMe",
    "PATCH",
    "/me",
    {**user, "display_name": "Updated Sample"},
    body={"display_name": "Updated Sample"},
    protected=True,
)
example(
    "deactivateMe",
    "DELETE",
    "/me",
    {**user, "status": "inactive", "lender_profile": {**sample_lender, "status": "inactive"}},
    protected=True,
)
example("getPreferences", "GET", "/me/preferences", preferences, protected=True)
example(
    "updatePreferences", "PATCH", "/me/preferences", preferences, body=preferences, protected=True
)
example(
    "enrollLender",
    "POST",
    "/me/lender-profile",
    sample_lender,
    body={"display_name": "Sample Lender", "metro_id": metros[0]["id"]},
    protected=True,
)
example(
    "listLenderProducts",
    "GET",
    "/lender/products",
    {
        "items": sorted(
            products,
            key=lambda item: (-datetime.fromisoformat(item["created_at"]).timestamp(), item["id"]),
        ),
        "total": 40,
        "page": 1,
        "page_size": 40,
    },
    query="page=1&page_size=40",
    protected=True,
)
example(
    "createLenderProduct",
    "POST",
    "/lender/products",
    {**p, "id": uid("product:created-example"), "slug": "demo-created-example"},
    body=write_body,
    status=201,
    protected=True,
)
example("getLenderProduct", "GET", f"/lender/products/{p['id']}", p, protected=True)
example(
    "updateLenderProduct",
    "PATCH",
    f"/lender/products/{p['id']}",
    updated,
    body={"expected_version": 1, "is_available": False},
    protected=True,
)
example(
    "archiveLenderProduct",
    "DELETE",
    f"/lender/products/{p['id']}",
    archived,
    query="expected_version=1",
    protected=True,
)
upload_id = uid("upload:example")
example(
    "createUploadIntent",
    "POST",
    f"/lender/products/{p['id']}/images/upload-intent",
    {
        "upload_id": upload_id,
        "upload_url": "https://upload.example.invalid/scoped-demo",
        "method": "PUT",
        "headers": {"Content-Type": "image/jpeg"},
        "expires_at": "2026-11-02T12:05:00Z",
        "max_size_bytes": 4000000,
    },
    body={"filename": "sample.jpg", "content_type": "image/jpeg", "size_bytes": 100000, "rights_confirmed": True},
    protected=True,
)
example(
    "completeUpload",
    "POST",
    f"/lender/products/{p['id']}/images/complete",
    {
        **p,
        "version": 2,
        "images": [
            p["image"],
            {
                "id": uid("image:uploaded-example"),
                "url": "https://catalog.example.invalid/sample.webp",
                "alt_text": "Sample garment",
                "width": 900,
                "height": 1200,
                "sort_order": 1,
                "media_status": "ready",
            },
        ],
    },
    body={"upload_id": upload_id, "alt_text": "Sample garment", "expected_version": 1},
    protected=True,
)
example(
    "putUploadBytes", "PUT", f"/lender/products/{p['id']}/images/uploads/{upload_id}",
    {"upload_id": upload_id, "status": "uploaded", "width": 900, "height": 1200},
    body="Binary JPEG bytes supplied by the device; not a JSON string", protected=True,
    content_type="image/jpeg",
)
example(
    "getMediaContent", "GET", f"/media/{uid('image:uploaded-example')}",
    {"error": {"code": "dependency_unavailable", "message": "Photo storage is disabled.", "details": []}, "request_id": "sample-media-disabled"},
    status=503,
)
public_studio = {
    k: seed_studio[k]
    for k in ["id", "handle", "display_name", "bio", "state_code", "published_product_count"]
}
studio_cards = sorted(
    card_list,
    key=lambda item: (-datetime.fromisoformat(item["created_at"]).timestamp(), item["id"]),
)
example("getMyStudio", "GET", "/me/studio", seed_studio, protected=True)
example(
    "saveMyStudio",
    "PUT",
    "/me/studio",
    {
        **seed_studio,
        "display_name": "Sample Lender Studio",
        "version": 2,
        "updated_at": "2026-11-02T12:00:00Z",
    },
    body={
        "display_name": "Sample Lender Studio",
        "bio": seed_studio["bio"],
        "is_public": True,
        "expected_version": 1,
    },
    protected=True,
)
example(
    "listStudios",
    "GET",
    "/studios",
    {"items": [public_studio], "total": 1, "page": 1, "page_size": 24},
    query="page=1&page_size=24",
)
example("getStudio", "GET", f"/studios/{seed_studio['handle']}", public_studio)
example(
    "listStudioProducts",
    "GET",
    f"/studios/{seed_studio['handle']}/products",
    {"items": studio_cards[:12], "total": len(studio_cards), "page": 1, "page_size": 12},
    query="page=1&page_size=12",
)
# Native-auth examples document denial behavior only. No sample password identity is seeded,
# and placeholders must never be used as actual credentials. These reserved mailboxes cannot
# register through native auth. Successful private-account workflows belong to gated Phase 2.
private_password_input = "<PRIVATE RUNTIME INPUT ONLY>"
private_token_input = "<PRIVATE TOKEN INPUT>".ljust(43, "!")
for operation, method, path, body, status, code in [
    ("getAuthCsrf", "GET", "/auth/csrf", None, 503, "dependency_unavailable"),
    (
        "registerAccount",
        "POST",
        "/auth/register",
        {
            "email": "native@example.invalid",
            "display_name": "Contract example",
            "password": private_password_input,
        },
        403,
        "auth_csrf_failed",
    ),
    (
        "loginAccount",
        "POST",
        "/auth/login",
        {"email": "native@example.invalid", "password": private_password_input},
        403,
        "auth_csrf_failed",
    ),
    ("getAuthSession", "GET", "/auth/session", None, 401, "unauthenticated"),
    ("logoutAccount", "POST", "/auth/logout", None, 403, "auth_csrf_failed"),
    (
        "logoutAllSessions",
        "POST",
        "/auth/logout-all",
        {"current_password": private_password_input},
        403,
        "auth_csrf_failed",
    ),
    (
        "changePassword",
        "POST",
        "/auth/password/change",
        {"current_password": private_password_input, "new_password": private_password_input},
        403,
        "auth_csrf_failed",
    ),
    ("requestEmailVerification", "POST", "/auth/email/request", None, 403, "auth_csrf_failed"),
    (
        "verifyEmailOwnership",
        "POST",
        "/auth/email/verify",
        {"token": private_token_input},
        403,
        "auth_csrf_failed",
    ),
    (
        "requestPasswordReset",
        "POST",
        "/auth/password/request",
        {"email": "native@example.invalid"},
        403,
        "auth_csrf_failed",
    ),
    (
        "resetPassword",
        "POST",
        "/auth/password/reset",
        {"token": private_token_input, "new_password": private_password_input},
        403,
        "auth_csrf_failed",
    ),
    (
        "deactivateAccount",
        "POST",
        "/auth/deactivate",
        {"current_password": private_password_input},
        403,
        "auth_csrf_failed",
    ),
    ("getAdminAccess", "GET", "/admin/access", None, 401, "unauthenticated"),
]:
    example(
        operation,
        method,
        path,
        {
            "error": {
                "code": code,
                "message": "Illustrative denial; private inputs required.",
                "details": [],
            },
            "request_id": f"contract-{operation}",
        },
        body=body,
        status=status,
    )
    if method == "POST":
        cases[-1]["request"]["identity"] = "connected; exact allowed Origin; missing CSRF challenge"

errors = [
    {
        "status": status,
        "body": {
            "error": {"code": code, "message": message, "details": []},
            "request_id": f"demo-request-{status}",
        },
    }
    for status, code, message in [
        (401, "unauthenticated", "Identity required."),
        (403, "lender_required", "Lender enrollment required."),
        (404, "not_found", "Product not found."),
        (409, "stale_version", "Refresh before saving."),
        (422, "validation_error", "Check the submitted fields."),
        (429, "rate_limited", "Try again later."),
        (503, "dependency_unavailable", "Service temporarily unavailable."),
    ]
]
write("taxonomy.json", taxonomy)
write("manifest.json", manifest)
write("examples.json", {"contract_version": CONTRACT_VERSION, "cases": cases, "errors": errors})
public = ROOT / "apps/web/public/fixtures"
public.mkdir(parents=True, exist_ok=True)
if "--check" in sys.argv:
    if (public / "garment-placeholder.svg").read_bytes() != (
        HERE / "media/garment-placeholder.svg"
    ).read_bytes():
        raise SystemExit("Public placeholder drift")
else:
    (public / "garment-placeholder.svg").write_bytes(
        (HERE / "media/garment-placeholder.svg").read_bytes()
    )
print(f"Wrote 8 roots, 40 leaves, {len(products)} garments and {len(cases)} operation examples")
