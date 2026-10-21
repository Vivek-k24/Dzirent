import type { QualityApiError, QualityCheckResponse } from "./types";

export const DEV_PHOTO_QUALITY_ENDPOINT = "/api/v1/dev/photo-quality";

export interface RequestOptions {
  requestId?: string;
  endpoint?: string;
  signal?: AbortSignal;
}

/**
 * Parses machine-readable error from HTTP response or defaults by status code.
 */
async function parseErrorResponse(response: Response): Promise<QualityApiError> {
  const status = response.status;
  let code: QualityApiError["code"] = "unknown_error";
  let message = `Server responded with status ${status}.`;

  try {
    const data = await response.json();
    if (data?.error?.code) {
      code = data.error.code;
      message = data.error.message || message;
    } else if (data?.code) {
      code = data.code;
      message = data.message || message;
    } else if (data?.detail) {
      message = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
    }
  } catch {
    // Non-JSON response body
  }

  // Fallback mappings according to AI-QUALITY-1-CONTRACT
  if (status === 413) {
    code = "payload_too_large";
    message = message || "Image exceeds the 10 MiB size limit.";
  } else if (status === 415) {
    code = "unsupported_media_type";
    message = message || "Unsupported format. Only JPEG and PNG are accepted.";
  } else if (status === 422) {
    code = "invalid_image";
    message = message || "Invalid image file. Could not decode image.";
  } else if (status === 503) {
    code = "service_unavailable";
    message = message || "Photo quality screening service is currently unavailable.";
  }

  return { code, message, status };
}

/**
 * Submit an overhead garment photo to the monolith test proxy for AI photo-quality screening.
 */
export async function checkPhotoQuality(
  file: File | Blob,
  options: RequestOptions = {},
): Promise<QualityCheckResponse> {
  const endpoint = options.endpoint || DEV_PHOTO_QUALITY_ENDPOINT;
  const requestId = options.requestId || (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : undefined);

  const formData = new FormData();
  formData.append("image", file, file instanceof File ? file.name : "upload.jpg");
  if (requestId) {
    formData.append("request_id", requestId);
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      body: formData,
      signal: options.signal,
    });
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw {
        code: "network_error",
        message: "Photo check request was cancelled.",
      } satisfies QualityApiError;
    }
    throw {
      code: "network_error",
      message: "Could not reach the photo quality check service. Verify connection or check if local server is running.",
    } satisfies QualityApiError;
  }

  if (!response.ok) {
    const error = await parseErrorResponse(response);
    throw error;
  }

  const data = (await response.json()) as QualityCheckResponse;

  // Validate critical response structure
  if (!data || typeof data !== "object" || !data.decision || !data.checks) {
    throw {
      code: "invalid_image",
      message: "Server returned an unexpected or malformed response format.",
      status: 502,
    } satisfies QualityApiError;
  }

  return data;
}

