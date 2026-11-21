"""ingest_own.py (D2e): folder names matched to review.csv's English names, metadata stripped,
long side at most 1600 px, the manifest and labels rows, train only in the split, the owner-upload
rows kept through the auto-filter's merge, and the credits count. No network."""
import csv
import io

from PIL import Image, PngImagePlugin

import auto_filter as af
import fetch_commons as fc
import ingest_own as io_
import split

ROWS = [
    {"qid": "Q837879", "english_name": "Sherwani", "dzirent_category": "Cultural & Traditional", "allowed": "allowed"},
    {"qid": "Q855915", "english_name": "kurta", "dzirent_category": "Cultural & Traditional", "allowed": "allowed"},
    {"qid": "Q1", "english_name": "Twin", "dzirent_category": "Everyday", "allowed": "allowed"},
    {"qid": "Q2", "english_name": "twin", "dzirent_category": "Everyday", "allowed": "allowed"},
]


def jpeg_with_exif(size=(400, 300), orientation=1, colour=(180, 40, 60)) -> bytes:
    im = Image.new("RGB", size, colour)
    exif = Image.Exif()
    exif[0x010F] = "PhoneMaker"          # Make
    exif[0x0110] = "PhoneModel 15"       # Model
    exif[0x0112] = orientation           # Orientation
    exif[0x0132] = "2026:11:19 10:00:00"  # DateTime
    gps = exif.get_ifd(0x8825)
    gps[1], gps[2], gps[3], gps[4] = "N", (47.0, 36.0, 0.0), "W", (122.0, 19.0, 0.0)
    buf = io.BytesIO()
    im.save(buf, "JPEG", exif=exif, quality=90)
    return buf.getvalue()


def png_with_text(size=(500, 500)) -> bytes:
    info = PngImagePlugin.PngInfo()
    info.add_text("Comment", "taken at home, 12 Some Street")
    buf = io.BytesIO()
    Image.new("RGB", size, (20, 90, 200)).save(buf, "PNG", pnginfo=info)
    return buf.getvalue()


def setup(tmp_path, folders: dict[str, dict[str, bytes]]):
    own = tmp_path / "vision-own"
    for name, files in folders.items():
        (own / name).mkdir(parents=True)
        for fname, content in files.items():
            (own / name / fname).write_bytes(content)
    images = tmp_path / "images"
    (images / "files").mkdir(parents=True)
    return own, images


def ingest(own, images, **kw):
    return io_.ingest(own, rows=ROWS, manifest_path=images / "manifest.csv", files_dir=images / "files",
                      labels_path=images / "labels.csv", credits_path=images / "CREDITS.md", **kw)


def test_folder_names_match_english_names_exactly_ignoring_case(tmp_path):
    own, images = setup(tmp_path, {"SHERWANI": {}, "kurta": {}, "kurtas": {}, "Twin": {}, "nehru jacket": {}})
    matched, skipped = io_.match_folders(own, ROWS)
    assert {f.name: r["qid"] for f, r in matched.items()} == {"SHERWANI": "Q837879", "kurta": "Q855915"}
    assert skipped["kurtas"] == "matches no type in review.csv"  # exact, not a near match
    assert skipped["nehru jacket"] == "matches no type in review.csv"
    assert skipped["Twin"].startswith("matches more than one type")


def test_metadata_is_stripped_and_the_photo_turned_upright(tmp_path):
    own, images = setup(tmp_path, {"Sherwani": {"a.jfif": jpeg_with_exif(orientation=6)}, "kurta": {"b.png": png_with_text()}})
    out = ingest(own, images)
    assert out["added"] == 2 and out["folders_skipped"] == {}
    for m in fc.read_manifest(images / "manifest.csv"):
        with Image.open(images / m["file"]) as im:
            assert len(im.getexif()) == 0 and not set(im.info) & {"exif", "xmp", "icc_profile", "Comment", "comment"}
            raw = (images / m["file"]).read_bytes()
            assert b"PhoneModel" not in raw and b"PhoneMaker" not in raw and b"Some Street" not in raw
            if m["qid"] == "Q837879":
                assert im.size == (300, 400) and m["file"].endswith(".jpg")  # rotated by the orientation tag; .jfif saved as .jpg


def test_long_side_at_most_1600_never_enlarged(tmp_path):
    own, images = setup(tmp_path, {"kurta": {"big.jpg": jpeg_with_exif(size=(3200, 2000)),
                                             "small.jpg": jpeg_with_exif(size=(320, 240), colour=(1, 2, 3))}})
    ingest(own, images)
    sizes = sorted((int(m["width"]), int(m["height"])) for m in fc.read_manifest(images / "manifest.csv"))
    assert sizes == [(320, 240), (1600, 1000)]


def test_manifest_and_labels_rows_and_a_second_run_adds_nothing(tmp_path):
    content = jpeg_with_exif()
    own, images = setup(tmp_path, {"Sherwani": {"a.jpg": content, "copy.jpg": content, "notes.txt": b"x"}})
    (images / "labels.csv").write_text("sha1,qid,decision,decided_at,source\nabc,Q9,drop,t,owner\n", encoding="utf-8",
                                       newline="\n")
    out = ingest(own, images)
    assert out["types"]["Sherwani"]["added"] == 1
    assert out["types"]["Sherwani"]["skipped"] == {"already in the manifest": 1, "not a JPEG, PNG or WebP": 1}
    [m] = fc.read_manifest(images / "manifest.csv")
    assert (m["source"], m["license"], m["author"], m["source_url"], m["commons_page_url"]) == \
        ("owner", "owner", "Dzirent owner", "", "")
    labels = list(csv.DictReader(open(images / "labels.csv", encoding="utf-8", newline="")))
    assert labels[0]["sha1"] == "abc"  # the existing rows stay as they are
    assert (labels[1]["sha1"], labels[1]["decision"], labels[1]["source"]) == (m["sha1"], "keep", "owner-upload")
    assert b"\r" not in (images / "labels.csv").read_bytes()
    before = [(images / f).read_bytes() for f in ("manifest.csv", "labels.csv")]
    assert ingest(own, images)["added"] == 0
    assert [(images / f).read_bytes() for f in ("manifest.csv", "labels.csv")] == before
    credits = (images / "CREDITS.md").read_text(encoding="utf-8")
    assert "# The Dzirent owner's photos" in credits and "1 photos taken by the Dzirent owner" in credits
    assert "## owner" not in credits  # not listed as a Commons license


def test_dry_run_writes_nothing(tmp_path):
    own, images = setup(tmp_path, {"kurta": {"a.jpg": jpeg_with_exif()}})
    out = ingest(own, images, dry_run=True)
    assert out["added"] == 1 and not (images / "manifest.csv").exists() and not (images / "labels.csv").exists()
    assert not any((images / "files").iterdir())


def test_owner_uploads_are_kept_by_the_merge_win_over_auto_drop_and_train_only(tmp_path):
    own, images = setup(tmp_path, {"kurta": {"a.jpg": jpeg_with_exif(), "b.jpg": jpeg_with_exif(colour=(128, 128, 128))}})
    ingest(own, images)
    manifest = fc.read_manifest(images / "manifest.csv")
    labels = af.read_labels(images / "labels.csv")
    autos = [{"sha1": m["sha1"], "auto_drop": "yes"} for m in manifest]  # say the filter drops both (grey, ...)
    merged = af.merge(labels, autos, manifest)
    assert merged == [{**r, "source": "owner-upload"} for r in labels]  # unchanged, and no auto row added
    assert all(d == ("keep", "owner") for d in af.effective(merged).values())
    others = [{"sha1": f"{i:040x}", "qid": "Q855915", "english_name": "kurta"} for i in range(10)]
    t = split.build(manifest + others, merged)["types"]["Q855915"]
    assert {m["sha1"] for m in manifest} <= set(t["train"]) and len(t["test"]) == 2
    assert not {m["sha1"] for m in manifest} & set(t["test"])


def test_forget_owner_leaves_owner_uploads_alone():
    text = ("sha1,qid,decision,decided_at,source\n"
            "a,Q1,drop,t,owner\n"
            "b,Q1,keep,t,owner-upload\n")
    out, removed = af.forget_owner(text, {"Q1"})
    assert out == "sha1,qid,decision,decided_at,source\nb,Q1,keep,t,owner-upload\n" and removed == {"Q1": 1}


def test_a_missing_folder_is_reported(tmp_path, capsys):
    assert io_.main(["--from", str(tmp_path / "nowhere")]) == 0
    assert "doesn't exist" in capsys.readouterr().out
