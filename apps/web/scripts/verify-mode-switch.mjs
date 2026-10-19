/* global navigator */
// Run against demo, then restart the SAME local origin in connected mode and
// create .tools/connected-mode-ready. The browser context stays open across restart.
import { chromium, expect } from "@playwright/test";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
const base = process.env.DZIRENT_SMOKE_URL ?? "http://127.0.0.1:3000";
const readyFile = new URL("../../../.tools/connected-mode-ready", import.meta.url);
await rm(readyFile, { force: true });
const browser = await chromium.launch(), context = await browser.newContext(), page = await context.newPage();
page.setDefaultTimeout(15000);
try {
  await page.goto(base); await expect(page.locator("[data-product-id]")).toHaveCount(40);
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller?.scriptURL.endsWith("/mockServiceWorker.js"))).toBe(true);
  await page.locator(".product-title").first().click(); await page.locator("#garment-size").selectOption({ index: 1 }); await page.getByRole("button", { name: "Add to bag", exact: true }).click();
  console.log("MODE_SWITCH_DEMO_READY: one demo bag item and an active mock worker; awaiting connected restart.");
  const deadline = Date.now() + 120000;
  while (!(await stat(readyFile).catch(() => false))) { if (Date.now() > deadline) throw new Error("Connected restart signal timed out."); await setTimeout(250); }
  const connectedRequests = [];
  await context.route("http://127.0.0.1:8000/api/v1/**", async route => {
    connectedRequests.push(route.request().url());
    await route.fulfill({ status: 503, contentType: "application/json", headers: { "Access-Control-Allow-Origin": new URL(base).origin }, body: JSON.stringify({ error: { code: "dependency_unavailable", message: "Connected API deliberately unavailable in this boundary check.", details: [] }, request_id: "connected-test" }) });
  });
  await page.goto(base);
  await expect(page.getByText("CONNECTED", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Connected API deliberately unavailable in this boundary check.", { exact: true })).toBeVisible();
  await expect(page.locator("[data-product-id]")).toHaveCount(0); await expect(page.getByRole("button", { name: "Demo controls", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Bag 0 items", exact: true })).toBeVisible();
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).filter(r => r.active?.scriptURL.endsWith("/mockServiceWorker.js")).length)).toBe(0);
  expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL.endsWith("/mockServiceWorker.js") ?? false)).toBe(false);
  await page.goto(`${base}/auth/renter/login`); await expect(page.getByText("Connected sign-in requires the configured identity provider. Sample sign-in is available in demo mode.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue as sample renter" })).toHaveCount(0);
  expect(connectedRequests.length).toBeGreaterThanOrEqual(3);
  await mkdir("test-results/web-integration", { recursive: true });
  await writeFile("test-results/web-integration/connected-boundary.json", JSON.stringify({ browser: browser.version(), oldMockControllerReleased: true, connected503Visible: true, fixtureProductsRendered: 0, demoBagExcluded: true, sampleAuthDisabled: true, connectedRequests }, null, 2));
  console.log("PASS demo-to-connected restart releases old MSW, partitions bag, shows real API errors and disables sample sign-in; no mock fallback.");
} finally { await browser.close(); await rm(readyFile, { force: true }); }
