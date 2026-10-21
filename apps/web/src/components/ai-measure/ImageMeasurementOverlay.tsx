"use client";

import React, { useEffect, useRef, useState } from "react";
import { LANDMARK_DEFINITIONS } from "@/lib/ai-measure/constants";
import { displayToIntrinsic, intrinsicToDisplay } from "@/lib/ai-measure/coordinates";
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
  onChangeLandmarks: (landmarks: Record<MeasurementKey, LandmarkAnnotation>) => void;
  onInvalidateLandmark: (key: MeasurementKey) => void;
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
  onChangeCorners,
  landmarks,
  onChangeLandmarks,
  onInvalidateLandmark,
  activeStep,
}: ImageMeasurementOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef<{ kind: "paper"; index: number } | { kind: "landmark"; key: MeasurementKey; index: number } | null>(null);

  const startDrag = (event: React.PointerEvent<SVGCircleElement>,
    target: { kind: "paper"; index: number } | { kind: "landmark"; key: MeasurementKey; index: number }) => {
    event.preventDefault();
    event.stopPropagation();
    draggingRef.current = target;
    svgRef.current?.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = draggingRef.current;
    const svg = svgRef.current;
    if (!drag || !svg) return;
    const rect = svg.getBoundingClientRect();
    const point = displayToIntrinsic(
      [event.clientX - rect.left, event.clientY - rect.top],
      rect.width, rect.height, intrinsicWidth, intrinsicHeight
    );
    if (drag.kind === "paper") {
      if (activeStep !== "paper") return;
      const next = corners.map(p => [...p] as Point2D) as [Point2D, Point2D, Point2D, Point2D];
      next[drag.index] = point;
      onChangeCorners(next);
    } else {
      if (activeStep !== "landmarks" || landmarks[drag.key].not_measurable) return;
      const current = landmarks[drag.key];
      const nextPoints = current.points_px.map(p => [...p] as Point2D);
      nextPoints[drag.index] = point;
      onChangeLandmarks({...landmarks, [drag.key]: {...current, points_px: nextPoints}});
      onInvalidateLandmark(drag.key);
    }
  };

  const stopDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = null;
    if (svgRef.current?.hasPointerCapture(event.pointerId)) {
      svgRef.current.releasePointerCapture(event.pointerId);
    }
  };
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
        ref={svgRef}
        onPointerMove={moveDrag}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
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
                style={activeStep === "paper" ? {cursor:"grab", pointerEvents:"auto", touchAction:"none"} : undefined}
                onPointerDown={event => {
                  if (activeStep === "paper") startDrag(event, {kind:"paper", index:idx});
                }}
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
                  style={activeStep === "landmarks" ? {cursor:"grab", pointerEvents:"auto", touchAction:"none"} : undefined}
                  onPointerDown={event => {
                    if (activeStep === "landmarks")
                      startDrag(event, {kind:"landmark",key:key as MeasurementKey,index:pIdx});
                  }}
                />
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

