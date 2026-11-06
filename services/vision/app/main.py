"""HTTP API: POST /scan and GET /health.

Cloud Run allows only signed-in Google callers (the vision-invoker service account, and the
owner for the eval), so this app does no authentication of its own. It is a pure function of
the request: it holds no keys, keeps no state between requests and never calls Supabase.
"""

import asyncio
import logging
import time
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from pydantic import BaseModel, Field, field_validator
from starlette.concurrency import run_in_threadpool

from . import config
from .fetch import PhotoError, fetch_photo, open_image
from .quality import working_image
from .scan import PhotoResult, analyze_photo, scan
from .vocab import SLOTS

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
# httpx logs every request URL at INFO; the logs carry counts and verdicts only.
for noisy in ("httpx", "httpcore"):
    logging.getLogger(noisy).setLevel(logging.WARNING)
log = logging.getLogger("vision")
state: dict = {}


@asynccontextmanager
async def lifespan(_: FastAPI):
    started = time.monotonic()
    from .model import Model  # torch loads here, before the port opens

    state["model"] = await run_in_threadpool(Model)
    state["client"] = httpx.AsyncClient(
        timeout=httpx.Timeout(config.FETCH_TIMEOUT_SECONDS, connect=5.0),
        follow_redirects=False,
        headers={"User-Agent": "dzirent-vision"},
    )
    state["lock"] = asyncio.Lock()  # one scan on the CPU at a time; others wait their turn
    state["startup_seconds"] = round(time.monotonic() - started, 2)
    log.info("started in %.1f s", state["startup_seconds"])
    yield
    await state["client"].aclose()


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


class PhotoIn(BaseModel):
    photo_id: str = Field(min_length=1, max_length=200)
    url: str = Field(min_length=1, max_length=config.MAX_PHOTO_BYTES * 4 // 3 + 100)
    slot: str | None = None

    @field_validator("slot")
    @classmethod
    def known_slot(cls, v: str | None) -> str | None:
        if v is not None and v not in SLOTS:
            raise ValueError(f"slot must be one of {', '.join(SLOTS)}")
        return v


class ScanIn(BaseModel):
    listing_id: str = Field(min_length=1, max_length=200)
    photos: list[PhotoIn] = Field(min_length=1, max_length=config.MAX_PHOTOS)


@app.get("/health")
async def health() -> dict:
    model = state["model"]
    return {
        "ok": True,
        "model": config.MODEL_ID,
        "revision": config.MODEL_REVISION,
        "license": config.MODEL_LICENSE,
        "policy_items": len(model.vocab.items),
        "policy_digest": model.vocab.digest[:16],
        "service_version": config.SERVICE_VERSION,
        "startup_seconds": state["startup_seconds"],
    }


def _run(listing_id: str, photos: list[PhotoIn], payloads: list) -> dict:
    model = state["model"]
    results, images = [], []
    for photo, payload in zip(photos, payloads):
        result = PhotoResult(photo_id=photo.photo_id, slot=photo.slot)
        image = None
        if isinstance(payload, PhotoError):
            result.error = payload.code
        else:
            try:
                image = open_image(payload)
            except PhotoError as e:
                result.error = e.code
        results.append(result)
        images.append(image)
    ok = [i for i, im in enumerate(images) if im is not None]
    embeddings = model.embed_images([images[i] for i in ok]) if ok else []
    for i, embedding in zip(ok, embeddings):
        analyze_photo(results[i], embedding, working_image(images[i]), model.banks, model.vocab)
    return scan(listing_id, results, model.banks, model.vocab)


@app.post("/scan")
async def scan_endpoint(body: ScanIn) -> dict:
    started = time.monotonic()

    async def get(photo: PhotoIn):
        try:
            return await fetch_photo(state["client"], photo.url)
        except PhotoError as e:
            return e

    payloads = await asyncio.gather(*(get(p) for p in body.photos))
    fetched = time.monotonic()
    async with state["lock"]:
        waited = time.monotonic()
        result = await run_in_threadpool(_run, body.listing_id, body.photos, payloads)
    done = time.monotonic()
    result["timing_ms"] = {
        "fetch": round((fetched - started) * 1000),
        "queue": round((waited - fetched) * 1000),
        "analyze": round((done - waited) * 1000),
        "total": round((done - started) * 1000),
    }
    # Counts and outcome only: never URLs or photo contents in the logs.
    log.info("scan photos=%d verdict=%s total_ms=%d", len(body.photos), result["verdict"],
             result["timing_ms"]["total"])
    return result
