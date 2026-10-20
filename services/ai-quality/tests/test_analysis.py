"""Rule outcomes on deterministic synthetic scenes. These are fixture cases, not accuracy claims."""

import pytest
from synthetic import Scene, encode, render

from dzirent_ai_quality.analysis import CheckResult, analyze, derive_decision, message_for
from dzirent_ai_quality.imaging import decode

CASES = [
    # name, scene, {check: (status, reason)}, decision
    (
        "usable",
        Scene(),
        {
            "blur": ("pass", "sharp"),
            "exposure": ("pass", "acceptable_light"),
            "paper": ("pass", "four_corners_visible"),
            "framing": ("pass", "garment_fully_visible"),
        },
        "pass",
    ),
    ("blurred", Scene(blur_sigma=6), {"blur": ("fail", "blurry")}, "retake"),
    (
        "slightly_soft",
        Scene(blur_sigma=0.8),
        {"blur": ("uncertain", "borderline_sharpness")},
        "review",
    ),
    (
        "dark",
        Scene(gain=0.18),
        {"exposure": ("fail", "underexposed"), "blur": ("uncertain", "not_judged_due_to_exposure")},
        "retake",
    ),
    ("overexposed", Scene(gain=2.4), {"exposure": ("fail", "overexposed")}, "retake"),
    ("no_paper", Scene(paper=False), {"paper": ("uncertain", "paper_not_detected")}, "review"),
    (
        "paper_corner_cut",
        Scene(paper_shift_x=420),
        {"paper": ("fail", "paper_corner_out_of_frame")},
        "retake",
    ),
    (
        "paper_across_garment",
        Scene(paper_landscape=True),
        {"paper": ("uncertain", "paper_not_aligned_with_garment")},
        "review",
    ),
    (
        "white_surface",
        Scene(background=(236, 236, 236)),
        {"paper": ("uncertain", "paper_not_separable_from_background")},
        "review",
    ),
    (
        "garment_cut",
        Scene(garment_shift_x=-420),
        {"framing": ("fail", "garment_cut_off")},
        "retake",
    ),
    (
        "busy_surface",
        Scene(clutter=True),
        {"framing": ("uncertain", "background_not_uniform")},
        "review",
    ),
    (
        "no_garment",
        Scene(garment=False),
        {"framing": ("uncertain", "garment_not_detected")},
        "review",
    ),
]


@pytest.mark.parametrize(
    ("name", "scene", "expected", "decision"), CASES, ids=[case[0] for case in CASES]
)
def test_synthetic_scene_outcomes(
    name: str, scene: Scene, expected: dict[str, tuple[str, str]], decision: str
) -> None:
    analysis = analyze(decode(encode(render(scene))))
    for check, (status, reason) in expected.items():
        assert getattr(analysis, check) == CheckResult(status, reason), (name, check)  # type: ignore[arg-type]
    assert analysis.decision == decision
    message = message_for(analysis)
    assert message and "%" not in message  # guidance only; no uncalibrated confidence figures


def test_png_and_jpeg_agree_on_a_usable_scene() -> None:
    image = render(Scene())
    assert (
        analyze(decode(encode(image, ".png"))).decision
        == analyze(decode(encode(image))).decision
        == "pass"
    )


def test_uncertain_outlines_never_become_pass() -> None:
    for scene in (Scene(paper=False), Scene(clutter=True), Scene(background=(236, 236, 236))):
        analysis = analyze(decode(encode(render(scene))))
        assert analysis.decision != "pass"
        assert "uncertain" in {analysis.paper.status, analysis.framing.status}


@pytest.mark.parametrize(
    ("statuses", "decision"),
    [
        (["pass", "pass", "pass", "pass"], "pass"),
        (["pass", "pass", "pass", "uncertain"], "review"),
        (["uncertain"] * 4, "review"),
        (["fail", "pass", "pass", "pass"], "retake"),
        (["pass", "uncertain", "fail", "uncertain"], "retake"),
    ],
)
def test_decision_is_derived_deterministically(statuses: list[str], decision: str) -> None:
    assert derive_decision([CheckResult(status, "x") for status in statuses]) == decision  # type: ignore[arg-type]
