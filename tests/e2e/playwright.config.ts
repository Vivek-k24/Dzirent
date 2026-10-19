import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
const rootDir = resolve(__dirname, "../..");
const baseURL = process.env.DZIRENT_TEST_URL || "http://127.0.0.1:3100";
export default defineConfig({
  testDir: ".", timeout: 60_000, expect: { timeout: 12_000 }, fullyParallel: false,
  forbidOnly: !!process.env.CI, retries: 0, workers: process.env.CI ? 2 : 3,
  outputDir: resolve(rootDir, "test-results/artifacts"),
  reporter: [["list"], ["html", { outputFolder: resolve(rootDir, "playwright-report"), open: "never" }], ["json", { outputFile: resolve(rootDir, "test-results/e2e-report.json") }]],
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure", video: "retain-on-failure", reducedMotion: "reduce" },
  projects: (["chromium", "firefox", "webkit"] as const).flatMap(browserName =>
    [390, 768, 1100, 1440].map(width => ({ name: `${browserName}-${width}`, use: { browserName, viewport: { width, height: width < 1000 ? 1024 : 900 }, hasTouch: width === 390 && browserName !== "firefox" } }))),
  webServer: process.env.DZIRENT_SKIP_WEBSERVER ? undefined : {
    command: "pnpm --filter @dzirent/web start --port 3100", cwd: rootDir, url: `${baseURL}/`, reuseExistingServer: !process.env.CI, timeout: 120_000, env: { NEXT_PUBLIC_DZIRENT_MODE: "demo" },
  },
});
