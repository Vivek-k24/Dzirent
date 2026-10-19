"""Schema-only declarations. Never mount this router as a working CRUD backend."""

from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query
from fastapi.security import HTTPBearer

from .models import (
    CONTRACT_VERSION,
    CategoryTree,
    CurrentUser,
    Error,
    Facets,
    LenderEnrollment,
    LenderProductPage,
    LenderProfile,
    MetroList,
    Preferences,
    ProductDetail,
    ProductPage,
    ProductPatch,
    ProductWrite,
    ProfilePatch,
    Sort,
    UploadComplete,
    UploadIntent,
    UploadIntentRequest,
)

router = APIRouter(prefix="/api/v1")
bearer = HTTPBearer()
COMMON_ERRORS: dict[int | str, dict[str, Any]] = {
    status: {"model": Error, "description": description}
    for status, description in {
        401: "Missing or invalid identity",
        403: "Lender enrollment required",
        404: "Missing or not owned (non-enumerating)",
        409: "Stale version",
        422: "Invalid input",
        429: "Rate limited",
        503: "Dependency unavailable",
    }.items()
}


def declared_only() -> Any:
    raise HTTPException(501, "Candidate declaration; not implemented")


def catalog_query(
    q: str | None = Query(default=None, max_length=200),
    collection: str | None = None,
    category: Annotated[list[str] | None, Query()] = None,
    subcategory: str | None = None,
    brand: Annotated[list[UUID] | None, Query()] = None,
    color: Annotated[list[str] | None, Query()] = None,
    band: Annotated[list[str] | None, Query()] = None,
    size: Annotated[list[UUID] | None, Query()] = None,
    start: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    end: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    metro: str | None = None,
    zip: str | None = Query(default=None, pattern=r"^\d{5}$"),
    sort: Sort = "featured",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=40, ge=1, le=100),
) -> None:
    """Query declaration only. Semantic validation belongs to the implementation."""


@router.get(
    "/catalog/products",
    response_model=ProductPage,
    operation_id="listCatalogProducts",
    dependencies=[Depends(catalog_query)],
)
def list_products() -> Any:
    return declared_only()


@router.get(
    "/catalog/products/{slug}", response_model=ProductDetail, operation_id="getCatalogProduct"
)
def get_product(slug: str) -> Any:
    return declared_only()


@router.get("/catalog/categories", response_model=CategoryTree, operation_id="getCategoryTree")
def categories() -> Any:
    return declared_only()


@router.get("/catalog/facets", response_model=Facets, operation_id="getCatalogFacets")
def facets(category: Annotated[list[str] | None, Query()] = None) -> Any:
    return declared_only()


@router.get("/locations/metros", response_model=MetroList, operation_id="getMetros")
def metros() -> Any:
    return declared_only()


protected = APIRouter(dependencies=[Depends(bearer)])


@protected.post("/me/bootstrap", response_model=CurrentUser, operation_id="bootstrapMe")
def bootstrap_me() -> Any:
    return declared_only()


@protected.get("/me", response_model=CurrentUser, operation_id="getMe")
def get_me() -> Any:
    return declared_only()


@protected.patch("/me", response_model=CurrentUser, operation_id="updateMe")
def update_me(body: ProfilePatch) -> Any:
    return declared_only()


@protected.delete("/me", response_model=CurrentUser, operation_id="deactivateMe")
def deactivate_me() -> Any:
    return declared_only()


@protected.get("/me/preferences", response_model=Preferences, operation_id="getPreferences")
def get_preferences() -> Any:
    return declared_only()


@protected.patch("/me/preferences", response_model=Preferences, operation_id="updatePreferences")
def update_preferences(body: Preferences) -> Any:
    return declared_only()


@protected.post("/me/lender-profile", response_model=LenderProfile, operation_id="enrollLender")
def enroll_lender(body: LenderEnrollment) -> Any:
    return declared_only()


@protected.get(
    "/lender/products", response_model=LenderProductPage, operation_id="listLenderProducts"
)
def owner_products(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=40, ge=1, le=100),
    q: str | None = Query(default=None, max_length=200),
) -> Any:
    return declared_only()


@protected.post(
    "/lender/products",
    response_model=ProductDetail,
    status_code=201,
    operation_id="createLenderProduct",
)
def create_product(body: ProductWrite) -> Any:
    return declared_only()


@protected.get(
    "/lender/products/{id}", response_model=ProductDetail, operation_id="getLenderProduct"
)
def owner_product(id: UUID) -> Any:
    return declared_only()


@protected.patch(
    "/lender/products/{id}", response_model=ProductDetail, operation_id="updateLenderProduct"
)
def update_product(id: UUID, body: ProductPatch) -> Any:
    return declared_only()


@protected.delete(
    "/lender/products/{id}", response_model=ProductDetail, operation_id="archiveLenderProduct"
)
def archive_product(id: UUID, expected_version: int = Query(ge=1)) -> Any:
    return declared_only()


@protected.post(
    "/lender/products/{id}/images/upload-intent",
    response_model=UploadIntent,
    operation_id="createUploadIntent",
)
def upload_intent(id: UUID, body: UploadIntentRequest) -> Any:
    return declared_only()


@protected.post(
    "/lender/products/{id}/images/complete",
    response_model=ProductDetail,
    operation_id="completeUpload",
)
def complete_upload(id: UUID, body: UploadComplete) -> Any:
    return declared_only()


router.include_router(protected)


def create_contract_app() -> FastAPI:
    # Imported lazily so runtime configuration never executes during schema generation.
    from .health import router as health_router

    app = FastAPI(title="dzirent candidate API", version=CONTRACT_VERSION)
    app.include_router(health_router, responses=COMMON_ERRORS)
    app.include_router(router, responses=COMMON_ERRORS)
    return app
