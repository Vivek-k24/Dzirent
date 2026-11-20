"""V1b, V2: the locked test split through the service's own code on this PC (run_eval.py --local).

The test photos (data/vision/images/split.json, never in the gallery or the linear head's training
set) are scanned one by one, each as a one-photo listing with the slot front, by the service's Model
(the vision tower, the policy and color text embeddings, the safety model, the pins, the linear head
and the thresholds) and scan.listing_verdict, the same function /scan uses. Photo quality and colors
are skipped (they never change the verdict). Each photo's embedding comes from build_pins.py's cache
when it is there (made by the same open_image, preprocess and embed_tensors); --no-cache embeds again.
The safety model's scores are cached too (images/raw/embeddings/nsfw-*.json): they depend only on
the photo and that model.

Reports type top-1 (the decided type is the photo's type), mapping top-1 (the decided Dzirent
mapping, category, garment type and allowed, is the photo's), the allowed / not-allowed confusion
against the verdicts, the banned leaks (not-allowed test photos whose verdict is allowed), the gate's
false rejections (allowed photos the gate rejected outright) and a table of the 57 launch types,
each beside V1b's numbers (report-v1b.md and the V1b handoff). V2's test split is V1b's plus the
photos the model-agreement check gave back (the split is sticky), so V2 is also measured on V1b's
own 1,928 photos. Then the --accept and --reject folders, through the full scan (quality and
colors included): each file's verdict, type and confidence. Writes eval/report-v2.md.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
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

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".jfif", ".png", ".webp"}
REPORT = EVAL / "report-v2.md"
REPORT_V1B = EVAL / "report-v1b.md"
V1B_COMMIT = "9489259"  # the last V1b commit: its split.json is V1b's test split
# From the V1b handoff (eval): of the 64 allowed test photos V1b rejected, the gate rejected 44.
V1B_GATE_FALSE_REJECTIONS = 44


def _pct(x: float | None) -> str:
    return "" if x is None else f"{100 * x:.0f}%"


def v1b_test_sha1s() -> set[str]:
    raw = subprocess.run(["git", "show", f"{V1B_COMMIT}:data/vision/images/split.json"], cwd=REPO, check=True,
                         capture_output=True).stdout
    return {s for t in json.loads(raw)["types"].values() for s in t["test"]}


def v1b_report() -> dict:
    """V1b's numbers, read from report-v1b.md's tables."""
    text = REPORT_V1B.read_text(encoding="utf-8")
    out = {"overall": {}, "launch": {}, "confusion": {}}
    for line in text.splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) == 10 and cells[0] in ("All", "Allowed types", "Not-allowed types"):
            out["overall"][cells[0]] = {"n": int(cells[1]), "top1": cells[2], "top3": cells[3], "text_top1": cells[4],
                                        "gallery_top1": cells[5], "agreement": cells[6], "allowed": int(cells[7]),
                                        "review": int(cells[8]), "rejected": int(cells[9])}
        elif len(cells) == 4 and cells[0] in ("allowed", "not allowed"):
            out["confusion"][cells[0]] = [int(c) for c in cells[1:]]
        elif len(cells) == 8 and cells[1] in ("allowed", "not allowed") and cells[2].isdigit():
            out["launch"][cells[0]] = {"n": int(cells[2]), "top1": cells[3], "allowed": int(cells[5]),
                                       "review": int(cells[6]), "rejected": int(cells[7])}
    m = re.search(r"## Banned leaks: (\d+)", text)
    out["leaks"] = int(m.group(1)) if m else None
    return out


def _nsfw_cache_path(build_pins, config) -> Path:
    return build_pins.CACHE_DIR / f"nsfw-{config.SAFETY_MODEL_REVISION[:12]}.json"


def run_local(args) -> int:
    import build_pins  # noqa: PLC0415  (the data side: split, vocabulary, cache)
    from app import config  # noqa: PLC0415
    from app.fetch import PhotoError, open_image  # noqa: PLC0415
    from app.model import Model  # noqa: PLC0415
    from app.pins import softmax  # noqa: PLC0415
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
    nsfw_path = _nsfw_cache_path(build_pins, config)
    nsfw_cache = {} if args.no_cache or not nsfw_path.exists() else json.loads(nsfw_path.read_text(encoding="utf-8"))
    type_index = {t.qid: i for i, t in enumerate(pins.types)}
    v1b_photos = v1b_test_sha1s()
    tests = [(s, q) for q in sorted(split["types"]) if q in entries for s in sorted(split["types"][q]["test"])]
    left_out = sum(len(t["test"]) for q, t in split["types"].items() if q not in entries)
    print(f"test photos: {len(tests)} of types with a text pin ({left_out} more of types without one)", flush=True)

    rows = []
    batch = 16
    for at in range(0, len(tests), batch):
        chunk = tests[at:at + batch]
        need_image = [(s, q) for s, q in chunk if s not in cache or s not in nsfw_cache]
        images = {}
        for sha1, qid in need_image:
            try:
                images[sha1] = open_image((build_pins.IMAGES / manifest[sha1]["file"]).read_bytes())
            except PhotoError as e:
                rows.append({"sha1": sha1, "qid": qid, "error": e.code})
        missing = [s for s, _ in need_image if s in images and s not in cache]
        for s, v in zip(missing, model.embed_images([images[s] for s in missing]) if missing else []):
            cache[s] = v
        unscored = [s for s, _ in need_image if s in images and s not in nsfw_cache]
        for s, p in zip(unscored, model.safety.nsfw([images[s] for s in unscored]) if unscored else []):
            nsfw_cache[s] = float(p)
        for sha1, qid in chunk:
            if sha1 not in cache or sha1 not in nsfw_cache:
                continue
            emb = cache[sha1].astype(np.float32)
            r = PhotoResult(photo_id=sha1, slot="front")
            analyze_photo(r, emb, None, model.banks, model.vocab, nsfw=nsfw_cache[sha1], pins=pins, thresholds=th)
            d = listing_verdict([r], model.banks, model.vocab, pins, th)
            reading, own = r.reading, pins.types[type_index[qid]]
            e = emb / np.linalg.norm(emb)
            text_top3 = [pins.types[i].qid for i in np.argsort(-softmax(th.text_logit_scale * (pins.text @ e)), kind="stable")[:3]]
            banned = d["banned_score"] or 0.0
            rows.append({"sha1": sha1, "qid": qid, "allowed": entries[qid]["allowed"] == "allowed",
                         "verdict": d["verdict"].verdict, "reason": d["verdict"].reason,
                         "type": (d["type"] or {}).get("qid"), "type_confidence": d["type_confidence"],
                         "agreement": d["agreement"], "top3": [t["qid"] for t in d["top_types"][:3]],
                         "text_top3": text_top3, "mapping_ok": reading.mapping == own.mapping,
                         "text_type": reading.text_type.qid,
                         "gallery_type": reading.gallery_type.qid if reading.gallery_type else None,
                         "linear_type": reading.linear_type.qid if reading.linear_type else None,
                         "banned_score": d["banned_score"],
                         "gate": "hard" if banned >= th.banned_hard else "soft" if banned >= th.banned_min else "",
                         "text_poster": bool(r.text_poster is not None and r.text_poster >= th.text_poster_min),
                         "nsfw": round(nsfw_cache[sha1], 4), "policy_decision": r.decision.decision,
                         "source": manifest[sha1]["source"], "v1b_photo": sha1 in v1b_photos})
        if (at // batch) % 20 == 0:
            print(f"  {min(at + batch, len(tests))}/{len(tests)}", flush=True)
    nsfw_path.parent.mkdir(parents=True, exist_ok=True)
    nsfw_path.write_text(json.dumps(nsfw_cache), encoding="utf-8")

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
                        "agreement": res["agreement"], "mapping": res["mapping"], "banned_score": res["banned_score"],
                        "reason": res["reason"]})
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


def stats(rs: list[dict]) -> dict:
    n = len(rs)
    v = Counter(r["verdict"] for r in rs)

    def share(f):
        return sum(1 for r in rs if f(r)) / n if n else None

    return {"n": n, "top1": share(lambda r: r["type"] == r["qid"]), "mapping_top1": share(lambda r: r["mapping_ok"]),
            "top3": share(lambda r: r["qid"] in r["top3"]), "text_top3": share(lambda r: r["qid"] in r["text_top3"]),
            "text_top1": share(lambda r: r["text_type"] == r["qid"]),
            "gallery_top1": share(lambda r: r["gallery_type"] == r["qid"]),
            "linear_top1": share(lambda r: r["linear_type"] == r["qid"]),
            "agreement": share(lambda r: r["agreement"]),
            "allowed": v["allowed"], "review": v["review"], "rejected": v["rejected"]}


def summarize(rows, entries, launch, th, pins, folders, left_out, model) -> dict:
    by_type = defaultdict(list)
    for r in rows:
        by_type[r["qid"]].append(r)
    names = {q: e["english_name"] for q, e in entries.items()}

    def block(rs):
        return {"all": stats(rs), "allowed_types": stats([r for r in rs if r["allowed"]]),
                "not_allowed_types": stats([r for r in rs if not r["allowed"]]),
                "confusion": {truth: dict(Counter(r["verdict"] for r in rs if r["allowed"] == (truth == "allowed")))
                              for truth in ("allowed", "not_allowed")},
                "leaks": sum(1 for r in rs if not r["allowed"] and r["verdict"] == "allowed"),
                "gate_false_rejections": sum(1 for r in rs if r["allowed"] and r["verdict"] == "rejected" and r["gate"] == "hard")}

    allowed_rows = [r for r in rows if r["allowed"]]
    leaks = [r for r in rows if not r["allowed"] and r["verdict"] == "allowed"]
    return {
        "overall": {**stats(rows), "types": len(by_type), "test_photos_of_types_without_a_pin": left_out},
        "v2": block(rows),
        "v2_on_v1b_photos": block([r for r in rows if r["v1b_photo"]]),
        "v1b": v1b_report(),
        "leaks": [{**r, "english_name": names[r["qid"]], "decided": names.get(r["type"], r["type"])} for r in leaks],
        "allowed_types_reasons": dict(Counter(r["reason"] for r in allowed_rows if r["verdict"] != "allowed").most_common()),
        "allowed_types_rejected": {
            "gate": sum(1 for r in allowed_rows if r["verdict"] == "rejected" and r["gate"] == "hard"),
            "nudity": sum(1 for r in allowed_rows if r["verdict"] == "rejected" and r["nsfw"] >= 0.90),
            "policy_check": sum(1 for r in allowed_rows if r["verdict"] == "rejected" and r["gate"] != "hard" and r["nsfw"] < 0.90)},
        "not_allowed_types_rejected_by_gate": sum(1 for r in rows if not r["allowed"] and r["verdict"] == "rejected"
                                                  and r["gate"] == "hard"),
        "text_poster_reviews": Counter("allowed" if r["allowed"] else "not_allowed" for r in rows
                                       if r["reason"].startswith("This photo looks like text or a poster")),
        "launch": [{"qid": q, "english_name": names.get(q, q), "policy": entries[q]["allowed"] if q in entries else "",
                    **stats(by_type.get(q, []))} for q in launch],
        "thresholds": {k: getattr(th, k) for k in th.__dataclass_fields__},
        "pins": {"vocabulary_version": pins.version, "text_pins": len(pins.types), "gallery_pins": len(pins.gallery),
                 "linear_sha256": pins.linear.sha256, "linear_classes": len(pins.linear.bias)},
        "policy_digest": model.vocab.digest[:16],
        "folders": folders,
    }


def report(s: dict) -> str:
    v2, sub, v1b = s["v2"], s["v2_on_v1b_photos"], s["v1b"]
    lines = [
        "# Vision V2: evaluation on the locked test split",
        "",
        "Written by `services/vision/eval/run_eval.py --local` (service `v2.1`). Every test photo of a type with a",
        "text pin was scanned on this PC as a one-photo listing (slot front) by the service's own model and",
        "`scan.listing_verdict`. The test split (`data/vision/images/split.json`) is never in the gallery or the",
        "linear head's training set and was never used to choose the weights or thresholds (those come from the",
        "train split, `eval/calibrate.py`); this is the one measurement on it.",
        "",
        f"- Pins: vocabulary `{s['pins']['vocabulary_version'][:16]}`, {s['pins']['text_pins']} text pins, "
        f"{s['pins']['gallery_pins']} gallery pins; linear head `{s['pins']['linear_sha256'][:16]}` "
        f"({s['pins']['linear_classes']} types); policy digest `{s['policy_digest']}`.",
        f"- Test photos scanned: {v2['all']['n']} of {s['overall']['types']} types"
        f" ({s['overall']['test_photos_of_types_without_a_pin']} more belong to review types, which have no pin)."
        f" V1b's test split had 1,928; the split is sticky, so all of them are here, plus"
        f" {v2['all']['n'] - sub['all']['n']} photos the model-agreement check gave back.",
        "- V1b's numbers are from `report-v1b.md`. \"V2, V1b's photos\" is V2 on exactly V1b's test photos.",
        "",
        "## Overall",
        "",
        "| Run | Set | Photos | Type top-1 | Mapping top-1 | Top-3 (final) | Top-3 (text pins) | Agreement | Allowed | Review | Rejected |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for run, b in (("V2", v2), ("V2, V1b's photos", sub)):
        for name, key in (("All", "all"), ("Allowed types", "allowed_types"), ("Not-allowed types", "not_allowed_types")):
            x = b[key]
            lines.append(f"| {run} | {name} | {x['n']} | {_pct(x['top1'])} | {_pct(x['mapping_top1'])} | {_pct(x['top3'])} | "
                         f"{_pct(x['text_top3'])} | {_pct(x['agreement'])} | {x['allowed']} | {x['review']} | {x['rejected']} |")
    for name in ("All", "Allowed types", "Not-allowed types"):
        x = v1b["overall"].get(name)
        if x:
            lines.append(f"| V1b | {name} | {x['n']} | {x['top1']} | | | {x['top3']} | {x['agreement']} | {x['allowed']} | "
                         f"{x['review']} | {x['rejected']} |")
    o = s["overall"]
    lines += [
        "",
        "Type top-1: the decided type is the photo's own type. Mapping top-1: the decided Dzirent mapping (category,",
        "garment type, allowed) is the photo's type's. Top-3 (final): the photo's type is among the 3 best types by",
        "the final score (`top_types`); top-3 (text pins): among the 3 most likely text pins (V1b's `top_types`).",
        f"Each source alone, V2 test: text top-1 {_pct(o['text_top1'])}, gallery top-1 {_pct(o['gallery_top1'])},"
        f" linear head top-1 {_pct(o['linear_top1'])}.",
        "",
        "## Allowed / not allowed against the verdict",
        "",
        "| Run | Photo's type | Allowed | Review | Rejected |",
        "| --- | --- | --- | --- | --- |",
    ]
    for run, b in (("V2", v2), ("V2, V1b's photos", sub)):
        for truth in ("allowed", "not_allowed"):
            c = b["confusion"][truth]
            lines.append(f"| {run} | {truth.replace('_', ' ')} | {c.get('allowed', 0)} | {c.get('review', 0)} | {c.get('rejected', 0)} |")
    for truth in ("allowed", "not allowed"):
        c = v1b["confusion"].get(truth)
        if c:
            lines.append(f"| V1b | {truth} | {c[0]} | {c[1]} | {c[2]} |")
    lines += [
        "",
        f"## Banned leaks: {len(s['leaks'])}",
        "",
        f"Not-allowed test photos whose verdict is allowed (V2 on V1b's photos: {sub['leaks']}; V1b: {v1b['leaks']}).",
        "",
    ]
    if s["leaks"]:
        lines += ["| Photo (sha1) | Its type | Decided type | Confidence | Banned score | Source |",
                  "| --- | --- | --- | --- | --- | --- |"]
        for r in s["leaks"]:
            lines.append(f"| `{r['sha1'][:12]}` | {r['english_name']} | {r['decided']} | {r['type_confidence']} | "
                         f"{r['banned_score']} | {r['source']} |")
    else:
        lines.append("None.")
    rj = s["allowed_types_rejected"]
    lines += [
        "",
        "## Gate false rejections and reviews",
        "",
        f"- Allowed test photos the gate rejected outright (banned_score at `banned_hard` or more): **{v2['gate_false_rejections']}**"
        f" of {v2['allowed_types']['n']} (V2 on V1b's photos: {sub['gate_false_rejections']} of {sub['allowed_types']['n']};"
        f" V1b: {V1B_GATE_FALSE_REJECTIONS} of 1214, V1b's one-tier gate at 0.60).",
        f"- Allowed photos rejected by anything: {rj['gate']} by the gate, {rj['policy_check']} by the policy check's own"
        f" rules, {rj['nudity']} for nudity.",
        f"- Not-allowed photos rejected by the gate: {s['not_allowed_types_rejected_by_gate']} of {v2['not_allowed_types']['n']}.",
        f"- Sent to review as text or a poster: {s['text_poster_reviews'].get('allowed', 0)} allowed-type and"
        f" {s['text_poster_reviews'].get('not_allowed', 0)} not-allowed-type test photos.",
        "",
        "Why the allowed-type test photos that weren't allowed were not:",
        "",
        "| Reason | Photos |",
        "| --- | --- |",
    ]
    lines += [f"| {reason} | {n} |" for reason, n in s["allowed_types_reasons"].items()]
    lines += [
        "",
        "## The 57 launch types",
        "",
        "| Type | Policy | Test photos | Type top-1 | Mapping top-1 | Allowed / review / rejected | V1b test photos | V1b type top-1 | V1b allowed / review / rejected |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for t in s["launch"]:
        old = v1b["launch"].get(t["english_name"], {})
        old_v = f"{old['allowed']} / {old['review']} / {old['rejected']}" if old else ""
        lines.append(f"| {t['english_name']} | {t['policy'].replace('_', ' ')} | {t['n']} | {_pct(t['top1'])} | "
                     f"{_pct(t['mapping_top1'])} | {t['allowed']} / {t['review']} / {t['rejected']} | {old.get('n', '')} | "
                     f"{old.get('top1', '')} | {old_v} |")
    lines += ["", "## Thresholds used", "", "| Name | Value |", "| --- | --- |"]
    lines += [f"| `{k}` | {v} |" for k, v in s["thresholds"].items()]
    lines += ["", "Each value's reason is in `services/vision/app/thresholds.json` and the V2 handoff.", "",
              "## The owner's folders", "",
              "`H:\\DziRent\\vision-test` is a local exam: read on this PC, never copied into the dataset. Each file",
              "went through the full scan (quality and colors included) as a one-photo listing.", ""]
    for name, f in s["folders"].items():
        if not f["results"]:
            lines.append(f"- `{name}`: no photos in `{f['folder']}`.")
            continue
        v = Counter(r.get("verdict", "error") for r in f["results"])
        lines += [f"- `{name}`: {len(f['results'])} photos: " + ", ".join(f"{n} {k}" for k, n in v.most_common()) + ".", "",
                  "| File | Verdict | Type | Confidence | Agreement | Mapping | Reason |", "| --- | --- | --- | --- | --- | --- | --- |"]
        for r in f["results"]:
            m = r.get("mapping") or {}
            mapping = f"{m.get('category')} / {m.get('garment_type')}" if m else ""
            lines.append(f"| {r['file']} | {r.get('verdict', r.get('error'))} | {r.get('type') or ''} | "
                         f"{r.get('type_confidence')} | {r.get('agreement')} | {mapping} | {r.get('reason', '')} |")
        lines.append("")
    return "\n".join(lines).rstrip("\n") + "\n"
