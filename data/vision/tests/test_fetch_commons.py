"""fetch_commons.py on recorded Commons responses (fixtures/commons_cardigan.json and, since D2b,
fixtures/commons_search.json): the license, format and size filters, sha1 dedupe, the manifest and
credits, resuming, the search source, the source column and --prune."""

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
            {**ROW, "qid": "Q7", "sheet_group": "costume", "allowed": "allowed"},
            {**ROW, "qid": "Q3", "sheet_group": "other", "allowed": "not_allowed"},
            {**ROW, "qid": "Q4", "sheet_group": "other", "allowed": "allowed"},
            {**ROW, "qid": "Q5", "sheet_group": "review", "allowed": "review"},
            {**ROW, "qid": "Q6", "sheet_group": "other", "allowed": "allowed", "keep": "no"}]
    assert [(r["qid"], tier, n) for r, tier, n in fc.plan(rows)] == \
        [("Q1", "launch", 80), ("Q2", "launch", 80), ("Q7", "launch", 80), ("Q3", "not_allowed", 40),
         ("Q4", "allowed", 12)]
    assert [r["qid"] for r, _, _ in fc.plan(rows, only_launch=True)] == ["Q1", "Q2", "Q7"]
    assert {n for _, _, n in fc.plan(rows, limit=5)} == {5}


def test_needs_owner_groups_match_the_build():
    import build_taxonomy
    assert fc.NEEDS_OWNER_GROUPS == build_taxonomy.NEEDS_OWNER_GROUPS


# --- D2b: the search source (fixtures/commons_search.json) --------------------------------------
SEARCH = json.loads((Path(__file__).parent / "fixtures" / "commons_search.json").read_text(encoding="utf-8"))
SROW = SEARCH["row"]  # bear suit: needs_owner = yes (keep list), no P18 and no Commons category


class SearchSession(FakeSession):
    """FakeSession that also answers the recorded search."""

    def __init__(self, fixture=FIXTURE):
        super().__init__(fixture)
        self.searches = []

    def route(self, p):
        if p.get("generator") == "search":
            self.searches.append(p)
            return SEARCH["search"] if p["gsrsearch"] == SEARCH["query"] else {"batchcomplete": True}
        return super().route(p)


def search_client(tmp_path, raw="raw"):
    session = SearchSession()
    return fc.Commons(raw_dir=tmp_path / raw, session=session, min_interval=0, sleep=lambda s: None), session


def ranked_search_pages():
    return sorted(SEARCH["search"]["query"]["pages"], key=lambda p: p["index"])


def test_search_source_fills_a_short_needs_owner_type(tmp_path):
    client, session = search_client(tmp_path)
    results = run(client, tmp_path, rows=(SROW,))
    sent = session.searches[0]
    # The request is the one that was recorded: the search module over the File namespace.
    assert {k: sent[k] for k in SEARCH["params"]} == SEARCH["params"]
    assert sent["generator"] == "search" and sent["gsrnamespace"] == "6" and sent["gsrsearch"] == '"bear suit" filetype:bitmap'
    accepted = [fc.check_file(p)[0] for p in ranked_search_pages() if fc.check_file(p)[0]]
    assert len(accepted) == 5 and results[0]["skipped"]["no machine-readable license"] == 1
    assert results[0]["searched"] and results[0]["sources"] == {"search": 5}
    manifest = fc.read_manifest(tmp_path / "manifest.csv")
    assert [m["source"] for m in manifest] == ["search"] * 5
    # Best match first ("index"), not the order Commons listed the pages in.
    assert [m["sha1"] for m in manifest] == [c["sha1"] for c in accepted]
    assert session.downloads == [c["url"] for c in accepted]


def test_search_stops_at_the_cap(tmp_path):
    client, _ = search_client(tmp_path)
    results = run(client, tmp_path, rows=(SROW,), limit=2)  # the cap is the type's target
    assert results[0]["added"] == 2 and len(fc.read_manifest(tmp_path / "manifest.csv")) == 2


def test_search_only_for_needs_owner_types_under_40(tmp_path, monkeypatch):
    negative = {**SROW, "qid": "Q2", "sheet_group": "other", "allowed": "not_allowed"}
    client, session = search_client(tmp_path)
    results = run(client, tmp_path, rows=(negative,))
    assert session.searches == [] and results[0]["added"] == 0 and not results[0]["searched"]

    # The cardigan's own sources give it fewer than 40, so it searches; with the bar at 2 it doesn't.
    client, session = search_client(tmp_path, raw="raw2")
    (tmp_path / "a").mkdir()
    run(client, tmp_path / "a", rows=(ROW,))
    assert [p["gsrsearch"] for p in session.searches] == ['"cardigan" filetype:bitmap']
    monkeypatch.setattr(fc, "SEARCH_BELOW", 2)
    client, session = search_client(tmp_path, raw="raw3")
    (tmp_path / "b").mkdir()
    results = run(client, tmp_path / "b", rows=(ROW,))
    assert session.searches == [] and results[0]["added"] > 2 and not results[0]["searched"]


def test_search_names_are_review_csv_also_called():
    row = {"english_name": "bear suit",
           "vocabulary": ["bear suit", "Bear Suit", 'teddy "bear" costume', "oso", "ours", "urso", "orso", "medved"]}
    assert fc.also_called(row) == ['teddy "bear" costume', "oso", "ours", "urso", "orso"]
    assert fc.search_names(row) == ["bear suit", "teddy bear costume", "oso", "ours", "urso", "orso"]
    # The same names as the committed sheet's also_called column, for every type.
    taxonomy = json.loads(fc.TAXONOMY_JSON.read_text(encoding="utf-8"))
    import build_taxonomy
    sheet = {r["qid"]: r["also_called"] for r in build_taxonomy.read_review_csv()[0]}
    assert all(sheet[r["qid"]] == "; ".join(fc.also_called(r)) for r in taxonomy)


# --- D2b: the manifest's source column ------------------------------------------------------------
def test_manifest_records_each_source(tmp_path):
    client, _ = client_for(tmp_path)
    run(client, tmp_path)
    manifest = fc.read_manifest(tmp_path / "manifest.csv")
    p18 = fc.check_file(FIXTURE["fileinfo"]["query"]["pages"][0])[0]["sha1"]
    by_sha1 = {m["sha1"]: m["source"] for m in manifest}
    assert by_sha1[p18] == "p18"
    assert {m["source"] for m in manifest} == {"p18", "category", "subcategory"}
    category = {fc.check_file(p)[0]["sha1"] for p in FIXTURE["category"]["query"]["pages"] if fc.check_file(p)[0]}
    assert all(by_sha1[s] == "category" for s in category - {p18})


def test_older_manifest_gets_its_sources_from_the_cache(tmp_path):
    client, _ = client_for(tmp_path)
    run(client, tmp_path)
    path = tmp_path / "manifest.csv"
    first = fc.read_manifest(path)
    old_columns = [c for c in fc.MANIFEST_COLUMNS if c != "source"]  # the D2 manifest
    with open(path, "w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=old_columns, lineterminator="\n")
        writer.writeheader()
        writer.writerows({c: m[c] for c in old_columns} for m in first)

    client, session = client_for(tmp_path)
    run(client, tmp_path)
    assert session.api_calls == 0 and session.downloads == []  # the cache alone
    assert fc.read_manifest(path) == first


# --- D2b: --prune --------------------------------------------------------------------------------
def test_prune_removes_files_and_rows(tmp_path):
    client, _ = search_client(tmp_path)
    run(client, tmp_path, rows=(ROW, SROW))
    manifest = fc.read_manifest(tmp_path / "manifest.csv")
    cardigan = [m for m in manifest if m["qid"] == ROW["qid"]]
    bear = [m for m in manifest if m["qid"] == SROW["qid"]]
    assert cardigan and bear
    thumbs = tmp_path / "thumbs"
    (thumbs / ROW["qid"]).mkdir(parents=True)
    (thumbs / ROW["qid"] / f"{cardigan[0]['sha1']}.jpg").write_bytes(JPEG)
    paths = dict(manifest_path=tmp_path / "manifest.csv", files_dir=tmp_path / "files", thumbs_dir=thumbs,
                 credits_path=tmp_path / "CREDITS.md")

    # The cardigan is marked keep = no: its photos, thumbnail and folder go; the bear suit's stay.
    report = fc.prune([{**ROW, "keep": "no"}, SROW], **paths)
    size = len(JPEG) * len(cardigan)
    assert report["files"] == report["manifest_rows"] == len(cardigan) and report["bytes"] == size
    assert report["thumbnails"] == 1 and not (tmp_path / "files" / ROW["qid"]).exists()
    assert not (thumbs / ROW["qid"]).exists()
    assert fc.read_manifest(tmp_path / "manifest.csv") == bear
    assert all((tmp_path / m["file"]).exists() for m in bear)
    credits = (tmp_path / "CREDITS.md").read_text(encoding="utf-8")
    assert f"**{len(bear)} files:**" in credits and not any(m["commons_page_url"] in credits for m in cardigan)

    # The bear suit is no longer in the taxonomy at all: it goes too.
    report = fc.prune([], **paths)
    assert report["files"] == len(bear) and fc.read_manifest(tmp_path / "manifest.csv") == []
    assert not list((tmp_path / "files").rglob("*.jpg"))
