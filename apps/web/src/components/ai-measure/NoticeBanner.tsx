"use client";

import React from "react";
import styles from "./ai-measure.module.css";

export function NoticeBanner() {
  return (
    <aside
      className={styles.noticeBanner}
      role="note"
      aria-label="Measurement prototype disclaimer"
      data-testid="ai-measure-notice"
    >
      <div className={styles.noticeTag}>TEST PROTOTYPE · LOCAL EVALUATION</div>
      <p className={styles.noticeTitle}>
        <strong>Garment Landmark & Geometry Measurement (AI-MEASURE-1)</strong>
      </p>
      <p className={styles.noticeText}>
        Derives estimated centimeter distances from human-verified landmarks using planar homography
        from a confirmed US Letter reference sheet.
      </p>
      <p className={styles.noticeSubtext}>
        This tool does <em>not</em> measure body circumference, does <em>not</em> guarantee fit, and
        does <em>not</em> persist measurements to catalog listings. All numbers are estimates
        subject to fabric stretch, wrinkling, and lender placement precision.
      </p>
    </aside>
  );
}

