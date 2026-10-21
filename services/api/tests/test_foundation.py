"""Startup guards and contract invariants that need no database."""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from dzirent_api.export_contract import render
from dzirent_api.models import ProductWrite
from dzirent_api.reference import BAND_LABELS, BANDS, UNMAPPED_METRO_SLUG
from dzirent_api.settings import Settings

ROOT = Path(__file__).resolve().parents[3]
NATIVE = {"identity_mode": "native"}



@pytest.mark.parametrize(
    "mode,environment", [("connected", "local"), ("demo", "staging"), ("demo", "production")]
)
def test_mock_identity_refused(mode: str, environment: str) -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, mode=mode, environment=environment, identity_mode="mock")


def test_connected_missing_database_refused() -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, mode="connected", identity_mode="native", database_url="")


def test_connected_mock_identity_refused() -> None:
    with pytest.raises(ValidationError):
        Settings(
            _env_file=None, mode="connected", identity_mode="mock",
            database_url="postgresql://u:p@db/x",
        )


def test_valid_connected_configuration_accepted() -> None:
    settings = Settings(
        _env_file=None,
        mode="connected",
        environment="production",
        database_url="postgresql://u:p@db/x",
        cors_origins=["https://app.dzirent.test"],
        **NATIVE,  # type: ignore[arg-type]
    )
    assert not settings.mock_identity_allowed and settings.deployed
    assert "u:p" not in repr(settings)



def test_unknown_mode_refused() -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, mode="automatic")


@pytest.mark.parametrize(
    "origins,environment",
    [
        (["https://*.example.invalid"], "local"),
        (["http://127.0.0.1:3000/"], "local"),
        (["http://127.0.0.1:3000/path"], "local"),
        (["*"], "local"),
        (["http://app.dzirent.test"], "production"),
    ],
)
def test_inexact_cors_refused(origins: list[str], environment: str) -> None:
    values: dict[str, object] = {"cors_origins": origins, "environment": environment}
    if environment == "production":
        values.update(NATIVE, mode="connected", database_url="postgresql://u:p@db/x")
    with pytest.raises(ValidationError):
        Settings(_env_file=None, **values)  # type: ignore[arg-type]


def test_write_model_has_no_client_supplied_owner_or_roles() -> None:
    assert not (
        {"user_id", "lender_profile_id", "roles", "admin", "id", "slug", "version"}
        & ProductWrite.model_fields.keys()
    )


def test_runtime_routes_reproduce_frozen_contract() -> None:
    assert render() == (ROOT / "contracts/openapi.json").read_text(encoding="utf-8")


def test_reference_configuration_matches_fixtures() -> None:
    taxonomy = json.loads((ROOT / "fixtures/catalog/taxonomy.json").read_text(encoding="utf-8"))
    bands = {
        b["id"]: (b["min_minor"], b["max_minor_exclusive"]) for b in taxonomy["facets"]["bands"]
    }
    assert bands == BANDS
    assert {b["id"]: b["label"] for b in taxonomy["facets"]["bands"]} == BAND_LABELS
    fallback = taxonomy["locations"]["unmapped_zip_metro_id"]
    assert next(m["slug"] for m in taxonomy["locations"]["items"] if m["id"] == fallback) == (
        UNMAPPED_METRO_SLUG
    )


def test_upload_intents_are_contract_only_not_mounted() -> None:
    from dzirent_api.main import create_app

    app = create_app(Settings(_env_file=None, environment="test", log_level="WARNING"))  # type: ignore[call-arg]
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/lender/products/00000000-0000-0000-0000-000000000000/images/upload-intent",
            json={},
        )
    assert response.status_code == 404
