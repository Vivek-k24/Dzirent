"""V1b: build_pins.py's pure parts (no model, no network): the pin prompts, the model-agreement
check and the gallery rows; and auto_filter.py turning model_disagrees into an auto drop the owner
can overrule."""
import hashlib
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "embed"))
import auto_filter  # noqa: E402
import build_pins  # noqa: E402

DIM = 8


def sha(i: int, salt: str = "") -> str:
    return hashlib.sha1(f"{salt}{i}".encode()).hexdigest()


def axis(i: int) -> np.ndarray:
    v = np.zeros(DIM, np.float32)
    v[i] = 1.0
    return v


def test_pin_prompts_are_the_name_then_at_most_five_also_called_names():
    entry = {"english_name": "blazer", "vocabulary": ["Blazer", "blazer", "Bleiser", "sport coat", "a", "b", "c", "d"]}
    assert build_pins.pin_prompts(entry) == [
        "a photo of a blazer", "a photo of a Bleiser", "a photo of a sport coat", "a photo of a a", "a photo of a b",
        "a photo of a c"]
    assert build_pins.pin_prompts({"english_name": "kurta", "vocabulary": ["kurta"]}) == ["a photo of a kurta"]


def test_vocabulary_version_is_the_files_sha256(tmp_path):
    f = tmp_path / "vocabulary.json"
    f.write_bytes(b'{"entries": []}\n')
    assert build_pins.vocabulary_version(f) == hashlib.sha256(b'{"entries": []}\n').hexdigest()


PIN_QIDS = ["Q1", "Q2", "Q3", "Q4", "Q5"]
PINS = np.stack([axis(i) for i in range(5)])


def photo(i, qid, source, emb_axis):
    return {"sha1": sha(i, qid), "qid": qid, "source": source}, axis(emb_axis) + 0.01 * axis(7)


def test_agreement_checks_only_undecided_kept_openverse_and_search_photos():
    rows = [
        photo(1, "Q1", "openverse", 0),   # its own pin is top 1: agrees
        photo(2, "Q1", "search", 4),      # top pin is Q5: rank of Q1 is beyond 3 when Q1 isn't close
        photo(3, "Q1", "category", 4),    # a Commons category photo: never checked
        photo(4, "Q1", "openverse", 4),   # the owner kept it: never checked
        photo(5, "Q1", "openverse", 4),   # the auto filter already dropped it: not kept
        photo(6, "Q9", "search", 0),      # its type has no text pin
    ]
    manifest = [m for m, _ in rows]
    emb = {m["sha1"]: e for m, e in rows}
    labels = [{"sha1": sha(4, "Q1"), "qid": "Q1", "decision": "keep", "decided_at": "t", "source": "owner"},
              {"sha1": sha(5, "Q1"), "qid": "Q1", "decision": "drop", "decided_at": "", "source": "auto"}]
    # Q1's pin is far from axis 4: give the photo a top 3 without Q1.
    pins = PINS.copy()
    pins[1] = axis(4) * 0.9 + axis(5) * 0.1
    pins[2] = axis(4) * 0.8 + axis(6) * 0.2
    out, skipped = build_pins.agreement_rows(manifest, labels, emb, PIN_QIDS, pins, "v1")
    by = {r["sha1"]: r for r in out}
    assert set(by) == {sha(1, "Q1"), sha(2, "Q1"), sha(6, "Q9")}
    assert by[sha(1, "Q1")]["model_disagrees"] == "no" and by[sha(1, "Q1")]["own_rank"] == 1
    assert by[sha(2, "Q1")]["model_disagrees"] == "yes" and by[sha(2, "Q1")]["own_rank"] > 3
    assert by[sha(2, "Q1")]["top3"].split(";")[0] == "Q5"
    assert by[sha(6, "Q9")]["model_disagrees"] == "" and by[sha(6, "Q9")]["own_rank"] == ""
    assert skipped == {"owner_decided": 1, "type_without_pin": 1}
    assert all(r["vocabulary_version"] == "v1" for r in out)


def test_rank_three_still_agrees_and_four_doesnt():
    pins = np.stack([axis(0) * w + axis(1) * (1 - w) for w in (0.9, 0.8, 0.7, 0.6, 0.5)])
    for own, expected in ((2, "no"), (3, "yes")):
        m = {"sha1": sha(own), "qid": PIN_QIDS[own], "source": "openverse"}
        out, _ = build_pins.agreement_rows([m], [], {m["sha1"]: axis(0)}, PIN_QIDS, pins, "v1")
        assert out[0]["own_rank"] == own + 1 and out[0]["model_disagrees"] == expected


def test_gallery_rows_are_train_photos_of_pinned_types_and_never_test():
    split = {"types": {"Q1": {"train": [sha(1), sha(2)], "test": [sha(3)]},
                       "Q2": {"train": [sha(4)], "test": []},
                       "Q9": {"train": [sha(5)], "test": [sha(6)]}}}
    rows, left_out = build_pins.gallery_rows(split, ["Q1", "Q2"], [True, False])
    assert rows == [(min(sha(1), sha(2)), "Q1", True), (max(sha(1), sha(2)), "Q1", True), (sha(4), "Q2", False)]
    assert not {s for s, _, _ in rows} & build_pins.locked_test_sha1s(split)
    assert left_out == {"train photos of types without a text pin": 1}


def test_gallery_refuses_a_photo_that_is_test_anywhere():
    split = {"types": {"Q1": {"train": [sha(1)], "test": []}, "Q2": {"train": [], "test": [sha(1)]}}}
    with pytest.raises(ValueError, match="test photo"):
        build_pins.gallery_rows(split, ["Q1", "Q2"], [True, True])


def test_model_disagrees_becomes_an_auto_drop_and_the_owner_still_wins(tmp_path):
    agreement = tmp_path / "model_agreement.csv"
    build_pins.write_csv([{"sha1": sha(1), "qid": "Q1", "source": "openverse", "own_rank": 9, "top3": "Q2;Q3;Q4",
                           "model_disagrees": "yes", "vocabulary_version": "v1"},
                          {"sha1": sha(2), "qid": "Q1", "source": "search", "own_rank": 1, "top3": "Q1;Q2;Q3",
                           "model_disagrees": "no", "vocabulary_version": "v1"}],
                         build_pins.AGREEMENT_COLUMNS, agreement)
    disagrees = auto_filter.read_disagrees(agreement)
    assert disagrees == {sha(1)}
    manifest = [{"sha1": sha(i), "qid": "Q1"} for i in (1, 2, 3)]
    measures = {"saturation": 0.4, "white_frac": 0.1, "black_frac": 0.1, "hue_r": 0.2, "hue_deg": 200.0,
                "tint_cover": 0.5, "sides": [0.0] * 4, "border_s": 0.0, "width": 900, "height": 1200}
    stats = {sha(i): dict(measures) for i in (1, 2, 3)}
    autos = auto_filter.auto_rows(manifest, stats, disagrees)
    assert [(a["auto_drop"], a["reason"]) for a in autos] == [("yes", "model_disagrees"), ("no", ""), ("no", "")]
    merged = auto_filter.merge([], autos, manifest)
    assert [(r["sha1"], r["decision"], r["source"]) for r in merged] == [(sha(1), "drop", "auto")]
    owner_keep = [{"sha1": sha(1), "qid": "Q1", "decision": "keep", "decided_at": "t", "source": "owner"}]
    merged = auto_filter.merge(owner_keep, autos, manifest)
    assert merged == [{"sha1": sha(1), "qid": "Q1", "decision": "keep", "decided_at": "t", "source": "owner"}]
    assert auto_filter.read_disagrees(tmp_path / "missing.csv") == set()
