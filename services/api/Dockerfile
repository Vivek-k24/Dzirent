# dzirent API runtime. Build from the repository root:
#   docker build -f services/api/Dockerfile -t dzirent-api:local .
# Migrations are a separate serialized release step, never run by each replica:
#   docker run --rm --env-file services/api/.env dzirent-api:local alembic upgrade head

FROM ghcr.io/astral-sh/uv:0.13.1 AS uv

FROM python:3.12.15-slim-trixie AS build
COPY --from=uv /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/app/.venv
WORKDIR /app/services/api
COPY services/api/pyproject.toml services/api/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY services/api/src ./src
COPY services/api/alembic ./alembic
COPY services/api/alembic.ini ./
RUN uv sync --frozen --no-dev

FROM python:3.12.15-slim-trixie AS runtime
RUN useradd --system --uid 10001 --no-create-home --home-dir /nonexistent dzirent
# Repository-relative layout: settings read contracts/modes.json and the demo seed reads fixtures.
COPY --from=build /app /app
COPY contracts/modes.json /app/contracts/modes.json
COPY fixtures/catalog/taxonomy.json fixtures/catalog/manifest.json /app/fixtures/catalog/
WORKDIR /app/services/api
ENV PATH=/app/.venv/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000 \
    FORWARDED_ALLOW_IPS=127.0.0.1
USER 10001
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["python", "-c", "import os, urllib.request; urllib.request.urlopen(f\"http://127.0.0.1:{os.environ['PORT']}/api/v1/health/live\", timeout=2)"]
# Request logging comes from the API middleware (no query strings or headers), so uvicorn's
# access log is off. Set FORWARDED_ALLOW_IPS to the platform proxy range when deployed.
CMD ["sh", "-c", "exec uvicorn dzirent_api.main:app --host 0.0.0.0 --port \"$PORT\" --proxy-headers --forwarded-allow-ips \"$FORWARDED_ALLOW_IPS\" --no-access-log"]
