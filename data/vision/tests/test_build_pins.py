"""V1b, V2: build_pins.py's pure parts (no model, no network): the pin prompts, the vocabulary version,
the model-agreement check (V2: the same mapping in the top 5) and the gallery rows; and auto_filter.py
turning model_disagrees into an auto drop the owner can overrule."""
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


def test_pin_prompts_are_the_name_then_its_english_aliases_the_vocabulary_has():
    entry = {"qid": "Q1", "english_name": "blazer",
             "vocabulary": ["Blazer", "blazer", "Bleiser", "sport coat", "tailored blazer", "a", "b", "c", "d"]}
    english = {"Q1": ["Blazer", "sport coat", "SPORT COAT", "not in the vocabulary", "tailored blazer", "a", "b", "c", "d"]}
    assert build_pins.pin_prompts(entry, english) == [
        "a photo of a blazer", "a photo of a sport coat", "a photo of a tailored blazer", "a photo of a a",
        "a photo of a b", "a photo of a c"]  # no Bleiser (not English), no repeats, at most 5 aliases
    assert build_pins.pin_prompts({"qid": "Q2", "english_name": "kurta", "vocabulary": ["kurta", "kurti"]}, english) == [
        "a photo of a kurta"]


def test_vocabulary_version_changes_with_the_prompts(tmp_path):
    f = tmp_path / "vocabulary.json"
    f.write_text('{"entries": [{"qid": "Q1", "english_name": "blazer", "vocabulary": ["blazer", "sport coat"]}]}',
                 encoding="utf-8")
    plain = build_pins.vocabulary_version(f, english={})
    assert plain == build_pins.vocabulary_version(f, english={}) and len(plain) == 64
    assert build_pins.vocabulary_version(f, english={"Q1": ["sport coat"]}) != plain
    assert plain != hashlib.sha256(f.read_bytes()).hexdigest()  # V1b's version was the file's sha256 alone


PIN_QIDS = ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7"]
PIN_KEYS = [("Cultural & Traditional", "suit"), ("Cultural & Traditional", "suit"), ("Everyday", "dress"),
            ("Everyday", "dress"), ("Everyday", "top"), ("", ""), ("", "")]


def ranked_pins(order: list[int]) -> np.ndarray:
    """Pins whose cosine to axis(0) falls in [order]'s order (first is closest)."""
    pins = np.zeros((len(PIN_QIDS), DIM), np.float32)
    for rank, i in enumerate(order):
        w = 1.0 - 0.1 * rank
        pins[i] = axis(0) * w + axis(1) * np.sqrt(1 - w * w)
    return pins


def photo(i, qid, source="openverse"):
    return {"sha1": sha(i, qid), "qid": qid, "source": source}


def test_v2_rule_a_pin_of_the_same_mapping_in_the_top_5_agrees():
    # Q1 (Cultural & Traditional, suit) ranks 7th, but Q2 (same mapping) ranks 5th: agrees.
    pins = ranked_pins([2, 3, 4, 5, 1, 6, 0])
    m = photo(1, "Q1")
    out, _ = build_pins.agreement_rows([m], [], {m["sha1"]: axis(0)}, PIN_QIDS, pins, "v2", PIN_KEYS)
    assert (out[0]["own_rank"], out[0]["mapping_rank"], out[0]["model_disagrees"]) == (7, 5, "no")
    assert out[0]["rule"] == build_pins.AGREE_RULE and len(out[0]["top5"].split(";")) == 5
    # No pin of its mapping in the top 5: disagrees.
    pins = ranked_pins([2, 3, 4, 5, 6, 1, 0])
    out, _ = build_pins.agreement_rows([m], [], {m["sha1"]: axis(0)}, PIN_QIDS, pins, "v2", PIN_KEYS)
    assert (out[0]["mapping_rank"], out[0]["model_disagrees"]) == (6, "yes")


def test_not_allowed_types_agree_with_any_not_allowed_pin():
    pins = ranked_pins([5, 2, 3, 4, 0, 1, 6])  # Q6 (not allowed) is top 1; the photo is a Q7
    m = photo(2, "Q7")
    out, _ = build_pins.agreement_rows([m], [], {m["sha1"]: axis(0)}, PIN_QIDS, pins, "v2", PIN_KEYS)
    assert (out[0]["own_rank"], out[0]["mapping_rank"], out[0]["model_disagrees"]) == (7, 1, "no")


def test_rechecks_only_what_the_last_run_marked_and_keeps_the_rest():
    far = ranked_pins([2, 3, 4, 5, 6, 1, 0])  # Q1's mapping is 6th: still disagrees
    rows = [photo(1, "Q1"), photo(2, "Q1"), photo(3, "Q1"), photo(4, "Q1"), photo(5, "Q1", "category"), photo(6, "Q9")]
    manifest = rows
    emb = {m["sha1"]: axis(0) for m in rows}
    previous = [
        {"sha1": sha(1, "Q1"), "qid": "Q1", "source": "openverse", "own_rank": "1", "top3": "Q1;Q2;Q3",
         "model_disagrees": "no", "vocabulary_version": "v1"},             # passed in V1b: kept as it was
        {"sha1": sha(2, "Q1"), "qid": "Q1", "source": "openverse", "own_rank": "9", "top3": "Q3;Q4;Q5",
         "model_disagrees": "yes", "vocabulary_version": "v1"},            # marked: checked again
        {"sha1": sha(3, "Q1"), "qid": "Q1", "source": "openverse", "own_rank": "9", "top3": "Q3;Q4;Q5",
         "model_disagrees": "yes", "vocabulary_version": "v1"},            # marked, then the owner kept it
    ]
    labels = [{"sha1": sha(2, "Q1"), "qid": "Q1", "decision": "drop", "decided_at": "", "source": "auto"},
              {"sha1": sha(3, "Q1"), "qid": "Q1", "decision": "keep", "decided_at": "t", "source": "owner"}]
    out, skipped = build_pins.agreement_rows(manifest, labels, emb, PIN_QIDS, far, "v2", PIN_KEYS, previous)
    by = {r["sha1"]: r for r in out}
    assert set(by) == {sha(1, "Q1"), sha(2, "Q1"), sha(3, "Q1"), sha(4, "Q1"), sha(6, "Q9")}
    assert (by[sha(1, "Q1")]["rule"], by[sha(1, "Q1")]["vocabulary_version"]) == (build_pins.AGREE_RULE_V1B, "v1")
    assert (by[sha(2, "Q1")]["rule"], by[sha(2, "Q1")]["model_disagrees"]) == (build_pins.AGREE_RULE, "yes")
    assert (by[sha(3, "Q1")]["rule"], by[sha(3, "Q1")]["vocabulary_version"]) == (build_pins.AGREE_RULE_V1B, "v1")
    assert by[sha(4, "Q1")]["model_disagrees"] == "yes" and by[sha(6, "Q9")]["model_disagrees"] == ""
    assert skipped == {"kept_as_it_was": 2, "checked_again": 1, "checked_new": 1, "type_without_pin": 1}
    near = ranked_pins([1, 2, 3, 4, 5, 6, 0])  # Q2, Q1's mapping, is top 1: the marked photo comes back
    out, _ = build_pins.agreement_rows(manifest, labels, emb, PIN_QIDS, near, "v2", PIN_KEYS, previous)
    assert {r["sha1"]: r for r in out}[sha(2, "Q1")]["model_disagrees"] == "no"


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
