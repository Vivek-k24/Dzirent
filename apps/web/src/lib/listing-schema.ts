import { z } from "zod";
import { dateOnly } from "@dzirent/client";
import type { References } from "@dzirent/client";

export function productWriteSchema(refs: References) {
  return z.object({
    title: z.string().trim().min(1).max(160), description: z.string().trim().min(1).max(5000),
    primary_category_id: z.uuid(), secondary_category_ids: z.array(z.uuid()).default([]),
    brand_id: z.uuid(), size_id: z.uuid(), color_ids: z.array(z.uuid()).min(1).max(8), metro_id: z.uuid(),
    band: z.enum(["A", "B", "C", "D"]), rental_price_minor: z.number().int().nonnegative().safe(),
    retail_price_minor: z.number().int().nonnegative().safe(), currency: z.literal("USD").default("USD"),
    garment_type: z.string().min(1), audience: z.enum(["women", "men", "unisex"]),
    fabric: z.string().min(1), occasion: z.string().min(1), stretch: z.string(), alterations: z.string(), known_wear: z.string(),
    measurements: z.array(z.object({ key: z.string().min(1).max(64), value: z.number().positive().finite(), unit: z.literal("cm").default("cm") }).strict()),
    date_blocks: z.array(z.object({ start: z.string(), end: z.string(), reason: z.enum(["demo-block", "owner-unavailable"]) }).strict()).default([]),
    image_ids: z.array(z.uuid()).default([]), status: z.enum(["draft", "published", "archived"]).default("draft"), is_available: z.boolean().default(true),
  }).strict().superRefine((data, ctx) => {
    const root = refs.categories.find(root => root.children?.some(leaf => leaf.id === data.primary_category_id));
    const ids = refs.categories.flatMap(root => [root.id, ...(root.children ?? []).map(c => c.id)]);
    const fail = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    if (!root) fail("primary_category_id", "Choose a valid subcategory.");
    if (data.secondary_category_ids.some(id => !ids.includes(id))) fail("secondary_category_ids", "Unknown collection.");
    if (!refs.facets.brands.some(x => x.id === data.brand_id)) fail("brand_id", "Choose a seeded brand.");
    if (!refs.facets.sizes.some(x => x.id === data.size_id)) fail("size_id", "Choose one listed size.");
    if (!refs.locations.items.some(x => x.id === data.metro_id)) fail("metro_id", "Choose a demo metro.");
    if (data.color_ids.some(id => !refs.facets.colors.some(x => x.id === id))) fail("color_ids", "Choose known colors.");
    const band = refs.facets.bands.find(x => x.id === data.band);
    if (!band || data.rental_price_minor < band.min_minor || (band.max_minor_exclusive != null && data.rental_price_minor >= band.max_minor_exclusive)) fail("rental_price_minor", "The sample rental price must fit the selected sample band.");
    if (new Set(data.measurements.map(x => x.key)).size !== data.measurements.length) fail("measurements", "Measurement names must be unique.");
    for (const block of data.date_blocks) if (!dateOnly(block.start) || !dateOnly(block.end) || block.end < block.start) fail("date_blocks", "Unavailable dates must be complete and ordered.");
  });
}
