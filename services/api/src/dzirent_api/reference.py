"""Replaceable sample configuration shared with fixtures. Not pricing or coverage policy."""

from typing import Final
from uuid import UUID, uuid5

from .models import Band

# Brief section 6.5 presentation bands in USD minor units: half-open [min, max).
BANDS: Final[dict[Band, tuple[int, int | None]]] = {
    "A": (0, 5000),
    "B": (5000, 10000),
    "C": (10000, 15000),
    "D": (15000, None),
}
BAND_LABELS: Final[dict[Band, str]] = {band: f"Band {band} · sample" for band in BANDS}
UNMAPPED_METRO_SLUG: Final = "other-texas"
RENTAL_DAYS: Final = 4
MAX_MINOR_UNITS: Final = 100_000_000
FIXTURE_NAMESPACE: Final = UUID("6b20db36-0e5a-4d6a-a484-9dfd13f269f9")
PLACEHOLDER_URL: Final = "/fixtures/garment-placeholder.svg"
FIXTURE_URL_PREFIX: Final = "/fixtures/"


def band_contains(band: Band, amount_minor: int) -> bool:
    low, high = BANDS[band]
    return amount_minor >= low and (high is None or amount_minor < high)


def placeholder_image_id(product_id: UUID) -> UUID:
    return uuid5(FIXTURE_NAMESPACE, f"dzirent:v1:placeholder:{product_id}")
