// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { requestPaperSnap, type PaperSnapResponse } from "./paper-calibrate";
import { GarmentMeasureScreen } from "@/components/ai-measure/GarmentMeasureScreen";
import { photoQualityLocalAllowed } from "@/lib/ai-quality/access";
import type { Point2D } from "./types";

describe("AI-MEASURE-2 Phase 2A — paper-calibrate client & proposal workflow", () => {
  const sampleCorners: [Point2D, Point2D, Point2D, Point2D] = [
    [100, 100],
    [300, 100],
    [300, 400],
    [100, 400],
  ];

  const validJpg = new File([new Uint8Array(1024)], "overhead.jpg", {
    type: "image/jpeg",
  });

  beforeEach(() => {
    if (typeof window !== "undefined") {
      window.URL.createObjectURL = vi
        .fn()
        .mockReturnValue("blob:http://localhost/test-blob");
      window.URL.revokeObjectURL = vi.fn();
    }
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Case 1: Client protocol, multipart payload, contract fields, and no physical dimensions
  // ---------------------------------------------------------------------------
  describe("Case 1: requestPaperSnap protocol and payload contract", () => {
    it("sends multipart request with image File, annotation JSON, and exact intrinsic corners", async () => {
      let capturedUrl = "";
      let capturedInit: RequestInit | undefined;

      vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
        capturedUrl = String(url);
        capturedInit = init;
        const response: PaperSnapResponse = {
          schema_version: "paper-calibrate.v0",
          algorithm_version: "corner-detector-0.1.0",
          request_id: "req-case1",
          reference_type: "us_letter",
          detection_status: "snapped",
          proposed_corners_px: [
            [102, 98],
            [304, 101],
            [299, 402],
            [98, 399],
          ],
          calibration_status: "valid",
          reason_codes: ["high_confidence"],
          requires_user_confirmation: true,
        };
        return new Response(JSON.stringify(response), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });

      const result = await requestPaperSnap(validJpg, sampleCorners);

      expect(capturedUrl).toBe("/api/v1/dev/paper-calibrate");
      expect(capturedInit?.method).toBe("POST");
      expect(capturedInit?.headers).toEqual({ Accept: "application/json" });
      expect(capturedInit?.body).toBeInstanceOf(FormData);

      const formData = capturedInit?.body as FormData;
      const sentImage = formData.get("image") as File;
      expect(sentImage).toBeInstanceOf(File);
      expect(sentImage.name).toBe("overhead.jpg");
      expect(sentImage.type).toBe("image/jpeg");

      const annotationStr = formData.get("annotation") as string;
      expect(typeof annotationStr).toBe("string");
      const annotation = JSON.parse(annotationStr);

      // Contract verification
      expect(annotation.schema_version).toBe("paper-calibrate.v0");
      expect(annotation.reference_type).toBe("us_letter");
      expect(annotation.approx_corners_px).toEqual(sampleCorners);

      // STRICT CHECK: No client-provided physical dimensions
      expect(annotation).not.toHaveProperty("width_in");
      expect(annotation).not.toHaveProperty("height_in");
      expect(annotation).not.toHaveProperty("width_cm");
      expect(annotation).not.toHaveProperty("height_cm");
      expect(annotation).not.toHaveProperty("paper_width");
      expect(annotation).not.toHaveProperty("paper_height");
      expect(annotation).not.toHaveProperty("physical_dimensions");

      expect(result.detection_status).toBe("snapped");
      expect(result.calibration_status).toBe("valid");
    });
  });

  // ---------------------------------------------------------------------------
  // Case 2 & 3: Response parsing, diagnostic statuses, and schema decoding
  // ---------------------------------------------------------------------------
  describe("Case 2 & 3: Response parsing and status handling", () => {
    it("successfully parses valid snapped response with valid and uncertain calibration statuses", async () => {
      const validResponse: PaperSnapResponse = {
        schema_version: "paper-calibrate.v0",
        algorithm_version: "v1",
        request_id: "req-v",
        reference_type: "us_letter",
        detection_status: "snapped",
        proposed_corners_px: [
          [100, 100],
          [300, 100],
          [300, 400],
          [100, 400],
        ],
        calibration_status: "valid",
        reason_codes: ["snapped_harris_contour"],
        requires_user_confirmation: true,
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(validResponse), { status: 200 }),
      );

      const res = await requestPaperSnap(validJpg, sampleCorners);
      expect(res.detection_status).toBe("snapped");
      expect(res.calibration_status).toBe("valid");
      expect(res.requires_user_confirmation).toBe(true);

      // Uncertain geometry
      validResponse.calibration_status = "uncertain";
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(validResponse), { status: 200 }),
      );
      const resUncertain = await requestPaperSnap(validJpg, sampleCorners);
      expect(resUncertain.calibration_status).toBe("uncertain");
    });

    it("parses not_found, ambiguous, and invalid responses with null proposed corners and null calibration", async () => {
      const statuses = ["not_found", "ambiguous", "invalid"] as const;

      for (const status of statuses) {
        const payload = {
          schema_version: "paper-calibrate.v0",
          algorithm_version: "v1",
          request_id: `req-${status}`,
          reference_type: "us_letter",
          detection_status: status,
          proposed_corners_px: null,
          calibration_status: null,
          reason_codes: [`reason_${status}`],
          requires_user_confirmation: true,
        };

        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
          new Response(JSON.stringify(payload), { status: 200 }),
        );

        const res = await requestPaperSnap(validJpg, sampleCorners);
        expect(res.detection_status).toBe(status);
        expect(res.proposed_corners_px).toBeNull();
        expect(res.calibration_status).toBeNull();
      }
    });

    it("rejects non-snap response that unexpectedly includes points or calibration status", async () => {
      const invalidNonSnap = {
        schema_version: "paper-calibrate.v0",
        algorithm_version: "v1",
        request_id: "req-err",
        reference_type: "us_letter",
        detection_status: "not_found",
        proposed_corners_px: [
          [10, 10],
          [20, 10],
          [20, 20],
          [10, 20],
        ],
        calibration_status: "valid",
        reason_codes: [],
        requires_user_confirmation: true,
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(invalidNonSnap), { status: 200 }),
      );

      await expect(requestPaperSnap(validJpg, sampleCorners)).rejects.toThrow(
        "Calibration service sent unexpected points with a non-snap result.",
      );
    });

    it("rejects response missing requires_user_confirmation: true", async () => {
      const missingConfirmation = {
        schema_version: "paper-calibrate.v0",
        algorithm_version: "v1",
        request_id: "req-noconf",
        reference_type: "us_letter",
        detection_status: "snapped",
        proposed_corners_px: sampleCorners,
        calibration_status: "valid",
        reason_codes: [],
        requires_user_confirmation: false, // Must be literal true
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(missingConfirmation), { status: 200 }),
      );

      await expect(requestPaperSnap(validJpg, sampleCorners)).rejects.toThrow(
        "Unexpected calibration response schema.",
      );
    });

    it("rejects schema version mismatch or wrong reference type", async () => {
      const wrongSchema = {
        schema_version: "paper-calibrate.v1", // Mismatch
        algorithm_version: "v1",
        request_id: "req-badschema",
        reference_type: "us_letter",
        detection_status: "not_found",
        proposed_corners_px: null,
        calibration_status: null,
        reason_codes: [],
        requires_user_confirmation: true,
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(wrongSchema), { status: 200 }),
      );

      await expect(requestPaperSnap(validJpg, sampleCorners)).rejects.toThrow(
        "Unexpected calibration response schema.",
      );

      wrongSchema.schema_version = "paper-calibrate.v0";
      (wrongSchema as Record<string, unknown>).reference_type = "a4"; // Wrong reference

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(wrongSchema), { status: 200 }),
      );

      await expect(requestPaperSnap(validJpg, sampleCorners)).rejects.toThrow(
        "Unexpected calibration response schema.",
      );
    });

    it("rejects coordinates with NaN, Infinity, or invalid quadrilateral shape", async () => {
      const nanCorners = {
        schema_version: "paper-calibrate.v0",
        algorithm_version: "v1",
        request_id: "req-nan",
        reference_type: "us_letter",
        detection_status: "snapped",
        proposed_corners_px: [
          [100, NaN],
          [300, 100],
          [300, 400],
          [100, 400],
        ],
        calibration_status: "valid",
        reason_codes: [],
        requires_user_confirmation: true,
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(nanCorners), { status: 200 }),
      );

      await expect(requestPaperSnap(validJpg, sampleCorners)).rejects.toThrow(
        "Calibration service returned invalid proposed corners.",
      );

      // Self-intersecting / colinear polygon
      const crossingCorners = {
        ...nanCorners,
        proposed_corners_px: [
          [100, 100],
          [300, 400],
          [300, 100],
          [100, 400], // Crossing diagonals
        ],
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(crossingCorners), { status: 200 }),
      );

      await expect(requestPaperSnap(validJpg, sampleCorners)).rejects.toThrow(
        "Calibration service returned invalid proposed corners.",
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Case 6: Client-side validation, HTTP error codes, network failure, and non-JSON bodies
  // ---------------------------------------------------------------------------
  describe("Case 6: Error handling, status codes, and network failure", () => {
    it("rejects invalid input file formats (415) and oversized files (413) prior to fetch", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const gifFile = new File([new Uint8Array(100)], "overhead.gif", {
        type: "image/gif",
      });
      await expect(requestPaperSnap(gifFile, sampleCorners)).rejects.toThrow(
        /unsupported file format/i,
      );

      const hugeFile = new File(
        [new Uint8Array(11 * 1024 * 1024)],
        "huge.jpg",
        { type: "image/jpeg" },
      );
      await expect(requestPaperSnap(hugeFile, sampleCorners)).rejects.toThrow(
        /exceeds 10 MiB/i,
      );

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("rejects invalid approx corners prior to fetch", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const badQuad: [Point2D, Point2D, Point2D, Point2D] = [
        [0, 0],
        [100, 100],
        [0, 0], // Duplicate points
        [100, 100],
      ];

      await expect(requestPaperSnap(validJpg, badQuad)).rejects.toThrow(
        "Move the paper overlay into a valid four-sided shape.",
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("handles HTTP 503 with both JSON and non-JSON proxy response", async () => {
      // JSON 503
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { message: "Service temporarily offline" } }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        ),
      );
      await expect(requestPaperSnap(validJpg, sampleCorners)).rejects.toThrow(
        "Service temporarily offline",
      );

      // Non-JSON 503 (e.g. gateway HTML/plain text)
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("503 Service Unavailable", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        }),
      );
      await expect(requestPaperSnap(validJpg, sampleCorners)).rejects.toThrow(
        "Paper calibration is offline; adjust corners manually.",
      );
    });

    it("handles HTTP 413, 415, and 422 with status messages or fallback", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("Request Entity Too Large", { status: 413 }),
      );
      await expect(requestPaperSnap(validJpg, sampleCorners)).rejects.toThrow(
        "Paper calibration failed (HTTP 413).",
      );

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { message: "Unsupported media format" } }),
          { status: 415 },
        ),
      );
      await expect(requestPaperSnap(validJpg, sampleCorners)).rejects.toThrow(
        "Unsupported media format",
      );
    });

    it("handles network unreachable failure with clear manual fallback note", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
        new TypeError("Failed to fetch"),
      );

      await expect(requestPaperSnap(validJpg, sampleCorners)).rejects.toThrow(
        "Cannot reach the local calibration service. You can still mark corners manually.",
      );
    });

    it("handles unreadable 200 response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("NOT JSON", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }),
      );

      await expect(requestPaperSnap(validJpg, sampleCorners)).rejects.toThrow(
        "Calibration service returned an unreadable response.",
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Suite 2: GarmentMeasureScreen Component Proposal State Workflow Tests
  // ---------------------------------------------------------------------------
  describe("Proposal State UI Workflow in GarmentMeasureScreen", () => {
    // Helper to advance GarmentMeasureScreen into the Paper step
    async function setupScreenAtPaperStep() {
      render(createElement(GarmentMeasureScreen));

      // Upload dropzone file input
      const fileInput = screen.getByTestId("garment-photo-input") as HTMLInputElement;
      const file = new File([new Uint8Array(2048)], "flatlay.png", {
        type: "image/png",
      });

      // Mock Image load dimensions
      const originalImage = globalThis.Image;
      class MockImage {
        onload: () => void = () => {};
        src = "";
        width = 800;
        height = 600;
        naturalWidth = 800;
        naturalHeight = 600;
        constructor() {
          setTimeout(() => this.onload(), 0);
        }
      }
      globalThis.Image = MockImage as unknown as typeof Image;

      fireEvent.change(fileInput, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByTestId("paper-snap-panel")).toBeDefined();
      });

      globalThis.Image = originalImage;
    }

    it("Case 2: displays proposed corners on snapped response and NEVER auto-applies, auto-confirms, or auto-advances", async () => {
      await setupScreenAtPaperStep();

      const initialX = (screen.getByTestId("corner-TL-x") as HTMLInputElement).value;
      const initialY = (screen.getByTestId("corner-TL-y") as HTMLInputElement).value;

      const proposedCorners: [Point2D, Point2D, Point2D, Point2D] = [
        [150, 120],
        [350, 115],
        [360, 410],
        [145, 405],
      ];

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            schema_version: "paper-calibrate.v0",
            algorithm_version: "hough-0.2.0",
            request_id: "req-proposal-1",
            reference_type: "us_letter",
            detection_status: "snapped",
            proposed_corners_px: proposedCorners,
            calibration_status: "valid",
            reason_codes: ["high_contrast_edges"],
            requires_user_confirmation: true,
          } satisfies PaperSnapResponse),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      const calibrateBtn = screen.getByTestId("calibrate-paper-button");
      fireEvent.click(calibrateBtn);

      await waitFor(() => {
        expect(screen.getByTestId("paper-snap-result")).toBeDefined();
      });

      // 1. Shows proposed corner values
      expect(screen.getByTestId("paper-snap-coordinates").textContent).toContain("TL: (150.0, 120.0)");
      expect(screen.getByTestId("paper-snap-coordinates").textContent).toContain("TR: (350.0, 115.0)");
      expect(screen.getByTestId("paper-snap-result").textContent).toContain("Detection: snapped");
      expect(screen.getByTestId("paper-snap-result").textContent).toContain("Geometry: valid");

      // 2. Enables Apply button
      const applyBtn = screen.getByTestId("apply-paper-snap");
      expect(applyBtn).toBeDefined();

      // 3. NEVER auto-applies: Current corner inputs still hold the initial values!
      expect((screen.getByTestId("corner-TL-x") as HTMLInputElement).value).toBe(initialX);
      expect((screen.getByTestId("corner-TL-y") as HTMLInputElement).value).toBe(initialY);

      // 4. NEVER auto-confirms: Confirmation badge is still Pending Confirmation!
      expect(screen.queryByTestId("paper-confirmed-badge")).toBeNull();
      expect(screen.getByText("Pending Confirmation")).toBeDefined();

      // 5. NEVER auto-advances: Step is still paper step, landmark editor is NOT rendered!
      expect(screen.getByTestId("step-badge-paper").className).toContain("stepActive");
      expect(screen.queryByTestId("landmark-editor")).toBeNull();

      // 6. Honest copy: Does not claim detected physical paper size
      expect(screen.getByTestId("paper-snap-panel").textContent).not.toContain(
        "detected paper size is 8.5",
      );
    });

    it("Case 2: snapped response with invalid geometry hides/disables Apply button", async () => {
      await setupScreenAtPaperStep();

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            schema_version: "paper-calibrate.v0",
            algorithm_version: "v1",
            request_id: "req-geom-invalid",
            reference_type: "us_letter",
            detection_status: "snapped",
            proposed_corners_px: [
              [100, 100],
              [300, 100],
              [300, 400],
              [100, 400],
            ],
            calibration_status: "invalid", // Invalid diagnostic geometry
            reason_codes: ["excessive_keystone_distortion"],
            requires_user_confirmation: true,
          } satisfies PaperSnapResponse),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      fireEvent.click(screen.getByTestId("calibrate-paper-button"));

      await waitFor(() => {
        expect(screen.getByTestId("paper-snap-result")).toBeDefined();
      });

      expect(screen.getByTestId("paper-snap-result").textContent).toContain("Geometry: invalid");
      expect(screen.queryByTestId("apply-paper-snap")).toBeNull();
      expect(screen.getByTestId("dismiss-paper-snap")).toBeDefined();
    });

    it("Case 3: not_found and ambiguous responses preserve current corners and provide honest fallback", async () => {
      await setupScreenAtPaperStep();

      const initialX = (screen.getByTestId("corner-TL-x") as HTMLInputElement).value;

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            schema_version: "paper-calibrate.v0",
            algorithm_version: "v1",
            request_id: "req-notfound",
            reference_type: "us_letter",
            detection_status: "not_found",
            proposed_corners_px: null,
            calibration_status: null,
            reason_codes: ["low_contrast", "no_sheet_boundary"],
            requires_user_confirmation: true,
          } satisfies PaperSnapResponse),
          { status: 200 },
        ),
      );

      fireEvent.click(screen.getByTestId("calibrate-paper-button"));

      await waitFor(() => {
        expect(screen.getByTestId("paper-snap-result")).toBeDefined();
      });

      // Honest explanation
      expect(screen.getByTestId("paper-snap-result").textContent).toContain("Detection: not_found");
      expect(screen.getByTestId("paper-snap-result").textContent).toContain(
        "No reliable automatic corner proposal. Adjust the overlay or use manual coordinates.",
      );
      expect(screen.getByTestId("paper-snap-result").textContent).toContain(
        "Diagnostic codes: low_contrast, no_sheet_boundary",
      );

      // No apply button
      expect(screen.queryByTestId("apply-paper-snap")).toBeNull();

      // Current corners preserved
      expect((screen.getByTestId("corner-TL-x") as HTMLInputElement).value).toBe(initialX);

      // Manual fallback available
      expect(screen.getByTestId("confirm-paper-button")).toBeDefined();
    });

    it("Case 4: Discard leaves corners and confirmation unchanged", async () => {
      await setupScreenAtPaperStep();

      const initialX = (screen.getByTestId("corner-TL-x") as HTMLInputElement).value;

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            schema_version: "paper-calibrate.v0",
            algorithm_version: "v1",
            request_id: "req-discard",
            reference_type: "us_letter",
            detection_status: "snapped",
            proposed_corners_px: [
              [120, 120],
              [320, 120],
              [320, 420],
              [120, 420],
            ],
            calibration_status: "valid",
            reason_codes: [],
            requires_user_confirmation: true,
          } satisfies PaperSnapResponse),
          { status: 200 },
        ),
      );

      fireEvent.click(screen.getByTestId("calibrate-paper-button"));

      await waitFor(() => {
        expect(screen.getByTestId("dismiss-paper-snap")).toBeDefined();
      });

      // Click Discard
      fireEvent.click(screen.getByTestId("dismiss-paper-snap"));

      // Proposal dismissed
      expect(screen.queryByTestId("paper-snap-result")).toBeNull();
      // Corners unchanged
      expect((screen.getByTestId("corner-TL-x") as HTMLInputElement).value).toBe(initialX);
      // Confirmation remains unconfirmed
      expect(screen.queryByTestId("paper-confirmed-badge")).toBeNull();
    });

    it("Case 4: Apply replaces corners, invalidates old confirmation, and requires explicit confirmation afterward", async () => {
      await setupScreenAtPaperStep();

      const proposedCorners: [Point2D, Point2D, Point2D, Point2D] = [
        [125, 135],
        [325, 135],
        [325, 435],
        [125, 435],
      ];

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            schema_version: "paper-calibrate.v0",
            algorithm_version: "v1",
            request_id: "req-apply",
            reference_type: "us_letter",
            detection_status: "snapped",
            proposed_corners_px: proposedCorners,
            calibration_status: "valid",
            reason_codes: [],
            requires_user_confirmation: true,
          } satisfies PaperSnapResponse),
          { status: 200 },
        ),
      );

      fireEvent.click(screen.getByTestId("calibrate-paper-button"));

      await waitFor(() => {
        expect(screen.getByTestId("apply-paper-snap")).toBeDefined();
      });

      // Click Apply proposed corners
      fireEvent.click(screen.getByTestId("apply-paper-snap"));

      // Corners updated to proposed values
      expect((screen.getByTestId("corner-TL-x") as HTMLInputElement).value).toBe("125");
      expect((screen.getByTestId("corner-TL-y") as HTMLInputElement).value).toBe("135");

      // Proposal panel dismissed
      expect(screen.queryByTestId("paper-snap-result")).toBeNull();

      // Old confirmation is invalidated and remains unconfirmed!
      expect(screen.queryByTestId("paper-confirmed-badge")).toBeNull();
      expect(screen.getByText("Pending Confirmation")).toBeDefined();

      // Step has NOT advanced to landmarks; user must confirm manually
      expect(screen.getByTestId("step-badge-paper").className).toContain("stepActive");
      expect(screen.queryByTestId("landmark-editor")).toBeNull();

      // Checking attestation checkbox and clicking Confirm manually advances to landmarks
      const attestationBox = screen.getByTestId("us-letter-attestation");
      fireEvent.click(attestationBox);
      fireEvent.click(screen.getByTestId("confirm-paper-button"));

      expect(screen.getByTestId("step-badge-landmarks").className).toContain("stepActive");
      expect(screen.getByTestId("landmark-editor")).toBeDefined();
    });

    it("Case 5: Editing a corner while calibrate is in-flight ignores the stale late response", async () => {
      await setupScreenAtPaperStep();

      let resolveFetch!: (res: Response) => void;
      const fetchPromise = new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
      vi.spyOn(globalThis, "fetch").mockReturnValueOnce(fetchPromise);

      // Start calibrate
      fireEvent.click(screen.getByTestId("calibrate-paper-button"));
      expect(screen.getByTestId("calibrate-paper-button").textContent).toBe("Finding paper...");

      // While request is in-flight, user edits TL X coordinate
      const tlXInput = screen.getByTestId("corner-TL-x") as HTMLInputElement;
      fireEvent.change(tlXInput, { target: { value: "199" } });
      expect(tlXInput.value).toBe("199");

      // Now late fetch resolves with proposal
      resolveFetch(
        new Response(
          JSON.stringify({
            schema_version: "paper-calibrate.v0",
            algorithm_version: "v1",
            request_id: "req-stale",
            reference_type: "us_letter",
            detection_status: "snapped",
            proposed_corners_px: [
              [50, 50],
              [250, 50],
              [250, 350],
              [50, 350],
            ],
            calibration_status: "valid",
            reason_codes: [],
            requires_user_confirmation: true,
          } satisfies PaperSnapResponse),
          { status: 200 },
        ),
      );

      // Wait a tick for promise to settle
      await new Promise((r) => setTimeout(r, 20));

      // Stale proposal was ignored: no proposal banner appears, user's edit remains intact
      expect(screen.queryByTestId("paper-snap-result")).toBeNull();
      expect((screen.getByTestId("corner-TL-x") as HTMLInputElement).value).toBe("199");
    });

    it("Case 5: Selecting a different photo or reset while calibrate is in-flight prevents stale proposal", async () => {
      await setupScreenAtPaperStep();

      let resolveFetch!: (res: Response) => void;
      const fetchPromise = new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
      vi.spyOn(globalThis, "fetch").mockReturnValueOnce(fetchPromise);

      // Start calibrate
      fireEvent.click(screen.getByTestId("calibrate-paper-button"));

      // Click Choose Different Photo (handleReset)
      fireEvent.click(screen.getByTestId("retake-photo-button"));
      expect(screen.getByTestId("photo-dropzone")).toBeDefined();

      // Now late fetch resolves
      resolveFetch(
        new Response(
          JSON.stringify({
            schema_version: "paper-calibrate.v0",
            algorithm_version: "v1",
            request_id: "req-late-reset",
            reference_type: "us_letter",
            detection_status: "snapped",
            proposed_corners_px: sampleCorners,
            calibration_status: "valid",
            reason_codes: [],
            requires_user_confirmation: true,
          }),
          { status: 200 },
        ),
      );

      await new Promise((r) => setTimeout(r, 20));

      // Still on upload step, no stale proposal or error
      expect(screen.getByTestId("photo-dropzone")).toBeDefined();
      expect(screen.queryByTestId("paper-snap-result")).toBeNull();
    });

    it("Case 6: Out-of-frame proposed coordinates trigger error alert and preserve manual coordinates", async () => {
      await setupScreenAtPaperStep();

      const initialX = (screen.getByTestId("corner-TL-x") as HTMLInputElement).value;

      // Coordinates outside intrinsic 800x600 image bounds (e.g. -15 or 850)
      const outOfFrameCorners: [Point2D, Point2D, Point2D, Point2D] = [
        [-15, 100],
        [300, 100],
        [300, 400],
        [-15, 400],
      ];

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            schema_version: "paper-calibrate.v0",
            algorithm_version: "v1",
            request_id: "req-oob",
            reference_type: "us_letter",
            detection_status: "snapped",
            proposed_corners_px: outOfFrameCorners,
            calibration_status: "valid",
            reason_codes: [],
            requires_user_confirmation: true,
          } satisfies PaperSnapResponse),
          { status: 200 },
        ),
      );

      fireEvent.click(screen.getByTestId("calibrate-paper-button"));

      await waitFor(() => {
        expect(screen.getByTestId("paper-snap-error")).toBeDefined();
      });

      expect(screen.getByTestId("paper-snap-error").textContent).toContain(
        "Proposed coordinates are outside the uploaded photo. Manual corner placement remains available.",
      );
      // Corners preserved
      expect((screen.getByTestId("corner-TL-x") as HTMLInputElement).value).toBe(initialX);
      // Manual controls still available
      expect(screen.getByTestId("confirm-paper-button")).toBeDefined();
    });

    it("Case 7: Server-controlled runtime gate and URL independence", () => {
      // Server-controlled access policy tests
      // Allowed in development / test / local
      expect(photoQualityLocalAllowed(undefined, "development", undefined)).toBe(true);
      expect(photoQualityLocalAllowed("local", "production", undefined)).toBe(true);
      expect(photoQualityLocalAllowed("test", "test", undefined)).toBe(true);

      // STRICTLY DENIED when VERCEL_ENV is defined (preview/production)
      expect(photoQualityLocalAllowed(undefined, "development", "preview")).toBe(false);
      expect(photoQualityLocalAllowed("local", "development", "production")).toBe(false);
      expect(photoQualityLocalAllowed("test", "test", "preview")).toBe(false);

      // DENIED in production without local/test environment flag
      expect(photoQualityLocalAllowed(undefined, "production", undefined)).toBe(false);
    });
  });
});
