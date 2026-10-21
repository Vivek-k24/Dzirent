"use client";

import React, { useState } from "react";
import { LANDMARK_DEFINITIONS } from "@/lib/ai-measure/constants";
import type {
  GarmentMeasureResponse,
  MeasurementKey,
} from "@/lib/ai-measure/types";
import styles from "./ai-measure.module.css";

interface MeasurementResultsViewProps {
  results: GarmentMeasureResponse;
  onAdjustLandmarks: () => void;
  onReset: () => void;
}

export function MeasurementResultsView({
  results,
  onAdjustLandmarks,
  onReset,
}: MeasurementResultsViewProps) {
  const [confirmedKeys, setConfirmedKeys] = useState<Record<string, boolean>>({});

  const toggleConfirmKey = (key: string) => {
    setConfirmedKeys((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "valid":
        return <span className={styles.calibrationValid}>Calibration: Valid</span>;
      case "uncertain":
        return <span className={styles.calibrationUncertain}>Calibration: Uncertain</span>;
      default:
        return <span className={styles.calibrationInvalid}>Calibration: Invalid</span>;
    }
  };

  return (
    <section
      className={styles.resultsCard}
      aria-labelledby="results-heading"
      data-testid="measurement-results"
    >
      <div className={styles.resultsHeader}>
        <div>
          <h3 id="results-heading" className={styles.sectionHeading}>
            Garment Dimension Estimates
          </h3>
          <p className={styles.resultsMeta}>
            Algorithm: <code>{results.algorithm_version}</code> · Request ID:{" "}
            <code>{results.request_id}</code>
          </p>
        </div>
        <div data-testid="calibration-status">
          {getStatusBadge(results.calibration_status)}
        </div>
      </div>

      <div className={styles.resultsList}>
        {Object.entries(results.measurements).map(([key, item]) => {
          const def = LANDMARK_DEFINITIONS[key as MeasurementKey];
          const isConfirmed = !!confirmedKeys[key];
          const isMeasurable = item.status === "estimated" && item.value_cm != null;

          return (
            <div
              key={key}
              className={styles.resultItemCard}
              data-testid={`result-item-${key}`}
            >
              <div className={styles.resultItemMain}>
                <div className={styles.resultItemHeader}>
                  <span
                    className={styles.colorIndicator}
                    style={{ backgroundColor: def?.color || "#6b7280" }}
                    aria-hidden="true"
                  />
                  <h4 className={styles.resultItemTitle}>{def?.label || key}</h4>
                  <span
                    className={
                      isMeasurable
                        ? styles.estimateBadge
                        : styles.notMeasurableBadge
                    }
                    data-testid={`badge-${key}`}
                  >
                    {isMeasurable ? "Estimated" : "Not Measurable"}
                  </span>
                </div>

                <div className={styles.resultItemValue}>
                  {isMeasurable ? (
                    <div className={styles.cmDisplay}>
                      <span className={styles.cmNumber} data-testid={`value-${key}`}>
                        ~ {item.value_cm?.toFixed(1)} cm
                      </span>
                      <span className={styles.cmSubtext}>(Planar estimate)</span>
                    </div>
                  ) : (
                    <div className={styles.unmeasurableDisplay} data-testid={`reason-${key}`}>
                      <strong>Not Measurable:</strong> {item.reason || "Seams not identifiable"}
                    </div>
                  )}
                </div>
              </div>

              {isMeasurable && (
                <div className={styles.confirmationRow}>
                  <label
                    htmlFor={`confirm-check-${key}`}
                    className={styles.confirmCheckboxLabel}
                  >
                    <input
                      id={`confirm-check-${key}`}
                      type="checkbox"
                      checked={isConfirmed}
                      onChange={() => toggleConfirmKey(key)}
                      data-testid={`confirm-check-${key}`}
                    />
                    <span>
                      {isConfirmed
                        ? "✓ Confirmed by lender for this session"
                        : "Review and confirm this measurement"}
                    </span>
                  </label>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className={styles.cautionsSection} role="region" aria-label="Measurement cautions">
        <h4 className={styles.cautionsHeading}>Cautions & Geometric Limitations:</h4>
        <ul className={styles.cautionsList}>
          {results.cautions?.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
          <li>
            Values are flat-laid planar estimates. <strong>Never</strong> treat flat chest as body
            circumference.
          </li>
          <li>
            Measurements are strictly local to this test session; no data is written to the catalog
            database or public fit badges.
          </li>
        </ul>
      </div>

      <div className={styles.actionRow}>
        <button
          type="button"
          onClick={onAdjustLandmarks}
          className={styles.primaryButton}
          data-testid="adjust-landmarks-button"
        >
          Adjust Seam Landmarks & Recalculate
        </button>
        <button
          type="button"
          onClick={onReset}
          className={styles.secondaryButton}
          data-testid="reset-button"
        >
          Choose Another Photo
        </button>
      </div>
    </section>
  );
}

