"""Alembic environment. Run once per release as a serialized step, never per API replica."""

import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool

from dzirent_api.db import normalize_url
from dzirent_api.orm import Base

config = context.config
if config.config_file_name is not None and not config.attributes.get("skip_logging"):
    fileConfig(config.config_file_name, disable_existing_loggers=False)
target_metadata = Base.metadata


def database_url() -> str:
    url = (
        config.attributes.get("url")
        or context.get_x_argument(as_dictionary=True).get("url")
        or os.environ.get("DZIRENT_DATABASE_URL", "")
    )
    if not url:
        raise SystemExit("Set DZIRENT_DATABASE_URL (or -x url=...) to run migrations")
    return normalize_url(url)


def run_migrations_offline() -> None:
    context.configure(url=database_url(), target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(database_url(), poolclass=pool.NullPool, hide_parameters=True)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            # Serialize concurrent migration attempts against the same database.
            connection.exec_driver_sql("SELECT pg_advisory_xact_lock(724100118)")
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
