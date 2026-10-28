import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".", testMatch: "*.spec.ts", fullyParallel: false, workers: 1, retries: 0,
  forbidOnly: !!process.env.CI, timeout: 90_000, globalTimeout: 420_000,
  expect: { timeout: 20_000 }, reporter: "line", outputDir: "../../test-results/auth",
  use: { baseURL: "http://127.0.0.1:3500", browserName: "chromium", viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce", actionTimeout: 15_000, navigationTimeout: 30_000, screenshot: "off", trace: "off", video: "off" },
});
