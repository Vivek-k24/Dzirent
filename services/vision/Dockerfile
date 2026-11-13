# Dzirent vision service (Step 8A): Marqo-FashionSigLIP on CPU PyTorch, for Cloud Run.
# The pinned model is downloaded and every prompt embedded here, at build time, so a cold start
# never downloads anything. Only the vision tower's weights stay in the image, with the pinned
# image safety model (P2A: Marqo/nsfw-image-detection-384) in /opt/model/safety.
FROM python:3.12.10-slim-bookworm@sha256:fd95fa221297a88e1cf49c55ec1828edd7c5a428187e67b5d1805692d11588db

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HF_HUB_DISABLE_TELEMETRY=1 \
    VISION_MODEL_DIR=/opt/model

WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-deps -r requirements.txt && pip check

COPY app ./app
RUN python -m app.build_assets \
 && rm -f /opt/model/open_clip_model.safetensors /opt/model/tokenizer.json /opt/model/tokenizer_config.json \
          /opt/model/special_tokens_map.json /opt/model/spiece.model \
 && rm -rf /opt/model/.cache /opt/model/safety/.cache /root/.cache \
 && chmod -R a+rX /opt/model
# chmod (S1): safetensors 0.8 writes visual.safetensors owner-only (0600), and the service runs as
# the unprivileged user below, so without it the app can't read the vision tower and never starts.

ENV HF_HUB_OFFLINE=1 \
    OMP_NUM_THREADS=2 \
    MKL_NUM_THREADS=2
RUN useradd --system --uid 10001 --no-create-home vision
USER vision
EXPOSE 8080
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1 --no-access-log"]
