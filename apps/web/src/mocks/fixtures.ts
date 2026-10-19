import manifest from "../../../../fixtures/catalog/manifest.json";
import taxonomy from "../../../../fixtures/catalog/taxonomy.json";
import media from "./media.json";
import type { CurrentUser, ProductDetail, References } from "@dzirent/client";

export const references = {
  categories: taxonomy.categories.items, facets: taxonomy.facets, locations: taxonomy.locations,
} as unknown as References;
export const sampleProfiles = manifest.sample_profiles as unknown as Record<"renter" | "lender", CurrentUser>;
export const demoStart = manifest.demo_start_date;
export function seedProducts(): ProductDetail[] {
  return structuredClone(manifest.products as unknown as ProductDetail[]).map(product => {
    const photo = media.find(x => x.product_id === product.id);
    if (!photo) return product;
    const image = { ...product.image, url: photo.url, alt_text: `${product.brand.label} ${product.title} — illustrative demo photography` };
    return { ...product, image, images: [image] };
  });
}
