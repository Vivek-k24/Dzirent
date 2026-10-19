import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { setupServer } from "msw/node";
import { cartIssue, clearOptional, createApiClient, emptySelection, fourDayEnd, minorUnits, parseSelection, safeReturnTo, serializeSelection } from "@dzirent/client";
import type { ProductDetail, ProductPage, LenderProductPage, CurrentUser } from "@dzirent/client";
import { catalogPage, filterCatalog, validateCatalogQuery } from "./catalog";
import { references, seedProducts } from "./fixtures";
import { handlers, resetDemo, scenario } from "./handlers";

const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => { resetDemo(); server.resetHandlers(); vi.restoreAllMocks(); });
afterAll(() => server.close());
const api = createApiClient({ mode: "connected", baseUrl: "http://dzirent.test/api/v1", getToken: async () => "dzirent-demo-lender" });

describe("canonical catalog semantics", () => {
  it("uses 40 unique primary garments and deduplicates secondary Designer membership", () => {
    expect(catalogPage(seedProducts(), new URLSearchParams()).total).toBe(40);
    const result = catalogPage(seedProducts(), new URLSearchParams("collection=designer"));
    expect(result.total).toBe(7);
    expect(new Set(result.items.map(p => p.id)).size).toBe(7);
  });
  it("combines OR values within a group and AND across groups", () => {
    const state = { ...emptySelection(), color: ["black", "navy"], band: ["A"] };
    const result = filterCatalog(seedProducts(), state);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every(p => ["black", "navy"].includes(p.colors[0].slug) && p.band === "A")).toBe(true);
  });
  it("validates calendar dates, inclusive endpoint collisions and four-day intervals across months", () => {
    expect(fourDayEnd("2026-10-30")).toBe("2026-11-02");
    expect(validateCatalogQuery(new URLSearchParams("start=2026-02-30&end=2026-03-05"))).toBeTruthy();
    expect(validateCatalogQuery(new URLSearchParams("start=2026-11-02"))).toBeTruthy();
    const p = { ...seedProducts()[0], is_available: true };
    expect(filterCatalog([p], { ...emptySelection(), start: "2026-11-02", end: "2026-11-05" })).toHaveLength(0);
    expect(filterCatalog([p], { ...emptySelection(), start: "2026-11-09", end: "2026-11-12" })).toHaveLength(1);
  });
  it("serializes stable URL state and preserves navigation/view/sort on global clear", () => {
    const state = parseSelection(new URLSearchParams("view=list&sort=price_desc&collection=women&color=red&color=black&color=red&band=unknown"), references);
    expect(serializeSelection(state)).toBe("collection=women&color=black&color=red&sort=price_desc&view=list");
    expect(clearOptional(state)).toEqual({ ...emptySelection(), collection: "women", sort: "price_desc", view: "list" });
  });
  it("uses the demo ZIP map and rejects conflicting locations", () => {
    expect(validateCatalogQuery(new URLSearchParams("metro=austin&zip=99999"))).toBeTruthy();
    const result = catalogPage(seedProducts(), new URLSearchParams("zip=99999"));
    expect(result.items.every(p => p.metro.slug === "other-texas")).toBe(true);
  });
  it("sorts deterministically, puts null ratings last and paginates after filtering", () => {
    const all = catalogPage(seedProducts(), new URLSearchParams("sort=top_rated"));
    expect(all.items.at(-1)?.sample_rating).toBeNull();
    const page = catalogPage(seedProducts(), new URLSearchParams("sort=top_rated&page=2&page_size=7"));
    expect(page.items.map(p => p.id)).toEqual(all.items.slice(7, 14).map(p => p.id));
    expect(page.total).toBe(40);
  });
});

describe("safety at client boundaries", () => {
  it("rejects overlapping cart intervals for one physical garment", () => {
    const p = seedProducts().find(p => p.is_available && !p.date_blocks.length)!;
    const line = { key: "example", product: p, sizeId: p.size.id, start: "2026-11-02", end: "2026-11-05" };
    expect(cartIssue([line], p, p.size.id, "2026-11-05", "2026-11-08")).toMatch(/already/);
    expect(cartIssue([line], p, p.size.id, "2026-11-06", "2026-11-09")).toBeNull();
    expect(cartIssue([], p, "another-size", "2026-11-02", "2026-11-05")).toMatch(/listed size/);
  });
  it("parses sample amounts without fractional-cent or exponential inputs", () => {
    expect(minorUnits("49.99")).toBe(4999);
    expect(minorUnits("49.999")).toBeNull();
    expect(minorUnits("1e3")).toBeNull();
  });
  it("keeps return destinations same-origin and rejects backslash/control redirects", () => {
    expect(safeReturnTo("//evil.test")).toBe("/");
    expect(safeReturnTo("/\\evil.test")).toBe("/");
    expect(safeReturnTo("/cart?from=demo")).toBe("/cart?from=demo");
  });
  it("propagates connected outages without substituting fixtures", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    await expect(api<ProductPage>("/catalog/products")).rejects.toThrow("offline");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("API-shaped MSW mutations", () => {
  it("isolates enrolled renter ownership and harmless profile preferences", async () => {
    const renter = createApiClient({ mode: "connected", baseUrl: "http://dzirent.test/api/v1", getToken: async () => "dzirent-demo-renter" });
    await expect(renter("/lender/products", { protected: true })).rejects.toMatchObject({ status: 403 });
    await renter("/me/lender-profile", { protected: true, method: "POST", body: JSON.stringify({ display_name: "New sample owner", metro_id: references.locations.items[0].id }) });
    expect((await renter<CurrentUser>("/me", { protected: true })).roles).toEqual(["renter", "lender"]);
    expect((await renter<LenderProductPage>("/lender/products", { protected: true })).total).toBe(0);
    await expect(renter(`/lender/products/${seedProducts()[0].id}`, { protected: true })).rejects.toMatchObject({ status: 404 });
    await expect(renter(`/lender/products/${seedProducts()[0].id}`, { protected: true, method: "PATCH", body: JSON.stringify({ expected_version: 1, is_available: false }) })).rejects.toMatchObject({ status: 404 });
    await renter("/me/preferences", { protected: true, method: "PATCH", body: JSON.stringify({ postal_code: "78701" }) });
    expect(await api("/me/preferences", { protected: true })).toEqual({ metro_id: null, postal_code: null });
    expect(await renter("/me/preferences", { protected: true })).toEqual({ metro_id: null, postal_code: "78701" });
  });
  it("rejects malformed identity headers and owner-controlled write fields", async () => {
    const response = await fetch("http://dzirent.test/api/v1/me", { headers: { Authorization: "lender" } });
    expect(response.status).toBe(401);
    await expect(api("/lender/products", { protected: true, method: "POST", body: JSON.stringify({ title: "Cannot assign ownership", lender_profile_id: seedProducts()[0].lender_profile_id }) })).rejects.toMatchObject({ status: 422 });
  });
  it("requires an identity and keeps stale/failed updates from changing data", async () => {
    const anonymous = createApiClient({ mode: "connected", baseUrl: "http://dzirent.test/api/v1" });
    await expect(anonymous("/lender/products")).rejects.toMatchObject({ status: 401 });
    const p = seedProducts()[1];
    const changed = await api<ProductDetail>(`/lender/products/${p.id}`, { protected: true, method: "PATCH", body: JSON.stringify({ expected_version: 1, is_available: false }) });
    expect(changed.version).toBe(2);
    await expect(api(`/lender/products/${p.id}`, { protected: true, method: "PATCH", body: JSON.stringify({ expected_version: 1, is_available: true }) })).rejects.toMatchObject({ status: 409 });
    scenario.saveError = true;
    await expect(api(`/lender/products/${p.id}`, { protected: true, method: "PATCH", body: JSON.stringify({ expected_version: 2, is_available: true }) })).rejects.toMatchObject({ status: 503 });
    const unchanged = await api<ProductDetail>(`/lender/products/${p.id}`, { protected: true });
    expect(unchanged.is_available).toBe(false);
    expect(unchanged.version).toBe(2);
  });
  it("archives rather than deletes, hides public detail and resets deterministically", async () => {
    const p = seedProducts()[1];
    await api(`/lender/products/${p.id}?expected_version=1`, { protected: true, method: "DELETE" });
    await expect(api(`/catalog/products/${p.slug}`)).rejects.toMatchObject({ status: 404 });
    expect((await api<ProductDetail>(`/lender/products/${p.id}`, { protected: true })).status).toBe("archived");
    resetDemo();
    expect((await api<ProductPage>("/catalog/products")).total).toBe(40);
  });
});
