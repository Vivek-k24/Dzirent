"use client";

import React, { useState } from "react";
import { LANDMARK_DEFINITIONS } from "@/lib/ai-measure/constants";
import type {
  LandmarkAnnotation,
  MeasurementKey,
  Point2D,
} from "@/lib/ai-measure/types";
import styles from "./ai-measure.module.css";

interface LandmarkEditorProps {
  landmarks: Record<MeasurementKey, LandmarkAnnotation>;
  onChangeLandmarks: (
    updated: Record<MeasurementKey, LandmarkAnnotation>,
  ) => void;
  onCalculate: () => void;
  isSubmitting: boolean;
  imageWidth: number;
  imageHeight: number;
  paperConfirmed: boolean;
  reviewedLandmarks: Partial<Record<MeasurementKey, boolean>>;
  onReviewLandmark: (key: MeasurementKey, reviewed: boolean) => void;


const MEASUREMENT_KEYS: MeasurementKey[] = [
  "shoulder_width_cm",
  "chest_flat_cm",
  "body_length_cm",
  "sleeve_length_cm",
];

const STANDARD_REASONS = [
  "Seams hidden or not identifiable",
  "Sleeve folded or curved out of frame",
  "Hem cropped or obscured",
  "Garment is sleeveless / unsupported type",
  "Fabric heavily bunched / distorted",
];

export function LandmarkEditor({
  landmarks,
  onChangeLandmarks,
  onCalculate,
  isSubmitting,
  imageWidth,
  imageHeight,
  paperConfirmed,
  reviewedLandmarks,
  onReviewLandmark,
}: LandmarkEditorProps) {
  const [selectedKey, setSelectedKey] =
    useState<MeasurementKey>("shoulder_width_cm");

  const currentDefinition = LANDMARK_DEFINITIONS[selectedKey];
  const currentAnnotation = landmarks[selectedKey];

  const handleToggleNotMeasurable = (checked: boolean) => {
    const updated = {
      ...landmarks,
      [selectedKey]: {
        ...currentAnnotation,
        not_measurable: checked,
        unmeasurable_reason: checked
          ? currentAnnotation.unmeasurable_reason || STANDARD_REASONS[0]
          : undefined,
      },
    };
    onChangeLandmarks(updated);
  };

  const handleReasonChange = (reason: string) => {
    const updated = {
      ...landmarks,
      [selectedKey]: {
        ...currentAnnotation,
        unmeasurable_reason: reason,
      },
    };
    onChangeLandmarks(updated);
  };

  const handlePointChange = (
    pointIndex: number,
    axis: 0 | 1,
    value: number,
  ) => {
    const maxVal = axis === 0 ? imageWidth : imageHeight;
    const clamped = Math.max(
      0,
      Math.min(maxVal, isNaN(value) ? 0 : Math.round(value)),
    );

    const nextPoints = [...currentAnnotation.points_px];
    const oldPoint = nextPoints[pointIndex] || [0, 0];
    nextPoints[pointIndex] = [
      axis === 0 ? clamped : oldPoint[0],
      axis === 1 ? clamped : oldPoint[1],
    ];

    const updated = {
      ...landmarks,
      [selectedKey]: {
        ...currentAnnotation,
        points_px: nextPoints,
      },
    };
    onChangeLandmarks(updated);
    onReviewLandmark(selectedKey, false);
  };

  const handleAddPolylinePoint = () => {
    const pts = currentAnnotation.points_px;
    if (pts.length >= (currentDefinition.maxPoints || 8)) return;

    // Default: interpolate point between last two or offset from last
    const last = pts[pts.length - 1] || [imageWidth / 2, imageHeight / 2];
    const prev = pts[pts.length - 2] || [last[0] - 20, last[1] - 20];
    const newPoint: Point2D = [
      Math.min(imageWidth, Math.round(last[0] + (last[0] - prev[0]))),
      Math.min(imageHeight, Math.round(last[1] + (last[1] - prev[1]))),
    ];

    const updated = {
      ...landmarks,
      [selectedKey]: {
        ...currentAnnotation,
        points_px: [...pts, newPoint],
      },
    };
    onChangeLandmarks(updated);
    onReviewLandmark(selectedKey, false);
  };

  const handleRemovePolylinePoint = () => {
    const pts = currentAnnotation.points_px;
    if (pts.length <= (currentDefinition.minPoints || 2)) return;

    const updated = {
      ...landmarks,
      [selectedKey]: {
        ...currentAnnotation,
        points_px: pts.slice(0, pts.length - 1),
      },
    };
    onChangeLandmarks(updated);
    onReviewLandmark(selectedKey, false);
  };

  return (
    <section
      className={styles.landmarkEditorCard}
      aria-labelledby="landmark-editor-title"
      data-testid="landmark-editor"
    >
      <h3 id="landmark-editor-title" className={styles.sectionHeading}>
        3. Annotate Garment Seam Landmarks
      </h3>
      <p className={styles.editorHelpText}>
        Select each measurement to position seam landmarks. Mark &quot;Not Measurable&quot; if seams are
        hidden, bunched, or not visible.
      </p>

      {/* Navigation tabs for the 4 measurements */}
      <div className={styles.tabBar} role="tablist" aria-label="Garment measurements">
        {MEASUREMENT_KEYS.map((key) => {
          const def = LANDMARK_DEFINITIONS[key];
          const isNotMeasurable = landmarks[key].not_measurable;
          const isSelected = selectedKey === key;
          return (
            <button
              key={key}
              role="tab"
              aria-selected={isSelected}
              aria-controls={`panel-${key}`}
              id={`tab-${key}`}
              onClick={() => setSelectedKey(key)}
              className={`${styles.tabButton} ${isSelected ? styles.tabButtonActive : ""}`}
              data-testid={`tab-${key}`}
            >
              <span
                className={styles.colorIndicator}
                style={{ backgroundColor: def.color }}
                aria-hidden="true"
              />
              <span className={styles.tabLabel}>{def.label}</span>
              {isNotMeasurable && (
                <span className={styles.tabStatusSkipped}>Skipped</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Active landmark edit panel */}
      <div
        id={`panel-${selectedKey}`}
        role="tabpanel"
        aria-labelledby={`tab-${selectedKey}`}
        className={styles.tabContent}
      >
        <div className={styles.measurementHeader}>
          <div>
            <h4 className={styles.measurementTitle}>{currentDefinition.label}</h4>
            <p className={styles.measurementDesc}>{currentDefinition.description}</p>
          </div>
          <label className={styles.notMeasurableLabel} htmlFor="not-measurable-toggle">
            <input
              id="not-measurable-toggle"
              type="checkbox"
              checked={!!currentAnnotation.not_measurable}
              onChange={(e) => handleToggleNotMeasurable(e.target.checked)}
              data-testid="not-measurable-toggle"
            />
            <span>Mark as Not Measurable</span>
          </label>
        </div>

        {currentAnnotation.not_measurable ? (
          <div className={styles.unmeasurableBox} data-testid="unmeasurable-reason-box">
            <label htmlFor="unmeasurable-reason">Reason not measurable:</label>
            <select
              id="unmeasurable-reason"
              value={currentAnnotation.unmeasurable_reason || STANDARD_REASONS[0]}
              onChange={(e) => handleReasonChange(e.target.value)}
              className={styles.selectInput}
              data-testid="unmeasurable-reason"
            >
              {STANDARD_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <p className={styles.tinyMuted}>
              This item will be recorded as <code>not_measurable</code> and will not calculate a
              fabricated dimension.
            </p>
          </div>
        ) : (
          <div className={styles.activePointsSection}>
            <div className={styles.instructionBanner}>
              <strong>Seam Guideline:</strong> {currentDefinition.instruction}
            </div>

            <div className={styles.pointsList}>
              {currentAnnotation.points_px.map((pt, pIdx) => (
                <div
                  key={pIdx}
                  className={styles.pointRow}
                  data-testid={`point-row-${selectedKey}-${pIdx}`}
                >
                  <span className={styles.pointIndexBadge}>
                    Point {pIdx + 1}
                    {pIdx === 0 && currentDefinition.geometry === "line" ? " (Start)" : ""}
                    {pIdx === 1 && currentDefinition.geometry === "line" ? " (End)" : ""}
                  </span>

                  <div className={styles.inputGroup}>
                    <label htmlFor={`point-${selectedKey}-${pIdx}-x`}>X:</label>
                    <input
                      id={`point-${selectedKey}-${pIdx}-x`}
                      type="number"
                      min={0}
                      max={imageWidth}
                      value={pt[0]}
                      onChange={(e) =>
                        handlePointChange(pIdx, 0, parseInt(e.target.value, 10))
                      }
                      className={styles.numberInput}
                      data-testid={`point-${selectedKey}-${pIdx}-x`}
                    />
                  </div>

                  <div className={styles.inputGroup}>
                    <label htmlFor={`point-${selectedKey}-${pIdx}-y`}>Y:</label>
                    <input
                      id={`point-${selectedKey}-${pIdx}-y`}
                      type="number"
                      min={0}
                      max={imageHeight}
                      value={pt[1]}
                      onChange={(e) =>
                        handlePointChange(pIdx, 1, parseInt(e.target.value, 10))
                      }
                      className={styles.numberInput}
                      data-testid={`point-${selectedKey}-${pIdx}-y`}
                    />
                  </div>
                </div>
              ))}
            </div>

            {currentDefinition.geometry === "polyline" && (
              <div className={styles.polylineActions}>
                <button
                  type="button"
                  onClick={handleAddPolylinePoint}
                  disabled={
                    currentAnnotation.points_px.length >=
                    (currentDefinition.maxPoints || 8)
                  }
                  className={styles.secondaryButton}
                  data-testid="add-point-button"
                >
                  + Add Sleeve Bend Point
                </button>
                <button
                  type="button"
                  onClick={handleRemovePolylinePoint}
                  disabled={
                    currentAnnotation.points_px.length <=
                    (currentDefinition.minPoints || 2)
                  }
                  className={styles.secondaryButton}
                  data-testid="remove-point-button"
                >
                  - Remove Point
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className={styles.editorHelpText}>
        <label>
          <input type="checkbox" data-testid={`review-landmark-${selectedKey}`}
            disabled={!!currentAnnotation.not_measurable}
            checked={reviewedLandmarks[selectedKey] === true && !currentAnnotation.not_measurable}
            onChange={event => onReviewLandmark(selectedKey, event.target.checked)}
          />{" "}
          I checked every point against the garment's actual visible seams.
          Unticked template points will not be used to calculate measurements.
        </label>
      </div>

      <div className={styles.calculateActionRow}>
        <button
          type="button"
          onClick={onCalculate}
          disabled={!paperConfirmed || isSubmitting}
          className={styles.calculateButton}
          data-testid="calculate-button"
        >
          {isSubmitting
            ? "Computing Homography Geometry…"
            : "Derive Estimated Centimeter Dimensions"}
        </button>
        {!paperConfirmed && (
          <span className={styles.attestationRequiredNote}>
            * Please confirm paper corners in Step 2 before calculating.
          </span>
        )}
      </div>
    </section>
  );
}

