"""fetch_commons.py on recorded Commons responses (fixtures/commons_cardigan.json): the license,
format and size filters, sha1 dedupe, the manifest and credits, and resuming."""

import copy
import csv
import io
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import pytest
import requests
from PIL import Image

import fetch_commons as fc

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "commons_cardigan.json").read_text(encoding="utf-8"))
ROW = FIXTURE["row"]
CATEGORY = fc.category_title(ROW["commons_category"])


def tiny_jpeg() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), (120, 60, 30)).save(buf, "JPEG")
    return buf.getvalue()


JPEG = tiny_jpeg()


class FakeResponse:
    def __init__(self, status=200, data=None, content=b"", headers=None):
        self.status_code, self._data, self.content, self.headers = status, data, content, headers or {}

    def json(self):
        return self._data

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(str(self.status_code))


class FakeSession:
    """Stands in for requests.Session: the API answers from the fixture, downloads get a JPEG."""

    def __init__(self, fixture):
        self.fx, self.headers, self.api_calls, self.downloads = fixture, {}, 0, []

    def get(self, url, params=None, timeout=None):
        if url == fc.API_URL:
            self.api_calls += 1
            return FakeResponse(data=self.route(params))
        self.downloads.append(url)
        return FakeResponse(content=JPEG, headers={"Content-Type": "image/jpeg"})

    def route(self, p):
        if "titles" in p:
            return self.fx["fileinfo"]
        if p.get("list") == "categorymembers":
            return self.fx["subcats"] if p["cmtitle"] == CATEGORY else {"batchcomplete": True}
        if p.get("gcmtitle") == CATEGORY:
            return self.fx["category"]
        if p.get("gcmtitle") == self.fx["subcategory"]:
            return self.fx["subcategory_files"]
        return {"batchcomplete": True}


def client_for(tmp_path, fixture=FIXTURE, raw="raw"):
    session = FakeSession(fixture)
    return fc.Commons(raw_dir=tmp_path / raw, session=session, min_interval=0, sleep=lambda s: None), session


def run(client, tmp_path, rows=(ROW,), **kw):
    return fc.run(client, list(rows), manifest_path=tmp_path / "manifest.csv", files_dir=tmp_path / "files",
                  credits_path=tmp_path / "CREDITS.md",
                  now=lambda: datetime(2026, 11, 17, 12, 0, tzinfo=timezone.utc), **kw)


def all_pages(fixture=FIXTURE):
    return [p for part in ("fileinfo", "category", "subcategory_files") for p in fixture[part]["query"]["pages"]]


def accepted_sha1s(fixture=FIXTURE):
    return {fc.check_file(p)[0]["sha1"] for p in all_pages(fixture) if fc.check_file(p)[0]}


def page_like(width, height, *, thumb=None, mime="image/jpeg", code="cc-by-sa-4.0"):
    """A file page shaped like Commons' (as in the fixture), with the given size."""
    page = copy.deepcopy(FIXTURE["fileinfo"]["query"]["pages"][0])
    info = page["imageinfo"][0]
    info.update(width=width, height=height, mime=mime)
    tw, th = thumb or (width, height)
    info.update(thumbwidth=tw, thumbheight=th)
    if width > fc.RENDITION_WIDTH:  # Commons' rendition URL; for a narrower file it points at the original
        info["thumburl"] = ("https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a8/Sesame_Full_View.jpg/"
                            "1280px-Sesame_Full_View.jpg?utm_source=commons.wikimedia.org")
    info["extmetadata"]["License"] = {"value": code}
    return page


# --- the license filter -------------------------------------------------------------------------
@pytest.mark.parametrize("code, family", [
    ("cc-by-sa-4.0", "CC BY-SA"), ("cc-by-sa-3.0", "CC BY-SA"), ("cc-by-sa-3.0-de", "CC BY-SA"),
    ("cc-by-sa-2.0-kr", "CC BY-SA"), ("cc-by-sa-2.5,2.0,1.0", "CC BY-SA"), ("CC-BY-SA-4.0", "CC BY-SA"),
    ("cc-by-4.0", "CC BY"), ("cc-by-2.0", "CC BY"), ("cc-by-2.5-ar", "CC BY"), ("cc-by-3.0-us", "CC BY"),
    ("cc0", "CC0"), ("pd", "Public domain"),
])
def test_license_filter_accepts(code, family):
    assert fc.license_family(code) == family


@pytest.mark.parametrize("code", [
    None, "", "gfdl", "fal", "attribution", "gpl", "copyrighted free use", "cc-by-nc-2.0", "cc-by-nd-4.0",
    "cc-by-nc-sa-4.0", "cc-by-sa", "cc-by", "cc-by-sa-4.0 or gfdl", "all rights reserved",
])
def test_license_filter_refuses(code):
    assert fc.license_family(code) is None


def test_recorded_pages_get_the_right_verdict():
    verdicts = {p["title"]: fc.check_file(p)[1] or fc.check_file(p)[0]["license"] for p in all_pages()}
    # Commons gives no machine-readable code for licenses outside the policy (here "No restrictions").
    assert verdicts["File:Launch and entry suits hang in readiness for the STS-111 crew (5135053006).jpg"] == \
        "no machine-readable license"
    assert verdicts["File:Sesame Full View.jpg"] == "CC BY 2.0"
    assert verdicts["File:Lusekofte.jpg"] == "Public domain"
    assert sum(v == "format" for v in verdicts.values()) == 4  # the TIFF, SVG, GIF and PDF
    for title, verdict in verdicts.items():
        if title.lower().endswith((".svg", ".gif", ".tif", ".tiff", ".pdf")):
            assert verdict == "format", title


# --- the size filter ----------------------------------------------------------------------------
def test_size_filter():
    assert fc.check_file(page_like(299, 1000))[1] == "small"
    assert fc.check_file(page_like(1000, 299))[1] == "small"
    ok, why = fc.check_file(page_like(300, 1000))
    assert why == "" and (ok["width"], ok["height"]) == (300, 1000)
    # A panorama passes on its own, but its 1280 px rendition would be 1280 x 288: refused.
    assert fc.check_file(page_like(4000, 900, thumb=(1280, 288)))[1] == "small"


def test_saved_rendition_and_url():
    small, _ = fc.check_file(page_like(1000, 1500, thumb=(1280, 1920)))  # never enlarged: the original
    assert (small["width"], small["height"]) == (1000, 1500) and "/thumb/" not in small["url"]
    big, _ = fc.check_file(page_like(3000, 4000, thumb=(1280, 1707)))  # the 1280 px rendition
    assert (big["width"], big["height"]) == (1280, 1707) and "/thumb/" in big["url"]
    assert "?" not in big["url"] and "utm_" not in big["url"] + big["commons_page_url"]


# --- a run: dedupe, the manifest, the credits, resuming ------------------------------------------
def test_sha1_dedupe(tmp_path):
    fixture = copy.deepcopy(FIXTURE)
    # The same file listed again in the subcategory, as Commons does when a file is in both.
    again = next(p for p in fixture["category"]["query"]["pages"] if fc.check_file(p)[0])
    fixture["subcategory_files"]["query"]["pages"].append({**copy.deepcopy(again), "title": "File:Copy.jpg"})
    client, session = client_for(tmp_path, fixture)
    other = {**ROW, "qid": "Q1", "english_name": "other type"}  # same P18 file as the cardigan
    results = run(client, tmp_path, rows=(ROW, other))
    expected = accepted_sha1s(fixture)
    assert len(session.downloads) == len(expected)
    manifest = fc.read_manifest(tmp_path / "manifest.csv")
    assert sorted(m["sha1"] for m in manifest) == sorted(expected)
    assert results[0]["skipped"]["duplicate"] >= 1
    assert results[1]["added"] == 0 and results[1]["skipped"]["duplicate"] >= 1


def test_manifest_schema_and_credits(tmp_path):
    client, _ = client_for(tmp_path)
    run(client, tmp_path)
    with open(tmp_path / "manifest.csv", encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        rows = list(reader)
    assert reader.fieldnames == fc.MANIFEST_COLUMNS
    assert len(rows) == len(accepted_sha1s())
    for m in rows:
        assert all(m[c] != "" for c in fc.MANIFEST_COLUMNS), m
        assert m["qid"] == ROW["qid"] and m["english_name"] == ROW["english_name"]
        assert m["dzirent_category"] == ROW["dzirent_category"] and m["allowed"] == ROW["allowed"]
        assert re.fullmatch(rf"files/{ROW['qid']}/{m['sha1']}\.(jpg|png|webp)", m["file"])
        assert (tmp_path / m["file"]).exists()
        assert min(int(m["width"]), int(m["height"])) >= fc.MIN_SIDE
        assert re.fullmatch(r"CC0|Public domain|CC BY(-SA)? \d\.\d( [a-z]{2})?", m["license"]), m["license"]
        assert m["commons_page_url"].startswith("https://commons.wikimedia.org/wiki/File:")
        assert m["source_url"].startswith("https://") and "?" not in m["source_url"]
        assert m["downloaded_at"] == "2026-11-17T12:00:00Z"
    credits = (tmp_path / "CREDITS.md").read_text(encoding="utf-8")
    for license_name in {m["license"] for m in rows}:
        assert f"\n## {license_name}" in credits
    assert all(m["commons_page_url"] in credits for m in rows)
    assert "## CC BY-SA 3.0 (https://creativecommons.org/licenses/by-sa/3.0/)" in credits


def test_resumable(tmp_path):
    client, session = client_for(tmp_path)
    first = run(client, tmp_path)
    added = first[0]["added"]
    assert added > 0 and first[0]["short"] == first[0]["target"] - added  # the fixture runs out before 80
    before = (tmp_path / "manifest.csv").read_text(encoding="utf-8")

    client, session = client_for(tmp_path)  # a second run, same cache and manifest
    second = run(client, tmp_path)
    assert second[0]["added"] == 0
    assert session.api_calls == 0 and session.downloads == []  # listings from the cache, no file again
    assert (tmp_path / "manifest.csv").read_text(encoding="utf-8") == before


def test_type_at_target_makes_no_calls(tmp_path):
    client, _ = client_for(tmp_path)
    run(client, tmp_path, limit=3)
    client, session = client_for(tmp_path, raw="empty-cache")  # even with no cache at all
    results = run(client, tmp_path, limit=3)
    assert results[0]["had"] == 3 and results[0]["added"] == 0 and session.api_calls == 0


def test_dry_run_downloads_nothing(tmp_path):
    client, session = client_for(tmp_path)
    results = run(client, tmp_path, dry_run=True)
    assert results[0]["added"] == len(accepted_sha1s())
    assert session.downloads == [] and not (tmp_path / "manifest.csv").exists() and not (tmp_path / "files").exists()


def test_targets_and_only_launch():
    rows = [{**ROW, "qid": "Q1", "sheet_group": "launch", "allowed": "allowed"},
            {**ROW, "qid": "Q2", "sheet_group": "keep", "allowed": "allowed"},
            {**ROW, "qid": "Q3", "sheet_group": "other", "allowed": "not_allowed"},
            {**ROW, "qid": "Q4", "sheet_group": "other", "allowed": "allowed"},
            {**ROW, "qid": "Q5", "sheet_group": "review", "allowed": "review"},
            {**ROW, "qid": "Q6", "sheet_group": "other", "allowed": "allowed", "keep": "no"}]
    assert [(r["qid"], tier, n) for r, tier, n in fc.plan(rows)] == \
        [("Q1", "launch", 80), ("Q2", "launch", 80), ("Q3", "not_allowed", 40), ("Q4", "allowed", 12)]
    assert [r["qid"] for r, _, _ in fc.plan(rows, only_launch=True)] == ["Q1", "Q2"]
    assert {n for _, _, n in fc.plan(rows, limit=5)} == {5}
