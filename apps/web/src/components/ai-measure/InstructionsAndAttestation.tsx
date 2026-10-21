"use client";

import React from "react";
import styles from "./ai-measure.module.css";

interface InstructionsAndAttestationProps {
  attested: boolean;
  onAttestationChange: (attested: boolean) => void;
  disabled?: boolean;
}

export function InstructionsAndAttestation({
  attested,
  onAttestationChange,
  disabled,
}: InstructionsAndAttestationProps) {
  return (
    <section
      className={styles.instructionsCard}
      aria-labelledby="capture-instructions-title"
      data-testid="instructions-section"
    >
      <h3 id="capture-instructions-title" className={styles.sectionHeading}>
        1. Reference Paper Capture Standards
      </h3>
      <ol className={styles.rulesList}>
        <li>
          <strong>White US Letter Paper:</strong> Use one standard 8.5 × 11 in (21.59 × 27.94 cm)
          unmarked printer paper sheet.
        </li>
        <li>
          <strong>Same Planar Surface:</strong> Place the paper flat beside the garment on the same
          level surface (not on top of or under the fabric).
        </li>
        <li>
          <strong>Portrait Orientation:</strong> The long 11-inch side should be roughly parallel to
          the garment length.
        </li>
        <li>
          <strong>90° Overhead Angle:</strong> Hold the camera straight overhead to minimize tilt and
          perspective skew.
        </li>
      </ol>

      <div className={styles.attestationBox}>
        <label className={styles.attestationLabel} htmlFor="us-letter-attestation">
          <input
            id="us-letter-attestation"
            type="checkbox"
            checked={attested}
            onChange={(e) => onAttestationChange(e.target.checked)}
            disabled={disabled}
            className={styles.checkboxInput}
            data-testid="us-letter-attestation"
          />
          <span>
            <strong>I attest that this photo contains an unmarked US Letter sheet</strong> (8.5 × 11 in
            / 21.59 × 27.94 cm) resting flat on the same surface beside the garment.
          </span>
        </label>
        <p className={styles.attestationNote}>
          Physical paper dimensions cannot be proven from photo pixels alone; geometry homography
          strictly requires lender attestation.
        </p>
      </div>
    </section>
  );
}

