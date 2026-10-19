"""OpenAPI source: the runtime routers plus contract-only media declarations.

Upload intents belong to the connected media milestone. They stay declared in the contract so
clients keep stable types, but they are not mounted at runtime and never act as a backend.
"""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, FastAPI, HTTPException

from . import catalog, listings, profiles, studios
from .health import router as health_router
from .identity import bearer
from .models import (
    CONTRACT_VERSION,
    Error,
    ProductDetail,
    UploadComplete,
    UploadIntent,
    UploadIntentRequest,
)

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
media_declarations = APIRouter(prefix="/api/v1", dependencies=[Depends(bearer)])


def declared_only() -> Any:
    raise HTTPException(501, "Candidate declaration; not implemented")


@media_declarations.post(
    "/lender/products/{id}/images/upload-intent",
    response_model=UploadIntent,
    operation_id="createUploadIntent",
)
def upload_intent(id: UUID, body: UploadIntentRequest) -> Any:
    return declared_only()


@media_declarations.post(
    "/lender/products/{id}/images/complete",
    response_model=ProductDetail,
    operation_id="completeUpload",
)
def complete_upload(id: UUID, body: UploadComplete) -> Any:
    return declared_only()


def include_routes(app: FastAPI, *, contract_only: bool = False) -> None:
    app.include_router(health_router, responses=COMMON_ERRORS)
    for router in (
        catalog.router,
        profiles.router,
        listings.router,
        studios.router,
        studios.owner_router,
    ):
        app.include_router(router, responses=COMMON_ERRORS)
    if contract_only:
        app.include_router(media_declarations, responses=COMMON_ERRORS)


def create_contract_app() -> FastAPI:
    app = FastAPI(title="dzirent candidate API", version=CONTRACT_VERSION)
    include_routes(app, contract_only=True)
    return app
