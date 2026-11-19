"""D2c: the automatic photo filter, and its merge into labels.csv.

For every photo in manifest.csv it measures, on a copy at most 256 px on its long side:

- saturation: the mean HSV saturation (0-1) of the pixels that are neither near-white nor
  near-black. A white background or a black backdrop doesn't make a colour photo look grey;
- white_frac / black_frac: the share of near-white pixels (darkest channel 230 or more) and of
  near-black pixels (brightest channel 25 or less);
- page_score: how many of the four borders (the outer 6 %) are paper: at least 90 % of the
  border's pixels light (HSV value 190 or more) and nearly colourless (saturation 0.25 or less);
- the hue of the coloured pixels (for sepia): how tightly they share one hue (hue_r, 0-1) and
  which hue (hue_deg), in images/raw/auto_filter_stats.json only.

A photo is auto_drop when (thresholds below, chosen from the set's histogram; `--histogram`
prints it):
- grayscale: saturation under GRAY_MAX;
- sepia: saturation under SEPIA_SAT_MAX with nearly all coloured pixels on one brown-orange hue;
- page: a page scan, page_score 3 or more and saturation under PAGE_SAT_MAX;
- small: a short side under 300 px (fetch_commons.py already skips those, so this is a check);
- unreadable: Pillow can't open the file (cut short, or broken as Commons serves it); measured
  again on every run.

It writes auto_filter.csv (sha1, saturation, white_frac, black_frac, page_score, auto_drop,
reason), then merges into labels.csv: every row the review page wrote (source owner, or no source
in a file from before D2c) stays exactly as it is, and an auto_drop photo the owner never clicked
gets one row (decision drop, source auto, no time). An owner decision always wins, whatever it is
and whenever it was made; the auto rows are written again on every run. Last, it prints what the
owner kept, dropped and wasn't sure of per type, what the filter added, and the launch types with
the fewest photos left.

    python images/auto_filter.py               # measure (new photos only), write, merge, report
    python images/auto_filter.py --histogram   # also print the saturation histogram
    python images/auto_filter.py --no-merge    # write auto_filter.csv only
    python images/auto_filter.py --forget-owner Q80151,Q83363   # drop those types' owner rows, then merge (D2d)
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import sys
from collections import Counter, defaultdict
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from PIL import Image, ImageChops, ImageStat

IMAGES_DIR = Path(__file__).resolve().parent
MANIFEST_CSV = IMAGES_DIR / "manifest.csv"
LABELS_CSV = IMAGES_DIR / "labels.csv"
AUTO_CSV = IMAGES_DIR / "auto_filter.csv"
STATS_JSON = IMAGES_DIR / "raw" / "auto_filter_stats.json"
TAXONOMY_JSON = IMAGES_DIR.parent / "taxonomy" / "taxonomy.json"

AUTO_COLUMNS = ["sha1", "saturation", "white_frac", "black_frac", "page_score", "auto_drop", "reason"]
LABEL_COLUMNS = ["sha1", "qid", "decision", "decided_at", "source"]
DECISIONS = ("keep", "drop", "not_sure")

# The measures (MEASURE_VERSION changes when they do, so the cache is measured again).
MEASURE_VERSION = 2
SAMPLE = 256        # long side of the copy that is measured
WHITE_MIN = 230     # near-white: the darkest of R, G, B at least this
BLACK_MAX = 25      # near-black: the brightest of R, G, B at most this
COLOURED_S = 26     # a pixel counts as coloured for the hue measure from HSV saturation 26/255 (0.1)
PAPER_V, PAPER_S = 190, 64   # paper: HSV value at least 190/255, saturation at most 64/255 (0.25)
BORDER = 0.06       # a border is the outer 6 % of the height (top, bottom) or width (left, right)
PAPER_SIDE = 0.9    # a border is paper when at least 90 % of its pixels are

# The rules (see README "Auto-filter" for the histogram they come from).
GRAY_MAX = 0.02
SEPIA_SAT_MAX = 0.25
SEPIA_HUE = (15.0, 55.0)  # degrees: brown to orange-yellow
SEPIA_HUE_R = 0.98        # the coloured pixels share one hue
SEPIA_COVER = 0.93        # and nearly every content pixel is coloured (the tint is everywhere)
PAGE_SIDES = 3
PAGE_SAT_MAX = 0.15
PAGE_BORDER_S = 0.07      # the paper border is tinted (cream), not studio white or grey
PAGE_HUE_R = 0.95
MIN_SHORT_SIDE = 300


def _table(test) -> list[int]:
    return [255 if test(x) else 0 for x in range(256)]


def flatten(im: Image.Image) -> Image.Image:
    """RGB, with any transparency laid on white (a transparent PNG isn't a black photo)."""
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        im = im.convert("RGBA")
        out = Image.new("RGB", im.size, (255, 255, 255))
        out.paste(im, mask=im.getchannel("A"))
        return out
    return im.convert("RGB")


def measure(path: Path) -> dict:
    """The measures of one photo (see the module docstring)."""
    with Image.open(path) as im:
        width, height = im.size
        if im.format == "JPEG":
            im.draft("RGB", (SAMPLE * 2, SAMPLE * 2))  # decode at a reduced scale; enough to measure
        im = flatten(im)
    im.thumbnail((SAMPLE, SAMPLE))
    w, h = im.size
    n = w * h
    r, g, b = im.split()
    darkest = ImageChops.darker(ImageChops.darker(r, g), b)
    brightest = ImageChops.lighter(ImageChops.lighter(r, g), b)
    white_frac = sum(darkest.histogram()[WHITE_MIN:]) / n
    black_frac = sum(brightest.histogram()[:BLACK_MAX + 1]) / n
    hue, sat, val = im.convert("HSV").split()
    content = ImageChops.multiply(darkest.point(_table(lambda x: x < WHITE_MIN)),
                                  brightest.point(_table(lambda x: x > BLACK_MAX)))
    content_n = sum(content.histogram()[255:])
    saturation = ImageStat.Stat(sat, content).mean[0] / 255 if content_n else 0.0
    coloured = ImageChops.multiply(content, sat.point(_table(lambda x: x >= COLOURED_S)))
    hist = hue.histogram(coloured)
    total = sum(hist)
    hue_r, hue_deg = 0.0, 0.0
    if total:
        cx = sum(c * math.cos(2 * math.pi * i / 256) for i, c in enumerate(hist) if c)
        cy = sum(c * math.sin(2 * math.pi * i / 256) for i, c in enumerate(hist) if c)
        hue_r = math.hypot(cx, cy) / total
        hue_deg = math.degrees(math.atan2(cy, cx)) % 360
    paper = ImageChops.multiply(val.point(_table(lambda x: x >= PAPER_V)), sat.point(_table(lambda x: x <= PAPER_S)))
    tv, th = max(2, round(BORDER * h)), max(2, round(BORDER * w))
    boxes = [(0, 0, w, tv), (0, h - tv, w, h), (0, 0, th, h), (w - th, 0, w, h)]
    sides = [ImageStat.Stat(paper.crop(box)).mean[0] / 255 for box in boxes]
    shist = sat.histogram(content)
    p90, run = 0, 0
    for i, c in enumerate(shist):
        run += c
        if content_n and run >= 0.9 * content_n:
            p90 = i
            break
    border_s = sum(ImageStat.Stat(sat.crop(box)).mean[0] for box in boxes) / 4 / 255
    border_v = sum(ImageStat.Stat(val.crop(box)).mean[0] for box in boxes) / 4 / 255
    return {"width": width, "height": height, "saturation": round(saturation, 4), "white_frac": round(white_frac, 4),
            "black_frac": round(black_frac, 4), "coloured_frac": round(total / n, 4), "hue_r": round(hue_r, 4),
            "hue_deg": round(hue_deg, 1), "sides": [round(s, 4) for s in sides],
            "sat_p90": round(p90 / 255, 4), "tint_cover": round(total / content_n, 4) if content_n else 0.0,
            "border_s": round(border_s, 4), "border_v": round(border_v, 4)}


def page_score(m: dict) -> int:
    return sum(1 for s in m["sides"] if s >= PAPER_SIDE)


def classify(m: dict) -> list[str]:
    """The auto_drop reasons for one photo's measures; empty when it stays."""
    if "unreadable" in m:
        return ["unreadable"]
    reasons = []
    if m["saturation"] < GRAY_MAX:
        reasons.append("grayscale")
    elif (m["saturation"] < SEPIA_SAT_MAX and SEPIA_HUE[0] <= m["hue_deg"] <= SEPIA_HUE[1]
          and m["hue_r"] >= SEPIA_HUE_R and m["tint_cover"] >= SEPIA_COVER):
        reasons.append("sepia")
    if (page_score(m) >= PAGE_SIDES and m["saturation"] < PAGE_SAT_MAX and m["border_s"] >= PAGE_BORDER_S
            and m["hue_r"] >= PAGE_HUE_R):
        reasons.append("page")
    if min(m["width"], m["height"]) < MIN_SHORT_SIDE:
        reasons.append("small")
    return reasons


# ---------------------------------------------------------------------------------------------
# Measuring the set (cached by sha1 in images/raw/).
# ---------------------------------------------------------------------------------------------
def read_manifest(path: Path = MANIFEST_CSV) -> list[dict]:
    with open(path, encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def _measure_one(args: tuple[str, str]) -> tuple[str, dict | None, str]:
    sha1, file = args
    try:
        return sha1, measure(Path(file)), ""
    except Exception as exc:  # a broken file is reported, never guessed
        return sha1, None, f"{type(exc).__name__}: {exc}"


def measure_all(manifest: list[dict], images_dir: Path = IMAGES_DIR, stats_path: Path = STATS_JSON,
                workers: int = 4) -> dict[str, dict]:
    stats: dict[str, dict] = {}
    if stats_path.exists():
        cached = json.loads(stats_path.read_text(encoding="utf-8"))
        if cached.get("version") == MEASURE_VERSION:
            stats = cached["photos"]
    todo = [(m["sha1"], str(images_dir / m["file"])) for m in manifest if m["sha1"] not in stats]
    unreadable: dict[str, dict] = {}
    if todo:
        if workers > 1 and len(todo) > 50:
            with ProcessPoolExecutor(workers) as pool:
                results = list(pool.map(_measure_one, todo, chunksize=32))
        else:
            results = [_measure_one(t) for t in todo]
        for sha1, m, err in results:
            if m is None:
                unreadable[sha1] = {"unreadable": err}  # not cached: measured again next run
            else:
                stats[sha1] = m
        stats_path.parent.mkdir(parents=True, exist_ok=True)
        stats_path.write_text(json.dumps({"version": MEASURE_VERSION, "photos": stats}), encoding="utf-8")
    return {**stats, **unreadable}


def auto_rows(manifest: list[dict], stats: dict[str, dict]) -> list[dict]:
    out = []
    for m in manifest:
        s = stats[m["sha1"]]
        reasons = classify(s)
        if "unreadable" in s:
            out.append({"sha1": m["sha1"], "saturation": "", "white_frac": "", "black_frac": "", "page_score": "",
                        "auto_drop": "yes", "reason": "unreadable"})
            continue
        out.append({"sha1": m["sha1"], "saturation": f"{s['saturation']:.3f}", "white_frac": f"{s['white_frac']:.3f}",
                    "black_frac": f"{s['black_frac']:.3f}", "page_score": page_score(s),
                    "auto_drop": "yes" if reasons else "no", "reason": "; ".join(reasons)})
    return out


def write_csv(rows: list[dict], columns: list[str], path: Path) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=columns, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    tmp.replace(path)


def histogram(stats: dict[str, dict], width: float = 0.02, top: float = 0.5) -> str:
    counts = Counter(min(int(s["saturation"] / width), int(top / width)) for s in stats.values() if "saturation" in s)
    peak = max(counts.values()) if counts else 1
    lines = []
    for i in range(int(top / width) + 1):
        lo = i * width
        label = f"{lo:.2f}-{lo + width:.2f}" if i < int(top / width) else f"{top:.2f}+    "
        mark = " <- GRAY_MAX" if abs(lo + width - GRAY_MAX) < 1e-9 else ""
        lines.append(f"{label} {counts.get(i, 0):6d} {'#' * round(60 * counts.get(i, 0) / peak)}{mark}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------------------------
# labels.csv: the owner's rows and the auto rows.
# ---------------------------------------------------------------------------------------------
def read_labels(path: Path = LABELS_CSV) -> list[dict]:
    if not path.exists():
        return []
    with open(path, encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def forget_owner(labels_text: str, qids: set[str]) -> tuple[str, Counter]:
    """D2d: labels.csv's text without the owner rows of these types; every other line stays byte
    for byte. Returns the text and the rows removed per type."""
    lines = labels_text.splitlines(keepends=True)
    if not lines:
        return labels_text, Counter()
    header = next(csv.reader([lines[0]]))
    qi = header.index("qid")
    si = header.index("source") if "source" in header else None
    out, removed = [lines[0]], Counter()
    for line in lines[1:]:
        row = next(csv.reader([line]), [])
        source = row[si] if si is not None and si < len(row) else ""
        if len(row) > qi and row[qi] in qids and source in ("", "owner"):
            removed[row[qi]] += 1
            continue
        out.append(line)
    return "".join(out), removed


OWNER_SOURCES = ("owner", "owner-upload")  # D2e: owner-upload = a photo the owner took (ingest_own.py), keep


def is_owner(row: dict) -> bool:
    """A row the owner made: the review page's (source owner, or no source in a file from before
    D2c) or ingest_own.py's (owner-upload)."""
    return (row.get("source") or "owner") in OWNER_SOURCES


def merge(labels: list[dict], autos: list[dict], manifest: list[dict]) -> list[dict]:
    """The owner's rows unchanged and in their order, then one auto row per auto_drop photo the
    owner never decided (any decision, any time)."""
    owner = [{**{k: r.get(k, "") for k in LABEL_COLUMNS[:4]}, "source": r.get("source") or "owner"}
             for r in labels if is_owner(r)]
    decided = {r["sha1"] for r in owner}
    qid_of = {m["sha1"]: m["qid"] for m in manifest}
    added = [{"sha1": a["sha1"], "qid": qid_of[a["sha1"]], "decision": "drop", "decided_at": "", "source": "auto"}
             for a in autos if a["auto_drop"] == "yes" and a["sha1"] not in decided]
    return owner + added


def effective(labels: list[dict]) -> dict[str, tuple[str, str]]:
    """sha1 -> (decision, source): the owner's latest decision, else the auto decision. A photo
    with neither counts as keep (as on the review page)."""
    owner, auto = {}, {}
    for r in labels:
        if r.get("decision") not in DECISIONS:
            continue
        (owner if is_owner(r) else auto)[r["sha1"]] = r["decision"]
    out = {s: (d, "auto") for s, d in auto.items()}
    out.update({s: (d, "owner") for s, d in owner.items()})
    return out


def kept_by_type(manifest: list[dict], labels: list[dict]) -> dict[str, list[str]]:
    """qid -> the sha1s whose effective decision is keep (undecided counts as keep)."""
    eff = effective(labels)
    out: dict[str, list[str]] = defaultdict(list)
    for m in manifest:
        if eff.get(m["sha1"], ("keep", ""))[0] == "keep":
            out[m["qid"]].append(m["sha1"])
    return dict(out)


def report(manifest: list[dict], labels: list[dict], autos: list[dict], rows: list[dict]) -> dict:
    eff = effective(labels)
    auto_yes = {a["sha1"]: a["reason"] for a in autos if a["auto_drop"] == "yes"}
    by_reason = Counter(r for reason in auto_yes.values() for r in reason.split("; "))
    meta = {r["qid"]: r for r in rows}
    per_type = {}
    for m in manifest:
        t = per_type.setdefault(m["qid"], {"qid": m["qid"], "english_name": m["english_name"], "photos": 0,
                                           "owner_keep": 0, "owner_drop": 0, "owner_not_sure": 0,
                                           "auto_drop_added": 0, "auto_drop_overruled": 0, "remaining": 0,
                                           "launch": meta.get(m["qid"], {}).get("priority") == "launch"})
        t["photos"] += 1
        decision, source = eff.get(m["sha1"], ("keep", ""))
        if source == "owner":
            t["owner_" + decision] += 1
            if m["sha1"] in auto_yes:
                t["auto_drop_overruled"] += 1
        elif source == "auto":
            t["auto_drop_added"] += 1
        if decision == "keep":
            t["remaining"] += 1
    types = sorted(per_type.values(), key=lambda t: (t["remaining"], t["english_name"].casefold()))
    launch = [t for t in types if t["launch"]]
    owner_rows = [r for r in labels if is_owner(r)]
    return {
        "photos": len(manifest),
        "auto_drop": {"photos": len(auto_yes), "by_reason": dict(by_reason.most_common()),
                      "added_to_labels": sum(1 for _, s in eff.values() if s == "auto"),
                      "overruled_by_owner": sum(t["auto_drop_overruled"] for t in types)},
        "owner": {"rows": len(owner_rows), "photos": sum(1 for _, s in eff.values() if s == "owner"),
                  **Counter(d for d, s in eff.values() if s == "owner")},
        "remaining": sum(t["remaining"] for t in types),
        "fewest_launch": [{k: t[k] for k in ("qid", "english_name", "photos", "remaining")} for t in launch[:20]],
        "types": types,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Mark grayscale, sepia, page-scan and small photos; merge into labels.csv.")
    parser.add_argument("--histogram", action="store_true", help="print the saturation histogram")
    parser.add_argument("--no-merge", action="store_true", help="write auto_filter.csv only; leave labels.csv")
    parser.add_argument("--workers", type=int, default=4, help="processes for measuring (default 4)")
    parser.add_argument("--report", type=Path, default=IMAGES_DIR / "raw" / "auto_filter_report.json",
                        help="where the full per-type report goes (default images/raw/)")
    parser.add_argument("--forget-owner", metavar="QID[,QID...]",
                        help="first remove the owner's rows for these types from labels.csv (D2d); nothing else changes")
    args = parser.parse_args(argv)
    if args.forget_owner:
        qids = {q.strip() for q in args.forget_owner.split(",") if q.strip()}
        with open(LABELS_CSV, encoding="utf-8", newline="") as fh:
            text, removed = forget_owner(fh.read(), qids)
        with open(LABELS_CSV, "w", encoding="utf-8", newline="") as fh:
            fh.write(text)
        print(json.dumps({"owner_rows_removed": dict(removed)}))
    manifest = read_manifest()
    stats = measure_all(manifest, workers=args.workers)
    if args.histogram:
        print(histogram({m["sha1"]: stats[m["sha1"]] for m in manifest}))
    autos = auto_rows(manifest, stats)
    write_csv(autos, AUTO_COLUMNS, AUTO_CSV)
    labels = read_labels()
    if not args.no_merge:
        labels = merge(labels, autos, manifest)
        write_csv(labels, LABEL_COLUMNS, LABELS_CSV)
    rows = json.loads(TAXONOMY_JSON.read_text(encoding="utf-8"))
    rep = report(manifest, labels, autos, rows)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(rep, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({k: v for k, v in rep.items() if k != "types"}, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
