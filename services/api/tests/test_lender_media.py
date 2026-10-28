"""Owned disposable PG17 + private temporary synthetic images; no real mail/provider."""

import os
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest
from conftest import TAXONOMY, write_body
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import Engine, event, func, select, update
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.orm import Session
from test_media_files import pixels
from test_native_auth import Mailbox, csrf, mutate, verified
from test_native_auth import mailbox as mailbox
from test_native_auth import password as password
from test_native_auth_acl import acl as acl
from test_native_auth_migrations import migration_db as migration_db

from dzirent_api import orm
from dzirent_api.db import session_factory
from dzirent_api.media_cleanup import cleanup
from dzirent_api.media_storage import PrivateFiles


@pytest.fixture
def native(make_client: Any, mailbox: Mailbox, tmp_path: Path) -> TestClient:
    return make_client(
        mode="connected",
        identity_mode="native",
        auth_web_origin="http://127.0.0.1:3500",
        auth_email_backend="smtp",
        auth_smtp_host="unused.localhost",
        auth_email_sender="media74@dzirent.com",
        media_backend="filesystem",
        media_root=str(tmp_path),
    )


def lender(
    client: TestClient,
    mailbox: Mailbox,
    password: SecretStr,
    email: str = "media74-one@mail.dzirent.com",
) -> dict[str, Any]:
    verified(client, mailbox, password, email)
    assert (
        mutate(
            client,
            "/me/lender-profile",
            {
                "display_name": "Local media fixture",
                "metro_id": TAXONOMY["locations"]["items"][0]["id"],
            },
        ).status_code
        == 200
    )
    created = mutate(client, "/lender/products", write_body(image_ids=[], status="draft"))
    assert created.status_code == 201, created.text
    return dict(created.json())


def intent(
    client: TestClient, product: dict[str, Any], data: bytes | None = None, **overrides: Any
) -> Any:
    return mutate(
        client,
        f"/lender/products/{product['id']}/images/upload-intent",
        {
            "filename": "private-photo.jpg",
            "content_type": "image/jpeg",
            "size_bytes": len(data or pixels()),
            "rights_confirmed": True,
            **overrides,
        },
    )


def put(
    client: TestClient,
    product: dict[str, Any],
    upload: dict[str, Any],
    data: bytes | None = None,
    **headers: str,
) -> Any:
    return client.put(
        f"/api/v1/lender/products/{product['id']}/images/uploads/{upload['upload_id']}",
        content=data or pixels(),
        headers={
            "Origin": client.app.state.settings.auth_web_origin,
            "X-Dzirent-CSRF": csrf(client),
            "Content-Type": "image/jpeg",
            **headers,
        },
    )


def complete(
    client: TestClient, product: dict[str, Any], upload: dict[str, Any], **overrides: Any
) -> Any:
    return mutate(
        client,
        f"/lender/products/{product['id']}/images/complete",
        {
            "upload_id": upload["upload_id"],
            "alt_text": "Garment hanging clearly against a plain wall",
            "expected_version": product["version"],
            **overrides,
        },
    )


def content_path(product: dict[str, Any]) -> str:
    return str(product["images"][0]["url"]).replace("/auth/api/", "/api/v1/")


def test_real_bytes_attach_stay_private_and_survive_api_restart(
    native: TestClient, mailbox: Mailbox, password: SecretStr, make_client: Any
) -> None:
    product = lender(native, mailbox, password)
    upload = intent(native, product).json()
    assert upload["max_size_bytes"] == 4_000_000
    assert upload["expires_at"]
    assert put(native, product, upload).status_code == 200
    response = complete(native, product, upload)
    assert response.status_code == 200, response.text
    saved = response.json()
    assert saved["status"] == "draft" and saved["version"] == product["version"] + 1
    assert saved["images"][0]["media_status"] == "ready"
    assert "object_key" not in response.text
    read = native.get(content_path(saved))
    assert read.status_code == 200 and read.headers["content-type"] == "image/jpeg"
    assert read.headers["cache-control"] == "no-store"
    restarted = make_client(
        **{
            name: getattr(native.app.state.settings, name)
            for name in [
                "mode",
                "identity_mode",
                "auth_web_origin",
                "auth_email_backend",
                "auth_smtp_host",
                "auth_email_sender",
                "media_backend",
                "media_root",
            ]
        }
    )
    restarted.cookies.update(native.cookies)
    refreshed = restarted.get(f"/api/v1/lender/products/{product['id']}")
    assert refreshed.status_code == 200 and refreshed.json()["images"] == saved["images"]
    assert restarted.get(content_path(saved)).content == read.content
    # A lost completion acknowledgement is retryable without another image/version increment.
    assert complete(native, product, upload).json() == saved
    native.cookies.clear()
    assert native.get(content_path(saved)).status_code == 404


def test_cross_account_and_inline_image_reuse_are_denied(
    native: TestClient, mailbox: Mailbox, password: SecretStr, make_client: Any
) -> None:
    product = lender(native, mailbox, password)
    upload = intent(native, product).json()
    assert put(native, product, upload).status_code == 200
    saved = complete(native, product, upload).json()
    other = make_client(
        mode="connected",
        identity_mode="native",
        auth_web_origin="http://127.0.0.1:3500",
        auth_email_backend="smtp",
        auth_smtp_host="unused.localhost",
        auth_email_sender="media74@dzirent.com",
        media_backend="filesystem",
        media_root=native.app.state.settings.media_root,
    )
    own = lender(other, mailbox, password, "media74-two@mail.dzirent.com")
    assert intent(other, product).status_code == 404
    assert put(other, product, upload).status_code == 404
    assert complete(other, product, upload).status_code == 404
    assert complete(other, own, upload).status_code == 404
    assert other.get(content_path(saved)).status_code == 404
    reuse = mutate(
        other,
        f"/lender/products/{own['id']}",
        {
            "expected_version": own["version"],
            "data": write_body(status="draft", image_ids=[saved["images"][0]["id"]]),
        },
        method="PATCH",
    )
    assert reuse.status_code == 422


def test_publishing_is_separate_and_deactivation_hides_photo(
    native: TestClient, mailbox: Mailbox, password: SecretStr, make_client: Any
) -> None:
    product = lender(native, mailbox, password)
    upload = intent(native, product).json()
    assert put(native, product, upload).status_code == 200
    saved = complete(native, product, upload).json()
    anonymous = make_client(
        media_backend="filesystem", media_root=native.app.state.settings.media_root
    )
    assert anonymous.get(content_path(saved)).status_code == 404
    published = mutate(
        native,
        f"/lender/products/{product['id']}",
        {
            "expected_version": saved["version"],
            "data": write_body(status="published", image_ids=[saved["images"][0]["id"]]),
        },
        method="PATCH",
    )
    assert published.status_code == 200
    assert anonymous.get(content_path(saved)).status_code == 200
    assert (
        mutate(
            native, "/auth/deactivate", {"current_password": password.get_secret_value()}
        ).status_code
        == 204
    )
    assert anonymous.get(content_path(saved)).status_code == 404
    assert intent(native, product).status_code == 401


def test_transport_consent_expiry_corruption_and_version_recovery(
    native: TestClient, mailbox: Mailbox, password: SecretStr, db: Engine
) -> None:
    product = lender(native, mailbox, password)
    assert intent(native, product, rights_confirmed=False).status_code == 422
    assert intent(native, product, size_bytes=4_000_001).status_code == 413
    upload = intent(native, product).json()
    route = f"/api/v1/lender/products/{product['id']}/images/uploads/{upload['upload_id']}"
    assert (
        native.put(
            route,
            content=pixels(),
            headers={
                "Origin": native.app.state.settings.auth_web_origin,
                "Content-Type": "image/jpeg",
            },
        ).status_code
        == 403
    )
    assert put(native, product, upload, Origin="https://foreign.example.invalid").status_code == 403
    assert put(native, product, upload, **{"Content-Type": "application/json"}).status_code == 415
    assert complete(native, product, upload).status_code == 409
    assert put(native, product, upload, data=b"not a photo").status_code == 422
    assert put(native, product, upload).status_code == 200
    assert put(native, product, upload).status_code == 409
    assert complete(native, product, upload, expected_version=999).status_code == 409
    with session_factory(db).begin() as session:
        row = session.get(orm.MediaUpload, upload["upload_id"])
        assert row and row.status == "uploaded" and row.object_key
        path = Path(native.app.state.settings.media_root) / row.object_key
    original = path.read_bytes()
    path.write_bytes(b"corrupt")
    assert complete(native, product, upload).status_code == 503
    path.write_bytes(original)
    assert complete(native, product, upload).status_code == 200
    expired = intent(native, product).json()
    with session_factory(db).begin() as session:
        now = datetime.now(UTC)
        session.execute(
            update(orm.MediaUpload)
            .where(orm.MediaUpload.id == expired["upload_id"])
            .values(created_at=now - timedelta(minutes=11), expires_at=now - timedelta(minutes=1))
        )
    assert put(native, product, expired).status_code == 409


def test_commit_failure_leaves_no_attachment_or_untracked_file(
    native: TestClient, mailbox: Mailbox, password: SecretStr, db: Engine
) -> None:
    product = lender(native, mailbox, password)
    upload = intent(native, product).json()

    def reject_commit(session: Session) -> None:
        if any(
            isinstance(row, orm.MediaUpload) and row.status == "uploaded" for row in session.dirty
        ):
            raise RuntimeError("simulated local media commit failure")

    event.listen(Session, "before_commit", reject_commit)
    try:
        assert put(native, product, upload).status_code == 500
    finally:
        event.remove(Session, "before_commit", reject_commit)
    assert list(Path(native.app.state.settings.media_root).iterdir()) == []
    with db.connect() as connection:
        assert connection.scalar(select(orm.MediaUpload.status)) == "pending"
    assert put(native, product, upload).status_code == 200


def test_concurrent_reservations_do_not_exceed_image_limit(
    native: TestClient, mailbox: Mailbox, password: SecretStr, db: Engine
) -> None:
    product = lender(native, mailbox, password)
    headers = {"Origin": native.app.state.settings.auth_web_origin, "X-Dzirent-CSRF": csrf(native)}

    def reserve(_: int) -> int:
        return native.post(
            f"/api/v1/lender/products/{product['id']}/images/upload-intent",
            headers=headers,
            json={
                "filename": "photo.jpg",
                "content_type": "image/jpeg",
                "size_bytes": 100,
                "rights_confirmed": True,
            },
        ).status_code

    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(reserve, range(14)))
    assert results.count(200) == 12 and results.count(409) == 2
    with db.connect() as connection:
        assert connection.scalar(select(func.count()).select_from(orm.MediaUpload)) == 12


def test_cleanup_is_bounded_dry_run_and_preserves_attached_files(
    native: TestClient, mailbox: Mailbox, password: SecretStr, db: Engine
) -> None:
    product = lender(native, mailbox, password)
    upload = intent(native, product).json()
    assert put(native, product, upload).status_code == 200
    saved = complete(native, product, upload).json()
    backend = PrivateFiles(Path(native.app.state.settings.media_root))
    orphan, unknown = uuid4().hex + ".jpg", "keep-owner-file.txt"
    backend.put(orphan, pixels())
    (backend.root / unknown).write_text("unrelated", encoding="utf-8")
    old = (datetime.now(UTC) - timedelta(days=2)).timestamp()
    for path in backend.root.iterdir():
        os.utime(path, (old, old))
    with session_factory(db)() as session:
        assert cleanup(session, backend)["candidates"] == 1
        assert (backend.root / orphan).exists()
        assert cleanup(session, backend, apply=True)["removed"] == 1
    assert (backend.root / unknown).exists()
    assert native.get(content_path(saved)).status_code == 200


def test_media_migration_denies_immutable_runtime_columns_and_unexpected_reader(acl: Any) -> None:
    for column in [
        "id",
        "product_id",
        "lender_profile_id",
        "content_type",
        "declared_size",
        "rights_confirmed",
        "created_at",
        "expires_at",
    ]:
        with acl["app"].begin() as connection, pytest.raises(ProgrammingError):
            connection.exec_driver_sql(f"UPDATE media_uploads SET {column} = {column}")
    with acl["reader"].begin() as connection, pytest.raises(ProgrammingError):
        connection.exec_driver_sql("SELECT * FROM media_uploads")


def test_disabled_media_fails_closed(
    make_client: Any, mailbox: Mailbox, password: SecretStr
) -> None:
    client = make_client(
        mode="connected",
        identity_mode="native",
        auth_web_origin="http://127.0.0.1:3500",
        auth_email_backend="smtp",
        auth_smtp_host="unused.localhost",
        auth_email_sender="media74@dzirent.com",
    )
    product = lender(client, mailbox, password)
    assert intent(client, product).status_code == 503
