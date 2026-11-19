"""D4b: training-time augmentation of the train photos (Albumentations 2.0.8, MIT).

For training only, in memory. It is never applied to the test split (split.json's test photos are
refused) and never writes new manifest rows or files: each epoch draws the train photos again and
augments them on the fly. The only thing that writes is --preview, for a person to look at.

The pipeline (train_transform), in this order:
- small rotation, up to 10 degrees either way (p 0.5; the corners are filled by reflection);
- random resized crop to INPUT_SIZE (the vision model's 224 x 224), 70-100 % of the area,
  aspect 3:4 to 4:3 (always: it is also the resize);
- horizontal flip (p 0.5);
- brightness and contrast, up to 0.2 either way (p 0.5);
- hue shift, up to 5 degrees either way, saturation and value unchanged, so colours stay honest
  for the colour reader (p 0.3). OpenCV's 8-bit hue runs 0-179, 2 degrees a step: the limit is
  2.5 steps;
- light gaussian blur, kernel 3-5 px, sigma 0.1-1.0 (p 0.2);
- JPEG compression, quality 60-95 (p 0.3).

Thin types: epoch() draws each train photo split.json's "oversample" times (ceil(20 / train)
for a type with fewer than 20 train photos, else 1), so every type gives at least 20 samples an
epoch; each draw is augmented differently.

    python images/augment.py --preview <sha1>             # 8 augmented samples into images/raw/augment_preview/<sha1>/
    python images/augment.py --preview <sha1> --out DIR   # somewhere else
"""
from __future__ import annotations

import argparse
import json
import os
import random
import sys
from pathlib import Path

os.environ.setdefault("NO_ALBUMENTATIONS_UPDATE", "1")  # albumentations otherwise asks PyPI for updates on import

import albumentations as A  # noqa: E402
import cv2  # noqa: E402
import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402

IMAGES_DIR = Path(__file__).resolve().parent
SPLIT_JSON = IMAGES_DIR / "split.json"
MANIFEST_CSV = IMAGES_DIR / "manifest.csv"
PREVIEW_DIR = IMAGES_DIR / "raw" / "augment_preview"
INPUT_SIZE = 224          # services/vision/app/config.py IMAGE_SIZE
ROTATE_DEGREES = 10
CROP_SCALE = (0.7, 1.0)
CROP_RATIO = (3 / 4, 4 / 3)
BRIGHTNESS = CONTRAST = 0.2
HUE_DEGREES = 5
HUE_STEPS = HUE_DEGREES / 2  # OpenCV 8-bit hue: 180 steps for 360 degrees
BLUR_KERNEL = (3, 5)
BLUR_SIGMA = (0.1, 1.0)
JPEG_QUALITY = (60, 95)
PREVIEW_SAMPLES = 8


class LockedPhotoError(ValueError):
    """A test photo was handed to the augmentation: the test split is locked."""


def train_transform(size: int = INPUT_SIZE, seed: int | None = None) -> A.Compose:
    return A.Compose([
        A.Rotate(limit=ROTATE_DEGREES, border_mode=cv2.BORDER_REFLECT_101, p=0.5),
        A.RandomResizedCrop(size=(size, size), scale=CROP_SCALE, ratio=CROP_RATIO, p=1.0),
        A.HorizontalFlip(p=0.5),
        A.RandomBrightnessContrast(brightness_limit=BRIGHTNESS, contrast_limit=CONTRAST, p=0.5),
        A.HueSaturationValue(hue_shift_limit=HUE_STEPS, sat_shift_limit=0, val_shift_limit=0, p=0.3),
        A.GaussianBlur(blur_limit=BLUR_KERNEL, sigma_limit=BLUR_SIGMA, p=0.2),
        A.ImageCompression(quality_range=JPEG_QUALITY, p=0.3),
    ], seed=seed)


def load_split(path: Path = SPLIT_JSON) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def locked_sha1s(split: dict) -> set[str]:
    return {s for t in split["types"].values() for s in t["test"]}


def epoch(split: dict, rng: random.Random | None = None) -> list[tuple[str, str]]:
    """One epoch's (qid, sha1) draws: train photos only, each type's photos `oversample` times, shuffled."""
    draws = [(qid, s) for qid, t in split["types"].items() for s in t["train"] for _ in range(t.get("oversample", 1))]
    (rng or random.Random()).shuffle(draws)
    return draws


class Augmenter:
    """Augments train photos in memory; refuses a test photo."""

    def __init__(self, split: dict, size: int = INPUT_SIZE, seed: int | None = None) -> None:
        self.locked = locked_sha1s(split)
        self.transform = train_transform(size, seed)

    def __call__(self, sha1: str, image: np.ndarray) -> np.ndarray:
        if sha1 in self.locked:
            raise LockedPhotoError(f"{sha1} is a test photo: the test split is never augmented")
        return self.transform(image=image)["image"]


def read_rgb(path: Path) -> np.ndarray:
    with Image.open(path) as im:
        return np.asarray(im.convert("RGB"))


def file_of(sha1: str, manifest_csv: Path = MANIFEST_CSV) -> Path:
    import csv
    with open(manifest_csv, encoding="utf-8", newline="") as fh:
        for m in csv.DictReader(fh):
            if m["sha1"] == sha1:
                return IMAGES_DIR / m["file"]
    raise SystemExit(f"{sha1} is not in manifest.csv")


def preview(sha1: str, out_dir: Path, split: dict, image_path: Path, samples: int = PREVIEW_SAMPLES,
            seed: int = 0) -> list[Path]:
    """Writes `samples` augmented versions of one train photo (and the original) for a person to look at."""
    aug = Augmenter(split, seed=seed)
    image = read_rgb(image_path)
    if sha1 in aug.locked:
        raise LockedPhotoError(f"{sha1} is a test photo: the test split is never augmented, not even for a preview")
    out_dir.mkdir(parents=True, exist_ok=True)
    Image.fromarray(image).save(out_dir / "original.jpg", quality=92)
    paths = []
    for i in range(samples):
        path = out_dir / f"augmented_{i + 1}.jpg"
        Image.fromarray(aug(sha1, image)).save(path, quality=92)
        paths.append(path)
    return paths


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Training-time augmentation; --preview writes samples of one photo.")
    parser.add_argument("--preview", metavar="SHA1", required=True, help="a train photo's sha1 (from split.json)")
    parser.add_argument("--out", type=Path, help=f"where to write the samples (default {PREVIEW_DIR.relative_to(IMAGES_DIR)}/<sha1>)")
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args(argv)
    split = load_split()
    out = args.out or PREVIEW_DIR / args.preview
    try:
        paths = preview(args.preview, out, split, file_of(args.preview), seed=args.seed)
    except LockedPhotoError as exc:
        print(exc)
        return 2
    print(f"wrote the original and {len(paths)} augmented samples to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
