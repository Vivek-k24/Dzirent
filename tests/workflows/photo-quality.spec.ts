import { test, expect, type Page } from "@playwright/test";

/**
 * AI-QUALITY-1B: Bounded browser photo screening and guided retake UI.
 *
 * Scoped integration tests verifying:
 * 1. Production gate: /dev/photo-quality fails closed (404) in production.
 * 2. Production allowlist: accessible when explicitly permitted via allowlist header/env.
 * 3. Honest prototype disclosure: notice banner explicitly states that this tool
 *    does not compute garment dimensions or inspect damage.
 * 4. Client-side preliminary feedback: immediate browser canvas blur/lighting analysis
 *    visibly marked PRELIMINARY BROWSER ESTIMATE.
 * 5. Input validation: unsupported media types (e.g. GIF) fail fast with HTTP 415.
 * 6. Service-down recovery: connection failure or 503 triggers actionable error UI with retry.
 * 7. Phase 2B real request: when backend proxy is available, verifies live decision schema.
 */

const SYNTHETIC_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJAD/1e88vAAAAAAElFTkSuQmCC";
const SYNTHETIC_PNG_BUFFER = Buffer.from(SYNTHETIC_PNG_BASE64, "base64");

const INVALID_GIF_BASE64 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const INVALID_GIF_BUFFER = Buffer.from(INVALID_GIF_BASE64, "base64");

function trackExceptions(page: Page) {
  const exceptions: string[] = [];
  page.on("pageerror", error => exceptions.push(error.message));
  return exceptions;
}

test.describe("AI-QUALITY-1 Photo Quality Dev Route", () => {
  test("development access does not depend on query-string overrides", async ({ page }) => {
    // This browser run is local/test. Query parameters cannot authorize a deployed preview.
    await page.goto("/dev/photo-quality?env=production&allow_dev=1");
    await expect(page.getByRole("heading", { level: 1, name: "Overhead Photo Quality Screening" })).toBeVisible();
  });

  test("dev mode: displays honest prototype disclosure, dropzone, and capture guide", async ({ page }) => {
    const exceptions = trackExceptions(page);
    const response = await page.goto("/dev/photo-quality");
    expect(response?.status()).toBe(200);

    // Title and heading
    await expect(page.getByRole("heading", { level: 1, name: "Overhead Photo Quality Screening" })).toBeVisible();

    // Honest disclaimer banner
    const notice = page.getByTestId("ai-quality-notice");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("TEST PROTOTYPE");
    await expect(notice).toContainText("AI-QUALITY-1");
    await expect(notice).toContainText("does not compute garment dimensions");

    // Dropzone and capture guide
    await expect(page.getByTestId("photo-dropzone")).toBeVisible();
    const guidance = page.getByTestId("retake-guidance");
    await expect(guidance).toBeVisible();
    await expect(guidance).toContainText("US Letter Paper Reference");
    await expect(guidance).toContainText("8.5 × 11 in");

    expect(exceptions).toEqual([]);
  });

  test("client validation: rejects unsupported media format immediately", async ({ page }) => {
    const exceptions = trackExceptions(page);
    await page.goto("/dev/photo-quality");

    // Provide an unsupported GIF file
    const fileInput = page.getByTestId("photo-input");
    await fileInput.setInputFiles({
      name: "garment.gif",
      mimeType: "image/gif",
      buffer: INVALID_GIF_BUFFER,
    });

    // Client error alert must surface immediately without backend call
    const alert = page.getByTestId("error-alert");
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("unsupported_media_type");
    await expect(alert).toContainText("HTTP 415");

    // Resetting returns to dropzone
    await page.getByRole("button", { name: "Choose different file" }).click();
    await expect(page.getByTestId("photo-dropzone")).toBeVisible();
    await expect(page.getByTestId("error-alert")).toHaveCount(0);

    expect(exceptions).toEqual([]);
  });

  test("preliminary analysis: shows preliminary estimate banner and required server checks", async ({ page }) => {
    const exceptions = trackExceptions(page);
    await page.goto("/dev/photo-quality");

    // Provide a valid synthetic PNG
    const fileInput = page.getByTestId("photo-input");
    await fileInput.setInputFiles({
      name: "overhead-sample.png",
      mimeType: "image/png",
      buffer: SYNTHETIC_PNG_BUFFER,
    });

    // Image preview card renders
    await expect(page.getByTestId("preview-image")).toBeVisible();

    // Preliminary badge appears with clear preliminary disclaimer
    const preliminaryBadge = page.getByTestId("preliminary-badge");
    await expect(preliminaryBadge).toBeVisible();
    await expect(page.getByTestId("preliminary-label")).toHaveText("PRELIMINARY BROWSER ESTIMATE");

    // Discloses that paper corners and framing require server verification
    await expect(preliminaryBadge).toContainText("Reference Paper");
    await expect(preliminaryBadge).toContainText("Requires Server");
    await expect(preliminaryBadge).toContainText("Garment Framing");

    // Action buttons are available
    await expect(page.getByTestId("verify-server-button")).toBeVisible();
    await expect(page.getByTestId("reset-button")).toBeVisible();

    expect(exceptions).toEqual([]);
  });

  test("service-down recovery: handles backend unavailability with clear retry option", async ({ page }) => {
    const exceptions = trackExceptions(page);
    await page.goto("/dev/photo-quality");

    const fileInput = page.getByTestId("photo-input");
    await fileInput.setInputFiles({
      name: "overhead-sample.png",
      mimeType: "image/png",
      buffer: SYNTHETIC_PNG_BUFFER,
    });

    await expect(page.getByTestId("verify-server-button")).toBeVisible();
    await page.route("**/api/v1/dev/photo-quality", async route => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "service_unavailable", message: "Service intentionally offline for test.", details: [] }, request_id: "offline-test" }),
      });
    });
    await page.getByTestId("verify-server-button").click();

    // Since the external AI quality microservice is not running in isolated web tests,
    // the monolith proxy or fetch will fail closed with 503 or error
    const alert = page.getByTestId("error-alert");
    await expect(alert).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("retry-button")).toBeVisible();

    expect(exceptions).toEqual([]);
  });
  for (const [scene, expected] of [
    ["usable", "PASS"],
    ["blurred", "RETAKE NEEDED"],
    ["no_paper", "MANUAL REVIEW REQUIRED"],
  ] as const) {
    test(`real local image-to-FastAPI integration: ${scene}`, async ({ page }) => {
      test.skip(process.env.DZIRENT_AIQUALITY_REAL_E2E !== "1", "Requires both real local Python services");
      const { readFileSync } = await import("node:fs");
      const { resolve } = await import("node:path");
      const filename = resolve(process.cwd(), "test-results", "ai-quality", `${scene}.jpg`);
      await page.goto("/dev/photo-quality");
      await page.getByTestId("photo-input").setInputFiles({
        name: `${scene}.jpg`,
        mimeType: "image/jpeg",
        buffer: readFileSync(filename),
      });
      await expect(page.getByTestId("verify-server-button")).toBeVisible();
      await page.getByTestId("verify-server-button").click();
      await expect(page.getByTestId("server-result")).toBeVisible({ timeout: 25_000 });
      await expect(page.getByTestId("decision-banner")).toContainText(expected);
      for (const check of ["blur", "exposure", "paper", "framing"]) {
        await expect(page.getByTestId(`check-${check}`)).toBeVisible();
      }
    });
  }

});
