// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CartLine, ProductDetail } from "@dzirent/client";
import examples from "../../../../fixtures/catalog/examples.json";
import { references, seedProducts } from "@/mocks/fixtures";
import { productWriteSchema } from "./listing-schema";
import { useBag } from "./store";

const storageKey = "dzirent-demo-preferences-v1";
const line = (product: ProductDetail): CartLine => ({ key: product.id, product, sizeId: product.size.id, start: "2026-11-02", end: "2026-11-05" });

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_DZIRENT_MODE", "demo");
  useBag.getState().reset();
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllEnvs();
  useBag.getState().reset();
  localStorage.clear();
});

describe("sample-price release and persisted bags", () => {
  it("refreshes a legacy canonical price without losing dates, preferences or lender-created entries", async () => {
    const sample = seedProducts()[0];
    const old = line({ ...sample, rental_price_minor: 17950, band: "D" });
    const custom = line({ ...sample, id: "11000000-0000-4000-8000-000000000001", rental_price_minor: 25000, band: "D" });
    localStorage.setItem(storageKey, JSON.stringify({ version: 1, state: { lines: [old, custom], wishlist: [sample.id], location: { metro: "", zip: "78701" } } }));
    await useBag.persist.rehydrate();
    useBag.getState().refreshSamplePrices(seedProducts());
    expect(useBag.getState().lines[0]).toEqual({ ...old, product: { ...old.product, rental_price_minor: sample.rental_price_minor, band: sample.band, currency: sample.currency } });
    expect(useBag.getState().lines[1]).toEqual(custom);
    expect(useBag.getState().wishlist).toEqual([sample.id]);
    expect(useBag.getState().location.zip).toBe("78701");
    expect(JSON.parse(localStorage.getItem(storageKey)!).state.lines[0].product.rental_price_minor).toBe(sample.rental_price_minor);
  });

  it("does not rewrite a bag whose sample price is already current", () => {
    useBag.setState({ lines: [line(seedProducts()[0])] });
    const previous = useBag.getState().lines;
    useBag.getState().refreshSamplePrices(seedProducts());
    expect(useBag.getState().lines).toBe(previous);
  });

  it("never substitutes sample prices in connected mode", () => {
    const old = line({ ...seedProducts()[0], rental_price_minor: 25000, band: "D" });
    useBag.setState({ lines: [old] });
    vi.stubEnv("NEXT_PUBLIC_DZIRENT_MODE", "connected");
    useBag.getState().refreshSamplePrices(seedProducts());
    expect(useBag.getState().lines).toEqual([old]);
  });

  it("keeps higher lender prices valid under the existing band contract", () => {
    const sample = examples.cases.find(example => example.operation_id === "createLenderProduct")!.request.body;
    const result = productWriteSchema(references).parse({ ...sample, band: "D", rental_price_minor: 25000 });
    expect(result.rental_price_minor).toBe(25000);
    expect(result.band).toBe("D");
  });
});
