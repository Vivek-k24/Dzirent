"""Deterministic synthetic overhead scenes, generated in memory. No real photos or people."""

from dataclasses import dataclass

import cv2
import numpy as np
from numpy.typing import NDArray

Image = NDArray[np.uint8]
LETTER_RATIO = 11 / 8.5


@dataclass(frozen=True)
class Scene:
    width: int = 1600
    height: int = 1200
    background: tuple[int, int, int] = (112, 122, 132)  # BGR, a plain grey-brown surface
    paper: bool = True
    paper_landscape: bool = False  # long side across the garment's length (provisional rule)
    paper_shift_x: int = 0  # positive values push the sheet off the right edge
    garment: bool = True
    garment_shift_x: int = 0  # negative values push the garment off the left edge
    clutter: bool = False
    blur_sigma: float = 0.0
    gain: float = 1.0
    seed: int = 7


def render(scene: Scene | None = None) -> Image:
    scene = scene or Scene()
    rng = np.random.default_rng(scene.seed)
    h, w = scene.height, scene.width
    image = np.empty((h, w, 3), np.float32)
    image[:] = scene.background
    # Low-frequency surface grain plus sensor-like noise keeps the background realistic but uniform.
    grain = cv2.GaussianBlur(rng.normal(0, 18, (h, w)).astype(np.float32), (0, 0), 25)
    image += grain[..., None] + rng.normal(0, 4, (h, w, 3))
    if scene.clutter:
        # A busy checked surface: there is no single background colour to separate the garment from.
        checks = (np.indices((h, w)) // 60).sum(axis=0) % 2 == 1
        image[checks] = (40, 150, 60)
    if scene.garment:
        dx = scene.garment_shift_x
        dress = np.array(
            [
                [430, 150],
                [670, 150],
                [720, 330],
                [690, 520],
                [820, 1050],
                [280, 1050],
                [410, 520],
                [380, 330],
            ],
            np.int32,
        )
        dress[:, 0] += dx
        layer = np.zeros((h, w), np.uint8)
        cv2.fillPoly(layer, [dress], 255)
        fabric = np.empty((h, w, 3), np.float32)
        fabric[:] = (48, 52, 168)  # deep red
        stripes = (np.indices((h, w)).sum(axis=0) // 14 % 2).astype(np.float32)
        fabric += stripes[..., None] * 38 + rng.normal(0, 7, (h, w, 3))
        image[layer > 0] = fabric[layer > 0]
    if scene.paper:
        long, short = 300, round(300 / LETTER_RATIO)
        pw, ph = (long, short) if scene.paper_landscape else (short, long)
        x0, y0 = 1080 + scene.paper_shift_x, 420
        image[y0 : y0 + ph, x0 : x0 + pw] = (
            242 + rng.normal(0, 3, (min(ph, h - y0), min(pw, w - x0), 3))[:ph, :pw]
        )
    if scene.blur_sigma:
        image = cv2.GaussianBlur(image, (0, 0), scene.blur_sigma)
    image *= scene.gain
    return np.clip(image, 0, 255).astype(np.uint8)


def encode(image: Image, ext: str = ".jpg") -> bytes:
    ok, buffer = cv2.imencode(ext, image, [cv2.IMWRITE_JPEG_QUALITY, 92] if ext == ".jpg" else [])
    assert ok
    return buffer.tobytes()
