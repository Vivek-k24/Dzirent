import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface CategoryNode {
  id: string;
  slug: string;
  label: string;
  parent_id: string | null;
  sort_order: number;
  product_count: number;
  children: CategoryNode[];
}

interface ManifestProduct {
  id: string;
  slug: string;
  title: string;
  lender_profile_id: string;
  primary_category_id: string;
  category_memberships: string[];
  rental_price_minor: number;
  retail_price_minor: number;
  band: "A" | "B" | "C" | "D";
  status: string;
  is_available: boolean;
  featured_rank: number;
  sample_rating: number | null;
  images: Array<{
    id: string;
    object_key: string;
    width: number;
    height: number;
    sort_order: number;
  }>;
}

interface CatalogManifest {
  version: string;
  generated_at: string;
  seed_lender: {
    id: string;
    display_name: string;
    metro_id: string;
  };
  products: ManifestProduct[];
}

const rootDir = resolve(__dirname, "../..");
const taxonomyPath = resolve(rootDir, "fixtures/catalog/taxonomy.json");
const manifestPath = resolve(rootDir, "fixtures/catalog/manifest.json");

test.describe("Independent Contract Verification: Taxonomy & Seed Fixtures", () => {
  const taxonomy: { categories: { items: CategoryNode[] } } = JSON.parse(
    readFileSync(taxonomyPath, "utf8")
  );
  const manifest: CatalogManifest = JSON.parse(
    readFileSync(manifestPath, "utf8")
  );

  test("REQ-1A-01: Exactly 8 collection roots and 5 subcategories per root (40 leaves)", () => {
    const roots = taxonomy.categories.items;
    expect(roots).toHaveLength(8);

    const expectedRoots = [
      "women",
      "men",
      "party-cocktail",
      "suits-tuxedos",
      "wedding-guest",
      "indian-cultural",
      "designer",
      "bridal",
    ];

    const actualRootSlugs = roots.map((c) => c.slug);
    expect(actualRootSlugs.sort()).toEqual(expectedRoots.sort());

    let totalLeaves = 0;
    for (const root of roots) {
      expect(
        root.children,
        `Root ${root.label} must have exactly 5 subcategories`
      ).toHaveLength(5);
      totalLeaves += root.children.length;

      for (const child of root.children) {
        expect(child.parent_id).toBe(root.id);
        expect(child.slug).toBeTruthy();
      }
    }

    expect(totalLeaves).toBe(40);
  });

  test("REQ-1A-01: Exactly 40 unique primary garments, 5 per collection root", () => {
    expect(manifest.products).toHaveLength(40);

    const productIds = new Set<string>();
    const productSlugs = new Set<string>();

    for (const p of manifest.products) {
      expect(productIds.has(p.id), `Duplicate product ID: ${p.id}`).toBe(false);
      productIds.add(p.id);

      expect(productSlugs.has(p.slug), `Duplicate product slug: ${p.slug}`).toBe(
        false
      );
      productSlugs.add(p.slug);
    }

    const roots = taxonomy.categories.items;
    // Map each child category ID to root slug
    const childToRoot = new Map<string, string>();
    for (const root of roots) {
      for (const child of root.children) {
        childToRoot.set(child.id, root.slug);
      }
    }

    const countsPerRoot: Record<string, number> = {};
    for (const p of manifest.products) {
      const rootSlug = childToRoot.get(p.primary_category_id);
      expect(rootSlug, `Garment ${p.slug} must belong to a known leaf`).toBeDefined();
      if (rootSlug) {
        countsPerRoot[rootSlug] = (countsPerRoot[rootSlug] || 0) + 1;
      }
    }

    for (const root of roots) {
      expect(
        countsPerRoot[root.slug],
        `Root ${root.slug} must have exactly 5 primary garments`
      ).toBe(5);
    }
  });

  test("REQ-1A-01: Single seed lender owns all 40 seed listings", () => {
    const seedLenderId = manifest.seed_lender.id;
    expect(seedLenderId).toBeTruthy();

    for (const p of manifest.products) {
      expect(
        p.lender_profile_id,
        `Garment ${p.slug} owner must match seed lender ID`
      ).toBe(seedLenderId);
    }
  });

  test("REQ-1A-06: Canonical samples stay at or below $40 within unchanged price bands", () => {
    expect(new Set(manifest.products.map(product => product.rental_price_minor)).size).toBeGreaterThanOrEqual(8);
    for (const p of manifest.products) {
      expect(Number.isInteger(p.rental_price_minor)).toBe(true);
      expect(p.rental_price_minor).toBeGreaterThan(0);
      expect(p.rental_price_minor).toBeLessThanOrEqual(4000);

      expect(Number.isInteger(p.retail_price_minor)).toBe(true);
      expect(p.retail_price_minor).toBeGreaterThan(p.rental_price_minor);

      // Verify Band mappings:
      // Band A: < 5000 (< $50)
      // Band B: 5000 - 9999 ($50 - $99.99)
      // Band C: 10000 - 14999 ($100 - $149.99)
      // Band D: >= 15000 (>= $150)
      if (p.rental_price_minor < 5000) {
        expect(p.band, `Product ${p.slug} price ${p.rental_price_minor} should be Band A`).toBe("A");
      } else if (p.rental_price_minor < 10000) {
        expect(p.band, `Product ${p.slug} price ${p.rental_price_minor} should be Band B`).toBe("B");
      } else if (p.rental_price_minor < 15000) {
        expect(p.band, `Product ${p.slug} price ${p.rental_price_minor} should be Band C`).toBe("C");
      } else {
        expect(p.band, `Product ${p.slug} price ${p.rental_price_minor} should be Band D`).toBe("D");
      }
    }
  });

  test("REQ-1A-08: Fixed 3:4 aspect ratio images (900x1200 or 800x1067)", () => {
    for (const p of manifest.products) {
      expect(p.images.length).toBeGreaterThanOrEqual(1);
      for (const img of p.images) {
        const ratio = img.width / img.height;
        // 3/4 = 0.75. Tolerate slight rounding for 800/1067 = 0.74976
        expect(
          Math.abs(ratio - 0.75),
          `Image ${img.id} on ${p.slug} aspect ratio must be 3:4 (got ${img.width}x${img.height})`
        ).toBeLessThan(0.01);
      }
    }
  });
});

