"""Download the reviewed Pexels demo selection and OFL fonts; never runs in app runtime."""
import concurrent.futures
import hashlib
import json
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
PHOTO_IDS = [
    19749862, 17980768, 5137870, 14369167, 14560197,
    7446945, 20818921, 27981089, 11557836, 34860506,
    5991953, 37015071, 12498322, 6896429, 36613636,
    18016200, 17420227, 962356, 17257390, 27691959,
    9541935, 21706027, 13662955, 6287743, 32746353,
    17040891, 6739340, 34603145, 30184714, 34673508,
    13364876, 35773806, 7429548, 29345756, 26744719,
    17574574, 10449702, 18184291, 11961180, 9674869,
]


def download(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "dzirent-demo-media/0.1"})
    with urllib.request.urlopen(req, timeout=60) as response:
        return response.read()


def photo(pair: tuple[int, dict]) -> dict:
    index, product = pair
    photo_id = PHOTO_IDS[index]
    path = ROOT / f"public/media/catalog/{photo_id}.jpg"
    url = f"https://images.pexels.com/photos/{photo_id}/pexels-photo-{photo_id}.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=900&h=1200&q=82"
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        content = download(url)
        if not content.startswith(b"\xff\xd8"):
            raise ValueError(f"Unexpected image format for {photo_id}")
        path.write_bytes(content)
    return {"product_id": product["id"], "slug": product["slug"], "image_id": product["image"]["id"],
            "url": f"/media/catalog/{photo_id}.jpg", "source": f"https://www.pexels.com/photo/{photo_id}/",
            "download_url": url, "license": "https://www.pexels.com/license/", "reviewed_on": "2026-10-18",
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "width": 900, "height": 1200}


manifest = json.loads((REPO / "fixtures/catalog/manifest.json").read_text(encoding="utf-8"))
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    media = list(pool.map(photo, enumerate(manifest["products"])))
(ROOT / "src/mocks").mkdir(parents=True, exist_ok=True)
(ROOT / "src/mocks/media.json").write_text(json.dumps(media, indent=2) + "\n", encoding="utf-8")
font_dir = ROOT / "src/fonts"
font_dir.mkdir(parents=True, exist_ok=True)
fonts = []
for folder, filename, local in [
    ("playfairdisplay", "PlayfairDisplay[wght].ttf", "PlayfairDisplay.ttf"),
    ("inter", "Inter[opsz,wght].ttf", "Inter.ttf"),
]:
    source = f"https://raw.githubusercontent.com/google/fonts/main/ofl/{folder}/" + urllib.parse.quote(filename)
    target = font_dir / local
    if not target.exists():
        target.write_bytes(download(source))
    license_url = f"https://raw.githubusercontent.com/google/fonts/main/ofl/{folder}/OFL.txt"
    (font_dir / f"{local[:-4]}-OFL.txt").write_bytes(download(license_url))
    fonts.append({"file": local, "source": source, "license": license_url, "sha256": hashlib.sha256(target.read_bytes()).hexdigest()})
(font_dir / "sources.json").write_text(json.dumps(fonts, indent=2) + "\n", encoding="utf-8")
print(f"Downloaded {len(media)} local fashion photos and {len(fonts)} self-hosted OFL fonts.")
