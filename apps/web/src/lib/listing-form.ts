// The listing editor's form and its checks. F1: each step checks only what it asks for, with
// the catalog's field-level message (DZ-E2070-E2085); publishing checks everything again (in
// the page and on the server); a draft save never asks for what isn't filled in yet. The .ts
// extensions let `npm test` load this file as it is.
import { categories, styles } from "./types.ts";
import { garmentKinds, itemTypes, type Measurement } from "./workflows.ts";
import { parseDepositAmount } from "./rentals.ts";
import { shown, type ShownError } from "./errors.ts";
import { workflowRequest, type RequestOptions } from "./requests.ts";
export type ListingForm = {
  title: string;
  category: string;
  description: string;
  item_type: string;
  garment_type: string;
  size_label: string;
  price_usd: string;
  price_note: string;
  retail_value: string;
  deposit_note: string;
  /** C5: the deposit held at pickup, in dollars ("" = none). Saved only while payments are on. */
  deposit_amount?: string;
  listing_styles: string[];
  measurements: Measurement[];
  availability: { start_date: string; end_date: string }[];
  accessory_confirmed: boolean;
};

/** A new listing's row before its details are given: the same placeholders as the app (PhotoScan.kt). */
export const DRAFT_TITLE = "New listing (draft)";
export const DRAFT_CATEGORY = "Everyday";
export const TITLE_MIN = 3;
export const TITLE_MAX = 80;
export const DESCRIPTION_MAX = 1000;
export const PRICE_NOTE_MAX = 60;
export const DEPOSIT_NOTE_MAX = 120;
export const PRICE_MAX_USD = 10000;
export const ACCESSORY_MAX_USD = 300;

/** The step that asks for each field: 2 Details, 3 Size, price and dates. */
export const fieldStep: Record<string, 2 | 3> = {
  title: 2,
  category: 2,
  item_type: 2,
  description: 2,
  listing_styles: 2,
  garment_type: 3,
  size_label: 3,
  measurements: 3,
  price_usd: 3,
  price_note: 3,
  deposit_note: 3,
  deposit_amount: 3,
  retail_value: 3,
  accessory_confirmed: 3,
  availability: 3,
};

/** "25" or "25.50": above $0 and at most $10,000, with at most 2 decimals. */
export function parsePrice(text: string): number | null {
  const t = text.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const value = Number(t);
  return value > 0 && value <= PRICE_MAX_USD ? value : null;
}

/** The retail value as typed: null when empty, NaN when it isn't a number above 0. */
function retailValue(text: string): number | null {
  if (!text.trim()) return null;
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? value : NaN;
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const tooLong = (f: ListingForm) =>
  f.description.length > DESCRIPTION_MAX
    ? shown("DZ-E2073")
    : f.price_note.length > PRICE_NOTE_MAX
      ? shown("DZ-E2077")
      : f.deposit_note.length > DEPOSIT_NOTE_MAX
        ? shown("DZ-E2078")
        : f.listing_styles.length > 3 || f.listing_styles.some((s) => !styles.includes(s))
          ? shown("DZ-E2082")
          : null;

/** Step 2 (Details), before continuing: title, category, item type, description and styles. */
export function detailsProblem(f: ListingForm): ShownError | null {
  const title = f.title.trim();
  if (title.length < TITLE_MIN || title.length > TITLE_MAX) return shown("DZ-E2070");
  if (!categories.includes(f.category)) return shown("DZ-E2071");
  if (f.category === "Accessories" && !itemTypes.includes(f.item_type)) return shown("DZ-E2072");
  if (f.description.length > DESCRIPTION_MAX) return shown("DZ-E2073");
  if (f.listing_styles.length > 3 || f.listing_styles.some((s) => !styles.includes(s))) return shown("DZ-E2082");
  return null;
}

/** Step 3 (Size, price and dates), before publishing. */
export function sizePriceProblem(f: ListingForm): ShownError | null {
  if (!(f.garment_type in garmentKinds)) return shown("DZ-E2075");
  if (!f.size_label.trim()) return shown("DZ-E2074");
  const labels = new Set<string>();
  for (const m of f.measurements) {
    const label = m.label.trim().toLowerCase();
    if (
      !label ||
      label.length > 40 ||
      labels.has(label) ||
      !Number.isFinite(m.value) ||
      m.value <= 0 ||
      m.value >= 1000 ||
      !["in", "cm"].includes(m.unit)
    )
      return shown("DZ-E2083");
    labels.add(label);
  }
  if (parsePrice(f.price_usd) === null) return shown("DZ-E2076");
  if (f.price_note.length > PRICE_NOTE_MAX) return shown("DZ-E2077");
  if (f.deposit_note.length > DEPOSIT_NOTE_MAX) return shown("DZ-E2078");
  if (typeof f.deposit_amount === "string" && parseDepositAmount(f.deposit_amount) === "DZ-E4051") return shown("DZ-E4051");
  const retail = retailValue(f.retail_value);
  if (Number.isNaN(retail)) return shown("DZ-E2079");
  if (f.category === "Accessories" && retail !== null && retail > ACCESSORY_MAX_USD) return shown("DZ-E2080");
  if (f.category === "Accessories" && !f.accessory_confirmed) return shown("DZ-E2081");
  if (!f.availability.length) return shown("DZ-E2084");
  if (
    f.availability.some(
      (a) => !datePattern.test(a.start_date) || !datePattern.test(a.end_date) || a.end_date < a.start_date,
    )
  )
    return shown("DZ-E2085");
  return null;
}

/** Publishing: every step's checks again. */
export function publishProblem(f: ListingForm): ShownError | null {
  return detailsProblem(f) ?? sizePriceProblem(f);
}

/**
 * A draft save refuses only what no step would accept either (text over its limit, unknown
 * styles); missing or unfinished fields are simply saved empty.
 */
export function draftProblem(f: ListingForm): ShownError | null {
  if (f.title.trim().length > TITLE_MAX) return shown("DZ-E2070");
  return tooLong(f);
}

/**
 * The columns a draft save writes: what is filled in and valid, and empty (null) for the rest.
 * Until the details step is done the row keeps the placeholder title and category, as on the app.
 */
export function draftRow(f: ListingForm) {
  const title = f.title.trim();
  const category = categories.includes(f.category) ? f.category : DRAFT_CATEGORY;
  const retail = retailValue(f.retail_value);
  return {
    title: title.length >= TITLE_MIN && title.length <= TITLE_MAX ? title : DRAFT_TITLE,
    category,
    description: f.description.trim() || null,
    item_type: category === "Accessories" && itemTypes.includes(f.item_type) ? f.item_type : null,
    garment_type: f.garment_type in garmentKinds ? f.garment_type : null,
    size_label: f.size_label.trim() || null,
    price_usd: parsePrice(f.price_usd),
    price_note: f.price_note.trim() || null,
    retail_value:
      retail === null || Number.isNaN(retail) || (category === "Accessories" && retail > ACCESSORY_MAX_USD)
        ? null
        : retail,
    deposit_note: f.deposit_note.trim() || null,
    listing_styles: f.listing_styles,
  };
}

type SavedListing = {
  status: string;
  title: string;
  category: string;
  item_type: string | null;
  size_label: string | null;
  price_usd: number | null;
};

/**
 * A paused listing that was never finished: the placeholder title, or no size or price yet
 * (saved from the photos or details step). My closet shows it as a draft, without the
 * Active/Paused switch; it goes live only through Publish, which makes it active (as the app's
 * Listing.isUnfinished).
 */
export function isUnfinished(l: SavedListing): boolean {
  return l.status === "paused" && (l.title === DRAFT_TITLE || !l.size_label?.trim() || l.price_usd == null);
}

/** Turning a listing on from My closet is publishing too: its title, size and price must be there. */
export function activationProblem(l: SavedListing): ShownError | null {
  if (l.title === DRAFT_TITLE || l.title.trim().length < TITLE_MIN) return shown("DZ-E2070");
  if (l.category === "Accessories" && !l.item_type) return shown("DZ-E2072");
  if (!l.size_label?.trim()) return shown("DZ-E2074");
  if (l.price_usd == null || !(Number(l.price_usd) > 0)) return shown("DZ-E2076");
  return null;
}

/** Next on the photos step: the paused draft row with whatever is filled in so far (F1). */
export function saveDraft(id: string, f: ListingForm, options?: RequestOptions) {
  return workflowRequest<{ id: string }>("listings/save", { id, form: { ...f, status: "paused" } }, options);
}

const text = (v: unknown) => (typeof v === "string" ? v : "");

/** The form in a request body with every field of the right kind (missing ones empty), or null. */
export function formFromBody(value: unknown): ListingForm | null {
  const f = value as Record<string, unknown> | null;
  if (
    !f ||
    typeof f !== "object" ||
    !Array.isArray(f.measurements) ||
    !Array.isArray(f.availability) ||
    !Array.isArray(f.listing_styles)
  )
    return null;
  return {
    title: text(f.title),
    category: text(f.category),
    description: text(f.description),
    item_type: text(f.item_type),
    garment_type: text(f.garment_type),
    size_label: text(f.size_label),
    price_usd: text(f.price_usd),
    price_note: text(f.price_note),
    retail_value: text(f.retail_value),
    deposit_note: text(f.deposit_note),
    deposit_amount: typeof f.deposit_amount === "string" ? f.deposit_amount : undefined,
    listing_styles: f.listing_styles.filter((s): s is string => typeof s === "string"),
    measurements: (f.measurements as Measurement[]).filter((m) => m && typeof m === "object").map((m) => ({
      label: text(m.label),
      value: Number(m.value),
      unit: m.unit,
    })),
    availability: (f.availability as { start_date: string; end_date: string }[])
      .filter((a) => a && typeof a === "object")
      .map((a) => ({ start_date: text(a.start_date), end_date: text(a.end_date) })),
    accessory_confirmed: f.accessory_confirmed === true,
  };
}
