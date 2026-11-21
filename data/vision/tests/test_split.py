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
    assert out["counts"] == {"types": 6, "train": 92, "test": 23, "thin_types": 2, "types_without_kept_photos": 0,
                             "owner_train": 0, "oversampled_types": 5}


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


# --- D2e: sticky sides, the owner's photos train only, oversampling --------------------------------
def test_a_committed_photo_keeps_its_side_when_new_photos_arrive():
    first = split.build(manifest({"Q1": 10}), [])
    old_test, old_train = set(first["types"]["Q1"]["test"]), set(first["types"]["Q1"]["train"])
    grown = manifest({"Q1": 10}) + [{"sha1": "0" * 39 + str(i), "qid": "Q1", "english_name": "type Q1"} for i in range(10)]
    out = split.build(grown, [], first)  # the new photos have the lowest sha1s of all
    t = out["types"]["Q1"]
    assert old_test <= set(t["test"]) and old_train <= set(t["train"])
    assert len(t["test"]) == 4  # round(20 % of 20): the 2 old ones plus the 2 lowest new ones
    assert set(t["test"]) - old_test == {"0" * 39 + "0", "0" * 39 + "1"}
    assert split.moved(first, out) == {"train_to_test": 0, "test_to_train": 0, "left": 0, "new": 10}
    # without the committed split the D4 rule would have moved the old test photos into train
    assert split.moved(first, split.build(grown, []))["test_to_train"] == 2


def test_a_thin_type_that_grows_takes_its_test_photos_from_the_new_ones_only():
    first = split.build(manifest({"Q2": 4}), [])
    assert first["types"]["Q2"]["test"] == [] and [t["qid"] for t in first["thin"]] == ["Q2"]
    out = split.build(manifest({"Q2": 12}), [], first)
    t = out["types"]["Q2"]
    assert set(first["types"]["Q2"]["train"]) <= set(t["train"]) and len(t["test"]) == 2
    assert not set(t["test"]) & set(first["types"]["Q2"]["train"])


def test_a_type_over_its_share_after_drops_keeps_its_test_photos():
    first = split.build(manifest({"Q3": 20}), [])
    dropped = [{"sha1": s, "qid": "Q3", "decision": "drop", "source": "owner"} for s in first["types"]["Q3"]["train"][:12]]
    out = split.build(manifest({"Q3": 20}), dropped, first)
    assert out["types"]["Q3"]["test"] == first["types"]["Q3"]["test"]  # 4 of 8 kept: over 20 %, none moved


def test_the_owners_own_photos_are_always_train():
    rows = manifest({"Q4": 20})
    own = [{"sha1": "0" * 39 + str(i), "qid": "Q4", "english_name": "type Q4", "source": "owner"} for i in range(5)]
    out = split.build(rows + own, [])
    t = out["types"]["Q4"]
    assert {o["sha1"] for o in own} <= set(t["train"]) and not {o["sha1"] for o in own} & set(t["test"])
    assert len(t["test"]) == 5 and t["owner_train"] == 5 and out["counts"]["owner_train"] == 5
    # an owner photo is train even if a committed split had it as test
    prior = {"types": {"Q4": {"train": [], "test": [own[0]["sha1"]]}}}
    assert own[0]["sha1"] in split.build(rows + own, [], prior)["types"]["Q4"]["train"]


def test_oversampling_factors():
    assert [split.oversample(n) for n in (1, 3, 4, 10, 19, 20, 64)] == [20, 7, 5, 2, 2, 1, 1]
    out = split.build(manifest({"Q5": 3, "Q6": 30}), [])
    assert out["types"]["Q5"]["oversample"] == 7 and out["types"]["Q6"]["oversample"] == 1
    assert len(out["types"]["Q5"]["train"]) * out["types"]["Q5"]["oversample"] >= 20
    assert out["counts"]["oversampled_types"] == 1
