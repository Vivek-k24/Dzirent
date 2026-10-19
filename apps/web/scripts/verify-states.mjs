/* global document, window, MutationObserver, performance */
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.DZIRENT_SMOKE_URL ?? "http://127.0.0.1:3000";
const browser = await chromium.launch(), context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage(), requests = [], errors = [];
page.setDefaultTimeout(10000);
page.on("request", req => { if (req.url().includes("/api/v1/catalog/products")) requests.push(req.url()); });
page.on("pageerror", error => errors.push(error.message));
try {
  await page.addInitScript(() => {
    window.__dzirentBoot = { maxSkeletons: 0, skeletonAt: 0, productsAt: 0 };
    const observer = new MutationObserver(() => {
      const state = window.__dzirentBoot, count = Array.from(document.querySelectorAll("[data-skeleton]")).filter(el => el.checkVisibility()).length;
      state.maxSkeletons = Math.max(state.maxSkeletons, count);
      if (count && !state.skeletonAt) state.skeletonAt = performance.now();
      if (document.querySelectorAll("[data-product-id]").length === 40 && !state.productsAt) { state.productsAt = performance.now(); observer.disconnect(); }
    }); observer.observe(document, { childList: true, subtree: true });
  });
  await page.goto(base); await expect(page.locator("[data-product-id]")).toHaveCount(40);
  const boot = await page.evaluate(() => window.__dzirentBoot);
  expect(boot.maxSkeletons).toBe(8); expect(boot.productsAt - boot.skeletonAt).toBeGreaterThanOrEqual(250); expect(requests.length).toBe(1);
  const image = page.locator(".product-photo img").first(), before = await page.locator(".product-photo").first().boundingBox();
  let brokenRequests = 0; page.on("request", req => { if (req.url().includes("missing-image-test.jpg")) brokenRequests++; });
  await image.evaluate(img => { img.srcset = ""; img.src = "/fixtures/missing-image-test.jpg"; });
  await page.waitForFunction(() => { const img = document.querySelector(".product-photo img"); return img?.currentSrc.includes("garment-placeholder.svg") && img.complete && img.naturalWidth > 0; });
  const after = await page.locator(".product-photo").first().boundingBox(); expect(after.height).toBe(before.height); expect(after.width).toBe(before.width); expect(brokenRequests).toBe(1);
  let response = await page.goto(`${base}/products/no-such-outfit`); expect(response.status()).toBe(404); await expect(page.getByRole("heading", { name: "Outfit not found", exact: true })).toBeVisible();
  response = await page.goto(`${base}/unknown-route`); expect(response.status()).toBe(404); await expect(page.getByRole("heading", { name: "Outfit not found", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  await mkdir("test-results/web-integration", { recursive: true });
  await writeFile("test-results/web-integration/states.json", JSON.stringify({ browser: browser.version(), boot, initialCatalogRequests: requests.length, brokenRequests, reservedImageDimensions: after, unknownProductStatus: 404, unknownRouteStatus: 404, errors }, null, 2));
  console.log("PASS eight initial skeletons, minimum presentation delay, one 40-item request, image-failure recovery without layout shift/loop, and two HTTP 404 routes.");
} finally { await browser.close(); }
