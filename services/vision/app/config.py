"""Fixed settings. Nothing here is secret: the service holds no keys of any kind."""

import os
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent

# Marqo-FashionSigLIP (Apache 2.0), pinned to one commit so every build gets the same weights.
MODEL_ID = "Marqo/marqo-fashionSigLIP"
MODEL_REVISION = "c56244cc94f92419e8369fa71efdaf403b124ce8"
MODEL_LICENSE = "Apache-2.0"
# Only the files open_clip needs; the transformers and ONNX copies in the repo are skipped.
MODEL_FILES = [
    "open_clip_config.json",
    "open_clip_model.safetensors",
    "tokenizer.json",
    "tokenizer_config.json",
    "special_tokens_map.json",
    "spiece.model",
]
# Downloaded and embedded during the container build (build_assets.py), never at start-up.
MODEL_DIR = Path(os.environ.get("VISION_MODEL_DIR", "/opt/model"))
TEXT_EMBEDDINGS_FILE = "text_embeddings.npz"
VISUAL_WEIGHTS_FILE = "visual.safetensors"  # the vision tower only: all a scan needs

POLICY_FILE = APP_DIR / "policy.json"
VOCAB_FILE = APP_DIR / "vocab.json"

SERVICE_VERSION = "8a.1"

# The model card's zero-shot recipe: softmax(100 * cosine similarity).
LOGIT_SCALE = 100.0
IMAGE_SIZE = 224

# Request limits. A listing has at most 6 photo slots.
MAX_PHOTOS = 8
MAX_PHOTO_BYTES = 15 * 1024 * 1024
MAX_PIXELS = 40_000_000
FETCH_TIMEOUT_SECONDS = 20.0

# Photos are fetched only from these URL prefixes (comma-separated), set at deploy time to the
# public listing-photos bucket. data:image/...;base64 URLs are always accepted (no network).
ALLOWED_URL_PREFIXES = [
    p.strip() for p in os.environ.get("VISION_ALLOWED_URL_PREFIXES", "").split(",") if p.strip()
]

TORCH_THREADS = int(os.environ.get("VISION_TORCH_THREADS", "2"))
