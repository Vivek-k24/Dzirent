import React from "react";
import type { PreliminaryAnalysis } from "@/lib/ai-quality/types";
import styles from "./ai-quality.module.css";

interface PreliminaryBadgeProps {
  analysis: PreliminaryAnalysis;
}

export function PreliminaryBadge({ analysis }: PreliminaryBadgeProps) {
  const { blur, exposure, decision } = analysis;

  const statusLabel = (status: "pass" | "fail" | "uncertain") => {
    switch (status) {
      case "pass":
        return "Pass";
      case "fail":
        return "Fail";
      case "uncertain":
        return "Uncertain";
    }
  };

  const statusClass = (status: "pass" | "fail" | "uncertain") => {
    switch (status) {
      case "pass":
        return styles.badgePass;
      case "fail":
        return styles.badgeFail;
      case "uncertain":
        return styles.badgeUncertain;
    }
  };

  return (
    <section
      className={styles.preliminaryCard}
      aria-labelledby="preliminary-title"
      data-testid="preliminary-badge"
    >
      <div className={styles.preliminaryHeader}>
        <span className={styles.preliminaryLabel} data-testid="preliminary-label">
          PRELIMINARY BROWSER ESTIMATE
        </span>
        <span className={styles.preliminaryDisclaimer}>
          Instant client-side feedback · Subject to backend verification
        </span>
      </div>

      <div className={styles.preliminaryGrid}>
        <div className={styles.preliminaryItem}>
          <span className={styles.checkName}>Sharpness</span>
          <span className={`${styles.statusBadge} ${statusClass(blur.status)}`} data-testid="preliminary-blur">
            {statusLabel(blur.status)}
          </span>
          <span className={styles.checkDetail}>
            {blur.reason === "sharp" && "Edges appear sharp and clear."}
            {blur.reason === "blurry" && "Image appears blurry. Hold camera steady."}
            {blur.reason === "borderline_sharpness" && "Borderline sharpness. Server check advised."}
          </span>
        </div>

        <div className={styles.preliminaryItem}>
          <span className={styles.checkName}>Lighting</span>
          <span className={`${styles.statusBadge} ${statusClass(exposure.status)}`} data-testid="preliminary-exposure">
            {statusLabel(exposure.status)}
          </span>
          <span className={styles.checkDetail}>
            {exposure.reason === "acceptable_light" && "Exposure is even and balanced."}
            {exposure.reason === "too_dark" && "Image is too dark. Increase room lighting."}
            {exposure.reason === "too_bright" && "Image is overexposed or has harsh glare."}
            {exposure.reason === "borderline_exposure" && "High contrast or borderline lighting."}
          </span>
        </div>

        <div className={styles.preliminaryItem}>
          <span className={styles.checkName}>Reference Paper</span>
          <span className={`${styles.statusBadge} ${styles.badgeUncertain}`}>
            Requires Server
          </span>
          <span className={styles.checkDetail}>
            US Letter corner detection runs during server check.
          </span>
        </div>

        <div className={styles.preliminaryItem}>
          <span className={styles.checkName}>Garment Framing</span>
          <span className={`${styles.statusBadge} ${styles.badgeUncertain}`}>
            Requires Server
          </span>
          <span className={styles.checkDetail}>
            Full garment boundary checked during server analysis.
          </span>
        </div>
      </div>

      <div className={styles.preliminarySummary}>
        <strong>Preliminary Outcome: </strong>
        {decision === "retake" ? (
          <span className={styles.textAlert} data-testid="preliminary-decision">
            Retake Recommended (poor sharpness or lighting detected)
          </span>
        ) : (
          <span className={styles.textInfo} data-testid="preliminary-decision">
            Review Needed (proceed with server verification for reference paper and framing)
          </span>
        )}
      </div>
    </section>
  );
}

