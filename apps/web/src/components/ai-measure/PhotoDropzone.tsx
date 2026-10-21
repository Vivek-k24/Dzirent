"use client";

import React, { useRef, useState } from "react";
import { validateMeasureImageFile } from "@/lib/ai-measure/preliminary";
import type { MeasureApiError } from "@/lib/ai-measure/types";
import styles from "./ai-measure.module.css";

interface PhotoDropzoneProps {
  onPhotoSelected: (
    file: File,
    objectUrl: string,
    width: number,
    height: number,
  ) => void;
  disabled?: boolean;
}

export function PhotoDropzone({
  onPhotoSelected,
  disabled = false,
}: PhotoDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<MeasureApiError | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = (file: File | undefined | null) => {
    setError(null);
    if (!file) return;

    const validation = validateMeasureImageFile(file);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      onPhotoSelected(file, objectUrl, img.naturalWidth, img.naturalHeight);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setError({
        code: "unsupported_media_type",
        message:
          "Failed to decode image data. Please ensure the file is an undamaged JPEG or PNG.",
        status: 415,
      });
    };

    img.src = objectUrl;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    processFile(file);
    // Reset file input so selecting the same file again triggers change
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled) return;

    const file = e.dataTransfer.files?.[0];
    processFile(file);
  };

  const handleClickBrowse = () => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className={styles.dropzoneContainer} data-testid="photo-dropzone">
      <div
        className={`${styles.dropzone} ${isDragging ? styles.dropzoneActive : ""} ${
          disabled ? styles.dropzoneDisabled : ""
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClickBrowse}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !disabled) {
            e.preventDefault();
            handleClickBrowse();
          }
        }}
        aria-label="Upload garment photo with US Letter paper"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png"
          capture="environment"
          onChange={handleFileChange}
          disabled={disabled}
          className={styles.hiddenFileInput}
          data-testid="garment-photo-input"
          aria-hidden="true"
          tabIndex={-1}
        />

        <div className={styles.dropzoneIcon} aria-hidden="true">
          📷
        </div>
        <p className={styles.dropzonePrompt}>
          <strong>Click to select</strong> or drag and drop an overhead photo
        </p>
        <p className={styles.dropzoneFormatInfo}>
          JPEG or PNG format · Max 10 MiB · Camera or file browse
        </p>
        <p className={styles.dropzoneRequirements}>
          Must show flat-laid sleeved garment with white US Letter sheet beside it
        </p>
      </div>

      {error && (
        <div
          className={styles.errorMessage}
          role="alert"
          data-testid="upload-error-alert"
        >
          <strong>Upload Error:</strong> {error.message}
        </div>
      )}
    </div>
  );
}

