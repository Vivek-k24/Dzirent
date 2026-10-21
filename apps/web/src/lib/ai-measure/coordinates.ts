/**
 * AI-MEASURE-1: Display <-> Intrinsic Coordinate Transformation Utilities.
 * Handles letterboxing (object-fit: contain), responsive scaling, and viewport resizing.
 */

import type { Point2D } from "./types";

export interface RenderedImageRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Computes the exact rendered sub-rectangle of an image displayed with `object-fit: contain`
 * inside a container box.
 */
export function computeRenderedImageRect(
  containerWidth: number,
  containerHeight: number,
  intrinsicWidth: number,
  intrinsicHeight: number,
): RenderedImageRect {
  if (
    containerWidth <= 0 ||
    containerHeight <= 0 ||
    intrinsicWidth <= 0 ||
    intrinsicHeight <= 0
  ) {
    return {
      left: 0,
      top: 0,
      width: Math.max(0, containerWidth),
      height: Math.max(0, containerHeight),
    };
  }

  const containerRatio = containerWidth / containerHeight;
  const intrinsicRatio = intrinsicWidth / intrinsicHeight;

  if (intrinsicRatio > containerRatio) {
    // Image is wider than container: letterboxed top and bottom
    const width = containerWidth;
    const height = width / intrinsicRatio;
    const left = 0;
    const top = (containerHeight - height) / 2;
    return { left, top, width, height };
  } else {
    // Image is taller than container: pillarboxed left and right
    const height = containerHeight;
    const width = height * intrinsicRatio;
    const left = (containerWidth - width) / 2;
    const top = 0;
    return { left, top, width, height };
  }
}

/**
 * Maps a display coordinate (e.g. mouse click or touch offset within container)
 * to original decoded intrinsic image pixels [0, intrinsicWidth] x [0, intrinsicHeight].
 */
export function displayToIntrinsic(
  displayPoint: Point2D,
  containerWidth: number,
  containerHeight: number,
  intrinsicWidth: number,
  intrinsicHeight: number,
): Point2D {
  if (intrinsicWidth <= 0 || intrinsicHeight <= 0) return [0, 0];

  const rect = computeRenderedImageRect(
    containerWidth,
    containerHeight,
    intrinsicWidth,
    intrinsicHeight,
  );

  if (rect.width <= 0 || rect.height <= 0) return [0, 0];

  // Clamp display click to image bounds
  const clampedX = Math.max(rect.left, Math.min(rect.left + rect.width, displayPoint[0]));
  const clampedY = Math.max(rect.top, Math.min(rect.top + rect.height, displayPoint[1]));

  const normX = (clampedX - rect.left) / rect.width;
  const normY = (clampedY - rect.top) / rect.height;

  const intrinsicX = Math.round(normX * intrinsicWidth);
  const intrinsicY = Math.round(normY * intrinsicHeight);

  return [
    Math.max(0, Math.min(intrinsicWidth, intrinsicX)),
    Math.max(0, Math.min(intrinsicHeight, intrinsicY)),
  ];
}

/**
 * Maps an intrinsic image coordinate to display container coordinates.
 */
export function intrinsicToDisplay(
  intrinsicPoint: Point2D,
  containerWidth: number,
  containerHeight: number,
  intrinsicWidth: number,
  intrinsicHeight: number,
): Point2D {
  if (intrinsicWidth <= 0 || intrinsicHeight <= 0) return [0, 0];

  const rect = computeRenderedImageRect(
    containerWidth,
    containerHeight,
    intrinsicWidth,
    intrinsicHeight,
  );

  const normX = intrinsicPoint[0] / intrinsicWidth;
  const normY = intrinsicPoint[1] / intrinsicHeight;

  const displayX = rect.left + normX * rect.width;
  const displayY = rect.top + normY * rect.height;

  return [Math.round(displayX * 10) / 10, Math.round(displayY * 10) / 10];
}

/**
 * Returns normalized percentage position (0-100%) within the intrinsic image.
 * Useful for CSS absolute positioning relative to an overlay container matching the image rect.
 */
export function intrinsicToPercent(
  intrinsicPoint: Point2D,
  intrinsicWidth: number,
  intrinsicHeight: number,
): { xPercent: number; yPercent: number } {
  if (intrinsicWidth <= 0 || intrinsicHeight <= 0) {
    return { xPercent: 0, yPercent: 0 };
  }
  const xPercent = (intrinsicPoint[0] / intrinsicWidth) * 100;
  const yPercent = (intrinsicPoint[1] / intrinsicHeight) * 100;
  return {
    xPercent: Math.max(0, Math.min(100, xPercent)),
    yPercent: Math.max(0, Math.min(100, yPercent)),
  };
}

/**
 * Verifies that 4 ordered corners [TL, TR, BR, BL] form a non-degenerate,
 * strictly convex quadrilateral with positive area.
 */
export function isValidQuadrilateral(corners: [Point2D, Point2D, Point2D, Point2D]): boolean {
  if (corners.length !== 4) return false;

  // Check distinct points
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      if (corners[i][0] === corners[j][0] && corners[i][1] === corners[j][1]) {
        return false;
      }
    }
  }

  // Cross-product check for convexity:
  // Each cross product of consecutive edge vectors must share the same sign.
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const p1 = corners[i];
    const p2 = corners[(i + 1) % 4];
    const p3 = corners[(i + 2) % 4];

    const dx1 = p2[0] - p1[0];
    const dy1 = p2[1] - p1[1];
    const dx2 = p3[0] - p2[0];
    const dy2 = p3[1] - p2[1];

    const crossProduct = dx1 * dy2 - dy1 * dx2;
    if (Math.abs(crossProduct) < 1e-5) {
      // Collinear points
      return false;
    }

    if (sign === 0) {
      sign = crossProduct > 0 ? 1 : -1;
    } else if ((crossProduct > 0 ? 1 : -1) !== sign) {
      // Concave or self-intersecting
      return false;
    }
  }

  // Approximate area via Shoelace formula
  const area =
    0.5 *
    Math.abs(
      corners[0][0] * (corners[1][1] - corners[3][1]) +
        corners[1][0] * (corners[2][1] - corners[0][1]) +
        corners[2][0] * (corners[3][1] - corners[1][1]) +
        corners[3][0] * (corners[0][1] - corners[2][1]),
    );

  return area >= 50; // Minimum meaningful pixel area
}

