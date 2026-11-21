"""V2: the vision service's linear head, services/vision/app/linear.npz, trained on this PC's CPU.

A logistic-regression head over the 768-number photo embeddings (the same embeddings a scan makes)
that gives each type a probability. It learns from the TRAIN split only: a test photo is never a
training sample (asserted), and augment.py refuses one too. The thin types get more samples:

- a type with fewer than 20 kept photos (train and test together): each train photo is the photo
  itself plus augmented copies (images/augment.py's pipeline, seeded by the photo's sha1), so it is
  drawn split.json's "oversample" times, at most 8 (CAP);
- any other type whose oversample is above 1 (fewer than 20 train photos): its photos count that
  many times (sample weight), at most 8, with no augmentation.

Three steps, two Pythons (Albumentations is in data/vision's, torch in the service's):

    data/vision/.venv/Scripts/python.exe data/vision/embed/train_linear.py augment
    services/vision/.venv/Scripts/python.exe data/vision/embed/train_linear.py embed [--max-minutes 9]
    services/vision/.venv/Scripts/python.exe data/vision/embed/train_linear.py train [--max-minutes 9]

- augment: writes the augmented copies as PNG (224 x 224, the model's input size) into
  images/raw/augmented/ (not committed) with samples.csv; resumable.
- embed: embeds them exactly as a scan embeds a photo (app.fetch.open_image, app.model.preprocess,
  app.model.embed_tensors), cached in images/raw/embeddings/ (not committed); resumable.
- train: 5-fold cross-fitting first (folds by photo; a photo, its augmented copies and any train
  photo that is the same picture, cosine 0.995 or more, share a fold), for each L2 strength in
  LAMBDAS; each fold's out-of-fold probabilities of the train photos go to images/raw/linear_cv/
  (resumable). The L2 strength with the lowest out-of-fold log loss is chosen; the head is then
  trained on every sample and written to services/vision/app/linear.npz (weights and bias float16,
  the class qids, the training set's sha256), and pins.json gets the linear_* keys the service
  checks at start-up. The out-of-fold probabilities of the chosen strength go to
  images/raw/linear_oof.npz: services/vision/eval/calibrate.py reads the train photos through them,
  so no photo is ever scored by a head that learned from it.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import sys
import time
from collections import Counter
from pathlib import Path

import numpy as np

EMBED_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(EMBED_DIR))
import build_pins  # noqa: E402  (numpy and Pillow; the model loads only in the embed and train steps)

IMAGES = build_pins.IMAGES
AUG_DIR = IMAGES / "raw" / "augmented"
SAMPLES_CSV = AUG_DIR / "samples.csv"
CV_DIR = IMAGES / "raw" / "linear_cv"
OOF_NPZ = IMAGES / "raw" / "linear_oof.npz"
LINEAR_NPZ = build_pins.APP_DIR / "linear.npz"

THIN_KEPT = 20        # types under 20 kept photos get augmented copies
CAP = 8               # at most 8 samples (or a weight of 8) per train photo
FOLDS = 5
SAME_PICTURE = 0.995  # train photos this similar are one picture: one fold
LAMBDAS = (1e-7, 3e-7, 1e-6, 3e-6, 1e-5, 3e-5, 1e-4, 3e-4, 1e-3)  # wide enough that the best one isn't at an end
MAX_ITER = 300
SAMPLE_COLUMNS = ["key", "sha1", "qid", "copy", "file"]
# What the head is; part of the training set's sha256.
RECIPE = ("v2: multinomial logistic regression on unit image embeddings, L2 on the weights, L-BFGS; "
          "types under 20 kept: photo + augmented copies (images/augment.py, seed = first 8 hex of sha1), "
          "oversample capped at 8; other oversampled types: sample weight capped at 8")


# --- the training set (no model, no torch: tested) -------------------------------------------------

def thin_types(split: dict) -> set[str]:
    return {q for q, t in split["types"].items() if len(t["train"]) + len(t["test"]) < THIN_KEPT}


def copies_of(split: dict, qid: str) -> int:
    """How many samples one train photo of [qid] gives (itself included), at most CAP."""
    return max(1, min(int(split["types"][qid].get("oversample", 1)), CAP))


def augment_plan(split: dict, pin_qids: list[str]) -> list[tuple[str, str, int]]:
    """(sha1, qid, copy) for every augmented copy to make: copies 1..n-1 of each train photo of a
    thin type with a text pin. Never a test photo."""
    locked = build_pins.locked_test_sha1s(split)
    pinned = set(pin_qids)
    plan = []
    for qid in sorted(thin_types(split) & pinned):
        for sha1 in sorted(split["types"][qid]["train"]):
            if sha1 in locked:
                raise ValueError(f"{sha1} is a test photo and can't be augmented")
            plan += [(sha1, qid, c) for c in range(1, copies_of(split, qid))]
    return plan


def training_samples(split: dict, pin_qids: list[str]) -> list[tuple[str, str, str, float]]:
    """(key, sha1, qid, weight): every train photo of a type with a text pin (key = its sha1), then
    its augmented copies (key sha1#copy) when its type is thin. Asserts no test photo gets in."""
    locked = build_pins.locked_test_sha1s(split)
    thin = thin_types(split)
    pinned = set(pin_qids)
    out = []
    for qid in sorted(q for q in split["types"] if q in pinned):
        n = copies_of(split, qid)
        for sha1 in sorted(split["types"][qid]["train"]):
            assert sha1 not in locked, f"{sha1} is a test photo: the linear head never learns from one"
            if qid in thin:
                out.append((sha1, sha1, qid, 1.0))
                out += [(f"{sha1}#{c}", sha1, qid, 1.0) for c in range(1, n)]
            else:
                out.append((sha1, sha1, qid, float(n)))
    return out


def classes_of(samples: list[tuple[str, str, str, float]], pin_qids: list[str]) -> list[str]:
    """The head's classes: the types with a training sample, in vocabulary.npz's order."""
    have = {q for _, _, q, _ in samples}
    return [q for q in pin_qids if q in have]


def training_set_sha256(samples: list[tuple[str, str, str, float]], split_sha256: str, model_revision: str,
                        version: str) -> str:
    payload = {"recipe": RECIPE, "split_sha256": split_sha256, "model_revision": model_revision,
               "vocabulary_version": version, "samples": sorted([k, q, w] for k, _, q, w in samples)}
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()


def fold_of(group_key: str) -> int:
    return int(hashlib.sha256(group_key.encode("ascii")).hexdigest()[:8], 16) % FOLDS


def picture_groups(sha1s: list[str], embeddings: np.ndarray) -> dict[str, str]:
    """sha1 -> its group's key (the lowest sha1 among the photos that are the same picture)."""
    parent = list(range(len(sha1s)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    e = build_pins.unit_rows(embeddings)
    for start in range(0, len(e), 1024):
        sims = e[start:start + 1024] @ e.T
        for a, b in zip(*np.nonzero(sims >= SAME_PICTURE)):
            i, j = find(start + int(a)), find(int(b))
            if i != j:
                parent[max(i, j)] = min(i, j)
    groups: dict[int, list[str]] = {}
    for i, s in enumerate(sha1s):
        groups.setdefault(find(i), []).append(s)
    return {s: min(members) for members in groups.values() for s in members}


# --- augment (data/vision's Python: Albumentations) -------------------------------------------------

def step_augment(args) -> int:
    from PIL import Image, ImageOps  # noqa: PLC0415

    import augment  # noqa: PLC0415  (images/augment.py)

    split = json.loads(build_pins.SPLIT_JSON.read_text(encoding="utf-8"))
    pin_qids = [str(q) for q in np.load(build_pins.VOCABULARY_NPZ, allow_pickle=False)["qid"]]
    plan = augment_plan(split, pin_qids)
    files = {m["sha1"]: m["file"] for m in build_pins.auto_filter.read_manifest()}
    AUG_DIR.mkdir(parents=True, exist_ok=True)
    by_photo: dict[str, list[tuple[str, int]]] = {}
    for sha1, qid, c in plan:
        by_photo.setdefault(sha1, []).append((qid, c))
    started, rows, made = time.monotonic(), [], 0
    for sha1, copies in by_photo.items():
        todo = [(q, c) for q, c in copies if not (AUG_DIR / f"{sha1}_{c}.png").exists()]
        if todo:
            with Image.open(IMAGES / files[sha1]) as im:
                rgb = np.asarray(ImageOps.exif_transpose(im).convert("RGB"))
            aug = augment.Augmenter(split, seed=int(sha1[:8], 16))  # refuses a test photo
            for qid, c in copies:  # every copy in order, so a copy is the same however often this runs
                image = aug(sha1, rgb)
                if (qid, c) in todo:
                    Image.fromarray(image).save(AUG_DIR / f"{sha1}_{c}.png", optimize=False)
                    made += 1
        rows += [{"key": f"{sha1}#{c}", "sha1": sha1, "qid": q, "copy": c, "file": f"{sha1}_{c}.png"} for q, c in copies]
    build_pins.write_csv(rows, SAMPLE_COLUMNS, SAMPLES_CSV)
    print(json.dumps({"thin_types": len(thin_types(split) & set(pin_qids)), "photos": len(by_photo),
                      "augmented_copies": len(plan), "made_now": made, "seconds": round(time.monotonic() - started)}))
    return 0


# --- embed and train (the service's Python: torch) ---------------------------------------------------

def aug_cache_path(model_revision: str) -> Path:
    return build_pins.CACHE_DIR / f"augmented-{model_revision[:12]}.npz"


def step_embed(args) -> int:
    import torch  # noqa: PLC0415

    _, config, fetch, model = build_pins._service()
    path = aug_cache_path(config.MODEL_REVISION)
    cache = build_pins.load_cache(path)
    rows = build_pins.read_csv(SAMPLES_CSV)
    todo = [r for r in rows if r["key"] not in cache]
    print(f"augmented copies {len(rows)}, cached {len(rows) - len(todo)}, to embed {len(todo)}", flush=True)
    if not todo:
        return 0
    torch.set_num_threads(args.threads)
    visual = model.create_open_clip(build_pins.model_dir_of(args.model_dir)).visual.eval()
    started, deadline = time.monotonic(), time.monotonic() + args.max_minutes * 60
    done = since_save = 0
    for at in range(0, len(todo), args.batch):
        batch = todo[at:at + args.batch]
        x = torch.stack([model.preprocess(fetch.open_image((AUG_DIR / r["file"]).read_bytes())) for r in batch])
        cache.update({r["key"]: v for r, v in zip(batch, model.embed_tensors(visual, x))})
        done += len(batch)
        since_save += len(batch)
        if since_save >= 512:
            build_pins.save_cache(path, cache, config.MODEL_REVISION)
            since_save = 0
            print(f"  {done}/{len(todo)} ({done / (time.monotonic() - started):.1f} a second)", flush=True)
        if time.monotonic() > deadline:
            break
    build_pins.save_cache(path, cache, config.MODEL_REVISION)
    print(json.dumps({"embedded": done, "cached": len(cache), "left": len(todo) - done,
                      "seconds": round(time.monotonic() - started)}), flush=True)
    return 0


def fit(x: np.ndarray, y: np.ndarray, w: np.ndarray, classes: int, lam: float, max_iter: int = MAX_ITER):
    """Weighted multinomial logistic regression with L2 on the weights (not the bias), full-batch
    L-BFGS. Returns (W: dims x classes, b: classes), float32."""
    import torch  # noqa: PLC0415

    X, Y = torch.from_numpy(x.astype(np.float32)), torch.from_numpy(y.astype(np.int64))
    sw = torch.from_numpy((w / w.sum()).astype(np.float32))
    W = torch.zeros(x.shape[1], classes, requires_grad=True)
    b = torch.zeros(classes, requires_grad=True)
    opt = torch.optim.LBFGS([W, b], lr=1.0, max_iter=max_iter, history_size=20, line_search_fn="strong_wolfe",
                            tolerance_grad=1e-6, tolerance_change=1e-9)

    def closure():
        opt.zero_grad()
        loss = (torch.nn.functional.cross_entropy(X @ W + b, Y, reduction="none") * sw).sum() + 0.5 * lam * (W * W).sum()
        loss.backward()
        return loss

    opt.step(closure)
    return W.detach().numpy(), b.detach().numpy()


def predict(x: np.ndarray, W: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Probabilities as the service computes them: float16 weights, float32 arithmetic."""
    logits = x.astype(np.float32) @ W.astype(np.float16).astype(np.float32) + b.astype(np.float16).astype(np.float32)
    logits -= logits.max(axis=1, keepdims=True)
    p = np.exp(logits)
    return p / p.sum(axis=1, keepdims=True)


def step_train(args) -> int:
    import torch  # noqa: PLC0415

    _, config, _, _ = build_pins._service()
    torch.set_num_threads(args.threads)
    qids, _, _, version = build_pins.read_pins()
    split = json.loads(build_pins.SPLIT_JSON.read_text(encoding="utf-8"))
    split_sha = build_pins.sha256_file(build_pins.SPLIT_JSON)
    samples = training_samples(split, qids)
    classes = classes_of(samples, qids)
    cls = {q: i for i, q in enumerate(classes)}
    photos = build_pins.load_cache(build_pins.cache_path(config.MODEL_REVISION))
    copies = build_pins.load_cache(aug_cache_path(config.MODEL_REVISION))
    missing = [k for k, s, _, _ in samples if (photos if k == s else copies).get(k) is None]
    if missing:
        sys.exit(f"{len(missing)} samples have no embedding: run the augment and embed steps first")
    x = build_pins.unit_rows(np.stack([(photos if k == s else copies)[k] for k, s, _, _ in samples]))
    y = np.array([cls[q] for _, _, q, _ in samples])
    w = np.array([wt for _, _, _, wt in samples], dtype=np.float32)
    originals = [i for i, (k, s, _, _) in enumerate(samples) if k == s]
    row_of = {i: r for r, i in enumerate(originals)}  # sample index -> row among the train photos
    train_sha1s = [samples[i][1] for i in originals]
    groups = picture_groups(train_sha1s, x[originals])
    folds = np.array([fold_of(groups[s]) for _, s, _, _ in samples])
    tset = training_set_sha256(samples, split_sha, config.MODEL_REVISION, version)
    print(json.dumps({"samples": len(samples), "train_photos": len(originals), "augmented": len(samples) - len(originals),
                      "classes": len(classes), "weighted_photos": int(sum(1 for _, _, _, wt in samples if wt > 1)),
                      "same_picture_groups_merged": len(train_sha1s) - len(set(groups.values())),
                      "fold_photos": dict(Counter(int(folds[i]) for i in originals)), "training_set_sha256": tset}), flush=True)

    CV_DIR.mkdir(parents=True, exist_ok=True)
    deadline = time.monotonic() + args.max_minutes * 60
    scores = {}
    for lam in args.lambdas:
        oof = np.zeros((len(originals), len(classes)), dtype=np.float32)
        complete = True
        for f in range(FOLDS):
            part = CV_DIR / f"{tset[:12]}_l{lam:g}_f{f}.npy"
            held = np.array([i for i in originals if folds[i] == f])
            rows = np.array([row_of[i] for i in held], dtype=int)
            if not part.exists():
                if time.monotonic() > deadline:
                    complete = False
                    continue
                t0 = time.monotonic()
                fit_on = folds != f
                W, b = fit(x[fit_on], y[fit_on], w[fit_on], len(classes), lam, args.max_iter)
                np.save(part, predict(x[held], W, b).astype(np.float32))
                print(f"  lambda {lam:g} fold {f}: {time.monotonic() - t0:.0f} s", flush=True)
            oof[rows] = np.load(part)
        if not complete:
            print(f"  lambda {lam:g}: not every fold yet; run train again", flush=True)
            continue
        truth = y[originals]
        p_true = np.clip(oof[np.arange(len(originals)), truth], 1e-12, 1.0)
        scores[lam] = {"log_loss": float(-np.log(p_true).mean()), "top1": float((oof.argmax(1) == truth).mean()),
                       "top3": float(np.mean([t in np.argsort(-r)[:3] for r, t in zip(oof, truth)]))}
        print(f"  lambda {lam:g}: out-of-fold log loss {scores[lam]['log_loss']:.4f}, top-1 {scores[lam]['top1']:.4f}, "
              f"top-3 {scores[lam]['top3']:.4f}", flush=True)
    if len(scores) < len(args.lambdas):
        return 3
    best = min(scores, key=lambda lam: scores[lam]["log_loss"])
    oof = np.zeros((len(originals), len(classes)), dtype=np.float32)
    for f in range(FOLDS):
        rows = np.array([row_of[i] for i in originals if folds[i] == f], dtype=int)
        if len(rows):
            oof[rows] = np.load(CV_DIR / f"{tset[:12]}_l{best:g}_f{f}.npy")
    np.savez(OOF_NPZ, sha1=np.array(train_sha1s), qid=np.array([samples[i][2] for i in originals]),
             classes=np.array(classes), probabilities=oof.astype(np.float16), fold=folds[originals],
             training_set_sha256=np.array(tset), l2=np.array(best))
    t0 = time.monotonic()
    W, b = fit(x, y, w, len(classes), best, args.max_iter)
    np.savez_compressed(LINEAR_NPZ, weights=W.T.astype(np.float16), bias=b.astype(np.float16), qid=np.array(classes),
                        training_set_sha256=np.array(tset), vocabulary_version=np.array(version),
                        split_sha256=np.array(split_sha), model_revision=np.array(config.MODEL_REVISION),
                        l2=np.array(best), recipe=np.array(RECIPE))
    pins = json.loads(build_pins.PINS_JSON.read_text(encoding="utf-8"))
    if pins.get("vocabulary_version") != version or pins.get("split_sha256") != split_sha:
        sys.exit("pins.json is for other pins or another split: run build_pins.py gallery first")
    pins.update({"linear_sha256": build_pins.sha256_file(LINEAR_NPZ), "linear_training_sha256": tset,
                 "linear_classes": len(classes), "linear_samples": len(samples),
                 "linear_augmented": len(samples) - len(originals), "linear_l2": best})
    build_pins.PINS_JSON.write_text(json.dumps(pins, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"l2": best, "cross_fit": scores, "final_fit_seconds": round(time.monotonic() - t0),
                      "file": str(LINEAR_NPZ), "bytes": LINEAR_NPZ.stat().st_size,
                      "linear_sha256": pins["linear_sha256"]}, indent=1))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Train the vision service's linear head.")
    sub = parser.add_subparsers(dest="step", required=True)
    sub.add_parser("augment")
    for name in ("embed", "train"):
        p = sub.add_parser(name)
        p.add_argument("--model-dir", help="the pinned model files (default VISION_MODEL_DIR)")
        p.add_argument("--threads", type=int, default=max(1, (os.cpu_count() or 2) - 1), help="torch threads")
        p.add_argument("--max-minutes", type=float, default=9.0, help="stop cleanly after this long")
    sub.choices["embed"].add_argument("--batch", type=int, default=32)
    sub.choices["train"].add_argument("--lambdas", type=float, nargs="+", default=list(LAMBDAS))
    sub.choices["train"].add_argument("--max-iter", type=int, default=MAX_ITER)
    args = parser.parse_args(argv)
    if args.step == "augment":
        sys.path.insert(0, str(IMAGES))
    return {"augment": step_augment, "embed": step_embed, "train": step_train}[args.step](args)


if __name__ == "__main__":
    sys.exit(main())
