"""The D2 instance-of rule on recorded Wikidata data (fixtures/wikidata_p31.json): brands,
trademarks, product models and lines, fictional clothing are dropped, by P31 or P31 of a subclass;
a type that is only a subclass of an excluded class (dress fastener) stays.

D2b, the whole build on a recorded slice of the Wikidata cache (fixtures/wikidata_d2b.json): the
instance-of exceptions, the drop list, the costume roots and the exclusion winning over costume."""

import copy
import json
from pathlib import Path

import pytest

from build_taxonomy import excluded_instance_of

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "wikidata_p31.json").read_text(encoding="utf-8"))
INSTANCE_QIDS = {r["qid"]: r["key"] for r in FIXTURE["instance_of"]}


def test_fixture_has_the_seven_classes():
    assert sorted(INSTANCE_QIDS.values()) == sorted(["fictional_object", "fictional_clothing", "brand", "trademark",
                                                     "product_model", "product_line", "archaeological_artefact"])


@pytest.mark.parametrize("qid", sorted(FIXTURE["items"]))
def test_instance_of_rule(qid):
    item = FIXTURE["items"][qid]
    hits = excluded_instance_of(item["P31"], item["ancestors"], INSTANCE_QIDS)
    assert ("drop" if hits else "keep") == item["expected"], (item["label"], [INSTANCE_QIDS[h] for h in hits])


# --- D2b: the build on a recorded slice of the Wikidata cache (fixtures/wikidata_d2b.json) --------
D2B = json.loads((Path(__file__).parent / "fixtures" / "wikidata_d2b.json").read_text(encoding="utf-8"))


def build(tmp_path, monkeypatch, fetched=None):
    """Runs build_taxonomy on the fixture; returns (rows, excluded, review.csv lines, vocabulary)."""
    import build_taxonomy as b
    raw = tmp_path / "fetched.json"
    raw.write_text(json.dumps(fetched or D2B["fetched"], ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(b, "FETCHED_JSON", raw)
    for name in ("TAXONOMY_JSON", "REVIEW_CSV", "EXCLUDED_JSON", "VOCABULARY_JSON"):
        monkeypatch.setattr(b, name, tmp_path / getattr(b, name).name)
    monkeypatch.setattr(b, "MIN_ROWS", 1)  # the size gate is for the full sheet
    assert b.build_taxonomy() == 0
    rows = {r["qid"]: r for r in json.loads((tmp_path / "taxonomy.json").read_text(encoding="utf-8"))}
    excluded = {x["qid"]: x for x in json.loads((tmp_path / "excluded.json").read_text(encoding="utf-8"))}
    sheet = {r["qid"]: r for r in b.read_review_csv()[0]}
    vocabulary = {e["qid"] for e in json.loads((tmp_path / "vocabulary.json").read_text(encoding="utf-8"))["entries"]}
    return rows, excluded, sheet, vocabulary


def test_exception_list_keeps_harrington_jacket(tmp_path, monkeypatch):
    rows, excluded, _, _ = build(tmp_path, monkeypatch)
    harrington = rows["Q1586189"]
    assert harrington["instance_of_exception"] and "Q167270" in {c["qid"] for c in harrington["instance_of"]}  # trademark
    assert (harrington["dzirent_category"], harrington["dzirent_garment_type"], harrington["allowed"]) == \
        ("Outerwear", "top", "allowed")  # classified as usual
    assert excluded["Q16034580"]["reason"] == "instance of an excluded class"  # Lady Dior: no exception

    fetched = copy.deepcopy(D2B["fetched"])
    fetched["roots"]["instance_of_exceptions"] = []
    rows, excluded, _, _ = build(tmp_path, monkeypatch, fetched)
    assert "Q1586189" not in rows and excluded["Q1586189"]["reason"] == "instance of an excluded class"


def test_drop_list_sets_keep_no(tmp_path, monkeypatch):
    rows, _, sheet, vocabulary = build(tmp_path, monkeypatch)
    rolex = rows["Q382707"]
    assert rolex["keep"] == "no" and rolex["drop_list"] and rolex["allowed"] == "allowed"  # allowed unchanged
    assert sheet["Q382707"]["keep"] == "no" and "Q382707" not in vocabulary


def test_costume_root_is_occasion_and_party_costume(tmp_path, monkeypatch):
    rows, _, sheet, vocabulary = build(tmp_path, monkeypatch)
    for qid in ("Q111200975", "Q5643122"):  # ballet costume (1 level below), Halloween costume (instance of)
        r = rows[qid]
        assert (r["dzirent_category"], r["dzirent_garment_type"], r["allowed"], r["sheet_group"]) == \
            ("Occasion & Party", "costume", "allowed", "costume"), r["english_name"]
        assert sheet[qid]["needs_owner"] == "yes" and qid in vocabulary
    gorilla = rows["Q5586484"]  # on the keep list and under costume
    assert (gorilla["dzirent_category"], gorilla["dzirent_garment_type"], gorilla["sheet_group"]) == \
        ("Occasion & Party", "costume", "keep")


def test_costume_also_under_mask_is_excluded(tmp_path, monkeypatch):
    rows, excluded, _, _ = build(tmp_path, monkeypatch)
    # Recorded: baiana costume is reached by costume and is also under protective clothing.
    assert "Q16496152" not in rows and excluded["Q16496152"]["reason"] == "costume under an excluded root"
    # Off the keep list (D2b), waders is cut A's again.
    assert excluded["Q1934317"]["reason"] == "under an excluded root"

    # The same rule for mask: ballet costume, given mask as an ancestor, goes.
    fetched = copy.deepcopy(D2B["fetched"])
    mask = next(r["qid"] for r in fetched["roots"]["exclude"] if r["key"] == "mask")
    fetched["ancestors"]["Q111200975"][mask] = "P279"
    rows, excluded, _, _ = build(tmp_path, monkeypatch, fetched)
    assert "Q111200975" not in rows
    assert excluded["Q111200975"]["reason"] == "costume under an excluded root" and "mask" in excluded["Q111200975"]["detail"]


def test_subclass_route_alone_counts():
    # Pebble's only P31 is "smartwatch model", itself a subclass of product model: P31/P279*.
    pebble = FIXTURE["items"]["Q477634"]
    assert not set(pebble["P31"]) & set(INSTANCE_QIDS)
    assert [INSTANCE_QIDS[q] for q in excluded_instance_of(pebble["P31"], pebble["ancestors"], INSTANCE_QIDS)] == \
        ["product_model"]
