"""D2d: Openverse as a second photo source for the launch types still short after the owner's check.

Targets: the types with needs_owner = yes and priority = launch in ../taxonomy/review.csv (in its
order) that have fewer than 40 kept photos: kept or undecided, as auto_filter.kept_by_type counts
them. Each target is filled up to 80 kept-or-undecided photos across all sources.

For each target it searches Openverse's image API (https://api.openverse.org/v1/images/) for the
type's English name, then each of its also_called names (as fetch_commons.search_names gives them;
a name of several words as a quoted phrase), up to 5 pages of 20 each, best match first:
- licenses cc0, by, by-sa (any version) and pdm only, asked for and checked again per result;
  Wikimedia is left out (Commons is the first source already); nothing marked mature;
- the file at the result's `url` (its source site) must be a JPEG, PNG or WebP that decodes, with a
  short side of at least 300 px; it is saved at most 1280 px wide (never enlarged) as
  images/files/<qid>/<sha1>.<ext>, the sha1 being that of the downloaded file; a sha1 already in
  the manifest is skipped;
- each saved photo goes through auto_filter's rules at once: one it would auto_drop is kept on
  disk and in the manifest (the auto-filter marks it) but doesn't count toward the 80.

Each photo gets a manifest row (source "openverse"; license as "CC BY 2.0", "CC0 1.0",
"Public Domain Mark 1.0"; author = creator; source_url = the file's URL; commons_page_url = the
foreign landing page) and a row in images/openverse.csv (sha1, openverse_id, qid, title, license,
license_version, license_url, creator, creator_url, source_site, foreign_landing_url, url).
CREDITS.md is rewritten with an Openverse section crediting creator and source site per file.
Then run auto_filter.py (it measures the new photos only) and split.py.

Openverse's limits: anonymous 20 requests a minute and 200 a day (the x-ratelimit headers,
2026-11-18), too few for this run. With OPENVERSE_CLIENT_ID and OPENVERSE_CLIENT_SECRET in
H:\\DziRent\\secrets\\providers.env (or the environment) it gets a token and runs registered;
without them it stops and prints the registration steps. Politeness: the same User-Agent as
fetch_commons.py (support@dzirent.com), one request at a time, 1 s between API calls and 0.5 s
between downloads, back-off on 429 (Retry-After) and 5xx, and a clean stop when the API says
fewer than 5 requests are left today. Every API response is cached in images/raw/openverse/.

    python images/fetch_openverse.py --dry-run          # the targets and the most API calls, no network
    python images/fetch_openverse.py --max-minutes 8.5  # fetch, in foreground pieces like fetch_commons.py
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import logging
import os
import re
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import requests
from PIL import Image, ImageOps

sys.path.insert(0, str(Path(__file__).resolve().parent))
import auto_filter as af  # noqa: E402
import fetch_commons as fc  # noqa: E402
from review_server import launch_order  # noqa: E402

logger = logging.getLogger("fetch_openverse")

IMAGES_DIR = fc.IMAGES_DIR
API_URL = "https://api.openverse.org/v1/images/"
TOKEN_URL = "https://api.openverse.org/v1/auth_tokens/token/"
REGISTER_URL = "https://api.openverse.org/v1/auth_tokens/register/"
SECRETS_ENV = Path(r"H:\DziRent\secrets\providers.env")
OPENVERSE_CSV = IMAGES_DIR / "openverse.csv"
RAW_DIR = IMAGES_DIR / "raw" / "openverse"
OPENVERSE_COLUMNS = ["sha1", "openverse_id", "qid", "title", "license", "license_version", "license_url", "creator",
                     "creator_url", "source_site", "foreign_landing_url", "url"]

LICENSES = ("by", "by-sa", "cc0", "pdm")
EXCLUDED_SOURCES = "wikimedia"
BELOW = 40           # a launch type with fewer kept-or-undecided photos is a target
CAP = 80             # kept-or-undecided photos per type, all sources together
PAGE_SIZE = 20       # the anonymous maximum; registered users may ask for more
MAX_PAGES = 5
API_INTERVAL = 1.0
DOWNLOAD_INTERVAL = 0.5
MAX_TRIES = 6
FIRST_BACKOFF = 2.0
RESERVE = 5          # stop when fewer requests than this are left today
ANON_PER_DAY = 200
FORMATS = {"JPEG": ".jpg", "PNG": ".png", "WEBP": ".webp"}

REGISTRATION_STEPS = r"""Openverse allows anonymous use only up to 20 requests a minute and 200 a day; this run
needs up to {calls}. Register Dzirent once (the owner, about two minutes):

1. Paste this one line into a plain PowerShell window. It registers "Dzirent vision data" and adds
   the two values to H:\DziRent\secrets\providers.env without showing them:

$r = Invoke-RestMethod -Method Post -Uri "https://api.openverse.org/v1/auth_tokens/register/" -ContentType "application/json" -Body '{{"name": "Dzirent vision data", "description": "Finds openly licensed clothing photos to train the photo check of the Dzirent clothing rental app.", "email": "support@dzirent.com"}}'; Add-Content -Path "H:\DziRent\secrets\providers.env" -Value "", "OPENVERSE_CLIENT_ID=$($r.client_id)", "OPENVERSE_CLIENT_SECRET=$($r.client_secret)"; "Saved. Now open the email Openverse sent to support@dzirent.com."

2. Open the email Openverse sends to support@dzirent.com and click its verification link. Until
   then the key has the anonymous limits.
3. Tell the coordinator; the next session runs fetch_openverse.py.
"""


# ---------------------------------------------------------------------------------------------
# Credentials (never printed).
# ---------------------------------------------------------------------------------------------
def read_env(path: Path) -> dict[str, str]:
    out = {}
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        out[key.strip()] = value.strip().strip('"').strip("'")
    return out


def credentials(path: Path = SECRETS_ENV) -> tuple[str, str] | None:
    env = read_env(path) if path.exists() else {}
    cid = os.environ.get("OPENVERSE_CLIENT_ID") or env.get("OPENVERSE_CLIENT_ID")
    secret = os.environ.get("OPENVERSE_CLIENT_SECRET") or env.get("OPENVERSE_CLIENT_SECRET")
    return (cid, secret) if cid and secret else None


# ---------------------------------------------------------------------------------------------
# Licenses.
# ---------------------------------------------------------------------------------------------
def accepted(result: dict) -> tuple[bool, str]:
    """Whether an Openverse result may be used: license cc0, by, by-sa or pdm, not mature, a URL."""
    if (result.get("license") or "").lower() not in LICENSES:
        return False, "license"
    if result.get("mature"):
        return False, "mature"
    if not result.get("url"):
        return False, "no url"
    return True, ""


def license_name(license: str, version: str | None) -> str:
    v = f" {version}" if version else ""
    return {"cc0": f"CC0{v}", "by": f"CC BY{v}", "by-sa": f"CC BY-SA{v}", "pdm": f"Public Domain Mark{v}"}[license.lower()]


def query(name: str) -> str:
    return f'"{name}"' if " " in name else name


# ---------------------------------------------------------------------------------------------
# The client.
# ---------------------------------------------------------------------------------------------
class Openverse:
    def __init__(self, raw_dir: Path = RAW_DIR, session=None, creds: tuple[str, str] | None = None,
                 sleep=time.sleep, clock=time.monotonic, api_interval: float = API_INTERVAL,
                 download_interval: float = DOWNLOAD_INTERVAL) -> None:
        self.raw_dir, self.creds, self.sleep, self.clock = raw_dir, creds, sleep, clock
        self.session = session or requests.Session()
        self.session.headers["User-Agent"] = fc.USER_AGENT
        self.intervals = {"api": api_interval, "download": download_interval}
        self.last = {"api": float("-inf"), "download": float("-inf")}
        self.token, self.token_until = None, 0.0
        self.requests_made = self.cache_hits = self.downloads = 0
        self.left_today: int | None = None

    def _wait(self, kind: str) -> None:
        gap = self.last[kind] + self.intervals[kind] - self.clock()
        if gap > 0:
            self.sleep(gap)
        self.last[kind] = self.clock()

    def _request(self, kind: str, method: str, url: str, **kw):
        delay = FIRST_BACKOFF
        for attempt in range(1, MAX_TRIES + 1):
            self._wait(kind)
            try:
                resp = self.session.request(method, url, timeout=60, **kw)
            except requests.RequestException as exc:
                logger.warning("%s %s: %s (try %d)", method, url, exc, attempt)
            else:
                if kind == "api":
                    self.requests_made += 1
                    self._note_limits(resp.headers)
                if resp.status_code != 429 and resp.status_code < 500:
                    return resp
                retry = resp.headers.get("Retry-After")
                delay = max(delay, float(retry)) if retry and retry.isdigit() else delay
                logger.warning("%s %s: HTTP %d (try %d)", method, url, resp.status_code, attempt)
            self.sleep(delay)
            delay *= 2
        raise RuntimeError(f"gave up after {MAX_TRIES} tries: {url}")

    def _note_limits(self, headers) -> None:
        for key, value in headers.items():
            k = key.lower()
            if k.startswith("x-ratelimit-available-") and "sustained" in k and str(value).isdigit():
                self.left_today = int(value)

    def _auth_header(self) -> dict:
        if not self.creds:
            return {}
        if not self.token or self.clock() > self.token_until - 60:
            resp = self._request("api", "POST", TOKEN_URL, data={
                "grant_type": "client_credentials", "client_id": self.creds[0], "client_secret": self.creds[1]})
            if resp.status_code != 200:
                raise SystemExit(f"Openverse refused the client ID and secret (HTTP {resp.status_code}); "
                                 "check providers.env and the verification email")
            body = resp.json()
            self.token, self.token_until = body["access_token"], self.clock() + float(body.get("expires_in", 3600))
        return {"Authorization": f"Bearer {self.token}"}

    def search(self, q: str, page: int) -> dict:
        params = {"q": q, "page": str(page), "page_size": str(PAGE_SIZE), "license": ",".join(LICENSES),
                  "excluded_source": EXCLUDED_SOURCES, "mature": "false"}
        key = hashlib.sha1(json.dumps(params, sort_keys=True).encode("utf-8")).hexdigest()[:16]
        slug = re.sub(r"[^a-z0-9]+", "_", q.lower()).strip("_")[:60]
        path = self.raw_dir / f"{slug}_p{page}_{key}.json"
        if path.exists():
            self.cache_hits += 1
            return json.loads(path.read_text(encoding="utf-8"))
        resp = self._request("api", "GET", API_URL, params=params, headers=self._auth_header())
        if resp.status_code != 200:
            logger.warning("search %s page %d: HTTP %d", q, page, resp.status_code)
            return {"results": [], "page_count": 0}
        data = resp.json()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        return data

    def download(self, url: str) -> bytes | None:
        resp = self._request("download", "GET", url)
        if resp.status_code != 200 or not resp.content:
            return None
        self.downloads += 1
        return resp.content

    def budget_left(self) -> bool:
        return self.left_today is None or self.left_today > RESERVE


# ---------------------------------------------------------------------------------------------
# Saving one photo.
# ---------------------------------------------------------------------------------------------
def save_photo(content: bytes, dest_stem: Path) -> tuple[Path | None, str, tuple[int, int]]:
    """Checks and saves a downloaded file: (path, "", (width, height)) or (None, reason, ...)."""
    try:
        with Image.open(io.BytesIO(content)) as probe:
            fmt = probe.format
            probe.load()
            im = probe.copy()
            orientation = probe.getexif().get(0x0112, 1)
    except Exception:
        return None, "unreadable", (0, 0)
    if fmt not in FORMATS:
        return None, "format", (0, 0)
    if min(im.size) < fc.MIN_SIDE:
        return None, "small", im.size
    dest = dest_stem.with_suffix(FORMATS[fmt])
    dest.parent.mkdir(parents=True, exist_ok=True)
    if im.width > fc.RENDITION_WIDTH or orientation != 1:
        im = ImageOps.exif_transpose(im)
        if im.width > fc.RENDITION_WIDTH:
            im = im.resize((fc.RENDITION_WIDTH, round(im.height * fc.RENDITION_WIDTH / im.width)), Image.LANCZOS)
        if min(im.size) < fc.MIN_SIDE:
            return None, "small", im.size
        if fmt == "JPEG":
            im.convert("RGB").save(dest, "JPEG", quality=90)
        elif fmt == "WEBP":
            im.save(dest, "WEBP", quality=90)
        else:
            im.save(dest, "PNG")
    else:
        dest.write_bytes(content)
    if not fc.decodes(dest):
        dest.unlink(missing_ok=True)
        return None, "unreadable", im.size
    with Image.open(dest) as saved:
        return dest, "", saved.size


# ---------------------------------------------------------------------------------------------
# openverse.csv and the targets.
# ---------------------------------------------------------------------------------------------
def read_openverse(path: Path = OPENVERSE_CSV) -> list[dict]:
    if not path.exists():
        return []
    with open(path, encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def append_openverse(row: dict, path: Path = OPENVERSE_CSV) -> None:
    new = not path.exists()
    with open(path, "a", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=OPENVERSE_COLUMNS, lineterminator="\n")
        if new:
            writer.writeheader()
        writer.writerow(row)


def kept_or_undecided(manifest: list[dict], labels: list[dict]) -> Counter:
    return Counter({q: len(s) for q, s in af.kept_by_type(manifest, labels).items()})


def plan(rows: list[dict], order: list[str], manifest: list[dict], labels: list[dict]) -> list[tuple[dict, int]]:
    """(row, kept-or-undecided now) for each launch type under BELOW, in the sheet's order."""
    by_qid = {r["qid"]: r for r in rows}
    have = kept_or_undecided(manifest, labels)
    return [(by_qid[q], have[q]) for q in order if q in by_qid and have[q] < BELOW]


def most_calls(targets: list[tuple[dict, int]]) -> int:
    return sum(len(fc.search_names(row)) * MAX_PAGES for row, _ in targets) + 1


# ---------------------------------------------------------------------------------------------
# The run.
# ---------------------------------------------------------------------------------------------
def run(client: Openverse, targets: list[tuple[dict, int]], *, manifest_path: Path = fc.MANIFEST_CSV,
        files_dir: Path = fc.FILES_DIR, openverse_csv: Path = OPENVERSE_CSV, credits_path: Path = fc.CREDITS_MD,
        deadline: float | None = None, clock=time.monotonic, now=lambda: datetime.now(timezone.utc)) -> list[dict]:
    manifest = fc.read_manifest(manifest_path) if manifest_path.exists() else []
    taken = {m["sha1"] for m in manifest}
    seen_ids = {r["openverse_id"] for r in read_openverse(openverse_csv)}
    results = []
    stopped = False
    for row, have in targets:
        qid, name = row["qid"], row["english_name"]
        need = CAP - have
        result = {"qid": qid, "english_name": name, "before": have, "added": 0, "counted": 0, "auto_drop": 0,
                  "skipped": Counter(), "licenses": Counter(), "searches": 0}
        results.append(result)
        for term in fc.search_names(row):
            if result["counted"] >= need or stopped:
                break
            for page in range(1, MAX_PAGES + 1):
                if (deadline is not None and clock() >= deadline) or not client.budget_left():
                    stopped = result["stopped"] = True
                    break
                data = client.search(query(term), page)
                result["searches"] += 1
                for r in data.get("results", []):
                    ok, why = accepted(r)
                    if not ok:
                        result["skipped"][why] += 1
                        continue
                    if r["id"] in seen_ids:
                        result["skipped"]["duplicate"] += 1
                        continue
                    content = client.download(r["url"])
                    if not content:
                        result["skipped"]["download failed"] += 1
                        continue
                    sha1 = hashlib.sha1(content).hexdigest()
                    if sha1 in taken:
                        result["skipped"]["duplicate"] += 1
                        continue
                    saved, why, (w, h) = save_photo(content, files_dir / qid / sha1)
                    if not saved:
                        result["skipped"][why] += 1
                        continue
                    lic = license_name(r["license"], r.get("license_version"))
                    entry = {"qid": qid, "english_name": name, "dzirent_category": row["dzirent_category"],
                             "allowed": row["allowed"], "sha1": sha1, "file": saved.relative_to(files_dir.parent).as_posix(),
                             "width": w, "height": h, "license": lic, "author": r.get("creator") or "unknown",
                             "source_url": r["url"], "commons_page_url": r.get("foreign_landing_url") or "",
                             "downloaded_at": now().strftime("%Y-%m-%dT%H:%M:%SZ"), "source": "openverse"}
                    fc.append_manifest(entry, manifest_path)
                    append_openverse({"sha1": sha1, "openverse_id": r["id"], "qid": qid, "title": r.get("title") or "",
                                      "license": r["license"], "license_version": r.get("license_version") or "",
                                      "license_url": r.get("license_url") or "", "creator": r.get("creator") or "",
                                      "creator_url": r.get("creator_url") or "", "source_site": r.get("source") or "",
                                      "foreign_landing_url": r.get("foreign_landing_url") or "", "url": r["url"]},
                                     openverse_csv)
                    manifest.append(entry)
                    taken.add(sha1)
                    seen_ids.add(r["id"])
                    result["added"] += 1
                    result["licenses"][lic] += 1
                    if af.classify(af.measure(saved)):
                        result["auto_drop"] += 1
                    else:
                        result["counted"] += 1
                    if result["counted"] >= need:
                        break
                if result["counted"] >= need or page >= int(data.get("page_count") or 0):
                    break
            if stopped:
                break
        result["after"] = have + result["counted"]
        logger.info("%s %s: %d -> %d kept or undecided (%d added, %d auto_drop)%s", qid, name, have, result["after"],
                    result["added"], result["auto_drop"], " (stopped)" if result.get("stopped") else "")
        if stopped:
            break
    if any(r["added"] for r in results) and manifest:
        fc.write_credits(manifest, credits_path, openverse_csv)
    return results


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Fill the short launch types from Openverse (cc0, by, by-sa, pdm).")
    parser.add_argument("--dry-run", action="store_true", help="list the targets and the most API calls; no network")
    parser.add_argument("--max-minutes", type=float, metavar="M", help="stop cleanly before the next search after M minutes")
    parser.add_argument("--anonymous", action="store_true",
                        help="run without credentials (anonymous limits: 20 a minute, 200 a day)")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    rows = fc.load_rows()
    manifest = fc.read_manifest()
    targets = plan(rows, launch_order(), manifest, af.read_labels())
    calls = most_calls(targets)
    print(json.dumps({"targets": [{"qid": r["qid"], "english_name": r["english_name"], "kept_or_undecided": have,
                                   "names": fc.search_names(r)} for r, have in targets],
                      "types": len(targets), "most_api_calls": calls}, ensure_ascii=False, indent=1))
    if args.dry_run:
        return 0
    creds = credentials()
    if not creds and not (args.anonymous and calls <= ANON_PER_DAY - RESERVE):
        print(REGISTRATION_STEPS.format(calls=calls))
        return 2
    deadline = time.monotonic() + 60 * args.max_minutes if args.max_minutes else None
    client = Openverse(creds=creds)
    results = run(client, targets, deadline=deadline)
    summary = {"types": len(results), "added": sum(r["added"] for r in results),
               "counted": sum(r["counted"] for r in results), "auto_drop": sum(r["auto_drop"] for r in results),
               "requests": client.requests_made, "cache_hits": client.cache_hits, "downloads": client.downloads,
               "left_today": client.left_today, "stopped": any(r.get("stopped") for r in results),
               "under_20_after": [r["english_name"] for r in results if r["after"] < 20]}
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    (RAW_DIR / "last_run.json").write_text(json.dumps({"summary": summary, "types": [
        {**r, "skipped": dict(r["skipped"]), "licenses": dict(r["licenses"])} for r in results]},
        ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
