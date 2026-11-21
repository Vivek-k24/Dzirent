"""Shared setup for the data/vision tests: the scripts' folders on sys.path, and no network.

Every test runs on recorded responses (tests/fixtures/); a connection to anything but this PC
fails the test, so a live Commons or Wikidata call can't slip in.
"""

import socket
import sys
from pathlib import Path

import pytest

VISION_DIR = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(VISION_DIR / "images"), str(VISION_DIR / "taxonomy")]

LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1"}


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    real_connect = socket.socket.connect

    def guarded(self, address):
        host = address[0] if isinstance(address, tuple) else address
        if host not in LOCAL_HOSTS:
            raise RuntimeError(f"tests must not use the network (tried to connect to {address})")
        return real_connect(self, address)

    monkeypatch.setattr(socket.socket, "connect", guarded)
