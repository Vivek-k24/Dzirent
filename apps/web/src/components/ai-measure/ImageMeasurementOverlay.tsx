"use client";

import React, { useEffect, useRef, useState } from "react";
import { LANDMARK_DEFINITIONS } from "@/lib/ai-measure/constants";
import {
  displayToIntrinsic,
  intrinsicToDisplay,
  translateQuadSafely,
} from "@/lib/ai-measure/coordinates";
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
  onChangeLandmarks: (
    landmarks: Record<MeasurementKey, LandmarkAnnotation>,
  ) => void;
  onInvalidateLandmark: (key: MeasurementKey) => void;
  landmarks: Record<MeasurementKey, LandmarkAnnotation>;
  activeStep: "paper" | "landmarks";
  activeLandmarkKey?: MeasurementKey;
}

const CORNER_KEYS: PaperCornerKey[] = ["TL", "TR", "BR", "BL"];

type DragTarget =
  | { kind: "paper-corner"; index: number }
  | {
      kind: "paper-quad";
      startIntrinsic: Point2D;
      initialCorners: [Point2D, Point2D, Point2D, Point2D];
    }
  | { kind: "landmark"; key: MeasurementKey; index: number };

interface LandmarkHandleProps {
  point: Point2D;
  pointIndex: number;
  landmarkKey: MeasurementKey;
  color: string;
  onDragStart: (
    event: React.PointerEvent,
    landmarkKey: MeasurementKey,
    index: number,
  ) => void;
}

function LandmarkHandle({
  point,
  pointIndex,
  landmarkKey,
  color,
  onDragStart,
}: LandmarkHandleProps) {
  return (
    <g className={styles.landmarkHandleGroup}>
      {/* Precision hollow marker (1.5px stroke) */}
      <circle
        cx={point[0]}
        cy={point[1]}
        r={4.5}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        aria-hidden="true"
      />
      {/* Crosshair ticks */}
      <line
        x1={point[0] - 8}
        y1={point[1]}
        x2={point[0] - 4.5}
        y2={point[1]}
        stroke={color}
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <line
        x1={point[0] + 4.5}
        y1={point[1]}
        x2={point[0] + 8}
        y2={point[1]}
        stroke={color}
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <line
        x1={point[0]}
        y1={point[1] - 8}
        x2={point[0]}
        y2={point[1] - 4.5}
        stroke={color}
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <line
        x1={point[0]}
        y1={point[1] + 4.5}
        x2={point[0]}
        y2={point[1] + 8}
        stroke={color}
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <circle
        cx={point[0]}
        cy={point[1]}
        r={1}
        fill={color}
        aria-hidden="true"
      />

      {/* Transparent >=24px hit target */}
      <circle
        cx={point[0]}
        cy={point[1]}
        r={14}
        fill="transparent"
        stroke="transparent"
        data-testid={`landmark-point-${landmarkKey}-${pointIndex}`}
        className={styles.landmarkHitTarget}
        tabIndex={0}
        role="button"
        aria-label={`Adjust ${landmarkKey} point ${pointIndex + 1}`}
        style={{
          cursor: "grab",
          pointerEvents: "auto",
          touchAction: "none",
        }}
        onPointerDown={(event) =>
          onDragStart(event, landmarkKey, pointIndex)
        }
      />
    </g>
  );
}

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
  const draggingRef = useRef<DragTarget | null>(null);

  const startDrag = (event: React.PointerEvent, target: DragTarget) => {
    event.preventDefault();
    event.stopPropagation();
    draggingRef.current = target;
    svgRef.current?.setPointerCapture(event.pointerId);
  };

  const startQuadDrag = (event: React.PointerEvent) => {
    if (activeStep !== "paper") return;
    event.preventDefault();
    event.stopPropagation();
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const startIntrinsic = displayToIntrinsic(
      [event.clientX - rect.left, event.clientY - rect.top],
      rect.width,
      rect.height,
      intrinsicWidth,
      intrinsicHeight,
    );
    draggingRef.current = {
      kind: "paper-quad",
      startIntrinsic,
      initialCorners: corners.map((p) => [...p] as Point2D) as [
        Point2D,
        Point2D,
        Point2D,
        Point2D,
      ],
    };
    svg.setPointerCapture(event.pointerId);
  };

  const handleLandmarkPointerDown = (
    event: React.PointerEvent,
    landmarkKey: MeasurementKey,
    index: number,
  ) => {
    if (activeStep !== "landmarks") return;
    startDrag(event, {
      kind: "landmark",
      key: landmarkKey,
      index,
    });
  };

  const moveDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = draggingRef.current;
    const svg = svgRef.current;
    if (!drag || !svg) return;
    const rect = svg.getBoundingClientRect();
    const point = displayToIntrinsic(
      [event.clientX - rect.left, event.clientY - rect.top],
      rect.width,
      rect.height,
      intrinsicWidth,
      intrinsicHeight,
    );

    if (drag.kind === "paper-corner") {
      if (activeStep !== "paper") return;
      const next = corners.map((p) => [...p] as Point2D) as [
        Point2D,
        Point2D,
        Point2D,
        Point2D,
      ];
      next[drag.index] = point;
      onChangeCorners(next);
    } else if (drag.kind === "paper-quad") {
      if (activeStep !== "paper") return;
      const deltaX = point[0] - drag.startIntrinsic[0];
      const deltaY = point[1] - drag.startIntrinsic[1];
      const next = translateQuadSafely(
        drag.initialCorners,
        deltaX,
        deltaY,
        intrinsicWidth,
        intrinsicHeight,
      );
      onChangeCorners(next);
    } else if (drag.kind === "landmark") {
      if (activeStep !== "landmarks" || landmarks[drag.key].not_measurable)
        return;
      const current = landmarks[drag.key];
      const nextPoints = current.points_px.map((p) => [...p] as Point2D);
      nextPoints[drag.index] = point;
      onChangeLandmarks({
        ...landmarks,
        [drag.key]: { ...current, points_px: nextPoints },
      });
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

  const handleCornerKeyDown = (
    e: React.KeyboardEvent,
    cornerIndex: number,
  ) => {
    let dx = 0;
    let dy = 0;
    const step = e.shiftKey ? 5 : 1;
    if (e.key === "ArrowLeft") dx = -step;
    else if (e.key === "ArrowRight") dx = step;
    else if (e.key === "ArrowUp") dy = -step;
    else if (e.key === "ArrowDown") dy = step;
    else return;

    e.preventDefault();
    const next = corners.map((p) => [...p] as Point2D) as [
      Point2D,
      Point2D,
      Point2D,
      Point2D,
    ];
    const current = next[cornerIndex];
    next[cornerIndex] = [
      Math.max(0, Math.min(intrinsicWidth, current[0] + dx)),
      Math.max(0, Math.min(intrinsicHeight, current[1] + dy)),
    ];
    onChangeCorners(next);
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

  // Centroid of the paper quadrilateral in display coordinates
  const quadCenterDisplay: Point2D = [
    (displayCorners[0][0] +
      displayCorners[1][0] +
      displayCorners[2][0] +
      displayCorners[3][0]) /
      4,
    (displayCorners[0][1] +
      displayCorners[1][1] +
      displayCorners[2][1] +
      displayCorners[3][1]) /
      4,
  ];

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

      {/* Visual hint that placement is rough/manual, not an automated detector */}
      {activeStep === "paper" && (
        <div
          className={styles.overlayManualHint}
          data-testid="overlay-manual-hint"
        >
          Manual reference placement · Drag sheet center to move · Drag crosshairs to align
        </div>
      )}

      <svg
        ref={svgRef}
        onPointerMove={moveDrag}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        className={styles.svgOverlay}
        width={containerW}
        height={containerH}
        viewBox={`0 0 ${containerW} ${containerH}`}
        aria-label="Garment and paper reference measurement overlay"
      >
        {/* Paper quadrilateral overlay (~10% translucent, draggable interior) */}
        <polygon
          points={polygonPointsStr}
          className={`${styles.paperPolygon} ${
            activeStep === "paper" ? styles.paperPolygonActive : ""
          }`}
          data-testid="paper-quadrilateral"
          style={
            activeStep === "paper"
              ? { cursor: "move", pointerEvents: "auto", touchAction: "none" }
              : undefined
          }
          onPointerDown={startQuadDrag}
        />

        {/* Paper center drag affordance (moves all 4 corners together) */}
        {activeStep === "paper" && (
          <g
            className={styles.quadCenterAffordance}
            data-testid="paper-quad-center"
            style={{ cursor: "move", pointerEvents: "auto", touchAction: "none" }}
            onPointerDown={startQuadDrag}
            aria-label="Drag to translate reference sheet"
          >
            {/* Transparent hit target for center drag */}
            <circle
              cx={quadCenterDisplay[0]}
              cy={quadCenterDisplay[1]}
              r={18}
              fill="transparent"
            />
            {/* Move icon crosshair */}
            <circle
              cx={quadCenterDisplay[0]}
              cy={quadCenterDisplay[1]}
              r={12}
              className={styles.quadCenterCircle}
            />
            <line
              x1={quadCenterDisplay[0] - 6}
              y1={quadCenterDisplay[1]}
              x2={quadCenterDisplay[0] + 6}
              y2={quadCenterDisplay[1]}
              stroke="#2563eb"
              strokeWidth={1.5}
            />
            <line
              x1={quadCenterDisplay[0]}
              y1={quadCenterDisplay[1] - 6}
              x2={quadCenterDisplay[0]}
              y2={quadCenterDisplay[1] + 6}
              stroke="#2563eb"
              strokeWidth={1.5}
            />
            <path
              d={`M ${quadCenterDisplay[0] - 4} ${quadCenterDisplay[1] - 2} L ${quadCenterDisplay[0] - 6} ${quadCenterDisplay[1]} L ${quadCenterDisplay[0] - 4} ${quadCenterDisplay[1] + 2}`}
              stroke="#2563eb"
              strokeWidth={1.5}
              fill="none"
            />
            <path
              d={`M ${quadCenterDisplay[0] + 4} ${quadCenterDisplay[1] - 2} L ${quadCenterDisplay[0] + 6} ${quadCenterDisplay[1]} L ${quadCenterDisplay[0] + 4} ${quadCenterDisplay[1] + 2}`}
              stroke="#2563eb"
              strokeWidth={1.5}
              fill="none"
            />
            <path
              d={`M ${quadCenterDisplay[0] - 2} ${quadCenterDisplay[1] - 4} L ${quadCenterDisplay[0]} ${quadCenterDisplay[1] - 6} L ${quadCenterDisplay[0] + 2} ${quadCenterDisplay[1] - 4}`}
              stroke="#2563eb"
              strokeWidth={1.5}
              fill="none"
            />
            <path
              d={`M ${quadCenterDisplay[0] - 2} ${quadCenterDisplay[1] + 4} L ${quadCenterDisplay[0]} ${quadCenterDisplay[1] + 6} L ${quadCenterDisplay[0] + 2} ${quadCenterDisplay[1] + 4}`}
              stroke="#2563eb"
              strokeWidth={1.5}
              fill="none"
            />
          </g>
        )}

        {/* Paper corner mathematical-vertex crosshairs with >=24px transparent hit targets */}
        {displayCorners.map((pt, idx) => {
          const key = CORNER_KEYS[idx];
          const labelOffsets: Record<PaperCornerKey, { x: number; y: number }> = {
            TL: { x: -14, y: -10 },
            TR: { x: 14, y: -10 },
            BR: { x: 14, y: 16 },
            BL: { x: -14, y: 16 },
          };
          const offset = labelOffsets[key];

          return (
            <g
              key={key}
              className={styles.cornerHandleGroup}
              data-testid={`corner-handle-${key}`}
            >
              {/* High contrast white shadow lines for visibility on dark/light garments */}
              <line
                x1={pt[0] - 9}
                y1={pt[1]}
                x2={pt[0] + 9}
                y2={pt[1]}
                stroke="#ffffff"
                strokeWidth={3}
                strokeLinecap="square"
                aria-hidden="true"
              />
              <line
                x1={pt[0]}
                y1={pt[1] - 9}
                x2={pt[0]}
                y2={pt[1] + 9}
                stroke="#ffffff"
                strokeWidth={3}
                strokeLinecap="square"
                aria-hidden="true"
              />
              {/* Precision 1.5px mathematical vertex crosshairs */}
              <line
                x1={pt[0] - 9}
                y1={pt[1]}
                x2={pt[0] + 9}
                y2={pt[1]}
                stroke="#1d4ed8"
                strokeWidth={1.5}
                strokeLinecap="square"
                aria-hidden="true"
              />
              <line
                x1={pt[0]}
                y1={pt[1] - 9}
                x2={pt[0]}
                y2={pt[1] + 9}
                stroke="#1d4ed8"
                strokeWidth={1.5}
                strokeLinecap="square"
                aria-hidden="true"
              />
              {/* Hollow center ring (r=2.5px) leaving exact underlying paper corner visible */}
              <rect
                x={pt[0] - 2.5}
                y={pt[1] - 2.5}
                width={5}
                height={5}
                rx={2.5}
                ry={2.5}
                fill="#ffffff"
                fillOpacity={0.25}
                stroke="#1d4ed8"
                strokeWidth={1.5}
                aria-hidden="true"
              />

              {/* >=24px transparent hit target with keyboard accessibility & visible focus ring */}
              <circle
                cx={pt[0]}
                cy={pt[1]}
                r={14}
                fill="transparent"
                stroke="transparent"
                className={styles.cornerHitTarget}
                tabIndex={activeStep === "paper" ? 0 : -1}
                role="button"
                aria-label={`Adjust ${key} corner`}
                data-testid={`corner-hit-${key}`}
                style={
                  activeStep === "paper"
                    ? { cursor: "grab", pointerEvents: "auto", touchAction: "none" }
                    : undefined
                }
                onPointerDown={(event) => {
                  if (activeStep === "paper")
                    startDrag(event, { kind: "paper-corner", index: idx });
                }}
                onKeyDown={(event) => handleCornerKeyDown(event, idx)}
              />

              {/* Corner label outside the vertex to avoid obscuring coordinate */}
              <text
                x={pt[0] + offset.x}
                y={pt[1] + offset.y}
                className={styles.cornerLabelText}
                aria-hidden="true"
              >
                {key}
              </text>
            </g>
          );
        })}

        {/* Garment Landmark lines / polylines: HIDE during paper step! */}
        {activeStep === "landmarks" &&
          Object.entries(landmarks).map(([landmarkKey, annotation]) => {
            if (annotation.not_measurable || annotation.points_px.length < 2)
              return null;
            const def = LANDMARK_DEFINITIONS[landmarkKey as MeasurementKey];
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
              <g key={landmarkKey} data-testid={`landmark-group-${landmarkKey}`}>
                {/* Connecting line or polyline */}
                <polyline
                  points={pointsAttr}
                  fill="none"
                  stroke={color}
                  strokeWidth={3}
                  strokeDasharray={
                    landmarkKey === "chest_flat_cm" ? "4 4" : undefined
                  }
                  className={styles.landmarkPolyline}
                />

                {/* Point markers: small hollow/crosshair symbols; no falsely offset centres */}
                {displayPoints.map((p, pIdx) => (
                  <LandmarkHandle
                    key={pIdx}
                    point={p}
                    pointIndex={pIdx}
                    landmarkKey={landmarkKey as MeasurementKey}
                    color={color}
                    onDragStart={handleLandmarkPointerDown}
                  />
                ))}
              </g>
            );
          })}
      </svg>
    </div>
  );
}
