"""V1b: measure the type and banned rules on the TRAIN split, to choose app/thresholds.json.

    services/vision/.venv/Scripts/python.exe services/vision/eval/calibrate.py [--out calibration.json]

Every kept train photo of a type with a text pin is read by app.pins.read exactly as a scan reads
it, except that it can't vote for itself: its own gallery row, and any gallery photo that is the
same picture (cosine 0.995 or more), are left out ("leave one out"). The test split is never read
here; it only measures the chosen values (run_eval.py --local).

For each banned_min it prints how many not-allowed photos the gate catches and how many allowed
photos it would reject; for each type_min_confidence, how many allowed photos would be allowed,
how many of those have the right type, and how many not-allowed photos would be allowed (leaks)
with the chosen banned_min. Only the pin rules are counted: clear nudity, the policy check's own
rejections and the hood rule can only turn more photos away, so these leak counts are an upper bound.
Needs app/vocabulary.npz, app/gallery.npz and the embedding cache build_pins.py made.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

SERVICE = Path(__file__).resolve().parents[1]
REPO = SERVICE.parents[1]
sys.path.insert(0, str(SERVICE))
sys.path.insert(0, str(REPO / "data" / "vision" / "embed"))

from app import config, pins as type_pins  # noqa: E402
import build_pins  # noqa: E402

SAME_PICTURE = 0.995
BANNED_GRID = [round(x, 2) for x in np.arange(0.05, 0.81, 0.05)]
TYPE_GRID = [round(x, 2) for x in np.arange(0.20, 0.96, 0.05)]


def leave_one_out(pins: type_pins.Pins, th: type_pins.Thresholds, rows: list[tuple[str, str, bool]],
                  embeddings: dict[str, np.ndarray], gallery_index: dict[str, int]) -> list[dict]:
    out = []
    index = {t.qid: i for i, t in enumerate(pins.types)}
    for sha1, qid, allowed in rows:
        e = embeddings[sha1].astype(np.float32)
        e = e / np.linalg.norm(e)
        same = np.flatnonzero(pins.gallery @ e >= SAME_PICTURE)
        own = gallery_index.get(sha1)
        exclude = np.union1d(same, [own] if own is not None else [])
        r = type_pins.read(e, pins, th, exclude=exclude.astype(np.int64))
        top3 = [t["qid"] for t in r.top_types[:3]]
        out.append({"sha1": sha1, "qid": qid, "allowed": allowed, "type": r.type.qid, "type_allowed": r.type.allowed,
                    "confidence": r.confidence, "agreement": r.agreement, "banned": r.banned_score,
                    "banned_text": r.banned_text, "banned_gallery": r.banned_gallery,
                    "text_ok": r.text_type.qid == qid, "gallery_ok": r.gallery_type is not None and r.gallery_type.qid == qid,
                    "top3_ok": qid in top3, "own_index": index[qid]})
    return out


def table(reads: list[dict], banned_min: float) -> dict:
    a = [r for r in reads if r["allowed"]]
    n = [r for r in reads if not r["allowed"]]
    gate = {b: {"catches_not_allowed": round(np.mean([r["banned"] >= b for r in n]), 4),
                "rejects_allowed": round(np.mean([r["banned"] >= b for r in a]), 4)} for b in BANNED_GRID}

    def allowed_by(r, t):
        return r["banned"] < banned_min and r["type_allowed"] and r["agreement"] and r["confidence"] >= t

    types = {}
    for t in TYPE_GRID:
        passed = [r for r in a if allowed_by(r, t)]
        types[t] = {"allowed_photos_allowed": round(len(passed) / len(a), 4),
                    "right_type_among_allowed": round(np.mean([r["type"] == r["qid"] for r in passed]), 4) if passed else None,
                    "leaks": int(sum(allowed_by(r, t) for r in n))}
    return {"photos": len(reads), "allowed": len(a), "not_allowed": len(n),
            "text_top1": round(np.mean([r["text_ok"] for r in reads]), 4),
            "text_top3": round(np.mean([r["top3_ok"] for r in reads]), 4),
            "gallery_top1": round(np.mean([r["gallery_ok"] for r in reads]), 4),
            "type_top1": round(np.mean([r["type"] == r["qid"] for r in reads]), 4),
            "agreement": round(np.mean([r["agreement"] for r in reads]), 4),
            "gate": gate, "type_min_confidence": types}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--banned-min", type=float, help="banned_min for the leak column (default thresholds.json)")
    ap.add_argument("--out", type=Path, help="write the full table and every photo's reading here")
    args = ap.parse_args(argv)
    pins = type_pins.load()
    th = type_pins.Thresholds.load()
    split = json.loads(build_pins.SPLIT_JSON.read_text(encoding="utf-8"))
    qids = [t.qid for t in pins.types]
    rows, _ = build_pins.gallery_rows(split, qids, [t.allowed for t in pins.types])
    gallery = np.load(type_pins.GALLERY_PINS_FILE, allow_pickle=False)
    gallery_index = {str(s): i for i, s in enumerate(gallery["sha1"])}
    embeddings = build_pins.load_cache(build_pins.cache_path(config.MODEL_REVISION))
    reads = leave_one_out(pins, th, rows, embeddings, gallery_index)
    result = table(reads, args.banned_min if args.banned_min is not None else th.banned_min)
    print(json.dumps({k: v for k, v in result.items() if k not in ("gate", "type_min_confidence")}, indent=1))
    print("banned_min | catches not allowed | rejects allowed")
    for b, g in result["gate"].items():
        print(f"{b:.2f} | {g['catches_not_allowed']:.3f} | {g['rejects_allowed']:.3f}")
    print(f"type_min_confidence (banned_min {args.banned_min or th.banned_min}) | allowed photos allowed | right type | leaks")
    for t, g in result["type_min_confidence"].items():
        print(f"{t:.2f} | {g['allowed_photos_allowed']:.3f} | {g['right_type_among_allowed']} | {g['leaks']}")
    if args.out:
        args.out.write_text(json.dumps({"summary": result, "reads": reads}, indent=1, default=lambda o: o.item()), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
