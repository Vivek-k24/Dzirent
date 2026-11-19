"""split.py (D4): deterministic, 80/20 per type by sha1, at least 2 test photos from 5 kept,
thin types all train, kept photos only."""
import hashlib
import random

import split


def sha(i: int, salt: str = "") -> str:
    return hashlib.sha1(f"{salt}{i}".encode()).hexdigest()


def manifest(counts: dict[str, int]) -> list[dict]:
    return [{"sha1": sha(i, q), "qid": q, "english_name": f"type {q}"} for q, n in counts.items() for i in range(n)]


def test_80_20_and_the_minimum():
    out = split.build(manifest({"Q1": 80, "Q2": 12, "Q3": 13, "Q4": 5, "Q5": 4, "Q6": 1}), [])
    sizes = {q: (len(t["train"]), len(t["test"])) for q, t in out["types"].items()}
    assert sizes == {"Q1": (64, 16), "Q2": (10, 2), "Q3": (10, 3), "Q4": (3, 2), "Q5": (4, 0), "Q6": (1, 0)}
    assert [t["qid"] for t in out["thin"]] == ["Q5", "Q6"]
    assert out["counts"] == {"types": 6, "train": 92, "test": 23, "thin_types": 2, "types_without_kept_photos": 0}


def test_test_photos_are_the_lowest_sha1s_and_sides_dont_overlap():
    out = split.build(manifest({"Q7": 40}), [])
    t = out["types"]["Q7"]
    assert t["test"] == sorted(sha(i, "Q7") for i in range(40))[:8]
    assert not set(t["test"]) & set(t["train"])


def test_deterministic_whatever_the_order():
    m = manifest({"Q1": 30, "Q2": 9})
    shuffled = m[:]
    random.Random(3).shuffle(shuffled)
    assert split.build(m, []) == split.build(shuffled, [])


def test_kept_photos_only():
    m = manifest({"Q1": 10})
    s = [r["sha1"] for r in m]
    labels = [{"sha1": s[0], "qid": "Q1", "decision": "drop", "decided_at": "t", "source": "owner"},
              {"sha1": s[1], "qid": "Q1", "decision": "not_sure", "decided_at": "t", "source": "owner"},
              {"sha1": s[2], "qid": "Q1", "decision": "drop", "decided_at": "", "source": "auto"},
              {"sha1": s[3], "qid": "Q1", "decision": "keep", "decided_at": "t", "source": "owner"},
              {"sha1": s[3], "qid": "Q1", "decision": "drop", "decided_at": "", "source": "auto"}]
    t = split.build(m, labels)["types"]["Q1"]
    assert sorted(t["train"] + t["test"]) == sorted(s[3:])  # owner keep beats the auto drop
    assert len(t["test"]) == 2


def test_moved_counts_photos_that_changed_sides():
    old = split.build(manifest({"Q1": 10}), [])
    new = split.build(manifest({"Q1": 10}) + [{"sha1": "0" * 40, "qid": "Q1", "english_name": "type Q1"}], [])
    change = split.moved(old, new)
    assert change["new"] == 1 and change["left"] == 0
    assert change["test_to_train"] == 1 and change["train_to_test"] == 0  # "000..." takes a test place
