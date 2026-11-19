"""augment.py (D4b): train photos only (a test sha1 is never drawn and is refused), the
oversampling factors from split.json, the hue shift within 5 degrees, the output size, and
--preview writing only its own folder. No network: albumentations' update check is off."""
import os
import random

import albumentations as A
import cv2
import numpy as np
import pytest
from PIL import Image

import augment as ag

SPLIT = {"types": {
    "Q1": {"english_name": "kurta", "train": [f"a{i:039d}" for i in range(64)], "test": [f"b{i:039d}" for i in range(16)],
           "oversample": 1},
    "Q2": {"english_name": "achkan", "train": [f"c{i:039d}" for i in range(3)], "test": [], "oversample": 7},
    "Q3": {"english_name": "Nehru jacket", "train": [f"d{i:039d}" for i in range(6)], "test": ["e" * 40, "f" * 40],
           "oversample": 4},
}}


def photo(size=(320, 240), seed=0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    base = np.zeros((size[1], size[0], 3), np.uint8)
    base[...] = (200, 40, 60)
    base[:, ::16] = rng.integers(0, 255, (size[1], 3), dtype=np.uint8)[:, None, :]
    return base


def test_the_update_check_is_off():
    assert os.environ["NO_ALBUMENTATIONS_UPDATE"] == "1"


def test_an_epoch_draws_train_photos_only_with_the_oversampling():
    draws = ag.epoch(SPLIT, random.Random(1))
    assert not {s for _, s in draws} & ag.locked_sha1s(SPLIT)
    per_type = {q: sum(1 for d in draws if d[0] == q) for q in SPLIT["types"]}
    assert per_type == {"Q1": 64, "Q2": 21, "Q3": 24}  # 64 x 1, 3 x 7, 6 x 4: every type at least 20
    assert ag.epoch(SPLIT, random.Random(1)) == draws and ag.epoch(SPLIT, random.Random(2)) != draws


def test_a_test_photo_is_refused():
    aug = ag.Augmenter(SPLIT, seed=0)
    with pytest.raises(ag.LockedPhotoError):
        aug("b" + "0" * 39, photo())
    out = aug("a" + "0" * 39, photo())
    assert out.shape == (ag.INPUT_SIZE, ag.INPUT_SIZE, 3) and out.dtype == np.uint8


def test_the_pipeline_is_the_one_asked_for():
    kinds = [type(t) for t in ag.train_transform().transforms]
    assert kinds == [A.Rotate, A.RandomResizedCrop, A.HorizontalFlip, A.RandomBrightnessContrast, A.HueSaturationValue,
                     A.GaussianBlur, A.ImageCompression]
    t = {type(x): x for x in ag.train_transform().transforms}
    assert t[A.Rotate].limit == (-10, 10)
    assert t[A.RandomResizedCrop].scale == (0.7, 1.0)
    assert t[A.RandomBrightnessContrast].brightness_limit == (-0.2, 0.2)
    assert t[A.RandomBrightnessContrast].contrast_limit == (-0.2, 0.2)
    assert t[A.ImageCompression].quality_range == (60, 95)
    hsv = t[A.HueSaturationValue]
    assert hsv.hue_shift_limit == (-2.5, 2.5) and hsv.sat_shift_limit == (0, 0) and hsv.val_shift_limit == (0, 0)


def test_the_hue_moves_at_most_5_degrees():
    hsv = next(t for t in ag.train_transform().transforms if isinstance(t, A.HueSaturationValue))
    hsv.p = 1.0
    image = np.zeros((32, 32, 3), np.uint8)
    image[...] = (200, 40, 60)  # a saturated red
    before = int(cv2.cvtColor(image, cv2.COLOR_RGB2HSV)[0, 0, 0]) * 2
    shifts = set()
    for seed in range(60):
        out = A.Compose([hsv], seed=seed)(image=image)["image"]
        after = int(cv2.cvtColor(out, cv2.COLOR_RGB2HSV)[0, 0, 0]) * 2
        diff = min(abs(after - before), 360 - abs(after - before))
        shifts.add(diff)
        assert diff <= ag.HUE_DEGREES + 2  # + one 2-degree step of 8-bit rounding
    assert max(shifts) > 0  # it does shift


def test_preview_writes_its_own_folder_only_and_refuses_a_test_photo(tmp_path):
    src = tmp_path / "photo.jpg"
    Image.fromarray(photo((400, 300))).save(src)
    out = tmp_path / "preview"
    paths = ag.preview("a" + "0" * 39, out, SPLIT, src)
    assert len(paths) == 8 and sorted(p.name for p in out.iterdir()) == ["augmented_1.jpg", "augmented_2.jpg",
        "augmented_3.jpg", "augmented_4.jpg", "augmented_5.jpg", "augmented_6.jpg", "augmented_7.jpg",
        "augmented_8.jpg", "original.jpg"]
    assert sorted(p.name for p in tmp_path.iterdir()) == ["photo.jpg", "preview"]
    with pytest.raises(ag.LockedPhotoError):
        ag.preview("b" + "0" * 39, tmp_path / "nope", SPLIT, src)
    assert not (tmp_path / "nope").exists()
