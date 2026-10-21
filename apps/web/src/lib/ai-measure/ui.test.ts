// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NoticeBanner } from "@/components/ai-measure/NoticeBanner";
import { InstructionsAndAttestation } from "@/components/ai-measure/InstructionsAndAttestation";
import { PaperCornerEditor } from "@/components/ai-measure/PaperCornerEditor";
import { LandmarkEditor } from "@/components/ai-measure/LandmarkEditor";
import { MeasurementResultsView } from "@/components/ai-measure/MeasurementResultsView";
import { PhotoDropzone } from "@/components/ai-measure/PhotoDropzone";
import type {
  GarmentMeasureResponse,
  LandmarkAnnotation,
  MeasurementKey,
  Point2D,
} from "./types";

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

describe("NoticeBanner Component", () => {
  it("renders honest prototype disclaimer and non-circumference notes", () => {
    const { container } = render(createElement(NoticeBanner));
    expect(screen.getByTestId("ai-measure-notice")).toBeDefined();
    expect(screen.getByText(/TEST PROTOTYPE/i)).toBeDefined();
    expect(container.textContent).toContain("does not measure body circumference");
    expect(container.textContent).toContain("does not guarantee fit");
    expect(container.textContent).toContain("does not persist measurements to catalog");
  });
});

describe("InstructionsAndAttestation Component", () => {
  it("renders overhead capture rules and triggers attestation callback", () => {
    const onAttestationChange = vi.fn();
    render(
      createElement(InstructionsAndAttestation, {
        attested: false,
        onAttestationChange,
      }),
    );

    expect(screen.getByTestId("instructions-section")).toBeDefined();
    expect(screen.getAllByText(/8.5 × 11 in/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Same Planar Surface/i)).toBeDefined();

    const checkbox = screen.getByTestId("us-letter-attestation") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    fireEvent.click(checkbox);
    expect(onAttestationChange).toHaveBeenCalledWith(true);
  });
});

describe("PaperCornerEditor Component", () => {
  const validCorners: [Point2D, Point2D, Point2D, Point2D] = [
    [100, 100],
    [300, 100],
    [300, 400],
    [100, 400],
  ];

  it("renders labeled corners and coordinate inputs with provisional note", () => {
    const onChangeCorners = vi.fn();
    const onConfirm = vi.fn();

    render(
      createElement(PaperCornerEditor, {
        corners: validCorners,
        onChangeCorners,
        isConfirmed: false,
        onConfirm,
        attested: true,
        imageWidth: 800,
        imageHeight: 600,
      }),
    );

    expect(screen.getByTestId("unverified-corner-note")).toBeDefined();
    expect(screen.getByTestId("corner-group-TL")).toBeDefined();
    expect(screen.getByTestId("corner-group-TR")).toBeDefined();
    expect(screen.getByTestId("corner-group-BR")).toBeDefined();
    expect(screen.getByTestId("corner-group-BL")).toBeDefined();

    const confirmBtn = screen.getByTestId("confirm-paper-button") as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(false);

    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalled();
  });

  it("disables confirmation when user has not attested US Letter paper", () => {
    const onChangeCorners = vi.fn();
    const onConfirm = vi.fn();

    render(
      createElement(PaperCornerEditor, {
        corners: validCorners,
        onChangeCorners,
        isConfirmed: false,
        onConfirm,
        attested: false,
        imageWidth: 800,
        imageHeight: 600,
      }),
    );

    const confirmBtn = screen.getByTestId("confirm-paper-button") as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
  });

  it("detects crossed/invalid corners, displays alert and disables confirm button", () => {
    const crossedCorners: [Point2D, Point2D, Point2D, Point2D] = [
      [100, 100],
      [300, 400], // Crossed
      [300, 100],
      [100, 400],
    ];

    render(
      createElement(PaperCornerEditor, {
        corners: crossedCorners,
        onChangeCorners: vi.fn(),
        isConfirmed: false,
        onConfirm: vi.fn(),
        attested: true,
        imageWidth: 800,
        imageHeight: 600,
      }),
    );

    expect(screen.getByTestId("corner-invalid-alert")).toBeDefined();
    const confirmBtn = screen.getByTestId("confirm-paper-button") as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
  });

  it("handles nudge buttons to fine-tune coordinates by 1px", () => {
    const onChangeCorners = vi.fn();

    render(
      createElement(PaperCornerEditor, {
        corners: validCorners,
        onChangeCorners,
        isConfirmed: false,
        onConfirm: vi.fn(),
        attested: true,
        imageWidth: 800,
        imageHeight: 600,
      }),
    );

    const nudgeRightBtn = screen.getByRole("button", {
      name: /Nudge TL right 1px/i,
    });
    fireEvent.click(nudgeRightBtn);

    expect(onChangeCorners).toHaveBeenCalledWith([
      [101, 100],
      [300, 100],
      [300, 400],
      [100, 400],
    ]);
  });
});

describe("LandmarkEditor Component", () => {
  const initialLandmarks: Record<MeasurementKey, LandmarkAnnotation> = {
    shoulder_width_cm: {
      key: "shoulder_width_cm",
      geometry: "line",
      points_px: [
        [200, 150],
        [400, 150],
      ],
      not_measurable: false,
    },
    chest_flat_cm: {
      key: "chest_flat_cm",
      geometry: "line",
      points_px: [
        [180, 250],
        [420, 250],
      ],
      not_measurable: false,
    },
    body_length_cm: {
      key: "body_length_cm",
      geometry: "line",
      points_px: [
        [250, 150],
        [250, 500],
      ],
      not_measurable: false,
    },
    sleeve_length_cm: {
      key: "sleeve_length_cm",
      geometry: "polyline",
      points_px: [
        [400, 150],
        [480, 300],
        [520, 450],
      ],
      not_measurable: false,
    },
  };

  it("allows switching landmark tabs and toggling not_measurable", () => {
    const onChangeLandmarks = vi.fn();
    const onCalculate = vi.fn();

    render(
      createElement(LandmarkEditor, {
        landmarks: initialLandmarks,
        onChangeLandmarks,
        onCalculate,
        isSubmitting: false,
        imageWidth: 800,
        imageHeight: 600,
        paperConfirmed: true,
        reviewedLandmarks: {},
        onReviewLandmark: vi.fn(),
      }),
    );

    expect(screen.getByTestId("landmark-editor")).toBeDefined();
    expect(screen.getByTestId("tab-shoulder_width_cm")).toBeDefined();

    // Toggle not_measurable
    const notMeasurableCheckbox = screen.getByTestId(
      "not-measurable-toggle",
    ) as HTMLInputElement;
    expect(notMeasurableCheckbox.checked).toBe(false);

    fireEvent.click(notMeasurableCheckbox);
    expect(onChangeLandmarks).toHaveBeenCalledWith(
      expect.objectContaining({
        shoulder_width_cm: expect.objectContaining({
          not_measurable: true,
        }),
      }),
    );
  });

  it("disables calculate when paper is not confirmed and enables when confirmed", () => {
    const onCalculate = vi.fn();

    const { rerender } = render(
      createElement(LandmarkEditor, {
        landmarks: initialLandmarks,
        onChangeLandmarks: vi.fn(),
        onCalculate,
        isSubmitting: false,
        imageWidth: 800,
        imageHeight: 600,
        paperConfirmed: false,
        reviewedLandmarks: {},
        onReviewLandmark: vi.fn(),
      }),
    );

    const calcBtn = screen.getByTestId("calculate-button") as HTMLButtonElement;
    expect(calcBtn.disabled).toBe(true);

    rerender(
      createElement(LandmarkEditor, {
        landmarks: initialLandmarks,
        onChangeLandmarks: vi.fn(),
        onCalculate,
        isSubmitting: false,
        imageWidth: 800,
        imageHeight: 600,
        paperConfirmed: true,
        reviewedLandmarks: {},
        onReviewLandmark: vi.fn(),
      }),
    );

    expect(calcBtn.disabled).toBe(false);
    fireEvent.click(calcBtn);
    expect(onCalculate).toHaveBeenCalled();
  });
});

describe("MeasurementResultsView Component", () => {
  const mockResponse: GarmentMeasureResponse = {
    schema_version: "ai-measure.v0",
    algorithm_version: "planar-homography-0.1.0",
    request_id: "test-req-123",
    calibration_status: "valid",
    garment_class: "sleeved_top",
    method: "paper_homography_and_landmarks",
    confirmed_by_lender: false,
    cautions: [
      "Values are flat-laid planar estimates. Never treat flat chest as body circumference.",
      "Measurements are strictly local to this test session; no data is written to the catalog database or public fit badges.",
    ],
    measurements: {
      shoulder_width_cm: {
        key: "shoulder_width_cm",
        geometry: "line",
        points_px: [
          [200, 150],
          [400, 150],
        ],
        value_cm: 44.5,
        status: "estimated",
      },
      chest_flat_cm: {
        key: "chest_flat_cm",
        geometry: "line",
        points_px: [
          [180, 250],
          [420, 250],
        ],
        value_cm: 52.0,
        status: "estimated",
      },
      body_length_cm: {
        key: "body_length_cm",
        geometry: "line",
        points_px: [
          [250, 150],
          [250, 500],
        ],
        value_cm: 71.2,
        status: "estimated",
      },
      sleeve_length_cm: {
        key: "sleeve_length_cm",
        geometry: "polyline",
        points_px: [
          [400, 150],
          [480, 300],
          [520, 450],
        ],
        value_cm: null,
        status: "not_measurable",
        reason: "Sleeve folded out of frame",
      },
    },
    message: "Planar estimates calculated successfully.",
  };

  it("renders estimates, unmeasurable reasons, and lender confirmation toggles", () => {
    const onAdjust = vi.fn();
    const onReset = vi.fn();

    render(
      createElement(MeasurementResultsView, {
        results: mockResponse,
        onAdjustLandmarks: onAdjust,
        onReset,
      }),
    );

    expect(screen.getByTestId("measurement-results")).toBeDefined();
    expect(screen.getByTestId("calibration-status").textContent).toContain("Valid");

    expect(screen.getByTestId("value-shoulder_width_cm").textContent).toContain("44.5 cm");
    expect(screen.getByTestId("value-chest_flat_cm").textContent).toContain("52.0 cm");
    expect(screen.getByTestId("value-body_length_cm").textContent).toContain("71.2 cm");

    expect(screen.getByTestId("badge-sleeve_length_cm").textContent).toBe("Not Measurable");
    expect(screen.getByText(/Sleeve folded out of frame/i)).toBeDefined();

    // Check confirmation toggle
    const confirmToggle = screen.getByTestId(
      "confirm-check-shoulder_width_cm",
    ) as HTMLInputElement;
    expect(confirmToggle.checked).toBe(false);

    fireEvent.click(confirmToggle);
    expect(confirmToggle.checked).toBe(true);

    // Test adjust and reset buttons
    const adjustBtn = screen.getByTestId("adjust-landmarks-button");
    fireEvent.click(adjustBtn);
    expect(onAdjust).toHaveBeenCalled();

    const resetBtn = screen.getByTestId("reset-button");
    fireEvent.click(resetBtn);
    expect(onReset).toHaveBeenCalled();
  });
});

describe("PhotoDropzone Component", () => {
  it("rejects unsupported media types with a user-facing alert", () => {
    const onPhotoSelected = vi.fn();
    render(createElement(PhotoDropzone, { onPhotoSelected }));

    const input = screen.getByTestId("garment-photo-input");
    const badFile = new File(["fake text"], "sample.txt", { type: "text/plain" });

    fireEvent.change(input, { target: { files: [badFile] } });

    expect(screen.getByTestId("upload-error-alert")).toBeDefined();
    expect(screen.getByTestId("upload-error-alert").textContent).toContain(
      "Unsupported file format",
    );
    expect(onPhotoSelected).not.toHaveBeenCalled();
  });
});
