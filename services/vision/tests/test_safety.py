"""The image safety check, on synthetic images only (no real or explicit photos in the tests).

The preprocessing tests need nothing else. The model tests load the pinned weights from
VISION_SAFETY_DIR (the folder build_assets.py fills, /opt/model/safety in the image) and are
skipped when it isn't set.
"""

import os
from pathlib import Path

import numpy as np
import pytest
import torch
from PIL import Image

from app import config
from app.quality import check_photo
from app.safety import SafetyModel, preprocess

SAFETY_DIR = os.environ.get("VISION_SAFETY_DIR")


def test_preprocess_is_the_models_384_center_crop_with_mean_and_std_half():
    wide = Image.new("RGB", (1200, 600), (255, 0, 0))
    x = preprocess(wide)
    assert tuple(x.shape) == (3, config.SAFETY_IMAGE_SIZE, config.SAFETY_IMAGE_SIZE)
    assert torch.allclose(x[0], torch.ones_like(x[0]))   # red 255 -> +1
    assert torch.allclose(x[1], -torch.ones_like(x[1]))  # green 0 -> -1


def test_preprocess_scales_small_images_up():
    assert tuple(preprocess(Image.new("RGB", (100, 40), "white")).shape) == (3, 384, 384)


def test_quality_warnings_never_mention_a_person_or_wearing():
    """Worn photos are never penalized: no quality warning is about people or wearing."""
    rng = np.random.default_rng(0)
    for rgb in (np.zeros((300, 200, 3), np.uint8), rng.integers(0, 255, (300, 200, 3), dtype=np.uint8)):
        for warning in check_photo(rgb).warnings:
            assert not any(word in warning.lower() for word in ("worn", "wear", "person", "model", "someone"))


@pytest.mark.model
@pytest.mark.skipif(not SAFETY_DIR, reason="VISION_SAFETY_DIR is not set")
def test_the_pinned_model_loads_strictly_and_gives_probabilities():
    model = SafetyModel(Path(SAFETY_DIR))
    rng = np.random.default_rng(1)
    images = [
        Image.new("RGB", (512, 512), "white"),
        Image.new("RGB", (640, 480), (40, 90, 160)),
        Image.fromarray(rng.integers(0, 255, (400, 300, 3), dtype=np.uint8)),
    ]
    p = model.nsfw(images)
    assert len(p) == 3 and all(0.0 <= v <= 1.0 for v in p)
    assert model.nsfw([]) == []


@pytest.mark.model
@pytest.mark.skipif(not SAFETY_DIR, reason="VISION_SAFETY_DIR is not set")
def test_plain_synthetic_images_are_not_read_as_unsafe():
    from app.verdict import NSFW_REVIEW_MIN

    model = SafetyModel(Path(SAFETY_DIR))
    plain = [Image.new("RGB", (512, 512), c) for c in ("white", "black", (200, 30, 60), (30, 120, 60))]
    assert max(model.nsfw(plain)) < NSFW_REVIEW_MIN
