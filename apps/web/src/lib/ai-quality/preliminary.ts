import type {
  CheckStatus,
  OverallDecision,
  PreliminaryAnalysis,
  QualityApiError,
} from "./types";

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MiB
export const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png"];

/**
 * Validate a candidate file before browser analysis or upload.
 */
export function validateImageFile(file: File): { ok: true } | { ok: false; error: QualityApiError } {
  if (!file) {
    return {
      ok: false,
      error: { code: "invalid_image", message: "No image file provided." },
    };
  }

  // Check file type (must be JPEG or PNG)
  const isAllowedMime = ALLOWED_MIME_TYPES.includes(file.type.toLowerCase());
  const hasAllowedExt = /\.(jpe?g|png)$/i.test(file.name);

  if (!isAllowedMime && !hasAllowedExt) {
    return {
      ok: false,
      error: {
        code: "unsupported_media_type",
        message: "Unsupported file format. Please upload a JPEG or PNG image.",
        status: 415,
      },
    };
  }

  // Check file size (<= 10 MiB)
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      error: {
        code: "payload_too_large",
        message: "Image exceeds the 10 MiB size limit. Please choose a smaller photo.",
        status: 413,
      },
    };
  }

  if (file.size === 0) {
    return {
      ok: false,
      error: {
        code: "invalid_image",
        message: "Image file is empty (0 bytes).",
        status: 422,
      },
    };
  }

  return { ok: true };
}

/**
 * Computes mean luminance (0-255) and shadow/highlight clipping percentage from RGBA pixel data.
 */
export function analyzeExposureFromPixels(
  data: Uint8ClampedArray | Uint8Array | number[],
  pixelCount: number,
): {
  status: CheckStatus;
  meanLuminance: number;
  reason: string;
} {
  if (pixelCount <= 0) {
    return { status: "uncertain", meanLuminance: 0, reason: "insufficient_pixel_data" };
  }

  let totalLuminance = 0;
  let shadowCount = 0;
  let highlightCount = 0;

  for (let i = 0; i < pixelCount * 4; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Standard perceptual luminance formula
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    totalLuminance += lum;

    if (lum < 20) shadowCount++;
    if (lum > 245) highlightCount++;
  }

  const meanLuminance = Math.round(totalLuminance / pixelCount);
  const shadowRatio = shadowCount / pixelCount;
  const highlightRatio = highlightCount / pixelCount;

  // Thresholds:
  // Under-exposed: mean < 55 or >45% dark shadows
  if (meanLuminance < 55 || shadowRatio > 0.45) {
    return {
      status: "fail",
      meanLuminance,
      reason: "too_dark",
    };
  }

  // Over-exposed / severe glare: mean > 210 or >35% clipped highlights
  if (meanLuminance > 210 || highlightRatio > 0.35) {
    return {
      status: "fail",
      meanLuminance,
      reason: "too_bright",
    };
  }

  // Balanced lighting: good range and reasonable contrast
  if (meanLuminance >= 75 && meanLuminance <= 190 && shadowRatio < 0.25 && highlightRatio < 0.25) {
    return {
      status: "pass",
      meanLuminance,
      reason: "acceptable_light",
    };
  }

  return {
    status: "uncertain",
    meanLuminance,
    reason: "borderline_exposure",
  };
}

/**
 * Computes sharpness / blur estimate using Laplacian gradient variance over a grayscale grid.
 */
export function analyzeSharpnessFromPixels(
  data: Uint8ClampedArray | Uint8Array | number[],
  width: number,
  height: number,
): {
  status: CheckStatus;
  score: number;
  reason: string;
} {
  if (width < 3 || height < 3) {
    return { status: "uncertain", score: 0, reason: "image_too_small" };
  }

  // Downsample sampling step to keep calculation instant (<= 5ms)
  const step = Math.max(1, Math.floor(Math.min(width, height) / 200));
  let sumLaplacian = 0;
  let sumSqLaplacian = 0;
  let samples = 0;

  for (let y = step; y < height - step; y += step) {
    for (let x = step; x < width - step; x += step) {
      // Grayscale at (x, y)
      const idxCenter = (y * width + x) * 4;
      const lumCenter = 0.299 * data[idxCenter] + 0.587 * data[idxCenter + 1] + 0.114 * data[idxCenter + 2];

      const idxUp = ((y - step) * width + x) * 4;
      const lumUp = 0.299 * data[idxUp] + 0.587 * data[idxUp + 1] + 0.114 * data[idxUp + 2];

      const idxDown = ((y + step) * width + x) * 4;
      const lumDown = 0.299 * data[idxDown] + 0.587 * data[idxDown + 1] + 0.114 * data[idxDown + 2];

      const idxLeft = (y * width + (x - step)) * 4;
      const lumLeft = 0.299 * data[idxLeft] + 0.587 * data[idxLeft + 1] + 0.114 * data[idxLeft + 2];

      const idxRight = (y * width + (x + step)) * 4;
      const lumRight = 0.299 * data[idxRight] + 0.587 * data[idxRight + 1] + 0.114 * data[idxRight + 2];

      // Discrete Laplacian: 4*center - (up + down + left + right)
      const lap = 4 * lumCenter - (lumUp + lumDown + lumLeft + lumRight);
      sumLaplacian += lap;
      sumSqLaplacian += lap * lap;
      samples++;
    }
  }

  if (samples <= 0) {
    return { status: "uncertain", score: 0, reason: "insufficient_samples" };
  }

  const mean = sumLaplacian / samples;
  const variance = Math.max(0, sumSqLaplacian / samples - mean * mean);
  const score = Math.round(variance);

  // Thresholds calibrated for downsampled garments:
  // Sharp: score >= 100
  // Blurry: score < 35
  // Borderline: 35 <= score < 100
  if (score >= 100) {
    return { status: "pass", score, reason: "sharp" };
  }
  if (score < 35) {
    return { status: "fail", score, reason: "blurry" };
  }
  return { status: "uncertain", score, reason: "borderline_sharpness" };
}

/**
 * Deterministically derives an overall preliminary decision according to AI-QUALITY-1 rules:
 * - Any confident fail => retake
 * - All four pass => pass
 * - Otherwise => review
 * Note: Paper and framing are always uncertain in the browser, so maximum browser rating is 'review'.
 */
export function deriveOverallDecision(
  blurStatus: CheckStatus,
  exposureStatus: CheckStatus,
  paperStatus: CheckStatus = "uncertain",
  framingStatus: CheckStatus = "uncertain",
): OverallDecision {
  if (blurStatus === "fail" || exposureStatus === "fail" || paperStatus === "fail" || framingStatus === "fail") {
    return "retake";
  }
  if (blurStatus === "pass" && exposureStatus === "pass" && paperStatus === "pass" && framingStatus === "pass") {
    return "pass";
  }
  return "review";
}

/**
 * Execute preliminary browser-side checks on an HTMLImageElement or ImageBitmap.
 */
export function analyzeImageElement(image: HTMLImageElement | ImageBitmap): PreliminaryAnalysis {
  const canvas = document.createElement("canvas");
  // Downsample to at most 600x600 for rapid local analysis
  const maxDim = 600;
  const origW = "naturalWidth" in image ? image.naturalWidth : image.width;
  const origH = "naturalHeight" in image ? image.naturalHeight : image.height;
  const scale = Math.min(1, maxDim / Math.max(origW, origH));
  const w = Math.max(10, Math.round(origW * scale));
  const h = Math.max(10, Math.round(origH * scale));

  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return {
      isPreliminary: true,
      blur: { status: "uncertain", score: 0, reason: "canvas_unsupported" },
      exposure: { status: "uncertain", meanLuminance: 0, reason: "canvas_unsupported" },
      paper: { status: "uncertain", reason: "requires_server_verification" },
      framing: { status: "uncertain", reason: "requires_server_verification" },
      decision: "review",
      notes: ["Browser canvas not available. Server verification required."],
    };
  }

  ctx.drawImage(image, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h);

  const exposure = analyzeExposureFromPixels(imgData.data, w * h);
  const blur = analyzeSharpnessFromPixels(imgData.data, w, h);

  const paper = {
    status: "uncertain" as const,
    reason: "requires_server_verification",
  };
  const framing = {
    status: "uncertain" as const,
    reason: "requires_server_verification",
  };

  const decision = deriveOverallDecision(blur.status, exposure.status, paper.status, framing.status);

  const notes: string[] = [
    "Preliminary browser estimate. Not a final quality determination.",
    "US Letter paper corners and garment framing are verified by server check.",
  ];

  return {
    isPreliminary: true,
    blur,
    exposure,
    paper,
    framing,
    decision,
    notes,
  };
}

/**
 * Load an image File into an Image element and perform preliminary browser analysis.
 */
export async function analyzeImageFile(file: File): Promise<PreliminaryAnalysis> {
  const validation = validateImageFile(file);
  if (!validation.ok) {
    throw validation.error;
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      try {
        const analysis = analyzeImageElement(img);
        URL.revokeObjectURL(objectUrl);
        resolve(analysis);
      } catch {
        URL.revokeObjectURL(objectUrl);
        reject({
          code: "invalid_image",
          message: "Could not decode or analyze image pixels.",
          status: 422,
        } satisfies QualityApiError);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject({
        code: "invalid_image",
        message: "Image could not be loaded. Please ensure the file is a valid JPEG or PNG.",
        status: 422,
      } satisfies QualityApiError);
    };

    img.src = objectUrl;
  });
}

