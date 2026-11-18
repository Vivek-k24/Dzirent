#!/usr/bin/env python3
"""
review_server.py (D3; D2b added --launch-only, the search tag and the finished-type line)
The label-check page for the photos fetch_commons.py downloaded: http://127.0.0.1:8765

One type at a time (its name, category and whether it can be listed) with a grid of its photos.
Each photo is keep, drop or not sure; a click cycles through them. Keys: 1 keep, 2 drop, 3 not
sure (then the next photo), arrows move, Enter opens the full photo, N next type, P previous.
"Drop whole type" drops every photo of the type.

Every decision is POSTed here and appended to labels.csv (sha1, qid, decision, decided_at); the
latest line for a photo wins, so a decision can be changed any time and a reload shows what is
saved. A photo with no decision counts as keep, so an unchecked type still trains. N saves keep
for the photos left undecided on the page, so the progress bar counts the type as checked, and
the next page opens with a line for the type just finished: how many kept, dropped, not sure. A
photo that came from the Commons search (manifest source "search") carries a small tag.

--launch-only serves only the types with needs_owner = yes and priority = launch in
../taxonomy/review.csv, in the sheet's order; the progress bars count those only.

Standard library only (http.server), plus Pillow for the 256 px thumbnails, made on first
request into thumbs/. Listens on 127.0.0.1 only. The page shows nothing from Commons but the
photos: no file names, descriptions or authors (those can name places and brands).

    python images/review_server.py                 # then open http://127.0.0.1:8765
    python images/review_server.py --launch-only   # the launch types only
"""

import argparse
import csv
import html
import json
import re
import sys
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from PIL import Image, ImageOps

from fetch_commons import IMAGES_DIR, MANIFEST_CSV, read_manifest

HOST = "127.0.0.1"
PORT = 8765
LABELS_CSV = IMAGES_DIR / "labels.csv"
REVIEW_CSV = IMAGES_DIR.parent / "taxonomy" / "review.csv"
THUMBS_DIR = IMAGES_DIR / "thumbs"
LABEL_COLUMNS = ["sha1", "qid", "decision", "decided_at"]
DECISIONS = ("keep", "drop", "not_sure")
THUMB_SIZE = 256
CONTENT_TYPES = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
QID_RE = re.compile(r"Q\d+")
SHA1_RE = re.compile(r"[0-9a-f]{40}")


def launch_order(review_csv: Path = REVIEW_CSV) -> list[str]:
    """The QIDs with needs_owner = yes and priority = launch in the sheet, in its order. Excel saves
    "CSV UTF-8", or Windows-1252 as plain "CSV" (as build_taxonomy.read_review_csv reads it)."""
    try:
        text = review_csv.read_text(encoding="utf-8-sig")
    except UnicodeDecodeError:
        text = review_csv.read_text(encoding="cp1252")
    return [r["qid"] for r in csv.DictReader(text.splitlines())
            if (r.get("needs_owner") or "").strip().lower() == "yes" and (r.get("priority") or "").strip().lower() == "launch"]


class Store:
    """The manifest's photos grouped by type, and the decisions in labels.csv. With `only`, just
    those types, in that order."""

    def __init__(self, manifest_csv: Path = MANIFEST_CSV, labels_csv: Path = LABELS_CSV,
                 images_dir: Path = IMAGES_DIR, thumbs_dir: Path = THUMBS_DIR, only: list[str] | None = None) -> None:
        self.labels_csv, self.images_dir, self.thumbs_dir = labels_csv, images_dir, thumbs_dir
        self.types: list[dict] = []
        self.files: dict[tuple[str, str], str] = {}  # (sha1, qid) -> file, relative to images_dir
        self.sources: dict[tuple[str, str], str] = {}  # (sha1, qid) -> the manifest's source
        wanted = None if only is None else set(only)
        index: dict[str, dict] = {}
        for m in read_manifest(manifest_csv):
            if wanted is not None and m["qid"] not in wanted:
                continue
            t = index.get(m["qid"])
            if t is None:
                t = {"qid": m["qid"], "english_name": m["english_name"], "dzirent_category": m["dzirent_category"],
                     "allowed": m["allowed"], "photos": []}
                index[m["qid"]] = t
                self.types.append(t)
            t["photos"].append(m["sha1"])
            self.files[(m["sha1"], m["qid"])] = m["file"]
            self.sources[(m["sha1"], m["qid"])] = m.get("source") or ""
        if only is not None:
            self.types = [index[q] for q in dict.fromkeys(only) if q in index]
        self.decisions: dict[tuple[str, str], str] = {}
        self.lock = threading.Lock()
        if labels_csv.exists():
            with open(labels_csv, encoding="utf-8", newline="") as fh:
                for line in csv.DictReader(fh):
                    if line.get("decision") in DECISIONS:
                        self.decisions[(line.get("sha1", ""), line.get("qid", ""))] = line["decision"]

    def type_index(self, qid: str) -> int | None:
        return next((i for i, t in enumerate(self.types) if t["qid"] == qid), None)

    def reviewed(self, t: dict) -> bool:
        return all((sha1, t["qid"]) in self.decisions for sha1 in t["photos"])

    def counts(self, t: dict) -> dict:
        """kept / dropped / not sure for a type; a photo with no decision counts as keep."""
        out = {d: 0 for d in DECISIONS}
        for sha1 in t["photos"]:
            out[self.decisions.get((sha1, t["qid"]), "keep")] += 1
        return out

    def progress(self) -> dict:
        decided = sum(1 for key in self.files if key in self.decisions)
        return {"types_reviewed": sum(1 for t in self.types if self.reviewed(t)), "types_total": len(self.types),
                "photos_decided": decided, "photos_total": len(self.files)}

    def decide(self, qid: str, decisions: list[dict]) -> dict:
        """Appends one labels.csv line per decision; all are checked before any is written."""
        rows = []
        for d in decisions:
            sha1, decision = str(d.get("sha1", "")), str(d.get("decision", ""))
            if (sha1, qid) not in self.files:
                raise ValueError(f"no photo {sha1} for {qid} in the manifest")
            if decision not in DECISIONS:
                raise ValueError(f"decision must be one of {', '.join(DECISIONS)}")
            rows.append({"sha1": sha1, "qid": qid, "decision": decision,
                         "decided_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")})
        with self.lock:
            new = not self.labels_csv.exists()
            with open(self.labels_csv, "a", encoding="utf-8", newline="") as fh:
                writer = csv.DictWriter(fh, fieldnames=LABEL_COLUMNS, lineterminator="\n")
                if new:
                    writer.writeheader()
                writer.writerows(rows)
            for r in rows:
                self.decisions[(r["sha1"], qid)] = r["decision"]
            return self.progress()

    def photo_path(self, sha1: str, qid: str) -> Path | None:
        rel = self.files.get((sha1, qid))
        if not rel:
            return None
        path = (self.images_dir / rel).resolve()
        files_root = (self.images_dir / "files").resolve()
        return path if files_root in path.parents and path.exists() else None

    def thumbnail(self, sha1: str, qid: str) -> Path | None:
        source = self.photo_path(sha1, qid)
        if not source:
            return None
        thumb = self.thumbs_dir / qid / f"{sha1}.jpg"
        if not thumb.exists():
            thumb.parent.mkdir(parents=True, exist_ok=True)
            with Image.open(source) as im:
                im = ImageOps.exif_transpose(im)
                im.thumbnail((THUMB_SIZE, THUMB_SIZE))
                tmp = thumb.with_name(f"{sha1}.{threading.get_ident()}.tmp")
                im.convert("RGB").save(tmp, "JPEG", quality=85)
            tmp.replace(thumb)
        return thumb


# ---------------------------------------------------------------------------------------------
# The page.
# ---------------------------------------------------------------------------------------------
PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Label check: __NAME__</title>
<style>
  :root { --bg:#0e1116; --panel:#161b22; --line:#30363d; --text:#e6edf3; --muted:#8b949e;
          --keep:#3fb950; --drop:#f85149; --unsure:#d29922; --focus:#ffffff; --search:#58a6ff; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:15px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; }
  header { position:sticky; top:0; z-index:2; background:var(--panel); border-bottom:1px solid var(--line); padding:12px 20px; }
  .row { display:flex; flex-wrap:wrap; align-items:center; gap:12px 20px; }
  h1 { margin:0; font-size:26px; font-weight:600; }
  .meta { color:var(--muted); }
  .badge { display:inline-block; padding:2px 10px; border-radius:999px; font-weight:600; font-size:13px; }
  .badge.allowed { background:rgba(63,185,80,.15); color:var(--keep); }
  .badge.not_allowed { background:rgba(248,81,73,.15); color:var(--drop); }
  .spacer { flex:1; }
  button, a.btn { background:#21262d; color:var(--text); border:1px solid var(--line); border-radius:8px;
                  padding:7px 14px; font:inherit; cursor:pointer; text-decoration:none; }
  button:hover, a.btn:hover { border-color:var(--muted); }
  button.danger { color:var(--drop); }
  a.btn.off { opacity:.35; pointer-events:none; }
  .bars { display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:8px 24px; margin-top:10px; }
  .bar { height:8px; background:#21262d; border-radius:4px; overflow:hidden; }
  .bar > i { display:block; height:100%; background:var(--keep); width:0; transition:width .2s; }
  .barlabel { font-size:13px; color:var(--muted); margin-bottom:3px; }
  .hint { color:var(--muted); font-size:13px; margin-top:8px; }
  kbd { background:#21262d; border:1px solid var(--line); border-radius:4px; padding:0 5px; font:12px ui-monospace, monospace; color:var(--text); }
  main { padding:20px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill, 272px); gap:16px; justify-content:center; }
  .card { position:relative; width:272px; height:296px; background:var(--panel); border-radius:10px; padding:8px;
          border:3px dashed var(--line); cursor:pointer; user-select:none; }
  .card img { width:250px; height:250px; object-fit:contain; display:block; margin:0 auto; border-radius:4px; }
  .card .state { position:absolute; left:10px; bottom:6px; font-size:13px; font-weight:600; color:var(--muted); }
  .card .num { position:absolute; right:10px; bottom:6px; font-size:12px; color:var(--muted); }
  .card .tag { position:absolute; left:14px; top:14px; background:var(--search); color:#0e1116; font-size:11px;
               font-weight:700; padding:1px 8px; border-radius:999px; letter-spacing:.02em; }
  .finished { margin:0 0 10px; padding:6px 12px; border-radius:8px; background:rgba(63,185,80,.12);
              color:var(--text); font-size:14px; }
  .finished b { font-weight:600; }
  .card.keep { border-style:solid; border-color:var(--keep); }
  .card.keep .state { color:var(--keep); }
  .card.drop { border-style:solid; border-color:var(--drop); }
  .card.drop img { opacity:.3; }
  .card.drop .state { color:var(--drop); }
  .card.not_sure { border-style:solid; border-color:var(--unsure); }
  .card.not_sure .state { color:var(--unsure); }
  .card.focus { outline:3px solid var(--focus); outline-offset:3px; }
  #error { display:none; background:var(--drop); color:#fff; padding:8px 20px; font-weight:600; }
  .empty { color:var(--muted); text-align:center; margin-top:60px; font-size:18px; }
</style>
</head>
<body>
<div id="error" role="alert"></div>
<header>
  __FINISHED__<div class="row">
    <span class="meta">Type __POS__ of __TOTAL__</span>
    <h1>__NAME__</h1>
    <span class="meta">__CATEGORY__</span>
    <span class="badge __ALLOWED__">__ALLOWED_TEXT__</span>
    <span class="meta">__QID__ · __COUNT__ photos</span>
    <span class="spacer"></span>
    <a class="btn __PREV_OFF__" href="__PREV__" id="prev">&larr; Previous <kbd>P</kbd></a>
    <a class="btn __NEXT_OFF__" href="__NEXT__" id="next">Next &rarr; <kbd>N</kbd></a>
    <button class="danger" id="dropall">Drop whole type</button>
  </div>
  <div class="bars">
    <div><div class="barlabel" id="types-label"></div><div class="bar"><i id="types-bar"></i></div></div>
    <div><div class="barlabel" id="photos-label"></div><div class="bar"><i id="photos-bar"></i></div></div>
  </div>
  <div class="hint">__HINT__ Click a photo to cycle keep, drop, not sure.
    <kbd>1</kbd> keep <kbd>2</kbd> drop <kbd>3</kbd> not sure <kbd>&larr;</kbd><kbd>&rarr;</kbd><kbd>&uarr;</kbd><kbd>&darr;</kbd> move
    <kbd>Enter</kbd> full photo <kbd>N</kbd> next type (the photos left undecided are saved as keep) <kbd>P</kbd> previous.
    A dashed border is a photo not checked yet; it counts as keep. A <span class="badge" style="background:var(--search);color:#0e1116">search</span>
    tag: the photo came from a Commons search, not the type's own category; check it closely.</div>
</header>
<main><div class="grid" id="grid"></div>__EMPTY__</main>
<script type="application/json" id="data">__DATA__</script>
<script>
(() => {
  const data = JSON.parse(document.getElementById("data").textContent);
  const grid = document.getElementById("grid");
  const LABEL = { keep: "keep", drop: "drop", not_sure: "not sure" };
  const CYCLE = { keep: "drop", drop: "not_sure", not_sure: "keep" };
  let focus = 0;

  function showProgress(p) {
    const pct = (a, b) => (b ? (100 * a / b).toFixed(1) : 0) + "%";
    document.getElementById("types-label").textContent = `Types checked ${p.types_reviewed} / ${p.types_total}`;
    document.getElementById("photos-label").textContent = `Photos decided ${p.photos_decided} / ${p.photos_total}`;
    document.getElementById("types-bar").style.width = pct(p.types_reviewed, p.types_total);
    document.getElementById("photos-bar").style.width = pct(p.photos_decided, p.photos_total);
  }

  function paint(i) {
    const card = grid.children[i], d = data.photos[i].decision;
    card.className = "card" + (d ? " " + d : "") + (i === focus ? " focus" : "");
    card.querySelector(".state").textContent = d ? LABEL[d] : "keep (not checked)";
  }

  function setFocus(i) {
    if (!data.photos.length) return;
    const old = focus;
    focus = Math.max(0, Math.min(data.photos.length - 1, i));
    paint(old); paint(focus);
    grid.children[focus].scrollIntoView({ block: "nearest" });
  }

  function fail(msg) {
    const e = document.getElementById("error");
    e.textContent = msg; e.style.display = "block";
  }

  async function save(items) {
    if (!items.length) return true;
    const before = items.map(it => data.photos[it.i].decision);
    items.forEach(it => { data.photos[it.i].decision = it.decision; paint(it.i); });
    try {
      const resp = await fetch("/api/decide", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qid: data.qid, decisions: items.map(it => ({ sha1: data.photos[it.i].sha1, decision: it.decision })) }) });
      const out = await resp.json();
      if (!resp.ok) throw new Error(out.error || resp.status);
      showProgress(out.progress);
      document.getElementById("error").style.display = "none";
      return true;
    } catch (err) {
      items.forEach((it, k) => { data.photos[it.i].decision = before[k]; paint(it.i); });
      fail(`Not saved (${err.message}). Is review_server.py still running?`);
      return false;
    }
  }

  function columns() {
    const cards = grid.children;
    if (!cards.length) return 1;
    let n = 0;
    while (n < cards.length && cards[n].offsetTop === cards[0].offsetTop) n++;
    return n || 1;
  }

  async function nextType() {
    const rest = data.photos.map((p, i) => ({ i, decision: "keep" })).filter(it => !data.photos[it.i].decision);
    // The next page (or this one, after the last type) says how this type came out.
    if (await save(rest)) location.href = (data.next || location.pathname) + "?finished=" + encodeURIComponent(data.qid);
  }

  data.photos.forEach((p, i) => {
    const card = document.createElement("div");
    card.innerHTML = `<img alt="photo ${i + 1}" loading="lazy" src="/thumb/${data.qid}/${p.sha1}.jpg"><span class="state"></span><span class="num">${i + 1}</span>`
      + (p.source === "search" ? `<span class="tag" title="from a Commons search">search</span>` : "");
    card.addEventListener("click", () => { setFocus(i); save([{ i, decision: CYCLE[p.decision || "keep"] }]); });
    card.addEventListener("dblclick", () => window.open(`/photo/${data.qid}/${p.sha1}`, "_blank"));
    grid.appendChild(card);
  });
  data.photos.forEach((p, i) => paint(i));
  showProgress(data.progress);

  document.getElementById("next").addEventListener("click", e => { e.preventDefault(); nextType(); });
  document.getElementById("dropall").addEventListener("click", () => {
    if (data.photos.length && confirm(`Drop all ${data.photos.length} photos of ${data.name}?`))
      save(data.photos.map((p, i) => ({ i, decision: "drop" })));
  });
  document.addEventListener("keydown", e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (k === "1" || k === "2" || k === "3") {
      if (!data.photos.length) return;
      save([{ i: focus, decision: { 1: "keep", 2: "drop", 3: "not_sure" }[k] }]);
      setFocus(focus + 1);
    } else if (k === "ArrowRight") setFocus(focus + 1);
    else if (k === "ArrowLeft") setFocus(focus - 1);
    else if (k === "ArrowDown") setFocus(focus + columns());
    else if (k === "ArrowUp") setFocus(focus - columns());
    else if (k === "Enter" && data.photos.length) window.open(`/photo/${data.qid}/${data.photos[focus].sha1}`, "_blank");
    else if (k === "n" || k === "N") nextType();
    else if ((k === "p" || k === "P") && data.prev) location.href = data.prev;
    else return;
    e.preventDefault();
  });
})();
</script>
</body>
</html>
"""


def finished_line(store: Store, qid: str | None) -> str:
    """The line for the type just finished with N: its kept / dropped / not sure counts."""
    i = store.type_index(qid) if qid and QID_RE.fullmatch(qid) else None
    if i is None:
        return ""
    t = store.types[i]
    c = store.counts(t)
    return (f'<div class="finished" role="status" id="finished">Finished <b>{html.escape(t["english_name"])}</b>: '
            f'{c["keep"]} kept · {c["drop"]} dropped · {c["not_sure"]} not sure</div>')


def render_type(store: Store, index: int, finished: str | None = None) -> str:
    t = store.types[index]
    data = {"qid": t["qid"], "name": t["english_name"],
            "photos": [{"sha1": s, "decision": store.decisions.get((s, t["qid"])),
                        "source": store.sources.get((s, t["qid"]), "")} for s in t["photos"]],
            "progress": store.progress(),
            "prev": f"/type/{index}" if index > 0 else None,
            "next": f"/type/{index + 2}" if index + 1 < len(store.types) else None}
    negative = t["allowed"] == "not_allowed"
    hint = (f"Not allowed on Dzirent: these photos teach the check what to refuse. Keep the ones that really show a "
            f"{html.escape(t['english_name'])}." if negative else
            f"Keep the photos that clearly show a {html.escape(t['english_name'])}; drop the rest.")
    values = {
        "__NAME__": html.escape(t["english_name"]),
        "__POS__": str(index + 1), "__TOTAL__": str(len(store.types)),
        "__CATEGORY__": html.escape(t["dzirent_category"]),
        "__ALLOWED__": html.escape(t["allowed"]),
        "__ALLOWED_TEXT__": "not allowed" if negative else html.escape(t["allowed"].replace("_", " ")),
        "__QID__": html.escape(t["qid"]), "__COUNT__": str(len(t["photos"])),
        "__PREV__": data["prev"] or "#", "__PREV_OFF__": "" if data["prev"] else "off",
        "__NEXT__": data["next"] or "#", "__NEXT_OFF__": "" if data["next"] else "off",
        "__HINT__": hint, "__EMPTY__": "", "__FINISHED__": finished_line(store, finished),
        # JSON inside <script>: "</" is escaped so no value can close the tag.
        "__DATA__": json.dumps(data, ensure_ascii=False).replace("</", "<\\/"),
    }
    page = PAGE
    for key, value in values.items():
        page = page.replace(key, value)
    return page


EMPTY_PAGE = ("<!doctype html><html lang='en'><head><meta charset='utf-8'><title>Label check</title></head>"
              "<body style='background:#0e1116;color:#e6edf3;font:18px system-ui;padding:40px'>"
              "<p>manifest.csv has no photos yet. Run <code>python images/fetch_commons.py</code> first.</p></body></html>")


class Handler(BaseHTTPRequestHandler):
    store: Store  # set by make_server
    server_version = "DziRentLabelCheck/0.1"

    def log_message(self, fmt: str, *args) -> None:  # thumbnails would flood the console
        if not str(args[0] if args else "").startswith("GET /thumb/"):
            sys.stderr.write("%s - %s\n" % (self.log_date_time_string(), fmt % args))

    def _send(self, status: int, body: bytes, content_type: str, extra: dict | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store" if content_type.startswith(("text/html", "application/json"))
                         else "max-age=86400")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status: int, obj: dict) -> None:
        self._send(status, json.dumps(obj).encode("utf-8"), "application/json; charset=utf-8")

    def _not_found(self) -> None:
        self._send(404, b"Not found", "text/plain; charset=utf-8")

    def do_GET(self) -> None:
        parts = urlsplit(self.path)
        path = parts.path
        store = self.store
        if path == "/":
            if not store.types:
                return self._send(200, EMPTY_PAGE.encode("utf-8"), "text/html; charset=utf-8")
            first = next((i for i, t in enumerate(store.types) if not store.reviewed(t)), 0)
            return self._send(302, b"", "text/plain", {"Location": f"/type/{first + 1}"})
        m = re.fullmatch(r"/type/(\d+)", path)
        if m:
            index = int(m.group(1)) - 1
            if not 0 <= index < len(store.types):
                return self._not_found()
            finished = parse_qs(parts.query).get("finished", [None])[0]
            return self._send(200, render_type(store, index, finished).encode("utf-8"), "text/html; charset=utf-8")
        m = re.fullmatch(r"/(thumb|photo)/(Q\d+)/([0-9a-f]{40})(?:\.jpg)?", path)
        if m:
            kind, qid, sha1 = m.groups()
            try:
                file = store.thumbnail(sha1, qid) if kind == "thumb" else store.photo_path(sha1, qid)
            except OSError as e:  # a file Pillow can't read
                return self._send(500, f"Can't read this photo: {e}".encode("utf-8"), "text/plain; charset=utf-8")
            if not file:
                return self._not_found()
            return self._send(200, file.read_bytes(), CONTENT_TYPES.get(file.suffix.lower(), "application/octet-stream"))
        return self._not_found()

    def do_POST(self) -> None:
        if urlsplit(self.path).path != "/api/decide":
            return self._not_found()
        try:
            length = int(self.headers.get("Content-Length") or 0)
            if not 0 < length <= 1_000_000:
                raise ValueError("bad request size")
            body = json.loads(self.rfile.read(length).decode("utf-8"))
            qid = str(body.get("qid", ""))
            decisions = body.get("decisions")
            if not QID_RE.fullmatch(qid) or not isinstance(decisions, list):
                raise ValueError("expected {qid, decisions: [{sha1, decision}]}")
            progress = self.store.decide(qid, decisions)
        except (ValueError, json.JSONDecodeError, UnicodeDecodeError) as e:
            return self._json(400, {"error": str(e)})
        return self._json(200, {"ok": True, "saved": len(decisions), "progress": progress})


def make_server(store: Store, port: int = PORT) -> ThreadingHTTPServer:
    handler = type("BoundHandler", (Handler,), {"store": store})
    return ThreadingHTTPServer((HOST, port), handler)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="The label-check page for the downloaded Commons photos.")
    parser.add_argument("--port", type=int, default=PORT)
    parser.add_argument("--labels", type=Path, default=LABELS_CSV, help="where decisions are appended (default labels.csv)")
    parser.add_argument("--launch-only", action="store_true",
                        help="only the needs_owner = yes, priority = launch types of review.csv, in its order")
    args = parser.parse_args(argv)
    store = Store(labels_csv=args.labels, only=launch_order() if args.launch_only else None)
    server = make_server(store, args.port)
    p = store.progress()
    print(f"Label check: http://{HOST}:{server.server_address[1]}  ({'launch types only, ' if args.launch_only else ''}"
          f"{p['types_total']} types, {p['photos_total']} photos, {p['photos_decided']} decided; "
          f"decisions go to {args.labels})", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
