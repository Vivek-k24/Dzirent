// Integrator Phase 0 smoke only; independent application acceptance belongs to Antigravity.
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";

const browser = await chromium.launch();
const baseUrl = process.env.DZIRENT_SMOKE_URL ?? "http://127.0.0.1:3100";
const results = [];
try {
  await mkdir("test-results", { recursive: true });
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    const failures = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("requestfailed", (request) => failures.push(request.url()));
    const response = await page.goto(baseUrl, { waitUntil: "networkidle" });
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "dzirent", exact: true })).toBeVisible();
    await expect(page.getByText("DEMO · Phase 0 foundation", { exact: true })).toBeVisible();
    const image = await page.request.get(`${baseUrl}/fixtures/garment-placeholder.svg`);
    expect(image.status()).toBe(200);
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations).toEqual([]);
    expect(errors).toEqual([]);
    expect(failures).toEqual([]);
    await page.screenshot({ path: `test-results/foundation-${width}.png`, fullPage: true });
    results.push({ width, status: response.status(), axeViolations: axe.violations.length, consoleErrors: errors.length, failedRequests: failures.length });
    await context.close();
  }
  console.log(JSON.stringify({ browser: browser.version(), baseUrl, results }, null, 2));
} finally {
  await browser.close();
}
