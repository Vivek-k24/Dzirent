"""Create synthetic known-cm overhead shirt JPEG plus ground-truth corner/landmark coordinates.

For coordinator real browser tests only; NOT evidence of accuracy on field photos.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "ai-measure" / "tests"))
from synthetic import Camera, render, encode, annotation, corners_px  # noqa: E402
import numpy as np

def main() -> None:
    output = ROOT / "test-results" / "ai-measure"
    output.mkdir(parents=True, exist_ok=True)
    camera = Camera(tilt_deg=18.0)
    (output / "tilted-shirt.jpg").write_bytes(encode(render(camera)))
    (output / "annotation.json").write_text(json.dumps(annotation(camera), indent=2), encoding="utf-8")
    # Phase 2B: a separate real-image-bytes dataset for guided *paper* calibration.
    # These pictures are synthesized, not real-world accuracy evidence.
    skewed = Camera(tilt_deg=20, tilt_axis_deg=120, roll_deg=-20, focal=1300)
    front = Camera()
    tilted_truth = corners_px(skewed) + 0.5  # browser corner-origin pixels
    front_truth = corners_px(front) + 0.5
    def write_case(name: str, camera: Camera, approx: np.ndarray,
                   truth: np.ndarray | None = None, **scene: object) -> dict[str, object]:
        (output / f"paper-{name}.png").write_bytes(encode(render(camera, **scene), ".png"))
        return {
            "file": f"paper-{name}.png",
            "approx_corners_px": np.round(approx).astype(int).tolist(),
            "true_corners_px": np.round(truth, 4).tolist() if truth is not None else None,
        }
    cases = {
        "snapped": write_case("snapped", skewed, tilted_truth + 8.0,
                              tilted_truth, supersample=3),
        "not_found": write_case("not_found", front, front_truth, paper=False),
        "ambiguous": write_case("ambiguous", front,
                                front_truth + np.array([0.0, 175.0]),
                                extra_sheets_cm=((-2.0, 31.0),)),
    }
    (output / "paper-snap-cases.json").write_text(
        json.dumps(cases, indent=2), encoding="utf-8"
    )
    print("Generated real-byte synthetic garment/paper cases: snapped, not_found, ambiguous.")
    print("Synthetic pixel geometry is not evidence of accuracy on field photographs.")

if __name__ == "__main__":
    main()
