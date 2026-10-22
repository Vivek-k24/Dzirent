from collections.abc import Iterator

from fastapi import Request
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from .errors import unavailable
from .settings import Settings


def normalize_url(url: str) -> str:
    # Hosted providers hand out libpq URLs; SQLAlchemy needs the psycopg 3 dialect name.
    for prefix in ("postgresql://", "postgres://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix) :]
    return url


def create_db_engine(settings: Settings) -> Engine | None:
    url = settings.database_url.get_secret_value()
    if not url:
        return None
    return create_engine(
        normalize_url(url),
        pool_pre_ping=True,
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_pool_size,
        pool_timeout=settings.db_connect_timeout_s,
        hide_parameters=True,
        connect_args={
            "connect_timeout": settings.db_connect_timeout_s,
            "options": f"-c statement_timeout={settings.db_statement_timeout_ms}",
            "application_name": "dzirent-api",
        },
    )


def session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(engine, expire_on_commit=False, autoflush=False)


def get_session(request: Request) -> Iterator[Session]:
    factory: sessionmaker[Session] | None = request.app.state.sessionmaker
    if factory is None:
        raise unavailable("Database is not configured.")
    with factory() as session:
        session.info["auth_delivery"] = getattr(request.app.state, "auth_delivery", None)
        yield session
