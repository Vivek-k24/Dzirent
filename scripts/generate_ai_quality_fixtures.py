"""Generate temporary, non-personal photos for AI-QUALITY-1 Phase 2B browser tests.

Uses the service's deterministic scene generator; these are synthetic images,
not evidence of field accuracy. Never commit resulting JPEGs.
"""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "ai-quality" / "tests"))
from synthetic import Scene, render, encode  # noqa: E402

def main() -> None:
    directory = ROOT / "test-results" / "ai-quality"
    directory.mkdir(parents=True, exist_ok=True)
    for name, scene in (
        ("usable", Scene()),
        ("blurred", Scene(blur_sigma=6)),
        ("no_paper", Scene(paper=False)),
    ):
        (directory / f"{name}.jpg").write_bytes(encode(render(scene)))
    print("Generated 3 synthetic photo fixtures in test-results/ai-quality.")

if __name__ == "__main__":
    main()
