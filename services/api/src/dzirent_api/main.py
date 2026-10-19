from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .health import router
from .models import CONTRACT_VERSION
from .settings import Settings

settings = Settings()
app = FastAPI(title="dzirent foundation health", version=CONTRACT_VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET"],
    allow_headers=["Authorization"],
)
app.include_router(router)
