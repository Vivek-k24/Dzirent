import type { LandmarkDefinition, MeasurementKey } from "./types";

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MiB
export const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png"];

export const US_LETTER_WIDTH_CM = 21.59;
export const US_LETTER_HEIGHT_CM = 27.94;
export const US_LETTER_ASPECT_RATIO = US_LETTER_WIDTH_CM / US_LETTER_HEIGHT_CM;

export const LANDMARK_DEFINITIONS: Record<MeasurementKey, LandmarkDefinition> = {
  shoulder_width_cm: {
    key: "shoulder_width_cm",
    label: "Shoulder Width",
    description: "Seam-to-seam shoulder distance across upper back",
    instruction:
      "Select point 1 on the left shoulder seam and point 2 on the right shoulder seam. Only annotate if seams are clearly visible.",
    geometry: "line",
    minPoints: 2,
    maxPoints: 2,
    color: "#2563eb", // blue
  },
  chest_flat_cm: {
    key: "chest_flat_cm",
    label: "Flat Chest Width",
    description: "Straight underarm-to-underarm garment width (NOT circumference)",
    instruction:
      "Select point 1 at the left armpit seam and point 2 at the right armpit seam at the same level. Do not multiply for circumference.",
    geometry: "line",
    minPoints: 2,
    maxPoints: 2,
    color: "#059669", // emerald
  },
  body_length_cm: {
    key: "body_length_cm",
    label: "Body Length",
    description: "High-point shoulder neckline reference to bottom hem",
    instruction:
      "Select point 1 at the high shoulder point near the neckline (not collar center) and point 2 directly down at the bottom hem.",
    geometry: "line",
    minPoints: 2,
    maxPoints: 2,
    color: "#d97706", // amber
  },
  sleeve_length_cm: {
    key: "sleeve_length_cm",
    label: "Sleeve Length",
    description: "Shoulder seam to cuff along outer sleeve curvature",
    instruction:
      "Click from the shoulder seam along the outer arm fold to the cuff. Click multiple points if the sleeve has a bend.",
    geometry: "polyline",
    minPoints: 2,
    maxPoints: 8,
    color: "#7c3aed", // violet
  },
};

