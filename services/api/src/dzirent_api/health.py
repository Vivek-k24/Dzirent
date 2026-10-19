from uuid import uuid4

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from .models import Error, ErrorBody, Health

router = APIRouter(prefix="/api/v1/health", tags=["health"])


@router.get("/live", response_model=Health, operation_id="getLiveness")
def live() -> Health:
    return Health(status="live")


@router.get(
    "/ready", response_model=Health, responses={503: {"model": Error}}, operation_id="getReadiness"
)
def ready() -> JSONResponse:
    return JSONResponse(
        status_code=503,
        content=Error(
            error=ErrorBody(
                code="foundation_not_connected",
                message="Database readiness is not implemented in Phase 0.",
            ),
            request_id=str(uuid4()),
        ).model_dump(),
    )
