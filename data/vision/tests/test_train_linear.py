"""V2: train_linear.py's pure parts (no model, no torch, no network): which photos and augmented copies
the linear head learns from, their weights, the folds and the training set's sha256."""
import hashlib
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "embed"))
import train_linear  # noqa: E402


def sha(i: int) -> str:
    return hashlib.sha1(str(i).encode()).hexdigest()


SPLIT = {"types": {
    "Q1": {"train": [sha(1), sha(2), sha(3)], "test": [sha(4)], "oversample": 7},       # 4 kept: thin
    "Q2": {"train": [sha(10 + i) for i in range(17)], "test": [sha(40 + i) for i in range(5)], "oversample": 2},  # 22 kept
    "Q3": {"train": [sha(60)], "test": [], "oversample": 20},                            # 1 kept: capped at 8
    "Q4": {"train": [sha(70 + i) for i in range(20)], "test": [sha(95)], "oversample": 1},
    "Q9": {"train": [sha(99)], "test": [], "oversample": 20},                            # no text pin
}}
PINS = ["Q4", "Q3", "Q2", "Q1"]


def test_thin_types_get_augmented_copies_up_to_the_cap():
    plan = train_linear.augment_plan(SPLIT, PINS)
    by = {}
    for s, q, c in plan:
        by.setdefault(q, []).append(c)
    assert sorted(by) == ["Q1", "Q3"]  # under 20 kept, with a text pin
    assert sorted(by["Q1"]) == sorted([1, 2, 3, 4, 5, 6] * 3)  # 7 samples a photo: itself and 6 copies
    assert sorted(by["Q3"]) == [1, 2, 3, 4, 5, 6, 7]  # oversample 20 capped at 8
    assert not {s for s, _, _ in plan} & {sha(4)}


def test_samples_weights_and_no_test_photo():
    samples = train_linear.training_samples(SPLIT, PINS)
    keys = {k: (s, q, w) for k, s, q, w in samples}
    assert keys[sha(1)] == (sha(1), "Q1", 1.0) and f"{sha(1)}#6" in keys and f"{sha(1)}#7" not in keys
    assert keys[sha(10)] == (sha(10), "Q2", 2.0) and f"{sha(10)}#1" not in keys  # not thin: a weight, no copies
    assert keys[sha(70)][2:] == (1.0,) and sha(99) not in keys
    assert not any(s in {sha(4), sha(95)} | {sha(40 + i) for i in range(5)} for _, s, _, _ in samples)
    assert train_linear.classes_of(samples, PINS) == ["Q4", "Q3", "Q2", "Q1"]


def test_a_photo_that_is_test_anywhere_is_refused():
    split = {"types": {"Q1": {"train": [sha(1)], "test": [], "oversample": 1},
                       "Q2": {"train": [], "test": [sha(1)], "oversample": 1}}}
    with pytest.raises(AssertionError, match="test photo"):
        train_linear.training_samples(split, ["Q1", "Q2"])
    split["types"]["Q1"]["oversample"] = 5
    with pytest.raises(ValueError, match="test photo"):
        train_linear.augment_plan(split, ["Q1", "Q2"])


def test_training_set_sha256_follows_the_samples():
    samples = train_linear.training_samples(SPLIT, PINS)
    a = train_linear.training_set_sha256(samples, "s", "m", "v")
    assert a == train_linear.training_set_sha256(list(reversed(samples)), "s", "m", "v")
    assert a != train_linear.training_set_sha256(samples[1:], "s", "m", "v")
    assert a != train_linear.training_set_sha256(samples, "s2", "m", "v")


def test_same_pictures_share_a_group_and_folds_are_stable():
    e = np.eye(4, dtype=np.float32)
    e = np.vstack([e, e[0] + 0.001])  # photo 4 is photo 0 again
    groups = train_linear.picture_groups([sha(i) for i in range(5)], e)
    assert groups[sha(4)] == groups[sha(0)] == min(sha(0), sha(4))
    assert len({groups[sha(i)] for i in range(5)}) == 4
    assert all(0 <= train_linear.fold_of(g) < train_linear.FOLDS for g in groups.values())
    assert train_linear.fold_of(sha(1)) == train_linear.fold_of(sha(1))
