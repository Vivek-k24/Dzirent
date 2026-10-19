import { test, expect } from "@playwright/test";

test("catalog photo opens a product, preserves its deep link, and exposes rental choices", async ({ page }) => {
  const exceptions: string[] = [];
  page.on("pageerror", error => exceptions.push(error.message));
  expect((await page.goto("/"))?.status()).toBe(200);
  const photos = page.locator("[data-product-id] .product-photo-link");
  await expect(photos).toHaveCount(40);
  const link = photos.first(), href = await link.getAttribute("href");
  expect(href).toMatch(/^\/products\//);
  await link.click();
  await expect(page.locator(".detail-copy h1")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(new URL(href!, "http://localhost").pathname);
  expect((await page.reload())?.status()).toBe(200);
  await expect(page.locator(".detail-copy h1")).toBeVisible();
  await expect(page.locator("#garment-size")).toBeVisible();
  expect(exceptions).toEqual([]);
});
