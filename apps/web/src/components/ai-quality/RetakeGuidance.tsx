import React from "react";
import type { QualityChecks } from "@/lib/ai-quality/types";
import styles from "./ai-quality.module.css";

interface RetakeGuidanceProps {
  checks?: Partial<QualityChecks>;
  isPreliminary?: boolean;
}

export function RetakeGuidance({ checks, isPreliminary }: RetakeGuidanceProps) {
  const blurIssue = checks?.blur?.status === "fail" || checks?.blur?.status === "uncertain";
  const exposureIssue = checks?.exposure?.status === "fail" || checks?.exposure?.status === "uncertain";
  const paperIssue = checks?.paper?.status === "fail" || checks?.paper?.status === "uncertain";
  const framingIssue = checks?.framing?.status === "fail" || checks?.framing?.status === "uncertain";

  const hasSpecificIssues = blurIssue || exposureIssue || paperIssue || framingIssue;

  return (
    <section className={styles.retakeCard} aria-labelledby="retake-instructions-title" data-testid="retake-guidance">
      <h3 id="retake-instructions-title" className={styles.retakeTitle}>
        Photo Capture & Retake Guide
      </h3>
      <p className={styles.retakeIntro}>
        To qualify an overhead photo for automated listing review, adhere to the standard reference-photo capture rules:
      </p>

      {hasSpecificIssues && (
        <div className={styles.targetedAdvice} role="region" aria-label="Targeted advice">
          <h4 className={styles.targetedHeader}>Targeted Fixes for Your Photo:</h4>
          <ul className={styles.targetedList}>
            {blurIssue && (
              <li>
                <strong>Reduce Blur:</strong> Hold your device steady with both hands, rest your elbows on a surface, or
                tap the screen to refocus on the fabric before taking the shot.
              </li>
            )}
            {exposureIssue && (
              <li>
                <strong>Improve Lighting:</strong> Turn on overhead room lights or move near indirect daylight. Avoid
                casting hand/phone shadows over the garment, and avoid direct flash glare.
              </li>
            )}
            {paperIssue && !isPreliminary && (
              <li>
                <strong>Reference Paper Setup:</strong> Place an unmarked sheet of white US Letter printer paper (8.5 × 11 in)
                flat next to the garment. Keep all four corners completely visible and unobstructed.
              </li>
            )}
            {framingIssue && !isPreliminary && (
              <li>
                <strong>Fit Full Garment in Frame:</strong> Step back or raise your camera higher so the entire garment
                (sleeves, collar, hem) plus the reference paper are clearly within the photo margins.
              </li>
            )}
          </ul>
        </div>
      )}

      <div className={styles.guidelineGrid}>
        <div className={styles.guidelineStep}>
          <span className={styles.stepNum}>1</span>
          <div>
            <strong>US Letter Paper Reference</strong>
            <p>Use clean white 8.5 × 11 in (21.59 × 27.94 cm) paper. Lay flat in portrait orientation next to the garment.</p>
          </div>
        </div>

        <div className={styles.guidelineStep}>
          <span className={styles.stepNum}>2</span>
          <div>
            <strong>Direct Overhead Angle</strong>
            <p>Hold the camera parallel to the floor (90° overhead angle) to prevent perspective distortion.</p>
          </div>
        </div>

        <div className={styles.guidelineStep}>
          <span className={styles.stepNum}>3</span>
          <div>
            <strong>Complete Framing</strong>
            <p>All four paper corners and all garment edges must be completely visible without cropping.</p>
          </div>
        </div>

        <div className={styles.guidelineStep}>
          <span className={styles.stepNum}>4</span>
          <div>
            <strong>Diffused, Even Light</strong>
            <p>Bright, uniform lighting without dark body shadows, harsh direct glare, or deep folds.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

