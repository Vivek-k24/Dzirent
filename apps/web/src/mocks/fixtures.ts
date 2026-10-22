import manifest from "../../../../fixtures/catalog/manifest.json";
import taxonomy from "../../../../fixtures/catalog/taxonomy.json";
import media from "./media.json";
import type { CurrentUser, ProductDetail, References } from "@dzirent/client";
import { PRODUCT_EDITORIAL_MAP } from "./demo-studios";

export const references = {
  categories: taxonomy.categories.items, facets: taxonomy.facets, locations: taxonomy.locations,
} as unknown as References;
export const sampleProfiles = manifest.sample_profiles as unknown as Record<"renter" | "lender", CurrentUser>;
export const demoStart = manifest.demo_start_date;
export function seedProducts(): ProductDetail[] {
  return structuredClone(manifest.products as unknown as ProductDetail[]).map(product => {
    const photo = media.find(x => x.product_id === product.id);
    const editorial = PRODUCT_EDITORIAL_MAP[product.id];
    const brandLabel = editorial?.brand_label ?? product.brand.label;
    const displayTitle = editorial?.title ?? product.title;
    const image = photo ? {
      ...product.image,
      url: photo.url,
      alt_text: `${brandLabel} ${displayTitle} — illustrative demo photography`,
    } : product.image;
    return {
      ...product,
      image,
      images: [image],
      ...(editorial ? {
        lender_profile_id: editorial.lender_profile_id,
        editorial_title: editorial.title,
        editorial_brand: editorial.brand_label,
        editorial_description: editorial.description,
      } : {}),
    };
  });
}
