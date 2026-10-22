import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import { createApiClient } from "@dzirent/client";
import manifest from "../../../../../fixtures/catalog/manifest.json";
import { DEMO_STUDIOS, CURATED_LENDER_IDS, PRODUCT_EDITORIAL_MAP } from "../demo-studios";
import { handlers, resetDemo } from "../handlers";
import { seedProducts } from "../fixtures";
import type { StudioPage, StudioSettings } from "../../components/studios/types";

const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => { resetDemo(); server.resetHandlers(); });
afterAll(() => server.close());

const lenderClient = createApiClient({ mode: "connected", baseUrl: "http://dzirent.test/api/v1", getToken: async () => "dzirent-demo-lender" });
const publicClient = createApiClient({ mode: "connected", baseUrl: "http://dzirent.test/api/v1" });

interface EditorialMeta {
  editorial_title?: string;
  editorial_brand?: string;
  editorial_description?: string;
}

describe("DEMO-REALISM Phase 1A — Curated Studios and Outfit Partition", () => {
  it("defines exactly 6 curated Texas Studios with valid identities", () => {
    expect(DEMO_STUDIOS).toHaveLength(6);

    const handles = DEMO_STUDIOS.map(s => s.handle);
    expect(handles).toEqual([
      "sample-lender",
      "atelier-valverde",
      "nocturne-houston",
      "zari-heritage",
      "maison-marfa",
      "sol-san-antonio",
    ]);

    // Unique IDs and lender profile IDs
    const ids = new Set(DEMO_STUDIOS.map(s => s.id));
    const lenderIds = new Set(DEMO_STUDIOS.map(s => s.lender_profile_id));
    expect(ids.size).toBe(6);
    expect(lenderIds.size).toBe(6);

    // All studios are in Texas and initially public
    for (const studio of DEMO_STUDIOS) {
      expect(studio.state_code).toBe("TX");
      expect(studio.is_public).toBe(true);
      expect(studio.city).toBeTruthy();
      expect(studio.bio.length).toBeGreaterThan(10);
      expect(studio.display_name.length).toBeGreaterThan(3);
    }

    // Studio 1 matches canonical seed manifest with credible boutique name
    const sampleLender = DEMO_STUDIOS.find(s => s.handle === "sample-lender")!;
    expect(sampleLender.id).toBe(manifest.seed_studio.id);
    expect(sampleLender.lender_profile_id).toBe(manifest.seed_lender.id);
    expect(sampleLender.display_name).toBe("Atelier Austin");

    // Studios 2-6 are in CURATED_LENDER_IDS
    expect(CURATED_LENDER_IDS.size).toBe(5);
    expect(CURATED_LENDER_IDS.has(manifest.seed_lender.id)).toBe(false);
    for (const studio of DEMO_STUDIOS.slice(1)) {
      expect(CURATED_LENDER_IDS.has(studio.lender_profile_id)).toBe(true);
    }
  });

  it("distributes all 40 licensed sample garments with exact recommended counts", () => {
    const manifestIds = manifest.products.map(p => p.id);
    expect(manifestIds).toHaveLength(40);

    const mappedIds = Object.keys(PRODUCT_EDITORIAL_MAP);
    expect(mappedIds).toHaveLength(40);
    expect(new Set(mappedIds)).toEqual(new Set(manifestIds));

    // Count outfits per Studio handle
    const counts: Record<string, number> = {};
    for (const item of Object.values(PRODUCT_EDITORIAL_MAP)) {
      counts[item.studio_handle] = (counts[item.studio_handle] || 0) + 1;
      // lender_profile_id matches the studio's lender_profile_id
      const studio = DEMO_STUDIOS.find(s => s.handle === item.studio_handle)!;
      expect(studio).toBeDefined();
      expect(item.lender_profile_id).toBe(studio.lender_profile_id);
    }

    // Recommended uneven partition: 14 / 8 / 6 / 5 / 4 / 3 (sum = 40)
    expect(counts["sample-lender"]).toBe(14);
    expect(counts["atelier-valverde"]).toBe(8);
    expect(counts["nocturne-houston"]).toBe(6);
    expect(counts["zari-heritage"]).toBe(5);
    expect(counts["maison-marfa"]).toBe(4);
    expect(counts["sol-san-antonio"]).toBe(3);

    const sum = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(sum).toBe(40);

    // Every Studio has >= 3 published items
    for (const count of Object.values(counts)) {
      expect(count).toBeGreaterThanOrEqual(3);
    }
  });

  it("supplies curated editorial titles, brands, and descriptions for all 40 garments", () => {
    for (const editorial of Object.values(PRODUCT_EDITORIAL_MAP)) {
      expect(editorial.title).toBeTruthy();
      expect(editorial.brand_label).toBeTruthy();
      expect(editorial.description).toBeTruthy();

      // No mechanical numbers or default placeholders
      expect(editorial.title).not.toMatch(/^(Black|White|Red|Blue) Dresses \d+$/);
      expect(editorial.title).not.toMatch(/^Garment \d+$/);
      expect(editorial.description.length).toBeGreaterThan(20);

      // No unsupported fabric/provenance/craftsmanship claims
      expect(editorial.description).not.toMatch(/Italian virgin wool/i);
      expect(editorial.description).not.toMatch(/silk charmeuse/i);
      expect(editorial.description).not.toMatch(/French Chantilly lace/i);
      expect(editorial.description).not.toMatch(/handcrafted/i);
      expect(editorial.description).not.toMatch(/Savile Row/i);
    }
  });

  it("correctly seeds products with editorial metadata and studio ownership", () => {
    const products = seedProducts();
    expect(products).toHaveLength(40);

    const counts: Record<string, number> = {};
    for (const product of products) {
      counts[product.lender_profile_id] = (counts[product.lender_profile_id] || 0) + 1;
      const editorial = PRODUCT_EDITORIAL_MAP[product.id];
      expect(editorial).toBeDefined();
      expect(product.lender_profile_id).toBe(editorial.lender_profile_id);

      // Unified title, brand, and description across demo mode
      expect(product.title).toBe(editorial.title);
      expect(product.brand.label).toBe(editorial.brand_label);
      expect(product.description).toBe(editorial.description);

      const withEditorial = product as unknown as EditorialMeta;
      expect(withEditorial.editorial_title).toBe(editorial.title);
      expect(withEditorial.editorial_brand).toBe(editorial.brand_label);
      expect(withEditorial.editorial_description).toBe(editorial.description);
    }

    expect(counts[manifest.seed_lender.id]).toBe(14);
  });

  it("preserves discoverability of 5 curated Studios when sample-lender becomes private", async () => {
    const initial = await publicClient<StudioPage>("/studios?page=1&page_size=24");
    expect(initial.total).toBe(6);
    expect(initial.items).toHaveLength(6);

    const saved = await lenderClient<StudioSettings>("/me/studio", {
      protected: true,
      method: "PUT",
      body: JSON.stringify({
        display_name: "Private Sample Lender",
        bio: "Now private",
        is_public: false,
        expected_version: 1,
      }),
    });
    expect(saved.is_public).toBe(false);

    const after = await publicClient<StudioPage>("/studios?page=1&page_size=24");
    expect(after.total).toBe(5);
    expect(after.items.map(s => s.handle)).not.toContain("sample-lender");
    expect(after.items.map(s => s.handle)).toEqual([
      "atelier-valverde",
      "maison-marfa",
      "nocturne-houston",
      "sol-san-antonio",
      "zari-heritage",
    ]);

    resetDemo();
    const reset = await publicClient<StudioPage>("/studios?page=1&page_size=24");
    expect(reset.total).toBe(6);
  });
});
