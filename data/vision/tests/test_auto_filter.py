"""auto_filter.py (D2c): the rules on images made here (grayscale, colour, a page, sepia, small),
and the merge into labels.csv (an owner decision always beats auto_drop)."""
import csv
import random

import pytest
from PIL import Image, ImageDraw

import auto_filter as af


def save(im: Image.Image, path):
    im.save(path)
    return path


def photo_like(size=(640, 480), seed=1):
    """A busy colour scene: blocks of strong colours with noise."""
    rnd = random.Random(seed)
    im = Image.new("RGB", size, (90, 120, 160))
    d = ImageDraw.Draw(im)
    for _ in range(60):
        x, y = rnd.randrange(size[0]), rnd.randrange(size[1])
        d.rectangle([x, y, x + rnd.randrange(30, 160), y + rnd.randrange(30, 160)],
                    fill=(rnd.randrange(256), rnd.randrange(256), rnd.randrange(256)))
    return im


def test_grayscale_photo_is_auto_drop(tmp_path):
    m = af.measure(save(photo_like().convert("L").convert("RGB"), tmp_path / "gray.png"))
    assert m["saturation"] < af.GRAY_MAX
    assert af.classify(m) == ["grayscale"]


def test_colour_photo_stays(tmp_path):
    m = af.measure(save(photo_like(), tmp_path / "colour.png"))
    assert m["saturation"] > 0.3
    assert af.classify(m) == []


def test_page_scan_is_auto_drop(tmp_path):
    """Cream paper all round, brown ink lines of text and a small drawing in the middle."""
    paper, ink = (238, 230, 212), (70, 58, 46)
    im = Image.new("RGB", (600, 800), paper)
    d = ImageDraw.Draw(im)
    for y in range(120, 700, 24):
        d.line([(80, y), (520, y)], fill=ink, width=3)
    d.ellipse([220, 300, 380, 520], outline=ink, width=4)
    m = af.measure(save(im, tmp_path / "page.png"))
    assert af.page_score(m) == 4 and m["border_s"] >= af.PAGE_BORDER_S
    assert "page" in af.classify(m)


def test_white_studio_shot_is_not_a_page(tmp_path):
    """A pale garment on pure white: paper borders, low saturation, but the border isn't cream."""
    im = Image.new("RGB", (600, 800), (255, 255, 255))
    ImageDraw.Draw(im).rectangle([150, 120, 450, 700], fill=(225, 215, 205))
    m = af.measure(save(im, tmp_path / "studio.png"))
    assert af.page_score(m) == 4
    assert "page" not in af.classify(m)


def test_sepia_photo_is_auto_drop(tmp_path):
    gray = photo_like(seed=2).convert("L")
    sepia = Image.merge("RGB", [gray, gray.point(lambda v: int(v * 0.92)), gray.point(lambda v: int(v * 0.8))])
    m = af.measure(save(sepia, tmp_path / "sepia.png"))
    assert m["tint_cover"] > 0.9 and m["hue_r"] > 0.99
    assert af.classify(m) == ["sepia"]


def test_short_side_under_300_is_auto_drop(tmp_path):
    m = af.measure(save(photo_like(size=(640, 280)), tmp_path / "small.png"))
    assert af.classify(m) == ["small"]


def test_unreadable_file_is_auto_drop_and_not_cached(tmp_path):
    images = tmp_path / "images"
    (images / "files" / "Q1").mkdir(parents=True)
    good = save(photo_like(), images / "files" / "Q1" / ("a" * 40 + ".png"))
    (images / "files" / "Q1" / ("b" * 40 + ".jpg")).write_bytes(good.read_bytes()[:40])  # cut short
    manifest = [{"sha1": "a" * 40, "file": "files/Q1/" + "a" * 40 + ".png"},
                {"sha1": "b" * 40, "file": "files/Q1/" + "b" * 40 + ".jpg"}]
    stats_path = tmp_path / "stats.json"
    stats = af.measure_all(manifest, images_dir=images, stats_path=stats_path, workers=1)
    rows = af.auto_rows(manifest, stats)
    assert [(r["auto_drop"], r["reason"]) for r in rows] == [("no", ""), ("yes", "unreadable")]
    assert list(af.json.loads(stats_path.read_text())["photos"]) == ["a" * 40]


def test_transparent_png_is_measured_on_white(tmp_path):
    im = Image.new("RGBA", (400, 400), (0, 0, 0, 0))
    ImageDraw.Draw(im).rectangle([100, 100, 300, 300], fill=(200, 30, 30, 255))
    m = af.measure(save(im, tmp_path / "cutout.png"))
    assert m["black_frac"] == 0 and m["white_frac"] > 0.6
    assert af.classify(m) == []


# --- merge -----------------------------------------------------------------------------------------
MANIFEST = [{"sha1": s, "qid": "Q1", "english_name": "dress"} for s in ("a" * 40, "b" * 40, "c" * 40)]


def autos(*dropped):
    return [{"sha1": m["sha1"], "auto_drop": "yes" if m["sha1"] in dropped else "no"} for m in MANIFEST]


def test_owner_keep_beats_auto_drop_and_owner_rows_stay_unchanged():
    a, b, c = (m["sha1"] for m in MANIFEST)
    labels = [  # a file from before D2c: no source column
        {"sha1": a, "qid": "Q1", "decision": "drop", "decided_at": "2026-11-18T03:23:14Z"},
        {"sha1": a, "qid": "Q1", "decision": "keep", "decided_at": "2026-11-18T03:24:02Z"},
        {"sha1": c, "qid": "Q1", "decision": "not_sure", "decided_at": "2026-11-18T03:25:00Z"},
    ]
    merged = af.merge(labels, autos(a, b), MANIFEST)
    assert merged[:3] == [{**r, "source": "owner"} for r in labels]
    assert merged[3:] == [{"sha1": b, "qid": "Q1", "decision": "drop", "decided_at": "", "source": "auto"}]
    eff = af.effective(merged)
    assert eff[a] == ("keep", "owner") and eff[b] == ("drop", "auto") and eff[c] == ("not_sure", "owner")
    # Merging again changes nothing, and an auto row can't outrank an owner row, wherever it sits.
    assert af.merge(merged, autos(a, b), MANIFEST) == merged
    assert af.effective(merged + [{"sha1": a, "qid": "Q1", "decision": "drop", "source": "auto"}])[a] == ("keep", "owner")


def test_merge_drops_auto_rows_the_filter_no_longer_marks():
    a, b, _ = (m["sha1"] for m in MANIFEST)
    first = af.merge([], autos(a, b), MANIFEST)
    assert [r["sha1"] for r in first] == [a, b]
    assert [r["sha1"] for r in af.merge(first, autos(b), MANIFEST)] == [b]


def test_kept_by_type_counts_undecided_as_keep():
    a, b, c = (m["sha1"] for m in MANIFEST)
    labels = af.merge([{"sha1": c, "qid": "Q1", "decision": "drop", "decided_at": "t"}], autos(b), MANIFEST)
    assert af.kept_by_type(MANIFEST, labels) == {"Q1": [a]}


def test_labels_csv_round_trip(tmp_path):
    a, b, _ = (m["sha1"] for m in MANIFEST)
    path = tmp_path / "labels.csv"
    af.write_csv(af.merge([{"sha1": a, "qid": "Q1", "decision": "keep", "decided_at": "t"}], autos(a, b), MANIFEST),
                 af.LABEL_COLUMNS, path)
    with open(path, encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh)
        assert reader.fieldnames == ["sha1", "qid", "decision", "decided_at", "source"]
        assert [(r["sha1"], r["source"]) for r in reader] == [(a, "owner"), (b, "auto")]
    assert b"\r\n" not in path.read_bytes()


@pytest.mark.parametrize("value,bin_count", [(0.0, 1), (0.019, 1), (0.6, 1)])
def test_histogram_bins(value, bin_count):
    text = af.histogram({"x": {"saturation": value}})
    assert sum(1 for line in text.splitlines() if line.split()[1] == "1") == bin_count
