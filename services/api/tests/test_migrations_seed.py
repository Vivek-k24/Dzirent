"""Alembic head/metadata parity, upgrade/downgrade on PostgreSQL and seed repeatability."""

from typing import Any

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from conftest import MANIFEST, SEED_LENDER, alembic_config, enroll, reset, write_body
from fastapi.testclient import TestClient
from sqlalchemy import Engine, inspect, text

from dzirent_api.db import session_factory
from dzirent_api.health import EXPECTED_SCHEMA_REVISION
from dzirent_api.orm import Base
from dzirent_api.seed import SeedRefused, check_allowed, seed
from dzirent_api.settings import Settings

SEEDED_TABLES = [
    "metros",
    "metro_postal_codes",
    "categories",
    "brands",
    "colors",
    "sizes",
    "users",
    "user_roles",
    "lender_profiles",
    "products",
    "product_categories",
    "product_colors",
    "product_measurements",
    "product_images",
    "product_unavailability",
]


def snapshot(engine: Engine) -> dict[str, list[tuple[Any, ...]]]:
    with engine.connect() as connection:
        return {
            table: sorted(
                (tuple(row) for row in connection.execute(text(f"SELECT * FROM {table}"))), key=repr
            )
            for table in SEEDED_TABLES
        }


def test_single_head_matches_readiness_expectation(database_url: str) -> None:
    heads = ScriptDirectory.from_config(alembic_config(database_url)).get_heads()
    assert heads == [EXPECTED_SCHEMA_REVISION]


def test_migrations_match_orm_metadata(engine: Engine) -> None:
    with engine.connect() as connection:
        diff = compare_metadata(MigrationContext.configure(connection), Base.metadata)
    assert diff == []


def test_no_later_phase_or_credential_tables(engine: Engine) -> None:
    tables = set(inspect(engine).get_table_names())
    for later in ("rental_requests", "evidence_objects", "outbox_events", "payments", "passwords"):
        assert later not in tables


def test_downgrade_and_upgrade_round_trip(database_url: str, engine: Engine) -> None:
    config = alembic_config(database_url)
    command.downgrade(config, "base")
    assert set(inspect(engine).get_table_names()) <= {"alembic_version"}
    command.upgrade(config, "head")
    command.upgrade(config, "head")  # already at head: no-op
    with engine.connect() as connection:
        assert connection.execute(text("SELECT version_num FROM alembic_version")).scalar() == (
            EXPECTED_SCHEMA_REVISION
        )
    reset(engine)


def test_seed_cardinalities(db: Engine) -> None:
    with db.connect() as connection:

        def scalar(sql: str) -> Any:
            return connection.execute(text(sql)).scalar()

        assert scalar("SELECT count(*) FROM categories WHERE parent_id IS NULL") == 8
        assert scalar("SELECT count(*) FROM categories WHERE parent_id IS NOT NULL") == 40
        assert scalar("SELECT count(*) FROM products") == 40
        assert scalar("SELECT count(DISTINCT lender_profile_id) FROM products") == 1
        assert scalar("SELECT count(*) FROM lender_profiles") == 1
        per_root = (
            connection.execute(
                text(
                    "SELECT count(*) FROM products p JOIN categories c ON c.id = p.primary_category_id "
                    "GROUP BY c.parent_id"
                )
            )
            .scalars()
            .all()
        )
        assert sorted(per_root) == [5] * 8
        assert (
            scalar(
                "SELECT count(*) FROM categories c WHERE c.parent_id IS NOT NULL AND NOT EXISTS "
                "(SELECT 1 FROM products p WHERE p.primary_category_id = c.id)"
            )
            == 0
        )


def test_seed_is_idempotent_restorative_and_preserves_user_rows(
    db: Engine, client: TestClient
) -> None:
    before = snapshot(db)
    with session_factory(db)() as session, session.begin():
        seed(session)
    assert snapshot(db) == before

    seed_product = MANIFEST["products"][3]
    edited = client.patch(
        f"/api/v1/lender/products/{seed_product['id']}",
        headers=SEED_LENDER,
        json={"expected_version": 1, "is_available": False},
    )
    assert edited.status_code == 200
    headers = enroll(client, "user-row")
    created = client.post("/api/v1/lender/products", headers=headers, json=write_body(image_ids=[]))
    assert created.status_code == 201

    with session_factory(db)() as session, session.begin():
        seed(session)
    restored = client.get(f"/api/v1/lender/products/{seed_product['id']}", headers=SEED_LENDER)
    assert restored.json()["version"] == 1
    assert restored.json()["is_available"] is seed_product["is_available"]
    kept = client.get(f"/api/v1/lender/products/{created.json()['id']}", headers=headers)
    assert kept.status_code == 200 and kept.json() == created.json()


@pytest.mark.parametrize(
    "environment,disposable,allowed",
    [
        ("local", False, True),
        ("test", False, True),
        ("staging", False, False),
        ("staging", True, True),
        ("production", True, False),
    ],
)
def test_seed_is_restricted_to_disposable_environments(
    environment: str, disposable: bool, allowed: bool
) -> None:
    settings = Settings.model_construct(environment=environment)
    if allowed:
        check_allowed(settings, disposable_staging=disposable)
    else:
        with pytest.raises(SeedRefused):
            check_allowed(settings, disposable_staging=disposable)
