"use client";

import React, { useEffect, useRef, useState } from "react";
import { isValidQuadrilateral } from "@/lib/ai-measure/coordinates";
import { requestPaperSnap, type PaperSnapResponse } from "@/lib/ai-measure/paper-calibrate";
import { submitGarmentMeasurement } from "@/lib/ai-measure/client";
import {
  proposeDefaultLandmarks,
  proposeDefaultPaperCorners,
} from "@/lib/ai-measure/preliminary";
import type {
  GarmentMeasureResponse,
  LandmarkAnnotation,
  MeasureAnnotationPayload,
  MeasureApiError,
  MeasurementKey,
  Point2D,
} from "@/lib/ai-measure/types";
import { ImageMeasurementOverlay } from "./ImageMeasurementOverlay";
import { InstructionsAndAttestation } from "./InstructionsAndAttestation";
import { LandmarkEditor } from "./LandmarkEditor";
import { MeasurementResultsView } from "./MeasurementResultsView";
import { NoticeBanner } from "./NoticeBanner";
import { PaperCornerEditor } from "./PaperCornerEditor";
import { PhotoDropzone } from "./PhotoDropzone";
import styles from "./ai-measure.module.css";

type FlowStep = "upload" | "paper" | "landmarks" | "results";

export function GarmentMeasureScreen() {
  const [activeStep, setActiveStep] = useState<FlowStep>("upload");

  // Image state
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [intrinsicWidth, setIntrinsicWidth] = useState<number>(0);
  const [intrinsicHeight, setIntrinsicHeight] = useState<number>(0);

  // Attestation & paper corners
  const [attested, setAttested] = useState<boolean>(false);
  const [paperCorners, setPaperCorners] = useState<
    [Point2D, Point2D, Point2D, Point2D]
  >([
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
  ]);
  const [paperConfirmed, setPaperConfirmed] = useState<boolean>(false);
  // A returned proposal is provisional until the lender explicitly applies AND confirms it.
  const [paperProposal, setPaperProposal] = useState<PaperSnapResponse | null>(null);
  const [paperSnapError, setPaperSnapError] = useState<string | null>(null);
  const [paperSnapLoading, setPaperSnapLoading] = useState(false);
  const paperSnapGeneration = useRef(0);

  const handlePaperCornersChange = (next: [Point2D, Point2D, Point2D, Point2D]) => {
    paperSnapGeneration.current += 1; // ignore any stale in-flight proposals
    setPaperCorners(next);
    setPaperConfirmed(false);
    setPaperProposal(null);
    setPaperSnapError(null);
    setPaperSnapLoading(false);
    setResults(null);
    setReviewedLandmarks({});
  };

  const handleCalibratePaper = async () => {
    if (!photoFile || !isValidQuadrilateral(paperCorners) || paperSnapLoading) return;
    const requestGeneration = ++paperSnapGeneration.current;
    setPaperSnapLoading(true);
    setPaperSnapError(null);
    setPaperProposal(null);
    const originalCorners = paperCorners.map(point => [...point]) as [Point2D, Point2D, Point2D, Point2D];
    try {
      const proposal = await requestPaperSnap(photoFile, originalCorners);
      if (requestGeneration !== paperSnapGeneration.current) return;
      if (proposal.proposed_corners_px?.some(([x,y]) =>
            x < 0 || y < 0 || x > intrinsicWidth || y > intrinsicHeight)) {
        throw new Error("Proposed coordinates are outside the uploaded photo.");
      }
      setPaperProposal(proposal);
    } catch (error) {
      if (requestGeneration !== paperSnapGeneration.current) return;
      setPaperSnapError(error instanceof Error ? error.message : "Paper calibration was unavailable.");
    } finally {
      if (requestGeneration === paperSnapGeneration.current) setPaperSnapLoading(false);
    }
  };

  const handleApplyPaperProposal = () => {
    if (!paperProposal || paperProposal.detection_status !== "snapped" ||
        paperProposal.calibration_status === "invalid" || !paperProposal.proposed_corners_px) return;
    // Keep the existing manual confirmation step: a snap is not a paper-size attestation.
    handlePaperCornersChange(paperProposal.proposed_corners_px);
  };

  // Landmark annotations
  const [landmarks, setLandmarks] = useState<
    Record<MeasurementKey, LandmarkAnnotation>
  >({
    shoulder_width_cm: {
      key: "shoulder_width_cm",
      geometry: "line",
      points_px: [
        [0, 0],
        [0, 0],
      ],
      not_measurable: false,
    },
    chest_flat_cm: {
      key: "chest_flat_cm",
      geometry: "line",
      points_px: [
        [0, 0],
        [0, 0],
      ],
      not_measurable: false,
    },
    body_length_cm: {
      key: "body_length_cm",
      geometry: "line",
      points_px: [
        [0, 0],
        [0, 0],
      ],
      not_measurable: false,
    },
    sleeve_length_cm: {
      key: "sleeve_length_cm",
      geometry: "polyline",
      points_px: [
        [0, 0],
        [0, 0],
        [0, 0],
      ],
      not_measurable: false,
    },
  });

  // Submission & Results
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [apiError, setApiError] = useState<MeasureApiError | null>(null);
  const [results, setResults] = useState<GarmentMeasureResponse | null>(null);
  const [reviewedLandmarks, setReviewedLandmarks] = useState<Partial<Record<MeasurementKey, boolean>>>({});

  // Invalidate any in-flight paper snap requests on unmount
  useEffect(() => {
    return () => {
      paperSnapGeneration.current += 1;
    };
  }, []);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handlePhotoSelected = (
    file: File,
    objectUrl: string,
    width: number,
    height: number,
  ) => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setPhotoFile(file);
    setPreviewUrl(objectUrl);
    setIntrinsicWidth(width);
    setIntrinsicHeight(height);
    paperSnapGeneration.current += 1;
    setPaperProposal(null);
    setPaperSnapError(null);
    setPaperSnapLoading(false);
    setAttested(false);
    setPaperConfirmed(false);
    setApiError(null);
    setResults(null);
    setReviewedLandmarks({});

    // Seed provisional corners and landmarks
    const defaultCorners = proposeDefaultPaperCorners(width, height);
    setPaperCorners(defaultCorners);

    const defaultLandmarks = proposeDefaultLandmarks(width, height);
    const landmarkMap: Record<MeasurementKey, LandmarkAnnotation> = {
      shoulder_width_cm: defaultLandmarks[0],
      chest_flat_cm: defaultLandmarks[1],
      body_length_cm: defaultLandmarks[2],
      sleeve_length_cm: defaultLandmarks[3],
    };
    setLandmarks(landmarkMap);

    setActiveStep("paper");
  };

  const handleReset = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPhotoFile(null);
    setPreviewUrl(null);
    setIntrinsicWidth(0);
    setIntrinsicHeight(0);
    paperSnapGeneration.current += 1;
    setPaperProposal(null);
    setPaperSnapError(null);
    setPaperSnapLoading(false);
    setAttested(false);
    setPaperConfirmed(false);
    setApiError(null);
    setResults(null);
    setReviewedLandmarks({});
    setActiveStep("upload");
  };

  const handleConfirmCorners = () => {
    if (!attested || !isValidQuadrilateral(paperCorners) || paperSnapLoading) return;
    paperSnapGeneration.current += 1;
    setPaperProposal(null);
    setPaperSnapError(null);
    setPaperConfirmed(true);
    setActiveStep("landmarks");
  };

  const handleCalculate = async () => {
    if (!photoFile) return;

    setIsSubmitting(true);
    setApiError(null);

    const payload: MeasureAnnotationPayload = {
      schema_version: "ai-measure.v0",
      garment_class: "sleeved_top",
      reference: {
        type: "us_letter",
        user_confirmed: attested && paperConfirmed,
        corners_px: paperCorners,
      },
      landmarks: Object.values(landmarks)
        .filter((lm) => !lm.not_measurable && reviewedLandmarks[lm.key] === true)
        .map((lm) => ({
          key: lm.key,
          geometry: lm.geometry,
          points_px: lm.points_px,
        })),
    };

    const res = await submitGarmentMeasurement({
      imageFile: photoFile,
      annotationPayload: payload,
    });

    setIsSubmitting(false);

    if (res.ok) {
      setResults(res.data);
      setActiveStep("results");
    } else {
      setApiError(res.error);
    }
  };

  return (
    <main className={styles.screenContainer} data-testid="garment-measure-screen">
      <header className={styles.screenHeader}>
        <h1 className={styles.screenTitle}>Garment Fit & Geometry Measurement</h1>
        <p className={styles.screenDescription}>
          Measure planar garment dimensions from an overhead photograph calibrated with a
          standard US Letter reference sheet.
        </p>
      </header>

      <NoticeBanner />

      {/* Step Progress Tracker */}
      <nav aria-label="Measurement steps" className={styles.stepIndicator}>
        <span
          className={`${styles.stepBadge} ${
            activeStep === "upload"
              ? styles.stepActive
              : photoFile
              ? styles.stepDone
              : ""
          }`}
          data-testid="step-badge-upload"
        >
          1. Photo Upload
        </span>
        <span
          className={`${styles.stepBadge} ${
            activeStep === "paper"
              ? styles.stepActive
              : paperConfirmed
              ? styles.stepDone
              : ""
          }`}
          data-testid="step-badge-paper"
        >
          2. Paper Reference
        </span>
        <span
          className={`${styles.stepBadge} ${
            activeStep === "landmarks"
              ? styles.stepActive
              : results
              ? styles.stepDone
              : ""
          }`}
          data-testid="step-badge-landmarks"
        >
          3. Garment Landmarks
        </span>
        <span
          className={`${styles.stepBadge} ${
            activeStep === "results" ? styles.stepActive : ""
          }`}
          data-testid="step-badge-results"
        >
          4. Results & Confirmation
        </span>
      </nav>

      {/* API Error Notification */}
      {apiError && (
        <div
          className={styles.apiErrorAlert}
          role="alert"
          data-testid="measure-api-error"
        >
          <div className={styles.apiErrorAlertHeader}>
            <strong>
              {apiError.status === 503
                ? "Measurement Service Offline (503)"
                : apiError.status === 413
                ? "Payload Too Large (413)"
                : apiError.status === 415
                ? "Unsupported File Format (415)"
                : "Calculation Error"}
            </strong>
            <button
              type="button"
              onClick={handleCalculate}
              className={styles.retryButton}
              data-testid="retry-calculate-button"
            >
              Retry
            </button>
          </div>
          <p style={{ margin: "0.25rem 0 0" }}>{apiError.message}</p>
        </div>
      )}

      {/* Step 1: Upload Dropzone */}
      {activeStep === "upload" && (
        <PhotoDropzone onPhotoSelected={handlePhotoSelected} />
      )}

      {/* Steps 2, 3, 4: Split Workspace Layout */}
      {activeStep !== "upload" && previewUrl && (
        <div className={styles.workspaceLayout}>
          {/* Left Column: Visual Image & SVG Overlay */}
          <div className={styles.imageColumn}>
            <div className={styles.imageActionBar}>
              <span>
                Original Image: {intrinsicWidth} × {intrinsicHeight} px
              </span>
              <button
                type="button"
                onClick={handleReset}
                className={styles.retakeButton}
                data-testid="retake-photo-button"
              >
                Choose Different Photo
              </button>
            </div>

            <ImageMeasurementOverlay
              previewUrl={previewUrl}
              intrinsicWidth={intrinsicWidth}
              intrinsicHeight={intrinsicHeight}
              corners={paperCorners}
              onChangeCorners={handlePaperCornersChange}
              landmarks={landmarks}
              onChangeLandmarks={setLandmarks}
              onInvalidateLandmark={key => setReviewedLandmarks(previous => ({ ...previous, [key]: false }))}
              activeStep={activeStep === "paper" ? "paper" : "landmarks"}
            />
          </div>

          {/* Right Column: Active Controls / Results */}
          <div className={styles.controlsColumn}>
            {activeStep === "paper" && (
              <>
                <InstructionsAndAttestation
                  attested={attested}
                  onAttestationChange={setAttested}
                />
                <PaperCornerEditor
                  corners={paperCorners}
                  onChangeCorners={handlePaperCornersChange}
                  isConfirmed={paperConfirmed}
                  onConfirm={handleConfirmCorners}
                  attested={attested}
                  imageWidth={intrinsicWidth}
                  imageHeight={intrinsicHeight}
                />
                <section className={styles.cornerEditorCard} aria-label="Paper detection helper"
                  data-testid="paper-snap-panel">
                  <h3 className={styles.sectionHeading}>Guided paper alignment</h3>
                  <p className={styles.editorHelpText}>
                    Move the translucent quadrilateral near your actual US Letter sheet. Detection
                    proposes corner positions; it does not prove the sheet is US Letter.
                  </p>
                  <div className={styles.cornerActionRow}>
                    <button type="button" className={styles.confirmCornerButton}
                      onClick={handleCalibratePaper}
                      disabled={!photoFile || !isValidQuadrilateral(paperCorners) || paperSnapLoading}
                      data-testid="calibrate-paper-button">
                      {paperSnapLoading ? "Finding paper..." : "Calibrate paper"}
                    </button>
                  </div>
                  {paperSnapError && <p role="alert" className={styles.cornerWarning}
                    data-testid="paper-snap-error">{paperSnapError} Manual corner placement remains available.</p>}
                  {paperProposal && <div data-testid="paper-snap-result"
                    className={styles.provisionalNote} role="status">
                    <p><strong>Detection: {paperProposal.detection_status}</strong>
                      {paperProposal.calibration_status
                        ? ` · Geometry: ${paperProposal.calibration_status}` : ""}
                    </p>
                    <p>{paperProposal.detection_status === "snapped"
                      ? "Proposed corners are ready for review. Inspect each corner before confirming."
                      : "No reliable automatic corner proposal. Adjust the overlay or use manual coordinates."}</p>
                    {paperProposal.proposed_corners_px &&
                      <div data-testid="paper-snap-coordinates">
                        <p><strong>Proposed reference vertices (original-image pixels):</strong></p>
                        <p>{(["TL","TR","BR","BL"] as const).map((label, index) => {
                          const point = paperProposal.proposed_corners_px?.[index];
                          return point ? `${label}: (${point[0].toFixed(1)}, ${point[1].toFixed(1)})` : "";
                        }).join(" · ")}</p>
                      </div>}
                    {paperProposal.reason_codes.length > 0 &&
                      <p>Diagnostic codes: {paperProposal.reason_codes.join(", ")}</p>}
                    {paperProposal.detection_status === "snapped" &&
                     paperProposal.calibration_status !== "invalid" &&
                     paperProposal.proposed_corners_px &&
                     <div className={styles.cornerActionRow}>
                       <button type="button" className={styles.confirmCornerButton}
                         data-testid="apply-paper-snap"
                         onClick={handleApplyPaperProposal}>
                         Apply proposed corners (review required)
                       </button>
                     </div>}
                    <button type="button" className={styles.retakeButton}
                      data-testid="dismiss-paper-snap"
                      onClick={() => {setPaperProposal(null); setPaperSnapError(null);}}>
                      Discard proposal
                    </button>
                  </div>}
                </section>
              </>
            )}

            {activeStep === "landmarks" && (
              <><button type="button" className={styles.retakeButton}
                onClick={() => { setPaperConfirmed(false); setReviewedLandmarks({}); setResults(null); setActiveStep("paper"); }}
                data-testid="adjust-paper-button">Recheck Paper Corners</button>
              <LandmarkEditor
                landmarks={landmarks}
                onChangeLandmarks={setLandmarks}
                reviewedLandmarks={reviewedLandmarks}
                onReviewLandmark={(key, reviewed) => setReviewedLandmarks(previous => ({ ...previous, [key]: reviewed }))}
                onCalculate={handleCalculate}
                isSubmitting={isSubmitting}
                imageWidth={intrinsicWidth}
                imageHeight={intrinsicHeight}
                paperConfirmed={paperConfirmed}
              /></>
            )}

            {activeStep === "results" && results && (
              <MeasurementResultsView
                results={results}
                onAdjustLandmarks={() => setActiveStep("landmarks")}
                onReset={handleReset}
              />
            )}
          </div>
        </div>
      )}
    </main>
  );
}
