import React from "react";
import styles from "./ai-quality.module.css";

export function NoticeBanner() {
  return (
    <aside
      className={styles.noticeBanner}
      role="note"
      aria-label="Tool disclaimer"
      data-testid="ai-quality-notice"
    >
      <div className={styles.noticeTag}>TEST PROTOTYPE · LOCAL EVALUATION</div>
      <p className={styles.noticeText}>
        <strong>Garment Photo Quality Screening (AI-QUALITY-1)</strong>: Evaluates overhead photo sharpness,
        lighting, US Letter reference paper placement, and garment framing.
      </p>
      <p className={styles.noticeSubtext}>
        This tool does <em>not</em> compute garment dimensions or evaluate fabric condition. Uploads are processed
        locally and in-memory; no images are permanently stored.
      </p>
    </aside>
  );
}

