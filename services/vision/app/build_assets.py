"""Run once during `docker build`: download the pinned model and embed every prompt.

    python -m app.build_assets

Writes text_embeddings.npz and the vision tower's weights (visual.safetensors) to
VISION_MODEL_DIR (default /opt/model), so a cold start never downloads anything and never builds
the text tower. The service refuses to start if policy.json or vocab.json changed after the
embeddings were built.
"""

import json
import time

import numpy as np
import torch
from safetensors.torch import save_file

from . import config
from .model import create_open_clip
from .safety import SafetyModel
from .vocab import load as load_vocab


def tokenizer_for(model_dir):
    """The model's own tokenizer files, with the cleaning its config asks for."""
    from open_clip.tokenizer import HFTokenizer

    text_cfg = json.loads((model_dir / "open_clip_config.json").read_text(encoding="utf-8"))["model_cfg"]["text_cfg"]
    return HFTokenizer(str(model_dir), context_length=text_cfg["context_length"], **text_cfg.get("tokenizer_kwargs", {}))


def download(model_dir) -> None:
    from huggingface_hub import snapshot_download

    snapshot_download(config.MODEL_ID, revision=config.MODEL_REVISION, local_dir=str(model_dir),
                      allow_patterns=config.MODEL_FILES)
    snapshot_download(config.SAFETY_MODEL_ID, revision=config.SAFETY_MODEL_REVISION,
                      local_dir=str(model_dir / config.SAFETY_SUBDIR), allow_patterns=config.SAFETY_MODEL_FILES)


@torch.inference_mode()
def embed_prompts(model, tokenizer, prompts: list[str], batch: int = 64) -> np.ndarray:
    out = []
    for i in range(0, len(prompts), batch):
        out.append(model.encode_text(tokenizer(prompts[i:i + batch]), normalize=True).numpy())
    return np.concatenate(out).astype(np.float32)


def build(model_dir=config.MODEL_DIR, fetch: bool = True) -> None:
    started = time.monotonic()
    if fetch:
        download(model_dir)
    model = create_open_clip(model_dir)
    tokenizer = tokenizer_for(model_dir)
    vocab = load_vocab()

    arrays: dict[str, np.ndarray] = {"digest": np.array(vocab.digest)}
    total = 0
    for name, entries in vocab.prompt_sets().items():
        flat = [p for _, prompts in entries for p in prompts]
        embedded = embed_prompts(model, tokenizer, flat)
        rows, at = [], 0
        for _, prompts in entries:
            # Prompt ensembling: the normalized mean of the class's phrasings.
            centroid = embedded[at:at + len(prompts)].mean(axis=0)
            rows.append(centroid / np.linalg.norm(centroid))
            at += len(prompts)
        arrays[f"{name}_keys"] = np.array([k for k, _ in entries])
        arrays[f"{name}_matrix"] = np.stack(rows).astype(np.float32)
        total += len(flat)
    np.savez(model_dir / config.TEXT_EMBEDDINGS_FILE, **arrays)
    save_file({k: v.contiguous() for k, v in model.visual.state_dict().items()}, str(model_dir / config.VISUAL_WEIGHTS_FILE))
    # The safety model must load (strictly) now, not at the first cold start.
    SafetyModel(model_dir / config.SAFETY_SUBDIR)
    print(f"embedded {total} prompts for {len(vocab.items)} policy items in {time.monotonic() - started:.0f} s")


if __name__ == "__main__":
    build()
