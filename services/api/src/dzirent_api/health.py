import logging
from typing import Any

from fastapi import APIRouter, Request
from sqlalchemy import Engine, text
from sqlalchemy.exc import ProgrammingError, SQLAlchemyError

from .errors import error_response
from .models import Error, Health

router = APIRouter(prefix="/api/v1/health", tags=["health"])
log = logging.getLogger("dzirent.health")
# Must equal the single Alembic head; tests assert this.
EXPECTED_SCHEMA_REVISION = "0005_auth_email_outbox"


@router.get("/live", response_model=Health, operation_id="getLiveness")
def live() -> Health:
    return Health(status="live")


@router.get(
    "/ready", response_model=Health, responses={503: {"model": Error}}, operation_id="getReadiness"
)
def ready(request: Request) -> Any:
    # Reports only coarse state; never connection strings, hosts or driver messages.
    engine: Engine | None = request.app.state.engine
    if engine is None:
        return error_response(request, 503, "dependency_unavailable", "Database is not configured.")
    try:
        with engine.connect() as connection:
            revision = connection.execute(text("SELECT version_num FROM alembic_version")).scalar()
    except ProgrammingError:
        # Reachable database without the migration table.
        revision = None
    except SQLAlchemyError as exc:
        log.warning("readiness database check failed: %s", type(exc).__name__)
        return error_response(
            request, 503, "dependency_unavailable", "Database is temporarily unavailable."
        )
    if revision != EXPECTED_SCHEMA_REVISION:
        return error_response(
            request, 503, "schema_not_current", "Database schema migration is not current."
        )
    return Health(status="ready")
