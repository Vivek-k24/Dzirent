import { test, expect, type Page } from "@playwright/test";

// MSW demo-mode browser evidence only. Real PostgreSQL persistence is verified separately by
// services/api/tests/workflows/test_studios.py; these scenarios never claim hosted persistence.
// Demo state lives in the page session, so navigation stays client-side after the first load.

function trackExceptions(page: Page) {
  const exceptions: string[] = [];
  page.on("pageerror", error => exceptions.push(error.message));
  return exceptions;
}

test("lender edits their Studio and the public directory and profile reflect it", async ({ page }) => {
  const exceptions = trackExceptions(page);
  await page.goto("/auth/lender/login");
  await page.getByRole("button", { name: /Continue as sample lender/ }).click();
  await expect(page).toHaveURL(/\/lender\/dashboard$/);
  await page.getByRole("link", { name: "Studio settings" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Studio settings" })).toBeVisible();

  const name = page.getByLabel("Studio name"), bio = page.getByLabel("Bio");
  await expect(name).toHaveValue("Sample Lender");
  await expect(page.locator("code", { hasText: "/studios/sample-lender" })).toBeVisible();
  await name.fill("Texas Occasion Closet");
  await bio.fill("Evening and celebration outfits, lent across Texas.");
  await page.getByRole("button", { name: "Save Studio" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Studio saved · version 2." })).toBeVisible();
  await expect(page.getByText(/version 2$/)).toBeVisible();
  // Renaming keeps the stable public address.
  await expect(page.locator("code", { hasText: "/studios/sample-lender" })).toBeVisible();

  await page.getByRole("link", { name: "View public Studio" }).click();
  await expect(page).toHaveURL(/\/studios\/sample-lender$/);
  await expect(page.getByRole("heading", { level: 1, name: "Texas Occasion Closet" })).toBeVisible();
  await expect(page.getByText("Evening and celebration outfits, lent across Texas.")).toBeVisible();
  await expect(page.getByTestId("studio-count")).toHaveText("40 published outfits");

  await page.getByRole("link", { name: "← Explore Studios" }).click();
  const card = page.locator('[data-studio-handle="sample-lender"]');
  await expect(card.getByRole("heading", { name: "Texas Occasion Closet" })).toBeVisible();

  // Making the Studio private removes it from public discovery.
  await page.goBack();
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1, name: "Studio settings" })).toBeVisible();
  await page.getByLabel(/Show my Studio in Explore Studios/).uncheck();
  await page.getByRole("button", { name: "Save Studio" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Studio saved · version 3." })).toBeVisible();
  await expect(page.getByRole("link", { name: "View public Studio" })).toHaveCount(0);
  await page.getByRole("link", { name: "Explore Studios" }).click();
  await expect(page.getByRole("heading", { name: "No public Studios yet" })).toBeVisible();
  expect(exceptions).toEqual([]);
});

test("Studio preview rotates through every published outfit across API pages and opens its PDP", async ({ page }, testInfo) => {
  const exceptions = trackExceptions(page);
  expect((await page.goto("/studios"))?.status()).toBe(200);
  const card = page.locator('[data-studio-handle="sample-lender"]');
  await expect(card.getByTestId("studio-count")).toHaveText("40 published outfits");
  await expect(card.getByText("Texas", { exact: true })).toBeVisible();

  const carousel = card.locator('[data-studio-carousel="sample-lender"]');
  const window = testInfo.project.name === "mobile" ? 2 : 3;
  // All four 12-item API pages load before the position reports the full set.
  await expect(carousel.getByText(`Outfits 1–${window} of 40`, { exact: true })).toBeVisible();
  const slides = carousel.locator("li[data-product-id]");
  await expect(slides).toHaveCount(window);
  // Preview content is image, title and size only: no price, retail or rating overlays.
  await expect(carousel).not.toContainText("$");
  await expect(carousel).not.toContainText(/retail|rating|band/i);
  await expect(slides.first().getByRole("img")).toHaveAttribute("alt", /.+/);
  // Reduced motion (configured for this suite) stops automatic rotation; manual controls remain.
  await expect(carousel.getByRole("button", { name: "Auto-rotation off (reduced motion)" })).toBeDisabled();

  const seen = new Set<string>();
  const next = carousel.getByRole("button", { name: "Next outfit" });
  for (let step = 0; step < 40; step++) {
    for (const id of await slides.evaluateAll(items => items.map(item => item.getAttribute("data-product-id")!))) seen.add(id);
    await next.click();
  }
  expect(seen.size).toBe(40);
  await expect(carousel.getByText(`Outfits 1–${window} of 40`, { exact: true })).toBeVisible();
  await carousel.getByRole("button", { name: "Previous outfit" }).click();
  await expect(carousel.getByText(new RegExp(`^Outfits? 40.* of 40$`))).toBeVisible();

  const preview = slides.first().getByRole("link");
  const href = await preview.getAttribute("href");
  expect(href).toMatch(/^\/products\/demo-/);
  await preview.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.goBack();
  await card.getByRole("link", { name: "Visit Sample Lender" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Sample Lender" })).toBeVisible();
  const wardrobe = page.getByRole("list", { name: "Sample Lender wardrobe" }).locator("li[data-product-id]");
  await expect(wardrobe).toHaveCount(24);
  await page.getByRole("button", { name: "Load more outfits" }).click();
  await expect(wardrobe).toHaveCount(40);
  await expect(page.getByText("Showing 40 of 40")).toBeVisible();
  await wardrobe.last().getByRole("link").click();
  await expect(page).toHaveURL(/\/products\/demo-/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  expect((await page.goto("/studios/not-a-real-studio"))?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Studio not available" })).toBeVisible();
  expect(exceptions).toEqual([]);
});
