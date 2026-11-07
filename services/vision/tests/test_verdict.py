import pytest

from app.verdict import (
    ALLOWED, DETAIL, HOODED_MIN, NOT_ALLOWED, NOT_CLOTHING, NSFW_REJECT_MIN, NSFW_REVIEW_MIN, REASON_CONFLICT,
    REASON_HOODED, REASON_NO_WHOLE_PIECE, REASON_NOT_ALLOWED_PHOTO, REASON_PHOTO_FAILED, REASON_SAFETY_UNSURE,
    REASON_UNSURE, UNSURE, PhotoView, Scores, decide_listing, decide_photo,
)
from app.vocab import NOT_CLOTHING_REASON, load

V = load()


def scores(items: dict, not_fashion: float = 0.05, details: dict | None = None) -> Scores:
    probs = {i.key: 0.0 for i in V.items}
    probs.update(items)
    return Scores(items=probs, details={"label": 0.0, "closeup": 0.0, **(details or {})}, not_fashion=not_fashion)


def photo(items: dict, slot: str | None = "front", **kw) -> PhotoView:
    return PhotoView(slot, decide_photo(scores(items, **kw), V))


GOWN = {"gown": 0.95, "maxi_dress": 0.04, "tshirt": 0.01}


@pytest.mark.parametrize("items, kw, expected", [
    (GOWN, {}, ALLOWED),
    ({"gown": 0.85, "lingerie": 0.10, "phone": 0.05}, {}, UNSURE),       # allowed mass below 0.90
    ({"gown": 0.91, "lingerie": 0.09}, {}, UNSURE),                      # contrary mass above 0.08
    ({"sneakers": 0.4, "boots": 0.3, "gown": 0.2, "phone": 0.1}, {}, NOT_ALLOWED),  # shoes add up
    ({"sneakers": 0.65, "gown": 0.35}, {}, UNSURE),                      # allowed items too likely to reject
    ({"laptop": 0.9, "gown": 0.1}, {"not_fashion": 0.9}, NOT_CLOTHING),
    ({"laptop": 0.9, "gown": 0.1}, {"not_fashion": 0.3}, UNSURE),        # the general check must agree
    ({"gown": 0.2}, {"details": {"label": 0.8}}, DETAIL),
])
def test_photo_thresholds(items, kw, expected):
    assert decide_photo(scores(items, **kw), V).decision == expected


def test_rejection_names_the_item_with_the_most_probability_in_its_group():
    d = decide_photo(scores({"sneakers": 0.4, "boots": 0.3, "gown": 0.2, "phone": 0.1}), V)
    assert d.item_key == "sneakers"


def combined(items: dict = GOWN):
    return decide_photo(scores(items), V)


def test_all_whole_piece_photos_allowed():
    v = decide_listing([photo(GOWN), photo(GOWN, "back")], combined(), V)
    assert (v.verdict, v.reason) == ("allowed", "This looks like a gown. You can list it.")


def test_not_allowed_item_is_rejected_and_named():
    v = decide_listing([photo({"tshirt": 0.9, "sport_tee": 0.1})], None, V)
    assert v.verdict == "rejected" and v.reason == V.by_key["tshirt"].reason and "T-shirt" in v.reason


def test_not_clothing_is_rejected():
    v = decide_listing([photo({"laptop": 0.95, "gown": 0.05}, not_fashion=0.9)], None, V)
    assert (v.verdict, v.reason) == ("rejected", NOT_CLOTHING_REASON)


def test_unsure_is_never_allowed():
    unsure = {"gown": 0.6, "lingerie": 0.3, "phone": 0.1}
    v = decide_listing([photo(unsure)], combined(unsure), V)
    assert (v.verdict, v.reason) == ("review", REASON_UNSURE)


def test_allowed_and_not_allowed_photos_conflict():
    v = decide_listing([photo(GOWN), photo({"sneakers": 0.9, "boots": 0.1}, "back")], combined(), V)
    assert (v.verdict, v.reason) == ("review", REASON_CONFLICT)


def test_unsure_photo_that_does_not_lean_allowed_sends_to_review():
    leaning_away = {"gown": 0.45, "lingerie": 0.3, "phone": 0.25}
    v = decide_listing([photo(GOWN), photo(leaning_away, "back")], combined(), V)
    assert v.verdict == "review"


def test_unsure_photo_that_leans_allowed_is_fine_when_the_photos_together_are_allowed():
    leaning = {"gown": 0.7, "maxi_dress": 0.15, "lingerie": 0.1, "phone": 0.05}
    v = decide_listing([photo(GOWN), photo(leaning, "back")], combined(), V)
    assert v.verdict == "allowed"


def test_photos_together_must_be_allowed():
    v = decide_listing([photo(GOWN)], combined({"gown": 0.8, "lingerie": 0.2}), V)
    assert v.verdict == "review"


def test_a_bag_and_a_dress_are_different_things():
    bag = {"handbag": 0.97, "gown": 0.03}
    v = decide_listing([photo(GOWN), photo(bag, "back")], combined(), V)
    assert (v.verdict, v.reason) == ("review", REASON_CONFLICT)


def test_size_tag_that_looks_like_a_document_is_ignored():
    tag = photo({"document": 0.9, "gown": 0.1}, "size_tag", not_fashion=0.9)
    assert tag.decision.decision == NOT_CLOTHING
    assert decide_listing([photo(GOWN), tag], combined(), V).verdict == "allowed"


def test_not_allowed_close_up_still_raises_a_conflict():
    close_up = photo({"sneakers": 0.95, "gown": 0.05}, "close_up")
    assert decide_listing([photo(GOWN), close_up], combined(), V).verdict == "review"


def test_only_detail_photos_ask_for_the_whole_piece():
    v = decide_listing([photo(GOWN, "size_tag"), photo({"gown": 0.1}, "front", details={"closeup": 0.9})], None, V)
    assert (v.verdict, v.reason) == ("review", REASON_NO_WHOLE_PIECE)


def test_a_photo_that_could_not_be_opened_sends_to_review():
    v = decide_listing([photo(GOWN), PhotoView("back", None)], combined(), V)
    assert (v.verdict, v.reason) == ("review", REASON_PHOTO_FAILED)


# ---- Content safety (P2A) ----

def safe(view: PhotoView, nsfw: float = 0.0, hooded: float = 0.0) -> PhotoView:
    return PhotoView(view.slot, view.decision, nsfw=nsfw, hooded=hooded)


def test_clear_nudity_is_rejected_even_when_the_item_is_allowed():
    v = decide_listing([photo(GOWN), safe(photo(GOWN, "back"), nsfw=NSFW_REJECT_MIN)], combined(), V)
    assert (v.verdict, v.reason) == ("rejected", REASON_NOT_ALLOWED_PHOTO)


def test_nudity_in_a_size_tag_or_close_up_still_counts():
    v = decide_listing([photo(GOWN), safe(photo(GOWN, "close_up"), nsfw=0.97)], combined(), V)
    assert v.verdict == "rejected"


def test_uncertain_nudity_goes_to_review():
    v = decide_listing([safe(photo(GOWN), nsfw=NSFW_REVIEW_MIN)], combined(), V)
    assert (v.verdict, v.reason) == ("review", REASON_SAFETY_UNSURE)


def test_uncertain_nudity_never_softens_a_rejection():
    v = decide_listing([safe(photo({"tshirt": 0.9, "sport_tee": 0.1}), nsfw=0.6)], None, V)
    assert (v.verdict, v.reason) == ("rejected", V.by_key["tshirt"].reason)


def test_low_nudity_scores_change_nothing():
    v = decide_listing([safe(photo(GOWN), nsfw=NSFW_REVIEW_MIN - 0.01)], combined(), V)
    assert v.verdict == "allowed"


def test_a_hooded_garment_goes_to_review_instead_of_allowed():
    v = decide_listing([safe(photo(GOWN), hooded=HOODED_MIN), photo(GOWN, "back")], combined(), V)
    assert (v.verdict, v.reason) == ("review", REASON_HOODED)


def test_a_hood_never_softens_a_rejection():
    hoodie = {"hoodie": 0.9, "sweatshirt": 0.1}
    v = decide_listing([safe(photo(hoodie), hooded=0.99)], None, V)
    assert (v.verdict, v.reason) == ("rejected", V.by_key["hoodie"].reason)


def test_a_photo_that_is_not_hooded_stays_allowed():
    v = decide_listing([safe(photo(GOWN), hooded=HOODED_MIN - 0.01)], combined(), V)
    assert v.verdict == "allowed"


def test_being_worn_is_never_an_input_to_the_verdict():
    """PhotoView has no worn input at all: a photo of the piece being worn is judged like any other."""
    assert "worn" not in PhotoView.__dataclass_fields__
    v = decide_listing([photo(GOWN)], combined(), V)
    assert v.verdict == "allowed"
