"""Identity boundary tests: demo-only mock and deny-all native placeholder."""

import pytest
from fastapi.testclient import TestClient

from dzirent_api.identity import MockVerifier, build_verifier
from dzirent_api.main import create_app
from dzirent_api.settings import Settings


def test_local_demo_mock_identity_is_unchanged() -> None:
    settings = Settings(_env_file=None, mode="demo", environment="local", identity_mode="mock")
    user = MockVerifier(settings).verify("Bearer mock:sample-lender")
    assert user.provider == "mock"
    assert user.subject == "sample-lender"


@pytest.mark.parametrize("token", [None, "Bearer mock:sample-lender", "Bearer unsigned-token"])
def test_connected_identity_denies_all_until_native_sessions_exist(token: str | None) -> None:
    settings = Settings(
        _env_file=None,
        mode="connected",
        environment="staging",
        identity_mode="native",
        database_url="postgresql://unused:unused@127.0.0.1/unconnected",
        cors_origins=["https://app.dzirent.test"],
    )
    app = create_app(settings)
    with TestClient(app) as client:
        headers = {"Authorization": token} if token else {}
        response = client.post("/api/v1/me/bootstrap", headers=headers)
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "dependency_unavailable"
    assert "authentication is not available yet" in response.json()["error"]["message"]


def test_native_identity_is_never_mock_verifier() -> None:
    settings = Settings(
        _env_file=None,
        mode="connected",
        identity_mode="native",
        database_url="postgresql://unused:unused@127.0.0.1/unconnected",
    )
    assert not isinstance(build_verifier(settings), MockVerifier)
