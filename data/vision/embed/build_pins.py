"""V1b, V2: the vision service's type pins, built on this PC's CPU with the service's own model code.

V2 changes: a text pin is the English name and its English aliases (no also_called), the
vocabulary version covers the pins' prompts, and the agree step's rule is looser (see agree).

Run with the vision service's Python (it has torch and open_clip), from the repo root, with
VISION_MODEL_DIR (or --model-dir) pointing at the pinned Marqo-FashionSigLIP files
(services/vision/app/config.py MODEL_FILES, revision MODEL_REVISION):

    services/vision/.venv/Scripts/python.exe data/vision/embed/build_pins.py embed [--max-minutes 9]
    services/vision/.venv/Scripts/python.exe data/vision/embed/build_pins.py text
    services/vision/.venv/Scripts/python.exe data/vision/embed/build_pins.py agree
    (then images/auto_filter.py and images/split.py, with the data/vision Python)
    services/vision/.venv/Scripts/python.exe data/vision/embed/build_pins.py gallery

- embed: every kept photo's image embedding, exactly as a scan makes it (app.fetch.open_image,
  app.model.preprocess, app.model.embed_tensors, the same weights), cached by sha1 in
  images/raw/embeddings/ (not committed). Resumable: --max-minutes stops cleanly and the next run
  goes on where it stopped.
- text: one text pin per vocabulary.json entry: the normalized mean of the embeddings of
  "a photo of a {name}" for its English name and its English aliases (V2: Wikidata's English
  aliases and D1's launch fallback names, those the entry's vocabulary has, at most 5; V1b used
  also_called, mostly other languages). Writes services/vision/app/vocabulary.npz (float16,
  committed) with each row's qid, english_name, dzirent_category, dzirent_item_type,
  dzirent_garment_type and allowed, and vocabulary_version (vocabulary_version below).
- agree: the model-agreement check, before the gallery, on kept photos from Openverse or a
  Commons search (manifest source openverse or search) with no owner decision. V2 rule: a photo
  agrees when any text pin with the same Dzirent mapping as its own type (dzirent_category and
  dzirent_garment_type) is among its top 5 text pins; otherwise it is model_disagrees. Every
  photo the last run marked model_disagrees is checked again with this rule (and any new photo);
  rows that passed before stay as they are. Writes images/model_agreement.csv (committed);
  auto_filter.py turns model_disagrees into an auto drop (labels.csv source auto) and drops it no
  more once a photo passes, so an owner decision always wins. Then split.py (sticky).
- gallery: one gallery pin per kept TRAIN photo of a type that has a text pin (never a test
  photo; the build refuses if one gets in). Writes services/vision/app/gallery.npz (float16, not
  committed: uploaded to the bucket under pins/<vocabulary_version>/ and fetched by Cloud Build)
  and services/vision/app/pins.json (committed: the versions and the gallery's sha256, which the
  service checks at start-up).
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import sys
import time
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np

EMBED_DIR = Path(__file__).resolve().parent
VISION_DATA = EMBED_DIR.parent
REPO = VISION_DATA.parents[1]
IMAGES = VISION_DATA / "images"
TAXONOMY = VISION_DATA / "taxonomy"
SERVICE = REPO / "services" / "vision"
VOCABULARY_JSON = TAXONOMY / "vocabulary.json"
SPLIT_JSON = IMAGES / "split.json"
AGREEMENT_CSV = IMAGES / "model_agreement.csv"
CACHE_DIR = IMAGES / "raw" / "embeddings"
APP_DIR = SERVICE / "app"
VOCABULARY_NPZ = APP_DIR / "vocabulary.npz"
GALLERY_NPZ = APP_DIR / "gallery.npz"
PINS_JSON = APP_DIR / "pins.json"

sys.path.insert(0, str(IMAGES))
sys.path.insert(0, str(TAXONOMY))
import auto_filter  # noqa: E402  (Pillow only)
import specs  # noqa: E402  (standard library only)

TAXONOMY_JSON = TAXONOMY / "taxonomy.json"
ROOTS_JSON = TAXONOMY / "roots.json"

# The backup bucket (data/vision/README.md, "Backup bucket"); pins go under pins/<vocabulary_version>/.
BUCKET = "dzirent-vision-data-dzirent"
TEMPLATE = "a photo of a {name}"
ALIAS_CAP = 5  # at most 5 English aliases a pin
# V2: what a text pin averages; part of vocabulary_version, so new prompts are a new version.
PIN_RECIPE = "v2: 'a photo of a {name}' for the English name and its English aliases (at most 5)"
AGREE_SOURCES = ("openverse", "search")
AGREE_TOP = 5  # V2: a pin of the photo's own mapping among the top 5 (V1b: its own type in the top 3)
AGREE_RULE = "v2_mapping_top5"
AGREE_RULE_V1B = "v1b_top3"
AGREEMENT_COLUMNS = ["sha1", "qid", "source", "own_rank", "top3", "model_disagrees", "vocabulary_version",
                     "rule", "top5", "mapping_rank"]
NO_VALUE = ("not_applicable", "none_fits", "")  # taxonomy placeholders: no database value


# --- small helpers (no model) ------------------------------------------------------------------

def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def read_entries(path: Path = VOCABULARY_JSON) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))["entries"]


def english_names(taxonomy_json: Path = TAXONOMY_JSON, roots_json: Path = ROOTS_JSON) -> dict[str, list[str]]:
    """qid -> the type's English names besides its label: Wikidata's English aliases, then D1's
    launch fallback names (specs.LAUNCH with roots.json's launch entries over it, as
    build_taxonomy.py merges them)."""
    roots = json.loads(roots_json.read_text(encoding="utf-8"))
    launch = {l["qid"]: {**specs.LAUNCH_BY_QID.get(l["qid"], {}), **l} for l in roots.get("launch", [])}
    out = {}
    for row in json.loads(taxonomy_json.read_text(encoding="utf-8")):
        out[row["qid"]] = [*row.get("aliases", []), *launch.get(row["qid"], {}).get("fallback_names", [])]
    return out


def english_aliases(entry: dict, english: dict[str, list[str]]) -> list[str]:
    """The entry's English aliases its vocabulary has, in order, without its English name or a
    repeat (case aside), at most ALIAS_CAP."""
    seen = {entry["english_name"].casefold()}
    vocabulary = set(entry["vocabulary"])
    out = []
    for name in english.get(entry["qid"], []):
        if name in vocabulary and name.casefold() not in seen:
            seen.add(name.casefold())
            out.append(name)
    return out[:ALIAS_CAP]


def pin_prompts(entry: dict, english: dict[str, list[str]] | None = None) -> list[str]:
    """The prompts one text pin averages: the English name, then its English aliases (at most 5)."""
    names = [entry["english_name"], *english_aliases(entry, english or {})]
    return [TEMPLATE.format(name=n) for n in names]


def vocabulary_version(path: Path = VOCABULARY_JSON, english: dict[str, list[str]] | None = None) -> str:
    """V2: the sha256 of vocabulary.json's sha256, PIN_RECIPE and every pin's prompts, so it changes
    whenever any type, name, mapping or prompt does (V1b: vocabulary.json's sha256 alone)."""
    english = english_names() if english is None else english
    entries = read_entries(path)
    payload = {"vocabulary_sha256": sha256_file(path), "recipe": PIN_RECIPE,
               "prompts": [[e["qid"], pin_prompts(e, english)] for e in entries]}
    return hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()


def agree_key(category: str | None, garment_type: str | None) -> tuple[str, str]:
    """V2: what the agree step compares: dzirent_category and dzirent_garment_type (blank for a type
    that isn't allowed)."""
    return ("" if category in (None, *NO_VALUE) else category, "" if garment_type in (None, *NO_VALUE) else garment_type)


def read_csv(path: Path) -> list[dict]:
    with open(path, encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def write_csv(rows: list[dict], columns: list[str], path: Path) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=columns, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    tmp.replace(path)


def kept_rows(manifest: list[dict], labels: list[dict]) -> list[dict]:
    """Manifest rows whose effective decision is keep (undecided counts as keep, as everywhere)."""
    eff = auto_filter.effective(labels)
    return [m for m in manifest if eff.get(m["sha1"], ("keep", ""))[0] == "keep"]


def owner_dropped(labels: list[dict]) -> set[str]:
    """The photos whose latest owner decision is drop."""
    eff = auto_filter.effective(labels)
    return {s for s, (d, src) in eff.items() if src == "owner" and d == "drop"}


def owner_dropped_rows(manifest: list[dict], labels: list[dict]) -> list[dict]:
    dropped = owner_dropped(labels)
    return [m for m in manifest if m["sha1"] in dropped]


def unit_rows(matrix: np.ndarray) -> np.ndarray:
    m = matrix.astype(np.float32)
    return m / np.linalg.norm(m, axis=1, keepdims=True)


def cache_path(model_revision: str) -> Path:
    return CACHE_DIR / f"fashionsiglip-{model_revision[:12]}.npz"


def load_cache(path: Path) -> dict[str, np.ndarray]:
    if not path.exists():
        return {}
    data = np.load(path, allow_pickle=False)
    return {str(s): v for s, v in zip(data["sha1"], data["embedding"])}


def save_cache(path: Path, cache: dict[str, np.ndarray], model_revision: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.stem + ".tmp.npz")
    sha1s = sorted(cache)
    np.savez(tmp, sha1=np.array(sha1s), embedding=np.stack([cache[s] for s in sha1s]).astype(np.float32),
             model_revision=np.array(model_revision))
    tmp.replace(path)


# --- the checks and the outputs (pure: tested without the model) ---------------------------------

def agreement_rows(manifest: list[dict], labels: list[dict], embeddings: dict[str, np.ndarray],
                   pin_qids: list[str], pins: np.ndarray, version: str, pin_keys: list[tuple[str, str]] | None = None,
                   previous: list[dict] | None = None) -> tuple[list[dict], Counter]:
    """model_agreement.csv's rows. [previous] is the file as it is: a row that passed (or whose type
    has no pin) is kept as it is; a photo it marked model_disagrees is checked again, as is a kept
    Openverse or search photo with no row yet; an owner-decided photo is never checked (its row, if
    any, stays). The check (V2): model_disagrees is no when a text pin with the same agree_key as the
    photo's own type is among its top 5 text pins, yes otherwise, blank when its type has no pin.
    [pin_keys] is each pin's agree_key (default: each pin its own key, the V1b-like own-type rule)."""
    owner_decided = {r["sha1"] for r in labels if auto_filter.is_owner(r)}
    index = {q: i for i, q in enumerate(pin_qids)}
    keys = pin_keys if pin_keys is not None else [(q, "") for q in pin_qids]
    pins = unit_rows(pins)
    previous_by = {r["sha1"]: r for r in (previous or [])}
    kept = {m["sha1"] for m in kept_rows(manifest, labels)}
    rows, skipped = [], Counter()
    for m in manifest:
        if m.get("source") not in AGREE_SOURCES:
            continue
        before = previous_by.get(m["sha1"])
        if before is not None and (before.get("model_disagrees") != "yes" or m["sha1"] in owner_decided):
            rows.append({**{c: before.get(c, "") for c in AGREEMENT_COLUMNS}, "rule": before.get("rule") or AGREE_RULE_V1B})
            skipped["kept_as_it_was"] += 1
            continue
        if before is None and m["sha1"] not in kept:
            continue
        if m["sha1"] in owner_decided:
            skipped["owner_decided"] += 1
            continue
        if m["sha1"] not in embeddings:
            skipped["no_embedding"] += 1
            if before is not None:
                rows.append({**{c: before.get(c, "") for c in AGREEMENT_COLUMNS}, "rule": before.get("rule") or AGREE_RULE_V1B})
            continue
        sims = pins @ embeddings[m["sha1"]].astype(np.float32)
        order = np.argsort(-sims, kind="stable")
        row = {"sha1": m["sha1"], "qid": m["qid"], "source": m["source"],
               "top3": ";".join(pin_qids[i] for i in order[:3]), "top5": ";".join(pin_qids[i] for i in order[:AGREE_TOP]),
               "vocabulary_version": version, "rule": AGREE_RULE}
        if m["qid"] not in index:
            skipped["type_without_pin"] += 1
            row.update(own_rank="", mapping_rank="", model_disagrees="")
        else:
            own = index[m["qid"]]
            same = np.array([keys[i] == keys[own] for i in order])
            mapping_rank = 1 + int(np.argmax(same))  # the own type always shares its key, so there is one
            row.update(own_rank=1 + int(np.sum(sims > sims[own])), mapping_rank=mapping_rank,
                       model_disagrees="yes" if mapping_rank > AGREE_TOP else "no")
            skipped["checked_again" if before is not None else "checked_new"] += 1
        rows.append(row)
    rows.sort(key=lambda r: (r["qid"], r["sha1"]))
    return rows, skipped


def locked_test_sha1s(split: dict) -> set[str]:
    return {s for t in split["types"].values() for s in t["test"]}


def gallery_rows(split: dict, pin_qids: list[str], allowed: list[bool]) -> tuple[list[tuple[str, str, bool]], Counter]:
    """(sha1, qid, allowed) for every train photo of a type with a text pin; never a test photo."""
    index = {q: i for i, q in enumerate(pin_qids)}
    locked = locked_test_sha1s(split)
    out, left_out = [], Counter()
    for qid in sorted(split["types"]):
        t = split["types"][qid]
        if qid not in index:
            left_out["train photos of types without a text pin"] += len(t["train"])
            continue
        for sha1 in sorted(t["train"]):
            if sha1 in locked:
                raise ValueError(f"{sha1} is a test photo and can't be a gallery pin")
            out.append((sha1, qid, allowed[index[qid]]))
    return out, left_out


# --- the steps that need the model ------------------------------------------------------------

def _service():
    """The vision service's own modules (torch and open_clip load here, not at import)."""
    sys.path.insert(0, str(SERVICE))
    from app import build_assets, config, fetch, model  # noqa: PLC0415
    return build_assets, config, fetch, model


def model_dir_of(arg: str | None) -> Path:
    d = arg or os.environ.get("VISION_MODEL_DIR")
    if not d:
        sys.exit("set VISION_MODEL_DIR or --model-dir to the pinned model files")
    return Path(d)


def step_embed(args) -> int:
    import torch  # noqa: PLC0415

    _, config, fetch, model = _service()
    path = cache_path(config.MODEL_REVISION)
    cache = load_cache(path)
    manifest, labels = auto_filter.read_manifest(), auto_filter.read_labels()
    rows = kept_rows(manifest, labels)
    first: set[str] = set()
    if args.with_owner_drops:
        # The photos the owner dropped too: with the owner's keeps they are the labelled set the
        # agreement rule is measured on (see the agree step's report).
        extra = owner_dropped_rows(manifest, labels)
        first = {m["sha1"] for m in extra}
        rows = extra + rows
    # Owner drops (when asked for), then Openverse and search photos: the agreement check needs those first.
    todo = sorted((r for r in rows if r["sha1"] not in cache),
                  key=lambda r: (r["sha1"] not in first, r.get("source") not in AGREE_SOURCES))
    failed: dict[str, str] = {}
    print(f"kept photos {len(rows)}, cached {len(rows) - len(todo)}, to embed {len(todo)}", flush=True)
    if not todo:
        return 0
    torch.set_num_threads(args.threads)
    visual = model.create_open_clip(model_dir_of(args.model_dir)).visual.eval()
    started, deadline = time.monotonic(), time.monotonic() + args.max_minutes * 60

    def load(r: dict):
        try:
            return r["sha1"], model.preprocess(fetch.open_image((IMAGES / r["file"]).read_bytes())), None
        except fetch.PhotoError as e:
            return r["sha1"], None, e.code

    batches = [todo[i:i + args.batch] for i in range(0, len(todo), args.batch)]
    done = since_save = 0
    with ThreadPoolExecutor(args.workers) as pool:
        pending = [pool.submit(load, r) for r in batches[0]]
        for n in range(len(batches)):
            loaded = [f.result() for f in pending]
            pending = [pool.submit(load, r) for r in batches[n + 1]] if n + 1 < len(batches) else []
            ok = [(s, t) for s, t, _ in loaded if t is not None]
            failed.update({s: e for s, _, e in loaded if e})
            if ok:
                vectors = model.embed_tensors(visual, torch.stack([t for _, t in ok]))
                cache.update({s: v for (s, _), v in zip(ok, vectors)})
            done += len(loaded)
            since_save += len(loaded)
            if since_save >= 512:
                save_cache(path, cache, config.MODEL_REVISION)
                since_save = 0
                rate = done / (time.monotonic() - started)
                print(f"  {done}/{len(todo)} ({rate:.1f} photos/s)", flush=True)
            if time.monotonic() > deadline:
                for f in pending:
                    f.cancel()
                break
    save_cache(path, cache, config.MODEL_REVISION)
    left = len([r for r in rows if r["sha1"] not in cache]) - len(failed)
    print(json.dumps({"embedded": done - len(failed), "failed": failed, "cached": len(cache),
                      "left": left, "seconds": round(time.monotonic() - started)}), flush=True)
    return 0


def step_text(args) -> int:
    import torch  # noqa: PLC0415

    build_assets, config, _, model = _service()
    torch.set_num_threads(args.threads)
    model_dir = model_dir_of(args.model_dir)
    entries = read_entries()
    english = english_names()
    version = vocabulary_version(english=english)
    clip = model.create_open_clip(model_dir)
    tokenizer = build_assets.tokenizer_for(model_dir)
    started = time.monotonic()
    keys, matrix, prompts = build_assets.embed_entries(clip, tokenizer,
                                                       [(e["qid"], pin_prompts(e, english)) for e in entries])
    assert [str(k) for k in keys] == [e["qid"] for e in entries]

    def col(field: str) -> np.ndarray:
        return np.array([("" if e[field] in (None, *NO_VALUE) else e[field]) for e in entries])

    VOCABULARY_NPZ.parent.mkdir(parents=True, exist_ok=True)
    np.savez(VOCABULARY_NPZ, embeddings=matrix.astype(np.float16), qid=col("qid"), english_name=col("english_name"),
             dzirent_category=col("dzirent_category"), dzirent_item_type=col("dzirent_item_type"),
             dzirent_garment_type=col("dzirent_garment_type"),
             allowed=np.array([e["allowed"] == "allowed" for e in entries]),
             vocabulary_version=np.array(version), template=np.array(TEMPLATE), recipe=np.array(PIN_RECIPE),
             model_revision=np.array(config.MODEL_REVISION))
    with_aliases = sum(1 for e in entries if english_aliases(e, english))
    print(json.dumps({"pins": len(entries), "allowed": sum(e["allowed"] == "allowed" for e in entries),
                      "not_allowed": sum(e["allowed"] == "not_allowed" for e in entries), "prompts": prompts,
                      "pins_with_english_aliases": with_aliases,
                      "vocabulary_version": version, "file": str(VOCABULARY_NPZ),
                      "bytes": VOCABULARY_NPZ.stat().st_size, "seconds": round(time.monotonic() - started)}))
    return 0


def read_pins(path: Path = VOCABULARY_NPZ) -> tuple[list[str], np.ndarray, list[bool], str]:
    data = np.load(path, allow_pickle=False)
    version = str(data["vocabulary_version"])
    if version != vocabulary_version():
        sys.exit("vocabulary.npz was built from another vocabulary.json or other prompts: run the text step again")
    return [str(q) for q in data["qid"]], data["embeddings"], [bool(a) for a in data["allowed"]], version


def read_pin_keys(path: Path = VOCABULARY_NPZ) -> list[tuple[str, str]]:
    """Each text pin's agree_key, in vocabulary.npz's order."""
    data = np.load(path, allow_pickle=False)
    return [agree_key(str(c), str(g)) for c, g in zip(data["dzirent_category"], data["dzirent_garment_type"])]


def step_agree(args) -> int:
    _, config, _, _ = _service()
    qids, pins, _, version = read_pins()
    cache = load_cache(cache_path(config.MODEL_REVISION))
    manifest, labels = auto_filter.read_manifest(), auto_filter.read_labels()
    previous = read_csv(AGREEMENT_CSV) if AGREEMENT_CSV.exists() else []
    rows, skipped = agreement_rows(manifest, labels, cache, qids, pins, version, read_pin_keys(), previous)
    write_csv(rows, AGREEMENT_COLUMNS, AGREEMENT_CSV)
    names = {e["qid"]: e["english_name"] for e in read_entries()}
    was = {r["sha1"]: r.get("model_disagrees", "") for r in previous}
    restored = [r for r in rows if was.get(r["sha1"]) == "yes" and r["model_disagrees"] == "no"]
    still = [r for r in rows if was.get(r["sha1"]) == "yes" and r["model_disagrees"] == "yes"]
    by_type: dict[str, Counter] = defaultdict(Counter)
    for r in restored:
        by_type[r["qid"]]["restored"] += 1
    for r in still:
        by_type[r["qid"]]["still_disagrees"] += 1
    print(json.dumps({
        "rule": AGREE_RULE,
        "rows": len(rows),
        "model_disagrees_before": sum(1 for v in was.values() if v == "yes"),
        "restored": len(restored),
        "still_model_disagrees": len(still),
        "new_photos_checked": skipped.get("checked_new", 0),
        "model_disagrees_now": sum(1 for r in rows if r["model_disagrees"] == "yes"),
        "skipped": dict(skipped),
        "restored_by_source": dict(Counter(r["source"] for r in restored)),
        "types": {f"{q} {names.get(q, '')}": dict(c) for q, c in sorted(by_type.items(), key=lambda kv: -kv[1]["restored"])},
    }, ensure_ascii=False, indent=1, default=str))
    return 0


def step_gallery(args) -> int:
    _, config, _, _ = _service()
    qids, _, allowed, version = read_pins()
    split = json.loads(SPLIT_JSON.read_text(encoding="utf-8"))
    rows, left_out = gallery_rows(split, qids, allowed)
    cache = load_cache(cache_path(config.MODEL_REVISION))
    missing = [s for s, _, _ in rows if s not in cache]
    if missing:
        sys.exit(f"{len(missing)} train photos have no embedding yet: run the embed step first")
    GALLERY_NPZ.parent.mkdir(parents=True, exist_ok=True)
    np.savez(GALLERY_NPZ, embeddings=np.stack([cache[s] for s, _, _ in rows]).astype(np.float16),
             sha1=np.array([s for s, _, _ in rows]), qid=np.array([q for _, q, _ in rows]),
             allowed=np.array([a for _, _, a in rows]), vocabulary_version=np.array(version),
             split_sha256=np.array(sha256_file(SPLIT_JSON)), model_revision=np.array(config.MODEL_REVISION))
    gallery_sha = sha256_file(GALLERY_NPZ)
    pins = {
        "vocabulary_version": version,
        "vocabulary_sha256": sha256_file(VOCABULARY_NPZ),
        "gallery_sha256": gallery_sha,
        "gallery_rows": len(rows),
        "gallery_types": len({q for _, q, _ in rows}),
        "gallery_not_allowed_rows": sum(1 for _, _, a in rows if not a),
        "split_sha256": sha256_file(SPLIT_JSON),
        "model_revision": config.MODEL_REVISION,
        "template": TEMPLATE,
        "recipe": PIN_RECIPE,
        "bucket_path": f"gs://{args.bucket}/pins/{version}/",
        # V2: data/vision/embed/train_linear.py adds the linear head's linear_* keys after this step.
    }
    PINS_JSON.write_text(json.dumps(pins, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({**pins, "left_out": dict(left_out), "bytes": GALLERY_NPZ.stat().st_size}, indent=1))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build the vision service's text and gallery pins.")
    sub = parser.add_subparsers(dest="step", required=True)
    for name in ("embed", "text", "agree", "gallery"):
        p = sub.add_parser(name)
        p.add_argument("--model-dir", help="the pinned model files (default VISION_MODEL_DIR)")
        p.add_argument("--threads", type=int, default=max(1, (os.cpu_count() or 2) - 2), help="torch threads")
    sub.choices["embed"].add_argument("--max-minutes", type=float, default=9.0, help="stop cleanly after this long")
    sub.choices["embed"].add_argument("--batch", type=int, default=32)
    sub.choices["embed"].add_argument("--workers", type=int, default=3, help="threads opening photos")
    sub.choices["embed"].add_argument("--with-owner-drops", action="store_true",
                                      help="also embed the photos the owner dropped (the agreement rule's labelled set)")
    sub.choices["gallery"].add_argument("--bucket", default=BUCKET)
    args = parser.parse_args(argv)
    return {"embed": step_embed, "text": step_text, "agree": step_agree, "gallery": step_gallery}[args.step](args)


if __name__ == "__main__":
    sys.exit(main())
