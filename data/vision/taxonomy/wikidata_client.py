"""Polite, cached access to Wikidata (the action API and the SPARQL endpoint).

Wikimedia rules followed here: a descriptive User-Agent, one request at a time with a pause
after each, back-off on 429 and 5xx (honouring Retry-After), and every response cached in
taxonomy/raw/ so a re-run makes no requests. No images
are ever downloaded: image fields are file names only.
"""

import hashlib
import json
import logging
import re
import time
from pathlib import Path

import requests

RAW_DIR = Path(__file__).resolve().parent / "raw"

USER_AGENT = "DziRentDataTool/0.2 (contact: admin@dzirent.com)"
API_URL = "https://www.wikidata.org/w/api.php"
SPARQL_URL = "https://query.wikidata.org/sparql"

API_PAUSE = 1.0
SPARQL_PAUSE = 2.0
MAX_TRIES = 6
FIRST_BACKOFF = 5.0

logger = logging.getLogger("wikidata")


class Client:
    def __init__(self) -> None:
        self.session = requests.Session()
        self.session.headers["User-Agent"] = USER_AGENT
        self.requests_made = 0
        self.cache_hits = 0  # cached responses read
        self._folders: dict[str, dict] = {}

    def _get(self, url: str, params: dict, accept: str, pause: float, timeout: float) -> dict:
        backoff = FIRST_BACKOFF
        for attempt in range(1, MAX_TRIES + 1):
            try:
                resp = self.session.get(url, params=params, headers={"Accept": accept}, timeout=timeout)
            except requests.RequestException as e:
                logger.warning("request failed (%s), retrying in %.0f s", e, backoff)
                time.sleep(backoff)
                backoff *= 2
                continue
            self.requests_made += 1
            if resp.status_code == 429 or resp.status_code >= 500:
                wait = max(backoff, float(resp.headers.get("Retry-After", 0) or 0))
                logger.warning("HTTP %s (attempt %d/%d), waiting %.0f s", resp.status_code, attempt, MAX_TRIES, wait)
                time.sleep(wait)
                backoff *= 2
                continue
            resp.raise_for_status()
            data = resp.json()
            if isinstance(data, dict) and "error" in data:
                raise RuntimeError(f"Wikidata API error: {data['error']}")
            time.sleep(pause)
            return data
        raise RuntimeError(f"gave up after {MAX_TRIES} tries: {url}")

    def _cached(self, path: Path, fetch) -> dict:
        if path.exists():
            self.cache_hits += 1
            return json.loads(path.read_text(encoding="utf-8"))
        data = fetch()
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        tmp.replace(path)
        return data

    def api(self, params: dict, cache: Path) -> dict:
        # No maxlag: it holds back edits while the query service catches up; this tool only reads.
        full = {"format": "json", "formatversion": "2", **params}
        return self._cached(cache, lambda: self._get(API_URL, full, "application/json", API_PAUSE, 60))

    def sparql(self, query: str, cache: Path) -> dict:
        def fetch():
            data = self._get(SPARQL_URL, {"query": query}, "application/sparql-results+json", SPARQL_PAUSE, 90)
            return {"query": query, "response": data}
        return self._cached(cache, fetch)["response"]

    # --- the calls the pipeline uses ---

    def search(self, label: str, offset: int = 0) -> tuple[list[dict], bool]:
        """wbsearchentities: one page of items whose English label or alias matches, best
        first, and whether there are more pages."""
        cache = RAW_DIR / "search" / (f"{slug(label)}.json" if offset == 0 else f"{slug(label)}_{offset}.json")
        params = {"action": "wbsearchentities", "search": label, "language": "en",
                  "uselang": "en", "type": "item", "limit": "50"}
        if offset:
            params["continue"] = str(offset)
        data = self.api(params, cache)
        return data.get("search", []), "search-continue" in data

    def entities(self, qids: list[str], props: str, languages: str, folder: str) -> dict[str, dict]:
        """wbgetentities in batches of 50. A batch is cached under a hash of its ids, and a
        later run only fetches ids that no cached batch of this kind already holds."""
        cache_dir = RAW_DIR / folder
        if folder not in self._folders:
            self._folders[folder] = {}
            for f in sorted(cache_dir.glob("*.json")) if cache_dir.exists() else []:
                self._folders[folder].update(json.loads(f.read_text(encoding="utf-8")).get("entities", {}))
                self.cache_hits += 1
        known = self._folders[folder]
        missing = sorted({q for q in qids if q not in known}, key=qid_num)
        for i in range(0, len(missing), 50):
            batch = missing[i:i + 50]
            cache = cache_dir / f"{digest(batch)}.json"
            data = self.api({"action": "wbgetentities", "ids": "|".join(batch), "props": props,
                             "languages": languages, "sitefilter": "enwiki"}, cache)
            known.update(data.get("entities", {}))
        return {q: known[q] for q in qids if q in known}

    def sparql_batched(self, qids: list[str], build_query, folder: str, size: int) -> list[dict]:
        """A VALUES query over many items, in batches; same per-id cache reuse as entities()."""
        cache_dir = RAW_DIR / folder
        rows: list[dict] = []
        covered: set[str] = set()
        if cache_dir.exists():
            for f in sorted(cache_dir.glob("*.json")):
                saved = json.loads(f.read_text(encoding="utf-8"))
                covered.update(saved["qids"])
                rows.extend(saved["response"]["results"]["bindings"])
                self.cache_hits += 1
        missing = sorted({q for q in qids if q not in covered}, key=qid_num)
        for i in range(0, len(missing), size):
            batch = missing[i:i + size]
            path = cache_dir / f"{digest(batch)}.json"
            query = build_query(batch)
            data = self._get(SPARQL_URL, {"query": query}, "application/sparql-results+json", SPARQL_PAUSE, 90)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps({"qids": batch, "query": query, "response": data}, ensure_ascii=False),
                            encoding="utf-8")
            rows.extend(data["results"]["bindings"])
        wanted = set(qids)
        return [r for r in rows if qid_of(r.get("item", {}).get("value", "")) in wanted]


def slug(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")
    return f"{s[:60]}_{hashlib.sha1(text.encode('utf-8')).hexdigest()[:6]}"


def digest(qids: list[str]) -> str:
    return hashlib.sha1("|".join(qids).encode("ascii")).hexdigest()[:16]


def qid_num(qid: str) -> int:
    return int(qid[1:]) if qid[1:].isdigit() else 0


def qid_of(uri: str) -> str:
    return uri.rsplit("/", 1)[-1] if "/entity/Q" in uri else ""
