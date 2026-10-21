/**
 * AI-MEASURE-1: API client for monolith dev proxy.
 * Endpoint: POST /api/v1/dev/garment-measure
 */

import type {
  GarmentMeasureResponse,
  MeasureAnnotationPayload,
  MeasureApiError,
} from "./types";
import { validateMeasureImageFile } from "./preliminary";

export async function requestGarmentMeasurements(
  imageFile: File,
  annotation: MeasureAnnotationPayload,
): Promise<GarmentMeasureResponse> {
  const validation = validateMeasureImageFile(imageFile);
  if (!validation.ok) {
    throw validation.error;
  }

  const formData = new FormData();
  formData.append("image", imageFile);
  formData.append("annotation", JSON.stringify(annotation));

  let response: Response;
  try {
    response = await fetch("/api/v1/dev/garment-measure", {
      method: "POST",
      body: formData,
      headers: {
        Accept: "application/json",
      },
    });
  } catch (err: unknown) {
    throw {
      code: "service_unavailable",
      message:
        "Unable to reach the garment measurement service. Please ensure the local service is running.",
      status: 503,
      details: err instanceof Error ? err.message : String(err),
    } satisfies MeasureApiError;
  }

  if (!response.ok) {
    let json: unknown;
    try { json = await response.json(); } catch { /* non-JSON error */ }
    const body = json && typeof json === "object" ? json as Record<string, unknown> : {};
    const nested = body.error && typeof body.error === "object"
      ? body.error as Record<string, unknown> : {};
    const codeValue = nested.code ?? body.code;
    const code = typeof codeValue === "string" ? codeValue as MeasureApiError["code"] : "unknown_error";
    const messageValue = nested.message ?? body.message ?? body.detail;
    const message = typeof messageValue === "string"
      ? messageValue : `Measurement service returned error status ${response.status}.`;

    if (response.status === 413) {
      throw {
        code: "payload_too_large",
        message: "Image payload exceeds the maximum allowed size (10 MiB).",
        status: 413,
      } satisfies MeasureApiError;
    }

    if (response.status === 415) {
      throw {
        code: "unsupported_media_type",
        message: "Unsupported media format. Only JPEG and PNG photos are supported.",
        status: 415,
      } satisfies MeasureApiError;
    }

    if (response.status === 422) {
      throw {
        code: code === "unknown_error" ? "invalid_payload" : code,
        message: message || "Invalid image geometry or landmark points provided.",
        status: 422,
      } satisfies MeasureApiError;
    }

    if (response.status === 503) {
      throw {
        code: "service_unavailable",
        message:
          message ||
          "Garment measurement engine is currently offline or unavailable.",
        status: 503,
      } satisfies MeasureApiError;
    }

    throw {
      code: "unknown_error",
      message: `Request failed with HTTP status ${response.status}: ${message}`,
      status: response.status,
    } satisfies MeasureApiError;
  }

  try {
    const data = (await response.json()) as GarmentMeasureResponse;
    if (!data || data.schema_version !== "ai-measure.v0" ||
        !["valid", "uncertain", "invalid"].includes(data.calibration_status) ||
        !data.measurements || typeof data.measurements !== "object" ||
        Array.isArray(data.measurements)) {
      throw {
        code: "invalid_payload",
        message: "Measurement service returned an unexpected response.",
        status: 502,
      } satisfies MeasureApiError;
    }
    return data;
  } catch (err: unknown) {
    throw {
      code: "invalid_payload",
      message: "Measurement service returned an invalid JSON response.",
      details: err instanceof Error ? err.message : String(err),
    } satisfies MeasureApiError;
  }
}

export async function submitGarmentMeasurement(params: {
  imageFile: File;
  annotationPayload: MeasureAnnotationPayload;
}): Promise<
  | { ok: true; data: GarmentMeasureResponse }
  | { ok: false; error: MeasureApiError }
> {
  try {
    const data = await requestGarmentMeasurements(
      params.imageFile,
      params.annotationPayload,
    );
    return { ok: true, data };
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && "status" in err) {
      return { ok: false, error: err as MeasureApiError };
    }
    return {
      ok: false,
      error: {
        code: "unknown_error",
        message: err instanceof Error ? err.message : String(err),
        status: 500,
      },
    };
  }
}
