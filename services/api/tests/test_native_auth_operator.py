"""Fabricated local identities only; protected password input, audit and safe operator gates."""

import argparse
import json
import secrets
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import UUID

import pytest
from conftest import TAXONOMY, settings_for
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import Engine, func, select, update
from test_native_auth import ORIGIN, Mailbox, verified
from test_native_auth import mailbox as mailbox
from test_native_auth import native as native
from test_native_auth import password as password

from dzirent_api import orm
from dzirent_api.auth import crypto, operator


def arguments(**overrides: Any) -> argparse.Namespace:
    return argparse.Namespace(
        **{
            "execute": True,
            "expected_host": "127.0.0.1",
            "synthetic_email_policy": "operator-asserted-no-mail",
            "metro_id": UUID(TAXONOMY["locations"]["items"][0]["id"]),
            **overrides,
        }
    )


@pytest.mark.parametrize(
    "database",
    [
        "dzirent_staging_test",
        "dzirent_staging62_test",
        "dzirent_prod_test",
        'bad";DROP_test',
        "dzirent_staging",
        "x" * 64 + "_test",
    ],
)
def test_operator_refuses_unsafe_test_target(
    database: str, database_url: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    from sqlalchemy.engine import make_url

    url = make_url(database_url).set(database=database)
    settings = settings_for(
        url.render_as_string(hide_password=False),
        mode="connected",
        identity_mode="native",
        auth_web_origin=ORIGIN,
    )
    monkeypatch.setenv("DZIRENT_AUTH_OPERATOR_ACK", operator.ACK)
    monkeypatch.setattr(operator, "Settings", lambda: settings)
    with pytest.raises(SystemExit):
        operator.guarded_settings(arguments())


@pytest.mark.parametrize("failure", ["ack", "execute", "host", "environment", "mode", "libpq"])
def test_operator_requires_explicit_local_authorization(
    failure: str, database_url: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = settings_for(
        database_url, mode="connected", identity_mode="native", auth_web_origin=ORIGIN
    )
    args = arguments()
    monkeypatch.setenv("DZIRENT_AUTH_OPERATOR_ACK", operator.ACK)
    if failure == "ack":
        monkeypatch.delenv("DZIRENT_AUTH_OPERATOR_ACK")
    elif failure == "execute":
        args.execute = False
    elif failure == "host":
        args.expected_host = "other.localhost"
    elif failure == "environment":
        settings = settings.model_copy(update={"environment": "production"})
    elif failure == "mode":
        settings = settings.model_copy(update={"mode": "demo"})
    else:
        monkeypatch.setenv("PGDATABASE", "dzirent_staging")
    monkeypatch.setattr(operator, "Settings", lambda: settings)
    with pytest.raises(SystemExit):
        operator.guarded_settings(args)


def test_synthetic_private_input_idempotence_and_mismatch(
    database_url: str,
    db: Engine,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    settings = settings_for(
        database_url, mode="connected", identity_mode="native", auth_web_origin=ORIGIN
    )
    private = SecretStr(secrets.token_urlsafe(24))
    monkeypatch.setattr(operator.getpass, "getpass", lambda _: private.get_secret_value())
    operator.synthetic_accounts(arguments(), settings)
    with db.connect() as connection:
        first = connection.execute(
            select(
                orm.AuthCredential.user_id,
                orm.AuthCredential.password_hash,
                orm.AuthCredential.synthetic,
            )
        ).all()
        assert len(first) == 2 and all(row.synthetic for row in first)
        assert len({row.password_hash for row in first}) == 2
    monkeypatch.setenv("DZIRENT_STAGING_TEST_PASSWORD", private.get_secret_value())
    operator.synthetic_accounts(arguments(), settings)
    assert "DZIRENT_STAGING_TEST_PASSWORD" not in __import__("os").environ
    with db.connect() as connection:
        assert (
            connection.execute(
                select(
                    orm.AuthCredential.user_id,
                    orm.AuthCredential.password_hash,
                    orm.AuthCredential.synthetic,
                )
            ).all()
            == first
        )
        assert connection.scalar(select(func.count()).select_from(orm.PlatformAdminGrant)) == 0
        assert set(connection.scalars(select(orm.UserRole.role))) == {"renter", "lender"}
    monkeypatch.setenv("DZIRENT_STAGING_TEST_PASSWORD", secrets.token_urlsafe(24))
    with pytest.raises(SystemExit, match="differs"):
        operator.synthetic_accounts(arguments(), settings)
    with db.connect() as connection:
        assert (
            connection.execute(
                select(
                    orm.AuthCredential.user_id,
                    orm.AuthCredential.password_hash,
                    orm.AuthCredential.synthetic,
                )
            ).all()
            == first
        )
    assert private.get_secret_value() not in capsys.readouterr().out


def test_operator_does_not_adopt_dormant_identity(
    database_url: str, db: Engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    from uuid import uuid4

    from dzirent_api.db import session_factory

    user_id = uuid4()
    with session_factory(db).begin() as session:
        session.add(
            orm.User(
                id=user_id,
                auth_provider="native",
                auth_subject=str(user_id),
                email=operator.RENTER,
                display_name="Dormant",
                status="active",
            )
        )
    monkeypatch.setenv("DZIRENT_STAGING_TEST_PASSWORD", secrets.token_urlsafe(24))
    with pytest.raises(SystemExit, match="no account was adopted"):
        operator.synthetic_accounts(
            arguments(),
            settings_for(
                database_url, mode="connected", identity_mode="native", auth_web_origin=ORIGIN
            ),
        )
    with db.connect() as connection:
        assert connection.scalar(select(func.count()).select_from(orm.AuthCredential)) == 0


def test_fabricated_admin_evidence_grant_expiry_revocation_audit(
    native: TestClient,
    mailbox: Mailbox,
    password: SecretStr,
    database_url: str,
    db: Engine,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    # This mailbox is a fabricated local row. No real admin password/account is read or changed.
    result = verified(native, mailbox, password, "admin@dzirent.com")
    user_id = UUID(result.json()["user"]["id"])
    assert native.get("/api/v1/admin/access").status_code == 403  # Email is not a privilege.
    from sqlalchemy.engine import make_url

    url = make_url(database_url)
    evidence = tmp_path / "private-local-evidence.json"
    evidence.write_text(
        json.dumps(
            {
                "user_id": str(user_id),
                "environment": "test",
                "database": url.database,
                "host": url.host,
                "owner_authorized": True,
                "trusted_creation_route": "fabricated-local-fixture",
                "ownership_verification_route": "in-memory-test-mail",
                "email": "admin@dzirent.com",
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(operator.getpass, "getpass", lambda _: str(user_id))
    args = arguments(
        user_id=user_id,
        identity_evidence=str(evidence),
        operator="local-test",
        reason="fabricated Phase 2A evidence",
        action="grant",
        days=1,
    )
    settings = settings_for(
        database_url, mode="connected", identity_mode="native", auth_web_origin=ORIGIN
    )
    operator.admin_grant(args, settings)
    operator.admin_grant(args, settings)
    assert native.get("/api/v1/admin/access").status_code == 200
    with db.connect() as connection:
        assert connection.scalar(select(func.count()).select_from(orm.PlatformAdminGrant)) == 1
        assert connection.scalar(select(func.count()).select_from(orm.PlatformAdminEvent)) == 1
        assert connection.scalar(
            select(orm.AuthCredential.password_hash)
        ) and crypto.verify_password(
            connection.scalar(select(orm.AuthCredential.password_hash)), password.get_secret_value()
        )
    with db.begin() as connection:
        connection.execute(
            update(orm.PlatformAdminGrant).values(
                expires_at=datetime.now(UTC) - timedelta(seconds=1)
            )
        )
    assert native.get("/api/v1/admin/access").status_code == 403
    operator.admin_grant(args, settings)
    args.action = "revoke"
    operator.admin_grant(args, settings)
    assert native.get("/api/v1/admin/access").status_code == 403
    with db.connect() as connection:
        assert connection.scalar(select(func.count()).select_from(orm.PlatformAdminEvent)) == 4
        assert all(
            row == crypto.digest(evidence.read_text())
            for row in connection.scalars(select(orm.PlatformAdminEvent.evidence_sha256))
        )
    evidence.unlink()
