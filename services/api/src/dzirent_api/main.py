from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .auth.dispatch import DeliveryDispatcher
from .auth.security import NativeTransportMiddleware
from .contract import include_routes
from .db import create_db_engine, session_factory
from .errors import install_error_handlers
from .identity import build_verifier
from .models import CONTRACT_VERSION
from .observability import RequestContextMiddleware, configure_logging
from .settings import Settings


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    configure_logging(settings.log_level)
    engine = create_db_engine(settings)
    delivery = DeliveryDispatcher() if settings.mode == "connected" else None

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        try:
            yield
        finally:
            if delivery is not None:
                delivery.close()
            if engine is not None:
                engine.dispose()

    interactive_docs = not settings.deployed
    app = FastAPI(
        title="dzirent API",
        version=CONTRACT_VERSION,
        lifespan=lifespan,
        docs_url="/docs" if interactive_docs else None,
        redoc_url=None,
        openapi_url="/openapi.json" if interactive_docs else None,
    )
    app.state.settings = settings
    app.state.engine = engine
    app.state.auth_delivery = delivery
    app.state.sessionmaker = session_factory(engine) if engine is not None else None
    app.state.verifier = build_verifier(settings)
    install_error_handlers(app)
    include_routes(app)
    app.add_middleware(NativeTransportMiddleware)
    app.add_middleware(RequestContextMiddleware)
    # Added last so it is outermost: error and 500 responses still carry CORS headers.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
        max_age=600,
    )
    return app


app = create_app()
