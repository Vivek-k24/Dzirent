/**
 * AI-MEASURE-1: Client-side validation and provisional suggestion helpers.
 * Note: Automated corner/landmark suggestions are explicitly provisional and unverified;
 * lender confirmation is mandatory.
 */

import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  US_LETTER_ASPECT_RATIO,
} from "./constants";
import type {
  LandmarkAnnotation,
  MeasureApiError,
  Point2D,
} from "./types";

export function validateMeasureImageFile(
  file: File | null | undefined,
): { ok: true } | { ok: false; error: MeasureApiError } {
  if (!file) {
    return {
      ok: false,
      error: {
        code: "invalid_payload",
        message: "No photo file provided.",
        status: 422,
      },
    };
  }

  const isAllowedMime = ALLOWED_MIME_TYPES.includes(file.type.toLowerCase());
  const hasAllowedExt = /\.(jpe?g|png)$/i.test(file.name);

  if (!isAllowedMime && !hasAllowedExt) {
    return {
      ok: false,
      error: {
        code: "unsupported_media_type",
        message: "Unsupported file format. Please upload a JPEG or PNG image.",
        status: 415,
      },
    };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      error: {
        code: "payload_too_large",
        message: "Image exceeds 10 MiB limit. Please choose a smaller photo.",
        status: 413,
      },
    };
  }

  if (file.size === 0) {
    return {
      ok: false,
      error: {
        code: "invalid_payload",
        message: "Uploaded file is empty (0 bytes).",
        status: 422,
      },
    };
  }

  return { ok: true };
}

/**
 * Returns provisional default paper corners (TL, TR, BR, BL) placed in the upper-right
 * area of the image in portrait orientation.
 * WARNING: These are unverified visual suggestions only; human adjustment is required.
 */
export function proposeDefaultPaperCorners(
  imageWidth: number,
  imageHeight: number,
): [Point2D, Point2D, Point2D, Point2D] {
  const paperHeight = Math.round(imageHeight * 0.28);
  const paperWidth = Math.round(paperHeight * US_LETTER_ASPECT_RATIO);

  // Position near top-right with margin
  const rightMargin = Math.round(imageWidth * 0.08);
  const topMargin = Math.round(imageHeight * 0.08);

  const trX = Math.max(paperWidth + 10, imageWidth - rightMargin);
  const trY = topMargin;

  const tlX = trX - paperWidth;
  const tlY = trY;

  const brX = trX;
  const brY = trY + paperHeight;

  const blX = tlX;
  const blY = brY;

  return [
    [tlX, tlY],
    [trX, trY],
    [brX, brY],
    [blX, blY],
  ];
}

/**
 * Returns provisional landmark annotations for a standard centered upper-body garment.
 * WARNING: These are unverified templates; lender must adjust them to match actual seams.
 */
export function proposeDefaultLandmarks(
  imageWidth: number,
  imageHeight: number,
): LandmarkAnnotation[] {
  const midX = Math.round(imageWidth * 0.45); // Garment placed slightly to the left of the paper
  const shoulderSpan = Math.round(imageWidth * 0.25);
  const chestSpan = Math.round(imageWidth * 0.28);

  const topSeamY = Math.round(imageHeight * 0.22);
  const chestY = Math.round(imageHeight * 0.38);
  const hemY = Math.round(imageHeight * 0.78);

  return [
    {
      key: "shoulder_width_cm",
      geometry: "line",
      points_px: [
        [Math.round(midX - shoulderSpan / 2), topSeamY],
        [Math.round(midX + shoulderSpan / 2), topSeamY],
      ],
      not_measurable: false,
    },
    {
      key: "chest_flat_cm",
      geometry: "line",
      points_px: [
        [Math.round(midX - chestSpan / 2), chestY],
        [Math.round(midX + chestSpan / 2), chestY],
      ],
      not_measurable: false,
    },
    {
      key: "body_length_cm",
      geometry: "line",
      points_px: [
        [Math.round(midX - shoulderSpan * 0.25), topSeamY],
        [Math.round(midX - shoulderSpan * 0.25), hemY],
      ],
      not_measurable: false,
    },
    {
      key: "sleeve_length_cm",
      geometry: "polyline",
      points_px: [
        [Math.round(midX + shoulderSpan / 2), topSeamY],
        [Math.round(midX + shoulderSpan * 0.8), Math.round(chestY * 1.1)],
        [Math.round(midX + shoulderSpan * 1.05), Math.round(hemY * 0.75)],
      ],
      not_measurable: false,
    },
  ];
}

