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
  await expect(name).toHaveValue("Atelier Austin");
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
  await expect(page.getByTestId("studio-count")).toHaveText("14 published outfits");

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
  await page.locator("#main-content").getByRole("link", { name: "Explore Studios" }).click();
  // With 6 Studios, making sample-lender private keeps the other 5 Studios discoverable.
  await expect(page.locator('[data-studio-handle="sample-lender"]')).toHaveCount(0);
  const remainingStudios = page.getByRole("list", { name: "Studios", exact: true }).locator("li[data-studio-handle]");
  await expect(remainingStudios).toHaveCount(5);
  expect(exceptions).toEqual([]);
});

test("Studio preview rotates through every published outfit across API pages and opens its PDP", async ({ page }, testInfo) => {
  const exceptions = trackExceptions(page);
  expect((await page.goto("/studios"))?.status()).toBe(200);
  const card = page.locator('[data-studio-handle="sample-lender"]');
  await expect(card.getByTestId("studio-count")).toHaveText("14 published outfits");
  await expect(card.getByText("Texas", { exact: true })).toBeVisible();

  const carousel = card.locator('[data-studio-carousel="sample-lender"]');
  const window = testInfo.project.name === "mobile" ? 2 : 3;
  // All API pages load before the position reports the full set.
  await expect(carousel.locator("[data-studio-position]")).toHaveText(`Outfits 1–${window} of 14`);
  const slides = carousel.locator("li[data-product-id]");
  await expect(slides).toHaveCount(window);
  // Preview content is image, title and size only: no price, retail or rating overlays.
  await expect(carousel).not.toContainText("$");
  await expect(carousel).not.toContainText(/retail|rating|band/i);
  await expect(slides.first().getByRole("img")).toHaveAttribute("alt", /.+/);
  // Reduced motion (configured for this suite) stops automatic rotation; manual controls remain.
  await expect(carousel.getByRole("button", { name: /rotation/i })).toHaveCount(0);
  await expect(carousel.locator("[data-studio-position]")).toHaveAttribute("aria-live", "polite");
  await expect(page.locator("#main-content p").filter({ hasText: /^Explore Studios$/ })).toHaveCount(0);
  const directory = page.getByRole("list", { name: "Studios", exact: true });
  const columns = await directory.evaluate(node => getComputedStyle(node).gridTemplateColumns.split(" ").length);
  expect(columns).toBe(testInfo.project.name === "mobile" ? 1 : 2);
  const directoryBox = (await directory.boundingBox())!, cardBox = (await card.boundingBox())!;
  expect(cardBox.width / directoryBox.width).toBeLessThan(testInfo.project.name === "mobile" ? 1.01 : 0.51);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const photo = (await slides.first().getByRole("img").boundingBox())!;
  expect(photo.width / photo.height).toBeCloseTo(3 / 4, 2);
  const arrow = carousel.getByRole("button", { name: "Next outfit" });
  await expect(arrow).toHaveCSS("border-radius", "0px");
  await expect(arrow).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  const arrowBox = (await arrow.boundingBox())!;
  expect(arrowBox.y + arrowBox.height / 2).toBeGreaterThan(photo.y);
  expect(arrowBox.y + arrowBox.height / 2).toBeLessThan(photo.y + photo.height);

  const seen = new Set<string>();
  const next = carousel.getByRole("button", { name: "Next outfit" });
  for (let step = 0; step < 14; step++) {
    for (const id of await slides.evaluateAll(items => items.map(item => item.getAttribute("data-product-id")!))) seen.add(id);
    await next.click();
  }
  expect(seen.size).toBe(14);
  await expect(carousel.locator("[data-studio-position]")).toHaveText(`Outfits 1–${window} of 14`);
  await carousel.getByRole("button", { name: "Previous outfit" }).click();
  await expect(carousel.locator("[data-studio-position]")).toHaveText(/^Outfits? 14.* of 14$/);

  const preview = slides.first().getByRole("link");
  const href = await preview.getAttribute("href");
  expect(href).toMatch(/^\/products\/demo-/);
  await preview.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.goBack();
  await card.getByRole("link", { name: "Visit Atelier Austin" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Atelier Austin" })).toBeVisible();
  const wardrobe = page.getByRole("list", { name: "Atelier Austin wardrobe" }).locator("li[data-product-id]");
  await expect(wardrobe).toHaveCount(8);
  await page.getByRole("button", { name: "Load more outfits" }).click();
  await expect(wardrobe).toHaveCount(14);
  await expect(page.getByText("Showing 14 of 14")).toBeVisible();
  await wardrobe.last().getByRole("link").click();
  await expect(page).toHaveURL(/\/products\/demo-/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  expect((await page.goto("/studios/not-a-real-studio"))?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Studio not available" })).toBeVisible();

  // Exercise actual rotation timing and pause behavior without waiting through real intervals.
  await page.goto("/studios");
  const position = carousel.locator("[data-studio-position]");
  await expect(position).toHaveText(`Outfits 1–${window} of 14`);
  await page.clock.install();
  await page.clock.fastForward(6000);
  await expect(position).toHaveText(`Outfits 1–${window} of 14`);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.locator(".launch-note").hover();
  await expect(position).toHaveAttribute("aria-live", "off");
  await page.clock.fastForward(5100);
  await expect(position).toHaveText(`Outfits 2–${window + 1} of 14`);
  await carousel.hover();
  await expect(position).toHaveAttribute("aria-live", "polite");
  await page.clock.fastForward(10000);
  await expect(position).toHaveText(`Outfits 2–${window + 1} of 14`);
  await carousel.focus();
  await page.locator(".launch-note").hover();
  await page.clock.fastForward(6000);
  await expect(position).toHaveText(`Outfits 2–${window + 1} of 14`);
  await page.keyboard.press("Space");
  await page.getByRole("link", { name: "dzirent home", exact: true }).focus();
  await page.clock.fastForward(6000);
  await expect(position).toHaveText(`Outfits 2–${window + 1} of 14`);
  await carousel.focus();
  await page.keyboard.press("Space");
  await page.getByRole("link", { name: "dzirent home", exact: true }).focus();
  await expect(position).toHaveAttribute("aria-live", "off");
  await page.clock.fastForward(5100);
  await expect(position).toHaveText(`Outfits 3–${window + 2} of 14`);
  expect(exceptions).toEqual([]);
});

test("all 6 curated Texas Studios are discoverable with exact outfit counts partitioning all 40 garments", async ({ page }) => {
  const exceptions = trackExceptions(page);
  expect((await page.goto("/studios"))?.status()).toBe(200);

  const directory = page.getByRole("list", { name: "Studios", exact: true });
  const cards = directory.locator("li[data-studio-handle]");
  await expect(cards).toHaveCount(6);

  const expectedStudios = [
    { handle: "sample-lender", name: "Atelier Austin", count: "14 published outfits" },
    { handle: "atelier-valverde", name: "Atelier Valverde", count: "8 published outfits" },
    { handle: "nocturne-houston", name: "Nocturne Houston", count: "6 published outfits" },
    { handle: "zari-heritage", name: "Zari Heritage", count: "5 published outfits" },
    { handle: "maison-marfa", name: "Maison Marfa", count: "4 published outfits" },
    { handle: "sol-san-antonio", name: "Sol Bridal Archive", count: "3 published outfits" },
  ];

  for (const exp of expectedStudios) {
    const card = page.locator(`[data-studio-handle="${exp.handle}"]`);
    await expect(card.getByRole("heading", { name: exp.name })).toBeVisible();
    await expect(card.getByTestId("studio-count")).toHaveText(exp.count);
    await expect(card.getByText("Texas", { exact: true })).toBeVisible();

    // Verify touch target >= 44px for navigation buttons
    const prevBtn = card.getByRole("button", { name: "Previous outfit" });
    const prevBox = (await prevBtn.boundingBox())!;
    expect(prevBox.width).toBeGreaterThanOrEqual(44);
    expect(prevBox.height).toBeGreaterThanOrEqual(44);
  }

  // Verify all 6 Studios have working profile routes and correct wardrobe counts
  const allGarmentIds = new Set<string>();
  for (const exp of expectedStudios) {
    expect((await page.goto(`/studios/${exp.handle}`))?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: exp.name })).toBeVisible();
    await expect(page.getByTestId("studio-count")).toHaveText(exp.count);
    await expect(page.getByText("Texas", { exact: true })).toBeVisible();

    const wardrobe = page.getByRole("list", { name: `${exp.name} wardrobe` }).locator("li[data-product-id]");
    const targetCount = parseInt(exp.count, 10);
    if (targetCount > 8) {
      await expect(wardrobe).toHaveCount(8);
      await page.getByRole("button", { name: "Load more outfits" }).click();
      await expect(wardrobe).toHaveCount(targetCount);
    } else {
      await expect(wardrobe).toHaveCount(targetCount);
    }

    const ids = await wardrobe.evaluateAll(nodes => nodes.map(n => n.getAttribute("data-product-id")!));
    for (const id of ids) allGarmentIds.add(id);
  }

  // Exactly all 40 unique garments partitioned across the 6 studios
  expect(allGarmentIds.size).toBe(40);
  expect(exceptions).toEqual([]);
});

test("product titles and brands are consistent across Studio previews, main catalog, and product detail", async ({ page }) => {
  const exceptions = trackExceptions(page);

  // 1. Check Atelier Austin studio preview -> PDP -> Catalog consistency
  expect((await page.goto("/studios/sample-lender"))?.status()).toBe(200);
  const wardrobe = page.getByRole("list", { name: "Atelier Austin wardrobe" }).locator("li[data-product-id]");
  const firstSlide = wardrobe.first();
  const outfitId = (await firstSlide.getAttribute("data-product-id"))!;
  const expectedTitle = (await firstSlide.locator("span").first().innerText()).trim();
  expect(expectedTitle.length).toBeGreaterThan(0);
  // Title should be a credible editorial title, not a generic placeholder
  expect(expectedTitle).not.toMatch(/^(Black|White|Red|Blue) Dresses \d+$/);

  // Click through to PDP
  await firstSlide.getByRole("link").click();
  await expect(page).toHaveURL(/\/products\/demo-/);
  await expect(page.locator(".detail-copy h1")).toHaveText(expectedTitle);
  await expect(page.locator(".detail-copy .eyebrow")).toHaveText("Atelier Austin");
  await expect(page.locator(".detail-photo img")).toHaveAttribute("alt", new RegExp(expectedTitle));

  // Navigate to main catalog and verify the same product displays identical title and brand
  expect((await page.goto("/"))?.status()).toBe(200);
  const catalogCard = page.locator(`[data-product-id="${outfitId}"]`);
  await expect(catalogCard.locator(".product-title")).toHaveText(expectedTitle);
  await expect(catalogCard.locator(".product-brand")).toHaveText("Atelier Austin");
  await expect(catalogCard.locator(".product-photo img")).toHaveAttribute("alt", new RegExp(expectedTitle));

  // 2. Check a second curated Studio (Atelier Valverde) for identical cross-page consistency
  expect((await page.goto("/studios/atelier-valverde"))?.status()).toBe(200);
  const valverdeWardrobe = page.getByRole("list", { name: "Atelier Valverde wardrobe" }).locator("li[data-product-id]");
  const valverdeSlide = valverdeWardrobe.first();
  const valverdeId = (await valverdeSlide.getAttribute("data-product-id"))!;
  const valverdeTitle = (await valverdeSlide.locator("span").first().innerText()).trim();

  await valverdeSlide.getByRole("link").click();
  await expect(page).toHaveURL(/\/products\/demo-/);
  await expect(page.locator(".detail-copy h1")).toHaveText(valverdeTitle);
  await expect(page.locator(".detail-copy .eyebrow")).toHaveText("Atelier Valverde");

  expect((await page.goto("/"))?.status()).toBe(200);
  const valverdeCard = page.locator(`[data-product-id="${valverdeId}"]`);
  await expect(valverdeCard.locator(".product-title")).toHaveText(valverdeTitle);
  await expect(valverdeCard.locator(".product-brand")).toHaveText("Atelier Valverde");

  expect(exceptions).toEqual([]);
});
