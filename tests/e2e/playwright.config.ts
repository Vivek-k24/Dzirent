import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

const BASE_URL = process.env.DZIRENT_TEST_URL || "http://127.0.0.1:3100";
const rootDir = resolve(__dirname, "../..");

export default defineConfig({
  testDir: ".",
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  outputDir: resolve(rootDir, "test-results/artifacts"),
  reporter: [
    ["list"],
    ["html", { outputFolder: resolve(rootDir, "playwright-report"), open: "never" }],
    ["json", { outputFile: resolve(rootDir, "test-results/e2e-report.json") }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-1440",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "chromium-1100",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1100, height: 900 },
      },
    },
    {
      name: "chromium-768",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: "chromium-390",
      use: {
        ...devices["iPhone 12"],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "firefox-1440",
      use: {
        ...devices["Desktop Firefox"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "webkit-1440",
      use: {
        ...devices["Desktop Safari"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "webkit-390",
      use: {
        ...devices["iPhone 12"],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: process.env.DZIRENT_SKIP_WEBSERVER
    ? undefined
    : {
        command: "pnpm dev:qa:web",
        cwd: rootDir,
        url: `${BASE_URL}/`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});

