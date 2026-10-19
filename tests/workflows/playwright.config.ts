import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

const root = resolve(__dirname, "../..");
const baseURL = process.env.DZIRENT_TEST_URL || "http://127.0.0.1:3300";
export default defineConfig({
  testDir: ".", testMatch: "*.spec.ts", fullyParallel: false, workers: 2, retries: 0,
  forbidOnly: !!process.env.CI, timeout: 45_000, globalTimeout: 180_000,
  expect: { timeout: 12_000 }, reporter: "line", outputDir: resolve(root, "test-results/workflows"),
  use: { baseURL, browserName: "chromium", reducedMotion: "reduce", screenshot: "only-on-failure", trace: "off", video: "off" },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, hasTouch: true } },
  ],
  webServer: process.env.DZIRENT_SKIP_WEBSERVER ? undefined : {
    command: "pnpm --filter @dzirent/web start --port 3300", cwd: root, url: baseURL,
    reuseExistingServer: !process.env.CI, timeout: 60_000, env: { NEXT_PUBLIC_DZIRENT_MODE: "demo" },
  },
});
