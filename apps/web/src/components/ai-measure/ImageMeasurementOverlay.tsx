"use client";

import React, { useEffect, useRef, useState } from "react";
import { LANDMARK_DEFINITIONS } from "@/lib/ai-measure/constants";
import { intrinsicToDisplay } from "@/lib/ai-measure/coordinates";
import type {
  LandmarkAnnotation,
  MeasurementKey,
  PaperCornerKey,
  Point2D,
} from "@/lib/ai-measure/types";
import styles from "./ai-measure.module.css";

interface ImageMeasurementOverlayProps {
  previewUrl: string;
  intrinsicWidth: number;
  intrinsicHeight: number;
  corners: [Point2D, Point2D, Point2D, Point2D];
  onChangeCorners: (corners: [Point2D, Point2D, Point2D, Point2D]) => void;
  landmarks: Record<MeasurementKey, LandmarkAnnotation>;
  activeStep: "paper" | "landmarks";
  activeLandmarkKey?: MeasurementKey;
}

const CORNER_KEYS: PaperCornerKey[] = ["TL", "TR", "BR", "BL"];

export function ImageMeasurementOverlay({
  previewUrl,
  intrinsicWidth,
  intrinsicHeight,
  corners,
  landmarks,
  activeStep,
}: ImageMeasurementOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState<{
    width: number;
    height: number;
  }>({
    width: intrinsicWidth || 800,
    height: intrinsicHeight || 600,
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateSize = () => {
      if (el.clientWidth > 0 && el.clientHeight > 0) {
        setContainerSize({
          width: el.clientWidth,
          height: el.clientHeight,
        });
      }
    };

    updateSize();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(updateSize);
      observer.observe(el);
      return () => observer.disconnect();
    }
  }, []);

  const containerW = containerSize.width;
  const containerH = containerSize.height;

  // Convert intrinsic paper corners to display coordinates for SVG rendering
  const displayCorners = corners.map((pt) =>
    intrinsicToDisplay(
      pt,
      containerW,
      containerH,
      intrinsicWidth,
      intrinsicHeight,
    ),
  );

  // SVG polygon points string: "x1,y1 x2,y2 x3,y3 x4,y4"
  const polygonPointsStr = displayCorners
    .map((p) => `${p[0]},${p[1]}`)
    .join(" ");

  return (
    <div
      ref={containerRef}
      className={styles.overlayContainer}
      data-testid="image-measurement-overlay"
    >
      <img
        src={previewUrl}
        alt="Overhead garment with reference paper"
        className={styles.baseImage}
        data-testid="preview-image"
      />

      <svg
        className={styles.svgOverlay}
        width={containerW}
        height={containerH}
        viewBox={`0 0 ${containerW} ${containerH}`}
        aria-hidden="true"
      >
        {/* Paper quadrilateral overlay */}
        <polygon
          points={polygonPointsStr}
          className={`${styles.paperPolygon} ${
            activeStep === "paper" ? styles.paperPolygonActive : ""
          }`}
          data-testid="paper-quadrilateral"
        />

        {/* Paper corner markers and labels */}
        {displayCorners.map((pt, idx) => {
          const key = CORNER_KEYS[idx];
          return (
            <g
              key={key}
              className={styles.cornerHandleGroup}
              data-testid={`corner-handle-${key}`}
            >
              <circle
                cx={pt[0]}
                cy={pt[1]}
                r={activeStep === "paper" ? 9 : 6}
                className={styles.cornerCircle}
              />
              <text
                x={pt[0] + 12}
                y={pt[1] + 4}
                className={styles.cornerLabelText}
              >
                {key}
              </text>
            </g>
          );
        })}

        {/* Garment Landmark lines / polylines */}
        {Object.entries(landmarks).map(([key, annotation]) => {
          if (annotation.not_measurable || annotation.points_px.length < 2)
            return null;
          const def = LANDMARK_DEFINITIONS[key as MeasurementKey];
          const color = def?.color || "#3b82f6";

          const displayPoints = annotation.points_px.map((pt) =>
            intrinsicToDisplay(
              pt,
              containerW,
              containerH,
              intrinsicWidth,
              intrinsicHeight,
            ),
          );

          const pointsAttr = displayPoints
            .map((p) => `${p[0]},${p[1]}`)
            .join(" ");

          return (
            <g key={key} data-testid={`landmark-group-${key}`}>
              {/* Connecting line or polyline */}
              <polyline
                points={pointsAttr}
                fill="none"
                stroke={color}
                strokeWidth={activeStep === "landmarks" ? 3.5 : 2.5}
                strokeDasharray={key === "chest_flat_cm" ? "4 4" : undefined}
                className={styles.landmarkPolyline}
              />

              {/* Point markers */}
              {displayPoints.map((p, pIdx) => (
                <circle
                  key={pIdx}
                  cx={p[0]}
                  cy={p[1]}
                  r={activeStep === "landmarks" ? 6 : 4}
                  fill={color}
                  stroke="#ffffff"
                  strokeWidth={2}
                  data-testid={`landmark-point-${key}-${pIdx}`}
                />
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

