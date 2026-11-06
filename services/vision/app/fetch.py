"""Getting a photo's bytes and opening them safely."""

import base64
import binascii
import io
import re

import httpx
from PIL import Image, ImageOps

from . import config

_DATA_HEADER = re.compile(r"data:image/(jpeg|jpg|png|webp);base64")
# A public listing photo is <listing uuid>/<random name>.<ext>: nothing else is fetched.
_SAFE_TAIL = re.compile(r"[A-Za-z0-9/_.-]+")


class PhotoError(Exception):
    """A photo that couldn't be used; [code] is a short machine reason, never shown to lenders."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def _allowed_url(url: str) -> bool:
    for prefix in config.ALLOWED_URL_PREFIXES:
        if url.startswith(prefix):
            tail = url[len(prefix):]
            return bool(tail) and ".." not in tail and _SAFE_TAIL.fullmatch(tail) is not None
    return False


async def fetch_photo(client: httpx.AsyncClient, url: str) -> bytes:
    """A data:image URL (decoded here) or an https URL under an allowed prefix (downloaded)."""
    if url.startswith("data:"):
        header, _, payload = url.partition(",")
        if not _DATA_HEADER.fullmatch(header):
            raise PhotoError("bad_data_url")
        if len(payload) > config.MAX_PHOTO_BYTES * 4 // 3 + 4:
            raise PhotoError("too_large")
        try:
            return base64.b64decode(payload, validate=True)
        except (binascii.Error, ValueError):
            raise PhotoError("bad_data_url") from None
    if not _allowed_url(url):
        raise PhotoError("url_not_allowed")
    try:
        async with client.stream("GET", url) as response:
            if response.status_code != 200:
                raise PhotoError(f"http_{response.status_code}")
            chunks, size = [], 0
            async for chunk in response.aiter_bytes():
                size += len(chunk)
                if size > config.MAX_PHOTO_BYTES:
                    raise PhotoError("too_large")
                chunks.append(chunk)
            return b"".join(chunks)
    except httpx.TimeoutException:
        raise PhotoError("timeout") from None
    except httpx.HTTPError:
        raise PhotoError("fetch_failed") from None


def open_image(data: bytes) -> Image.Image:
    """Decoded RGB, turned upright from the camera's EXIF orientation."""
    try:
        image = Image.open(io.BytesIO(data))
        if image.format not in ("JPEG", "PNG", "WEBP", "MPO"):
            raise PhotoError("unsupported_format")
        if image.width * image.height > config.MAX_PIXELS:
            raise PhotoError("too_many_pixels")
        image = ImageOps.exif_transpose(image)
        return image.convert("RGB")
    except PhotoError:
        raise
    except Exception:  # Pillow raises many types for broken files
        raise PhotoError("not_an_image") from None
