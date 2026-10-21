/**
 * AI-MEASURE-1: Type definitions and v0 contract schemas.
 * Reference: docs/ai-measure/AI-MEASURE-1-CONTRACT.md
 */

export type Point2D = [number, number]; // [x, y] in intrinsic image pixels

export type PaperCornerKey = "TL" | "TR" | "BR" | "BL";

export interface PaperReference {
  type: "us_letter";
  user_confirmed: boolean;
  corners_px: [Point2D, Point2D, Point2D, Point2D]; // [TL, TR, BR, BL]
}

export type GarmentClass = "sleeved_top";

export type MeasurementKey =
  | "shoulder_width_cm"
  | "chest_flat_cm"
  | "body_length_cm"
  | "sleeve_length_cm";

export interface LandmarkDefinition {
  key: MeasurementKey;
  label: string;
  description: string;
  instruction: string;
  geometry: "line" | "polyline";
  minPoints: number;
  maxPoints?: number;
  color: string;
}

export interface LandmarkAnnotation {
  key: MeasurementKey;
  geometry: "line" | "polyline";
  points_px: Point2D[];
  not_measurable?: boolean;
  unmeasurable_reason?: string;
}

export interface MeasureAnnotationPayload {
  schema_version: "ai-measure.v0";
  garment_class: GarmentClass;
  reference: PaperReference;
  landmarks: Array<{
    key: MeasurementKey;
    geometry: "line" | "polyline";
    points_px: Point2D[];
  }>;
}

export type CalibrationStatus = "valid" | "uncertain" | "invalid";

export type MeasurementItemStatus = "estimated" | "not_measurable";

export interface MeasurementResultItem {
  key: MeasurementKey;
  value_cm: number | null; // One decimal only when valid
  status: MeasurementItemStatus;
  reason?: string;
  geometry: "line" | "polyline";
  points_px: Point2D[];
  confirmed_by_lender?: boolean; // Client-side in-session confirmation
}

export interface GarmentMeasureResponse {
  schema_version: "ai-measure.v0";
  algorithm_version: string;
  request_id: string;
  calibration_status: CalibrationStatus;
  garment_class: GarmentClass;
  method: "paper_homography_and_landmarks";
  measurements: Record<string, MeasurementResultItem>;
  confirmed_by_lender: boolean;
  cautions: string[];
  message?: string;
}

export type MeasureErrorCode =
  | "payload_too_large"
  | "unsupported_media_type"
  | "invalid_payload"
  | "invalid_geometry"
  | "service_unavailable"
  | "unknown_error";

export interface MeasureApiError {
  code: MeasureErrorCode;
  message: string;
  status?: number;
  details?: unknown;
}

