import { describe, expect, it } from "vitest";
import {
  computeRenderedImageRect,
  displayToIntrinsic,
  intrinsicToDisplay,
  intrinsicToPercent,
  isValidQuadrilateral,
} from "./coordinates";
import type { Point2D } from "./types";

describe("AI-MEASURE-1 Coordinate Transformations", () => {
  describe("computeRenderedImageRect", () => {
    it("handles wider image inside tall container (letterboxed top & bottom)", () => {
      // Container: 1000 x 1000 (ratio 1.0), Image: 2000 x 1000 (ratio 2.0)
      const rect = computeRenderedImageRect(1000, 1000, 2000, 1000);
      expect(rect.width).toBe(1000);
      expect(rect.height).toBe(500);
      expect(rect.left).toBe(0);
      expect(rect.top).toBe(250);
    });

    it("handles taller image inside wide container (pillarboxed left & right)", () => {
      // Container: 1000 x 500 (ratio 2.0), Image: 500 x 1000 (ratio 0.5)
      const rect = computeRenderedImageRect(1000, 500, 500, 1000);
      expect(rect.width).toBe(250);
      expect(rect.height).toBe(500);
      expect(rect.left).toBe(375);
      expect(rect.top).toBe(0);
    });

    it("handles identical aspect ratios", () => {
      const rect = computeRenderedImageRect(800, 600, 1600, 1200);
      expect(rect.width).toBe(800);
      expect(rect.height).toBe(600);
      expect(rect.left).toBe(0);
      expect(rect.top).toBe(0);
    });

    it("safely handles zero or negative dimensions", () => {
      const rect = computeRenderedImageRect(0, 0, 100, 100);
      expect(rect.width).toBe(0);
      expect(rect.height).toBe(0);
    });
  });

  describe("displayToIntrinsic and intrinsicToDisplay", () => {
    const containerW = 800;
    const containerH = 600;
    const intrinsicW = 2000;
    const intrinsicH = 1000;
    // Image is 2:1. Container is 800:600 (4:3 = 1.33:1).
    // Rendered image: width = 800, height = 400, left = 0, top = 100.

    it("correctly converts center click to intrinsic image center", () => {
      const displayCenter: Point2D = [400, 300]; // 100 + 400/2 = 300
      const intrinsic = displayToIntrinsic(
        displayCenter,
        containerW,
        containerH,
        intrinsicW,
        intrinsicH,
      );
      expect(intrinsic[0]).toBe(1000);
      expect(intrinsic[1]).toBe(500);
    });

    it("converts intrinsic corners to display container coordinates", () => {
      const intrinsicTL: Point2D = [0, 0];
      const displayTL = intrinsicToDisplay(
        intrinsicTL,
        containerW,
        containerH,
        intrinsicW,
        intrinsicH,
      );
      expect(displayTL[0]).toBe(0);
      expect(displayTL[1]).toBe(100);

      const intrinsicBR: Point2D = [2000, 1000];
      const displayBR = intrinsicToDisplay(
        intrinsicBR,
        containerW,
        containerH,
        intrinsicW,
        intrinsicH,
      );
      expect(displayBR[0]).toBe(800);
      expect(displayBR[1]).toBe(500);
    });

    it("clamps clicks in empty letterbox bars to image boundary", () => {
      // Click above the image (top letterbox bar at y=20)
      const displayAbove: Point2D = [400, 20];
      const intrinsicAbove = displayToIntrinsic(
        displayAbove,
        containerW,
        containerH,
        intrinsicW,
        intrinsicH,
      );
      expect(intrinsicAbove[0]).toBe(1000);
      expect(intrinsicAbove[1]).toBe(0);

      // Click below the image (bottom letterbox bar at y=580)
      const displayBelow: Point2D = [400, 580];
      const intrinsicBelow = displayToIntrinsic(
        displayBelow,
        containerW,
        containerH,
        intrinsicW,
        intrinsicH,
      );
      expect(intrinsicBelow[0]).toBe(1000);
      expect(intrinsicBelow[1]).toBe(1000);
    });

    it("achieves roundtrip consistency within rounding precision", () => {
      const originalIntrinsic: Point2D = [1420, 780];
      const display = intrinsicToDisplay(
        originalIntrinsic,
        containerW,
        containerH,
        intrinsicW,
        intrinsicH,
      );
      const roundtrip = displayToIntrinsic(
        display,
        containerW,
        containerH,
        intrinsicW,
        intrinsicH,
      );

      expect(Math.abs(roundtrip[0] - originalIntrinsic[0])).toBeLessThanOrEqual(2);
      expect(Math.abs(roundtrip[1] - originalIntrinsic[1])).toBeLessThanOrEqual(2);
    });
  });

  describe("intrinsicToPercent", () => {
    it("returns correct percentage points", () => {
      const p1 = intrinsicToPercent([500, 250], 1000, 1000);
      expect(p1.xPercent).toBe(50);
      expect(p1.yPercent).toBe(25);

      const pClamped = intrinsicToPercent([1500, -10], 1000, 1000);
      expect(pClamped.xPercent).toBe(100);
      expect(pClamped.yPercent).toBe(0);
    });
  });

  describe("isValidQuadrilateral", () => {
    it("accepts a standard convex rectangle", () => {
      const validQuad: [Point2D, Point2D, Point2D, Point2D] = [
        [100, 100], // TL
        [300, 110], // TR
        [290, 400], // BR
        [110, 390], // BL
      ];
      expect(isValidQuadrilateral(validQuad)).toBe(true);
    });

    it("rejects collinear points (flat line)", () => {
      const collinear: [Point2D, Point2D, Point2D, Point2D] = [
        [100, 100],
        [200, 200],
        [300, 300],
        [400, 400],
      ];
      expect(isValidQuadrilateral(collinear)).toBe(false);
    });

    it("rejects self-intersecting bowtie quadrilateral", () => {
      // Swapping TR and BR creates a bowtie crossing
      const bowtie: [Point2D, Point2D, Point2D, Point2D] = [
        [100, 100], // TL
        [290, 400], // BR crossed to TR
        [300, 110], // TR crossed to BR
        [110, 390], // BL
      ];
      expect(isValidQuadrilateral(bowtie)).toBe(false);
    });

    it("rejects duplicate/identical corners", () => {
      const duplicate: [Point2D, Point2D, Point2D, Point2D] = [
        [100, 100],
        [100, 100],
        [300, 300],
        [100, 300],
      ];
      expect(isValidQuadrilateral(duplicate)).toBe(false);
    });
  });
});

