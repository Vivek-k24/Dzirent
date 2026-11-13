export type Card = {
  id: string;
  title: string;
  /** Price per day in USD (C1); the same number as price_per_day. */
  price: number | null;
  price_per_day?: number | null;
  price_unit?: string | null;
  /** With dates passed to the shop window: days (inclusive) and price per day x days. */
  days?: number | null;
  total?: number | null;
  distance: number | null;
  city: string | null;
  category: string;
  cover_photo_path: string | null;
  studio_name: string | null;
  studio_handle: string | null;
};
export type Listing = Card & {
  description: string | null;
  item_type: string | null;
  garment_type: string | null;
  size_label: string | null;
  price_note: string | null;
  deposit_note: string | null;
  retail_value: number | null;
  listing_styles: string[];
  created_at: string;
  photos: { storage_path: string; position: number; slot: string | null }[];
  measurements: { label: string; value: number; unit: string }[];
  availability: { start_date: string; end_date: string }[];
};
export type Studio = {
  studio_name: string;
  studio_handle: string;
  studio_bio: string | null;
  style_tags: string[];
  city: string;
  pickup_area: string | null;
  rental_count: number;
  reply_minutes: number | null;
  is_saved: boolean;
  listings: Card[];
};
export type StudioCardData = {
  studio_name: string;
  studio_handle: string;
  city: string | null;
  cover_photo_path: string | null;
  distance: number | null;
  piece_count: number;
};
export type City = {
  id: string;
  name: string;
  state: string;
  lat: number;
  lng: number;
};
export type BrowseContext = {
  city: string;
  lat: number;
  lng: number;
  start: string;
  end: string;
  datesActive: boolean;
  radiusMiles: number;
  distanceUnit: "mi" | "km";
};
export type Query = Record<string, string | string[] | undefined>;
export const categories = [
  "Career & Professional",
  "Occasion & Party",
  "Cultural & Traditional",
  "Everyday",
  "Outerwear",
  "Accessories",
];
export const styles = [
  "South Asian",
  "East Asian",
  "Southeast Asian",
  "Middle Eastern",
  "African",
  "Mexican & Latin American",
  "Country & Western",
  "Western formal",
  "Western casual",
];
export const value = (q: Query, name: string) =>
  Array.isArray(q[name]) ? q[name][0] : q[name] || "";
export const price = (amount: number | null) =>
  amount == null
    ? "Ask for price"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(amount);
/** C1: prices are per day. "$25/day", or "Ask for price" for listings without one. */
export const perDay = (amount: number | null) =>
  amount == null ? price(null) : `${price(amount)}/day`;
/** "5 days · $125" ("1 day · $25"), from the shop window's days and total; null without dates. */
export const daysAndTotal = (days: number | null | undefined, total: number | null | undefined) =>
  days == null || total == null ? null : `${days === 1 ? "1 day" : `${days} days`} · ${price(total)}`;
export const distance = (miles: number | null) =>
  miles == null
    ? "distance unavailable"
    : miles < 1
      ? "under 1 mi"
      : miles + " mi";
export function cityLabel(city: string | null) {
  if (!city) return "City unavailable";
  const matched = city.match(/^(.+?),\s*([A-Z]{2})(?:\s|,|$)/);
  return matched ? matched[1] + ", " + matched[2] : "City unavailable";
}
export function safeNext(path: string | null | undefined) {
  if (
    !path?.startsWith("/") ||
    path.startsWith("//") ||
    /[\u0000-\u001f\\]/.test(path) ||
    /^\/(?:%2f|%5c)/i.test(path)
  )
    return "/";
  return path;
}
