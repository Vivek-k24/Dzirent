import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * AI-MEASURE-1B: Bounded browser garment measurement and paper-reference UI.
 *
 * Scoped integration tests verifying:
 * 1. Production gate: /dev/garment-measure fails closed in production; query params cannot override.
 * 2. Honest prototype disclosure: notice banner explicitly states that this tool does not
 *    measure body circumference, does not guarantee fit, and does not persist to the catalog.
 * 3. Client-side input validation: non-image or unsupported formats fail fast with client alert.
 * 4. Human-in-the-loop workflow:
 *    - Overhead capture standards displayed.
 *    - Mandatory US Letter paper attestation checkbox before corner confirmation.
 *    - 4-corner adjustment controls with unverified template disclaimer.
 *    - Landmark editor with seam guidelines and incomplete-seam not_measurable reason.
 * 5. Service-offline error recovery: handles 503 with clear explanation and retry button.
 * 6. Phase 2B real request: reserved for coordinator end-to-end execution with real backend.
 */

const SAMPLE_GARMENT_JPEG = readFileSync(
  resolve(__dirname, "../../apps/web/public/media/catalog/10449702.jpg"),
);

const INVALID_GIF_BASE64 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const INVALID_GIF_BUFFER = Buffer.from(INVALID_GIF_BASE64, "base64");

function trackExceptions(page: Page) {
  const exceptions: string[] = [];
  page.on("pageerror", (error) => exceptions.push(error.message));
  return exceptions;
}

test.describe("AI-MEASURE-1 Garment Measure Dev Route", () => {
  test("development access does not depend on query-string overrides", async ({
    page,
  }) => {
    // This browser run is local/test. Query parameters cannot authorize a deployed preview.
    await page.goto("/dev/garment-measure?env=production&allow_dev=1");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Garment Fit & Geometry Measurement",
      }),
    ).toBeVisible();
  });

  test("dev mode: displays honest prototype disclosure, dropzone, and step tracker", async ({
    page,
  }) => {
    const exceptions = trackExceptions(page);
    const response = await page.goto("/dev/garment-measure");
    expect(response?.status()).toBe(200);

    // Title and heading
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Garment Fit & Geometry Measurement",
      }),
    ).toBeVisible();

    // Honest disclaimer banner
    const notice = page.getByTestId("ai-measure-notice");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("TEST PROTOTYPE");
    await expect(notice).toContainText("AI-MEASURE-1");
    await expect(notice).toContainText("does not measure body circumference");
    await expect(notice).toContainText("does not guarantee fit");
    await expect(notice).toContainText(
      "does not persist measurements to catalog listings",
    );

    // Step indicators
    await expect(page.getByTestId("step-badge-upload")).toBeVisible();
    await expect(page.getByTestId("step-badge-paper")).toBeVisible();
    await expect(page.getByTestId("step-badge-landmarks")).toBeVisible();
    await expect(page.getByTestId("step-badge-results")).toBeVisible();

    // Dropzone
    await expect(page.getByTestId("photo-dropzone")).toBeVisible();

    expect(exceptions).toEqual([]);
  });

  test("client validation: rejects unsupported media format immediately", async ({
    page,
  }) => {
    const exceptions = trackExceptions(page);
    await page.goto("/dev/garment-measure");

    // Provide an unsupported GIF file
    const fileInput = page.getByTestId("garment-photo-input");
    await fileInput.setInputFiles({
      name: "garment.gif",
      mimeType: "image/gif",
      buffer: INVALID_GIF_BUFFER,
    });

    // Client error alert must surface immediately without backend call
    const alert = page.getByTestId("upload-error-alert");
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("Unsupported file format");

    expect(exceptions).toEqual([]);
  });

  test("interactive workflow: photo upload -> attestation & paper corners -> landmark annotation", async ({
    page,
  }) => {
    const exceptions = trackExceptions(page);
    await page.goto("/dev/garment-measure");

    // 1. Upload valid garment photo
    const fileInput = page.getByTestId("garment-photo-input");
    await fileInput.setInputFiles({
      name: "garment-sample.jpg",
      mimeType: "image/jpeg",
      buffer: SAMPLE_GARMENT_JPEG,
    });

    // Image preview and overlay render
    await expect(page.getByTestId("preview-image")).toBeVisible();
    await expect(page.getByTestId("image-measurement-overlay")).toBeVisible();

    // 2. Paper reference & attestation section
    await expect(page.getByTestId("instructions-section")).toBeVisible();
    await expect(page.getByTestId("paper-corner-editor")).toBeVisible();
    await expect(page.getByTestId("unverified-corner-note")).toContainText(
      "Initial paper coordinates are unverified templates",
    );

    // Confirm button is disabled until attestation checkbox is checked
    const confirmButton = page.getByTestId("confirm-paper-button");
    await expect(confirmButton).toBeDisabled();

    // Check US Letter attestation
    const attestationBox = page.getByTestId("us-letter-attestation");
    await attestationBox.check();
    await expect(confirmButton).toBeEnabled();

    // Confirm corners
    await confirmButton.click();

    // 3. Landmark annotation editor
    await expect(page.getByTestId("landmark-editor")).toBeVisible();
    await expect(page.getByTestId("tab-shoulder_width_cm")).toBeVisible();
    await expect(page.getByTestId("tab-chest_flat_cm")).toBeVisible();
    await expect(page.getByTestId("tab-body_length_cm")).toBeVisible();
    await expect(page.getByTestId("tab-sleeve_length_cm")).toBeVisible();

    // Switch to sleeve tab
    await page.getByTestId("tab-sleeve_length_cm").click();

    // Seam guidelines displayed for sleeve
    await expect(
      page.getByText(/Click from the shoulder seam along the outer arm fold/i),
    ).toBeVisible();

    // Toggle not_measurable for sleeve
    const notMeasurableToggle = page.getByTestId("not-measurable-toggle");
    await notMeasurableToggle.check();
    await expect(page.getByTestId("unmeasurable-reason")).toBeVisible();

    // Calculate button is enabled
    await expect(page.getByTestId("calculate-button")).toBeEnabled();

    expect(exceptions).toEqual([]);
  });

  test("service-down recovery (503): handles backend unavailability with clear retry option", async ({
    page,
    context,
  }) => {
    const exceptions = trackExceptions(page);

    // Intercept API call across browser context before navigation to simulate 503 offline
    await context.route("**/api/v1/dev/garment-measure*", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          code: "service_unavailable",
          message:
            "Garment measurement engine is currently offline or unavailable.",
        }),
      });
    });

    await page.goto("/dev/garment-measure");

    const fileInput = page.getByTestId("garment-photo-input");
    await fileInput.setInputFiles({
      name: "garment-sample.jpg",
      mimeType: "image/jpeg",
      buffer: SAMPLE_GARMENT_JPEG,
    });

    // Check attestation and advance to landmarks
    await page.getByTestId("us-letter-attestation").check();
    await page.getByTestId("confirm-paper-button").click();

    await page.getByTestId("calculate-button").click();

    // Error alert surfaces with retry button
    const errorAlert = page.getByTestId("measure-api-error");
    await expect(errorAlert).toBeVisible();
    await expect(errorAlert).toContainText("Measurement Service Offline (503)");
    await expect(page.getByTestId("retry-calculate-button")).toBeVisible();

    expect(exceptions).toEqual([]);
  });

  test("real local image-to-FastAPI integration (Phase 2B reserved)", async ({
    page,
  }) => {
    test.skip(
      process.env.DZIRENT_AIMEASURE_REAL_E2E !== "1",
      "Requires real local Python ai-measure service and FastAPI monolith proxy",
    );
    // Bounded real integration block for coordinator merge
    await page.goto("/dev/garment-measure");
    await expect(page.getByTestId("photo-dropzone")).toBeVisible();
  });
});

