import { categories, styles } from "./types";
import { garmentKinds, itemTypes, type Measurement } from "./workflows";
import { parseDepositAmount } from "./rentals";
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
export function validateListing(f: ListingForm) {
  if (f.title.trim().length < 3 || f.title.trim().length > 80)
    return "Title must be 3 to 80 characters.";
  if (!categories.includes(f.category)) return "Choose a category.";
  if (f.category === "Accessories" && !itemTypes.includes(f.item_type))
    return "Choose an item type for Accessories.";
  if (f.description.length > 1000)
    return "Description can be up to 1000 characters.";
  if (!f.size_label.trim()) return "Choose a size.";
  if (!(f.garment_type in garmentKinds)) return "Choose a garment kind.";
  if (
    !/^\d+(\.\d{1,2})?$/.test(f.price_usd) ||
    Number(f.price_usd) <= 0 ||
    Number(f.price_usd) > 10000
  )
    return "Enter a price above $0, like 25 or 25.50.";
  if (f.price_note.length > 60)
    return "Price details can be up to 60 characters.";
  if (f.deposit_note.length > 120)
    return "Deposit note can be up to 120 characters.";
  if (typeof f.deposit_amount === "string" && parseDepositAmount(f.deposit_amount) === "DZ-E4051")
    return "Enter the deposit in dollars, up to $99,999.99, or leave it empty. (DZ-E4051)";
  if (
    f.retail_value &&
    (!Number.isFinite(Number(f.retail_value)) || Number(f.retail_value) <= 0)
  )
    return "Retail value must be a number above 0, or leave it empty.";
  if (f.category === "Accessories" && Number(f.retail_value) > 300)
    return "Accessories worth more than $300 can't be listed on Dzirent. Lower the retail value if it's worth less.";
  if (f.category === "Accessories" && !f.accessory_confirmed)
    return "Tick the box confirming this isn't fine jewelry and is worth under $300.";
  if (
    f.listing_styles.length > 3 ||
    f.listing_styles.some((s) => !styles.includes(s))
  )
    return "Choose up to 3 styles.";
  const labels = new Set<string>();
  for (const m of f.measurements) {
    if (
      !m.label.trim() ||
      m.label.trim().length > 40 ||
      labels.has(m.label.trim().toLowerCase()) ||
      !Number.isFinite(m.value) ||
      m.value <= 0 ||
      m.value >= 1000 ||
      !["in", "cm"].includes(m.unit)
    )
      return "Fix the highlighted measurements, or remove those rows.";
    labels.add(m.label.trim().toLowerCase());
  }
  if (!f.availability.length) return "Add the dates this piece is available.";
  if (
    f.availability.some(
      (a) =>
        !/^\d{4}-\d{2}-\d{2}$/.test(a.start_date) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(a.end_date) ||
        a.end_date < a.start_date,
    )
  )
    return "Choose an end date on or after your start date.";
  return null;
}
