"""C2: shared pytest setup for the vision service tests.

Tests that need the real model weights are marked ``@pytest.mark.model``. They also skip on their own
when VISION_SAFETY_DIR isn't set; CI deselects them outright with ``-m "not model"``.
"""


def pytest_configure(config):
    config.addinivalue_line("markers", "model: needs the real model weights (skipped in CI)")
