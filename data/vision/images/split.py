"""D4: the locked train/test split of the kept photos.

Kept photos: a photo of manifest.csv whose decision in labels.csv is keep. The owner's latest
decision wins, then the auto-filter's; a photo with neither counts as keep, as on the review page
(auto_filter.effective). Drop and not sure are left out.

Per type, the test set is the round(20 %) of its kept photos, at least 2, once it has 5 or more;
a type with fewer than 5 kept photos and no test photo yet goes entirely to train and is listed
as thin.

Which photos are test (D2e: sticky):
- a photo already in the committed split.json keeps its side, train or test, for as long as it is
  kept: a photo that trained never moves into test, and a test photo never moves into train;
- the owner's own photos (manifest source owner, from ingest_own.py) are always train;
- new photos fill the type's test set up to its share, lowest sha1 first (the photo's content
  hash, so the choice is deterministic and owes nothing to names or order); the rest are train.
  A type already over its share (after drops) keeps its test photos and gets no new ones.
With no split.json yet this is the D4 rule: the lowest sha1s are test.

Oversampling (D2e, for augment.py): a type with fewer than 20 train photos gets the factor
ceil(20 / train), so each of its photos is drawn that many times an epoch and the type gives at
least 20 samples; 1 otherwise. Recorded per type as "oversample".

The test set is locked: it is never used for the gallery or the linear layer, only to measure
them, and augment.py never touches it. split.json is committed; running this again prints how
many photos changed sides against the committed file (0 by construction since D2e).

    python images/split.py          # write split.json
    python images/split.py --check  # only compare with the committed split.json; write nothing
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import auto_filter  # noqa: E402

IMAGES_DIR = Path(__file__).resolve().parent
SPLIT_JSON = IMAGES_DIR / "split.json"
TEST_SHARE = 0.2
MIN_TEST = 2
THIN_BELOW = 5
MIN_SAMPLES = 20      # D2e: train samples per type per epoch, through oversampling
OWNER_SOURCE = "owner"  # manifest source of the owner's own photos: train only


def test_size(kept: int) -> int:
    return 0 if kept < THIN_BELOW else max(MIN_TEST, round(TEST_SHARE * kept))


def split_type(sha1s: list[str], prior: dict[str, str] | None = None,
               train_only: set[str] | frozenset = frozenset()) -> tuple[list[str], list[str]]:
    """(train, test) for one type's kept photos. `prior` is sha1 -> "train" or "test" from the
    committed split; `train_only` are photos that may never be test."""
    prior = prior or {}
    ordered = sorted(set(sha1s))
    locked_test = [s for s in ordered if prior.get(s) == "test" and s not in train_only]
    candidates = [s for s in ordered if s not in prior and s not in train_only]
    test = set(locked_test) | set(candidates[:max(0, test_size(len(ordered)) - len(locked_test))])
    return [s for s in ordered if s not in test], sorted(test)


def oversample(train: int) -> int:
    return math.ceil(MIN_SAMPLES / train) if 0 < train < MIN_SAMPLES else 1


def sides(split: dict) -> dict[str, str]:
    return {s: name for t in split.get("types", {}).values() for name in ("train", "test") for s in t[name]}


def build(manifest: list[dict], labels: list[dict], prior: dict | None = None) -> dict:
    kept = auto_filter.kept_by_type(manifest, labels)
    names = {m["qid"]: m["english_name"] for m in manifest}
    owner = {m["sha1"] for m in manifest if m.get("source") == OWNER_SOURCE}
    before = sides(prior or {})
    types, thin = {}, []
    for qid in sorted(kept, key=lambda q: int(q[1:])):
        train, test = split_type(kept[qid], before, owner)
        types[qid] = {"english_name": names[qid], "train": train, "test": test, "oversample": oversample(len(train))}
        own = sum(1 for s in train if s in owner)
        if own:
            types[qid]["owner_train"] = own
        if not test:
            thin.append({"qid": qid, "english_name": names[qid], "kept": len(train)})
    return {
        "rule": (f"kept photos only; per type round({TEST_SHARE:.0%}) of the kept photos are test, at least {MIN_TEST}; "
                 f"a type with fewer than {THIN_BELOW} kept photos and no test photo is all train (thin). Sticky: a photo "
                 "in the committed split keeps its side; the owner's own photos are always train; new photos fill "
                 "the test share lowest sha1 first. oversample = ceil(20 / train) for a type with fewer than 20 "
                 "train photos, else 1. The test set is locked: never used for the gallery or the linear layer, "
                 "never augmented."),
        "counts": {"types": len(types), "train": sum(len(t["train"]) for t in types.values()),
                   "test": sum(len(t["test"]) for t in types.values()), "thin_types": len(thin),
                   "types_without_kept_photos": len({m["qid"] for m in manifest} - set(kept)),
                   "owner_train": sum(t.get("owner_train", 0) for t in types.values()),
                   "oversampled_types": sum(1 for t in types.values() if t["oversample"] > 1)},
        "thin": thin,
        "types": types,
    }


def moved(old: dict, new: dict) -> dict:
    """Photos in both splits that changed sides."""
    a, b = sides(old), sides(new)
    both = set(a) & set(b)
    return {"train_to_test": sum(1 for s in both if a[s] == "train" and b[s] == "test"),
            "test_to_train": sum(1 for s in both if a[s] == "test" and b[s] == "train"),
            "left": len(set(a) - set(b)), "new": len(set(b) - set(a))}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Write the locked train/test split of the kept photos.")
    parser.add_argument("--check", action="store_true", help="compare with the committed split.json; write nothing")
    args = parser.parse_args(argv)
    old = json.loads(SPLIT_JSON.read_text(encoding="utf-8")) if SPLIT_JSON.exists() else {}
    new = build(auto_filter.read_manifest(), auto_filter.read_labels(), old)
    change = moved(old, new) if old else None
    if not args.check:
        SPLIT_JSON.write_text(json.dumps(new, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"counts": new["counts"], "thin": len(new["thin"]), "changed_against_committed": change},
                     ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
