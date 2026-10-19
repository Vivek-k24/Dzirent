import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

const API_BASE = process.env.DZIRENT_API_URL || "http://127.0.0.1:8100";
const rootDir = resolve(__dirname, "../..");

export default defineConfig({
  testDir: ".",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  workers: 1,
  reporter: [
    ["list"],
    ["json", { outputFile: resolve(rootDir, "test-results/contracts-report/results.json") }],
  ],
  use: {
    baseURL: API_BASE,
  },
  webServer: process.env.DZIRENT_SKIP_WEBSERVER
    ? undefined
    : {
        command: "pnpm dev:qa:api",
        cwd: rootDir,
        url: `${API_BASE}/api/v1/health/live`,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});

