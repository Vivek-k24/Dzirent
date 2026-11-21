"""Marqo-FashionSigLIP on CPU PyTorch.

The weights and every prompt's text embedding are built into the image (build_assets.py), so
start-up reads local files only. At run time only the vision tower is built and loaded.
"""

import json
import logging
from pathlib import Path

import numpy as np
import torch
from PIL import Image

from . import config
from . import pins as type_pins
from .color_reader import ColorBank, color_digest
from .safety import SafetyModel
from .scan import TextBank
from .vocab import BANKS, Vocab, load as load_vocab

log = logging.getLogger("vision")


def _model_cfg(model_dir: Path) -> dict:
    cfg = json.loads((model_dir / "open_clip_config.json").read_text(encoding="utf-8"))["model_cfg"]
    return {k: v for k, v in cfg.items() if k != "custom_text"}


def create_open_clip(model_dir: Path) -> torch.nn.Module:
    """The whole model (both towers) exactly as its open_clip_config.json describes it. Build only."""
    from open_clip.factory import load_checkpoint
    from open_clip.model import CustomTextCLIP

    model = CustomTextCLIP(**_model_cfg(model_dir))
    load_checkpoint(model, str(model_dir / "open_clip_model.safetensors"))
    return model.eval()


def create_vision_tower(model_dir: Path) -> torch.nn.Module:
    """Only the vision tower, built the way CustomTextCLIP builds it, with the weights the build saved."""
    from open_clip.model import _build_vision_tower
    from safetensors.torch import load_file

    cfg = _model_cfg(model_dir)
    visual = _build_vision_tower(cfg["embed_dim"], cfg["vision_cfg"])
    visual.load_state_dict(load_file(str(model_dir / config.VISUAL_WEIGHTS_FILE)), strict=True)
    return visual.eval()


def preprocess(image: Image.Image) -> torch.Tensor:
    """The model's preprocess_cfg: squash to 224 x 224 (no crop), bicubic, mean and std 0.5."""
    im = image.convert("RGB").resize((config.IMAGE_SIZE, config.IMAGE_SIZE), Image.Resampling.BICUBIC)
    a = (np.asarray(im, dtype=np.float32) / 255.0 - 0.5) / 0.5
    return torch.from_numpy(np.ascontiguousarray(a.transpose(2, 0, 1)))


@torch.inference_mode()
def embed_tensors(visual: torch.nn.Module, x: torch.Tensor) -> np.ndarray:
    """Unit-length embeddings of preprocessed images (a batch from preprocess), one 768-number row each."""
    features = torch.nn.functional.normalize(visual(x), dim=-1)
    return features.numpy().astype(np.float32)


def embed_with(visual: torch.nn.Module, images: list[Image.Image]) -> np.ndarray:
    """Unit-length image embeddings, one 768-number row per image. The service and the pin
    builder (data/vision/embed/build_pins.py) both embed photos through preprocess and
    embed_tensors, so a pin and a scan see a photo the same way."""
    return embed_tensors(visual, torch.stack([preprocess(im) for im in images]))


class Model:
    def __init__(self, model_dir: Path = config.MODEL_DIR):
        torch.set_num_threads(config.TORCH_THREADS)
        self.vocab: Vocab = load_vocab()
        data = np.load(model_dir / config.TEXT_EMBEDDINGS_FILE)
        if str(data["digest"]) != self.vocab.digest:
            raise RuntimeError("text embeddings were built for another policy or vocabulary; rebuild the image")
        self.banks = {
            name: TextBank(keys=[str(k) for k in data[f"{name}_keys"]], matrix=data[f"{name}_matrix"])
            for name in ("items", *BANKS)
        }
        if self.banks["items"].keys != [i.key for i in self.vocab.items]:
            raise RuntimeError("text embeddings don't match the policy items")
        if "colors_digest" not in data.files or str(data["colors_digest"]) != color_digest():
            raise RuntimeError("color name embeddings are missing or were built for another list; rebuild the image")
        self.color_bank = ColorBank(keys=[str(k) for k in data["colors_keys"]], matrix=data["colors_matrix"])
        self.visual = create_vision_tower(model_dir)
        self.safety = SafetyModel(model_dir / config.SAFETY_SUBDIR)
        # V1b: the text and gallery pins, checked against pins.json, and the rules' thresholds.
        self.pins = type_pins.load()
        self.thresholds = type_pins.Thresholds.load()
        log.info("model ready: %d item labels, %d type pins, %d gallery pins, safety model %s", len(self.vocab.items),
                 len(self.pins.types), len(self.pins.gallery), config.SAFETY_MODEL_ID)

    def embed_images(self, images: list[Image.Image]) -> np.ndarray:
        """Unit-length image embeddings, one 768-number row per image."""
        return embed_with(self.visual, images)
