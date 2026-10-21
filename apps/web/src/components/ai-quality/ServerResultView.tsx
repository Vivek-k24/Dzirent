import React from "react";
import type { QualityCheckResponse } from "@/lib/ai-quality/types";
import styles from "./ai-quality.module.css";

interface ServerResultViewProps {
  result: QualityCheckResponse;
}

export function ServerResultView({ result }: ServerResultViewProps) {
  const { decision, checks, message, request_id, algorithm_version } = result;

  const decisionDisplay = () => {
    switch (decision) {
      case "pass":
        return {
          title: "PASS — Ready for Listing",
          description: "All automated quality checks passed successfully.",
          className: styles.decisionPass,
        };
      case "retake":
        return {
          title: "RETAKE NEEDED — Quality Standard Not Met",
          description: "One or more quality checks failed. Follow the retake guide below to capture an acceptable photo.",
          className: styles.decisionRetake,
        };
      case "review":
        return {
          title: "MANUAL REVIEW REQUIRED — Inconclusive Automated Checks",
          description: "Automated analysis was unable to verify reference paper or garment boundary with confidence.",
          className: styles.decisionReview,
        };
    }
  };

  const statusBadge = (status: "pass" | "fail" | "uncertain") => {
    switch (status) {
      case "pass":
        return <span className={`${styles.statusBadge} ${styles.badgePass}`}>Pass</span>;
      case "fail":
        return <span className={`${styles.statusBadge} ${styles.badgeFail}`}>Fail</span>;
      case "uncertain":
        return <span className={`${styles.statusBadge} ${styles.badgeUncertain}`}>Uncertain</span>;
    }
  };

  const activeDisplay = decisionDisplay();

  return (
    <section className={styles.serverResultCard} aria-labelledby="server-result-title" data-testid="server-result">
      <div className={`${styles.decisionBanner} ${activeDisplay.className}`} data-testid="decision-banner">
        <h3 id="server-result-title" className={styles.decisionTitle}>
          {activeDisplay.title}
        </h3>
        <p className={styles.decisionDesc}>{activeDisplay.description}</p>
      </div>

      <div className={styles.checksGrid}>
        <div className={styles.checkRow} data-testid="check-blur">
          <div className={styles.checkHeader}>
            <strong>Sharpness & Blur</strong>
            {statusBadge(checks.blur.status)}
          </div>
          <p className={styles.checkReason}>Reason: <code>{checks.blur.reason}</code></p>
        </div>

        <div className={styles.checkRow} data-testid="check-exposure">
          <div className={styles.checkHeader}>
            <strong>Lighting & Exposure</strong>
            {statusBadge(checks.exposure.status)}
          </div>
          <p className={styles.checkReason}>Reason: <code>{checks.exposure.reason}</code></p>
        </div>

        <div className={styles.checkRow} data-testid="check-paper">
          <div className={styles.checkHeader}>
            <strong>US Letter Reference Paper</strong>
            {statusBadge(checks.paper.status)}
          </div>
          <p className={styles.checkReason}>Reason: <code>{checks.paper.reason}</code></p>
        </div>

        <div className={styles.checkRow} data-testid="check-framing">
          <div className={styles.checkHeader}>
            <strong>Full Garment Framing</strong>
            {statusBadge(checks.framing.status)}
          </div>
          <p className={styles.checkReason}>Reason: <code>{checks.framing.reason}</code></p>
        </div>
      </div>

      {message && (
        <div className={styles.serverMessage} data-testid="server-message">
          <strong>Server Note: </strong>
          <span>{message}</span>
        </div>
      )}

      <footer className={styles.serverMeta}>
        <span>Request ID: <code>{request_id}</code></span>
        <span>Algorithm: <code>{algorithm_version}</code></span>
      </footer>
    </section>
  );
}

