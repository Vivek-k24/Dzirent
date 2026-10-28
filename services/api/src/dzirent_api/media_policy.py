"""Shared server intake boundary; no routing exception for other domain writes."""

import re

MAX_BYTES = 4_000_000
PHOTO_TYPES = frozenset({"image/jpeg", "image/png", "image/webp"})
UUID_PATH = r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
UPLOAD_PATH = re.compile(rf"^/api/v1/lender/products/{UUID_PATH}/images/uploads/{UUID_PATH}$")


def raw_upload(path: str, method: str) -> bool:
    return method == "PUT" and UPLOAD_PATH.fullmatch(path) is not None
