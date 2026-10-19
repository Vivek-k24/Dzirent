import { test, expect, cards } from "./support";

test("REQ-1A initial load: exactly eight visible skeletons, minimum 300ms feedback, one 40-item catalog request", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", request => { if (new URL(request.url()).pathname === "/api/v1/catalog/products") requests.push(request.url()); });
  await page.addInitScript(() => {
    const state = { skeletonAt: 0, productsAt: 0, maxVisibleSkeletons: 0 };
    (window as unknown as { qaLoading: typeof state }).qaLoading = state;
    const observer = new MutationObserver(() => {
      const visible = [...document.querySelectorAll("[data-skeleton]")].filter(node => (node as HTMLElement).offsetWidth > 0 && (node as HTMLElement).offsetHeight > 0).length;
      if (visible && !state.skeletonAt) state.skeletonAt = performance.now();
      state.maxVisibleSkeletons = Math.max(state.maxVisibleSkeletons, visible);
      if (document.querySelectorAll("[data-product-id]").length === 40 && !state.productsAt) { state.productsAt = performance.now(); observer.disconnect(); }
    });
    observer.observe(document, { childList: true, subtree: true, attributes: true });
  });
  await page.goto("/"); await expect(cards(page)).toHaveCount(40);
  const state = await page.evaluate(() => (window as unknown as { qaLoading: { skeletonAt: number; productsAt: number; maxVisibleSkeletons: number } }).qaLoading);
  expect(state.maxVisibleSkeletons).toBe(8); expect(state.productsAt - state.skeletonAt).toBeGreaterThanOrEqual(300); expect(requests).toHaveLength(1);
});
