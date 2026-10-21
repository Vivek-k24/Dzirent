"""Rule-based photo-quality checks (quality-rules-0.1.0).

Uncalibrated heuristics for a provisional overhead capture standard: garment and US Letter paper flat,
side by side, on a fairly uniform surface. Thresholds were chosen against synthetic fixtures only; no field
evaluation set exists yet, so anything not clearly established is reported as "uncertain", never "pass".
"""

from dataclasses import dataclass
from typing import Any, Literal

import cv2
import numpy as np
from numpy.typing import NDArray

from .imaging import DecodedImage, Image

Status = Literal["pass", "fail", "uncertain"]
Decision = Literal["pass", "retake", "review"]
Mask = NDArray[np.bool_]

LETTER_RATIO = 11 / 8.5  # 1.294
RATIO_RANGE = (1.18, 1.42)  # tolerance for mild perspective and detection jitter
MAX_CORNER_ANGLE_ERROR = 15.0  # degrees from 90; "approximately straight overhead"
SHARP_SCORE, BLURRY_SCORE = 120.0, 35.0


@dataclass(frozen=True)
class CheckResult:
    status: Status
    reason: str


@dataclass(frozen=True)
class Analysis:
    blur: CheckResult
    exposure: CheckResult
    paper: CheckResult
    framing: CheckResult

    @property
    def decision(self) -> Decision:
        return derive_decision([self.blur, self.exposure, self.paper, self.framing])


def derive_decision(checks: list[CheckResult]) -> Decision:
    # Contract rule: any confident fail -> retake; all four pass -> pass; otherwise review.
    if any(check.status == "fail" for check in checks):
        return "retake"
    if all(check.status == "pass" for check in checks):
        return "pass"
    return "review"


def check_blur(gray: Image) -> CheckResult:
    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    height, width = gray.shape
    rows, cols = 8, 8
    scores: list[float] = []
    for r in range(rows):
        for c in range(cols):
            y0, y1 = r * height // rows, (r + 1) * height // rows
            x0, x1 = c * width // cols, (c + 1) * width // cols
            # Only textured tiles carry sharpness information; flat paper or floor is ignored.
            if float(gray[y0:y1, x0:x1].std()) > 8.0:
                scores.append(float(laplacian[y0:y1, x0:x1].var()))
    if len(scores) < 4:
        return CheckResult("uncertain", "insufficient_detail")
    score = float(np.percentile(scores, 90))
    if score >= SHARP_SCORE:
        return CheckResult("pass", "sharp")
    if score < BLURRY_SCORE:
        return CheckResult("fail", "blurry")
    return CheckResult("uncertain", "borderline_sharpness")


def check_exposure(gray: Image) -> CheckResult:
    mean = float(gray.mean())
    dark = float((gray <= 8).mean())
    bright = float((gray >= 250).mean())
    p5, p95 = (float(v) for v in np.percentile(gray, [5, 95]))
    if mean < 45 or dark > 0.40:
        return CheckResult("fail", "underexposed")
    if mean > 225 or bright > 0.35:
        return CheckResult("fail", "overexposed")
    if p95 - p5 < 15:
        return CheckResult("uncertain", "low_contrast")
    if 70 <= mean <= 200 and dark < 0.10 and bright < 0.12:
        return CheckResult("pass", "acceptable_light")
    return CheckResult("uncertain", "borderline_exposure")


@dataclass(frozen=True)
class PaperFinding:
    result: CheckResult
    quad: NDArray[np.float32] | None = None  # 4 corners when geometry is verified
    region: Mask | None = None  # pixels excluded from garment segmentation


def _corner_angles(quad: NDArray[np.float32]) -> list[float]:
    angles = []
    for i in range(4):
        a, b, c = quad[i - 1], quad[i], quad[(i + 1) % 4]
        v1, v2 = a - b, c - b
        cosine = float(np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2) + 1e-9))
        angles.append(float(np.degrees(np.arccos(np.clip(cosine, -1.0, 1.0)))))
    return angles


def find_paper(image: Image) -> PaperFinding:
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    saturation, value = hsv[..., 1], hsv[..., 2]
    height, width = value.shape
    median_value, median_saturation = float(np.median(value)), float(np.median(saturation))
    if median_value > 200 and median_saturation < 30:
        # White paper on a white or very light surface cannot be separated reliably.
        return PaperFinding(CheckResult("uncertain", "paper_not_separable_from_background"))
    white = ((saturation < 45) & (value > max(165.0, median_value + 25.0))).astype(np.uint8) * 255
    white = np.asarray(cv2.morphologyEx(white, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8)), np.uint8)
    white = np.asarray(
        cv2.morphologyEx(white, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8)), np.uint8
    )
    contours, _ = cv2.findContours(white, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    image_area, margin = height * width, 2
    verified: list[tuple[float, NDArray[np.float32], Any]] = []
    cut_off = near_miss = False
    for contour in contours:
        area = float(cv2.contourArea(contour))
        if not 0.01 * image_area <= area <= 0.5 * image_area:
            continue
        x, y, w, h = cv2.boundingRect(contour)
        (_, _), (rw, rh), _ = cv2.minAreaRect(contour)
        rect_fill = area / max(rw * rh, 1.0)
        touches = x <= margin or y <= margin or x + w >= width - margin or y + h >= height - margin
        if touches:
            # A rectangular white region clipped by the frame: a corner is not visible.
            cut_off = cut_off or rect_fill >= 0.85
            continue
        approx = cv2.approxPolyDP(contour, 0.02 * cv2.arcLength(contour, True), True)
        if len(approx) != 4 or not cv2.isContourConvex(approx):
            near_miss = near_miss or 4 <= len(approx) <= 6
            continue
        quad = approx.reshape(4, 2).astype(np.float32)
        sides = [float(np.linalg.norm(quad[i] - quad[(i + 1) % 4])) for i in range(4)]
        long_side, short_side = (sides[0] + sides[2]) / 2, (sides[1] + sides[3]) / 2
        ratio = max(long_side, short_side) / max(min(long_side, short_side), 1.0)
        square = all(abs(angle - 90) <= MAX_CORNER_ANGLE_ERROR for angle in _corner_angles(quad))
        fill = area / max(float(cv2.contourArea(quad)), 1.0)
        if RATIO_RANGE[0] <= ratio <= RATIO_RANGE[1] and square and fill >= 0.92:
            verified.append((area, quad, contour))
        else:
            near_miss = True
    if verified:
        _, quad, contour = max(verified, key=lambda item: item[0])
        region = np.zeros((height, width), np.uint8)
        cv2.drawContours(region, [contour], -1, 255, thickness=cv2.FILLED)
        region = np.asarray(cv2.dilate(region, np.ones((15, 15), np.uint8)), np.uint8)
        return PaperFinding(CheckResult("pass", "four_corners_visible"), quad, region > 0)
    if cut_off:
        return PaperFinding(CheckResult("fail", "paper_corner_out_of_frame"))
    if near_miss:
        return PaperFinding(CheckResult("uncertain", "corners_not_confidently_detected"))
    return PaperFinding(CheckResult("uncertain", "paper_not_detected"))


@dataclass(frozen=True)
class GarmentFinding:
    result: CheckResult
    mask: Mask | None = None


def find_garment(image: Image, paper: PaperFinding) -> GarmentFinding:
    lab = cv2.cvtColor(image.astype(np.float32) / 255.0, cv2.COLOR_BGR2LAB)
    height, width = lab.shape[:2]
    band = max(4, round(0.03 * min(height, width)))
    strip = np.concatenate(
        [
            lab[:band].reshape(-1, 3),
            lab[-band:].reshape(-1, 3),
            lab[:, :band].reshape(-1, 3),
            lab[:, -band:].reshape(-1, 3),
        ]
    )
    background = np.median(strip, axis=0)
    strip_distance = np.linalg.norm(strip - background, axis=1)
    if float((strip_distance > 15.0).mean()) > 0.30:
        # The frame edge is not mostly one surface, so "background" cannot be estimated reliably.
        return GarmentFinding(CheckResult("uncertain", "background_not_uniform"))
    threshold = max(12.0, 3.0 * float(np.percentile(strip_distance, 75)))
    foreground = (np.linalg.norm(lab - background, axis=2) > threshold).astype(np.uint8) * 255
    if paper.region is not None:
        foreground[paper.region] = 0
    foreground = cv2.morphologyEx(foreground, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    foreground = cv2.morphologyEx(foreground, cv2.MORPH_CLOSE, np.ones((11, 11), np.uint8))
    contours, _ = cv2.findContours(foreground, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not contours:
        return GarmentFinding(CheckResult("uncertain", "garment_not_detected"))
    garment = max(contours, key=cv2.contourArea)
    if float(cv2.contourArea(garment)) < 0.03 * height * width:
        return GarmentFinding(CheckResult("uncertain", "garment_not_detected"))
    mask = np.zeros((height, width), np.uint8)
    cv2.drawContours(mask, [garment], -1, 255, thickness=cv2.FILLED)
    points = garment.reshape(-1, 2)
    margin = 2
    on_edge = (
        (points[:, 0] <= margin)
        | (points[:, 1] <= margin)
        | (points[:, 0] >= width - 1 - margin)
        | (points[:, 1] >= height - 1 - margin)
    )
    if float(on_edge.mean()) >= 0.02:
        return GarmentFinding(CheckResult("fail", "garment_cut_off"), mask > 0)
    if paper.region is not None and bool(
        (cv2.dilate(mask, np.ones((9, 9), np.uint8)) > 0)[paper.region].any()
    ):
        # The capture standard keeps paper and garment apart; touching outlines cannot be separated.
        return GarmentFinding(CheckResult("uncertain", "garment_overlaps_paper"), mask > 0)
    return GarmentFinding(CheckResult("pass", "garment_fully_visible"), mask > 0)


def _major_axis(points: NDArray[np.float64]) -> tuple[NDArray[np.float64], float]:
    centered = points - points.mean(axis=0)
    eigenvalues, eigenvectors = np.linalg.eigh(np.cov(centered.T))
    order = np.argsort(eigenvalues)[::-1]
    elongation = float(np.sqrt(eigenvalues[order[0]] / max(eigenvalues[order[1]], 1e-9)))
    return eigenvectors[:, order[0]], elongation


def paper_alignment(paper: PaperFinding, garment: GarmentFinding) -> CheckResult:
    # Provisional convention: the paper's long side runs roughly parallel to the garment's length.
    if paper.quad is None or garment.mask is None or garment.result.status != "pass":
        return paper.result
    ys, xs = np.nonzero(garment.mask)
    axis, elongation = _major_axis(np.column_stack([xs, ys]).astype(np.float64))
    if elongation < 1.3:
        return paper.result  # a near-square garment has no reliable length direction
    quad = paper.quad
    sides = [quad[(i + 1) % 4] - quad[i] for i in range(4)]
    long_vector = max(sides, key=lambda side: float(np.linalg.norm(side)))
    long_unit = long_vector / (np.linalg.norm(long_vector) + 1e-9)
    angle = float(np.degrees(np.arccos(np.clip(abs(float(np.dot(long_unit, axis))), 0.0, 1.0))))
    if angle > 35.0:
        return CheckResult("uncertain", "paper_not_aligned_with_garment")
    return paper.result


def analyze(decoded: DecodedImage) -> Analysis:
    image = decoded.working
    gray = np.asarray(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY), np.uint8)
    paper = find_paper(image)
    garment = find_garment(image, paper)
    exposure = check_exposure(gray)
    blur = check_blur(gray)
    if exposure.status == "fail" and blur.status == "fail":
        # Darkness or clipping suppresses edge energy, so a blur "fail" here is not trustworthy.
        blur = CheckResult("uncertain", "not_judged_due_to_exposure")
    return Analysis(
        blur=blur,
        exposure=exposure,
        paper=paper_alignment(paper, garment),
        framing=garment.result,
    )


GUIDANCE = {
    "blurry": "Hold the phone steady and tap to focus before taking the photo.",
    "borderline_sharpness": "The photo may be slightly soft; retake it holding the phone steady.",
    "insufficient_detail": "We could not find enough detail to judge sharpness.",
    "not_judged_due_to_exposure": "Sharpness can be checked once the lighting is fixed.",
    "underexposed": "The photo is too dark; add light or move near a window.",
    "overexposed": "The photo is too bright; avoid direct sun, glare or flash.",
    "low_contrast": "The photo looks washed out; use even light and a plain, darker surface.",
    "borderline_exposure": "Lighting may be uneven; use soft, even light.",
    "paper_corner_out_of_frame": "Move back so all four corners of the sheet of paper are in the photo.",
    "corners_not_confidently_detected": "We could not confirm all four paper corners; lay the sheet flat and shoot from straight above.",
    "paper_not_detected": "Place a plain white US Letter sheet (8.5 × 11 in) flat next to the garment.",
    "paper_not_separable_from_background": "Use a darker surface so the white paper stands out.",
    "paper_not_aligned_with_garment": "Turn the paper so its long side runs along the garment's length.",
    "garment_cut_off": "Move back so the whole garment is inside the photo.",
    "garment_not_detected": "We could not find the garment outline; lay it flat on a plain surface.",
    "background_not_uniform": "Use a plain, uncluttered surface so the garment outline is clear.",
    "garment_overlaps_paper": "Keep the paper next to the garment, not touching or overlapping it.",
}


def message_for(analysis: Analysis) -> str:
    checks = [analysis.blur, analysis.exposure, analysis.paper, analysis.framing]
    decision = analysis.decision
    if decision == "pass":
        return "This photo looks usable: sharp, well lit, with the paper and the whole garment visible."
    wanted: Status = "fail" if decision == "retake" else "uncertain"
    tips = [
        GUIDANCE[check.reason]
        for check in checks
        if check.status == wanted and check.reason in GUIDANCE
    ]
    lead = (
        "Please retake this photo."
        if decision == "retake"
        else "We could not verify everything automatically."
    )
    return " ".join([lead, *tips])
