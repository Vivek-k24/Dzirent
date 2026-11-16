"""The apps' color values and the color math the photo check shares (colors.py)."""

import numpy as np

from app.colors import NAMES, RELATED, linear_to_lab, looks_like_skin, rgb_to_lab, srgb_to_linear


def test_the_apps_fifteen_values_in_their_order():
    # The values the apps and website use: a suggestion can only ever be one of these.
    assert NAMES == ("Black", "White", "Grey", "Navy", "Blue", "Green", "Emerald", "Red", "Maroon", "Pink",
                     "Purple", "Orange", "Yellow", "Beige", "Brown")


def test_related_shades_go_both_ways():
    for i, related in RELATED.items():
        assert i not in related
        assert all(i in RELATED[j] for j in related)


def test_lab_of_white_black_and_pure_red():
    assert np.allclose(rgb_to_lab(np.array([255, 255, 255], dtype=np.uint8)), [100, 0, 0], atol=0.01)
    assert np.allclose(rgb_to_lab(np.array([0, 0, 0], dtype=np.uint8)), [0, 0, 0], atol=1e-9)
    assert np.allclose(rgb_to_lab(np.array([255, 0, 0], dtype=np.uint8)), [53.24, 80.09, 67.20], atol=0.05)


def test_the_srgb_and_linear_paths_agree_exactly():
    rgb = np.random.default_rng(0).integers(0, 256, (200, 3)).astype(np.uint8)
    assert np.array_equal(rgb_to_lab(rgb), linear_to_lab(srgb_to_linear(rgb)))


def test_skin_tones():
    assert looks_like_skin(np.array([[224, 172, 150]], dtype=np.uint8))[0]
    assert not looks_like_skin(np.array([[0, 0, 128], [34, 139, 34]], dtype=np.uint8)).any()
