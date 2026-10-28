"""Bounded photo decoding only: no visual quality, measurement or ownership inference."""

from dataclasses import dataclass
from io import BytesIO
from threading import BoundedSemaphore

from PIL import Image, ImageOps, UnidentifiedImageError

from .errors import ApiError, unavailable
from .media_policy import MAX_BYTES

MAX_PIXELS = 24_000_000
MAX_SIDE = 12_000
MIN_SIDE = 200
FORMATS = {"image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP"}
DECODERS = BoundedSemaphore(2)


@dataclass(frozen=True)
class Photo:
    data: bytes
    width: int
    height: int


def reject(message: str) -> ApiError:
    return ApiError(422, "invalid_photo", message)


def dimensions(width: int, height: int) -> None:
    if min(width, height) < MIN_SIDE:
        raise reject("Use a sharp photo at least 200 pixels on each side.")
    if max(width, height) > MAX_SIDE or width * height > MAX_PIXELS:
        raise reject("Export a smaller photo, at most 24 megapixels and 12000 pixels per side.")


def normalize(data: bytes, content_type: str) -> Photo:
    if not data or len(data) > MAX_BYTES:
        raise ApiError(413, "payload_too_large", "Choose a photo no larger than 4 MB.")
    if content_type not in FORMATS:
        raise ApiError(415, "unsupported_media_type", "Export the photo as JPEG, PNG or WebP.")
    if not DECODERS.acquire(blocking=False):
        raise unavailable("Photo processing is busy. Please retry this photo shortly.")
    try:
        # Explicit formats prevent dispatch to EPS/Ghostscript or other non-photo plugins.
        with Image.open(BytesIO(data), formats=list(FORMATS.values())) as source:
            if source.format != FORMATS[content_type]:
                raise reject("The file contents do not match its type. Export a fresh photo.")
            dimensions(*source.size)
            if getattr(source, "n_frames", 1) != 1:
                raise reject("Choose a single still photo, not an animation.")
            source.verify()
        with Image.open(BytesIO(data), formats=list(FORMATS.values())) as source:
            source.load()  # Reject truncated/corrupt streams, not just plausible headers.
            oriented = ImageOps.exif_transpose(source)
            dimensions(*oriented.size)
            # A new pixel buffer carries no EXIF/GPS, comments, ICC or trailing/polyglot bytes.
            rgba = oriented.convert("RGBA")
            clean = Image.new("RGB", rgba.size, "white")
            clean.paste(rgba, mask=rgba.getchannel("A"))
            output = BytesIO()
            clean.save(output, format="JPEG", quality=90)
            result = output.getvalue()
            if len(result) > MAX_BYTES:
                raise reject("Export a smaller photo; its processed copy exceeds 4 MB.")
            return Photo(result, clean.width, clean.height)
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
        raise reject(
            "The photo could not be read safely. Retake it or export a fresh JPEG."
        ) from exc
    finally:
        DECODERS.release()
