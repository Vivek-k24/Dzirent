"use client";

import React, { useRef, useState } from "react";
import styles from "./ai-quality.module.css";

interface PhotoDropzoneProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

export function PhotoDropzone({ onFileSelected, disabled }: PhotoDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (disabled) return;
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.target.files && e.target.files.length > 0) {
      onFileSelected(e.target.files[0]);
    }
  };

  return (
    <div
      className={`${styles.dropzone} ${isDragging ? styles.dropzoneActive : ""} ${disabled ? styles.dropzoneDisabled : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      role="region"
      aria-label="Photo upload area"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={e => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      data-testid="photo-dropzone"
    >
      <input
        ref={inputRef}
        type="file"
        id="photo-input"
        name="image"
        accept="image/jpeg,image/png"
        capture="environment"
        className={styles.hiddenInput}
        onChange={handleChange}
        disabled={disabled}
        aria-describedby="dropzone-hint"
        data-testid="photo-input"
      />

      <div className={styles.dropzoneContent}>
        <div className={styles.dropzoneIcon} aria-hidden="true">
          📷
        </div>
        <p className={styles.dropzoneHeading}>
          <strong>Upload overhead garment photo</strong> or take a photo with your device
        </p>
        <p id="dropzone-hint" className={styles.dropzoneSub}>
          Click or drag & drop. Supported: <strong>JPEG, PNG</strong> (max 10 MiB).
        </p>
        <button
          type="button"
          className={styles.pickButton}
          disabled={disabled}
          onClick={e => {
            e.stopPropagation();
            inputRef.current?.click();
          }}
          data-testid="pick-button"
        >
          Choose photo file
        </button>
      </div>
    </div>
  );
}

