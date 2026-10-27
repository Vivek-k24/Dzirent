import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ProductDetail } from "../../packages/client/src";
import AxeBuilder from "@axe-core/playwright";

const manifest = JSON.parse(readFileSync(resolve(__dirname, "../../fixtures/catalog/manifest.json"), "utf8")) as { products: ProductDetail[]; seed_studio: { handle: string; published_product_count: number } };
const cents = (value: string) => Math.round(Number(value.replace(/[^0-9.]/g, "")) * 100);
const noPublicControls = async (page: Page) => {
  await expect(page.locator(".demo-bar, #demo-controls-trigger")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Demo controls", exact: true })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Presentation demo", exact: true })).toHaveCount(0);
  await expect(page.locator("footer")).toContainText("No reservations, payments or delivery promises.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
};

test("all sample prices and legacy bag totals agree across catalog, PDP, Studio and checkout without public debug controls", async ({ page }) => {
  test.setTimeout(65_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const product = manifest.products.filter(item => item.is_available && !item.date_blocks.length).at(-1)!;
  const key = [product.id, product.size.id, "2026-11-02", "2026-11-05"].join(":");
  await page.addInitScript(({ product, key }) => {
    const storageKey = "dzirent-demo-preferences-v1";
    if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, JSON.stringify({ version: 1, state: {
      lines: [{ key, product: { ...product, rental_price_minor: 17950, band: "D" }, sizeId: product.size.id, start: "2026-11-02", end: "2026-11-05" }],
      wishlist: [product.id], location: { metro: "", zip: "78701" },
    } }));
  }, { product, key });

  await page.goto("/cart");
  await expect(page.locator(".bag-line")).toHaveCount(1);
  await expect.poll(async () => cents(await page.locator(".bag-line-price").innerText())).toBe(product.rental_price_minor);
  await expect(page.locator(".bag-line .band-tag")).toHaveText("Band A");
  await noPublicControls(page);
  await page.getByRole("link", { name: "Checkout preview", exact: true }).click();
  await expect(page.getByText("No payment, reservation or booking will be created.", { exact: true })).toBeVisible();
  await expect.poll(async () => cents(await page.locator("dd.summary-total").innerText())).toBe(product.rental_price_minor);
  await page.reload();
  await expect(page.locator(".bag-line")).toHaveCount(1);
  await expect.poll(async () => cents(await page.locator(".bag-line-price").innerText())).toBe(product.rental_price_minor);
  await noPublicControls(page);

  await page.goto("/");
  await expect(page.locator("[data-product-id]")).toHaveCount(40);
  const displayed = await page.locator("[data-product-id]").evaluateAll(nodes => nodes.map(node => ({ id: node.getAttribute("data-product-id"), price: node.querySelector(".card-price strong")?.textContent ?? "" })));
  for (const card of displayed) {
    const expected = manifest.products.find(item => item.id === card.id)!;
    expect(cents(card.price)).toBe(expected.rental_price_minor);
    expect(cents(card.price)).toBeGreaterThan(0);
    expect(cents(card.price)).toBeLessThanOrEqual(4000);
  }
  await noPublicControls(page);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content", exact: true })).toBeFocused();
  const accessibility = await new AxeBuilder({ page }).include("header").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(accessibility.violations).toEqual([]);
  await page.goto("/?band=B");
  await expect(page.locator("[data-product-id]")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /No outfits/i })).toBeVisible();

  await page.goto(`/products/${product.slug}`);
  await expect(page.locator(".detail-copy h1")).toHaveText(product.title);
  await expect.poll(async () => cents(await page.locator(".detail-price strong").innerText())).toBe(product.rental_price_minor);
  await page.reload();
  await expect(page.locator(".detail-copy h1")).toHaveText(product.title);
  await noPublicControls(page);
  await page.goto(`/studios/${manifest.seed_studio.handle}`);
  await expect(page.locator("[data-product-id]").first()).toBeVisible();
  while (await page.locator("[data-product-id]").count() < manifest.seed_studio.published_product_count) {
    const previous = await page.locator("[data-product-id]").count();
    await page.getByRole("button", { name: "Load more outfits", exact: true }).click();
    await expect.poll(() => page.locator("[data-product-id]").count()).toBeGreaterThan(previous);
  }
  await expect(page.locator("[data-product-id]")).toHaveCount(manifest.seed_studio.published_product_count);
  await expect(page.locator("[data-rental-price-minor]")).toHaveCount(manifest.seed_studio.published_product_count);
  for (const card of await page.locator("[data-product-id]").all()) {
    const id = await card.getAttribute("data-product-id");
    const expected = manifest.products.find(item => item.id === id)!;
    expect(cents(await card.locator("[data-rental-price-minor]").innerText())).toBe(expected.rental_price_minor);
  }
  await noPublicControls(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  expect(errors).toEqual([]);
});
