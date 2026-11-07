"""The image safety check: Marqo/nsfw-image-detection-384 (Apache 2.0) on CPU PyTorch.

Downloaded at build time like the main model (build_assets.py). It gives one number per photo:
how likely the photo shows nudity or sexual content. verdict.py decides what that means.
"""

import json
from pathlib import Path

import numpy as np
import torch
from PIL import Image

from . import config


def preprocess(image: Image.Image, size: int = config.SAFETY_IMAGE_SIZE) -> torch.Tensor:
    """The model's pretrained_cfg: shorter side to 384 (bicubic), center crop to 384 x 384, mean and std 0.5."""
    im = image.convert("RGB")
    w, h = im.size
    scale = size / min(w, h)
    im = im.resize((max(size, round(w * scale)), max(size, round(h * scale))), Image.Resampling.BICUBIC)
    w, h = im.size
    left, top = (w - size) // 2, (h - size) // 2
    im = im.crop((left, top, left + size, top + size))
    a = (np.asarray(im, dtype=np.float32) / 255.0 - 0.5) / 0.5
    return torch.from_numpy(np.ascontiguousarray(a.transpose(2, 0, 1)))


class SafetyModel:
    def __init__(self, model_dir: Path):
        import timm
        from safetensors.torch import load_file

        cfg = json.loads((model_dir / "config.json").read_text(encoding="utf-8"))
        self.nsfw_index = cfg["label_names"].index("NSFW")
        self.model = timm.create_model(cfg["architecture"], pretrained=False, num_classes=cfg["num_classes"],
                                       global_pool=cfg.get("global_pool", "token"))
        self.model.load_state_dict(load_file(str(model_dir / "model.safetensors")), strict=True)
        self.model.eval()

    @torch.inference_mode()
    def nsfw(self, images: list[Image.Image]) -> list[float]:
        """P(nudity or sexual content) for each image."""
        if not images:
            return []
        x = torch.stack([preprocess(im) for im in images])
        p = self.model(x).softmax(dim=-1)[:, self.nsfw_index]
        return [float(v) for v in p]
