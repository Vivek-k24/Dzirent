// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { PhotoQualityScreen } from "@/components/ai-quality/PhotoQualityScreen";
import { NoticeBanner } from "@/components/ai-quality/NoticeBanner";
import { PreliminaryBadge } from "@/components/ai-quality/PreliminaryBadge";
import { ServerResultView } from "@/components/ai-quality/ServerResultView";
import { RetakeGuidance } from "@/components/ai-quality/RetakeGuidance";
import type { PreliminaryAnalysis, QualityCheckResponse } from "./types";

beforeEach(() => {
  if (typeof window !== "undefined") {
    window.URL.createObjectURL = vi.fn().mockReturnValue("blob:http://localhost/test-blob");
    window.URL.revokeObjectURL = vi.fn();
  }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("NoticeBanner Component", () => {
  it("renders the tool disclaimer and honesty notes", () => {
    const { container } = render(createElement(NoticeBanner));
    expect(screen.getByText(/TEST PROTOTYPE/i)).toBeDefined();
    expect(screen.getByText(/AI-QUALITY-1/i)).toBeDefined();
    expect(container.textContent).toContain("compute garment dimensions");
  });
});

describe("PreliminaryBadge Component", () => {
  it("displays prominent PRELIMINARY BROWSER ESTIMATE banner and per-check status", () => {
    const mockAnalysis: PreliminaryAnalysis = {
      isPreliminary: true,
      blur: { status: "pass", score: 140, reason: "sharp" },
      exposure: { status: "fail", meanLuminance: 35, reason: "too_dark" },
      paper: { status: "uncertain", reason: "requires_server_verification" },
      framing: { status: "uncertain", reason: "requires_server_verification" },
      decision: "retake",
      notes: ["Preliminary test note."],
    };

    render(createElement(PreliminaryBadge, { analysis: mockAnalysis }));

    expect(screen.getByTestId("preliminary-label").textContent).toContain("PRELIMINARY BROWSER ESTIMATE");
    expect(screen.getByTestId("preliminary-blur").textContent).toBe("Pass");
    expect(screen.getByTestId("preliminary-exposure").textContent).toBe("Fail");
    expect(screen.getByTestId("preliminary-decision").textContent).toContain("Retake Recommended");
  });
});

describe("ServerResultView Component", () => {
  it("renders pass decision and all 4 checks accurately", () => {
    const mockResult: QualityCheckResponse = {
      schema_version: "ai-quality.v0",
      algorithm_version: "quality-rules-0.1.0",
      request_id: "test-req-abc",
      decision: "pass",
      checks: {
        blur: { status: "pass", reason: "sharp" },
        exposure: { status: "pass", reason: "acceptable_light" },
        paper: { status: "pass", reason: "valid_corners" },
        framing: { status: "pass", reason: "fully_contained" },
      },
      message: "Ready to list.",
    };

    render(createElement(ServerResultView, { result: mockResult }));

    expect(screen.getByTestId("decision-banner").textContent).toContain("PASS — Ready for Listing");
    expect(screen.getByTestId("check-blur").textContent).toContain("Pass");
    expect(screen.getByTestId("check-exposure").textContent).toContain("Pass");
    expect(screen.getByTestId("check-paper").textContent).toContain("Pass");
    expect(screen.getByTestId("check-framing").textContent).toContain("Pass");
    expect(screen.getByTestId("server-message").textContent).toContain("Ready to list.");
  });

  it("renders retake decision when checks fail", () => {
    const mockResult: QualityCheckResponse = {
      schema_version: "ai-quality.v0",
      algorithm_version: "quality-rules-0.1.0",
      request_id: "test-req-def",
      decision: "retake",
      checks: {
        blur: { status: "fail", reason: "blurry" },
        exposure: { status: "pass", reason: "acceptable_light" },
        paper: { status: "fail", reason: "paper_missing" },
        framing: { status: "uncertain", reason: "garment_boundary_uncertain" },
      },
      message: "Please retake your overhead photo.",
    };

    render(createElement(ServerResultView, { result: mockResult }));

    expect(screen.getByTestId("decision-banner").textContent).toContain("RETAKE NEEDED");
    expect(screen.getByTestId("check-blur").textContent).toContain("Fail");
    expect(screen.getByTestId("check-paper").textContent).toContain("Fail");
    expect(screen.getByTestId("check-framing").textContent).toContain("Uncertain");
  });
});

describe("RetakeGuidance Component", () => {
  it("displays capture guidelines and targeted fixes for failed checks", () => {
    render(
      createElement(RetakeGuidance, {
        checks: {
          blur: { status: "fail", reason: "blurry" },
          paper: { status: "fail", reason: "corners_missing" },
        },
      }),
    );

    expect(screen.getByText(/Photo Capture & Retake Guide/i)).toBeDefined();
    expect(screen.getByText(/Reduce Blur:/i)).toBeDefined();
    expect(screen.getByText(/Reference Paper Setup:/i)).toBeDefined();
    expect(screen.getByText(/US Letter Paper Reference/i)).toBeDefined();
  });
});

describe("PhotoQualityScreen Workflow", () => {
  it("handles file validation errors and allows resetting", async () => {
    render(createElement(PhotoQualityScreen));

    expect(screen.getByText(/Overhead Photo Quality Screening/i)).toBeDefined();
    const input = screen.getByTestId("photo-input");

    // Select unsupported file (e.g. GIF)
    const badFile = new File([new Uint8Array(100)], "bad.gif", { type: "image/gif" });
    fireEvent.change(input, { target: { files: [badFile] } });

    await waitFor(() => {
      expect(screen.getByTestId("error-alert")).toBeDefined();
      expect(screen.getByText(/unsupported_media_type/i)).toBeDefined();
    });

    // Reset back to idle
    const chooseDifferent = screen.getByText(/Choose different file/i);
    fireEvent.click(chooseDifferent);

    await waitFor(() => {
      expect(screen.queryByTestId("error-alert")).toBeNull();
      expect(screen.getByTestId("photo-dropzone")).toBeDefined();
    });
  });
});
