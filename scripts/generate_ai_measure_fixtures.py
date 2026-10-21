"""Create synthetic known-cm overhead shirt JPEG plus ground-truth corner/landmark coordinates.

For coordinator real browser tests only; NOT evidence of accuracy on field photos.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "ai-measure" / "tests"))
from synthetic import Camera, render, encode, annotation  # noqa: E402

def main() -> None:
    output = ROOT / "test-results" / "ai-measure"
    output.mkdir(parents=True, exist_ok=True)
    camera = Camera(tilt_deg=18.0)
    (output / "tilted-shirt.jpg").write_bytes(encode(render(camera)))
    (output / "annotation.json").write_text(json.dumps(annotation(camera), indent=2), encoding="utf-8")
    print("Generated synthetic garment and exact reference/landmark point fixture; no real user imagery.")

if __name__ == "__main__":
    main()
