import { delay, http, HttpResponse } from "msw";
import type { CurrentUser, ProductDetail, ProductWrite } from "@dzirent/client";
import { z } from "zod";
import { productWriteSchema } from "../lib/listing-schema";
import { catalogPage, membership, validateCatalogQuery } from "./catalog";
import { references, sampleProfiles, seedProducts } from "./fixtures";
import { resetStudios, studioHandlers } from "./studios/handlers";

let products = seedProducts();
let profiles = structuredClone(sampleProfiles);
type Preferences = { metro_id: string | null; postal_code: string | null };
let preferences: Record<string, Preferences> = {};
let sequence = 1000;
export const scenario = { catalogError: false, saveError: false };
export function resetDemo() { products = seedProducts(); profiles = structuredClone(sampleProfiles); preferences = {}; sequence = 1000; scenario.catalogError = false; scenario.saveError = false; resetStudios(); }
function failure(status: number, message: string, code?: string, details: Record<string, unknown>[] = []) {
  code ??= ({ 401: "unauthenticated", 403: "lender_required", 404: "not_found", 409: "stale_version", 422: "validation_error", 503: "dependency_unavailable" } as Record<number, string>)[status] ?? "request_failed";
  return HttpResponse.json({ error: { code, message, details }, request_id: `demo-request-${++sequence}` }, { status });
}
function identity(request: Request): CurrentUser | null {
  const role = request.headers.get("Authorization")?.match(/^Bearer dzirent-demo-(lender|renter)$/)?.[1];
  const user = role === "lender" || role === "renter" ? profiles[role] : null;
  return user?.status === "active" ? user : null;
}
function ownerError(user: CurrentUser | null) { return !user ? failure(401, "Use a sample identity to continue.") : !user.lender_profile ? failure(403, "Create a sample lender profile first.") : null; }
function ownProduct(user: CurrentUser | null, id: string) { return user?.lender_profile ? products.find(p => p.id === id && p.lender_profile_id === user.lender_profile!.id) : undefined; }
const writeSchema = productWriteSchema(references);
function fromWrite(data: ProductWrite, previous: ProductDetail): ProductDetail {
  const parent = references.categories.find(c => c.children?.some(x => x.id === data.primary_category_id))!;
  const imagePool = seedProducts().flatMap(p => p.images);
  const images = data.image_ids?.map((id, index) => ({ ...imagePool.find(i => i.id === id)!, sort_order: index })) ?? [];
  return { ...previous, title: data.title, description: data.description, primary_collection_id: parent.id,
    primary_category_id: data.primary_category_id, secondary_category_ids: data.secondary_category_ids ?? [],
    brand: references.facets.brands.find(x => x.id === data.brand_id)!, size: references.facets.sizes.find(x => x.id === data.size_id)!,
    colors: references.facets.colors.filter(x => data.color_ids.includes(x.id)), metro: references.locations.items.find(x => x.id === data.metro_id)!,
    band: data.band, rental_price_minor: data.rental_price_minor, retail_price_minor: data.retail_price_minor, currency: "USD",
    garment_type: data.garment_type, audience: data.audience, fabric: data.fabric, occasion: data.occasion,
    stretch: data.stretch, alterations: data.alterations, known_wear: data.known_wear, measurements: data.measurements,
    date_blocks: data.date_blocks ?? [], status: data.status ?? "draft", is_available: data.is_available ?? true,
    images: images.length ? images : [previous.image], image: images[0] ?? previous.image,
    updated_at: new Date(Date.UTC(2026, 10, 2, 12, 0, ++sequence)).toISOString() };
}
async function readWrite(request: Request) {
  const result = writeSchema.safeParse(await request.json().catch(() => null));
  if (!result.success) return { error: failure(422, result.error.issues.map(x => x.message).join(" ")) };
  const pool = seedProducts().flatMap(p => p.images.map(i => i.id));
  if (result.data.image_ids.some(id => !pool.includes(id))) return { error: failure(422, "Choose an allowlisted demo photograph.") };
  return { data: result.data as ProductWrite };
}

export const handlers = [
  http.get("*/api/v1/catalog/products", async ({ request }) => {
    await delay(25);
    if (scenario.catalogError) { scenario.catalogError = false; return failure(503, "The demo catalog request failed. Please retry."); }
    const params = new URL(request.url).searchParams;
    const invalid = validateCatalogQuery(params);
    return invalid ? failure(422, invalid) : HttpResponse.json(catalogPage(products, params));
  }),
  http.get("*/api/v1/catalog/products/:slug", async ({ params }) => {
    await delay(25);
    const product = products.find(p => p.slug === params.slug && p.status === "published");
    return product ? HttpResponse.json(product) : failure(404, "This outfit is not available in the public catalog.");
  }),
  http.get("*/api/v1/catalog/categories", async () => {
    await delay(10);
    const published = products.filter(p => p.status === "published");
    return HttpResponse.json({ items: references.categories.map(root => ({ ...root, product_count: published.filter(p => membership(p, root)).length,
      children: root.children?.map(child => ({ ...child, product_count: published.filter(p => membership(p, child)).length })) })) });
  }),
  http.get("*/api/v1/catalog/facets", ({ request }) => {
    const slugs = new URL(request.url).searchParams.getAll("category");
    if (slugs.some(slug => !references.categories.some(c => c.slug === slug))) return failure(422, "Unknown category.");
    if (!slugs.length) return HttpResponse.json(references.facets);
    const selected = products.filter(p => p.status === "published" && references.categories.some(c => slugs.includes(c.slug) && membership(p, c)));
    return HttpResponse.json({ ...references.facets, brands: references.facets.brands.filter(x => selected.some(p => p.brand.id === x.id)),
      colors: references.facets.colors.filter(x => selected.some(p => p.colors.some(c => c.id === x.id))), sizes: references.facets.sizes.filter(x => selected.some(p => p.size.id === x.id)),
      occasions: references.facets.occasions.filter(x => selected.some(p => p.occasion === x)), fabrics: references.facets.fabrics.filter(x => selected.some(p => p.fabric === x)) });
  }),
  http.get("*/api/v1/locations/metros", () => HttpResponse.json(references.locations)),
  http.post("*/api/v1/me/bootstrap", ({ request }) => { const user = identity(request); return user ? HttpResponse.json(user) : failure(401, "Use a sample identity."); }),
  http.get("*/api/v1/me", ({ request }) => { const user = identity(request); return user ? HttpResponse.json(user) : failure(401, "Use a sample identity."); }),
  http.patch("*/api/v1/me", async ({ request }) => {
    const user = identity(request);
    if (!user) return failure(401, "Use a sample identity.");
    const parsed = z.object({ display_name: z.string().trim().min(1).max(100) }).strict().safeParse(await request.json());
    if (!parsed.success) return failure(422, "Enter a display name, 1–100 characters.");
    user.display_name = parsed.data.display_name;
    return HttpResponse.json(user);
  }),
  http.delete("*/api/v1/me", ({ request }) => {
    const user = identity(request);
    if (!user) return failure(401, "Use a sample identity.");
    user.status = "inactive";
    if (user.lender_profile) user.lender_profile.status = "inactive";
    products.filter(p => p.lender_profile_id === user.lender_profile?.id).forEach(p => { p.status = "archived"; p.version += 1; });
    return HttpResponse.json(user);
  }),
  http.get("*/api/v1/me/preferences", ({ request }) => { const user = identity(request); return user ? HttpResponse.json(preferences[user.id] ?? { metro_id: null, postal_code: null }) : failure(401, "Use a sample identity."); }),
  http.patch("*/api/v1/me/preferences", async ({ request }) => {
    const user = identity(request);
    if (!user) return failure(401, "Use a sample identity.");
    const parsed = z.object({ metro_id: z.uuid().nullable().optional(), postal_code: z.string().regex(/^\d{5}$/).nullable().optional() }).strict().safeParse(await request.json());
    if (!parsed.success || (parsed.data.metro_id && !references.locations.items.some(m => m.id === parsed.data.metro_id))) return failure(422, "Enter a valid demo location.");
    preferences[user.id] = { ...(preferences[user.id] ?? { metro_id: null, postal_code: null }), ...parsed.data };
    return HttpResponse.json(preferences[user.id]);
  }),
  http.post("*/api/v1/me/lender-profile", async ({ request }) => {
    const user = identity(request);
    if (!user) return failure(401, "Use a sample identity.");
    const parsed = z.object({ display_name: z.string().min(1).max(100), metro_id: z.uuid() }).strict().safeParse(await request.json());
    if (!parsed.success || !references.locations.items.some(x => x.id === parsed.data.metro_id)) return failure(422, "Choose a valid display name and metro.");
    if (!user.lender_profile) {
      user.lender_profile = { id: "d3120000-0000-4000-8000-000000002000", ...parsed.data, status: "active" };
      user.roles = ["renter", "lender"];
    }
    return HttpResponse.json(user.lender_profile);
  }),
  http.get("*/api/v1/lender/products", async ({ request }) => {
    await delay(25);
    const user = identity(request), error = ownerError(user);
    if (error) return error;
    const params = new URL(request.url).searchParams, page = Number(params.get("page") ?? 1), size = Number(params.get("page_size") ?? 40);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(size) || size < 1 || size > 100) return failure(422, "Invalid pagination.");
    const q = (params.get("q") ?? "").toLowerCase();
    const owned = products.filter(p => p.lender_profile_id === user!.lender_profile!.id && `${p.title} ${p.brand.label}`.toLowerCase().includes(q))
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || (a.id < b.id ? -1 : 1));
    return HttpResponse.json({ items: owned.slice((page - 1) * size, page * size), total: owned.length, page, page_size: size });
  }),
  http.post("*/api/v1/lender/products", async ({ request }) => {
    await delay(40);
    const user = identity(request), error = ownerError(user);
    if (error) return error;
    if (scenario.saveError) { scenario.saveError = false; return failure(503, "Simulated save failure. Your changes were not saved."); }
    const parsed = await readWrite(request);
    if (parsed.error) return parsed.error;
    const id = `d3120000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`;
    const product = fromWrite(parsed.data!, { ...seedProducts()[0], id, slug: `demo-created-${id}`, lender_profile_id: user!.lender_profile!.id,
      sample_rating: null, sample_rating_count: 0, featured_rank: Math.max(...products.map(p => p.featured_rank)) + 1, version: 1, created_at: "2026-11-02T12:00:00Z" });
    products.push(product);
    return HttpResponse.json(product, { status: 201 });
  }),
  http.get("*/api/v1/lender/products/:id", ({ request, params }) => {
    const user = identity(request), error = ownerError(user);
    if (error) return error;
    const product = ownProduct(user, String(params.id));
    return product ? HttpResponse.json(product) : failure(404, "Listing not found.");
  }),
  http.patch("*/api/v1/lender/products/:id", async ({ request, params }) => {
    await delay(40);
    const user = identity(request), error = ownerError(user);
    if (error) return error;
    const previous = ownProduct(user, String(params.id));
    if (!previous) return failure(404, "Listing not found.");
    if (scenario.saveError) { scenario.saveError = false; return failure(503, "Simulated save failure. Your changes were not saved."); }
    const body = z.object({ expected_version: z.number().int().positive(), data: writeSchema.nullable().optional(), is_available: z.boolean().nullable().optional() }).strict().safeParse(await request.json());
    if (!body.success || (!body.data.data && body.data.is_available == null)) return failure(422, "Submit listing changes and an expected version.");
    if (body.data.expected_version !== previous.version) return failure(409, "This listing changed. Refresh before saving again.");
    if (body.data.data && body.data.is_available != null && body.data.data.is_available !== body.data.is_available) return failure(422, "Conflicting availability values.");
    if (body.data.data?.image_ids.some(id => !seedProducts().some(p => p.images.some(i => i.id === id)))) return failure(422, "Choose an allowlisted photo.");
    const updated = body.data.data ? fromWrite(body.data.data as ProductWrite, previous) : { ...previous };
    if (body.data.is_available != null) updated.is_available = body.data.is_available;
    updated.version += 1;
    products = products.map(p => p.id === updated.id ? updated : p);
    return HttpResponse.json(updated);
  }),
  http.delete("*/api/v1/lender/products/:id", async ({ request, params }) => {
    await delay(40);
    const user = identity(request), error = ownerError(user);
    if (error) return error;
    const product = ownProduct(user, String(params.id));
    if (!product) return failure(404, "Listing not found.");
    if (scenario.saveError) { scenario.saveError = false; return failure(503, "Simulated archive failure. The listing is unchanged."); }
    const expected = Number(new URL(request.url).searchParams.get("expected_version"));
    if (!Number.isInteger(expected) || expected < 1) return failure(422, "Expected version is required.");
    if (expected !== product.version) return failure(409, "This listing changed. Refresh before archiving.");
    product.status = "archived"; product.is_available = false; product.version += 1;
    return HttpResponse.json(product);
  }),
  ...studioHandlers({ products: () => products, identity, owners: () => Object.values(profiles), failure }),
];
