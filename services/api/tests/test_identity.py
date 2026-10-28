"""Identity boundary: native cookies and strictly isolated local demo bearer identities."""

from typing import Any

import pytest

from dzirent_api.identity import MockVerifier, build_verifier
from dzirent_api.settings import Settings


def test_local_demo_mock_identity_is_unchanged() -> None:
    settings = Settings(_env_file=None, mode="demo", environment="local", identity_mode="mock")
    user = MockVerifier(settings).verify("Bearer mock:sample-lender")
    assert user.provider == "mock"
    assert user.subject == "sample-lender"


@pytest.mark.parametrize("token", [None, "Bearer mock:sample-lender", "Bearer unsigned-token"])
def test_connected_identity_does_not_accept_demo_or_unsigned_bearer(
    token: str | None, make_client: Any
) -> None:
    client = make_client(
        mode="connected",
        identity_mode="native",
    )
    headers = {"Authorization": token} if token else {}
    response = client.get("/api/v1/me", headers=headers)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthenticated"


def test_native_identity_is_never_mock_verifier() -> None:
    settings = Settings(
        _env_file=None,
        mode="connected",
        identity_mode="native",
        auth_csrf_key="x" * 32,
        database_url="postgresql://unused:unused@127.0.0.1/unconnected",
    )
    assert not isinstance(build_verifier(settings), MockVerifier)
