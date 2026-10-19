import asyncio

import httpx
import pytest
from pydantic import ValidationError

from dzirent_api.models import ProductWrite
from dzirent_api.settings import Settings


@pytest.mark.parametrize(
    "mode,environment", [("connected", "local"), ("demo", "staging"), ("demo", "production")]
)
def test_mock_identity_refused(mode: str, environment: str) -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, mode=mode, environment=environment, identity_mode="mock")


def test_connected_missing_dependencies_refused() -> None:
    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            mode="connected",
            identity_mode="clerk",
            database_url="",
            clerk_issuer="",
            clerk_authorized_parties=[],
        )


def test_unknown_mode_refused() -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, mode="automatic")


def test_health_does_not_claim_database_readiness(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DZIRENT_MODE", "demo")
    monkeypatch.setenv("DZIRENT_ENVIRONMENT", "test")
    monkeypatch.setenv("DZIRENT_IDENTITY_MODE", "mock")
    from dzirent_api.main import app

    async def exercise() -> None:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app), base_url="http://foundation.test"
        ) as client:
            assert (await client.get("/api/v1/health/live")).status_code == 200
            response = await client.get("/api/v1/health/ready")
            assert response.status_code == 503
            assert response.json()["error"]["code"] == "foundation_not_connected"
            assert (await client.get("/api/v1/catalog/products")).status_code == 404

    asyncio.run(exercise())


def test_write_model_has_no_client_supplied_owner_or_roles() -> None:
    assert not (
        {"user_id", "lender_profile_id", "roles", "admin"} & ProductWrite.model_fields.keys()
    )


def test_wildcard_cors_refused() -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, cors_origins=["https://*.example.invalid"])
