"""Synthetic pixels only. No external images, SMTP, Azure or machine-vision assertions."""

import os
import struct
import zlib
from io import BytesIO
from pathlib import Path
from uuid import uuid4

import pytest
from PIL import Image

from dzirent_api.errors import ApiError
from dzirent_api.media_imaging import normalize
from dzirent_api.media_policy import MAX_BYTES, raw_upload
from dzirent_api.media_storage import PrivateFiles
from dzirent_api.settings import Settings


def pixels(fmt: str = "JPEG", size: tuple[int, int] = (300, 400)) -> bytes:
    output = BytesIO()
    Image.new("RGB", size, "navy").save(output, fmt)
    return output.getvalue()


@pytest.mark.parametrize(
    "mime,fmt", [("image/jpeg", "JPEG"), ("image/png", "PNG"), ("image/webp", "WEBP")]
)
def test_decodes_still_photos_without_wearer_or_quality_heuristics(mime: str, fmt: str) -> None:
    photo = normalize(pixels(fmt), mime)
    assert (photo.width, photo.height) == (300, 400)
    with Image.open(BytesIO(photo.data)) as image:
        assert image.format == "JPEG"
        assert image.getexif() == {}
        image.load()


def test_orientation_is_applied_but_private_metadata_and_trailing_bytes_are_removed() -> None:
    exif = Image.Exif()
    exif[274], exif[315] = 6, "private-location-test"
    output = BytesIO()
    Image.new("RGB", (300, 400), "blue").save(output, "JPEG", exif=exif)
    photo = normalize(output.getvalue() + b"private-trailing-test", "image/jpeg")
    assert (photo.width, photo.height) == (400, 300)
    assert b"private-location-test" not in photo.data and b"private-trailing-test" not in photo.data
    with Image.open(BytesIO(photo.data)) as image:
        assert len(image.getexif()) == 0
        assert not image.info.get("icc_profile")


@pytest.mark.parametrize(
    "data,mime,status",
    [
        pytest.param(b"<svg></svg>", "image/jpeg", 422, id="svg_as_jpeg"),
        pytest.param(pixels("PNG"), "image/jpeg", 422, id="png_as_jpeg"),
        pytest.param(pixels()[:70], "image/jpeg", 422, id="truncated"),
        pytest.param(pixels(size=(199, 400)), "image/jpeg", 422, id="too_narrow"),
        pytest.param(b"x" * (MAX_BYTES + 1), "image/jpeg", 413, id="oversize"),
        pytest.param(pixels(), "image/svg+xml", 415, id="unsupported_mime"),
    ],
)
def test_rejects_format_mismatch_corruption_small_and_oversize(
    data: bytes, mime: str, status: int
) -> None:
    with pytest.raises(ApiError) as error:
        normalize(data, mime)
    assert error.value.status == status


def test_rejects_animation() -> None:
    output = BytesIO()
    first = Image.new("RGB", (300, 400), "blue")
    first.save(
        output,
        "PNG",
        save_all=True,
        append_images=[Image.new("RGB", (300, 400), "red")],
        duration=50,
    )
    with pytest.raises(ApiError, match="single still"):
        normalize(output.getvalue(), "image/png")


def test_rejects_pixel_bomb_from_header_before_allocating_pixels() -> None:
    def chunk(kind: bytes, value: bytes) -> bytes:
        return (
            struct.pack(">I", len(value))
            + kind
            + value
            + struct.pack(">I", zlib.crc32(kind + value))
        )

    header = struct.pack(">IIBBBBB", 6000, 5000, 8, 2, 0, 0, 0)
    data = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(b"\x00" * 30))
        + chunk(b"IEND", b"")
    )
    with pytest.raises(ApiError, match="24 megapixels"):
        normalize(data, "image/png")


@pytest.mark.parametrize(
    "key", ["../outside.jpg", "/outside.jpg", "A" * 32 + ".jpg", "a" * 32 + ".svg", "a/b.jpg"]
)
def test_private_keys_never_accept_a_caller_path(tmp_path: Path, key: str) -> None:
    with pytest.raises(ValueError):
        PrivateFiles(tmp_path).path(key)


def test_immutable_private_storage_detects_corruption_and_hardlinks(tmp_path: Path) -> None:
    from hashlib import sha256

    backend, key, data = PrivateFiles(tmp_path), uuid4().hex + ".jpg", pixels()
    backend.put(key, data)
    assert backend.read(key, len(data), sha256(data).hexdigest()) == data
    with pytest.raises(ApiError):
        backend.put(key, data)
    os.link(tmp_path / key, tmp_path / "second-link")
    with pytest.raises(ApiError):
        backend.read(key, len(data), sha256(data).hexdigest())
    (tmp_path / "second-link").unlink()
    (tmp_path / key).write_bytes(b"corrupt")
    with pytest.raises(ApiError):
        backend.read(key, len(data), sha256(data).hexdigest())


def test_storage_never_falls_back_in_deployed_environment(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="local/test only"):
        Settings(
            _env_file=None,
            environment="staging",
            media_backend="filesystem",
            media_root=str(tmp_path),
        )
    assert Settings(_env_file=None).media_backend == "disabled"


def test_raw_route_exception_is_exact_and_put_only() -> None:
    path = f"/api/v1/lender/products/{uuid4()}/images/uploads/{uuid4()}"
    assert raw_upload(path, "PUT")
    assert not raw_upload(path, "POST")
    assert not raw_upload(path + "/extra", "PUT")
    assert not raw_upload("/api/v1/auth/login", "PUT")
    assert not raw_upload("/api/v1/lender/products/not-a-uuid/images/uploads/x", "PUT")
