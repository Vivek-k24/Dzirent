"""Photo quality: sharpness, lighting and whether the whole item is in the frame.

A numpy port of the app's PhotoQuality.kt (itself ported from the website's quality-rules-0.1.0),
with the same thresholds and the same warning text the phone shows. Quality never decides the
verdict: a failed check only adds a warning to that photo.
"""

from dataclasses import dataclass, field

import numpy as np
from PIL import Image
from scipy import ndimage

from .colors import rgb_to_lab

# Thresholds (PhotoThresholds.kt; "owner to tune" there too).
WORKING_LONG_SIDE = 1280
BLUR_TILES = 8
BLUR_TEXTURE_STD = 8.0
BLUR_MIN_TILES = 4
BLUR_PERCENTILE = 90.0
SHARP_SCORE = 120.0
BLURRY_SCORE = 35.0
DARK_MEAN = 45.0
DARK_PIXEL = 8
DARK_SHARE = 0.40
BRIGHT_MEAN = 225.0
BRIGHT_PIXEL = 250
BRIGHT_SHARE = 0.35
GLARE_SHARE = 0.04
GLARE_MAX_CENTER_MEDIAN = 170.0
CENTER_SHARE = 0.5
BORDER_SHARE = 0.03
BORDER_NOISE_DISTANCE = 15.0
BORDER_MAX_NOISY_SHARE = 0.30
ITEM_MIN_DISTANCE = 12.0
ITEM_MIN_AREA = 0.03
EDGE_MARGIN_PX = 2
CUT_OFF_OUTLINE_SHARE = 0.02

# The line shown under a photo, worded as on the phone.
WARNINGS = {
    "blurry": "Too blurry: hold steady and retake",
    "too_dark": "Too dark: try daylight",
    "too_bright": "Too bright: avoid direct sun and flash",
    "glare": "Strong glare: move out of direct light",
    "cut_off_top": "Top of the item is cut off",
    "cut_off_bottom": "Bottom of the item is cut off",
    "cut_off_left": "Left side of the item is cut off",
    "cut_off_right": "Right side of the item is cut off",
}
_SIDES = ("cut_off_top", "cut_off_bottom", "cut_off_left", "cut_off_right")


@dataclass
class Check:
    """pass, unsure (not enough to judge: never warns) or fail (with an issue key)."""
    status: str
    note: str
    issue: str | None = None


@dataclass
class Quality:
    sharp: Check
    lighting: Check
    whole_item: Check
    sharpness: float | None          # 90th percentile tile Laplacian variance
    brightness: float                # mean gray, 0-255
    edge_share: float | None         # share of the item's outline on the frame's edge
    region: np.ndarray | None = field(default=None, repr=False)      # the item's pixels
    background: np.ndarray | None = field(default=None, repr=False)  # border median L*a*b*

    @property
    def warnings(self) -> list[str]:
        return [WARNINGS[c.issue] for c in (self.sharp, self.lighting, self.whole_item) if c.issue]

    @property
    def blur_score(self) -> float | None:
        """0 = sharp (at or above SHARP_SCORE) to 1 = blurry (at or below BLURRY_SCORE)."""
        if self.sharpness is None or self.sharp.note == "not_judged_due_to_exposure":
            return None
        return float(np.clip((SHARP_SCORE - self.sharpness) / (SHARP_SCORE - BLURRY_SCORE), 0.0, 1.0))

    @property
    def brightness_score(self) -> float:
        """Mean brightness, 0 = black to 1 = white."""
        return self.brightness / 255.0

    @property
    def framing_score(self) -> float | None:
        """0 = whole item in frame; higher = more of its outline runs along the edge."""
        return self.edge_share


def working_image(image: Image.Image) -> np.ndarray:
    """RGB uint8 array with the long side at most WORKING_LONG_SIDE, as on the phone."""
    w, h = image.size
    scale = WORKING_LONG_SIDE / max(w, h)
    if scale < 1:
        image = image.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.Resampling.BILINEAR)
    return np.asarray(image.convert("RGB"), dtype=np.uint8)


def gray(rgb: np.ndarray) -> np.ndarray:
    """Gray as OpenCV computes it (0.299 R + 0.587 G + 0.114 B), rounded, 0-255."""
    g = 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]
    return np.clip(np.floor(g + 0.5), 0, 255).astype(np.int32)


def laplacian(g: np.ndarray) -> np.ndarray:
    """OpenCV's 3 x 3 Laplacian (0 1 0 / 1 -4 1 / 0 1 0) with BORDER_REFLECT_101."""
    p = np.pad(g, 1, mode="reflect").astype(np.float64)
    return p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:] - 4 * p[1:-1, 1:-1]


def check_sharpness(g: np.ndarray) -> tuple[Check, float | None]:
    """Laplacian variance per tile (8 x 8); flat tiles are skipped, the 90th percentile scores."""
    h, w = g.shape
    lap = laplacian(g)
    scores = []
    for r in range(BLUR_TILES):
        for c in range(BLUR_TILES):
            y0, y1 = r * h // BLUR_TILES, (r + 1) * h // BLUR_TILES
            x0, x1 = c * w // BLUR_TILES, (c + 1) * w // BLUR_TILES
            if y1 <= y0 or x1 <= x0:
                continue
            if g[y0:y1, x0:x1].std() > BLUR_TEXTURE_STD:
                scores.append(lap[y0:y1, x0:x1].var())
    if len(scores) < BLUR_MIN_TILES:
        return Check("unsure", "insufficient_detail"), None
    score = float(np.percentile(scores, BLUR_PERCENTILE))
    if score >= SHARP_SCORE:
        return Check("pass", "sharp"), score
    if score < BLURRY_SCORE:
        return Check("fail", "blurry", "blurry"), score
    return Check("unsure", "borderline_sharpness"), score


def _center(values: np.ndarray) -> np.ndarray:
    h, w = values.shape[:2]
    mx = int(w * (1 - CENTER_SHARE) / 2)
    my = int(h * (1 - CENTER_SHARE) / 2)
    return values[my:max(my + 1, h - my), mx:max(mx + 1, w - mx)]


def check_lighting(g: np.ndarray) -> Check:
    """Too dark and too bright and strong glare fail (a warning); low contrast is unsure."""
    mean = g.mean()
    dark = (g <= DARK_PIXEL).mean()
    bright = (g >= BRIGHT_PIXEL).mean()
    if mean < DARK_MEAN or dark > DARK_SHARE:
        return Check("fail", "underexposed", "too_dark")
    if mean > BRIGHT_MEAN or bright > BRIGHT_SHARE:
        return Check("fail", "overexposed", "too_bright")
    # Glare: blown-out spots in the middle of an item that is otherwise not white.
    center = _center(g)
    if (center >= BRIGHT_PIXEL).mean() >= GLARE_SHARE and np.percentile(center, 50) < GLARE_MAX_CENTER_MEDIAN:
        return Check("fail", "glare", "glare")
    p5, p95 = np.percentile(g, [5, 95])
    if p95 - p5 < 15:
        return Check("unsure", "low_contrast")
    if 70.0 <= mean <= 200.0 and dark < 0.10 and bright < 0.12:
        return Check("pass", "acceptable_light")
    return Check("unsure", "borderline_exposure")


def _erode(mask: np.ndarray, k: int) -> np.ndarray:
    # Pixels outside the frame don't count (as in OpenCV): treat them as set.
    return ndimage.minimum_filter(mask.astype(np.uint8), size=k, mode="constant", cval=1).astype(bool)


def _dilate(mask: np.ndarray, k: int) -> np.ndarray:
    return ndimage.maximum_filter(mask.astype(np.uint8), size=k, mode="constant", cval=0).astype(bool)


def find_item(rgb: np.ndarray) -> tuple[Check, float | None, np.ndarray | None, np.ndarray | None]:
    """
    The item as the largest region that differs from the background (the median color of the
    photo's border), and whether its outline runs along an edge of the frame. A busy
    background (more than 30% of the border is not one surface) is unsure, not a failure.
    Returns (check, edge share, item region, background L*a*b*).
    """
    h, w, _ = rgb.shape
    if min(w, h) < 16:
        return Check("unsure", "too_small"), None, None, None
    lab = rgb_to_lab(rgb).astype(np.float32)
    band = min(max(4, round(BORDER_SHARE * min(w, h))), min(w, h) // 2)
    # Same strip as the phone: top and bottom rows, then left and right columns (corners twice).
    strip = np.concatenate([
        lab[:band].reshape(-1, 3), lab[h - band:].reshape(-1, 3),
        lab[:, :band].reshape(-1, 3), lab[:, w - band:].reshape(-1, 3),
    ])
    background = np.median(strip, axis=0)
    strip_distance = np.sqrt(((strip - background) ** 2).sum(axis=1))
    if (strip_distance > BORDER_NOISE_DISTANCE).mean() > BORDER_MAX_NOISY_SHARE:
        return Check("unsure", "background_not_uniform"), None, None, None

    threshold = max(ITEM_MIN_DISTANCE, 3.0 * float(np.percentile(strip_distance, 75)))
    mask = np.sqrt(((lab - background) ** 2).sum(axis=2)) > threshold
    mask = _dilate(_erode(mask, 5), 5)    # open: drop specks
    mask = _erode(_dilate(mask, 11), 11)  # close: fill small gaps

    labels, count = ndimage.label(mask, structure=np.ones((3, 3), dtype=bool))
    if count == 0:
        return Check("unsure", "garment_not_detected"), None, None, background
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    biggest = int(sizes.argmax())
    if sizes[biggest] < ITEM_MIN_AREA * w * h:
        return Check("unsure", "garment_not_detected"), None, None, background
    item = labels == biggest

    padded = np.pad(item, 1, constant_values=False)
    interior = padded[:-2, 1:-1] & padded[2:, 1:-1] & padded[1:-1, :-2] & padded[1:-1, 2:]
    outline = item & ~interior
    ys, xs = np.nonzero(outline)
    m = EDGE_MARGIN_PX
    touching = np.array([(ys <= m).sum(), (ys >= h - 1 - m).sum(), (xs <= m).sum(), (xs >= w - 1 - m).sum()])
    on_edge = ((ys <= m) | (ys >= h - 1 - m) | (xs <= m) | (xs >= w - 1 - m)).sum()
    share = float(on_edge / len(ys)) if len(ys) else 0.0
    if len(ys) and share >= CUT_OFF_OUTLINE_SHARE:
        return Check("fail", "garment_cut_off", _SIDES[int(touching.argmax())]), share, item, background
    return Check("pass", "garment_fully_visible"), share, item, background


def check_photo(rgb: np.ndarray) -> Quality:
    """
    The three checks. As on the phone, a "blurry" result on a photo that is also badly lit is
    not trusted (darkness hides edges), so only the lighting is reported.
    """
    g = gray(rgb)
    lighting = check_lighting(g)
    sharp, sharpness = check_sharpness(g)
    if lighting.status == "fail" and sharp.status == "fail":
        sharp = Check("unsure", "not_judged_due_to_exposure")
    whole, share, region, background = find_item(rgb)
    return Quality(sharp=sharp, lighting=lighting, whole_item=whole, sharpness=sharpness,
                   brightness=float(g.mean()), edge_share=share, region=region, background=background)
