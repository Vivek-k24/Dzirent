"""review_server.py on a small manifest: a type page renders, a POST appends to labels.csv, a
reload shows the saved decision, thumbnails are made once at 256 px; since D2b, --launch-only's
filter and order, the search tag and the finished-type line; since D2c, the source column and
auto_filter.py's rows."""

import csv
import json
import threading
import urllib.error
import urllib.request

import pytest
from PIL import Image

import fetch_commons as fc
import review_server as rs

SHA1S = ["a" * 40, "b" * 40, "c" * 40]


@pytest.fixture
def server(tmp_path):
    images = tmp_path / "images"
    rows = []
    for i, sha1 in enumerate(SHA1S):
        qid = "Q172827" if i < 2 else "Q131151"
        rel = f"files/{qid}/{sha1}.jpg"
        (images / rel).parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGB", (900, 600), (40 * i, 90, 160)).save(images / rel, "JPEG")
        rows.append({"qid": qid, "english_name": "sari" if i < 2 else "t-shirt",
                     "dzirent_category": "Cultural & Traditional" if i < 2 else "not_applicable",
                     "allowed": "allowed" if i < 2 else "not_allowed", "sha1": sha1, "file": rel, "width": 900,
                     "height": 600, "license": "CC BY-SA 4.0", "author": "Someone",
                     "source_url": "https://upload.wikimedia.org/x.jpg",
                     "commons_page_url": "https://commons.wikimedia.org/wiki/File:X.jpg",
                     "downloaded_at": "2026-11-17T12:00:00Z"})
    for r in rows:
        fc.append_manifest(r, images / "manifest.csv")
    labels = images / "labels.csv"
    store = rs.Store(manifest_csv=images / "manifest.csv", labels_csv=labels, images_dir=images,
                     thumbs_dir=images / "thumbs")
    srv = rs.make_server(store, port=0)
    thread = threading.Thread(target=srv.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{srv.server_address[1]}"
    yield base, images, labels
    srv.shutdown()
    srv.server_close()


def get(url):
    with urllib.request.urlopen(url) as resp:
        return resp.status, resp.headers.get("Content-Type"), resp.read()


def post(url, payload):
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"),
                                 headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def page_data(html: str) -> dict:
    start = html.index('<script type="application/json" id="data">') + len('<script type="application/json" id="data">')
    return json.loads(html[start:html.index("</script>", start)])


def test_get_renders_a_type_page(server):
    base, _, _ = server
    status, ctype, body = get(base + "/type/1")
    html = body.decode("utf-8")
    assert status == 200 and ctype.startswith("text/html")
    assert "<h1>sari</h1>" in html and "Cultural &amp; Traditional" in html and "Type 1 of 2" in html
    data = page_data(html)
    assert [p["sha1"] for p in data["photos"]] == SHA1S[:2] and all(p["decision"] is None for p in data["photos"])
    assert data["progress"] == {"types_reviewed": 0, "types_total": 2, "photos_decided": 0, "photos_total": 3}
    # Nothing from Commons on the page but the photos: no file names or authors.
    assert "Someone" not in html and "File:X.jpg" not in html
    status, _, body = get(base + "/type/2")
    assert status == 200 and "not allowed" in body.decode("utf-8")


def test_post_appends_a_labels_row_and_reload_shows_it(server):
    base, _, labels = server
    status, out = post(base + "/api/decide", {"qid": "Q172827", "decisions": [{"sha1": SHA1S[0], "decision": "drop"}]})
    assert status == 200 and out["saved"] == 1 and out["progress"]["photos_decided"] == 1
    with open(labels, encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        lines = list(reader)
    assert reader.fieldnames == ["sha1", "qid", "decision", "decided_at", "source"]
    assert len(lines) == 1 and lines[0]["sha1"] == SHA1S[0] and lines[0]["qid"] == "Q172827"
    assert lines[0]["source"] == "owner"
    assert lines[0]["decision"] == "drop" and lines[0]["decided_at"].endswith("Z")
    data = page_data(get(base + "/type/1")[2].decode("utf-8"))
    assert data["photos"][0]["decision"] == "drop" and data["photos"][1]["decision"] is None
    # A later decision for the same photo is appended, and wins.
    post(base + "/api/decide", {"qid": "Q172827", "decisions": [{"sha1": SHA1S[0], "decision": "keep"},
                                                               {"sha1": SHA1S[1], "decision": "not_sure"}]})
    data = page_data(get(base + "/type/1")[2].decode("utf-8"))
    assert [p["decision"] for p in data["photos"]] == ["keep", "not_sure"]
    assert data["progress"]["types_reviewed"] == 1
    assert len(labels.read_text(encoding="utf-8").strip().splitlines()) == 1 + 3


def test_post_refuses_bad_input(server):
    base, _, labels = server
    assert post(base + "/api/decide", {"qid": "Q172827", "decisions": [{"sha1": SHA1S[0], "decision": "maybe"}]})[0] == 400
    assert post(base + "/api/decide", {"qid": "Q172827", "decisions": [{"sha1": SHA1S[2], "decision": "keep"}]})[0] == 400
    assert not labels.exists()


# --- D2b: --launch-only, the search tag, the finished-type line ------------------------------------
def test_launch_only_keeps_the_sheets_launch_types_in_its_order(tmp_path, server):
    _, images, labels = server
    sheet = tmp_path / "review.csv"
    sheet.write_text("﻿needs_owner,keep,priority,english_name,qid\n"
                     "yes,yes,launch,t-shirt,Q131151\n"   # the sheet's order, not the manifest's
                     "yes,,later,sari,Q172827\n"          # needs_owner but not launch (a keep-list row)
                     "yes,yes,launch,party dress,Q7140985\n"  # launch, but no photos: nothing to show
                     ",,later,cardigan,Q877140\n", encoding="utf-8")
    assert rs.launch_order(sheet) == ["Q131151", "Q7140985"]
    store = rs.Store(manifest_csv=images / "manifest.csv", labels_csv=labels, images_dir=images,
                     thumbs_dir=images / "thumbs", only=rs.launch_order(sheet))
    assert [t["qid"] for t in store.types] == ["Q131151"]
    assert store.progress() == {"types_reviewed": 0, "types_total": 1, "photos_decided": 0, "photos_total": 1}
    html = rs.render_type(store, 0)
    assert "<h1>t-shirt</h1>" in html and "Type 1 of 1" in html


def test_search_photos_carry_a_tag(server):
    base, images, _ = server
    manifest = fc.read_manifest(images / "manifest.csv")
    for m, source in zip(manifest, ["category", "search", "p18"]):
        m["source"] = source
    fc.write_manifest(manifest, images / "manifest.csv")
    store = rs.Store(manifest_csv=images / "manifest.csv", labels_csv=images / "labels.csv", images_dir=images,
                     thumbs_dir=images / "thumbs")
    data = page_data(rs.render_type(store, 0))
    assert [p["source"] for p in data["photos"]] == ["category", "search"]
    assert 'p.source === "search"' in rs.PAGE and 'class="tag"' in rs.PAGE  # the tag the page draws for it


def test_finished_line_after_n(server):
    base, _, _ = server
    post(base + "/api/decide", {"qid": "Q172827", "decisions": [{"sha1": SHA1S[0], "decision": "drop"},
                                                               {"sha1": SHA1S[1], "decision": "keep"}]})
    html = get(base + "/type/2?finished=Q172827")[2].decode("utf-8")
    assert "Finished <b>sari</b>: 1 kept · 1 dropped · 0 not sure" in html
    assert 'id="finished"' not in get(base + "/type/2")[2].decode("utf-8")
    assert 'id="finished"' not in get(base + "/type/2?finished=<b>x</b>")[2].decode("utf-8")  # only a known QID


def test_thumbnail_made_once_at_256(server):
    base, images, _ = server
    status, ctype, body = get(f"{base}/thumb/Q172827/{SHA1S[0]}.jpg")
    assert status == 200 and ctype == "image/jpeg"
    thumb = images / "thumbs" / "Q172827" / f"{SHA1S[0]}.jpg"
    with Image.open(thumb) as im:
        assert max(im.size) == 256
    with pytest.raises(urllib.error.HTTPError):
        get(f"{base}/thumb/Q131151/{SHA1S[0]}.jpg")  # a photo of another type: not served


# --- D2c: the source column -----------------------------------------------------------------------
def test_auto_rows_show_as_auto_until_the_owner_clicks(server):
    base, images, labels = server
    lines = ["sha1,qid,decision,decided_at,source",
             f"{SHA1S[0]},Q172827,keep,2026-11-18T03:00:00Z,owner",
             f"{SHA1S[0]},Q172827,drop,,auto",  # can't happen after a merge; the owner still wins
             f"{SHA1S[1]},Q172827,drop,,auto"]
    labels.write_text("".join(line + "\n" for line in lines), encoding="utf-8")
    store = rs.Store(manifest_csv=images / "manifest.csv", labels_csv=labels, images_dir=images,
                     thumbs_dir=images / "thumbs")
    assert store.decisions[(SHA1S[0], "Q172827")] == "keep" and store.auto == {(SHA1S[1], "Q172827")}
    data = page_data(rs.render_type(store, 0))
    assert [(p["decision"], p["auto"]) for p in data["photos"]] == [("keep", False), ("drop", True)]
    store.decide("Q172827", [{"sha1": SHA1S[1], "decision": "keep"}])
    assert store.auto == set() and store.decisions[(SHA1S[1], "Q172827")] == "keep"
    with open(labels, encoding="utf-8", newline="") as fh:
        last = list(csv.DictReader(fh))[-1]
    assert (last["sha1"], last["decision"], last["source"]) == (SHA1S[1], "keep", "owner")


def test_a_labels_csv_from_before_d2c_gets_four_column_lines(server):
    base, images, labels = server
    labels.write_text(f"sha1,qid,decision,decided_at\n{SHA1S[0]},Q172827,drop,2026-11-18T03:00:00Z\n",
                      encoding="utf-8")
    store = rs.Store(manifest_csv=images / "manifest.csv", labels_csv=labels, images_dir=images,
                     thumbs_dir=images / "thumbs")
    store.decide("Q172827", [{"sha1": SHA1S[1], "decision": "keep"}])
    with open(labels, encoding="utf-8", newline="") as fh:
        rows = list(csv.reader(fh))
    assert [len(r) for r in rows] == [4, 4, 4] and rows[2][:3] == [SHA1S[1], "Q172827", "keep"]
