"""The D2 instance-of rule on recorded Wikidata data (fixtures/wikidata_p31.json): brands,
trademarks, product models and lines, fictional clothing are dropped, by P31 or P31 of a subclass;
a type that is only a subclass of an excluded class (dress fastener) stays."""

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


def test_subclass_route_alone_counts():
    # Pebble's only P31 is "smartwatch model", itself a subclass of product model: P31/P279*.
    pebble = FIXTURE["items"]["Q477634"]
    assert not set(pebble["P31"]) & set(INSTANCE_QIDS)
    assert [INSTANCE_QIDS[q] for q in excluded_instance_of(pebble["P31"], pebble["ancestors"], INSTANCE_QIDS)] == \
        ["product_model"]
