"use client";

import React from "react";
import type { PaperCornerKey, Point2D } from "@/lib/ai-measure/types";
import { isValidQuadrilateral } from "@/lib/ai-measure/coordinates";
import styles from "./ai-measure.module.css";

interface PaperCornerEditorProps {
  corners: [Point2D, Point2D, Point2D, Point2D];
  onChangeCorners: (corners: [Point2D, Point2D, Point2D, Point2D]) => void;
  isConfirmed: boolean;
  onConfirm: () => void;
  attested: boolean;
  imageWidth: number;
  imageHeight: number;
}

const CORNER_KEYS: PaperCornerKey[] = ["TL", "TR", "BR", "BL"];
const CORNER_NAMES: Record<PaperCornerKey, string> = {
  TL: "Top-Left",
  TR: "Top-Right",
  BR: "Bottom-Right",
  BL: "Bottom-Left",
};

export function PaperCornerEditor({
  corners,
  onChangeCorners,
  isConfirmed,
  onConfirm,
  attested,
  imageWidth,
  imageHeight,
}: PaperCornerEditorProps) {
  const isValid = isValidQuadrilateral(corners);

  const handleCoordinateChange = (
    index: number,
    axis: 0 | 1,
    value: number,
  ) => {
    const maxVal = axis === 0 ? imageWidth : imageHeight;
    const clamped = Math.max(0, Math.min(maxVal, isNaN(value) ? 0 : Math.round(value)));

    const next = [...corners] as [Point2D, Point2D, Point2D, Point2D];
    const updatedPoint: Point2D = [
      axis === 0 ? clamped : next[index][0],
      axis === 1 ? clamped : next[index][1],
    ];
    next[index] = updatedPoint;
    onChangeCorners(next);
  };

  const handleNudge = (index: number, axis: 0 | 1, delta: number) => {
    const current = corners[index][axis];
    handleCoordinateChange(index, axis, current + delta);
  };

  return (
    <section
      className={styles.cornerEditorCard}
      aria-labelledby="paper-editor-title"
      data-testid="paper-corner-editor"
    >
      <div className={styles.sectionHeader}>
        <h3 id="paper-editor-title" className={styles.sectionHeading}>
          2. Mark US Letter Paper Corners
        </h3>
        {isConfirmed ? (
          <span className={styles.statusBadgeConfirmed} data-testid="paper-confirmed-badge">
            ✓ Corners Confirmed
          </span>
        ) : (
          <span className={styles.statusBadgePending}>Pending Confirmation</span>
        )}
      </div>

      <p className={styles.editorHelpText}>
        Align the four reference corners (TL, TR, BR, BL) precisely with the four physical corners of
        the white printer paper sheet.
      </p>

      <div className={styles.provisionalNote} role="note" data-testid="unverified-corner-note">
        <strong>Provisional Suggestions:</strong> Initial paper coordinates are unverified templates.
        Lender review and adjustment are mandatory before computing dimensions.
      </div>

      {!isValid && (
        <div className={styles.cornerWarning} role="alert" data-testid="corner-invalid-alert">
          <strong>Invalid Quadrilateral:</strong> Corners must form a non-crossing convex
          polygon with positive area. Please adjust points.
        </div>
      )}

      {/* Coordinate fine-tuning controls */}
      <div className={styles.cornerGrid} data-testid="corner-controls">
        {CORNER_KEYS.map((key, idx) => {
          const [x, y] = corners[idx];
          return (
            <div key={key} className={styles.cornerControlItem} data-testid={`corner-group-${key}`}>
              <div className={styles.cornerItemHeader}>
                <span className={styles.cornerKeyBadge}>{key}</span>
                <span className={styles.cornerNameLabel}>{CORNER_NAMES[key]}</span>
              </div>
              <div className={styles.coordinateInputs}>
                <div className={styles.inputGroup}>
                  <label htmlFor={`corner-${key}-x`}>X:</label>
                  <input
                    id={`corner-${key}-x`}
                    type="number"
                    min={0}
                    max={imageWidth}
                    value={x}
                    onChange={(e) =>
                      handleCoordinateChange(idx, 0, parseInt(e.target.value, 10))
                    }
                    className={styles.numberInput}
                    data-testid={`corner-${key}-x`}
                  />
                  <div className={styles.nudgeButtons}>
                    <button
                      type="button"
                      onClick={() => handleNudge(idx, 0, -1)}
                      title={`Nudge ${key} left 1px`}
                      aria-label={`Nudge ${key} left 1px`}
                    >
                      -1
                    </button>
                    <button
                      type="button"
                      onClick={() => handleNudge(idx, 0, 1)}
                      title={`Nudge ${key} right 1px`}
                      aria-label={`Nudge ${key} right 1px`}
                    >
                      +1
                    </button>
                  </div>
                </div>

                <div className={styles.inputGroup}>
                  <label htmlFor={`corner-${key}-y`}>Y:</label>
                  <input
                    id={`corner-${key}-y`}
                    type="number"
                    min={0}
                    max={imageHeight}
                    value={y}
                    onChange={(e) =>
                      handleCoordinateChange(idx, 1, parseInt(e.target.value, 10))
                    }
                    className={styles.numberInput}
                    data-testid={`corner-${key}-y`}
                  />
                  <div className={styles.nudgeButtons}>
                    <button
                      type="button"
                      onClick={() => handleNudge(idx, 1, -1)}
                      title={`Nudge ${key} up 1px`}
                      aria-label={`Nudge ${key} up 1px`}
                    >
                      -1
                    </button>
                    <button
                      type="button"
                      onClick={() => handleNudge(idx, 1, 1)}
                      title={`Nudge ${key} down 1px`}
                      aria-label={`Nudge ${key} down 1px`}
                    >
                      +1
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.cornerActionRow}>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!isValid || !attested}
          className={styles.confirmCornerButton}
          data-testid="confirm-paper-button"
        >
          {isConfirmed ? "Update Paper Confirmation" : "Confirm Paper Corners & Proceed"}
        </button>
        {!attested && (
          <span className={styles.attestationRequiredNote}>
            * US Letter attestation required above before confirmation.
          </span>
        )}
      </div>
    </section>
  );
}

