"""Evaluate the deployed vision service on known photos and report every photo's verdict.

    python services/vision/eval/run_eval.py --url https://vision-....run.app [--out results.json]

Sets (photos are never copied anywhere: local files go to the service as data: URLs):
- the 12 sample listings, read through the public shop window (get_listing): each photo on its
  own, then each listing with all its photos; expected allowed or review;
- --accept folder (default H:\\DziRent\\vision-test\\should-accept): expected allowed or review;
- --reject folder (default H:\\DziRent\\vision-test\\should-reject): expected rejected; review is
  tolerated, allowed is a failure;
- --extra NAME=FOLDER=accept|reject for more folders.

Signs in with `gcloud auth print-identity-token` (the caller needs roles/run.invoker). Reads
SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY from the environment or --env-file. Uses only the
Python standard library. Exits 1 if any photo that should be rejected came back allowed.
"""

import argparse
import base64
import json
import os
import re
import shutil
import statistics
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SAMPLE_SEED = REPO / "supabase" / "seed" / "sample_photos.mjs"
IMAGE_TYPES = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}


def load_env(path: str | None) -> None:
    if not path or not Path(path).exists():
        return
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        m = re.match(r"\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$", line)
        if m and m.group(1) not in os.environ:
            os.environ[m.group(1)] = m.group(2).strip("\"'")


def identity_token() -> str:
    gcloud = shutil.which("gcloud") or shutil.which("gcloud.cmd")
    if not gcloud:
        sys.exit("gcloud not found on PATH")
    out = subprocess.run([gcloud, "auth", "print-identity-token"], capture_output=True, text=True, check=True)
    return out.stdout.strip()


def post_json(url: str, body: dict | None, headers: dict, timeout: float = 150) -> tuple[int, dict | None, float]:
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST" if body is not None else "GET",
                                 headers={"Content-Type": "application/json", **headers})
    started = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read() or b"null"), time.monotonic() - started
    except urllib.error.HTTPError as e:
        return e.code, None, time.monotonic() - started


def sample_listings() -> list[tuple[str, str]]:
    """(listing id, slug) of the 12 sample listings, from the seed script."""
    text = SAMPLE_SEED.read_text(encoding="utf-8")
    return re.findall(r'id: "([0-9a-f-]{36})",\s*slug: "([a-z0-9-]+)"', text)


def sample_photos(supabase_url: str, key: str) -> list[dict]:
    listings = []
    for listing_id, slug in sample_listings():
        status, rows, _ = post_json(f"{supabase_url}/rest/v1/rpc/get_listing", {"p_listing_id": listing_id},
                                    {"apikey": key}, timeout=30)
        if status != 200 or not rows:
            print(f"  {slug}: not found through the shop window ({status})")
            continue
        photos = [{
            "photo_id": f"{slug}/{p.get('slot') or p['position']}",
            "url": f"{supabase_url}/storage/v1/object/public/listing-photos/{p['storage_path']}",
            "slot": p.get("slot"),
        } for p in rows[0]["photos"]]
        listings.append({"slug": slug, "photos": photos})
    return listings


def folder_photos(folder: Path) -> list[dict]:
    if not folder.exists():
        return []
    photos = []
    for path in sorted(p for p in folder.rglob("*") if p.suffix.lower() in IMAGE_TYPES):
        mime = IMAGE_TYPES[path.suffix.lower()]
        url = f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"
        photos.append({"photo_id": str(path.relative_to(folder)), "url": url, "slot": "front"})
    return photos


def passes(expected: str, verdict: str | None) -> bool:
    if expected == "reject":
        return verdict in ("rejected", "review")
    return verdict in ("allowed", "review")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True, help="the Cloud Run service URL")
    ap.add_argument("--env-file", default=r"H:\DziRent\secrets\dzirent-server.env")
    ap.add_argument("--accept", default=r"H:\DziRent\vision-test\should-accept")
    ap.add_argument("--reject", default=r"H:\DziRent\vision-test\should-reject")
    ap.add_argument("--extra", action="append", default=[], help="NAME=FOLDER=accept|reject")
    ap.add_argument("--out", help="write every response (without fingerprints) to this JSON file")
    args = ap.parse_args()
    load_env(args.env_file)
    base = args.url.rstrip("/")
    auth = {"Authorization": f"Bearer {identity_token()}"}

    status, health, seconds = post_json(f"{base}/health", None, auth)
    print(f"health: HTTP {status} in {seconds:.1f} s {health or ''}")
    if status != 200:
        return 1

    supabase_url, key = os.environ.get("SUPABASE_URL", "").rstrip("/"), os.environ.get("SUPABASE_PUBLISHABLE_KEY", "")
    runs: list[tuple[str, str, list[dict]]] = []  # (set, expected, photos sent one by one)
    listings = sample_photos(supabase_url, key) if supabase_url and key else []
    runs.append(("sample", "accept", [p for listing in listings for p in listing["photos"]]))
    runs.append(("should-accept", "accept", folder_photos(Path(args.accept))))
    runs.append(("should-reject", "reject", folder_photos(Path(args.reject))))
    for extra in args.extra:
        name, folder, expected = extra.split("=")
        runs.append((name, expected, folder_photos(Path(folder))))

    rows, saved, times = [], [], []
    for set_name, expected, photos in runs:
        if not photos:
            print(f"{set_name}: no photos found")
        for n, photo in enumerate(photos, 1):
            status, result, seconds = post_json(f"{base}/scan", {"listing_id": f"eval-{set_name}-{n}", "photos": [photo]}, auth)
            times.append(seconds)
            verdict = result["verdict"] if result else f"HTTP {status}"
            ph = (result or {}).get("photos", [{}])[0]
            rows.append({"set": set_name, "photo": photo["photo_id"], "expected": expected, "verdict": verdict,
                         "reason": (result or {}).get("reason", ""), "looks_like": ph.get("looks_like"),
                         "decision": ph.get("decision"), "warnings": ph.get("warnings", []),
                         "pass": passes(expected, verdict), "seconds": round(seconds, 2)})
            if result:
                for p in result.get("photos", []):
                    p.pop("fingerprint", None)
                saved.append({"set": set_name, "photo": photo["photo_id"], "result": result})

    listing_rows = []
    for listing in listings:
        status, result, seconds = post_json(f"{base}/scan", {"listing_id": f"eval-{listing['slug']}", "photos": listing["photos"]}, auth)
        verdict = result["verdict"] if result else f"HTTP {status}"
        s = (result or {}).get("suggestions") or {}
        listing_rows.append({"listing": listing["slug"], "photos": len(listing["photos"]), "verdict": verdict,
                             "reason": (result or {}).get("reason", ""), "title": s.get("title"),
                             "category": s.get("category"), "garment_type": s.get("garment_type"),
                             "colors": s.get("colors"), "styles": s.get("styles"),
                             "quality": ((result or {}).get("quality") or {}).get("summary"),
                             "pass": passes("accept", verdict), "seconds": round(seconds, 2)})

    print("\n| Set | Photo | Expected | Verdict | Looks like | Reason | Warnings | Pass |")
    print("| --- | --- | --- | --- | --- | --- | --- | --- |")
    for r in rows:
        expected = "rejected" if r["expected"] == "reject" else "allowed or review"
        print(f"| {r['set']} | {r['photo']} | {expected} | {r['verdict']} | {r['looks_like'] or ''} | {r['reason']} | "
              f"{'; '.join(r['warnings'])} | {'yes' if r['pass'] else 'NO'} |")
    if listing_rows:
        print("\n| Sample listing | Photos | Verdict | Suggested title | Category / garment type | Colors | Styles | Quality | Pass |")
        print("| --- | --- | --- | --- | --- | --- | --- | --- | --- |")
        for r in listing_rows:
            print(f"| {r['listing']} | {r['photos']} | {r['verdict']} | {r['title'] or ''} | {r['category'] or ''} / "
                  f"{r['garment_type'] or ''} | {', '.join(r['colors'] or [])} | {', '.join(r['styles'] or [])} | "
                  f"{r['quality'] or ''} | {'yes' if r['pass'] else 'NO'} |")
    if times:
        print(f"\nsingle-photo scans: {len(times)}, first {times[0]:.1f} s, median {statistics.median(times):.1f} s, "
              f"max {max(times):.1f} s")
    failed = [r for r in rows + listing_rows if not r["pass"]]
    allowed_rejects = [r for r in rows if r["expected"] == "reject" and r["verdict"] == "allowed"]
    print(f"photos: {len(rows)}, listings: {len(listing_rows)}, not passing: {len(failed)}, "
          f"should-reject photos allowed: {len(allowed_rejects)}")
    if args.out:
        Path(args.out).write_text(json.dumps({"photos": rows, "listings": listing_rows, "responses": saved}, indent=1))
    return 1 if allowed_rejects else 0


if __name__ == "__main__":
    sys.exit(main())
