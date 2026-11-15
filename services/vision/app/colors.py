"""The apps' 15 color values and the color math the photo check shares.

The values, their typical shades, the related-shade pairs and the thresholds come from the app's
former ItemColor.kt (mobile/shared). A suggestion's colors are only ever these values. There is
no gold or silver: a photo can't tell metal from fabric. color_reader.py reads a garment's
colors and maps them to these values (V1a; the old per-pixel vote reader is gone).
"""

import numpy as np

# Name and typical sRGB values. color_reader maps each xkcd color name to the value of its
# closest typical shade.
COLOR_NAMES: tuple[tuple[str, tuple[tuple[int, int, int], ...]], ...] = (
    ("Black", ((20, 20, 20), (40, 40, 45))),
    ("White", ((245, 245, 245), (235, 235, 228))),
    ("Grey", ((128, 128, 128), (90, 90, 95), (165, 165, 165), (192, 192, 198), (210, 212, 216))),
    ("Navy", ((25, 35, 85), (0, 0, 128), (30, 40, 70))),
    ("Blue", ((40, 95, 195), (70, 130, 180), (30, 60, 170))),
    ("Green", ((60, 145, 60), (34, 139, 34), (110, 140, 60))),
    ("Emerald", ((0, 115, 80), (0, 150, 110))),
    ("Red", ((205, 30, 35), (230, 20, 20), (180, 20, 30))),
    ("Maroon", ((120, 15, 35), (128, 0, 32), (90, 15, 30))),
    ("Pink", ((236, 130, 170), (255, 182, 193), (255, 105, 180))),
    ("Purple", ((110, 45, 140), (128, 0, 128), (150, 100, 180))),
    ("Orange", ((235, 125, 35), (255, 140, 0), (210, 105, 30))),
    ("Yellow", ((242, 210, 50), (255, 240, 120), (200, 160, 60), (212, 175, 55))),
    ("Beige", ((220, 200, 165), (235, 220, 190), (200, 180, 150))),
    ("Brown", ((115, 75, 45), (90, 55, 30), (150, 100, 60))),
)
NAMES = tuple(name for name, _ in COLOR_NAMES)

# Shades that are light, shadow or a neighbor of each other on one item, never "a second color".
_PAIRS = (
    ("Black", "Navy"), ("Black", "Grey"), ("Grey", "White"), ("White", "Beige"), ("Beige", "Brown"),
    ("Beige", "Yellow"), ("Brown", "Maroon"), ("Brown", "Orange"), ("Maroon", "Red"),
    ("Maroon", "Purple"), ("Red", "Pink"), ("Red", "Orange"), ("Orange", "Yellow"),
    ("Pink", "Purple"), ("Navy", "Blue"), ("Blue", "Purple"), ("Green", "Emerald"),
)
RELATED: dict[int, frozenset[int]] = {
    i: frozenset(NAMES.index(b) for a, b in _PAIRS + tuple((y, x) for x, y in _PAIRS) if a == name)
    for i, name in enumerate(NAMES)
}

# Thresholds (PhotoThresholds.kt).
COLOR_MIN_SHARE = 0.35       # the top color (with its related shades) needs this share
COLOR_TIE_RATIO = 0.75       # a second color this close to the top one: too close to call
SECOND_COLOR_MIN_SHARE = 0.12
SKIN_MAX_SHARE = 0.6         # skin-toned pixels above this share are the fabric (a beige dress)

_SRGB_TO_LINEAR = np.array(
    [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in (v / 255.0 for v in range(256))]
)


def srgb_to_linear(rgb: np.ndarray) -> np.ndarray:
    """sRGB (uint8) to linear light, 0-1."""
    return _SRGB_TO_LINEAR[np.asarray(rgb, dtype=np.uint8)]


def rgb_to_lab(rgb: np.ndarray) -> np.ndarray:
    """sRGB (D65, uint8, last axis 3) to CIE L*a*b*: L 0-100, a and b about -128..127."""
    return linear_to_lab(srgb_to_linear(rgb))


def linear_to_lab(lin: np.ndarray) -> np.ndarray:
    """Linear sRGB (0-1, last axis 3) to CIE L*a*b*."""
    r, g, b = lin[..., 0], lin[..., 1], lin[..., 2]
    x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047
    y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b
    z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883

    def f(t: np.ndarray) -> np.ndarray:
        return np.where(t > 216.0 / 24389.0, np.cbrt(t), (24389.0 / 27.0 * t + 16) / 116)

    fx, fy, fz = f(x), f(y), f(z)
    return np.stack([116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)], axis=-1)


def looks_like_skin(rgb: np.ndarray) -> np.ndarray:
    """Typical skin tones (YCbCr, Chai & Ngan), so a model's arms and face don't name the garment."""
    r, g, b = (rgb[..., i].astype(np.float64) for i in range(3))
    cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b
    cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b
    y = 0.299 * r + 0.587 * g + 0.114 * b
    return (y > 40) & (cb >= 77) & (cb <= 127) & (cr >= 133) & (cr <= 173)
