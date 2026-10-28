"""Explicit private local/test storage. Never selected as a hosted-provider fallback."""

import hashlib
import os
import re
import stat
from pathlib import Path

from .errors import unavailable

KEY = re.compile(r"^[a-f0-9]{32}\.jpg$")


class PrivateFiles:
    def __init__(self, root: Path) -> None:
        if not root.is_absolute() or not root.is_dir() or root.is_symlink():
            raise ValueError("Media storage requires an existing absolute private directory")
        self.root = root.resolve(strict=True)

    def path(self, key: str) -> Path:
        if not KEY.fullmatch(key):
            raise ValueError("Invalid private media key")
        candidate = self.root / key
        if candidate.is_symlink() or candidate.resolve().parent != self.root:
            raise ValueError("Private media boundary rejected")
        return candidate

    def put(self, key: str, data: bytes) -> None:
        target = self.path(key)
        try:
            descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, "wb") as output:
                output.write(data)
                output.flush()
                os.fsync(output.fileno())
        except OSError as exc:
            raise unavailable(
                "Photo storage is unavailable. Your listing was not changed."
            ) from exc

    def read(self, key: str, expected_size: int, expected_hash: str) -> bytes:
        try:
            descriptor = os.open(self.path(key), os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
            with os.fdopen(descriptor, "rb") as source:
                info = os.fstat(source.fileno())
                if (
                    not stat.S_ISREG(info.st_mode)
                    or info.st_size != expected_size
                    or info.st_nlink != 1
                ):
                    raise ValueError("Private media integrity rejected")
                data = source.read(expected_size + 1)
            if len(data) != expected_size or hashlib.sha256(data).hexdigest() != expected_hash:
                raise ValueError("Private media integrity rejected")
            return data
        except (OSError, ValueError) as exc:
            raise unavailable(
                "The stored photo is unavailable. Please retry or replace it."
            ) from exc

    def remove(self, key: str) -> None:
        self.path(key).unlink(missing_ok=True)
