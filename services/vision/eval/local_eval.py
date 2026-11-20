"""V1b: the locked test split through the service's own code on this PC (run_eval.py --local).

The test photos (data/vision/images/split.json, never in the gallery) are scanned one by one, each as
a one-photo listing with the slot front, by the service's Model (the vision tower, the policy and
color text embeddings, the safety model, the pins and thresholds) and scan.listing_verdict, the same
function /scan uses. Photo quality and colors are skipped (they never change the verdict). Each
photo's embedding comes from build_pins.py's cache when it is there (made by the same open_image,
preprocess and embed_tensors); --no-cache embeds again.

Reports per type top-1 (the decided type is the photo's type) and top-3 (its type is in the top 3
text pins), the allowed / not-allowed confusion against the verdicts, and the banned leaks:
not-allowed test photos whose verdict is allowed. Then the --accept and --reject folders, through
the full scan (quality and colors included). Writes eval/report-v1b.md.
"""

from __future__ import annotations

import json
import os
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

EVAL = Path(__file__).resolve().parent
SERVICE = EVAL.parent
REPO = SERVICE.parents[1]
sys.path.insert(0, str(SERVICE))
sys.path.insert(0, str(REPO / "data" / "vision" / "embed"))

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
REPORT = EVAL / "report-v1b.md"


def _pct(x: float | None) -> str:
    return "" if x is None else f"{100 * x:.0f}%"


def run_local(args) -> int:
    import build_pins  # noqa: PLC0415  (the data side: split, vocabulary, cache)
    from app import config  # noqa: PLC0415
    from app.fetch import PhotoError, open_image  # noqa: PLC0415
    from app.model import Model  # noqa: PLC0415
    from app.quality import working_image  # noqa: PLC0415
    from app.scan import PhotoResult, analyze_photo, listing_verdict, scan  # noqa: PLC0415

    started = time.monotonic()
    model_dir = Path(args.model_dir or os.environ.get("VISION_MODEL_DIR") or config.MODEL_DIR)
    model = Model(model_dir)
    pins, th = model.pins, model.thresholds
    split = json.loads(build_pins.SPLIT_JSON.read_text(encoding="utf-8"))
    entries = {e["qid"]: e for e in build_pins.read_entries()}
    tax = json.loads((build_pins.TAXONOMY / "taxonomy.json").read_text(encoding="utf-8"))
    launch = [r["qid"] for r in tax if r["priority"] == "launch"]
    manifest = {m["sha1"]: m for m in build_pins.auto_filter.read_manifest()}
    cache = {} if args.no_cache else build_pins.load_cache(build_pins.cache_path(config.MODEL_REVISION))
    tests = [(s, q) for q in sorted(split["types"]) if q in entries for s in sorted(split["types"][q]["test"])]
    left_out = sum(len(t["test"]) for q, t in split["types"].items() if q not in entries)
    print(f"test photos: {len(tests)} of types with a text pin ({left_out} more of types without one)", flush=True)

    rows = []
    batch = 16
    for at in range(0, len(tests), batch):
        chunk = tests[at:at + batch]
        images, ok = [], []
        for sha1, qid in chunk:
            try:
                images.append(open_image((build_pins.IMAGES / manifest[sha1]["file"]).read_bytes()))
                ok.append((sha1, qid))
            except PhotoError as e:
                rows.append({"sha1": sha1, "qid": qid, "error": e.code})
        if not ok:
            continue
        missing = [i for i, (s, _) in enumerate(ok) if s not in cache]
        embedded = model.embed_images([images[i] for i in missing]) if missing else []
        for i, v in zip(missing, embedded):
            cache[ok[i][0]] = v
        nsfw = model.safety.nsfw(images)
        for (sha1, qid), p in zip(ok, nsfw):
            r = PhotoResult(photo_id=sha1, slot="front")
            analyze_photo(r, cache[sha1].astype(np.float32), None, model.banks, model.vocab, nsfw=p,
                          pins=pins, thresholds=th)
            d = listing_verdict([r], model.banks, model.vocab, pins, th)
            rows.append({"sha1": sha1, "qid": qid, "allowed": entries[qid]["allowed"] == "allowed",
                         "verdict": d["verdict"].verdict, "reason": d["verdict"].reason,
                         "type": (d["type"] or {}).get("qid"), "type_confidence": d["type_confidence"],
                         "agreement": d["agreement"], "top3": [t["qid"] for t in d["top_types"][:3]],
                         "text_type": r.reading.text_type.qid, "gallery_type": r.reading.gallery_type.qid
                         if r.reading.gallery_type else None, "banned_score": d["banned_score"], "nsfw": round(p, 4),
                         "policy_decision": r.decision.decision, "source": manifest[sha1]["source"]})
        if (at // batch) % 20 == 0:
            print(f"  {min(at + batch, len(tests))}/{len(tests)}", flush=True)

    scanned = [r for r in rows if "verdict" in r]
    folders = {}
    for name, folder in (("should-accept", args.accept), ("should-reject", args.reject)):
        files = sorted(p for p in Path(folder).rglob("*") if p.suffix.lower() in IMAGE_SUFFIXES) if Path(folder).exists() else []
        out = []
        for path in files:
            try:
                image = open_image(path.read_bytes())
            except PhotoError as e:
                out.append({"file": str(path.relative_to(folder)), "error": e.code})
                continue
            emb = model.embed_images([image])[0]
            r = PhotoResult(photo_id=path.name, slot="front")
            analyze_photo(r, emb, working_image(image), model.banks, model.vocab, nsfw=model.safety.nsfw([image])[0],
                          pins=pins, thresholds=th)
            res = scan(f"local-{name}", [r], model.banks, model.vocab, model.color_bank, pins, th)
            out.append({"file": str(path.relative_to(folder)), "verdict": res["verdict"],
                        "type": (res["type"] or {}).get("english_name"), "type_confidence": res["type_confidence"],
                        "agreement": res["agreement"], "banned_score": res["banned_score"], "reason": res["reason"]})
        folders[name] = {"folder": str(folder), "results": out}
        print(f"{name}: " + ("no photos in " + str(folder) if not files else f"{len(files)} photos"), flush=True)
        for o in out:
            print(f"  {o['file']}: {o.get('verdict', o.get('error'))}, {o.get('type')}, {o.get('type_confidence')}")

    summary = summarize(scanned, entries, launch, th, pins, folders, left_out, model)
    REPORT.write_text(report(summary), encoding="utf-8", newline="\n")
    if args.out:
        Path(args.out).write_text(json.dumps({"summary": summary, "photos": rows}, indent=1), encoding="utf-8")
    print(json.dumps(summary["overall"], indent=1))
    print(f"leaks: {len(summary['leaks'])}; report: {REPORT}; {time.monotonic() - started:.0f} s")
    return 1 if summary["leaks"] else 0


def summarize(rows, entries, launch, th, pins, folders, left_out, model) -> dict:
    by_type = defaultdict(list)
    for r in rows:
        by_type[r["qid"]].append(r)

    def stats(rs):
        n = len(rs)
        v = Counter(r["verdict"] for r in rs)
        return {"n": n, "top1": sum(r["type"] == r["qid"] for r in rs) / n if n else None,
                "top3": sum(r["qid"] in r["top3"] for r in rs) / n if n else None,
                "text_top1": sum(r["text_type"] == r["qid"] for r in rs) / n if n else None,
                "gallery_top1": sum(r["gallery_type"] == r["qid"] for r in rs) / n if n else None,
                "agreement": sum(r["agreement"] for r in rs) / n if n else None,
                "allowed": v["allowed"], "review": v["review"], "rejected": v["rejected"]}

    confusion = {truth: dict(Counter(r["verdict"] for r in rows if r["allowed"] == (truth == "allowed")))
                 for truth in ("allowed", "not_allowed")}
    leaks = [r for r in rows if not r["allowed"] and r["verdict"] == "allowed"]
    names = {q: e["english_name"] for q, e in entries.items()}
    return {
        "overall": {**stats(rows), "types": len(by_type), "test_photos_of_types_without_a_pin": left_out},
        "allowed_types": stats([r for r in rows if r["allowed"]]),
        "not_allowed_types": stats([r for r in rows if not r["allowed"]]),
        "confusion": confusion,
        "leaks": [{**r, "english_name": names[r["qid"]], "decided": names.get(r["type"], r["type"])} for r in leaks],
        "launch": [{"qid": q, "english_name": names.get(q, q), "status": entries[q]["allowed"] if q in entries else "",
                    **stats(by_type.get(q, []))} for q in launch],
        "thresholds": {k: getattr(th, k) for k in th.__dataclass_fields__},
        "pins": {"vocabulary_version": pins.version, "text_pins": len(pins.types), "gallery_pins": len(pins.gallery)},
        "policy_digest": model.vocab.digest[:16],
        "folders": folders,
    }


def report(s: dict) -> str:
    o, a, n = s["overall"], s["allowed_types"], s["not_allowed_types"]
    lines = [
        "# Vision V1b: evaluation on the locked test split",
        "",
        "Written by `services/vision/eval/run_eval.py --local` (service `v1b.1`). Every test photo of a type with a",
        "text pin was scanned on this PC as a one-photo listing (slot front) by the service's own model and",
        "`scan.listing_verdict`. The test split (`data/vision/images/split.json`) is never in the gallery and was",
        "never used to choose the thresholds (those come from the train split, `eval/calibrate.py`).",
        "",
        f"- Pins: vocabulary `{s['pins']['vocabulary_version'][:16]}`, {s['pins']['text_pins']} text pins, "
        f"{s['pins']['gallery_pins']} gallery pins; policy digest `{s['policy_digest']}`.",
        f"- Test photos scanned: {o['n']} of {o['types']} types"
        f" ({o['test_photos_of_types_without_a_pin']} more belong to review types, which have no pin).",
        "",
        "## Overall",
        "",
        "| Set | Photos | Type top-1 | Top-3 (text pins) | Text top-1 | Gallery top-1 | Agreement | Allowed | Review | Rejected |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for name, x in (("All", o), ("Allowed types", a), ("Not-allowed types", n)):
        lines.append(f"| {name} | {x['n']} | {_pct(x['top1'])} | {_pct(x['top3'])} | {_pct(x['text_top1'])} | "
                     f"{_pct(x['gallery_top1'])} | {_pct(x['agreement'])} | {x['allowed']} | {x['review']} | {x['rejected']} |")
    c = s["confusion"]
    lines += [
        "",
        "Type top-1: the type the rules decided (text and gallery together) is the photo's own type. Top-3 (text pins):",
        "the photo's type is among the 3 most likely text pins (top_types). Text and gallery top-1: each source on its own.",
        "",
        "## Allowed / not allowed against the verdict",
        "",
        "| Photo's type | Allowed | Review | Rejected |",
        "| --- | --- | --- | --- |",
        f"| allowed | {c['allowed'].get('allowed', 0)} | {c['allowed'].get('review', 0)} | {c['allowed'].get('rejected', 0)} |",
        f"| not allowed | {c['not_allowed'].get('allowed', 0)} | {c['not_allowed'].get('review', 0)} | "
        f"{c['not_allowed'].get('rejected', 0)} |",
        "",
        f"## Banned leaks: {len(s['leaks'])}",
        "",
        "Not-allowed test photos whose verdict is allowed: the number V2 must drive to zero and keep there, while allowing",
        "far more of the allowed photos (see the table above).",
        "",
    ]
    if s["leaks"]:
        lines += ["| Photo (sha1) | Its type | Decided type | Confidence | Banned score | Source |", "| --- | --- | --- | --- | --- | --- |"]
        for r in s["leaks"]:
            lines.append(f"| `{r['sha1'][:12]}` | {r['english_name']} | {r['decided']} | {r['type_confidence']} | "
                         f"{r['banned_score']} | {r['source']} |")
    else:
        lines.append("None.")
    lines += [
        "",
        "## The 57 launch types",
        "",
        "| Type | Policy | Test photos | Type top-1 | Top-3 (text pins) | Allowed | Review | Rejected |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for t in s["launch"]:
        lines.append(f"| {t['english_name']} | {t['status'].replace('_', ' ')} | {t['n']} | {_pct(t['top1'])} | "
                     f"{_pct(t['top3'])} | {t['allowed']} | {t['review']} | {t['rejected']} |")
    lines += ["", "## Thresholds used", "", "| Name | Value |", "| --- | --- |"]
    lines += [f"| `{k}` | {v} |" for k, v in s["thresholds"].items()]
    lines += ["", "Each value's reason is in `services/vision/app/thresholds.json` and the V1b handoff.", "",
              "## The owner's folders", ""]
    for name, f in s["folders"].items():
        if not f["results"]:
            lines.append(f"- `{name}`: no photos in `{f['folder']}`.")
        else:
            lines.append(f"- `{name}`:")
            lines += [f"  - {r['file']}: {r.get('verdict', r.get('error'))}, {r.get('type')}, confidence "
                      f"{r.get('type_confidence')}" for r in f["results"]]
    return "\n".join(lines) + "\n"
