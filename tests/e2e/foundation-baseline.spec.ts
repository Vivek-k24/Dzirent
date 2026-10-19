import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Foundation Baseline Verification & Accessibility", () => {
  test("REQ-1A-13: Shell renders cleanly with 0 axe violations, 0 console errors, 0 failed network requests", async ({
    page,
  }, testInfo) => {
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];

    page.on("pageerror", (error) => consoleErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("requestfailed", (request) => failedRequests.push(request.url()));

    const response = await page.goto("/", { waitUntil: "networkidle" });
    expect(response?.status()).toBe(200);

    // Verify typography and core brand elements
    const heading = page.getByRole("heading", { level: 1, name: "dzirent", exact: true });
    await expect(heading).toBeVisible();

    // Verify honest simulation/foundation labeling
    await expect(page.getByText("DEMO · Phase 0 foundation", { exact: true })).toBeVisible();

    // Verify local fallback placeholder image loads with HTTP 200
    const imageRes = await page.request.get("/fixtures/garment-placeholder.svg");
    expect(imageRes.status()).toBe(200);

    // Run axe-core accessibility checks
    const axeResults = await new AxeBuilder({ page }).analyze();
    expect(
      axeResults.violations,
      `Accessibility violations found: ${JSON.stringify(axeResults.violations, null, 2)}`
    ).toEqual([]);

    // Assert zero unhandled console errors or failed network requests
    expect(consoleErrors).toEqual([]);
    expect(failedRequests).toEqual([]);

    // Attach full-page screenshot
    const screenshot = await page.screenshot({ fullPage: true });
    await testInfo.attach(`screenshot-${testInfo.project.name}`, {
      body: screenshot,
      contentType: "image/png",
    });
  });
});

