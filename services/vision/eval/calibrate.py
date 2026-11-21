"""V1b, V2: measure the type and banned rules on the TRAIN split, to choose app/thresholds.json.

    services/vision/.venv/Scripts/python.exe services/vision/eval/calibrate.py [--model-dir DIR] [--out calibration.json]

Every kept train photo of a type with a text pin is read exactly as a scan reads it (app.pins.read),
except that nothing that learned from it may score it:
- the gallery: its own row, and any gallery photo that is the same picture (cosine 0.995 or more),
  are left out ("leave one out", as in V1b);
- the linear head: its probabilities come from the cross-fitting heads that never saw it
  (data/vision/embed/train_linear.py writes them to images/raw/linear_oof.npz; the photo, its
  augmented copies and its same-picture twins were in the held-out fold).
The test split is never read here; it only measures the chosen values (run_eval.py --local).

V2 chooses, in this order:
1. text_poster_min: the lowest value (0.05 steps) at which at most 1 % of allowed train photos read
   as text or a poster (those go to review);
2. for every weight triple (text, gallery, linear; 0.1 steps, adding up to 1) and both banned
   rules (max, combined):
   - banned_hard: the lowest value (0.01 steps) at which at most 1 % of allowed train photos would
     be rejected outright by the gate;
   - for each banned_min (0.05 steps up to banned_hard): type_min_confidence is the next 0.05 above
     the highest confidence of any not-allowed train photo that would otherwise be allowed (under
     banned_min, agreeing on an allowed mapping), so no not-allowed train photo is allowed;
   - the banned_min that allows the most allowed train photos;
3. the weights and rule that allow the most allowed train photos (ties: the better mapping top-1).
Only the pin rules, the gate and text-or-poster are counted: clear nudity, the policy check's own
rejections and the hood rule can only turn more photos away, so the leak counts are an upper bound.
Needs app/vocabulary.npz, app/gallery.npz, app/linear.npz, images/raw/linear_oof.npz, the embedding
cache build_pins.py made and the model folder's text_embeddings.npz (for the text-or-poster labels).
"""

from __future__ import annotations

import argparse
import itertools
import json
import os
import sys
from pathlib import Path

import numpy as np

SERVICE = Path(__file__).resolve().parents[1]
REPO = SERVICE.parents[1]
sys.path.insert(0, str(SERVICE))
sys.path.insert(0, str(REPO / "data" / "vision" / "embed"))

from app import config, pins as type_pins  # noqa: E402
import build_pins  # noqa: E402
import train_linear  # noqa: E402

SAME_PICTURE = 0.995
ALLOWED_REJECTED_MAX = 0.01   # at most 1 % of allowed train photos rejected outright by the gate
TEXT_POSTER_ALLOWED_MAX = 0.01
WEIGHT_STEP = 0.1
BANNED_MIN_GRID = [round(x, 2) for x in np.arange(0.05, 1.0, 0.05)]
TYPE_STEP = 0.05


def text_poster_shares(embeddings: np.ndarray, model_dir: Path) -> np.ndarray:
    """Each photo's text-or-poster share of the policy labels (scan.item_scores, without the model)."""
    from app.scan import TextBank, item_scores  # noqa: PLC0415
    from app.vocab import TEXT_OR_POSTER  # noqa: PLC0415

    data = np.load(model_dir / config.TEXT_EMBEDDINGS_FILE)
    banks = {n: TextBank(keys=[str(k) for k in data[f"{n}_keys"]], matrix=data[f"{n}_matrix"])
             for n in ("items", "details", "general")}
    return np.array([sum(item_scores(e, banks).items.get(k, 0.0) for k in TEXT_OR_POSTER) for e in embeddings])


def inputs(pins: type_pins.Pins, th: type_pins.Thresholds, model_dir: Path) -> dict:
    """Every train photo's text probabilities, leave-one-out gallery vote and out-of-fold linear
    probabilities (type order), its own type and the text-or-poster share."""
    split = json.loads(build_pins.SPLIT_JSON.read_text(encoding="utf-8"))
    qids = [t.qid for t in pins.types]
    index = {q: i for i, q in enumerate(qids)}
    rows, _ = build_pins.gallery_rows(split, qids, [t.allowed for t in pins.types])
    locked = build_pins.locked_test_sha1s(split)
    assert not any(s in locked for s, _, _ in rows), "a test photo reached calibration"
    gallery = np.load(type_pins.GALLERY_PINS_FILE, allow_pickle=False)
    gallery_index = {str(s): i for i, s in enumerate(gallery["sha1"])}
    cache = build_pins.load_cache(build_pins.cache_path(config.MODEL_REVISION))
    oof = np.load(train_linear.OOF_NPZ, allow_pickle=False)
    if str(oof["training_set_sha256"]) != pins.linear.training_sha256:
        sys.exit("linear_oof.npz is from another training set than app/linear.npz: run train_linear.py train again")
    oof_row = {str(s): i for i, s in enumerate(oof["sha1"])}
    oof_cols = np.array([index[str(q)] for q in oof["classes"]])
    n, t = len(rows), len(qids)
    e = build_pins.unit_rows(np.stack([cache[s] for s, _, _ in rows]))
    p_text = np.zeros((n, t), np.float32)
    p_gallery = np.zeros((n, t), np.float32)
    p_linear = np.zeros((n, t), np.float32)
    for i, (sha1, _, _) in enumerate(rows):
        p_text[i] = type_pins.softmax(th.text_logit_scale * (pins.text @ e[i]))
        same = np.flatnonzero(pins.gallery @ e[i] >= SAME_PICTURE)
        own = gallery_index.get(sha1)
        exclude = np.union1d(same, [own] if own is not None else []).astype(np.int64)
        for k, v in type_pins.gallery_vote(e[i], pins, th.gallery_k, exclude).items():
            p_gallery[i, k] = v
        p_linear[i, oof_cols] = oof["probabilities"][oof_row[sha1]].astype(np.float32)
    return {"rows": rows, "own": np.array([index[q] for _, q, _ in rows]), "allowed": np.array([a for _, _, a in rows]),
            "p_text": p_text, "p_gallery": p_gallery, "p_linear": p_linear,
            "has_votes": p_gallery.sum(axis=1) > 0, "text_poster": text_poster_shares(e, model_dir)}


def evaluate(x: dict, pins: type_pins.Pins, w: tuple[float, float, float], factor: float) -> dict:
    """The reading pins.read gives every photo for weights [w], vectorized."""
    a = np.zeros((len(pins.types), len(pins.mappings)), np.float32)
    a[np.arange(len(pins.types)), pins.mapping_of] = 1.0
    final = w[0] * x["p_text"] + w[1] * x["p_gallery"] + w[2] * x["p_linear"]
    m_text, m_gallery, m_final = x["p_text"] @ a, x["p_gallery"] @ a, final @ a
    text_m, gallery_m = m_text.argmax(1), np.where(x["has_votes"], m_gallery.argmax(1), -1)
    agree = text_m == gallery_m
    chosen_m = np.where(agree, text_m, m_final.argmax(1))
    rows = np.arange(len(final))
    conf = np.where(agree, m_final[rows, chosen_m], m_final[rows, chosen_m] * factor)
    masked = np.where(pins.mapping_of[None, :] == chosen_m[:, None], final, -1.0)
    chosen = masked.argmax(1)
    na = pins.not_allowed
    shares = np.stack([x["p_text"][:, na].sum(1), x["p_gallery"][:, na].sum(1), x["p_linear"][:, na].sum(1)], axis=1)
    mapping_allowed = np.array([m[2] for m in pins.mappings])[chosen_m]
    return {"agree": agree, "chosen_m": chosen_m, "conf": conf, "type": chosen, "mapping_allowed": mapping_allowed,
            "banned": {"max": shares.max(1), "combined": shares @ np.array(w, np.float32)},
            "type_top1": float(np.mean(chosen == x["own"])),
            "mapping_top1": float(np.mean(chosen_m == pins.mapping_of[x["own"]])),
            "agreement": float(np.mean(agree))}


def ceil_step(v: float, step: float) -> float:
    return round(np.floor(v / step + 1e-9) * step + step, 4)


def choose(x: dict, r: dict, rule: str, text_poster_min: float) -> dict:
    """banned_hard, banned_min and type_min_confidence for one reading (see the module doc)."""
    banned, allowed = r["banned"][rule], x["allowed"]
    ok_text = x["text_poster"] < text_poster_min
    hard = ceil_step(float(np.quantile(banned[allowed], 1 - ALLOWED_REJECTED_MAX)), 0.01) if allowed.any() else 1.0
    hard = min(hard, 1.0)
    best = None
    for soft in [b for b in BANNED_MIN_GRID if b <= hard] + ([hard] if hard not in BANNED_MIN_GRID else []):
        candidate = (banned < soft) & r["agree"] & r["mapping_allowed"] & ok_text
        leak_conf = r["conf"][candidate & ~allowed]
        type_min = ceil_step(float(leak_conf.max()), TYPE_STEP) if len(leak_conf) else TYPE_STEP
        passed = candidate & (r["conf"] >= type_min)
        assert not (passed & ~allowed).any()
        rate = float(passed[allowed].mean())
        if best is None or rate > best["allowed_rate"] + 1e-12:
            best = {"banned_hard": hard, "banned_min": soft, "type_min_confidence": type_min, "allowed_rate": rate,
                    "allowed_photos_allowed": int(passed[allowed].sum()),
                    "right_mapping_among_allowed": float(np.mean(r["chosen_m"][passed & allowed] ==
                                                         x["mapping_own"][passed & allowed])) if passed.any() else None,
                    "right_type_among_allowed": float(np.mean(r["type"][passed & allowed] == x["own"][passed & allowed]))
                    if passed.any() else None,
                    "highest_not_allowed_confidence": float(leak_conf.max()) if len(leak_conf) else None,
                    "rejected_outright_allowed": float(np.mean(banned[allowed] >= hard)),
                    "not_allowed_rejected": float(np.mean(banned[~allowed] >= hard)),
                    "not_allowed_review_by_gate": float(np.mean((banned[~allowed] >= soft) & (banned[~allowed] < hard))),
                    "allowed_review_by_gate": float(np.mean((banned[allowed] >= soft) & (banned[allowed] < hard))),
                    "leaks": 0}
    return best


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model-dir", help="the model folder with text_embeddings.npz (default VISION_MODEL_DIR)")
    ap.add_argument("--out", type=Path, help="write every combination's numbers here")
    args = ap.parse_args(argv)
    model_dir = Path(args.model_dir or os.environ.get("VISION_MODEL_DIR") or config.MODEL_DIR)
    pins = type_pins.load()
    th = type_pins.Thresholds.load()
    x = inputs(pins, th, model_dir)
    x["mapping_own"] = pins.mapping_of[x["own"]]
    allowed = x["allowed"]
    tp_grid = [round(v, 2) for v in np.arange(0.05, 1.0, 0.05)]
    text_poster_min = next((v for v in tp_grid if np.mean(x["text_poster"][allowed] >= v) <= TEXT_POSTER_ALLOWED_MAX), 1.0)
    header = {"photos": int(len(allowed)), "allowed": int(allowed.sum()), "not_allowed": int((~allowed).sum()),
                      "text_poster_min": text_poster_min,
                      "text_poster_allowed_share": float(np.mean(x["text_poster"][allowed] >= text_poster_min)),
                      "text_poster_not_allowed_share": float(np.mean(x["text_poster"][~allowed] >= text_poster_min)),
                      "linear_oof_top1": float(np.mean(x["p_linear"].argmax(1) == x["own"])),
                      "text_top1": float(np.mean(x["p_text"].argmax(1) == x["own"])),
                      "gallery_top1": float(np.mean(np.where(x["has_votes"], x["p_gallery"].argmax(1), -1) == x["own"]))}
    print(json.dumps(header, indent=1), flush=True)
    steps = int(round(1 / WEIGHT_STEP))
    results = []
    for i, j in itertools.product(range(steps + 1), repeat=2):
        if i + j > steps:
            continue
        w = (round(i * WEIGHT_STEP, 2), round(j * WEIGHT_STEP, 2), round((steps - i - j) * WEIGHT_STEP, 2))
        r = evaluate(x, pins, w, th.disagreement_factor)
        for rule in type_pins.BANNED_RULES:
            c = choose(x, r, rule, text_poster_min)
            results.append({"weights": w, "banned_rule": rule, "type_top1": r["type_top1"],
                            "mapping_top1": r["mapping_top1"], "agreement": r["agreement"], **c})
    results.sort(key=lambda c: (-c["allowed_rate"], -c["mapping_top1"]))
    best = results[0]
    no_linear = next(c for c in results if c["weights"][2] == 0)
    v1b_like = next(c for c in results if c["weights"] == (0.5, 0.5, 0.0) and c["banned_rule"] == "max")
    print("weights (text, gallery, linear) | rule | allowed train photos allowed | mapping top-1 | type top-1 | agreement"
          " | banned_hard | banned_min | type_min | highest not-allowed conf")
    for c in results[:15] + [no_linear, v1b_like]:
        print(f"{c['weights']} | {c['banned_rule']} | {c['allowed_rate']:.4f} ({c['allowed_photos_allowed']}) | "
              f"{c['mapping_top1']:.4f} | {c['type_top1']:.4f} | {c['agreement']:.4f} | {c['banned_hard']} | "
              f"{c['banned_min']} | {c['type_min_confidence']} | {c['highest_not_allowed_confidence']}")
    print("chosen:", json.dumps(best, indent=1))
    if args.out:
        args.out.write_text(json.dumps({"header": header, "text_poster_min": text_poster_min, "chosen": best, "best_without_linear": no_linear,
                                        "v1b_like": v1b_like, "all": results}, indent=1,
                                       default=lambda o: o.item() if hasattr(o, "item") else str(o)), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
