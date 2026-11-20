"""V1b: the type pins, the banned gate and the response, on synthetic pins (no model, no network).

V2 keeps these rules when each type is its own mapping, the linear head has no weight and the gate has
one tier (banned_hard = banned_min): TH below. tests/test_v2.py covers what V2 adds."""

import hashlib
import json

import numpy as np
import pytest

from app import config, pins as type_pins
from app.pins import Pins, PinType, Thresholds
from app.scan import PhotoResult, TextBank, analyze_photo, listing_verdict, scan
from app.verdict import (
    HOODED_MIN, NSFW_REJECT_MIN, NSFW_REVIEW_MIN, REASON_BANNED, REASON_CONFLICT, REASON_HOODED,
    REASON_NOT_ALLOWED_PHOTO, REASON_SAFETY_UNSURE, REASON_UNSURE, Decision, PhotoView, TypeView, decide_listing,
    looks_like,
)
from app.vocab import APP_GARMENT_TYPES, BANKS, load

V = load()
DIM = 16
TH = Thresholds(text_logit_scale=100.0, text_top=5, gallery_k=10, disagreement_factor=0.5,
                type_min_confidence=0.6, banned_min=0.3, banned_hard=0.3, banned_rule="max",
                weight_text=0.5, weight_gallery=0.5, weight_linear=0.0, text_poster_min=0.5)
TYPES = (
    PinType("Q1", "sherwani", "Cultural & Traditional", None, "suit", True),
    PinType("Q2", "abaya", "Cultural & Traditional", None, "dress", True),
    PinType("Q3", "lingerie", None, None, None, False),
    PinType("Q4", "handbag", "Accessories", "Handbag", "one_size", True),
    PinType("Q5", "space suit", "Occasion & Party", None, "costume", True),
)


def basis(i: int, noise: float = 0.0, seed: int = 0) -> np.ndarray:
    v = np.zeros(DIM, np.float32)
    v[i] = 1.0
    if noise:
        v += np.random.default_rng(seed).normal(0, noise, DIM).astype(np.float32)
    return v / np.linalg.norm(v)


def make_pins(gallery_types: list[int]) -> Pins:
    gallery = np.stack([basis(t, 0.05, seed=n) for n, t in enumerate(gallery_types)]) if gallery_types \
        else np.zeros((0, DIM), np.float32)
    return Pins(version="v" * 64, types=TYPES, text=np.stack([basis(i) for i in range(len(TYPES))]),
                gallery=gallery, gallery_type=np.array(gallery_types, dtype=np.int64))


SHERWANI_GALLERY = make_pins([0] * 12 + [1] * 3 + [2] * 3 + [3] * 3 + [4] * 3)


# --- the reading -------------------------------------------------------------------------------

def test_text_and_gallery_agree_confidence_is_their_mean():
    r = type_pins.read(basis(0), SHERWANI_GALLERY, TH)
    assert r.agreement and r.type.qid == "Q1"
    assert r.confidence == pytest.approx((r.text_score + r.gallery_score) / 2)
    assert r.gallery_score == pytest.approx(1.0)  # all 10 nearest are sherwani photos
    assert [t["qid"] for t in r.top_types][:1] == ["Q1"] and len(r.top_types) == 5


def test_disagreement_keeps_the_higher_score_reduced_and_never_agrees():
    pins = make_pins([1] * 12)  # every gallery photo is an abaya
    e = 0.722 * basis(0) + 0.692 * basis(1)  # the text leans sherwani, not certain
    r = type_pins.read(e / np.linalg.norm(e), pins, TH)
    assert not r.agreement
    assert r.text_type.qid == "Q1" and r.gallery_type.qid == "Q2"
    assert r.gallery_score > r.text_score
    # V2: the mapping with the higher final score (text and gallery together), its score halved
    assert r.type.qid == "Q2" and r.confidence == pytest.approx(r.mapping_score * TH.disagreement_factor)


def test_banned_score_is_the_larger_of_text_and_gallery():
    pins = make_pins([2] * 6 + [0] * 6)
    e = basis(0) + basis(2)
    r = type_pins.read(e / np.linalg.norm(e), pins, TH)
    assert 0.3 < r.banned_gallery < 0.7  # half the nearest photos are lingerie
    assert r.banned_score == max(r.banned_text, r.banned_gallery)
    lingerie = type_pins.read(basis(2), make_pins([]), TH)
    assert lingerie.banned_text > 0.9 and lingerie.banned_score == lingerie.banned_text


def test_leave_one_out_exclude_removes_rows_from_the_vote():
    pins = make_pins([0, 1, 1, 1])
    assert type_pins.read(basis(0), pins, TH).gallery_type.qid in ("Q1", "Q2")
    r = type_pins.read(basis(0), pins, TH, exclude=np.array([0]))
    assert r.gallery_type.qid == "Q2" and r.gallery_score == pytest.approx(1.0)


# --- the verdict -------------------------------------------------------------------------------

ALLOWED_DECISION = Decision("allowed", "sherwani", 0.95, groups={})
UNSURE_DECISION = Decision("unsure", "sherwani", 0.4, leans_allowed=True, groups={})


def views_and_types(embedding, pins=SHERWANI_GALLERY, decision=UNSURE_DECISION, slot="front", **kw):
    r = type_pins.read(embedding, pins, TH)
    view = PhotoView(slot, decision, reading=r, banned_reason="This looks like lingerie. Dzirent doesn't allow lingerie.", **kw)
    return [view], TypeView(reading=r, thresholds=TH, banned_reason=view.banned_reason, item_key="sherwani")


def test_confident_agreeing_allowed_type_is_allowed_even_when_the_policy_check_is_unsure():
    views, types = views_and_types(basis(0))
    v = decide_listing(views, UNSURE_DECISION, V, types)
    assert (v.verdict, v.reason, v.item_key) == ("allowed", "This looks like a sherwani. You can list it.", "sherwani")


def test_low_confidence_goes_to_review():
    pins = make_pins([0] * 4 + [1] * 3 + [3] * 3)  # the vote is split
    e = basis(0) + basis(1) + basis(3)  # and the text can't choose between three types
    views, types = views_and_types(e / np.linalg.norm(e), pins)
    assert types.reading.confidence < TH.type_min_confidence
    assert decide_listing(views, UNSURE_DECISION, V, types).verdict == "review"


def test_disagreement_goes_to_review_whatever_the_confidence():
    views, types = views_and_types(basis(0), make_pins([1] * 12))
    v = decide_listing(views, ALLOWED_DECISION, V, types)
    assert (v.verdict, v.reason) == ("review", REASON_UNSURE)


def test_the_gate_overrides_an_allowed_type():
    # The text and the policy check say sherwani; the gallery's nearest photos are mostly lingerie.
    pins = make_pins([2] * 7 + [0] * 3)
    e = basis(0) * 0.7 + basis(2) * 0.3
    views, types = views_and_types(e / np.linalg.norm(e), pins, decision=ALLOWED_DECISION)
    assert types.reading.type.allowed and types.reading.banned_score >= TH.banned_min
    v = decide_listing(views, ALLOWED_DECISION, V, types)
    assert v.verdict == "rejected" and "lingerie" in v.reason


def test_the_gate_without_a_policy_item_uses_the_plain_reason():
    views, types = views_and_types(basis(2), make_pins([2] * 10))
    views[0].banned_reason = None
    types.banned_reason = None
    assert decide_listing(views, UNSURE_DECISION, V, types).reason == REASON_BANNED


def test_a_banned_close_up_only_sends_to_review():
    whole, types = views_and_types(basis(0))
    close, _ = views_and_types(basis(2), make_pins([2] * 10), slot="close_up")
    v = decide_listing(whole + close, UNSURE_DECISION, V, types)
    assert (v.verdict, v.reason) == ("review", REASON_CONFLICT)


def test_photos_of_different_kinds_go_to_review():
    dress, types = views_and_types(basis(0))
    bag, _ = views_and_types(basis(3), make_pins([3] * 12), slot="back")
    v = decide_listing(dress + bag, UNSURE_DECISION, V, types)
    assert (v.verdict, v.reason) == ("review", REASON_CONFLICT)


def test_nsfw_rules_are_unchanged():
    views, types = views_and_types(basis(0), nsfw=NSFW_REJECT_MIN)
    assert decide_listing(views, ALLOWED_DECISION, V, types).reason == REASON_NOT_ALLOWED_PHOTO
    views, types = views_and_types(basis(0), nsfw=NSFW_REVIEW_MIN)
    assert (decide_listing(views, ALLOWED_DECISION, V, types).verdict,
            decide_listing(views, ALLOWED_DECISION, V, types).reason) == ("review", REASON_SAFETY_UNSURE)


def test_hood_rule_is_unchanged():
    views, types = views_and_types(basis(0), hooded=HOODED_MIN)
    v = decide_listing(views, ALLOWED_DECISION, V, types)
    assert (v.verdict, v.reason) == ("review", REASON_HOODED)


def test_policy_rejections_still_stand():
    banned = Decision("not_allowed", "tshirt", 0.9, groups={})
    views, types = views_and_types(basis(0), decision=banned)
    v = decide_listing(views, None, V, types)
    assert v.verdict == "rejected" and v.reason == V.by_key["tshirt"].reason


def test_without_pins_the_rules_are_as_before():
    view = PhotoView("front", ALLOWED_DECISION)
    assert decide_listing([view], ALLOWED_DECISION, V).verdict == "allowed"


def test_looks_like_articles():
    assert [looks_like(n) for n in ("sherwani", "abaya", "palazzo trousers", "Anarkali Salwar Suit")] == [
        "a sherwani", "an abaya", "palazzo trousers", "an Anarkali Salwar Suit"]


# --- the response ------------------------------------------------------------------------------

def synthetic_banks(top_item: str, axis: int = 0) -> dict[str, TextBank]:
    """Banks with the right keys; the item bank's [top_item] row points along the photo's [axis]."""
    rng = np.random.default_rng(7)

    def bank(keys):
        m = rng.normal(0, 1, (len(keys), DIM)).astype(np.float32)
        m[:, axis] = -3.0
        return TextBank(keys=list(keys), matrix=m / np.linalg.norm(m, axis=1, keepdims=True))

    banks = {"items": bank([i.key for i in V.items])}
    banks.update({name: bank([e.key for e in V.banks[name]]) for name in BANKS})
    banks["items"].matrix[[i.key for i in V.items].index(top_item)] = basis(axis)
    return banks


def analyzed(embedding, banks, worn=None, slot="front", pins=SHERWANI_GALLERY):
    rgb = np.full((96, 96, 3), 200, np.uint8)
    rgb[24:72, 24:72] = (120, 30, 40)
    r = PhotoResult(photo_id="p1", slot=slot)
    analyze_photo(r, embedding, rgb, banks, V, nsfw=0.01, pins=pins, thresholds=TH)
    if worn is not None:
        r.worn = worn
    return r


OLD_KEYS = {"listing_id", "verdict", "reason", "item_key", "suggestions", "quality", "photos", "model", "safety_model",
            "policy_digest", "service_version"}
NEW_KEYS = {"type", "type_confidence", "agreement", "top_types", "banned_score", "vocabulary_version"}


def test_response_keeps_every_field_and_adds_the_type_fields():
    banks = synthetic_banks("sherwani")
    out = scan("listing-1", [analyzed(basis(0), banks)], banks, V, None, SHERWANI_GALLERY, TH)
    assert OLD_KEYS | NEW_KEYS <= set(out)
    assert out["service_version"] == config.SERVICE_VERSION == "v2.1"
    assert out["type"] == {"qid": "Q1", "english_name": "sherwani", "category": "Cultural & Traditional",
                           "item_type": None, "garment_type": "suit"}
    assert isinstance(out["type_confidence"], float) and out["agreement"] is True
    assert [set(t) for t in out["top_types"]] == [{"qid", "english_name", "allowed", "score"}] * 5
    assert isinstance(out["banned_score"], float) and out["vocabulary_version"] == "v" * 64
    photo = out["photos"][0]
    assert {"blur_score", "brightness_score", "framing_score", "worn_by_person", "labels", "fingerprint"} <= set(photo)
    assert {"type", "type_confidence", "agreement", "text", "gallery", "banned_score"} <= set(photo["labels"]["pins"])
    json.dumps(out)  # plain JSON all the way down


def test_worn_never_changes_the_verdict():
    banks = synthetic_banks("sherwani")
    a = listing_verdict([analyzed(basis(0), banks, worn=0.0)], banks, V, SHERWANI_GALLERY, TH)["verdict"]
    b = listing_verdict([analyzed(basis(0), banks, worn=0.99)], banks, V, SHERWANI_GALLERY, TH)["verdict"]
    assert a == b


def test_costume_never_reaches_the_apps_garment_kind():
    assert V.by_key["costume"].garment_type == "costume" and "costume" not in APP_GARMENT_TYPES
    banks = synthetic_banks("costume", axis=4)
    pins = make_pins([4] * 12)
    out = scan("listing-2", [analyzed(basis(4), banks, pins=pins)], banks, V, None, pins, TH)
    assert out["type"]["garment_type"] == "costume"
    assert out["suggestions"]["item_key"] == "costume" and out["suggestions"]["category"] == "Occasion & Party"
    assert out["suggestions"]["garment_type"] is None


# --- loading -----------------------------------------------------------------------------------

def write_pins(tmp_path, version="a" * 64, gallery_version=None, gallery_qids=("Q1", "Q1")):
    vocab = tmp_path / "vocabulary.npz"
    np.savez(vocab, embeddings=np.stack([basis(i) for i in range(2)]).astype(np.float16), qid=np.array(["Q1", "Q2"]),
             english_name=np.array(["sherwani", "lingerie"]), dzirent_category=np.array(["Cultural & Traditional", ""]),
             dzirent_item_type=np.array(["", ""]), dzirent_garment_type=np.array(["suit", ""]),
             allowed=np.array([True, False]), vocabulary_version=np.array(version))
    gallery = tmp_path / "gallery.npz"
    np.savez(gallery, embeddings=np.stack([basis(0)] * len(gallery_qids)).astype(np.float16),
             sha1=np.array([f"{n:040d}" for n in range(len(gallery_qids))]), qid=np.array(list(gallery_qids)),
             allowed=np.array([True] * len(gallery_qids)), vocabulary_version=np.array(gallery_version or version))
    linear = tmp_path / "linear.npz"  # V2: the service needs its linear head too
    np.savez(linear, weights=np.stack([basis(0), basis(1)]).astype(np.float16), bias=np.zeros(2, np.float16),
             qid=np.array(["Q1", "Q2"]), training_set_sha256=np.array("t" * 64), vocabulary_version=np.array(version))
    pins_json = tmp_path / "pins.json"
    pins_json.write_text(json.dumps({"vocabulary_version": version,
                                     "gallery_sha256": hashlib.sha256(gallery.read_bytes()).hexdigest(),
                                     "linear_sha256": hashlib.sha256(linear.read_bytes()).hexdigest(),
                                     "linear_training_sha256": "t" * 64}),
                         encoding="utf-8")
    return vocab, gallery, pins_json, linear


def test_load_reads_both_files(tmp_path):
    p = type_pins.load(*write_pins(tmp_path))
    assert [t.qid for t in p.types] == ["Q1", "Q2"] and len(p.gallery) == 2
    assert p.types[1].category is None and not p.types[1].allowed and p.not_allowed.tolist() == [False, True]


def test_load_refuses_a_gallery_pins_json_doesnt_name(tmp_path):
    vocab, gallery, pins_json, linear = write_pins(tmp_path)
    gallery.write_bytes(gallery.read_bytes() + b"x")
    with pytest.raises(RuntimeError, match="sha256"):
        type_pins.load(vocab, gallery, pins_json, linear)


def test_load_refuses_another_vocabulary(tmp_path):
    with pytest.raises(RuntimeError, match="another vocabulary"):
        type_pins.load(*write_pins(tmp_path, gallery_version="b" * 64))


def test_load_refuses_gallery_types_without_a_text_pin(tmp_path):
    with pytest.raises(RuntimeError, match="without a text pin"):
        type_pins.load(*write_pins(tmp_path, gallery_qids=("Q1", "Q9")))


def test_load_refuses_a_missing_gallery(tmp_path):
    vocab, gallery, pins_json, linear = write_pins(tmp_path)
    gallery.unlink()
    with pytest.raises(RuntimeError, match="missing"):
        type_pins.load(vocab, gallery, pins_json, linear)


def test_committed_thresholds_load_and_explain_every_value():
    raw = json.loads(type_pins.THRESHOLDS_FILE.read_text(encoding="utf-8"))
    Thresholds.load()
    for name in Thresholds.__dataclass_fields__:
        assert raw[name]["comment"].strip(), f"{name} needs its reason"


def test_committed_vocabulary_pins_match_pins_json():
    data = np.load(type_pins.VOCABULARY_PINS_FILE, allow_pickle=False)
    expected = json.loads(type_pins.PINS_FILE.read_text(encoding="utf-8"))
    assert str(data["vocabulary_version"]) == expected["vocabulary_version"]
    assert hashlib.sha256(type_pins.VOCABULARY_PINS_FILE.read_bytes()).hexdigest() == expected["vocabulary_sha256"]
    assert data["embeddings"].dtype == np.float16 and data["embeddings"].shape == (len(data["qid"]), 768)
