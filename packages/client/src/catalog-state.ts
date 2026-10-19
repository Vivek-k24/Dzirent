import type { CatalogSelection, References } from "./types";

export const emptySelection = (): CatalogSelection => ({
  collection: "", q: "", category: [], subcategory: "", brand: [], color: [], band: [], size: [],
  start: "", end: "", metro: "", zip: "", sort: "featured", view: "grid", page: 1,
});
export function dateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}
export function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function fourDayEnd(start: string): string {
  const date = dateOnly(start);
  if (!date) return "";
  date.setDate(date.getDate() + 3);
  return isoDate(date);
}
export function rangeError(start: string, end: string, required = false): string | null {
  if (!start && !end) return required ? "Choose a rental start date." : null;
  if (!dateOnly(start) || !dateOnly(end)) return "Enter a complete date range using valid calendar dates.";
  return fourDayEnd(start) === end ? null : "Choose a four-day rental: the end must be three calendar days after the start.";
}
export function overlaps(a: { start: string; end: string }, b: { start: string; end: string }): boolean {
  return a.start <= b.end && a.end >= b.start;
}
export function parseSelection(params: URLSearchParams, refs?: References): CatalogSelection {
  const state = emptySelection();
  const roots = refs?.categories.map(c => c.slug);
  const one = (key: string, choices?: string[]) => {
    const value = params.get(key) ?? "";
    return !choices || choices.includes(value) ? value : "";
  };
  const many = (key: string, choices?: string[]) => [...new Set(params.getAll(key))].filter(v => !choices || choices.includes(v)).sort();
  state.collection = one("collection", roots);
  state.q = one("q").trim().slice(0, 200);
  state.category = many("category", roots);
  const effectiveRoots = state.category.length ? state.category : state.collection ? [state.collection] : roots;
  state.subcategory = one("subcategory", refs?.categories.filter(c => effectiveRoots?.includes(c.slug)).flatMap(c => c.children?.map(x => x.slug) ?? []));
  state.brand = many("brand", refs?.facets.brands.map(v => v.id));
  state.color = many("color", refs?.facets.colors.map(v => v.slug));
  state.band = many("band", ["A", "B", "C", "D"]);
  state.size = many("size", refs?.facets.sizes.map(v => v.id));
  state.start = one("start"); state.end = one("end");
  state.metro = one("metro", refs?.locations.items.map(v => v.slug));
  state.zip = one("zip");
  if (state.zip && !/^\d{5}$/.test(state.zip)) state.zip = "";
  state.sort = one("sort", ["featured", "price_asc", "price_desc", "newest", "top_rated"]) as CatalogSelection["sort"] || "featured";
  state.view = one("view", ["grid", "list"]) as CatalogSelection["view"] || "grid";
  const page = Number(params.get("page"));
  state.page = Number.isSafeInteger(page) && page > 0 ? page : 1;
  return state;
}
export function serializeSelection(state: CatalogSelection, api = false): string {
  const params = new URLSearchParams();
  const defaults = emptySelection();
  for (const key of Object.keys(state).sort() as (keyof CatalogSelection)[]) {
    if (api && key === "view") continue;
    const value = state[key];
    if (Array.isArray(value)) [...new Set(value)].sort().forEach(v => params.append(key, v));
    // Browser and API defaults differ; an explicit choice must survive either parser.
    else if (key === "sort" || (value !== defaults[key] && value !== "")) params.set(key, String(value));
  }
  return params.toString();
}
export function clearOptional(state: CatalogSelection): CatalogSelection {
  return { ...emptySelection(), collection: state.collection, sort: state.sort, view: state.view };
}
export function productHref(slug: string, start = "", end = ""): string {
  const dates = new URLSearchParams();
  if (start && end) { dates.set("start", start); dates.set("end", end); }
  return `/products/${encodeURIComponent(slug)}${dates.size ? `?${dates}` : ""}`;
}
export function safeReturnTo(value: string | null | undefined): string {
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\") || Array.from(value).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return "/";
  const url = new URL(value, "https://dzirent.invalid");
  return url.origin === "https://dzirent.invalid" && !url.pathname.startsWith("/auth/") ? `${url.pathname}${url.search}${url.hash}` : "/";
}
export function money(minor: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: minor % 100 ? 2 : 0 }).format(minor / 100);
}
export function minorUnits(value: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(minor) ? minor : null;
}
