"""OpenAPI source from real runtime routers; disabled dependencies fail closed."""

from typing import Any

from fastapi import FastAPI

from . import catalog, listings, media, profiles, studios
from .auth.router import router as auth_router
from .health import router as health_router
from .models import (
    CONTRACT_VERSION,
    Error,
)

COMMON_ERRORS: dict[int | str, dict[str, Any]] = {
    status: {"model": Error, "description": description}
    for status, description in {
        400: "Interrupted request",
        413: "Photo or request too large",
        415: "Unsupported photo or request type",
        401: "Missing or invalid identity",
        403: "Lender enrollment required",
        404: "Missing or not owned (non-enumerating)",
        409: "Stale version",
        422: "Invalid input",
        429: "Rate limited",
        503: "Dependency unavailable",
    }.items()
}


def include_routes(app: FastAPI, *, contract_only: bool = False) -> None:
    app.include_router(health_router, responses=COMMON_ERRORS)
    for router in (
        catalog.router,
        profiles.router,
        listings.router,
        studios.router,
        studios.owner_router,
        auth_router,
        media.router,
    ):
        app.include_router(router, responses=COMMON_ERRORS)


def create_contract_app() -> FastAPI:
    app = FastAPI(title="dzirent candidate API", version=CONTRACT_VERSION)
    include_routes(app, contract_only=True)
    return app
