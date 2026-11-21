"""V2: Dzirent-level agreement, the linear head, the two-tier gate, text or poster and the response,
on synthetic pins and a tiny synthetic linear head (no model, no network)."""

import hashlib
import json

import numpy as np
import pytest

from app import config, pins as type_pins
from app.pins import Linear, Pins, PinType, Thresholds
from app.scan import listing_verdict, scan
from app.verdict import (
    REASON_BANNED_REVIEW, REASON_CONFLICT, REASON_TEXT_OR_POSTER, REASON_UNSURE, Decision, PhotoView, TypeView,
    decide_listing,
)
from app.vocab import NOT_CLOTHING_REASON, TEXT_OR_POSTER, load, policy_rows
from test_v1b import OLD_KEYS, NEW_KEYS, analyzed, basis, synthetic_banks

V = load()
DIM = 16
TH = Thresholds(text_logit_scale=100.0, text_top=5, gallery_k=10, disagreement_factor=0.5,
                type_min_confidence=0.6, banned_min=0.3, banned_hard=0.7, banned_rule="max",
                weight_text=0.4, weight_gallery=0.3, weight_linear=0.3, text_poster_min=0.5)
# Sherwani and achkan share a mapping (Cultural & Traditional, suit, allowed); abaya is a dress.
TYPES = (
    PinType("Q1", "sherwani", "Cultural & Traditional", None, "suit", True),
    PinType("Q2", "achkan", "Cultural & Traditional", None, "suit", True),
    PinType("Q3", "abaya", "Cultural & Traditional", None, "dress", True),
    PinType("Q4", "lingerie", None, None, None, False),
    PinType("Q5", "sneakers", None, None, None, False),
)


def linear_head(types=(0, 1, 2, 3, 4), scale=20.0) -> Linear:
    """A tiny head: class i points along axis types[i]."""
    return Linear(weights=np.stack([scale * basis(t) for t in types]).astype(np.float16),
                  bias=np.zeros(len(types), np.float16), type_index=np.array(types))


def make_pins(gallery_types, linear=None) -> Pins:
    gallery = np.stack([basis(t, 0.05, seed=n) for n, t in enumerate(gallery_types)]) if gallery_types \
        else np.zeros((0, DIM), np.float32)
    return Pins(version="w" * 64, types=TYPES, text=np.stack([basis(i) for i in range(len(TYPES))]),
                gallery=gallery, gallery_type=np.array(gallery_types, dtype=np.int64),
                linear=linear if linear is not None else linear_head())


def unit(v):
    return v / np.linalg.norm(v)


# --- Dzirent-level agreement ---------------------------------------------------------------------

def test_text_and_gallery_naming_two_types_of_one_mapping_agree():
    pins = make_pins([1] * 12)  # the gallery says achkan
    r = type_pins.read(basis(0), pins, TH)  # the text says sherwani
    assert r.text_type.qid == "Q1" and r.gallery_type.qid == "Q2"
    assert r.agreement and r.mapping == ("Cultural & Traditional", "suit", True)
    # the reported type is the best one inside the mapping, by the final score
    assert r.type.qid in ("Q1", "Q2") and r.type.mapping == r.mapping and 0 < r.type_score <= r.mapping_score
    assert r.confidence == pytest.approx(r.mapping_score)


def test_different_mappings_disagree_and_halve_the_confidence():
    pins = make_pins([2] * 12)  # the gallery says abaya: a dress, not a suit
    r = type_pins.read(basis(0), pins, TH)
    assert not r.agreement and r.text_mapping != r.gallery_mapping
    assert r.confidence == pytest.approx(r.mapping_score * TH.disagreement_factor)


def test_mapping_agreement_allows_what_type_agreement_would_not():
    pins = make_pins([1] * 12)
    r = type_pins.read(basis(0), pins, TH)
    view = PhotoView("front", Decision("unsure", "sherwani", 0.4, leans_allowed=True, groups={}), reading=r)
    v = decide_listing([view], view.decision, V, TypeView(reading=r, thresholds=TH, item_key="sherwani"))
    assert v.verdict == "allowed"
    disagreeing = type_pins.read(basis(0), make_pins([2] * 12), TH)
    view.reading = disagreeing
    v = decide_listing([view], view.decision, V, TypeView(reading=disagreeing, thresholds=TH, item_key="sherwani"))
    assert (v.verdict, v.reason) == ("review", REASON_UNSURE)


def test_top_types_are_per_type_by_the_final_score():
    r = type_pins.read(basis(0), make_pins([1] * 12), TH)
    assert len(r.top_types) == 5 and {t["qid"] for t in r.top_types[:2]} == {"Q1", "Q2"}
    assert r.top_types == sorted(r.top_types, key=lambda t: -t["score"])


# --- the linear head ------------------------------------------------------------------------------

def test_the_linear_head_takes_part_in_the_final_score():
    e = unit(basis(0) + basis(2))  # the text can't choose between sherwani and abaya
    with_head = type_pins.read(e, make_pins([], linear=linear_head(types=(2,), scale=1.0)), TH)
    assert with_head.linear_type.qid == "Q3" and with_head.linear_score == pytest.approx(1.0)
    assert with_head.type.qid == "Q3"  # no gallery: text 0.4 x 0.5 each, the head's 0.3 goes to abaya
    without = type_pins.read(e, make_pins([], linear=linear_head(types=(0,), scale=1.0)), TH)
    assert without.type.qid == "Q1"


def test_calibration_can_replace_the_heads_probabilities():
    pins = make_pins([0] * 12)
    oof = np.array([0.0, 0.0, 0.0, 1.0, 0.0])  # a head that never saw this photo says lingerie
    r = type_pins.read(basis(0), pins, TH, linear_probs=oof)
    assert r.banned_linear == pytest.approx(1.0) and r.banned_score == pytest.approx(1.0)


# --- the two-tier gate ----------------------------------------------------------------------------

def gate_case(banned_share: float):
    """A confident, agreeing allowed sherwani whose banned_score is [banned_share] (through the
    linear head's not-allowed share; banned_rule max)."""
    pins = make_pins([0] * 12)
    probs = np.array([1.0 - banned_share, 0.0, 0.0, banned_share, 0.0])
    r = type_pins.read(basis(0), pins, TH, linear_probs=probs)
    assert r.agreement and r.type.allowed and r.confidence >= TH.type_min_confidence
    view = PhotoView("front", Decision("allowed", "sherwani", 0.95, groups={}), reading=r,
                     banned_reason="This looks like lingerie. Dzirent doesn't allow lingerie.")
    types = TypeView(reading=r, thresholds=TH, banned_reason=view.banned_reason, item_key="sherwani")
    return decide_listing([view], view.decision, V, types), r


def test_hard_tier_rejects_with_the_not_allowed_reason():
    v, r = gate_case(0.8)
    assert r.banned_score >= TH.banned_hard
    assert v.verdict == "rejected" and "lingerie" in v.reason


@pytest.mark.parametrize("share", [0.3, 0.5, 0.69])
def test_borderline_is_review_with_the_neutral_reason_never_allowed(share):
    v, r = gate_case(share)
    assert TH.banned_min <= r.banned_score < TH.banned_hard
    assert (v.verdict, v.reason) == ("review", REASON_BANNED_REVIEW)


def test_under_banned_min_the_type_decides():
    v, r = gate_case(0.1)
    assert r.banned_score < TH.banned_min and v.verdict == "allowed"


def test_a_borderline_close_up_only_reviews():
    pins = make_pins([3] * 12)
    close = PhotoView("close_up", Decision("unsure", None, 0.3, groups={}), reading=type_pins.read(basis(3), pins, TH))
    r0 = type_pins.read(basis(0), make_pins([0] * 12), TH, linear_probs=np.array([1.0, 0, 0, 0, 0]))
    whole = PhotoView("front", Decision("allowed", "sherwani", 0.95, groups={}), reading=r0)
    v = decide_listing([whole, close], whole.decision, V, TypeView(reading=r0, thresholds=TH, item_key="sherwani"))
    assert (v.verdict, v.reason) == ("review", REASON_CONFLICT)


def test_banned_rules():
    th = Thresholds(**{**TH.__dict__, "banned_rule": "combined"})
    assert type_pins.combine_banned(0.9, 0.0, 0.0, TH) == pytest.approx(0.9)
    assert type_pins.combine_banned(0.9, 0.0, 0.0, th) == pytest.approx(0.36)


# --- text or poster -------------------------------------------------------------------------------

def test_text_or_poster_items_are_not_clothing_rows_like_the_others():
    rows = {r["key"]: r for r in policy_rows()}
    for key in TEXT_OR_POSTER:
        r = rows[key]
        assert (r["kind"], r["allowed"], r["policy_group"], r["reason"]) == ("other", False, "not clothing", NOT_CLOTHING_REASON)
        assert len(r["prompts"]) >= 3


def test_a_photo_flagged_text_or_poster_is_review_even_with_a_confident_allowed_type():
    v, _ = gate_case(0.0)
    assert v.verdict == "allowed"
    r = type_pins.read(basis(0), make_pins([0] * 12), TH, linear_probs=np.array([1.0, 0, 0, 0, 0]))
    view = PhotoView("front", Decision("allowed", "sherwani", 0.95, groups={}), reading=r, text_poster=True)
    v = decide_listing([view], view.decision, V, TypeView(reading=r, thresholds=TH, item_key="sherwani"))
    assert (v.verdict, v.reason) == ("review", REASON_TEXT_OR_POSTER)


def test_text_or_poster_is_never_rejected_as_not_clothing_but_a_phone_still_is():
    poster = PhotoView("front", Decision("not_clothing", "poster", 0.9, groups={}))
    v = decide_listing([poster], None, V)
    assert (v.verdict, v.reason) == ("review", REASON_TEXT_OR_POSTER)
    phone = PhotoView("front", Decision("not_clothing", "phone", 0.9, groups={}))
    assert decide_listing([phone], None, V).verdict == "rejected"


def test_scan_flags_text_or_poster_from_the_labels():
    banks = synthetic_banks("poster", axis=0)  # the policy labels read the photo as a poster
    pins = make_pins([0] * 12)
    result = analyzed(basis(0), banks, pins=pins)
    result.reading = type_pins.read(basis(0), pins, TH)
    assert result.text_poster >= TH.text_poster_min
    d = listing_verdict([result], banks, V, pins, TH)
    assert (d["verdict"].verdict, d["verdict"].reason) == ("review", REASON_TEXT_OR_POSTER)


# --- the response -----------------------------------------------------------------------------------

def test_response_keeps_every_field_and_adds_the_v2_ones():
    banks = synthetic_banks("sherwani")
    pins = make_pins([1] * 12)
    out = scan("listing-1", [analyzed(basis(0), banks, pins=pins)], banks, V, None, pins, TH)
    assert OLD_KEYS | NEW_KEYS | {"mapping", "linear_sha256"} <= set(out)
    assert out["service_version"] == config.SERVICE_VERSION == "v2.1"
    assert out["agreement"] is True
    assert out["mapping"] == {"category": "Cultural & Traditional", "garment_type": "suit", "allowed": True,
                              "score": out["mapping"]["score"]}
    assert out["type"]["qid"] in ("Q1", "Q2") and set(out["type"]) == {"qid", "english_name", "category", "item_type",
                                                                         "garment_type"}
    pin = out["photos"][0]["labels"]["pins"]
    assert {"linear", "mapping", "text_mapping", "gallery_mapping", "banned"} <= set(pin)
    assert "text_or_poster" in out["photos"][0]["labels"]
    json.dumps(out)


# --- loading the head -------------------------------------------------------------------------------

def write_all(tmp_path, training="t" * 64, linear_training=None, drop_key=None):
    from test_v1b import write_pins  # noqa: PLC0415
    vocab, gallery, pins_json, linear = write_pins(tmp_path)
    np.savez(linear, weights=np.stack([basis(0), basis(1)]).astype(np.float16), bias=np.zeros(2, np.float16),
             qid=np.array(["Q1", "Q2"]), training_set_sha256=np.array(linear_training or training),
             vocabulary_version=np.array("a" * 64))
    expected = json.loads(pins_json.read_text(encoding="utf-8"))
    expected.update(linear_sha256=hashlib.sha256(linear.read_bytes()).hexdigest(), linear_training_sha256=training)
    if drop_key:
        expected.pop(drop_key)
    pins_json.write_text(json.dumps(expected), encoding="utf-8")
    return vocab, gallery, pins_json, linear


def test_load_reads_the_linear_head(tmp_path):
    p = type_pins.load(*write_all(tmp_path))
    assert p.linear is not None and p.linear.type_index.tolist() == [0, 1] and p.linear.training_sha256 == "t" * 64


def test_load_refuses_a_linear_head_whose_file_hash_differs(tmp_path):
    vocab, gallery, pins_json, linear = write_all(tmp_path)
    linear.write_bytes(linear.read_bytes() + b"x")
    with pytest.raises(RuntimeError, match="linear.npz isn't the file"):
        type_pins.load(vocab, gallery, pins_json, linear)


def test_load_refuses_a_linear_head_trained_on_another_set(tmp_path):
    with pytest.raises(RuntimeError, match="another training set"):
        type_pins.load(*write_all(tmp_path, linear_training="u" * 64))


def test_load_refuses_pins_json_without_a_linear_head(tmp_path):
    with pytest.raises(RuntimeError, match="names no linear head"):
        type_pins.load(*write_all(tmp_path, drop_key="linear_sha256"))


def test_thresholds_are_checked():
    with pytest.raises(ValueError, match="add up to 1"):
        bad = {k: {"value": v, "comment": "x"} for k, v in {**TH.__dict__, "weight_text": 0.9}.items()}
        _load_from(bad)
    with pytest.raises(ValueError, match="banned_min can't be above banned_hard"):
        _load_from({k: {"value": v, "comment": "x"} for k, v in {**TH.__dict__, "banned_min": 0.8}.items()})
    with pytest.raises(ValueError, match="banned_rule"):
        _load_from({k: {"value": v, "comment": "x"} for k, v in {**TH.__dict__, "banned_rule": "mean"}.items()})


def _load_from(raw):
    import tempfile  # noqa: PLC0415
    from pathlib import Path  # noqa: PLC0415
    with tempfile.TemporaryDirectory() as d:
        path = Path(d) / "thresholds.json"
        path.write_text(json.dumps(raw), encoding="utf-8")
        return Thresholds.load(path)


def test_committed_linear_head_matches_pins_json():
    expected = json.loads(type_pins.PINS_FILE.read_text(encoding="utf-8"))
    data = np.load(type_pins.LINEAR_FILE, allow_pickle=False)
    assert hashlib.sha256(type_pins.LINEAR_FILE.read_bytes()).hexdigest() == expected["linear_sha256"]
    assert str(data["training_set_sha256"]) == expected["linear_training_sha256"]
    assert data["weights"].dtype == np.float16 and data["weights"].shape == (len(data["qid"]), 768)
    assert type_pins.LINEAR_FILE.stat().st_size < 1_200_000
