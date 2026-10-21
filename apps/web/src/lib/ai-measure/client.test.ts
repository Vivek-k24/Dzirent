import { afterEach, describe, expect, it, vi } from "vitest";
import { requestGarmentMeasurements } from "./client";
import { validateMeasureImageFile } from "./preliminary";
import type { GarmentMeasureResponse, MeasureAnnotationPayload } from "./types";

describe("AI-MEASURE-1 Validation & Client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockPayload: MeasureAnnotationPayload = {
    schema_version: "ai-measure.v0",
    garment_class: "sleeved_top",
    reference: {
      type: "us_letter",
      user_confirmed: true,
      corners_px: [
        [100, 100],
        [300, 100],
        [300, 400],
        [100, 400],
      ],
    },
    landmarks: [
      {
        key: "shoulder_width_cm",
        geometry: "line",
        points_px: [
          [400, 200],
          [600, 200],
        ],
      },
    ],
  };

  describe("validateMeasureImageFile", () => {
    it("accepts valid JPEG and PNG files within 10 MiB", () => {
      const validPng = new File([new Uint8Array(500)], "overhead.png", {
        type: "image/png",
      });
      const validJpg = new File([new Uint8Array(500)], "overhead.jpg", {
        type: "image/jpeg",
      });

      expect(validateMeasureImageFile(validPng).ok).toBe(true);
      expect(validateMeasureImageFile(validJpg).ok).toBe(true);
    });

    it("rejects unsupported media formats (GIF, WebP, PDF) with HTTP 415", () => {
      const gif = new File([new Uint8Array(100)], "overhead.gif", {
        type: "image/gif",
      });
      const result = validateMeasureImageFile(gif);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("unsupported_media_type");
        expect(result.error.status).toBe(415);
      }
    });

    it("rejects files exceeding 10 MiB limit with HTTP 413", () => {
      const oversized = new File(
        [new Uint8Array(11 * 1024 * 1024)],
        "huge.png",
        { type: "image/png" },
      );
      const result = validateMeasureImageFile(oversized);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("payload_too_large");
        expect(result.error.status).toBe(413);
      }
    });

    it("rejects empty files (0 bytes) with HTTP 422", () => {
      const empty = new File([], "empty.png", { type: "image/png" });
      const result = validateMeasureImageFile(empty);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("invalid_payload");
        expect(result.error.status).toBe(422);
      }
    });
  });

  describe("requestGarmentMeasurements API", () => {
    it("successfully sends multipart request and returns parsed response", async () => {
      const mockResponse: GarmentMeasureResponse = {
        schema_version: "ai-measure.v0",
        algorithm_version: "geometry-homography-0.1.0",
        request_id: "req-12345",
        calibration_status: "valid",
        garment_class: "sleeved_top",
        method: "paper_homography_and_landmarks",
        confirmed_by_lender: false,
        measurements: {
          shoulder_width_cm: {
            key: "shoulder_width_cm",
            value_cm: 45.5,
            status: "estimated",
            geometry: "line",
            points_px: [
              [400, 200],
              [600, 200],
            ],
          },
        },
        cautions: [
          "Estimated from planar homography. Fabric stretch or curvature introduces error.",
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const file = new File([new Uint8Array(100)], "overhead.jpg", {
        type: "image/jpeg",
      });
      const data = await requestGarmentMeasurements(file, mockPayload);

      expect(data.schema_version).toBe("ai-measure.v0");
      expect(data.calibration_status).toBe("valid");
      expect(data.measurements.shoulder_width_cm.value_cm).toBe(45.5);
      expect(data.measurements.shoulder_width_cm.status).toBe("estimated");

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, init] = vi.mocked(global.fetch).mock.calls[0] ?? [];
      expect(url).toBe("/api/v1/dev/garment-measure");
      expect(init?.method).toBe("POST");
      expect(init?.body).toBeInstanceOf(FormData);
    });

    it("translates HTTP 503 service offline error cleanly", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({
          code: "service_unavailable",
          message: "Internal geometry microservice is offline.",
        }),
      });

      const file = new File([new Uint8Array(100)], "overhead.png", {
        type: "image/png",
      });
      await expect(
        requestGarmentMeasurements(file, mockPayload),
      ).rejects.toMatchObject({
        code: "service_unavailable",
        status: 503,
      });
    });

    it("translates network fetch error into service_unavailable", async () => {
      global.fetch = vi
        .fn()
        .mockRejectedValue(new Error("Failed to fetch / Connection refused"));

      const file = new File([new Uint8Array(100)], "overhead.png", {
        type: "image/png",
      });
      await expect(
        requestGarmentMeasurements(file, mockPayload),
      ).rejects.toMatchObject({
        code: "service_unavailable",
        status: 503,
      });
    });

    it("translates 422 invalid geometry error", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          code: "invalid_geometry",
          message: "Paper corners are collinear or self-intersecting.",
        }),
      });

      const file = new File([new Uint8Array(100)], "overhead.png", {
        type: "image/png",
      });
      await expect(
        requestGarmentMeasurements(file, mockPayload),
      ).rejects.toMatchObject({
        code: "invalid_geometry",
        status: 422,
      });
    });
  });
});

