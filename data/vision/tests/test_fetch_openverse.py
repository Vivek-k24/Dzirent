"""fetch_openverse.py (D2d) on a recorded Openverse search (fixtures/openverse_search.json):
license acceptance (pdm included), the photo checks, the cap of 80 kept-or-undecided, the
manifest and openverse.csv rows, the Openverse part of CREDITS.md, the cache, and the stop with
the registration steps when there are no credentials. No network."""

import copy
import hashlib
import io
import json
from collections import Counter
from pathlib import Path

import pytest
from PIL import Image

import fetch_commons as fc
import fetch_openverse as fo

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "openverse_search.json").read_text(encoding="utf-8"))
NEHRU = FIXTURE["responses"]['"nehru jacket"']
ACCEPTED = [r for r in NEHRU["results"] if r["license"] in ("by", "by-sa", "cc0")]
ROW = {"qid": "Q1", "english_name": "nehru jacket", "vocabulary": ["nehru jacket"],
       "dzirent_category": "Cultural & Traditional", "allowed": "allowed"}


def jpeg(seed: int, size=(640, 480), gray=False) -> bytes:
    im = Image.new("RGB", size, ((seed * 53) % 256, (seed * 97) % 256, (seed * 31 + 90) % 256))
    for x in range(0, size[0], 40):
        im.paste(((seed + x) % 256, 200, 30), (x, 0, x + 20, size[1]))
    if gray:
        im = im.convert("L").convert("RGB")
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=90)
    return buf.getvalue()


class FakeResponse:
    def __init__(self, status=200, data=None, content=b"", headers=None):
        self.status_code, self._data, self.content, self.headers = status, data, content, headers or {}

    def json(self):
        return self._data


class FakeSession:
    """Answers searches from the fixture and downloads with a made-up photo per URL; `files`
    overrides what a URL returns."""

    def __init__(self, files=None):
        self.headers, self.files = {}, files or {}
        self.searches, self.downloads, self.tokens = [], [], 0

    def request(self, method, url, params=None, headers=None, data=None, timeout=None):
        if url == fo.TOKEN_URL:
            self.tokens += 1
            return FakeResponse(data={"access_token": "token", "expires_in": 3600})
        if url == fo.API_URL:
            self.searches.append(dict(params))
            body = FIXTURE["responses"].get(params["q"]) if params["page"] == "1" else None
            return FakeResponse(data=body or {"results": [], "page_count": 0},
                                headers={"x-ratelimit-available-anon_sustained": "150"})
        self.downloads.append(url)
        seed = int(hashlib.sha1(url.encode()).hexdigest()[:6], 16)
        return FakeResponse(content=self.files.get(url, jpeg(seed)))


def client_for(tmp_path, session):
    return fo.Openverse(raw_dir=tmp_path / "raw", session=session, sleep=lambda s: None, api_interval=0,
                        download_interval=0)


def run(tmp_path, session, have=0, row=ROW):
    return fo.run(client_for(tmp_path, session), [(row, have)], manifest_path=tmp_path / "manifest.csv",
                  files_dir=tmp_path / "files", openverse_csv=tmp_path / "openverse.csv",
                  credits_path=tmp_path / "CREDITS.md")


@pytest.mark.parametrize("license,ok", [("cc0", True), ("by", True), ("by-sa", True), ("pdm", True), ("BY-SA", True),
                                        ("by-nc", False), ("by-nd", False), ("by-nc-sa", False), ("by-nc-nd", False),
                                        ("sampling+", False), ("nc-sampling+", False), ("", False)])
def test_license_acceptance(license, ok):
    assert fo.accepted({"license": license, "url": "https://example.org/a.jpg", "mature": False})[0] is ok


def test_recorded_results_accept_by_by_sa_cc0_only_and_name_them():
    verdicts = Counter((r["license"], fo.accepted(r)[0]) for r in NEHRU["results"])
    assert verdicts == {("by-nc", False): 5, ("by", True): 5, ("by-nc-sa", False): 3, ("cc0", True): 1,
                        ("by-nc-nd", False): 1, ("by-sa", True): 1}
    assert fo.license_name("pdm", "1.0") == "Public Domain Mark 1.0"
    assert fo.license_name("by-sa", "2.0") == "CC BY-SA 2.0" and fo.license_name("cc0", "1.0") == "CC0 1.0"
    assert fo.accepted({"license": "by", "url": "u", "mature": True}) == (False, "mature")


def test_a_run_saves_accepted_photos_with_their_credits(tmp_path):
    session = FakeSession()
    result = run(tmp_path, session)[0]
    assert session.searches[0]["license"] == "by,by-sa,cc0,pdm" and session.searches[0]["excluded_source"] == "wikimedia"
    assert session.searches[0]["q"] == '"nehru jacket"'
    assert result["added"] == len(ACCEPTED) == 7 and result["counted"] == 7 and result["skipped"]["license"] == 9
    assert sorted(session.downloads) == sorted(r["url"] for r in ACCEPTED)  # refused licenses never downloaded
    manifest = fc.read_manifest(tmp_path / "manifest.csv")
    by_url = {r["url"]: r for r in ACCEPTED}
    for m in manifest:
        r = by_url[m["source_url"]]
        assert m["source"] == "openverse" and m["author"] == (r["creator"] or "unknown")
        assert m["commons_page_url"] == r["foreign_landing_url"]
        assert m["license"] == fo.license_name(r["license"], r["license_version"])
        seed = int(hashlib.sha1(r["url"].encode()).hexdigest()[:6], 16)
        assert m["sha1"] == hashlib.sha1(jpeg(seed)).hexdigest()  # the downloaded file's own sha1
        assert fc.decodes(tmp_path / m["file"])
    rows = fo.read_openverse(tmp_path / "openverse.csv")
    assert {r["openverse_id"] for r in rows} == {r["id"] for r in ACCEPTED}
    assert {r["source_site"] for r in rows} == {r["source"] for r in ACCEPTED}
    credits = (tmp_path / "CREDITS.md").read_text(encoding="utf-8")
    assert "# Openverse" in credits and "not endorsed or certified by" in credits
    first = ACCEPTED[0]
    assert f"({first['foreign_landing_url']})" in credits and f", on {first['source']};" in credits


def test_cap_counts_kept_or_undecided_and_auto_drop_does_not_count(tmp_path):
    gray_url = ACCEPTED[0]["url"]
    session = FakeSession(files={gray_url: jpeg(1, gray=True)})
    result = run(tmp_path, session, have=fo.CAP - 2)[0]
    assert result["auto_drop"] == 1 and result["counted"] == 2 and result["added"] == 3
    assert result["after"] == fo.CAP


def test_small_cut_short_and_wide_files(tmp_path):
    small, broken, wide = (r["url"] for r in ACCEPTED[:3])
    session = FakeSession(files={small: jpeg(2, size=(400, 250)), broken: jpeg(3)[:300], wide: jpeg(4, size=(3000, 1000))})
    result = run(tmp_path, session)[0]
    assert result["skipped"]["small"] == 1 and result["skipped"]["unreadable"] == 1 and result["added"] == 5
    manifest = {m["source_url"]: m for m in fc.read_manifest(tmp_path / "manifest.csv")}
    assert small not in manifest and broken not in manifest
    assert (int(manifest[wide]["width"]), int(manifest[wide]["height"])) == (1280, 427)  # never more than 1280 wide
    on_disk = {p.name for p in (tmp_path / "files").rglob("*") if p.is_file()}
    assert on_disk == {Path(m["file"]).name for m in manifest.values()}


def test_a_second_run_reads_the_cache_and_adds_nothing(tmp_path):
    run(tmp_path, FakeSession())
    before = (tmp_path / "manifest.csv").read_bytes()
    session = FakeSession()
    result = run(tmp_path, session)[0]
    assert session.searches == [] and session.downloads == [] and result["added"] == 0
    assert result["skipped"]["duplicate"] == 7 and (tmp_path / "manifest.csv").read_bytes() == before


def test_registered_runs_send_the_token(tmp_path):
    session = FakeSession()
    client = fo.Openverse(raw_dir=tmp_path / "raw", session=session, creds=("id", "secret"), sleep=lambda s: None,
                          api_interval=0, download_interval=0)
    client.search("achkan", 1)
    client.search("dashiki", 1)
    assert session.tokens == 1 and client.left_today == 150


def test_plan_takes_launch_types_under_40_in_the_sheets_order():
    rows = [{**ROW, "qid": q, "english_name": q} for q in ("Q1", "Q2", "Q3")]
    manifest = [{"sha1": f"{q}{i:038d}", "qid": q, "english_name": q} for q, n in (("Q1", 39), ("Q2", 40), ("Q3", 5))
                for i in range(n)]
    labels = [{"sha1": manifest[0]["sha1"], "qid": "Q1", "decision": "keep", "source": "owner"},
              {"sha1": manifest[50]["sha1"], "qid": "Q2", "decision": "drop", "source": "owner"}]
    assert [(r["qid"], have) for r, have in fo.plan(rows, ["Q3", "Q2", "Q1"], manifest, labels)] == [
        ("Q3", 5), ("Q2", 39), ("Q1", 39)]


def test_read_env_and_credentials(tmp_path, monkeypatch):
    monkeypatch.delenv("OPENVERSE_CLIENT_ID", raising=False)
    monkeypatch.delenv("OPENVERSE_CLIENT_SECRET", raising=False)
    env = tmp_path / "providers.env"
    env.write_text("# comment\nOTHER=x\nOPENVERSE_CLIENT_ID=\"abc\"\n", encoding="utf-8")
    assert fo.read_env(env) == {"OTHER": "x", "OPENVERSE_CLIENT_ID": "abc"}
    assert fo.credentials(env) is None  # the secret is missing
    env.write_text("OPENVERSE_CLIENT_ID=abc\nOPENVERSE_CLIENT_SECRET=def", encoding="utf-8")
    assert fo.credentials(env) == ("abc", "def")
    assert fo.credentials(tmp_path / "missing.env") is None


def test_without_credentials_it_prints_the_steps_and_makes_no_request(monkeypatch, capsys):
    monkeypatch.setattr(fo, "credentials", lambda path=None: None)
    monkeypatch.setattr(fo.fc, "load_rows", lambda: [ROW])
    monkeypatch.setattr(fo.fc, "read_manifest", lambda path=None: [])
    monkeypatch.setattr(fo.af, "read_labels", lambda path=None: [])
    monkeypatch.setattr(fo, "launch_order", lambda: ["Q1"])
    monkeypatch.setattr(fo, "Openverse", None)  # constructing a client would fail the test
    assert fo.main([]) == 2
    out = capsys.readouterr().out
    assert "api.openverse.org/v1/auth_tokens/register/" in out and "providers.env" in out
    assert "OPENVERSE_CLIENT_SECRET=$($r.client_secret)" in out
