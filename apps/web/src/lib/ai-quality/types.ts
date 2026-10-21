/**
 * AI-QUALITY-1 Photo Quality Screening Types
 * Adheres to AI-QUALITY-1-CONTRACT v0 schema.
 */

export type CheckStatus = "pass" | "fail" | "uncertain";
export type OverallDecision = "pass" | "retake" | "review";

export interface IndividualCheck {
  status: CheckStatus;
  reason: string;
}

export interface QualityChecks {
  blur: IndividualCheck;
  exposure: IndividualCheck;
  paper: IndividualCheck;
  framing: IndividualCheck;
}

export interface QualityCheckResponse {
  schema_version: "ai-quality.v0";
  algorithm_version: string;
  request_id: string;
  decision: OverallDecision;
  checks: QualityChecks;
  message: string;
}

export interface PreliminaryAnalysis {
  isPreliminary: true;
  blur: {
    status: CheckStatus;
    score: number;
    reason: string;
  };
  exposure: {
    status: CheckStatus;
    meanLuminance: number;
    reason: string;
  };
  paper: {
    status: "uncertain";
    reason: string;
  };
  framing: {
    status: "uncertain";
    reason: string;
  };
  decision: OverallDecision;
  notes: string[];
}

export type QualityErrorCode =
  | "payload_too_large"
  | "unsupported_media_type"
  | "invalid_image"
  | "service_unavailable"
  | "network_error"
  | "unknown_error";

export interface QualityApiError {
  code: QualityErrorCode;
  message: string;
  status?: number;
}

