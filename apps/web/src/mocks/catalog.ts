import { overlaps, parseSelection, rangeError } from "@dzirent/client";
import type { Category, CatalogSelection, ProductCard, ProductDetail, ProductPage } from "@dzirent/client";
import { references } from "./fixtures";

export function membership(product: ProductDetail, category: Category): boolean {
  const ids = [category.id, ...(category.children ?? []).map(c => c.id)];
  return ids.includes(product.primary_category_id) || ids.includes(product.primary_collection_id) || product.secondary_category_ids.some(id => ids.includes(id));
}
export function cardOf(product: ProductDetail): ProductCard {
  const detailKeys = ["lender_profile_id", "description", "garment_type", "audience", "fabric", "occasion", "stretch", "alterations", "known_wear", "measurements", "images", "date_blocks"];
  return Object.fromEntries(Object.entries(product).filter(([key]) => !detailKeys.includes(key))) as ProductCard;
}
export function validateCatalogQuery(params: URLSearchParams): string | null {
  const choices: Record<string, string[]> = {
    collection: references.categories.map(x => x.slug), category: references.categories.map(x => x.slug),
    subcategory: references.categories.flatMap(x => x.children?.map(c => c.slug) ?? []),
    brand: references.facets.brands.map(x => x.id), color: references.facets.colors.map(x => x.slug),
    band: ["A", "B", "C", "D"], size: references.facets.sizes.map(x => x.id), metro: references.locations.items.map(x => x.slug),
    sort: ["featured", "price_asc", "price_desc", "newest", "top_rated"],
  };
  for (const [key, value] of params) {
    if (!(key in choices) && !["q", "start", "end", "zip", "page", "page_size"].includes(key)) return `Unknown query parameter: ${key}.`;
    if (choices[key] && !choices[key].includes(value)) return `Unknown ${key} selection.`;
  }
  for (const key of ["page", "page_size"]) {
    if (params.has(key) && (!/^\d+$/.test(params.get(key)!) || Number(params.get(key)) < 1 || (key === "page_size" && Number(params.get(key)) > 100))) return "Invalid pagination.";
  }
  if ((params.get("q")?.length ?? 0) > 200) return "Search must be 200 characters or less.";
  const invalidDates = rangeError(params.get("start") ?? "", params.get("end") ?? "");
  if (invalidDates) return invalidDates;
  const zip = params.get("zip");
  if (zip && !/^\d{5}$/.test(zip)) return "Enter a five-digit ZIP.";
  if (zip && params.has("metro")) {
    const metroId = references.locations.demo_zip_map[zip] ?? references.locations.unmapped_zip_metro_id;
    if (!references.locations.items.some(m => m.id === metroId && m.slug === params.get("metro"))) return "The selected metro does not match this demo ZIP.";
  }
  if (params.has("subcategory")) {
    const parent = references.categories.find(c => c.children?.some(x => x.slug === params.get("subcategory")));
    const effective = params.getAll("category").length ? params.getAll("category") : params.get("collection") ? [params.get("collection")!] : references.categories.map(x => x.slug);
    if (!parent || !effective.includes(parent.slug)) return "Choose a subcategory from the selected collection.";
  }
  return null;
}
export function filterCatalog(products: ProductDetail[], state: CatalogSelection): ProductDetail[] {
  const selectedRoots = state.category.length ? state.category : state.collection ? [state.collection] : [];
  const selectedCategories = references.categories.filter(c => selectedRoots.includes(c.slug));
  const leaf = references.categories.flatMap(c => c.children ?? []).find(c => c.slug === state.subcategory);
  const q = state.q.toLocaleLowerCase("en-US");
  const mappedId = state.zip ? references.locations.demo_zip_map[state.zip] ?? references.locations.unmapped_zip_metro_id : null;
  const metro = mappedId ? references.locations.items.find(m => m.id === mappedId)?.slug : state.metro;
  return products.filter(p => p.status === "published")
    .filter(p => !selectedCategories.length || selectedCategories.some(c => membership(p, c)))
    .filter(p => !leaf || membership(p, leaf))
    .filter(p => !q || `${p.title} ${p.brand.label} ${p.description}`.toLocaleLowerCase("en-US").includes(q))
    .filter(p => !state.brand.length || state.brand.includes(p.brand.id))
    .filter(p => !state.color.length || p.colors.some(c => state.color.includes(c.slug)))
    .filter(p => !state.band.length || state.band.includes(p.band))
    .filter(p => !state.size.length || state.size.includes(p.size.id))
    .filter(p => !metro || p.metro.slug === metro)
    .filter(p => !state.start || (p.is_available && !p.date_blocks.some(block => overlaps({ start: state.start, end: state.end }, block))));
}
export function catalogPage(products: ProductDetail[], params: URLSearchParams): ProductPage {
  const state = parseSelection(params, references);
  const visible = products.filter(p => p.status === "published");
  const context = references.categories.find(c => c.slug === state.collection);
  const items = filterCatalog(visible, state);
  items.sort((a, b) => {
    let order = 0;
    if (state.sort === "featured") order = a.featured_rank - b.featured_rank;
    if (state.sort === "price_asc") order = a.rental_price_minor - b.rental_price_minor;
    if (state.sort === "price_desc") order = b.rental_price_minor - a.rental_price_minor;
    if (state.sort === "newest") order = Date.parse(b.created_at) - Date.parse(a.created_at);
    if (state.sort === "top_rated") order = (b.sample_rating ?? -1) - (a.sample_rating ?? -1);
    return order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
  const page = Number(params.get("page") ?? 1), pageSize = Number(params.get("page_size") ?? 40);
  return { items: items.slice((page - 1) * pageSize, page * pageSize).map(cardOf), page, page_size: pageSize, total: items.length,
    collection_total: context ? visible.filter(p => membership(p, context)).length : visible.length,
    available_total: items.filter(p => p.is_available).length };
}
