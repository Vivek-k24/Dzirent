import { overlaps, rangeError } from "./catalog-state";
import type { ProductCard, ProductDetail } from "./types";
export interface CartLine { key: string; product: ProductCard; sizeId: string; start: string; end: string }
export function cartIssue(lines: CartLine[], product: ProductDetail, sizeId: string, start: string, end: string): string | null {
  const invalid = rangeError(start, end, true);
  if (invalid) return invalid;
  if (sizeId !== product.size.id) return "Select this garment’s listed size.";
  if (!product.is_available || product.status !== "published") return "This demo garment is currently unavailable.";
  if (product.date_blocks.some(block => overlaps({ start, end }, block))) return "This garment is unavailable during those demo dates. Choose another start date.";
  if (lines.some(line => line.product.id === product.id && overlaps(line, { start, end }))) return "This garment is already in your bag for overlapping dates.";
  return null;
}
