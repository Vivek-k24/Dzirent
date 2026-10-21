import { describe, expect, it, vi } from "vitest";
import {
  analyzeExposureFromPixels,
  analyzeSharpnessFromPixels,
  deriveOverallDecision,
  MAX_FILE_SIZE_BYTES,
  validateImageFile,
} from "./preliminary";
import { checkPhotoQuality } from "./client";
import type { QualityCheckResponse } from "./types";

describe("AI-QUALITY-1 Browser File Validation", () => {
  it("accepts valid JPEG and PNG files under 10 MiB", () => {
    const validJpeg = new File([new Uint8Array(1024)], "garment.jpg", { type: "image/jpeg" });
    const validPng = new File([new Uint8Array(2048)], "garment.png", { type: "image/png" });

    expect(validateImageFile(validJpeg)).toEqual({ ok: true });
    expect(validateImageFile(validPng)).toEqual({ ok: true });
  });

  it("rejects unsupported media types with 415 unsupported_media_type", () => {
    const gifFile = new File([new Uint8Array(1024)], "photo.gif", { type: "image/gif" });
    const webpFile = new File([new Uint8Array(1024)], "photo.webp", { type: "image/webp" });
    const pdfFile = new File([new Uint8Array(1024)], "doc.pdf", { type: "application/pdf" });

    const resultGif = validateImageFile(gifFile);
    expect(resultGif.ok).toBe(false);
    if (!resultGif.ok) {
      expect(resultGif.error.code).toBe("unsupported_media_type");
      expect(resultGif.error.status).toBe(415);
    }

    const resultWebp = validateImageFile(webpFile);
    expect(resultWebp.ok).toBe(false);
    if (!resultWebp.ok) {
      expect(resultWebp.error.code).toBe("unsupported_media_type");
    }

    const resultPdf = validateImageFile(pdfFile);
    expect(resultPdf.ok).toBe(false);
    if (!resultPdf.ok) {
      expect(resultPdf.error.code).toBe("unsupported_media_type");
    }
  });

  it("rejects files exceeding 10 MiB with 413 payload_too_large", () => {
    const oversizedFile = new File(
      [new Uint8Array(MAX_FILE_SIZE_BYTES + 1)],
      "large_garment.jpg",
      { type: "image/jpeg" },
    );

    const result = validateImageFile(oversizedFile);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("payload_too_large");
      expect(result.error.status).toBe(413);
    }
  });

  it("rejects empty files with 422 invalid_image", () => {
    const emptyFile = new File([], "empty.jpg", { type: "image/jpeg" });

    const result = validateImageFile(emptyFile);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("invalid_image");
      expect(result.error.status).toBe(422);
    }
  });
});

describe("AI-QUALITY-1 Browser Lighting / Exposure Analysis", () => {
  it("detects underexposed / dark images", () => {
    const pixelCount = 100;
    const darkPixels = new Uint8ClampedArray(pixelCount * 4);
    // Fill with very dark gray/black (R=10, G=10, B=10)
    for (let i = 0; i < darkPixels.length; i += 4) {
      darkPixels[i] = 10;
      darkPixels[i + 1] = 10;
      darkPixels[i + 2] = 10;
      darkPixels[i + 3] = 255;
    }

    const result = analyzeExposureFromPixels(darkPixels, pixelCount);
    expect(result.status).toBe("fail");
    expect(result.reason).toBe("too_dark");
    expect(result.meanLuminance).toBeLessThan(55);
  });

  it("detects overexposed / glared images", () => {
    const pixelCount = 100;
    const brightPixels = new Uint8ClampedArray(pixelCount * 4);
    // Fill with near white (R=240, G=240, B=240)
    for (let i = 0; i < brightPixels.length; i += 4) {
      brightPixels[i] = 240;
      brightPixels[i + 1] = 240;
      brightPixels[i + 2] = 240;
      brightPixels[i + 3] = 255;
    }

    const result = analyzeExposureFromPixels(brightPixels, pixelCount);
    expect(result.status).toBe("fail");
    expect(result.reason).toBe("too_bright");
    expect(result.meanLuminance).toBeGreaterThan(210);
  });

  it("passes balanced, well-lit overhead images", () => {
    const pixelCount = 100;
    const balancedPixels = new Uint8ClampedArray(pixelCount * 4);
    // Fill with moderate midtone gray (R=130, G=130, B=130)
    for (let i = 0; i < balancedPixels.length; i += 4) {
      balancedPixels[i] = 130;
      balancedPixels[i + 1] = 130;
      balancedPixels[i + 2] = 130;
      balancedPixels[i + 3] = 255;
    }

    const result = analyzeExposureFromPixels(balancedPixels, pixelCount);
    expect(result.status).toBe("pass");
    expect(result.reason).toBe("acceptable_light");
    expect(result.meanLuminance).toBe(130);
  });
});

describe("AI-QUALITY-1 Browser Sharpness / Blur Analysis", () => {
  it("fails completely flat or uniform blurry images (no edges)", () => {
    const width = 50;
    const height = 50;
    const flatPixels = new Uint8ClampedArray(width * height * 4);
    // Completely uniform gray (variance = 0)
    for (let i = 0; i < flatPixels.length; i += 4) {
      flatPixels[i] = 120;
      flatPixels[i + 1] = 120;
      flatPixels[i + 2] = 120;
      flatPixels[i + 3] = 255;
    }

    const result = analyzeSharpnessFromPixels(flatPixels, width, height);
    expect(result.status).toBe("fail");
    expect(result.reason).toBe("blurry");
    expect(result.score).toBeLessThan(35);
  });

  it("passes sharp images with high edge contrast and detail", () => {
    const width = 60;
    const height = 60;
    const sharpPixels = new Uint8ClampedArray(width * height * 4);
    // Alternating high-frequency checkerboard pattern
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const isWhite = (x + y) % 2 === 0;
        const val = isWhite ? 250 : 10;
        sharpPixels[idx] = val;
        sharpPixels[idx + 1] = val;
        sharpPixels[idx + 2] = val;
        sharpPixels[idx + 3] = 255;
      }
    }

    const result = analyzeSharpnessFromPixels(sharpPixels, width, height);
    expect(result.status).toBe("pass");
    expect(result.reason).toBe("sharp");
    expect(result.score).toBeGreaterThanOrEqual(100);
  });
});

describe("AI-QUALITY-1 Decision Derivation", () => {
  it("requires retake if ANY check fails", () => {
    expect(deriveOverallDecision("fail", "pass", "pass", "pass")).toBe("retake");
    expect(deriveOverallDecision("pass", "fail", "pass", "pass")).toBe("retake");
    expect(deriveOverallDecision("pass", "pass", "fail", "pass")).toBe("retake");
    expect(deriveOverallDecision("pass", "pass", "pass", "fail")).toBe("retake");
  });

  it("returns pass ONLY when all four checks pass", () => {
    expect(deriveOverallDecision("pass", "pass", "pass", "pass")).toBe("pass");
  });

  it("returns review when checks are uncertain and none have failed", () => {
    // Typical browser preliminary state (paper and framing uncertain)
    expect(deriveOverallDecision("pass", "pass", "uncertain", "uncertain")).toBe("review");
    expect(deriveOverallDecision("uncertain", "pass", "pass", "pass")).toBe("review");
  });
});

describe("AI-QUALITY-1 Monolith Proxy API Client", () => {
  it("parses valid 200 response correctly", async () => {
    const mockResponse: QualityCheckResponse = {
      schema_version: "ai-quality.v0",
      algorithm_version: "quality-rules-0.1.0",
      request_id: "req-test-123",
      decision: "pass",
      checks: {
        blur: { status: "pass", reason: "sharp" },
        exposure: { status: "pass", reason: "acceptable_light" },
        paper: { status: "pass", reason: "valid_us_letter_corners" },
        framing: { status: "pass", reason: "garment_fully_contained" },
      },
      message: "Garment photo passed all quality checks.",
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });
    vi.stubGlobal("fetch", mockFetch);

    const file = new File([new Uint8Array(100)], "outfit.jpg", { type: "image/jpeg" });
    const result = await checkPhotoQuality(file, { endpoint: "/api/v1/dev/photo-quality" });

    expect(result.decision).toBe("pass");
    expect(result.checks.blur.status).toBe("pass");
    expect(result.checks.paper.status).toBe("pass");
    expect(result.request_id).toBe("req-test-123");

    // Verify multipart request structure
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/v1/dev/photo-quality",
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData),
      }),
    );

    vi.unstubAllGlobals();
  });

  it("maps 413, 415, 422, and 503 errors accurately", async () => {
    const errorCases = [
      { status: 413, expectedCode: "payload_too_large" },
      { status: 415, expectedCode: "unsupported_media_type" },
      { status: 422, expectedCode: "invalid_image" },
      { status: 503, expectedCode: "service_unavailable" },
    ];

    for (const { status, expectedCode } of errorCases) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status,
          json: async () => ({ error: { code: expectedCode, message: "Error msg" } }),
        }),
      );

      const file = new File([new Uint8Array(10)], "test.jpg", { type: "image/jpeg" });
      await expect(checkPhotoQuality(file)).rejects.toMatchObject({
        code: expectedCode,
        status,
      });

      vi.unstubAllGlobals();
    }
  });

  it("maps network connectivity failure to network_error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );

    const file = new File([new Uint8Array(10)], "test.jpg", { type: "image/jpeg" });
    await expect(checkPhotoQuality(file)).rejects.toMatchObject({
      code: "network_error",
    });

    vi.unstubAllGlobals();
  });
});

