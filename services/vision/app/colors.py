"""Color names from the garment's own pixels, never from the model.

A port of the app's ItemColor.kt (mobile/shared), so the phone and the server name a piece's
colors the same way: the same 15 names and typical shades, the same related-shade pairs and
the same thresholds. There is no gold or silver: a photo can't tell metal from fabric.
"""

from dataclasses import dataclass

import numpy as np

# Name and typical sRGB values; a pixel takes the name of the closest value in L*a*b*.
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
BLACK, NAVY = NAMES.index("Black"), NAMES.index("Navy")

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
COLOR_MIN_PIXELS = 200       # fewer sampled garment pixels: no color
COLOR_MIN_SHARE = 0.35       # the top color (with its related shades) needs this share
COLOR_TIE_RATIO = 0.75       # a second color this close to the top one: too close to call
SECOND_COLOR_MIN_SHARE = 0.12
NAVY_BLUE_EXCESS = 15.0      # dark pixels are navy when blue exceeds mean(red, green) by this
SKIN_MAX_SHARE = 0.6         # skin-toned pixels above this share are the fabric (a beige dress)
ITEM_MIN_DISTANCE = 12.0     # Lab distance from the background that counts as the item
CENTER_SHARE = 0.5           # the middle box used when no item region was found

_SRGB_TO_LINEAR = np.array(
    [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in (v / 255.0 for v in range(256))]
)


def rgb_to_lab(rgb: np.ndarray) -> np.ndarray:
    """sRGB (D65, uint8, last axis 3) to CIE L*a*b*: L 0-100, a and b about -128..127."""
    lin = _SRGB_TO_LINEAR[np.asarray(rgb, dtype=np.uint8)]
    r, g, b = lin[..., 0], lin[..., 1], lin[..., 2]
    x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047
    y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b
    z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883

    def f(t: np.ndarray) -> np.ndarray:
        return np.where(t > 216.0 / 24389.0, np.cbrt(t), (24389.0 / 27.0 * t + 16) / 116)

    fx, fy, fz = f(x), f(y), f(z)
    return np.stack([116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)], axis=-1)


_SAMPLE_LABS = rgb_to_lab(np.array([s for _, shades in COLOR_NAMES for s in shades], dtype=np.uint8))
_SAMPLE_NAME = np.array([i for i, (_, shades) in enumerate(COLOR_NAMES) for _ in shades])


def nearest_color_indices(rgb: np.ndarray) -> np.ndarray:
    """The index into NAMES of the closest color name for each (r, g, b) row."""
    labs = rgb_to_lab(rgb.reshape(-1, 3)).astype(np.float32)
    out = np.empty(len(labs), dtype=np.int64)
    refs = _SAMPLE_LABS.astype(np.float32)
    for start in range(0, len(labs), 65536):  # bounded memory: 64k pixels x 48 shades at a time
        chunk = labs[start:start + 65536]
        d = ((chunk[:, None, :] - refs[None, :, :]) ** 2).sum(axis=2)
        out[start:start + 65536] = _SAMPLE_NAME[d.argmin(axis=1)]
    return out


def nearest_color_name(r: int, g: int, b: int) -> str:
    return NAMES[int(nearest_color_indices(np.array([[r, g, b]], dtype=np.uint8))[0])]


def looks_like_skin(rgb: np.ndarray) -> np.ndarray:
    """Typical skin tones (YCbCr, Chai & Ngan), so a model's arms and face don't name the garment."""
    r, g, b = (rgb[..., i].astype(np.float64) for i in range(3))
    cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b
    cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b
    y = 0.299 * r + 0.587 * g + 0.114 * b
    return (y > 40) & (cb >= 77) & (cb <= 127) & (cr >= 133) & (cr <= 173)


@dataclass
class ColorVotes:
    """Pixel votes per color name, plus how blue the dark (black or navy) pixels are."""
    counts: np.ndarray
    dark_count: int = 0
    blue_excess: float = 0.0

    @property
    def total(self) -> int:
        return int(self.counts.sum())

    def __add__(self, other: "ColorVotes") -> "ColorVotes":
        return ColorVotes(self.counts + other.counts, self.dark_count + other.dark_count,
                          self.blue_excess + other.blue_excess)

    @staticmethod
    def empty() -> "ColorVotes":
        return ColorVotes(np.zeros(len(NAMES), dtype=np.int64))


def center_box(width: int, height: int) -> tuple[int, int, int, int]:
    """The middle CENTER_SHARE of the photo as (x0, y0, x1, y1)."""
    mx = int(width * (1 - CENTER_SHARE) / 2)
    my = int(height * (1 - CENTER_SHARE) / 2)
    return mx, my, max(mx + 1, width - mx), max(my + 1, height - my)


def color_votes(image: np.ndarray, region: np.ndarray | None, background: np.ndarray | None = None) -> ColorVotes:
    """
    Votes from the garment's pixels (every second pixel each way): [region] (the item the framing
    check found) when there is one, otherwise the center box minus pixels that match the
    border's color. Skin tones are left out unless they're most of the item.
    """
    h, w, _ = image.shape
    if region is not None:
        inside = region[::2, ::2]
    else:
        x0, y0, x1, y1 = center_box(w, h)
        ys = np.arange(0, h, 2)
        xs = np.arange(0, w, 2)
        inside = ((ys >= y0) & (ys < y1))[:, None] & ((xs >= x0) & (xs < x1))[None, :]
    pixels = image[::2, ::2][inside]
    if region is None and background is not None and len(pixels):
        far = np.sqrt(((rgb_to_lab(pixels) - background) ** 2).sum(axis=1)) > ITEM_MIN_DISTANCE
        pixels = pixels[far]
    if not len(pixels):
        return ColorVotes.empty()

    names = nearest_color_indices(pixels)
    dark = (names == BLACK) | (names == NAVY)
    blue = pixels[:, 2].astype(np.float64) - (pixels[:, 0].astype(np.float64) + pixels[:, 1]) / 2.0
    skin = looks_like_skin(pixels)

    def votes(mask: np.ndarray) -> ColorVotes:
        return ColorVotes(np.bincount(names[mask], minlength=len(NAMES)).astype(np.int64),
                          int((dark & mask).sum()), float(blue[dark & mask].sum()))

    fabric, skin_votes = votes(~skin), votes(skin)
    # A skin-colored item: its "skin" pixels are the garment.
    if skin_votes.total > SKIN_MAX_SHARE * (skin_votes.total + fabric.total):
        return fabric + skin_votes
    return fabric


def name_colors(votes: ColorVotes) -> tuple[str | None, str | None]:
    """
    The item's main color and a clear second color, either of which can be missing:
    - black and navy are one pool, named navy when the dark pixels are on average at least
      NAVY_BLUE_EXCESS bluer than red and green;
    - the top color takes in its related shades and needs COLOR_MIN_SHARE of the votes;
    - the next unrelated color is the second color at SECOND_COLOR_MIN_SHARE; within
      COLOR_TIE_RATIO of the top, the colors are too close to call and both are left out.
    """
    if votes.total < COLOR_MIN_PIXELS:
        return None, None
    counts = votes.counts.astype(np.int64).copy()
    pooled = counts[BLACK] + counts[NAVY]
    navy = votes.dark_count > 0 and votes.blue_excess / votes.dark_count >= NAVY_BLUE_EXCESS
    counts[BLACK], counts[NAVY] = (0, pooled) if navy else (pooled, 0)

    total = float(counts.sum())
    ranked = sorted(range(len(NAMES)), key=lambda i: -counts[i])  # stable: ties keep NAMES order
    top = ranked[0]
    top_share = (counts[top] + sum(counts[i] for i in RELATED[top])) / total
    if top_share < COLOR_MIN_SHARE:
        return None, None
    second = next((i for i in ranked[1:] if i not in RELATED[top] and counts[i] > 0), None)
    if second is None:
        return NAMES[top], None
    second_share = counts[second] / total
    if second_share >= COLOR_TIE_RATIO * top_share:
        return None, None
    return NAMES[top], (NAMES[second] if second_share >= SECOND_COLOR_MIN_SHARE else None)
