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

# The image safety check (P2A): Marqo/nsfw-image-detection-384 (Apache 2.0), a small ViT
# fine-tuned from timm/vit_tiny_patch16_384.augreg_in21k_ft_in1k. Pinned and built into the
# image like the main model; it says how likely a photo shows nudity or sexual content.
SAFETY_MODEL_ID = "Marqo/nsfw-image-detection-384"
SAFETY_MODEL_REVISION = "0c26ec22111b83f106d72a55f611ec35962bcb65"
SAFETY_MODEL_LICENSE = "Apache-2.0"
SAFETY_MODEL_FILES = ["config.json", "model.safetensors"]
SAFETY_SUBDIR = "safety"  # under MODEL_DIR
SAFETY_IMAGE_SIZE = 384

SERVICE_VERSION = "s1.1"

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
