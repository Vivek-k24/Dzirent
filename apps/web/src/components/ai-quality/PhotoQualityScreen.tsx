"use client";

import React, { useEffect, useState } from "react";
import type {
  PreliminaryAnalysis,
  QualityApiError,
  QualityCheckResponse,
} from "@/lib/ai-quality/types";
import {
  analyzeImageFile,
  validateImageFile,
} from "@/lib/ai-quality/preliminary";
import { checkPhotoQuality } from "@/lib/ai-quality/client";
import { NoticeBanner } from "./NoticeBanner";
import { PhotoDropzone } from "./PhotoDropzone";
import { PreliminaryBadge } from "./PreliminaryBadge";
import { ServerResultView } from "./ServerResultView";
import { RetakeGuidance } from "./RetakeGuidance";
import styles from "./ai-quality.module.css";

type ScreenState =
  | "idle"
  | "analyzing-local"
  | "preliminary-ready"
  | "submitting"
  | "completed"
  | "error";

export function PhotoQualityScreen() {
  const [state, setState] = useState<ScreenState>("idle");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [preliminary, setPreliminary] = useState<PreliminaryAnalysis | null>(null);
  const [serverResult, setServerResult] = useState<QualityCheckResponse | null>(null);
  const [error, setError] = useState<QualityApiError | null>(null);

  // Clean up Object URL on unmount or reset
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleReset = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setPreliminary(null);
    setServerResult(null);
    setError(null);
    setState("idle");
  };

  const handleFileSelected = async (file: File) => {
    setError(null);
    setServerResult(null);

    // Initial pre-check
    const validation = validateImageFile(file);
    if (!validation.ok) {
      setError(validation.error);
      setState("error");
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setSelectedFile(file);
    setPreviewUrl(objectUrl);
    setState("analyzing-local");

    try {
      const analysis = await analyzeImageFile(file);
      setPreliminary(analysis);
      setState("preliminary-ready");
    } catch (err: unknown) {
      const apiErr = (err as QualityApiError)?.code
        ? (err as QualityApiError)
        : ({
            code: "invalid_image",
            message: "Failed to analyze photo locally. Ensure the file is not corrupted.",
          } satisfies QualityApiError);
      setError(apiErr);
      setState("error");
    }
  };

  const handleVerifyWithServer = async () => {
    if (!selectedFile) return;

    setState("submitting");
    setError(null);

    try {
      const response = await checkPhotoQuality(selectedFile);
      setServerResult(response);
      setState("completed");
    } catch (err: unknown) {
      const apiErr = (err as QualityApiError)?.code
        ? (err as QualityApiError)
        : ({
            code: "service_unavailable",
            message: "An unexpected error occurred while communicating with the service.",
          } satisfies QualityApiError);
      setError(apiErr);
      setState("error");
    }
  };

  return (
    <main className={styles.container} id="main-content">
      <header className={styles.header}>
        <h1 className={styles.title}>Overhead Photo Quality Screening</h1>
        <p className={styles.subtitle}>
          Fast blur, lighting, reference paper, and garment framing inspection for lenders.
        </p>
      </header>

      <NoticeBanner />

      {/* Error display when no file is selected yet (e.g. initial validation failure) */}
      {state === "error" && error && !selectedFile && (
        <div className={styles.errorAlert} role="alert" data-testid="error-alert">
          <div className={styles.errorHeader}>
            <strong>Error ({error.code}):</strong>
            {error.status && <span className={styles.statusCode}>HTTP {error.status}</span>}
          </div>
          <p className={styles.errorMessage}>{error.message}</p>
          <div className={styles.errorActions}>
            <button
              type="button"
              className={styles.resetButton}
              onClick={handleReset}
            >
              Choose different file
            </button>
          </div>
        </div>
      )}

      {/* Upload area (visible when idle or error) */}
      {(state === "idle" || (state === "error" && !selectedFile)) && (
        <section className={styles.uploadSection}>
          <PhotoDropzone onFileSelected={handleFileSelected} />
          <RetakeGuidance />
        </section>
      )}

      {/* Processing indicator for preliminary browser analysis */}
      {state === "analyzing-local" && (
        <div className={styles.loadingBox} role="status" aria-live="polite" data-testid="local-analyzing">
          <div className={styles.spinner} aria-hidden="true" />
          <p>
            <strong>Analyzing photo in browser…</strong>
          </p>
          <span className={styles.loadingDetail}>
            Computing preliminary sharpness and lighting checks locally.
          </span>
        </div>
      )}

      {/* Preview and Results section */}
      {selectedFile && previewUrl && state !== "idle" && (
        <div className={styles.activeWorkflowGrid}>
          {/* Left column: Image preview */}
          <section className={styles.imageColumn} aria-label="Photo preview">
            <div className={styles.previewCard}>
              <img
                src={previewUrl}
                alt="Selected overhead garment preview"
                className={styles.previewImage}
                data-testid="preview-image"
              />
              <div className={styles.previewMeta}>
                <span>{selectedFile.name}</span>
                <span>{(selectedFile.size / (1024 * 1024)).toFixed(2)} MiB</span>
              </div>
            </div>

            <div className={styles.actionRow}>
              <button
                type="button"
                className={styles.resetButton}
                onClick={handleReset}
                disabled={state === "submitting" || state === "analyzing-local"}
                data-testid="reset-button"
              >
                Choose another photo
              </button>

              {state === "preliminary-ready" && (
                <button
                  type="button"
                  className={styles.verifyButton}
                  onClick={handleVerifyWithServer}
                  data-testid="verify-server-button"
                >
                  Verify with server
                </button>
              )}
            </div>
          </section>

          {/* Right column: Results and guidance */}
          <section className={styles.resultsColumn} aria-label="Screening results">
            {/* Preliminary feedback (visible once calculated) */}
            {preliminary && <PreliminaryBadge analysis={preliminary} />}

            {/* Server processing indicator */}
            {state === "submitting" && (
              <div
                className={styles.loadingBox}
                role="status"
                aria-live="polite"
                data-testid="server-submitting"
              >
                <div className={styles.spinner} aria-hidden="true" />
                <p>
                  <strong>Verifying with photo quality service…</strong>
                </p>
                <span className={styles.loadingDetail}>
                  Performing paper corner verification and framing inspection.
                </span>
              </div>
            )}

            {/* Error display */}
            {state === "error" && error && (
              <div
                className={styles.errorAlert}
                role="alert"
                data-testid="error-alert"
              >
                <div className={styles.errorHeader}>
                  <strong>Error ({error.code}):</strong>
                  {error.status && <span className={styles.statusCode}>HTTP {error.status}</span>}
                </div>
                <p className={styles.errorMessage}>{error.message}</p>
                <div className={styles.errorActions}>
                  <button
                    type="button"
                    className={styles.retryButton}
                    onClick={handleVerifyWithServer}
                    data-testid="retry-button"
                  >
                    Retry server check
                  </button>
                  <button
                    type="button"
                    className={styles.resetButton}
                    onClick={handleReset}
                  >
                    Choose different file
                  </button>
                </div>
              </div>
            )}

            {/* Real server result */}
            {state === "completed" && serverResult && (
              <>
                <ServerResultView result={serverResult} />
                <RetakeGuidance checks={serverResult.checks} isPreliminary={false} />
              </>
            )}

            {/* Guide when preliminary ready */}
            {state === "preliminary-ready" && preliminary && (
              <RetakeGuidance checks={preliminary} isPreliminary={true} />
            )}
          </section>
        </div>
      )}
    </main>
  );
}

