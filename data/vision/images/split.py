"""D4: the locked train/test split of the kept photos.

Kept photos: a photo of manifest.csv whose decision in labels.csv is keep. The owner's latest
decision wins, then the auto-filter's; a photo with neither counts as keep, as on the review page
(auto_filter.effective). Drop and not sure are left out.

Per type: with 5 or more kept photos, the test set is the round(20 %) of them with the lowest sha1
(the photo's content hash, so the choice is deterministic and owes nothing to names or order), at
least 2; the rest is train. A type with fewer than 5 kept photos goes entirely to train and is
listed as thin.

The test set is locked: it is never used for the gallery or the linear layer, only to measure
them. split.json is committed; running this again after labels.csv or the manifest changes prints
how many photos changed sides against the committed file, so a photo that trained never moves
into test unnoticed.

    python images/split.py          # write split.json
    python images/split.py --check  # only compare with the committed split.json; write nothing
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import auto_filter  # noqa: E402

IMAGES_DIR = Path(__file__).resolve().parent
SPLIT_JSON = IMAGES_DIR / "split.json"
TEST_SHARE = 0.2
MIN_TEST = 2
THIN_BELOW = 5


def split_type(sha1s: list[str]) -> tuple[list[str], list[str]]:
    """(train, test) for one type's kept photos."""
    ordered = sorted(set(sha1s))
    if len(ordered) < THIN_BELOW:
        return ordered, []
    k = max(MIN_TEST, round(TEST_SHARE * len(ordered)))
    return sorted(ordered[k:]), ordered[:k]


def build(manifest: list[dict], labels: list[dict]) -> dict:
    kept = auto_filter.kept_by_type(manifest, labels)
    names = {m["qid"]: m["english_name"] for m in manifest}
    types, thin = {}, []
    for qid in sorted(kept, key=lambda q: int(q[1:])):
        train, test = split_type(kept[qid])
        types[qid] = {"english_name": names[qid], "train": train, "test": test}
        if not test:
            thin.append({"qid": qid, "english_name": names[qid], "kept": len(train)})
    return {
        "rule": (f"kept photos only; per type the round({TEST_SHARE:.0%}) lowest sha1s are test, at least "
                 f"{MIN_TEST}; a type with fewer than {THIN_BELOW} kept photos is all train (thin). The test set is "
                 "locked: never used for the gallery or the linear layer."),
        "counts": {"types": len(types), "train": sum(len(t["train"]) for t in types.values()),
                   "test": sum(len(t["test"]) for t in types.values()), "thin_types": len(thin),
                   "types_without_kept_photos": len({m["qid"] for m in manifest} - set(kept))},
        "thin": thin,
        "types": types,
    }


def moved(old: dict, new: dict) -> dict:
    """Photos in both splits that changed sides."""
    def side(split: dict) -> dict[str, str]:
        return {s: name for t in split.get("types", {}).values() for name in ("train", "test") for s in t[name]}
    a, b = side(old), side(new)
    both = set(a) & set(b)
    return {"train_to_test": sum(1 for s in both if a[s] == "train" and b[s] == "test"),
            "test_to_train": sum(1 for s in both if a[s] == "test" and b[s] == "train"),
            "left": len(set(a) - set(b)), "new": len(set(b) - set(a))}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Write the locked train/test split of the kept photos.")
    parser.add_argument("--check", action="store_true", help="compare with the committed split.json; write nothing")
    args = parser.parse_args(argv)
    new = build(auto_filter.read_manifest(), auto_filter.read_labels())
    old = json.loads(SPLIT_JSON.read_text(encoding="utf-8")) if SPLIT_JSON.exists() else {}
    change = moved(old, new) if old else None
    if not args.check:
        SPLIT_JSON.write_text(json.dumps(new, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"counts": new["counts"], "thin": len(new["thin"]), "changed_against_committed": change},
                     ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
