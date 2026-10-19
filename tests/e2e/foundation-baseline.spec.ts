import { test, expect, cards, catalog, axe } from "./support";
test("REQ-1A responsive presentation: 40 original products, four sections, local images, zero axe/browser failures", async ({ page }, info) => {
  await catalog(page);
  await expect(page.getByRole("heading", { level: 1, name: "Trending outfits (40)" })).toBeVisible();
  await expect(page.getByText("DEMO PREVIEW", { exact: false })).toBeVisible();
  for (const section of ["merchandising", "context", "controls", "results"]) await expect(page.locator(`[data-section=${section}]`)).toBeVisible();
  const geometry = await page.evaluate(() => { const grid = document.querySelector(".product-grid")!, hero = document.querySelector(".merchandising")!; return { columns: getComputedStyle(grid).gridTemplateColumns.split(" ").length, hero: hero.getBoundingClientRect().height, overflow: document.documentElement.scrollWidth - innerWidth }; });
  const width = page.viewportSize()!.width;
  expect(geometry.columns).toBe(width >= 1280 ? 4 : width >= 1024 ? 3 : width >= 640 ? 2 : 1);
  expect(geometry.hero).toBeLessThanOrEqual(width < 640 ? 180 : 240); expect(geometry.overflow).toBeLessThanOrEqual(1);
  const ids = await cards(page).evaluateAll(nodes => nodes.map(node => node.getAttribute("data-product-id"))); expect(new Set(ids).size).toBe(40);
  for (let i = 0; i < 40; i++) {
    const image = cards(page).nth(i).locator("img"); await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0)).toBe(true);
    expect(await image.getAttribute("alt")).toMatch(/Sample Studio/);
    const box = await cards(page).nth(i).locator(".product-photo").boundingBox(); expect(box!.width / box!.height).toBeCloseTo(0.75, 2);
    expect(await image.getAttribute("src")).not.toContain("garment-placeholder");
  }
  await page.evaluate(() => window.scrollTo(0, 0)); await axe(page);
  await info.attach(`presentation-${info.project.name}`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
});
