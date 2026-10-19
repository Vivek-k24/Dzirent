import type { components } from "./generated/api";

type Schema = components["schemas"];
export type ProductCard = Schema["ProductCard"];
export type ProductDetail = Schema["ProductDetail"];
export type ProductWrite = Schema["ProductWrite"];
export type ProductPage = Schema["ProductPage"];
export type LenderProductPage = Schema["LenderProductPage"];
export type Category = Schema["CategoryNode"];
export type CategoryTree = Schema["CategoryTree"];
export type Facets = Schema["Facets"];
export type MetroList = Schema["MetroList"];
export type CurrentUser = Schema["CurrentUser"];
export type ApiErrorBody = Schema["Error"];
export type SortOrder = "featured" | "price_asc" | "price_desc" | "newest" | "top_rated";
export interface CatalogSelection {
  collection: string; q: string; category: string[]; subcategory: string; brand: string[];
  color: string[]; band: string[]; size: string[]; start: string; end: string;
  metro: string; zip: string; sort: SortOrder; view: "grid" | "list"; page: number;
}
export interface References { categories: Category[]; facets: Facets; locations: MetroList }
