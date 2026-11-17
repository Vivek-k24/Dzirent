#!/usr/bin/env python3
"""
fetch_commons.py (D2)
Downloads photos of the clothing types in ../taxonomy/taxonomy.json from Wikimedia Commons, with
a license check on every file.

For each type, in this order, until the type has its target:
1. its Wikidata image (P18);
2. the files directly in its Commons category (P373);
3. the files directly in each subcategory of that category (one level down, never deeper).

Targets: needs_owner = yes rows (the launch types and the keep list) 80 each; not-allowed rows
40 each (they are the negatives); every other allowed row 12. Review rows and rows the owner
marked keep = no get none. Types are fetched in that order, so a photo two types share goes to
the first.

A file is taken only when:
- its Commons license (the machine-readable "License" field of its metadata) is CC0, CC BY or
  CC BY-SA (any version) or public domain; anything else, or no such field, is skipped;
- it is a JPEG, PNG or WebP (never SVG, GIF, TIFF, PDF, video or audio);
- its short side, and the short side of what is saved, are at least 300 px;
- its sha1 (as Commons reports it) isn't taken yet, by this type or any other.

Saved as files/<qid>/<sha1>.<ext>: Commons' 1280 px wide rendition, or the original when the
original is no wider (never enlarged). Every file gets a row in manifest.csv, and CREDITS.md is
rewritten from the manifest after each run.

Polite: a User-Agent naming the project and its contact, at most 2 requests a second (API calls
and downloads together), exponential back-off on 429 and 5xx (honouring Retry-After), and every
API response cached under raw/, one JSON file per call. Resumable: a type that already has its
target in the manifest is skipped, a file whose sha1 is in the manifest is never fetched again,
and a re-run reads every listing from the cache.

    python images/fetch_commons.py --dry-run         # counts only, no downloads
    python images/fetch_commons.py --only-launch     # the needs_owner = yes rows only
    python images/fetch_commons.py --limit-per-type 5
"""

import argparse
import csv
import hashlib
import json
import logging
import re
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit, urlunsplit

import requests

IMAGES_DIR = Path(__file__).resolve().parent
TAXONOMY_JSON = IMAGES_DIR.parent / "taxonomy" / "taxonomy.json"
FILES_DIR = IMAGES_DIR / "files"
RAW_DIR = IMAGES_DIR / "raw"
MANIFEST_CSV = IMAGES_DIR / "manifest.csv"
CREDITS_MD = IMAGES_DIR / "CREDITS.md"

API_URL = "https://commons.wikimedia.org/w/api.php"
USER_AGENT = "DziRentVisionData/0.1 (Dzirent clothing photo set; support@dzirent.com)"

# The sheet parts that carry needs_owner = yes in review.csv (build_taxonomy.NEEDS_OWNER_GROUPS).
NEEDS_OWNER_GROUPS = ("launch", "keep")
TARGETS = {"launch": 80, "not_allowed": 40, "allowed": 12}
TIER_ORDER = ["launch", "not_allowed", "allowed"]

MIN_SIDE = 300
RENDITION_WIDTH = 1280  # one of Wikimedia's standard thumbnail widths
FILE_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
EXTMETADATA = "License|LicenseShortName|LicenseUrl|Artist|Credit"
CATEGORY_PAGE = 50

MIN_INTERVAL = 0.5  # seconds between two requests: at most 2 a second
MAX_TRIES = 6
FIRST_BACKOFF = 2.0

MANIFEST_COLUMNS = ["qid", "english_name", "dzirent_category", "allowed", "sha1", "file", "width", "height",
                    "license", "author", "source_url", "commons_page_url", "downloaded_at"]

logger = logging.getLogger("fetch_commons")

# ---------------------------------------------------------------------------------------------
# The license policy. Commons' machine-readable codes look like "cc-by-sa-4.0", "cc-by-2.0",
# "cc-by-sa-3.0-de", "cc0" and "pd". Anything else (GFDL alone, Free Art, "attribution", NC or ND
# variants, which Commons doesn't host anyway) is refused.
# ---------------------------------------------------------------------------------------------
_VERSION = r"\d+(\.\d+)?(,\d+(\.\d+)?)*"
LICENSE_FAMILIES = [
    (re.compile(r"cc0(-1\.0)?"), "CC0"),
    (re.compile(r"pd(-[a-z0-9-]+)?|public ?domain"), "Public domain"),
    (re.compile(rf"cc-by-sa-{_VERSION}(-[a-z]+)*"), "CC BY-SA"),
    (re.compile(rf"cc-by-{_VERSION}(-[a-z]+)*"), "CC BY"),
]


def license_family(code: str | None) -> str | None:
    """CC0, Public domain, CC BY or CC BY-SA for a code the policy accepts, else None."""
    text = (code or "").strip().lower()
    if not text:
        return None
    for rx, family in LICENSE_FAMILIES:
        if rx.fullmatch(text):
            return family
    return None


def license_url(name: str) -> str | None:
    """The deed of a license named the way Commons names it ("CC BY-SA 3.0 de", "CC0")."""
    m = re.fullmatch(r"CC (BY(?:-SA)?) (\d+\.\d+)(?: ([a-z]{2}))?", name.strip(), re.I)
    if m:
        return (f"https://creativecommons.org/licenses/{m.group(1).lower()}/{m.group(2)}/"
                + (f"{m.group(3).lower()}/" if m.group(3) else ""))
    if name.strip().upper() in ("CC0", "CC0 1.0"):
        return "https://creativecommons.org/publicdomain/zero/1.0/"
    return None


class _TextOnly(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self.parts.append(data)


def plain_text(html: str | None) -> str:
    """Commons' Artist and Credit fields are HTML; this keeps their text."""
    parser = _TextOnly()
    parser.feed(html or "")
    parser.close()
    return re.sub(r"\s+", " ", unescape("".join(parser.parts))).strip()


def meta_value(meta: dict, field: str) -> str:
    value = (meta.get(field) or {}).get("value")
    return value.strip() if isinstance(value, str) else ""


def clean_url(url: str) -> str:
    """Commons adds tracking parameters (utm_*) to its file URLs; the file is the same without."""
    parts = urlsplit(url)
    return urlunsplit((parts.scheme or "https", parts.netloc, parts.path, "", ""))


def check_file(page: dict) -> tuple[dict | None, str]:
    """A Commons file page (with imageinfo) -> (what to download, "") or (None, why it's skipped)."""
    info = (page.get("imageinfo") or [{}])[0]
    if info.get("mime") not in FILE_TYPES:
        return None, "format"
    width, height = int(info.get("width") or 0), int(info.get("height") or 0)
    if min(width, height) < MIN_SIDE:
        return None, "small"
    meta = info.get("extmetadata") or {}
    code = meta_value(meta, "License")
    if not code:
        return None, "no machine-readable license"
    family = license_family(code)
    if not family:
        return None, "license"
    if width > RENDITION_WIDTH and info.get("thumburl"):
        url, saved_w, saved_h = info["thumburl"], int(info.get("thumbwidth") or 0), int(info.get("thumbheight") or 0)
    else:
        url, saved_w, saved_h = info.get("url"), width, height
    if not url or min(saved_w, saved_h) < MIN_SIDE:
        return None, "small"
    sha1 = (info.get("sha1") or "").lower()
    if not re.fullmatch(r"[0-9a-f]{40}", sha1):
        return None, "no sha1"
    author = plain_text(meta_value(meta, "Artist")) or plain_text(meta_value(meta, "Credit"))
    return {
        "sha1": sha1,
        "url": clean_url(url),
        "width": saved_w,
        "height": saved_h,
        "mime": info["mime"],
        "license": meta_value(meta, "LicenseShortName") or family,
        "license_family": family,
        "author": (author or "Unknown author (see the Commons page)")[:300],
        "commons_page_url": clean_url(info.get("descriptionurl") or ""),
        "title": page.get("title", ""),
    }, ""


# ---------------------------------------------------------------------------------------------
# Commons access.
# ---------------------------------------------------------------------------------------------
class Commons:
    """The Commons API (cached, one JSON per call) and file downloads, rate-limited together."""

    def __init__(self, raw_dir: Path = RAW_DIR, session=None, min_interval: float = MIN_INTERVAL,
                 sleep=time.sleep, clock=time.monotonic) -> None:
        self.raw_dir = raw_dir
        self.session = session or requests.Session()
        self.session.headers["User-Agent"] = USER_AGENT
        self.min_interval = min_interval
        self.sleep, self.clock = sleep, clock
        self._last = None
        self.requests_made = 0
        self.cache_hits = 0
        self.bytes_downloaded = 0

    def _wait_turn(self) -> None:
        if self._last is not None:
            wait = self._last + self.min_interval - self.clock()
            if wait > 0:
                self.sleep(wait)
        self._last = self.clock()

    def _get(self, url: str, params: dict | None = None, timeout: float = 60):
        backoff = FIRST_BACKOFF
        for attempt in range(1, MAX_TRIES + 1):
            self._wait_turn()
            try:
                resp = self.session.get(url, params=params, timeout=timeout)
            except requests.RequestException as e:
                logger.warning("request failed (%s), retrying in %.0f s", e, backoff)
                self.sleep(backoff)
                backoff *= 2
                continue
            self.requests_made += 1
            if resp.status_code == 429 or resp.status_code >= 500:
                wait = max(backoff, float(resp.headers.get("Retry-After", 0) or 0))
                logger.warning("HTTP %s (attempt %d/%d), waiting %.0f s", resp.status_code, attempt, MAX_TRIES, wait)
                self.sleep(wait)
                backoff *= 2
                continue
            return resp
        raise RuntimeError(f"gave up after {MAX_TRIES} tries: {url}")

    def api(self, kind: str, label: str, params: dict) -> dict:
        full = {"action": "query", "format": "json", "formatversion": "2", **params}
        key = hashlib.sha1(json.dumps(full, sort_keys=True).encode("utf-8")).hexdigest()[:16]
        slug = re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")[:60]
        path = self.raw_dir / kind / f"{slug}_{key}.json"
        if path.exists():
            self.cache_hits += 1
            return json.loads(path.read_text(encoding="utf-8"))["response"]
        resp = self._get(API_URL, full)
        resp.raise_for_status()
        data = resp.json()
        if "error" in data:
            raise RuntimeError(f"Commons API error for {label}: {data['error']}")
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps({"params": full, "response": data}, ensure_ascii=False), encoding="utf-8")
        tmp.replace(path)
        return data

    def download(self, url: str, dest_stem: Path) -> Path | None:
        """Saves the file as dest_stem + the extension its Content-Type gives; None on 404/410 or
        when it isn't one of the accepted image types."""
        resp = self._get(url, timeout=120)
        if resp.status_code in (404, 410):
            return None
        resp.raise_for_status()
        ext = FILE_TYPES.get(resp.headers.get("Content-Type", "").split(";")[0].strip().lower())
        if not ext or not resp.content:
            return None
        dest = dest_stem.with_suffix(ext)
        dest.parent.mkdir(parents=True, exist_ok=True)
        tmp = dest.with_suffix(ext + ".part")
        tmp.write_bytes(resp.content)
        tmp.replace(dest)
        self.bytes_downloaded += len(resp.content)
        return dest


IMAGEINFO = {"prop": "imageinfo", "iiprop": "url|size|sha1|mime|extmetadata", "iiurlwidth": str(RENDITION_WIDTH),
             "iiextmetadatafilter": EXTMETADATA, "iiextmetadatalanguage": "en"}


def file_pages(client: Commons, kind: str, label: str, params: dict):
    """Yields file pages with imageinfo, following continuation, one cached call per page."""
    cont: dict = {}
    seen: set[str] = set()
    while True:
        data = client.api(kind, label, {**params, **IMAGEINFO, **cont})
        for page in data.get("query", {}).get("pages", []):
            title = page.get("title", "")
            if page.get("imageinfo") and title not in seen:
                seen.add(title)
                yield page
        if "continue" not in data:
            return
        cont = data["continue"]


def subcategories(client: Commons, category: str):
    cont: dict = {}
    while True:
        data = client.api("subcats", category, {"list": "categorymembers", "cmtitle": category, "cmtype": "subcat",
                                                "cmlimit": "500", **cont})
        for member in data.get("query", {}).get("categorymembers", []):
            yield member["title"]
        if "continue" not in data:
            return
        cont = data["continue"]


def category_title(name: str) -> str:
    name = name.strip()
    return name if name.lower().startswith("category:") else f"Category:{name}"


def candidates(client: Commons, row: dict):
    """(source, file page) for a type: its P18 image, its category's files, then each direct
    subcategory's files. Lazy: nothing is requested past the point the caller stops."""
    if row.get("image"):
        title = f"File:{row['image']}"
        for page in file_pages(client, "fileinfo", row["image"], {"titles": title, "redirects": "1"}):
            yield "P18", page
    if row.get("commons_category"):
        category = category_title(row["commons_category"])
        listing = {"generator": "categorymembers", "gcmtype": "file", "gcmlimit": str(CATEGORY_PAGE)}
        for page in file_pages(client, "files", category, {**listing, "gcmtitle": category}):
            yield "category", page
        for sub in subcategories(client, category):
            for page in file_pages(client, "files", sub, {**listing, "gcmtitle": sub}):
                yield "subcategory", page


# ---------------------------------------------------------------------------------------------
# The manifest and the credits.
# ---------------------------------------------------------------------------------------------
def read_manifest(path: Path = MANIFEST_CSV) -> list[dict]:
    if not path.exists():
        return []
    with open(path, encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def append_manifest(row: dict, path: Path = MANIFEST_CSV) -> None:
    new = not path.exists()
    with open(path, "a", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=MANIFEST_COLUMNS, lineterminator="\n")
        if new:
            writer.writeheader()
        writer.writerow(row)


def commons_title(page_url: str) -> str:
    return unquote(page_url.rsplit("/wiki/", 1)[-1]).replace("_", " ") if "/wiki/" in page_url else page_url


def write_credits(manifest: list[dict], path: Path = CREDITS_MD) -> None:
    """CREDITS.md from the manifest: one section per license, one line per file."""
    by_license: dict[str, list[dict]] = {}
    for m in manifest:
        by_license.setdefault(m["license"], []).append(m)
    lines = [
        "# Image credits",
        "",
        "The photos in `data/vision/images/files/` come from Wikimedia Commons. They are not in this repository:",
        "`data/vision/images/fetch_commons.py` downloads them. Each is used under its own license, given below with",
        "its author and its Commons page, where the full license and any other credit are stated. Each file is",
        "Commons' 1280-pixel-wide rendition, or the original when that is no wider; nothing else is changed.",
        "",
        "Written by `fetch_commons.py` from `manifest.csv`; don't edit by hand.",
        "",
        f"**{len(manifest)} files:** " + ", ".join(f"{name} {len(rows)}" for name, rows in
                                                  sorted(by_license.items(), key=lambda kv: (-len(kv[1]), kv[0]))) + ".",
    ]
    for name in sorted(by_license, key=lambda n: (-len(by_license[n]), n)):
        rows = sorted(by_license[name], key=lambda m: (m["english_name"].lower(), m["qid"], commons_title(m["commons_page_url"])))
        url = license_url(name)
        lines += ["", f"## {name}" + (f" ({url})" if url else ""), ""]
        for m in rows:
            title = commons_title(m["commons_page_url"]).replace("[", "(").replace("]", ")")
            author = m["author"].replace("[", "(").replace("]", ")")
            lines.append(f"- [{title}]({m['commons_page_url']}) by {author}; for {m['english_name']} ({m['qid']})")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")


# ---------------------------------------------------------------------------------------------
# The run.
# ---------------------------------------------------------------------------------------------
def tier_of(row: dict) -> str | None:
    if row.get("keep") == "no":
        return None
    if row.get("sheet_group") in NEEDS_OWNER_GROUPS:
        return "launch"
    if row.get("allowed") in ("not_allowed", "allowed"):
        return row["allowed"]
    return None  # review rows get no photos yet


def plan(rows: list[dict], only_launch: bool = False, limit: int | None = None) -> list[tuple[dict, str, int]]:
    out = []
    for tier in TIER_ORDER:
        if only_launch and tier != "launch":
            continue
        for row in rows:
            if tier_of(row) == tier:
                target = TARGETS[tier] if limit is None else min(TARGETS[tier], limit)
                out.append((row, tier, target))
    return out


def run(client: Commons, rows: list[dict], *, dry_run: bool = False, only_launch: bool = False,
        limit: int | None = None, manifest_path: Path = MANIFEST_CSV, files_dir: Path = FILES_DIR,
        credits_path: Path = CREDITS_MD, now=lambda: datetime.now(timezone.utc)) -> list[dict]:
    """Fetches (or, with dry_run, only counts) every planned type; returns one result per type."""
    manifest = read_manifest(manifest_path)
    taken = {m["sha1"] for m in manifest}
    have = Counter(m["qid"] for m in manifest)
    results = []
    for row, tier, target in plan(rows, only_launch, limit):
        qid, name = row["qid"], row["english_name"]
        need = target - have[qid]
        result = {"qid": qid, "english_name": name, "tier": tier, "target": target, "had": have[qid],
                  "added": 0, "skipped": Counter(), "licenses": Counter()}
        results.append(result)
        if need <= 0:
            continue
        if not row.get("image") and not row.get("commons_category"):
            result["skipped"]["no image or Commons category"] += 1
        for source, page in candidates(client, row):
            cand, why = check_file(page)
            if not cand:
                result["skipped"][why] += 1
                continue
            if cand["sha1"] in taken:
                result["skipped"]["duplicate"] += 1
                continue
            if not dry_run:
                saved = client.download(cand["url"], files_dir / qid / cand["sha1"])
                if not saved:
                    result["skipped"]["download failed"] += 1
                    continue
                entry = {"qid": qid, "english_name": name, "dzirent_category": row["dzirent_category"],
                         "allowed": row["allowed"], "sha1": cand["sha1"],
                         "file": saved.relative_to(files_dir.parent).as_posix(), "width": cand["width"],
                         "height": cand["height"], "license": cand["license"], "author": cand["author"],
                         "source_url": cand["url"], "commons_page_url": cand["commons_page_url"],
                         "downloaded_at": now().strftime("%Y-%m-%dT%H:%M:%SZ")}
                append_manifest(entry, manifest_path)
                manifest.append(entry)
            taken.add(cand["sha1"])
            result["added"] += 1
            result["licenses"][cand["license_family"]] += 1
            if result["added"] >= need:
                break
        total = result["had"] + result["added"]
        result["short"] = max(0, target - total)
        logger.info("%s %s [%s]: %d/%d%s%s", qid, name, tier, total, target,
                    f", short by {result['short']}" if result["short"] else "",
                    (" (skipped: " + ", ".join(f"{k} {v}" for k, v in result["skipped"].most_common()) + ")")
                    if result["skipped"] else "")
    for r in results:
        r.setdefault("short", max(0, r["target"] - r["had"]))
    if not dry_run and manifest:
        write_credits(manifest, credits_path)
    return results


def summarize(results: list[dict], client: Commons, dry_run: bool) -> dict:
    by_tier = {}
    for tier in TIER_ORDER:
        rs = [r for r in results if r["tier"] == tier]
        if rs:
            by_tier[tier] = {"types": len(rs), "target": sum(r["target"] for r in rs),
                             "had": sum(r["had"] for r in rs), "added": sum(r["added"] for r in rs),
                             "short_types": sum(1 for r in rs if r["short"]), "short_images": sum(r["short"] for r in rs),
                             "no_images": sum(1 for r in rs if r["had"] + r["added"] == 0)}
    licenses = Counter()
    for r in results:
        licenses.update(r["licenses"])
    return {"dry_run": dry_run, "by_tier": by_tier, "licenses_added": dict(licenses.most_common()),
            "requests": client.requests_made, "cache_hits": client.cache_hits,
            "bytes_downloaded": client.bytes_downloaded}


def load_rows(path: Path = TAXONOMY_JSON) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Download licensed Commons photos for the clothing types.")
    parser.add_argument("--only-launch", action="store_true", help="only the needs_owner = yes rows (launch types and keep list)")
    parser.add_argument("--limit-per-type", type=int, metavar="N", help="at most N photos per type (below its target)")
    parser.add_argument("--dry-run", action="store_true", help="count what is available; download nothing")
    args = parser.parse_args(argv)
    if args.limit_per_type is not None and args.limit_per_type < 1:
        parser.error("--limit-per-type must be at least 1")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    started = time.time()
    client = Commons()
    results = run(client, load_rows(), dry_run=args.dry_run, only_launch=args.only_launch, limit=args.limit_per_type)
    summary = summarize(results, client, args.dry_run)
    summary["seconds"] = round(time.time() - started, 1)
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    report = {"summary": summary, "types": [{**r, "skipped": dict(r["skipped"]), "licenses": dict(r["licenses"])}
                                            for r in results]}
    (RAW_DIR / ("last_dry_run.json" if args.dry_run else "last_run.json")).write_text(
        json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(summary, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
