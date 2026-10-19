import { test as base, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
export const test = base.extend<{ diagnostics: void }>({ diagnostics: [async ({ page }, use, info) => {
  const errors: string[] = [], exceptions: string[] = [], failedAssets: string[] = [];
  page.on("console", message => {
    if (message.type() === "error" && !message.text().includes("A ServiceWorker intercepted the request")) {
      errors.push(message.text());
    }
  });
  page.on("pageerror", error => {
    if (!error.message.includes("due to access control checks")) {
      exceptions.push(error.message);
    }
  });
  page.on("requestfailed", request => {
    if (["image", "script", "stylesheet", "font"].includes(request.resourceType())) {
      const errorText = request.failure()?.errorText || "";
      if (!/cancelled|canceled|abort|NS_BINDING_ABORTED|ERR_ABORTED/i.test(errorText)) {
        failedAssets.push(`${request.url()} ${errorText}`);
      }
    }
  });
  await use();
  await info.attach("browser-diagnostics", { body: JSON.stringify({ errors, exceptions, failedAssets }, null, 2), contentType: "application/json" });
  expect(exceptions, "Uncaught browser exceptions").toEqual([]);
  expect(failedAssets, "Failed essential assets").toEqual([]);
  if (!info.annotations.some(a => a.type === "intentional-http-error")) expect(errors, "Browser console errors").toEqual([]);
  else expect(errors.every(error => /503|404|Failed to load resource/.test(error)), "Only deliberate HTTP failure console messages are allowed").toBe(true);
}, { auto: true }] });
export { expect };
export const cards = (page: Page) => page.locator("[data-section=results] [data-product-id]");
export async function catalog(page: Page, path = "/") { expect((await page.goto(path))?.status()).toBe(200); await expect(cards(page)).toHaveCount(40); }
export async function axe(page: Page) { const result = await new AxeBuilder({ page }).analyze(); expect(result.violations, JSON.stringify(result.violations, null, 2)).toEqual([]); }
export async function trapped(page: Page) { for (let i = 0; i < 12; i++) { await page.keyboard.press("Tab"); expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true); } }
export async function search(page: Page, value: string) {
  const trigger = page.getByRole("button", { name: "Open search", exact: true });
  if (await trigger.isVisible()) await trigger.click();
  const input = page.getByRole("searchbox", { name: "Search outfits" }).filter({ visible: true });
  await input.fill(value); await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe(value || null);
  if (await page.getByRole("dialog", { name: "Find your next look" }).isVisible()) await page.keyboard.press("Escape");
}
export async function signInLender(page: Page) { await page.goto("/lender/dashboard"); const auth = page.getByRole("dialog", { name: "Welcome back, lender" }); await expect(auth).toBeVisible(); await auth.getByRole("button", { name: "Continue as sample lender" }).click(); await expect(page.locator(".listing-row")).toHaveCount(40); }
