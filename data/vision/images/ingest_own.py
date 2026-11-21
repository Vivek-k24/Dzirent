"""D2e: the owner's own photos, from H:\\DziRent\\vision-own\\<type name>\\.

Each subfolder's name is a type's English name in ../taxonomy/review.csv, matched exactly but
ignoring case. A folder that matches no type, or more than one, is reported and skipped; so is a
file that isn't a JPEG (.jpg, .jpeg, .jfif), PNG or WebP, or doesn't decode.

Each photo is
- turned upright by its EXIF orientation, and converted to sRGB when it carries a colour profile;
- resized so its long side is at most 1600 px (never enlarged);
- saved with no metadata at all (no EXIF, so no location, device or time; no XMP, comments or
  colour profile) as files/<qid>/<sha1>.<ext>, where sha1 is the original file's, so a second run
  adds nothing;
- recorded in manifest.csv with source owner, license "owner", author "Dzirent owner" and no
  URLs, and in labels.csv as keep with source owner-upload (an owner decision: the auto-filter
  never overrules it).
split.py puts every photo with source owner in train, never in test. CREDITS.md counts them.
Nothing is uploaded anywhere.

    python images/ingest_own.py --dry-run   # what would be added, per type; writes nothing
    python images/ingest_own.py             # copy, record, then run auto_filter.py and split.py
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageCms, ImageOps

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fetch_commons as fc  # noqa: E402

IMAGES_DIR = fc.IMAGES_DIR
OWN_DIR = Path(r"H:\DziRent\vision-own")
REVIEW_CSV = IMAGES_DIR.parent / "taxonomy" / "review.csv"
LABELS_CSV = IMAGES_DIR / "labels.csv"
LABEL_COLUMNS = ["sha1", "qid", "decision", "decided_at", "source"]
LONG_SIDE = 1600
EXTENSIONS = {".jpg": "JPEG", ".jpeg": "JPEG", ".jfif": "JPEG", ".png": "PNG", ".webp": "WEBP"}
SAVE_AS = {"JPEG": ".jpg", "PNG": ".png", "WEBP": ".webp"}
SOURCE, LICENSE, AUTHOR, LABEL_SOURCE = "owner", "owner", "Dzirent owner", "owner-upload"


def load_types(review_csv: Path = REVIEW_CSV) -> list[dict]:
    with open(review_csv, encoding="utf-8-sig", newline="") as fh:
        return list(csv.DictReader(fh))


def match_folders(own_dir: Path, rows: list[dict]) -> tuple[dict[Path, dict], dict[str, str]]:
    """({folder: review row} for the folders that name exactly one type, {folder name: why} for the rest)."""
    by_name: dict[str, list[dict]] = {}
    for r in rows:
        by_name.setdefault(r["english_name"].strip().casefold(), []).append(r)
    matched, skipped = {}, {}
    for folder in sorted(p for p in own_dir.iterdir() if p.is_dir()):
        hits = by_name.get(folder.name.strip().casefold(), [])
        if len(hits) == 1:
            matched[folder] = hits[0]
        else:
            skipped[folder.name] = "matches no type in review.csv" if not hits else \
                "matches more than one type: " + ", ".join(f"{h['english_name']} ({h['qid']})" for h in hits)
    return matched, skipped


def clean_copy(content: bytes) -> tuple[Image.Image, str]:
    """The photo upright, in sRGB, at most LONG_SIDE px long, with no metadata; and its format."""
    with Image.open(io.BytesIO(content)) as probe:
        fmt = probe.format
        probe.load()
        im = ImageOps.exif_transpose(probe)  # applies the orientation tag
        icc = probe.info.get("icc_profile")
    if fmt not in SAVE_AS:
        raise ValueError(f"format {fmt}")
    if icc:
        try:
            src = ImageCms.ImageCmsProfile(io.BytesIO(icc))
            mode = "RGBA" if im.mode in ("RGBA", "LA", "PA") else "RGB"
            im = ImageCms.profileToProfile(im.convert(mode), src, ImageCms.createProfile("sRGB"), outputMode=mode)
        except Exception:  # an unreadable profile: the pixels are kept as they are
            pass
    if max(im.size) > LONG_SIDE:
        scale = LONG_SIDE / max(im.size)
        im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
    if fmt == "JPEG" and im.mode not in ("RGB", "L"):
        im = im.convert("RGB")
    im.info = {}  # nothing of the original's metadata may be written back (EXIF, XMP, ICC, text)
    return im, fmt


def save_clean(im: Image.Image, fmt: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if fmt == "JPEG":
        im.save(dest, "JPEG", quality=92)
    elif fmt == "WEBP":
        im.save(dest, "WEBP", quality=92)
    else:
        im.save(dest, "PNG")


def append_labels(rows: list[dict], path: Path = LABELS_CSV) -> None:
    """Appends with the file's own header (a four-column file stays four columns), LF endings."""
    if path.exists() and path.stat().st_size:
        with open(path, encoding="utf-8", newline="") as fh:
            header = next(csv.reader(fh))
        new = False
    else:
        header, new = LABEL_COLUMNS, True
    with open(path, "a", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=header, extrasaction="ignore", lineterminator="\n")
        if new:
            writer.writeheader()
        writer.writerows(rows)


def ingest(own_dir: Path = OWN_DIR, *, rows: list[dict] | None = None, manifest_path: Path = fc.MANIFEST_CSV,
           files_dir: Path = fc.FILES_DIR, labels_path: Path = LABELS_CSV, credits_path: Path | None = fc.CREDITS_MD,
           dry_run: bool = False, now=lambda: datetime.now(timezone.utc)) -> dict:
    rows = load_types() if rows is None else rows
    matched, skipped_folders = match_folders(own_dir, rows)
    manifest = fc.read_manifest(manifest_path) if manifest_path.exists() else []
    taken = {m["sha1"] for m in manifest}
    stamp = now().strftime("%Y-%m-%dT%H:%M:%SZ")
    per_type, labels = {}, []
    for folder, row in matched.items():
        counts = {"qid": row["qid"], "folder": folder.name, "added": 0, "skipped": Counter(), "under_300": 0}
        per_type[row["english_name"]] = counts
        for path in sorted(p for p in folder.iterdir() if p.is_file()):
            if path.suffix.lower() not in EXTENSIONS:
                counts["skipped"]["not a JPEG, PNG or WebP"] += 1
                continue
            content = path.read_bytes()
            sha1 = hashlib.sha1(content).hexdigest()
            if sha1 in taken:
                counts["skipped"]["already in the manifest"] += 1
                continue
            try:
                im, fmt = clean_copy(content)
            except Exception:
                counts["skipped"]["unreadable"] += 1
                continue
            taken.add(sha1)
            counts["added"] += 1
            counts["under_300"] += min(im.size) < fc.MIN_SIDE
            if dry_run:
                continue
            dest = files_dir / row["qid"] / f"{sha1}{SAVE_AS[fmt]}"
            save_clean(im, fmt, dest)
            if not fc.decodes(dest):
                dest.unlink(missing_ok=True)
                taken.discard(sha1)
                counts["added"] -= 1
                counts["skipped"]["unreadable"] += 1
                continue
            entry = {"qid": row["qid"], "english_name": row["english_name"], "dzirent_category": row["dzirent_category"],
                     "allowed": row["allowed"], "sha1": sha1, "file": dest.relative_to(files_dir.parent).as_posix(),
                     "width": im.width, "height": im.height, "license": LICENSE, "author": AUTHOR,
                     "source_url": "", "commons_page_url": "", "downloaded_at": stamp, "source": SOURCE}
            fc.append_manifest(entry, manifest_path)
            manifest.append(entry)
            labels.append({"sha1": sha1, "qid": row["qid"], "decision": "keep", "decided_at": stamp,
                           "source": LABEL_SOURCE})
    if labels:
        append_labels(labels, labels_path)
        if credits_path is not None:
            fc.write_credits(manifest, credits_path)
    return {"dry_run": dry_run, "folders_skipped": skipped_folders,
            "types": {n: {**c, "skipped": dict(c["skipped"])} for n, c in per_type.items()},
            "added": sum(c["added"] for c in per_type.values())}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Add the owner's own photos (H:\\DziRent\\vision-own) as train-only keeps.")
    parser.add_argument("--dry-run", action="store_true", help="report what would be added; write nothing")
    parser.add_argument("--from", dest="own_dir", type=Path, default=OWN_DIR, help="the folder of type folders")
    args = parser.parse_args(argv)
    if not args.own_dir.is_dir():
        print(f"{args.own_dir} doesn't exist: no owner photos to add.")
        return 0
    print(json.dumps(ingest(args.own_dir, dry_run=args.dry_run), ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
