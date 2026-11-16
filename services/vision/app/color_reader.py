"""Garment colors (V1a): the color reader.

Colors come from the garment's own pixels; the fashion model only gives a second opinion.

1. Garment mask: OpenCV GrabCut, seeded with the framing check's item region
   (quality.find_item) or, when it found none (a busy background such as a patterned rug), the
   middle of the photo. The photo's border is always background.
2. Light: the light's cast is estimated from the background when the background is a neutral
   surface (it then sits on the daylight locus, warm to cool) and removed von Kries style, up
   to the casts real lights give. A colored background (a red rug) can't tell its own color
   from the light's, so it leaves the photo as it is. A dim photo is brightened, up to a limit.
3. Measure: the garment's pixels in CIELAB, clustered with k-means. Lightness counts half (the
   textile industry's 2:1 weighting), and clusters that are one fabric lit and in shadow are
   joined. Clusters under MIN_CLUSTER_SHARE of the garment are left out; each is named by its
   lit half.
4. Name: each cluster takes the nearest name of the xkcd color survey (color_names.json, CC0)
   by CIEDE2000 with the textile lightness factor, and each name maps to one of the apps' 15
   color values (colors.NAMES; palette() and FINE_OVERRIDES). Only those 15 values are ever
   returned.
5. Second opinion: the model compares "a photo of a <name> garment" prompts for the names near
   the colors the pixels found; the rule is in read_listing().
Budget: under a second per photo on the service's 2 CPUs (GrabCut runs at MASK_LONG_SIDE).
"""

from dataclasses import dataclass, field
from functools import lru_cache
import json

import cv2
import numpy as np
from scipy import ndimage

from . import config
from .colors import (
    COLOR_MIN_SHARE, COLOR_TIE_RATIO, COLOR_NAMES, NAMES, RELATED, SECOND_COLOR_MIN_SHARE, SKIN_MAX_SHARE,
    linear_to_lab, looks_like_skin, srgb_to_linear,
)

# Garment mask.
MASK_LONG_SIDE = 256          # GrabCut and all color work run at this size (speed; colors need no detail)
GRABCUT_ITERATIONS = 3
MASK_BORDER_SHARE = 0.025     # this band of the frame is always background
SEED_CENTER_SHARE = 0.6       # the seed box when the framing check found no item
MIN_MASK_SHARE = 0.02         # a smaller garment mask falls back to the seed
KEEP_PART_SHARE = 0.10        # mask parts this size of the largest stay (a blouse beside a skirt)

# Light.
BACKGROUND_MIN_PIXELS = 400
NEUTRAL_OFF_LOCUS = 0.10      # log-chromaticity distance from the daylight locus a neutral surface can have
WARMEST_K, COOLEST_K = 3500.0, 10000.0  # the strongest casts removed (what a phone leaves of warm bulbs or shade)
EXPOSURE_TARGET = 0.85        # linear level the photo's highlights (99th percentile, brightest channel) are brought up to
EXPOSURE_MAX_GAIN = 2.5       # never brightened more than this; never darkened (clipped highlights stay)

# Measure.
SAMPLE_PER_PHOTO = 6000
L_WEIGHT = 0.5
KMEANS_K = 4
KMEANS_ITERATIONS = 15
MERGE_DISTANCE = 6.0          # weighted Lab distance under which two clusters are one color
# One fabric lit and shaded: at most SHADE_MAX_RATIO apart in luminance, and either this close in
# lightness-free chromaticity (a and b over L + 16), or (for clearly colored ones) the same hue
# within SHADE_HUE_DEGREES with relative saturations at least SHADE_SATURATION_RATIO of each other.
SHADE_MAX_RATIO = 4.0
SHADE_CHROMA = 0.05
SHADE_MIN_SATURATION = 0.12
SHADE_HUE_DEGREES = 25.0
SHADE_SATURATION_RATIO = 0.6
MIN_CLUSTER_SHARE = 0.06
MIN_GARMENT_PIXELS = 200

# Second opinion.
CANDIDATE_DE = 12.0           # names this close (CIEDE2000) to a contender's color are the model's candidates
CANDIDATE_MIN = 4             # and at least this many of the nearest
NEAR_TIE_DE = 4.0             # a value whose nearest name is this close to the main color's own: a near tie
CLOSE_CALL = 0.5              # a second color with at least this share of the main one's: a close call
MODEL_CLEAR = 0.75            # the model's share for a contender that counts as clearly preferring it
CONFIDENCE = {"agree": 0.9, "settled": 0.7, "pixels_only": 0.6, "disagree": 0.4}


# ---- Names ---------------------------------------------------------------------------------

TEXTILE_KL = 2.0  # CIEDE2000's lightness factor for textiles: lightness differences count half


def delta_e2000(lab1: np.ndarray, lab2: np.ndarray, k_l: float = 1.0) -> np.ndarray:
    """CIEDE2000 color difference (Sharma, Wu and Dalal 2005), broadcasting over the last axis.
    [k_l] is the parametric lightness factor (1 for the reference formula, TEXTILE_KL for fabric)."""
    L1, a1, b1 = (np.asarray(lab1, dtype=np.float64)[..., i] for i in range(3))
    L2, a2, b2 = (np.asarray(lab2, dtype=np.float64)[..., i] for i in range(3))
    c_mean = (np.hypot(a1, b1) + np.hypot(a2, b2)) / 2
    g = 0.5 * (1 - np.sqrt(c_mean ** 7 / (c_mean ** 7 + 25.0 ** 7)))
    a1p, a2p = (1 + g) * a1, (1 + g) * a2
    c1p, c2p = np.hypot(a1p, b1), np.hypot(a2p, b2)
    h1p = np.degrees(np.arctan2(b1, a1p)) % 360
    h2p = np.degrees(np.arctan2(b2, a2p)) % 360
    chroma_zero = (c1p * c2p) == 0
    dh = h2p - h1p
    dh = np.where(dh > 180, dh - 360, np.where(dh < -180, dh + 360, dh))
    dh = np.where(chroma_zero, 0.0, dh)
    d_l, d_c = L2 - L1, c2p - c1p
    d_h = 2 * np.sqrt(c1p * c2p) * np.sin(np.radians(dh / 2))
    l_mean, cp_mean = (L1 + L2) / 2, (c1p + c2p) / 2
    h_sum = h1p + h2p
    h_mean = np.where(chroma_zero, h_sum,
                      np.where(np.abs(h1p - h2p) <= 180, h_sum / 2,
                               np.where(h_sum < 360, (h_sum + 360) / 2, (h_sum - 360) / 2)))
    t = (1 - 0.17 * np.cos(np.radians(h_mean - 30)) + 0.24 * np.cos(np.radians(2 * h_mean))
         + 0.32 * np.cos(np.radians(3 * h_mean + 6)) - 0.20 * np.cos(np.radians(4 * h_mean - 63)))
    d_theta = 30 * np.exp(-(((h_mean - 275) / 25) ** 2))
    r_c = 2 * np.sqrt(cp_mean ** 7 / (cp_mean ** 7 + 25.0 ** 7))
    s_l = 1 + 0.015 * (l_mean - 50) ** 2 / np.sqrt(20 + (l_mean - 50) ** 2)
    s_c = 1 + 0.045 * cp_mean
    s_h = 1 + 0.015 * cp_mean * t
    r_t = -np.sin(np.radians(2 * d_theta)) * r_c
    return np.sqrt((d_l / (k_l * s_l)) ** 2 + (d_c / s_c) ** 2 + (d_h / s_h) ** 2 + r_t * (d_c / s_c) * (d_h / s_h))


def _hex_rgb(value: str) -> tuple[int, int, int]:
    return int(value[1:3], 16), int(value[3:5], 16), int(value[5:7], 16)


# Every name maps to the value of its closest typical shade (colors.COLOR_NAMES, CIEDE2000 with
# the textile lightness factor), except the tans (YELLOW_MIN_CHROMA below) and these few, where
# that shade is another color family than the one the name says. Each is listed in the V1a
# handoff for the owner.
FINE_OVERRIDES: dict[str, str] = {
    # Off-whites: closest to a beige shade, but a lender calls an ivory or cream piece white.
    "off white": "White", "ivory": "White", "cream": "White", "eggshell": "White", "pale": "White",
    # Charcoal is a grey (its closest shade is a black).
    "charcoal": "Grey", "charcoal grey": "Grey",
    # Tans and browns whose closest shade is a gold (Yellow).
    "camel": "Beige", "tan": "Beige", "sand": "Beige", "khaki": "Beige", "light beige": "Beige",
    "sandy brown": "Brown", "sand brown": "Brown", "golden brown": "Brown", "yellowish brown": "Brown",
    "yellowy brown": "Brown", "mustard brown": "Brown",
    # A vivid blue, not navy.
    "royal blue": "Blue",
    # The survey's emerald is a brighter green than the apps' Emerald shades, but it is that value.
    "emerald": "Emerald",
    # The survey's "dark" (#1b2431) is a blue-black; the old reader's navy rule (blue at least 15
    # over red and green) called it navy too.
    "dark": "Navy",
}
# Yellow is a saturated yellow (the apps' Yellow shades are yellows and golds). A name whose
# closest shade is a Yellow one but with less chroma than this is a tan: Beige when light
# (L* at least TAN_LIGHT_L), Brown when dark.
YELLOW_MIN_CHROMA = 52.0
TAN_LIGHT_L = 55.0

# The model's prompts for every name ("a photo of an ivory garment"), averaged per name.
COLOR_TEMPLATES = ("a photo of {a} {name} garment", "{name} clothing")


def color_prompts() -> list[tuple[str, tuple[str, ...]]]:
    """(name, prompts) for every palette name, in the palette's order: what build_assets embeds."""
    return [(n, tuple(t.format(a="an" if n[0] in "aeiou" else "a", name=n) for t in COLOR_TEMPLATES))
            for n in palette().names]


def color_digest() -> str:
    """Changes whenever a name or prompt changes; the built color embeddings record it."""
    import hashlib

    return hashlib.sha256(json.dumps(color_prompts()).encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class Palette:
    """The xkcd names, their L*a*b*, the app value each maps to and how far that value's
    closest typical shade is (CIEDE2000)."""
    names: tuple[str, ...]
    labs: np.ndarray
    value: np.ndarray       # index into NAMES
    distance: np.ndarray    # to the mapped value's closest typical shade
    index: dict[str, int] = field(repr=False)


def _shade_labs() -> tuple[np.ndarray, np.ndarray]:
    rgb = np.array([s for _, shades in COLOR_NAMES for s in shades], dtype=np.uint8)
    owner = np.array([i for i, (_, shades) in enumerate(COLOR_NAMES) for _ in shades])
    return linear_to_lab(srgb_to_linear(rgb)), owner


@lru_cache(maxsize=1)
def palette() -> Palette:
    doc = json.loads(config.COLOR_NAMES_FILE.read_text(encoding="utf-8"))
    names = tuple(n for n, _ in doc["colors"])
    rgb = np.array([_hex_rgb(h) for _, h in doc["colors"]], dtype=np.uint8)
    labs = linear_to_lab(srgb_to_linear(rgb))
    shade_labs, owner = _shade_labs()
    d = delta_e2000(labs[:, None, :], shade_labs[None, :, :], TEXTILE_KL)
    value = owner[d.argmin(axis=1)]
    tan = (value == NAMES.index("Yellow")) & (np.hypot(labs[:, 1], labs[:, 2]) < YELLOW_MIN_CHROMA)
    value[tan] = np.where(labs[tan, 0] >= TAN_LIGHT_L, NAMES.index("Beige"), NAMES.index("Brown"))
    for name, app in FINE_OVERRIDES.items():
        value[names.index(name)] = NAMES.index(app)
    distance = np.array([d[i, owner == value[i]].min() for i in range(len(names))])
    return Palette(names=names, labs=labs, value=value, distance=distance, index={n: i for i, n in enumerate(names)})


def nearest_names(lab: np.ndarray, n: int = 1) -> tuple[np.ndarray, np.ndarray]:
    """The [n] closest palette names to one L*a*b* color: (indices, CIEDE2000 distances), closest first."""
    p = palette()
    d = delta_e2000(p.labs, np.asarray(lab, dtype=np.float64)[None, :], TEXTILE_KL)
    order = np.argsort(d, kind="stable")[:n]
    return order, d[order]


# ---- Light ---------------------------------------------------------------------------------

_XYZ_TO_LINEAR = np.array([
    [3.2404542, -1.5371385, -0.4985314],
    [-0.9692660, 1.8760108, 0.0415560],
    [0.0556434, -0.2040259, 1.0572252],
])


def daylight_rgb(kelvin: float) -> np.ndarray:
    """Linear sRGB (G = 1) of CIE daylight at [kelvin] (the D-illuminant chromaticity formula, used
    below 4000 K too). 6504 K is D65, the sRGB white: (1, 1, 1)."""
    t = float(kelvin)
    if t <= 7000:
        x = -4.6070e9 / t ** 3 + 2.9678e6 / t ** 2 + 0.09911e3 / t + 0.244063
    else:
        x = -2.0064e9 / t ** 3 + 1.9018e6 / t ** 2 + 0.24748e3 / t + 0.237040
    y = -3.000 * x * x + 2.870 * x - 0.275
    rgb = _XYZ_TO_LINEAR @ np.array([x / y, 1.0, (1 - x - y) / y])
    return rgb / rgb[1]


def _log_chroma(rgb: np.ndarray) -> np.ndarray:
    """(log R/G, log B/G) of linear RGB rows."""
    eps = 1e-4
    return np.stack([np.log((rgb[..., 0] + eps) / (rgb[..., 1] + eps)),
                     np.log((rgb[..., 2] + eps) / (rgb[..., 1] + eps))], axis=-1)


@lru_cache(maxsize=1)
def daylight_axis() -> tuple[np.ndarray, np.ndarray, float, float]:
    """The daylight locus in log-chromaticity: (origin, unit direction warm to cool, the warmest and
    coolest positions removed). It's a near-straight line through D65, the sRGB white (0, 0)."""
    warm, cool, mid = (_log_chroma(daylight_rgb(k)) for k in (2700.0, 12000.0, 6504.0))
    direction = (cool - warm) / np.linalg.norm(cool - warm)
    lo, hi = (float((_log_chroma(daylight_rgb(k)) - mid) @ direction) for k in (WARMEST_K, COOLEST_K))
    return mid, direction, lo, hi


@dataclass
class Light:
    """What the photo's light correction did, for the eval and the tests."""
    neutral_background: bool
    position: float      # along the daylight axis (negative = warm light), 0 when not corrected
    off_locus: float     # how far the background's color is from any light's
    gains: np.ndarray    # the RGB gains applied (exposure included)


def correct_light(linear: np.ndarray, background: np.ndarray) -> tuple[np.ndarray, Light]:
    """[linear] (h x w x 3) with the light's cast removed, using the [background] pixels (bool h x w)."""
    lum = 0.2126 * linear[..., 0] + 0.7152 * linear[..., 1] + 0.0722 * linear[..., 2]
    usable = background & (linear.max(axis=-1) < 0.98) & (lum > 0.03)
    gains = np.ones(3)
    neutral, position, off = False, 0.0, float("nan")
    if usable.sum() >= BACKGROUND_MIN_PIXELS:
        chroma = np.median(_log_chroma(linear[usable]), axis=0)
        origin, direction, warmest, coolest = daylight_axis()
        rel = chroma - origin
        along = float(rel @ direction)
        off = float(np.linalg.norm(rel - along * direction))
        if off <= NEUTRAL_OFF_LOCUS:
            neutral = True
            position = float(np.clip(along, warmest, coolest))
            # The light is the point of the locus the background sits at: divide it out. The
            # background's own small tint off the locus stays.
            cast = origin + position * direction
            gains = np.array([np.exp(-cast[0]), 1.0, np.exp(-cast[1])])
            gains /= 0.2126 * gains[0] + 0.7152 * gains[1] + 0.0722 * gains[2]
    out = linear * gains
    # How close the photo comes to clipping: its brightest channel, so a bright red cloth (low
    # luminance, but fully exposed) isn't taken for a dim photo.
    highlights = float(np.percentile(out.max(axis=-1), 99))
    exposure = float(np.clip(EXPOSURE_TARGET / max(highlights, 1e-4), 1.0, EXPOSURE_MAX_GAIN))
    out = np.clip(out * exposure, 0.0, 1.0)
    return out, Light(neutral, position, off, gains * exposure)


# ---- Mask ----------------------------------------------------------------------------------

def small_image(rgb: np.ndarray) -> np.ndarray:
    h, w = rgb.shape[:2]
    scale = MASK_LONG_SIDE / max(h, w)
    if scale >= 1:
        return rgb
    return cv2.resize(rgb, (max(1, round(w * scale)), max(1, round(h * scale))), interpolation=cv2.INTER_AREA)


def seed_mask(shape: tuple[int, int], region: np.ndarray | None) -> np.ndarray:
    """Where the garment probably is: the framing check's item, else the middle of the photo."""
    h, w = shape
    if region is not None and region.any():
        return cv2.resize(region.astype(np.uint8), (w, h), interpolation=cv2.INTER_NEAREST).astype(bool)
    seed = np.zeros((h, w), dtype=bool)
    mx, my = int(w * (1 - SEED_CENTER_SHARE) / 2), int(h * (1 - SEED_CENTER_SHARE) / 2)
    seed[my:max(my + 1, h - my), mx:max(mx + 1, w - mx)] = True
    return seed


def border_band(shape: tuple[int, int]) -> np.ndarray:
    h, w = shape
    band = max(2, round(MASK_BORDER_SHARE * min(h, w)))
    out = np.zeros((h, w), dtype=bool)
    out[:band], out[h - band:], out[:, :band], out[:, w - band:] = True, True, True, True
    return out


def garment_mask(small: np.ndarray, seed: np.ndarray) -> tuple[np.ndarray, bool]:
    """GrabCut from [seed] (probably garment) and the border (background). Returns (mask, grabcut used)."""
    h, w = seed.shape
    border = border_band((h, w))
    init = np.full((h, w), cv2.GC_PR_BGD, dtype=np.uint8)
    init[seed] = cv2.GC_PR_FGD
    init[border] = cv2.GC_BGD
    fallback = seed & ~border
    if not (init == cv2.GC_PR_FGD).any():
        return fallback, False
    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    cv2.setRNGSeed(0)  # GrabCut's GMM start uses OpenCV's random generator: same photo, same mask
    try:
        cv2.grabCut(np.ascontiguousarray(small), init, None, bgd, fgd, GRABCUT_ITERATIONS, cv2.GC_INIT_WITH_MASK)
    except cv2.error:
        return fallback, False
    mask = (init == cv2.GC_FGD) | (init == cv2.GC_PR_FGD)
    mask = ndimage.binary_opening(mask, structure=np.ones((3, 3), dtype=bool))
    labels, count = ndimage.label(mask)
    if count:
        sizes = np.bincount(labels.ravel())
        sizes[0] = 0
        keep = np.nonzero(sizes >= KEEP_PART_SHARE * sizes.max())[0]
        mask = np.isin(labels, keep)
    if mask.sum() < MIN_MASK_SHARE * h * w:
        return fallback, False
    return mask, True


# ---- One photo -----------------------------------------------------------------------------

@dataclass
class PhotoColors:
    """One photo's garment pixels after the light correction (L*a*b*, a sample), and how they were found."""
    lab: np.ndarray
    mask_share: float = 0.0
    grabcut: bool = False
    light: Light | None = None


def read_photo(rgb: np.ndarray, region: np.ndarray | None) -> PhotoColors:
    """The garment's pixels in one photo ([rgb] the working image, [region] the framing check's item)."""
    small = small_image(rgb)
    h, w = small.shape[:2]
    seed = seed_mask((h, w), region)
    mask, used = garment_mask(small, seed)
    linear = srgb_to_linear(small)
    background = ~ndimage.binary_dilation(mask, iterations=3)
    corrected, light = correct_light(linear, background)
    pixels_rgb = small[mask]
    pixels = corrected[mask]
    if len(pixels):
        skin = looks_like_skin(pixels_rgb)
        # A skin-toned garment: its "skin" pixels are the fabric.
        if skin.sum() <= SKIN_MAX_SHARE * len(skin):
            pixels = pixels[~skin]
    if len(pixels) > SAMPLE_PER_PHOTO:
        pick = np.random.default_rng(0).choice(len(pixels), SAMPLE_PER_PHOTO, replace=False)
        pixels = pixels[np.sort(pick)]
    return PhotoColors(lab=linear_to_lab(pixels).astype(np.float32), mask_share=float(mask.mean()),
                       grabcut=used, light=light)


# ---- Clusters and naming -------------------------------------------------------------------

@dataclass
class Cluster:
    lab: np.ndarray       # the median L*a*b* of its pixels
    share: float          # of the garment's pixels
    fine: int             # palette index of its name
    distance: float       # CIEDE2000 to that name
    value: int            # index into NAMES


def _kmeans(x: np.ndarray, k: int) -> np.ndarray:
    """Labels from k-means with a k-means++ start; the generator is seeded, so it's repeatable."""
    rng = np.random.default_rng(0)
    centers = [x[rng.integers(len(x))]]
    for _ in range(1, k):
        d = np.min(((x[:, None, :] - np.array(centers)[None, :, :]) ** 2).sum(axis=2), axis=1)
        if d.sum() <= 0:
            break
        centers.append(x[rng.choice(len(x), p=d / d.sum())])
    centers = np.array(centers)
    labels = np.zeros(len(x), dtype=np.int64)
    for _ in range(KMEANS_ITERATIONS):
        labels = ((x[:, None, :] - centers[None, :, :]) ** 2).sum(axis=2).argmin(axis=1)
        moved = np.array([x[labels == j].mean(axis=0) if (labels == j).any() else centers[j]
                          for j in range(len(centers))])
        if np.allclose(moved, centers):
            break
        centers = moved
    return labels


def _same_color(a: np.ndarray, b: np.ndarray) -> bool:
    """Two cluster centers (weighted L*a*b*, see clusters) that are one color: close, or the same
    chromaticity at a different light level (a fold's shadow: a and b shrink with L + 16)."""
    if np.linalg.norm(a - b) < MERGE_DISTANCE:
        return True
    la, lb = a[0] / L_WEIGHT + 16, b[0] / L_WEIGHT + 16
    if min(la, lb) <= 0 or (max(la, lb) / min(la, lb)) ** 3 > SHADE_MAX_RATIO:  # luminance goes with (L + 16) cubed
        return False
    ua, va, ub, vb = a[1] / la, a[2] / la, b[1] / lb, b[2] / lb
    if np.hypot(ua - ub, va - vb) < SHADE_CHROMA:
        return True
    sa, sb = np.hypot(ua, va), np.hypot(ub, vb)
    if min(sa, sb) < SHADE_MIN_SATURATION or min(sa, sb) < SHADE_SATURATION_RATIO * max(sa, sb):
        return False
    hue = abs(np.degrees(np.arctan2(va, ua) - np.arctan2(vb, ub))) % 360
    return bool(min(hue, 360 - hue) <= SHADE_HUE_DEGREES)


def clusters(lab: np.ndarray) -> list[Cluster]:
    """The garment's main colors, largest first: k-means in L*a*b* with lightness weighted down;
    clusters of one color (close, or one fabric lit and shaded) joined; ones under
    MIN_CLUSTER_SHARE left out. Each is named by its lit half."""
    if len(lab) < MIN_GARMENT_PIXELS:
        return []
    weights = np.array([L_WEIGHT, 1.0, 1.0])
    x = lab.astype(np.float64) * weights
    labels = _kmeans(x, KMEANS_K)
    groups = [np.nonzero(labels == j)[0] for j in np.unique(labels)]
    merged = True
    while merged and len(groups) > 1:
        merged = False
        centers = [x[g].mean(axis=0) for g in groups]
        for i in range(len(groups)):
            for j in range(i + 1, len(groups)):
                if _same_color(centers[i], centers[j]):
                    groups[i] = np.concatenate([groups[i], groups[j]])
                    del groups[j]
                    merged = True
                    break
            if merged:
                break
    p = palette()
    out = []
    for g in groups:
        share = len(g) / len(lab)
        if share < MIN_CLUSTER_SHARE:
            continue
        # The fabric's color is how it looks where the light falls on it: the lit half of the cluster.
        members = lab[g].astype(np.float64)
        lit = members[members[:, 0] >= np.median(members[:, 0])]
        center = np.median(lit, axis=0)
        (fine,), (dist,) = nearest_names(center, 1)
        out.append(Cluster(lab=center, share=share, fine=int(fine), distance=float(dist), value=int(p.value[fine])))
    return sorted(out, key=lambda c: -c.share)


@dataclass
class PixelColors:
    """What the pixels say: the main and second color by the app's rules, the leading value, the
    leading unrelated one (main's share includes its related shades), and every value's own share."""
    main: str | None
    second: str | None
    top: str | None = None
    top_share: float = 0.0
    runner_up: str | None = None
    runner_up_share: float = 0.0
    own: dict[str, float] = field(default_factory=dict)

    @property
    def tie(self) -> bool:
        return self.main is None and self.runner_up is not None


def pixel_colors(found: list[Cluster]) -> PixelColors:
    if not found:
        return PixelColors(None, None)
    shares = np.zeros(len(NAMES))
    for c in found:
        shares[c.value] += c.share
    total = shares.sum()
    if total <= 0:
        return PixelColors(None, None)
    shares = shares / total
    own = {NAMES[i]: float(shares[i]) for i in range(len(NAMES)) if shares[i] > 0}
    ranked = sorted(range(len(NAMES)), key=lambda i: -shares[i])  # stable: ties keep NAMES order
    top = ranked[0]
    top_share = float(shares[top] + sum(shares[i] for i in RELATED[top]))
    if top_share < COLOR_MIN_SHARE:
        return PixelColors(None, None, own=own)
    second = next((i for i in ranked[1:] if i not in RELATED[top] and shares[i] > 0), None)
    if second is None:
        return PixelColors(NAMES[top], None, NAMES[top], top_share, own=own)
    s = float(shares[second])
    if s >= COLOR_TIE_RATIO * top_share:
        return PixelColors(None, None, NAMES[top], top_share, NAMES[second], s, own)
    return PixelColors(NAMES[top], NAMES[second] if s >= SECOND_COLOR_MIN_SHARE else None,
                       NAMES[top], top_share, NAMES[second], s, own)


def name_values(found: list[Cluster]) -> tuple[str | None, str | None]:
    """The main color and a clear second color from the clusters, with the app's rules
    (colors.py): the main value takes in its related shades and needs COLOR_MIN_SHARE; the next
    unrelated value is the second color at SECOND_COLOR_MIN_SHARE; within COLOR_TIE_RATIO of the
    main one, the colors are too close to call and both are left out."""
    p = pixel_colors(found)
    return p.main, p.second


# ---- Second opinion ------------------------------------------------------------------------

@dataclass
class ColorBank:
    """The model's text embedding of "a photo of a <name> garment" for every palette name."""
    keys: list[str]
    matrix: np.ndarray
    index: dict[str, int] = field(init=False, repr=False)

    def __post_init__(self):
        self.index = {k: i for i, k in enumerate(self.keys)}


@dataclass
class ColorReading:
    colors: tuple[str | None, str | None]
    confidence: float | None
    rule: str                   # agree, near_tie, disagree, pixels_only, none
    pixel_colors: tuple[str | None, str | None]
    model_value: str | None = None
    model_share: float | None = None
    clusters: list[Cluster] = field(default_factory=list)


def _candidates(colors: list[np.ndarray]) -> np.ndarray:
    """Palette indices of the names near any of [colors]: within CANDIDATE_DE, at least CANDIDATE_MIN each."""
    p = palette()
    picked: list[int] = []
    for lab in colors:
        near, dist = nearest_names(lab, len(p.names))
        for i in near[(dist <= CANDIDATE_DE) | (np.arange(len(near)) < CANDIDATE_MIN)]:
            if int(i) not in picked:
                picked.append(int(i))
    return np.array(picked)


def second_opinion(colors: list[np.ndarray], embedding: np.ndarray | None, bank: ColorBank | None) -> dict[str, float]:
    """The model's shares per value over the names near [colors] (softmax of its similarity to
    each name's prompts, summed per value). Empty without the model."""
    if embedding is None or bank is None:
        return {}
    p = palette()
    candidates = _candidates(colors)
    rows = np.array([bank.index[p.names[i]] for i in candidates])
    logits = config.LOGIT_SCALE * (bank.matrix[rows] @ embedding)
    probs = np.exp(logits - logits.max())
    probs /= probs.sum()
    per_value: dict[str, float] = {}
    for i, q in zip(candidates, probs):
        per_value[NAMES[p.value[i]]] = per_value.get(NAMES[p.value[i]], 0.0) + float(q)
    return per_value


def _closest_by_value(lab: np.ndarray) -> dict[str, float]:
    """For each value, how close (CIEDE2000) its nearest palette name is to [lab]."""
    p = palette()
    near, dist = nearest_names(lab, len(p.names))
    closest: dict[str, float] = {}
    for i, d in zip(near, dist):
        closest.setdefault(NAMES[p.value[i]], float(d))
    return closest


def read_listing(photos: list[PhotoColors], embedding: np.ndarray | None = None,
                 bank: ColorBank | None = None) -> ColorReading:
    """The listing's colors from its whole-piece photos, with the model's second opinion.

    The pixels decide; the model only settles what the pixels can't. The contenders are the
    pixels' main color, a second color or a related shade with at least CLOSE_CALL of the main
    one's share (or tied with it), and any value whose nearest name is within NEAR_TIE_DE of the
    main color's own (the pixels can't tell them apart). The model is asked about the names near
    the contenders' colors only, and its share for a contender includes the contender's related
    shades (as the pixels count them).
    - When the model mostly (at least half) sees the contenders' colors:
      - its pick is the pixels' main color: kept ("agree", 0.9);
      - its pick is another contender with at least MODEL_CLEAR of its share: that one is the
        main color and the second is left out ("settled", 0.7).
    - Anything else: the pixel answer stays, with lower confidence ("disagree", 0.4); colors too
      close to call stay without a color. The lender sees no warning either way.
    Without the model: the pixel answer ("pixels_only", 0.6).
    """
    lab = np.concatenate([ph.lab for ph in photos]) if photos else np.zeros((0, 3), np.float32)
    found = clusters(lab)
    px = pixel_colors(found)
    pixel = (px.main, px.second)
    if px.top is None:
        return ColorReading((None, None), None, "none", pixel, clusters=found)

    def largest(value: str) -> Cluster:
        return next(c for c in found if NAMES[c.value] == value)

    contenders = [px.top]
    if px.runner_up and (px.tie or px.runner_up_share >= CLOSE_CALL * px.top_share):
        contenders.append(px.runner_up)
    # A related shade with a close share (maroon beside brown): which of the two is the main color.
    contenders += [v for v, s in px.own.items()
                   if v not in contenders and NAMES.index(v) in RELATED[NAMES.index(px.top)]
                   and s >= CLOSE_CALL * px.own[px.top]]
    closest = _closest_by_value(largest(px.top).lab)
    contenders += [v for v, d in closest.items() if v not in contenders and d - closest[px.top] <= NEAR_TIE_DE]

    shares = second_opinion([largest(v).lab for v in contenders if any(NAMES[c.value] == v for c in found)]
                            or [largest(px.top).lab], embedding, bank)
    if not shares:
        rule = "none" if px.main is None else "pixels_only"
        return ColorReading(pixel, CONFIDENCE.get(rule), rule, pixel, clusters=found)
    # The model's share per contender, its related shades included (as the pixels count them); a
    # shade related to two contenders counts for neither.
    per: dict[str, float] = {c: 0.0 for c in contenders}
    for v, q in shares.items():
        owners = [v] if v in per else [c for c in contenders if NAMES.index(v) in RELATED[NAMES.index(c)]]
        if len(owners) == 1:
            per[owners[0]] += q
    value = max(per, key=per.get)
    if sum(per.values()) >= 0.5:  # the model mostly sees the colors the pixels found
        if value == px.main:
            return ColorReading(pixel, CONFIDENCE["agree"], "agree", pixel, value, per[value], found)
        if per[value] >= MODEL_CLEAR:
            return ColorReading((value, None), CONFIDENCE["settled"], "settled", pixel, value, per[value], found)
    if px.main is None:
        return ColorReading((None, None), None, "none", pixel, value, per[value], found)
    return ColorReading(pixel, CONFIDENCE["disagree"], "disagree", pixel, value, per[value], found)
