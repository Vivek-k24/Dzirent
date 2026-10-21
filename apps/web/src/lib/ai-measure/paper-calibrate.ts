/** Coordinator C1: proposal-only local/test paper corner client. */
import type { Point2D } from "./types";
import { isValidQuadrilateral } from "./coordinates";
import { validateMeasureImageFile } from "./preliminary";

export type PaperSnapResponse = {
  schema_version: "paper-calibrate.v0";
  algorithm_version: string;
  request_id: string;
  reference_type: "us_letter";
  detection_status: "snapped" | "not_found" | "ambiguous" | "invalid";
  proposed_corners_px: [Point2D, Point2D, Point2D, Point2D] | null;
  calibration_status: "valid" | "uncertain" | "invalid" | null;
  reason_codes: string[];
  requires_user_confirmation: true;
};

function isPoint(p: unknown): p is Point2D {
  return Array.isArray(p) && p.length === 2 &&
    p.every(n => typeof n === "number" && Number.isFinite(n));
}

function decodeResponse(value: unknown): PaperSnapResponse {
  if (!value || typeof value !== "object") throw new Error("Unexpected calibration response.");
  const v = value as Record<string, unknown>;
  const snap = v.detection_status;
  if (v.schema_version !== "paper-calibrate.v0" || v.reference_type !== "us_letter" ||
      v.requires_user_confirmation !== true ||
      typeof v.algorithm_version !== "string" || typeof v.request_id !== "string" ||
      !Array.isArray(v.reason_codes) || !v.reason_codes.every(s => typeof s === "string") ||
      !["snapped", "not_found", "ambiguous", "invalid"].includes(String(snap))) {
    throw new Error("Unexpected calibration response schema.");
  }
  if (snap === "snapped") {
    const corners = v.proposed_corners_px;
    if (!Array.isArray(corners) || corners.length !== 4 || !corners.every(isPoint) ||
        !isValidQuadrilateral(corners as [Point2D, Point2D, Point2D, Point2D]) ||
        !["valid", "uncertain", "invalid"].includes(String(v.calibration_status))) {
      throw new Error("Calibration service returned invalid proposed corners.");
    }
  } else if (v.proposed_corners_px !== null || v.calibration_status !== null) {
    throw new Error("Calibration service sent unexpected points with a non-snap result.");
  }
  return v as PaperSnapResponse;
}

export async function requestPaperSnap(
  imageFile: File,
  approxCorners: [Point2D, Point2D, Point2D, Point2D],
): Promise<PaperSnapResponse> {
  const check = validateMeasureImageFile(imageFile);
  if (!check.ok) throw new Error(check.error.message);
  if (!isValidQuadrilateral(approxCorners)) throw new Error("Move the paper overlay into a valid four-sided shape.");
  const body = new FormData();
  body.append("image", imageFile);
  body.append("annotation", JSON.stringify({
    schema_version: "paper-calibrate.v0",
    reference_type: "us_letter",
    approx_corners_px: approxCorners,
  }));
  let response: Response;
  try {
    response = await fetch("/api/v1/dev/paper-calibrate", {
      method: "POST", body, headers: {Accept: "application/json"},
    });
  } catch {
    throw new Error("Cannot reach the local calibration service. You can still mark corners manually.");
  }
  if (!response.ok) {
    let message = "";
    try {
      const v = await response.json();
      if (v && typeof v === "object") {
        const error = (v as Record<string, unknown>).error;
        if (error && typeof error === "object") {
          const m = (error as Record<string, unknown>).message;
          if (typeof m === "string") message = m;
        } else if (typeof (v as Record<string, unknown>).message === "string") {
          message = (v as Record<string, unknown>).message as string;
        }
      }
    } catch {
      // Non-JSON error body (e.g. 503 proxy text/html)
    }
    throw new Error(message || (response.status === 503
      ? "Paper calibration is offline; adjust corners manually."
      : `Paper calibration failed (HTTP ${response.status}).`));
  }
  let result: unknown;
  try { result = await response.json(); } catch {
    throw new Error("Calibration service returned an unreadable response.");
  }
  return decodeResponse(result);
}
