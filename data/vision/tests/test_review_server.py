"""review_server.py on a small manifest: a type page renders, a POST appends to labels.csv, a
reload shows the saved decision, thumbnails are made once at 256 px."""

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
    assert reader.fieldnames == ["sha1", "qid", "decision", "decided_at"]
    assert len(lines) == 1 and lines[0]["sha1"] == SHA1S[0] and lines[0]["qid"] == "Q172827"
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


def test_thumbnail_made_once_at_256(server):
    base, images, _ = server
    status, ctype, body = get(f"{base}/thumb/Q172827/{SHA1S[0]}.jpg")
    assert status == 200 and ctype == "image/jpeg"
    thumb = images / "thumbs" / "Q172827" / f"{SHA1S[0]}.jpg"
    with Image.open(thumb) as im:
        assert max(im.size) == 256
    with pytest.raises(urllib.error.HTTPError):
        get(f"{base}/thumb/Q131151/{SHA1S[0]}.jpg")  # a photo of another type: not served
