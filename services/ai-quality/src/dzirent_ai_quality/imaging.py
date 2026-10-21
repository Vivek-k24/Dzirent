"""Untrusted image intake: byte sniffing, header-only size limits and in-memory decoding."""

import os
import struct
from dataclasses import dataclass
from typing import Literal

# Belt and braces: OpenCV refuses to allocate beyond this even if a header lies.
MAX_PIXELS = 40_000_000
os.environ.setdefault("OPENCV_IO_MAX_IMAGE_PIXELS", str(MAX_PIXELS))

import cv2  # noqa: E402
import numpy as np  # noqa: E402
from numpy.typing import NDArray  # noqa: E402

MAX_BYTES = 10 * 1024 * 1024
MAX_SIDE = 12_000
MIN_SIDE = 200
WORKING_LONG_SIDE = 1280
JPEG_MAGIC = b"\xff\xd8\xff"
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
# JPEG start-of-frame markers that carry image dimensions (excludes DHT C4, JPG C8, DAC CC).
SOF_MARKERS = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}

Format = Literal["jpeg", "png"]
Image = NDArray[np.uint8]


class ImageRejected(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


@dataclass(frozen=True)
class DecodedImage:
    format: Format
    width: int
    height: int
    working: Image  # BGR copy downscaled for bounded, deterministic analysis


def sniff(data: bytes) -> Format:
    # The bytes decide; filenames and client-declared MIME types are never trusted.
    if data.startswith(JPEG_MAGIC):
        return "jpeg"
    if data.startswith(PNG_MAGIC):
        return "png"
    raise ImageRejected(415, "unsupported_media_type", "Upload a JPEG or PNG photo.")


def _png_size(data: bytes) -> tuple[int, int]:
    if len(data) < 24 or data[12:16] != b"IHDR":
        raise ImageRejected(422, "invalid_image", "The PNG header is missing or damaged.")
    width, height = struct.unpack(">II", data[16:24])
    return width, height


def _jpeg_size(data: bytes) -> tuple[int, int]:
    index = 2
    while index + 4 <= len(data):
        if data[index] != 0xFF:
            break
        marker = data[index + 1]
        if marker == 0xFF:  # fill byte
            index += 1
            continue
        if marker in (0x01, *range(0xD0, 0xD9)):  # standalone markers carry no length
            index += 2
            continue
        if marker in (0xD9, 0xDA):  # end of image / start of scan before any frame header
            break
        (length,) = struct.unpack(">H", data[index + 2 : index + 4])
        if length < 2:
            break
        if marker in SOF_MARKERS:
            if index + 9 > len(data):
                break
            height, width = struct.unpack(">HH", data[index + 5 : index + 9])
            return width, height
        index += 2 + length
    raise ImageRejected(422, "invalid_image", "The JPEG header is missing or damaged.")


def header_size(data: bytes, image_format: Format) -> tuple[int, int]:
    return _png_size(data) if image_format == "png" else _jpeg_size(data)


def check_limits(width: int, height: int) -> None:
    if width <= 0 or height <= 0:
        raise ImageRejected(422, "invalid_image", "The image reports invalid dimensions.")
    if width > MAX_SIDE or height > MAX_SIDE or width * height > MAX_PIXELS:
        raise ImageRejected(
            413, "payload_too_large", "The photo's pixel dimensions are too large to analyze."
        )
    if min(width, height) < MIN_SIDE:
        raise ImageRejected(
            422,
            "invalid_image",
            f"The photo is too small; use at least {MIN_SIDE} px on each side.",
        )


def decode(data: bytes) -> DecodedImage:
    if len(data) > MAX_BYTES:
        raise ImageRejected(413, "payload_too_large", "The photo must be 10 MiB or smaller.")
    image_format = sniff(data)
    check_limits(*header_size(data, image_format))
    # In-memory decode only. Metadata (EXIF, GPS) is discarded and never logged; orientation is applied.
    image = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None or image.ndim != 3:
        raise ImageRejected(422, "invalid_image", "The photo could not be decoded.")
    height, width = image.shape[:2]
    check_limits(width, height)
    scale = WORKING_LONG_SIDE / max(width, height)
    working = (
        image
        if scale >= 1
        else cv2.resize(
            image, (round(width * scale), round(height * scale)), interpolation=cv2.INTER_AREA
        )
    )
    return DecodedImage(
        format=image_format, width=width, height=height, working=np.ascontiguousarray(working)
    )
