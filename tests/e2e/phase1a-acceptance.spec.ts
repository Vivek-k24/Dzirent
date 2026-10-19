import { test, expect, cards, catalog, axe, trapped, search, signInLender } from "./support";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const manifestPath = resolve(__dirname, "../../fixtures/catalog/manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

test.describe("Phase 1A Presentation Acceptance Suite", () => {
  test("REQ-1A-01 & REQ-1A-02: 40 original garments, four content sections, and layout geometry", async ({
    page,
  }) => {
    await catalog(page);
    await expect(page.getByRole("heading", { level: 1, name: "Trending outfits (40)" })).toBeVisible();
    await expect(page.getByText("DEMO PREVIEW", { exact: false })).toBeVisible();

    // Four content sections
    for (const section of ["merchandising", "context", "controls", "results"]) {
      await expect(page.locator(`[data-section=${section}]`)).toBeVisible();
    }

    // Merchandising height constraint and responsive column geometry
    const geometry = await page.evaluate(() => {
      const grid = document.querySelector(".product-grid")!;
      const hero = document.querySelector(".merchandising")!;
      return {
        columns: getComputedStyle(grid).gridTemplateColumns.split(" ").length,
        heroHeight: hero.getBoundingClientRect().height,
        overflow: document.documentElement.scrollWidth - innerWidth,
      };
    });

    const width = page.viewportSize()!.width;
    expect(geometry.columns).toBe(width >= 1280 ? 4 : width >= 1024 ? 3 : width >= 640 ? 2 : 1);
    expect(geometry.heroHeight).toBeLessThanOrEqual(width < 640 ? 180 : 240);
    expect(geometry.overflow).toBeLessThanOrEqual(1);

    // Verify 40 unique product IDs rendered
    const ids = await cards(page).evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-product-id")));
    expect(new Set(ids).size).toBe(40);
  });

  test("REQ-1A-03: Header actions, debounced search, and Texas location dialog", async ({ page }) => {
    await catalog(page);

    // Sticky header
    await expect(page.locator("header")).toBeVisible();

    // Debounced search updates URL and filters items
    await search(page, "Sherwanis");
    await expect(cards(page)).toHaveCount(1);
    expect(page.url()).toContain("q=Sherwanis");

    // Clear search
    await search(page, "");
    await expect(cards(page)).toHaveCount(40);

    // Location dialog
    await page.getByRole("button", { name: "Location", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Choose your location" });
    await expect(dialog).toBeVisible();

    // 5-digit zip validation
    await dialog.getByLabel("ZIP code").fill("123");
    await dialog.getByRole("button", { name: "Apply location" }).click();
    await expect(dialog.getByText("Enter a five-digit ZIP code.")).toBeVisible();

    // Mapped zip -> Austin
    await dialog.getByLabel("ZIP code").fill("78701");
    await expect(dialog.locator("#location-metro")).toHaveValue("austin");

    // Unmapped Texas zip
    await dialog.getByLabel("ZIP code").fill("99999");
    await expect(dialog.getByText(/Other Texas \/ demo location/)).toBeVisible();

    await dialog.getByRole("button", { name: "Apply location" }).click();
    await expect(page).toHaveURL(/metro=other-texas/);

    // Clear all restores catalog
    await page.getByRole("button", { name: "Clear all", exact: true }).click();
    await expect(cards(page)).toHaveCount(40);
  });

  test("REQ-1A-04: Category navigation, mega-menus, and Shop All left drawer", async ({ page }) => {
    await catalog(page);

    // Keyboard mega-menu closes and restores focus
    const women = page.locator(".collection-link").getByText("Women", { exact: true });
    await women.focus();
    await expect(women).toHaveAttribute("aria-expanded", "true");
    await women.press("ArrowDown");
    await expect(page.getByRole("button", { name: "Shop the collection" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(women).toBeFocused();
    await expect(women).toHaveAttribute("aria-expanded", "false");

    // Navigate to collection via Shop the collection
    await women.click();
    await page.getByRole("button", { name: "Shop the collection" }).click();
    await expect(page).toHaveURL(/collection=women/);
    await expect(cards(page)).toHaveCount(5);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Women (5)");
    await expect(page.locator(".subcategory-pills button")).toHaveCount(6);

    // Secondary memberships deduplication (Designer has 7 items)
    await page.locator(".collection-link").getByText("Designer", { exact: true }).click();
    await page.getByRole("button", { name: "Shop the collection" }).click();
    await expect(cards(page)).toHaveCount(7);

    // Shop All Drawer: focus trap and Escape key
    await page.getByRole("button", { name: "Shop All", exact: true }).click();
    const drawer = page.getByRole("dialog", { name: "Shop all collections" });
    await expect(drawer).toBeVisible();
    await trapped(page);

    await page.keyboard.press("Escape");
    await expect(drawer).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Shop All", exact: true })).toBeFocused();

    // Shop All -> All outfits resets
    await page.getByRole("button", { name: "Shop All", exact: true }).click();
    await page.getByRole("button", { name: "All outfits", exact: true }).click();
    await expect(cards(page)).toHaveCount(40);
  });

  test("REQ-1A-05 & REQ-1A-06: Facet popovers, draft filter sheet, history, and 4-day dates", async ({ page }) => {
    await catalog(page);

    // Immediate popover filter (Color -> Black)
    await page.getByRole("button", { name: "Color", exact: true }).click();
    await page.getByRole("checkbox", { name: "Black", exact: true }).click();
    await expect(page.getByRole("checkbox", { name: "Black", exact: true })).toBeChecked();
    await page.keyboard.press("Escape");
    await expect(cards(page)).toHaveCount(5);

    // Draft filter sheet: closing without apply discards changes
    await page.getByRole("button", { name: /^Filters/ }).click();
    let filterDialog = page.getByRole("dialog", { name: "Find your fit" });
    await filterDialog.getByRole("checkbox", { name: "Red", exact: true }).check();
    await expect(filterDialog.getByRole("button", { name: "Show 10 results" })).toBeEnabled();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: /^Filters/ })).toBeFocused();
    await expect(cards(page)).toHaveCount(5);
    expect(new URL(page.url()).searchParams.getAll("color")).toEqual(["black"]);

    // Draft filter sheet: applying updates URL and results
    await page.getByRole("button", { name: /^Filters/ }).click();
    filterDialog = page.getByRole("dialog", { name: "Find your fit" });
    await expect(filterDialog.getByRole("checkbox", { name: "Red", exact: true })).not.toBeChecked();
    await filterDialog.getByRole("checkbox", { name: "Red", exact: true }).check();
    await filterDialog.getByRole("button", { name: "Show 10 results" }).click();
    await expect(cards(page)).toHaveCount(10);

    // Browser Back / Forward state restoration
    await page.goBack();
    await expect(cards(page)).toHaveCount(5);
    await page.goForward();
    await expect(cards(page)).toHaveCount(10);

    await page.getByRole("button", { name: "Clear all", exact: true }).click();
    await expect(cards(page)).toHaveCount(40);

    // 4-day rental interval enforcement using canonical demo dates
    await page.getByRole("button", { name: "Rental Dates", exact: true }).click();
    await page.getByRole("button", { name: /Monday, November 2nd, 2026/ }).first().click();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/end=2026-11-05.*start=2026-11-02/);

    const eligible = manifest.products.filter(
      (p: any) =>
        p.is_available &&
        !p.date_blocks.some((b: any) => "2026-11-02" <= b.end && "2026-11-05" >= b.start)
    ).length;
    await expect(cards(page)).toHaveCount(eligible);

    // Malformed/non-4-day date range shows visible warning
    await page.goto("/?start=2026-11-02&end=2026-11-06");
    await expect(page.getByRole("heading", { name: "Check your rental dates" })).toBeVisible();
    await page.getByRole("button", { name: "Clear invalid dates" }).click();
    await expect(cards(page)).toHaveCount(40);
  });

  test("REQ-1A-07: Sorting reorders products and grid/list view toggle", async ({ page }) => {
    await catalog(page);

    // Price Low to High sorting
    await page.getByLabel("Sort outfits").selectOption("price_asc");
    await expect(page).toHaveURL(/sort=price_asc/);

    await expect
      .poll(async () => {
        const numeric = (await page.locator(".card-price strong").allTextContents()).map((s) =>
          Number(s.replace(/[^\d.]/g, ""))
        );
        return numeric.every((value, i) => i === 0 || value >= numeric[i - 1]);
      })
      .toBe(true);

    // List view toggle alters layout class and photo dimensions
    await page.getByRole("button", { name: "List view", exact: true }).click();
    await expect(page.locator(".catalog-results")).toHaveClass(/list-view/);
    const box = await page.locator(".product-photo").first().boundingBox();
    expect(box!.width).toBeLessThan(200);

    // Grid view restores standard grid
    await page.getByRole("button", { name: "Grid view", exact: true }).click();
    await page.getByLabel("Sort outfits").selectOption("featured");
  });

  test("REQ-1A-08 & REQ-1A-09: PDP layout, thumbnails, measurements, and unknown product 404", async ({
    page,
  }) => {
    // Valid PDP layout and measurements
    await catalog(page);
    await page.locator(".product-title").first().click();
    await expect(page.locator("#garment-size")).toBeVisible();
    await expect(page.locator(".measurement-strip")).toBeVisible();

    // Unknown outfit MUST return true HTTP 404
    test.info().annotations.push({ type: "intentional-http-error", description: "Verifying 404 for unknown product" });
    const response = await page.goto("/products/unknown-outfit-slug");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Outfit not found" })).toBeVisible();
  });

  test("REQ-1A-10: Cart badge, duplicate item protection, and non-transactional preview", async ({
    page,
  }) => {
    await catalog(page);

    // First garment: add to bag
    await page.locator(".product-title").first().click();
    await expect(page.getByRole("button", { name: "Add to bag", exact: true })).toBeDisabled();
    await page.locator("#garment-size").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Add to bag", exact: true }).click();

    // Verify badge updates immediately and add-to-bag disables to prevent overlapping duplicate
    await expect(page.getByRole("link", { name: "Bag 1 item", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add to bag", exact: true })).toBeDisabled();

    // Second garment: add to bag
    await page.getByRole("link", { name: "dzirent home" }).click();
    await page.locator(".product-title").nth(1).click();
    await page.locator("#garment-size").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Add to bag", exact: true }).click();
    await expect(page.getByRole("link", { name: "Bag 2 items", exact: true })).toBeVisible();

    // Cart persistence across reload
    await page.getByRole("link", { name: "Bag 2 items", exact: true }).click();
    await expect(page.locator(".bag-line")).toHaveCount(2);
    await page.reload();
    await expect(page.locator(".bag-line")).toHaveCount(2);

    // Non-transactional checkout preview
    await page.getByRole("link", { name: "Checkout preview" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Presentation preview" })).toBeVisible();
    await expect(page.getByText("No payment, reservation or booking will be created.", { exact: true })).toBeVisible();
    await expect(page.locator(".bag-line")).toHaveCount(2);

    // Edit bag: remove line item
    await page.getByRole("link", { name: "Edit your bag" }).click();
    await page.getByRole("button", { name: /^Remove .+ from bag$/ }).first().click();
    await expect(page.locator(".bag-line")).toHaveCount(1);

    // Reset demo state via Demo controls
    await page.getByRole("button", { name: "Demo controls" }).click();
    await page.getByRole("button", { name: "Reset demo", exact: true }).click();
    await expect(page.getByRole("link", { name: "Bag 0 items", exact: true })).toBeVisible();
  });

  test("REQ-1A-11: Centered sample authentication, focus trap, and lender redirect", async ({ page }) => {
    await catalog(page);

    // Account menu -> Sign in as renter
    await page.getByRole("button", { name: "Account", exact: true }).click();
    await page.getByRole("link", { name: "Sign in as renter", exact: true }).click();

    const modal = page.getByRole("dialog", { name: "Welcome back, renter" });
    await expect(modal).toBeVisible();
    await trapped(page);

    // Escape closes modal and restores focus
    await page.keyboard.press("Escape");
    await expect(modal).not.toBeVisible();
    await expect(page.locator("#header-account")).toBeFocused();

    // Show/hide sample password
    await page.getByRole("button", { name: "Account", exact: true }).click();
    await page.getByRole("link", { name: "Sign in as renter", exact: true }).click();
    await page.getByRole("button", { name: "Show sample password" }).click();
    await expect(page.getByLabel("Sample password", { exact: true })).toHaveAttribute("type", "text");

    // Continue as sample renter
    await page.getByRole("button", { name: "Continue as sample renter" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();

    // Renter enrollment to lender profile
    await page.getByRole("link", { name: "List an outfit", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Share your wardrobe" })).toBeVisible();
    await page.getByRole("button", { name: "Create sample lender profile" }).click();
    await expect(page.getByRole("heading", { name: "Your wardrobe starts here" })).toBeVisible();

    // Sign out
    await page.getByRole("button", { name: "Account", exact: true }).click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();

    // Sign in as lender redirects to dashboard
    await page.getByRole("button", { name: "Account", exact: true }).click();
    await page.getByRole("link", { name: "Sign in as lender", exact: true }).click();
    await page.getByRole("button", { name: "Continue as sample lender" }).click();
    await expect(page).toHaveURL(/lender\/dashboard/);
    await expect(page.locator(".listing-row")).toHaveCount(40);
  });

  test("REQ-1A-12: Lender dashboard listings, optimistic rollback, and full CRUD simulation", async ({
    page,
  }) => {
    test.info().annotations.push({
      type: "intentional-http-error",
      description: "Testing simulated 503 save failure and optimistic rollback",
    });

    await signInLender(page);

    // 40 seed listings present
    await expect(page.locator(".listing-row")).toHaveCount(40);

    // Availability toggle with optimistic rollback simulation
    const toggle = page.getByRole("switch").first();
    const checked = await toggle.isChecked();

    await page.getByRole("button", { name: "Demo controls" }).click();
    await page.getByRole("button", { name: "Fail the next listing save" }).click();
    await toggle.click();
    await expect(page.getByRole("status")).toContainText("Availability was restored");
    await expect(toggle).toBeChecked({ checked });

    // Successful availability toggle
    await toggle.click();
    await expect(toggle).toBeChecked({ checked: !checked });
    await expect(toggle).toBeEnabled();
    await toggle.click();
    await expect(toggle).toBeChecked({ checked });

    // Create listing validation and draft save failure
    await page.getByRole("button", { name: "Demo controls" }).click();
    await page.getByRole("button", { name: "Fail the next listing save" }).click();
    await page.getByRole("button", { name: "Create listing", exact: true }).click();

    let dialog = page.getByRole("dialog", { name: "Create a mock listing" });
    await dialog.getByRole("button", { name: "Publish mock listing" }).click();
    await expect(dialog.getByText("Please review the highlighted fields before saving.")).toBeVisible();

    // Fill new listing form
    await dialog.getByLabel("Outfit title", { exact: true }).fill("QA verification occasion dress");
    await dialog.getByLabel("Description", { exact: true }).fill("An illustrative mock listing created by QA acceptance.");
    await dialog.getByLabel(/^Subcategory/).selectOption({ index: 1 });
    await dialog.getByLabel(/^Brand/).selectOption({ index: 1 });
    await dialog.getByLabel(/^Garment type/).fill("dress");
    await dialog.getByLabel(/^Listed size/).selectOption({ index: 1 });
    await dialog.getByLabel(/^Fabric/).fill("silk");
    await dialog.getByLabel(/^Occasion/).fill("party");
    await dialog.getByRole("checkbox", { name: "Black", exact: true }).check();
    await dialog.getByLabel(/^Four-day sample rental/).fill("49.99");
    await dialog.getByLabel(/^Sample retail/).fill("275");
    await dialog.getByLabel("Unavailable from", { exact: true }).fill("2026-12-01");
    await dialog.getByLabel("Unavailable through", { exact: true }).fill("2026-12-04");
    await dialog.getByRole("button", { name: "Add date block" }).click();
    await dialog.getByRole("button", { name: "Choose fixture photo" }).click();
    await page.getByRole("button", { name: "Use demo photo 3", exact: true }).click();

    // Save draft failure
    await dialog.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(dialog.getByText("Simulated save failure. Your changes were not saved.", { exact: true })).toBeVisible();
    await expect(page.locator("[data-listing-id]")).toHaveCount(40);

    // Save draft retry (success)
    await dialog.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.locator("[data-listing-id]")).toHaveCount(41);

    let row = page.locator(".listing-row").filter({ has: page.getByRole("heading", { name: "QA verification occasion dress", exact: true }) });
    await expect(row.locator(".status-tag")).toHaveText("draft");

    // Edit listing to published
    await row.getByRole("button", { name: "Edit QA verification occasion dress", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Edit mock listing" });
    await expect(dialog.getByText("2026-12-01 – 2026-12-04", { exact: true })).toBeVisible();
    await dialog.getByLabel("Outfit title", { exact: true }).fill("QA edited occasion dress");
    await dialog.getByRole("button", { name: "Save & publish" }).click();
    await expect(dialog).not.toBeVisible();

    row = page.locator(".listing-row").filter({ has: page.getByRole("heading", { name: "QA edited occasion dress", exact: true }) });
    await expect(row.locator(".status-tag")).toHaveText("published");

    // Archive listing
    await row.getByRole("button", { name: "Archive QA edited occasion dress", exact: true }).click();
    await page.getByRole("button", { name: "Keep listing", exact: true }).click();
    await expect(row.locator(".status-tag")).toHaveText("published");

    await row.getByRole("button", { name: "Archive QA edited occasion dress", exact: true }).click();
    await page.getByRole("button", { name: "Archive mock listing", exact: true }).click();
    await expect(row.locator(".status-tag")).toHaveText("archived");

    // Reset demo
    await page.getByRole("button", { name: "Demo controls" }).click();
    await page.getByRole("button", { name: "Reset demo", exact: true }).click();
    await expect(page.locator("[data-product-id]")).toHaveCount(40);
  });

  test("REQ-1A-13: Accessibility with axe-core across primary application views", async ({ page }) => {
    await catalog(page);
    await axe(page);

    await page.goto("/cart");
    await axe(page);

    await page.goto("/checkout/preview");
    await axe(page);
  });

  test("REQ-1A-14: Empty search state and one-shot API catalog error recovery", async ({ page }) => {
    test.info().annotations.push({
      type: "intentional-http-error",
      description: "Testing simulated catalog error recovery",
    });

    await catalog(page);

    // Empty search state
    await search(page, "no-such-garment-xyz");
    await expect(page.getByRole("heading", { name: "No outfits just yet" })).toBeVisible();
    await page.getByRole("button", { name: "Clear all filters" }).click();
    await expect(cards(page)).toHaveCount(40);

    // Catalog 503 error simulation and retry
    await page.getByRole("button", { name: "Demo controls" }).click();
    await page.getByRole("button", { name: "Simulate catalog error" }).click();
    await expect(page.getByRole("heading", { name: "Something didn’t load" })).toBeVisible();
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(cards(page)).toHaveCount(40);
  });
});
