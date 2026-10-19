// Codex integration checks for its web lane. Antigravity owns independent acceptance tests.
/* global document, window, getComputedStyle */
import { chromium, firefox, webkit, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const base = process.env.DZIRENT_SMOKE_URL ?? "http://127.0.0.1:3000";
const engines = { chromium, firefox, webkit };
const requested = (process.env.DZIRENT_SMOKE_BROWSERS ?? "chromium").split(",");
const output = "test-results/web-integration";
const manifest = JSON.parse(await readFile(new URL("../../../fixtures/catalog/manifest.json", import.meta.url), "utf8"));
// The browser assertions use visible behavior; this manifest is only an independent amount/count oracle.
const reports = [];
await mkdir(output, { recursive: true });
async function step(name, run) { await run(); console.log(`PASS ${name}`); }
async function openHome(page) { await page.goto(base); await expect(page.locator("[data-product-id]")).toHaveCount(40); }
async function homeViaLogo(page) { await page.getByRole("link", { name: "dzirent home" }).click(); await expect(page.locator("[data-product-id]")).toHaveCount(40); }
async function closeNotice(page) { const close = page.getByRole("button", { name: "Dismiss notification" }); if (await close.isVisible()) await close.click(); }
async function noOverflow(page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true); }
async function axe(page) { const results = await new AxeBuilder({ page }).analyze(); expect(results.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]); return results.violations.length; }
async function catalogFlow(page) {
  await step("keyboard mega-menu closes and restores focus", async () => {
    const women = page.locator(".collection-link").getByText("Women", { exact: true });
    await women.focus(); await expect(women).toHaveAttribute("aria-expanded", "true");
    await women.press("ArrowDown"); await expect(page.getByRole("button", { name: "Shop the collection" })).toBeFocused();
    await page.keyboard.press("Escape"); await expect(women).toBeFocused(); await expect(women).toHaveAttribute("aria-expanded", "false");
    await women.click(); await page.getByRole("button", { name: "Shop the collection" }).click();
    await expect(page).toHaveURL(/collection=women/); await expect(page.locator("[data-product-id]")).toHaveCount(5);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Women (5)");
    await expect(page.locator(".subcategory-pills button")).toHaveCount(6);
  });
  await step("secondary memberships deduplicate Designer and drawer resets collections", async () => {
    await page.locator(".collection-link").getByText("Designer", { exact: true }).click(); await page.getByRole("button", { name: "Shop the collection" }).click();
    await expect(page.locator("[data-product-id]")).toHaveCount(7);
    await page.getByRole("button", { name: "Shop All", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Shop all collections" })).toBeVisible();
    await page.getByRole("button", { name: "All outfits", exact: true }).click();
    await expect(page.locator("[data-product-id]")).toHaveCount(40);
  });
  await step("search, history, immediate facets and draft discard/apply", async () => {
    const search = page.getByRole("searchbox", { name: "Search outfits" });
    await search.fill("Sherwanis"); await expect(page).toHaveURL(/q=Sherwanis/); await expect(page.locator("[data-product-id]")).toHaveCount(1);
    await search.press("Escape"); await expect(page.locator("[data-product-id]")).toHaveCount(40);
    await page.getByRole("button", { name: "Color", exact: true }).click(); await page.getByRole("checkbox", { name: "Black", exact: true }).click();
    await expect(page.getByRole("checkbox", { name: "Black", exact: true })).toBeChecked();
    await page.keyboard.press("Escape"); await expect(page.locator("[data-product-id]")).toHaveCount(5);
    await page.getByRole("button", { name: /^Filters/ }).click();
    let dialog = page.getByRole("dialog", { name: "Find your fit" });
    await dialog.getByRole("checkbox", { name: "Red", exact: true }).check();
    await expect(dialog.getByRole("button", { name: "Show 10 results" })).toBeEnabled();
    await page.keyboard.press("Escape"); await expect(page.getByRole("button", { name: /^Filters/ })).toBeFocused(); await expect(page.locator("[data-product-id]")).toHaveCount(5); expect(new URL(page.url()).searchParams.getAll("color")).toEqual(["black"]);
    await page.getByRole("button", { name: /^Filters/ }).click(); dialog = page.getByRole("dialog", { name: "Find your fit" });
    await expect(dialog.getByRole("checkbox", { name: "Red", exact: true })).not.toBeChecked();
    await dialog.getByRole("checkbox", { name: "Red", exact: true }).check(); await dialog.getByRole("button", { name: "Show 10 results" }).click();
    await expect(page.locator("[data-product-id]")).toHaveCount(10);
    await page.goBack(); await expect(page.locator("[data-product-id]")).toHaveCount(5);
    await page.goForward(); await expect(page.locator("[data-product-id]")).toHaveCount(10);
    await page.getByRole("button", { name: "Clear all", exact: true }).click(); await expect(page.locator("[data-product-id]")).toHaveCount(40);
  });
  await step("stable sort and actual list layout preserve URL", async () => {
    await page.getByLabel("Sort outfits").selectOption("price_asc"); await expect(page).toHaveURL(/sort=price_asc/);
    await expect.poll(async () => { const numeric = (await page.locator(".card-price strong").allTextContents()).map(s => Number(s.replace(/[^\d.]/g, ""))); return numeric.every((value, i) => i === 0 || value >= numeric[i - 1]); }).toBe(true);
    await page.getByRole("button", { name: "List view", exact: true }).click(); await expect(page.locator(".catalog-results")).toHaveClass(/list-view/);
    const box = await page.locator(".product-photo").first().boundingBox(); expect(box.width).toBeLessThan(200);
    await page.getByRole("button", { name: "Grid view", exact: true }).click(); await page.getByLabel("Sort outfits").selectOption("featured");
  });
  await step("four-day calendar, invalid dates and ZIP mapping", async () => {
    await page.getByRole("button", { name: "Rental Dates", exact: true }).click();
    await page.getByRole("button", { name: /Monday, November 2nd, 2026/ }).first().click();
    await page.keyboard.press("Escape"); await expect(page).toHaveURL(/end=2026-11-05.*start=2026-11-02/);
    const eligible = manifest.products.filter(p => p.is_available && !p.date_blocks.some(b => "2026-11-02" <= b.end && "2026-11-05" >= b.start)).length;
    await expect(page.locator("[data-product-id]")).toHaveCount(eligible);
    await page.getByRole("button", { name: "Clear all", exact: true }).click();
    await page.getByRole("button", { name: "Location", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Choose your location" });
    await dialog.getByLabel("ZIP code").fill("123"); await dialog.getByRole("button", { name: "Apply location" }).click();
    await expect(dialog.getByText("Enter a five-digit ZIP code.")).toBeVisible();
    await dialog.getByLabel("ZIP code").fill("99999"); await expect(dialog.getByText(/Other Texas \/ demo location/)).toBeVisible();
    await dialog.getByRole("button", { name: "Apply location" }).click(); await expect(page).toHaveURL(/metro=other-texas/);
    await page.getByRole("button", { name: "Clear all", exact: true }).click();
    await page.goto(`${base}/?start=2026-11-02&end=2026-11-06`); await expect(page.getByRole("heading", { name: "Check your rental dates" })).toBeVisible();
    await page.getByRole("button", { name: "Clear invalid dates" }).click(); await expect(page.locator("[data-product-id]")).toHaveCount(40);
  });
  await step("empty result recovery and one-shot API error recovery", async () => {
    await page.getByRole("searchbox", { name: "Search outfits" }).fill("no-such-garment-xyz"); await expect(page.getByRole("heading", { name: "No outfits just yet" })).toBeVisible();
    await page.getByRole("button", { name: "Clear all filters" }).click(); await expect(page.locator("[data-product-id]")).toHaveCount(40);
    await page.getByRole("button", { name: "Demo controls" }).click(); await page.getByRole("button", { name: "Simulate catalog error" }).click();
    await expect(page.getByRole("heading", { name: "Something didn’t load" })).toBeVisible(); await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(page.locator("[data-product-id]")).toHaveCount(40); await closeNotice(page);
  });
}
async function bagFlow(page) {
  await step("PDP size validation, duplicate protection, two-unit bag and preview", async () => {
    await page.locator(".product-title").first().click(); await expect(page.locator("#garment-size")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add to bag", exact: true })).toBeDisabled();
    await page.locator("#garment-size").selectOption({ index: 1 }); await page.getByRole("button", { name: "Add to bag", exact: true }).click();
    await expect(page.getByRole("link", { name: "Bag 1 item", exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "Add to bag", exact: true })).toBeDisabled();
    await homeViaLogo(page); await page.locator(".product-title").nth(1).click(); await page.locator("#garment-size").selectOption({ index: 1 }); await page.getByRole("button", { name: "Add to bag", exact: true }).click();
    await page.getByRole("link", { name: "Bag 2 items", exact: true }).click(); await expect(page.locator(".bag-line")).toHaveCount(2);
    await page.reload(); await expect(page.locator(".bag-line")).toHaveCount(2);
    const costs = (await page.locator(".bag-line-price").allTextContents()).map(x => Math.round(Number(x.replace(/[^\d.]/g, "")) * 100));
    expect(await page.locator("dd.summary-total").innerText()).toBe(new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: costs.reduce((a,b)=>a+b,0) % 100 ? 2 : 0 }).format(costs.reduce((a,b)=>a+b,0) / 100));
    await page.getByRole("link", { name: "Checkout preview" }).click(); await expect(page.getByRole("heading", { level: 1, name: "Presentation preview" })).toBeVisible();
    await expect(page.getByText("No payment, reservation or booking will be created.", { exact: true })).toBeVisible(); await expect(page.locator(".bag-line")).toHaveCount(2);
    await page.getByRole("link", { name: "Edit your bag" }).click(); await page.getByRole("button", { name: /^Remove .+ from bag$/ }).first().click(); await expect(page.locator(".bag-line")).toHaveCount(1); await closeNotice(page);
    await homeViaLogo(page);
  });
}
async function lenderFlow(page) {
  await step("centered sample auth, safe return and renter enrollment", async () => {
    await page.getByRole("button", { name: "Account", exact: true }).click(); await page.getByRole("link", { name: "Sign in as renter", exact: true }).click();
    const modal = page.getByRole("dialog", { name: "Welcome back, renter" }); await expect(modal).toBeVisible();
    await page.keyboard.press("Escape"); await expect(modal).not.toBeVisible(); await expect(page.locator("#header-account")).toBeFocused();
    await page.getByRole("button", { name: "Account", exact: true }).click(); await page.getByRole("link", { name: "Sign in as renter", exact: true }).click();
    await page.getByRole("button", { name: "Show sample password" }).click(); await expect(page.getByLabel("Sample password", { exact: true })).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Continue as sample renter" }).click(); await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.getByRole("link", { name: "List an outfit", exact: true }).click(); await expect(page.getByRole("dialog", { name: "Share your wardrobe" })).toBeVisible();
    await page.getByRole("button", { name: "Create sample lender profile" }).click(); await expect(page.getByRole("heading", { name: "Your wardrobe starts here" })).toBeVisible();
    await page.getByRole("button", { name: "Account", exact: true }).click(); await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page.getByRole("button", { name: "Account", exact: true }).click(); await page.getByRole("link", { name: "Sign in as lender", exact: true }).click();
    await page.getByRole("button", { name: "Continue as sample lender" }).click(); await expect(page.locator("[data-listing-id]")).toHaveCount(40);
    await closeNotice(page); await axe(page);
  });
  await step("optimistic availability failure rolls back", async () => {
    const toggle = page.getByRole("switch").first(), checked = await toggle.isChecked();
    await page.getByRole("button", { name: "Demo controls" }).click(); await page.getByRole("button", { name: "Fail the next listing save" }).click();
    await toggle.click(); await expect(page.getByRole("status")).toContainText("Availability was restored"); await expect(toggle).toBeChecked({ checked }); await closeNotice(page);
    await toggle.click(); await expect(toggle).toBeChecked({ checked: !checked }); await expect(toggle).toBeEnabled(); await toggle.click(); await expect(toggle).toBeChecked({ checked });
  });
  await step("listing validation, date blocks, create/edit/draft/publish/archive", async () => {
    await page.getByRole("button", { name: "Demo controls" }).click(); await page.getByRole("button", { name: "Fail the next listing save" }).click();
    await page.getByRole("button", { name: "Create listing", exact: true }).click();
    let dialog = page.getByRole("dialog", { name: "Create a mock listing" });
    await dialog.getByRole("button", { name: "Publish mock listing" }).click(); await expect(dialog.getByText("Please review the highlighted fields before saving.")).toBeVisible();
    await axe(page);
    await dialog.getByLabel("Outfit title", { exact: true }).fill("Integration occasion dress"); await dialog.getByLabel("Description", { exact: true }).fill("An illustrative mock listing created by the web integration check.");
    await dialog.getByLabel(/^Subcategory/).selectOption({ index: 1 }); await dialog.getByLabel(/^Brand/).selectOption({ index: 1 });
    await dialog.getByLabel(/^Garment type/).fill("dress"); await dialog.getByLabel(/^Listed size/).selectOption({ index: 1 });
    await dialog.getByLabel(/^Fabric/).fill("silk"); await dialog.getByLabel(/^Occasion/).fill("party"); await dialog.getByRole("checkbox", { name: "Black", exact: true }).check();
    await dialog.getByLabel(/^Four-day sample rental/).fill("49.99"); await dialog.getByLabel(/^Sample retail/).fill("275");
    await dialog.getByLabel("Unavailable from", { exact: true }).fill("2026-12-01"); await dialog.getByLabel("Unavailable through", { exact: true }).fill("2026-12-04"); await dialog.getByRole("button", { name: "Add date block" }).click();
    await dialog.getByRole("button", { name: "Choose fixture photo" }).click(); await page.getByRole("button", { name: "Use demo photo 3", exact: true }).click();
    await dialog.getByRole("button", { name: "Save draft", exact: true }).click(); await expect(dialog.getByText("Simulated save failure. Your changes were not saved.", { exact: true })).toBeVisible();
    await expect(dialog.getByLabel("Outfit title", { exact: true })).toHaveValue("Integration occasion dress"); await expect(page.locator("[data-listing-id]")).toHaveCount(40);
    await dialog.getByRole("button", { name: "Save draft", exact: true }).click(); await expect(dialog).not.toBeVisible(); await expect(page.locator("[data-listing-id]")).toHaveCount(41);
    let row = page.locator(".listing-row").filter({ has: page.getByRole("heading", { name: "Integration occasion dress", exact: true }) }); await expect(row.locator(".status-tag")).toHaveText("draft");
    await row.getByRole("button", { name: "Edit Integration occasion dress", exact: true }).click(); dialog = page.getByRole("dialog", { name: "Edit mock listing" });
    await expect(dialog.getByText("2026-12-01 – 2026-12-04", { exact: true })).toBeVisible(); await dialog.getByLabel("Outfit title", { exact: true }).fill("Integration edited dress"); await dialog.getByRole("button", { name: "Save & publish" }).click();
    await expect(dialog).not.toBeVisible(); row = page.locator(".listing-row").filter({ has: page.getByRole("heading", { name: "Integration edited dress", exact: true }) }); await expect(row.locator(".status-tag")).toHaveText("published");
    await row.getByRole("link", { name: "View Integration edited dress", exact: true }).click(); await expect(page.getByRole("heading", { level: 1, name: "Integration edited dress" })).toBeVisible();
    await page.getByRole("button", { name: "Account", exact: true }).click(); await page.getByRole("link", { name: "Lender dashboard", exact: true }).click();
    row = page.locator(".listing-row").filter({ has: page.getByRole("heading", { name: "Integration edited dress", exact: true }) });
    await row.getByRole("button", { name: "Archive Integration edited dress", exact: true }).click(); await page.getByRole("button", { name: "Keep listing", exact: true }).click(); await expect(row.locator(".status-tag")).toHaveText("published");
    await row.getByRole("button", { name: "Archive Integration edited dress", exact: true }).click(); await page.getByRole("button", { name: "Archive mock listing", exact: true }).click(); await expect(row.locator(".status-tag")).toHaveText("archived");
    await page.getByRole("button", { name: "Demo controls" }).click(); await page.getByRole("button", { name: "Reset demo", exact: true }).click(); await expect(page.locator("[data-product-id]")).toHaveCount(40); await closeNotice(page);
    await expect(page.getByRole("link", { name: "Bag 0 items", exact: true })).toBeVisible();
  });
}

for (const name of requested) {
  const engine = engines[name]; if (!engine) throw new Error(`Unknown browser ${name}`);
  const browser = await engine.launch();
  try {
    for (const width of (process.env.DZIRENT_SMOKE_WIDTHS ?? "390,768,1100,1440").split(",").map(Number)) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
      const page = await context.newPage(), exceptions = [], errors = [];
      page.setDefaultTimeout(10000); page.setDefaultNavigationTimeout(20000);
      page.on("pageerror", e => exceptions.push(e.message)); page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
      try {
        await step(`${name} ${width}px catalog, images, grid and accessibility`, async () => {
          await openHome(page); await page.waitForFunction(() => Array.from(document.querySelectorAll(".product-photo img")).slice(0,4).every(i => i.complete && i.naturalWidth > 0));
          const columns = await page.locator(".product-grid").evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").length); expect(columns).toBe(width >= 1280 ? 4 : width >= 1024 ? 3 : width >= 640 ? 2 : 1);
          await noOverflow(page); await axe(page); expect(errors).toEqual([]); expect(exceptions).toEqual([]);
          await page.screenshot({ path: `${output}/${name}-${width}.png`, fullPage: false });
        });
        if (width === 1440 && name === "chromium") { await catalogFlow(page); await bagFlow(page); await lenderFlow(page); }
        if (width === 390) {
          await step(`${name} touch-size drawer/search/dialog`, async () => {
            await page.getByRole("button", { name: "Shop All", exact: true }).click(); await axe(page); await page.keyboard.press("Escape"); await expect(page.getByRole("button", { name: "Shop All", exact: true })).toBeFocused();
            await page.getByRole("button", { name: "Open search" }).click(); await page.getByRole("searchbox", { name: "Search outfits" }).fill("Sherwanis"); await page.getByRole("button", { name: "Search", exact: true }).click(); await expect(page.locator("[data-product-id]")).toHaveCount(1);
            await noOverflow(page);
          });
        }
        expect(exceptions).toEqual([]);
        reports.push({ browser: name, version: browser.version(), width, status: "passed", exceptions, consoleErrors: errors });
      } catch (error) { await page.screenshot({ path: `${output}/${name}-${width}-failure.png`, fullPage: true }); reports.push({ browser: name, width, url: page.url(), status: "failed", error: String(error), exceptions, consoleErrors: errors }); throw error; }
      finally { await context.close(); await writeFile(`${output}/results-${requested.join("-")}.json`, JSON.stringify({ base, manifestProducts: manifest.products.length, reports }, null, 2)); }
    }
  } finally { await browser.close(); }
}
console.log(JSON.stringify({ base, reports }, null, 2));
