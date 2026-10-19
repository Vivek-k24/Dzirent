import type { components } from "@dzirent/client";

// Local aliases over the generated contract (0.1.0-candidate.2); the shared alias file is not Studio-owned.
type Schemas = components["schemas"];
export type Studio = Schemas["Studio"];
export type StudioPage = Schemas["StudioPage"];
export type StudioSettings = Schemas["StudioSettings"];
export type StudioUpdate = Schemas["StudioUpdate"];
export type StudioProductPage = Schemas["StudioProductPage"];
export type StudioProduct = StudioProductPage["items"][number];

export const STUDIO_DIRECTORY_PAGE = 24;
export const STUDIO_WARDROBE_PAGE = 24;
// Small pages make the carousel genuinely fetch later API pages to reach every published outfit.
export const STUDIO_CAROUSEL_PAGE = 12;

const SIZE_SYSTEMS: Record<string, string> = { alpha: "", "US-women": "US women ", "US-men": "US men " };
export function sizeLabel(size: StudioProduct["size"]): string {
  return `Size ${SIZE_SYSTEMS[size.sizing_system] ?? ""}${size.label}`;
}
export function outfitCount(count: number): string {
  return `${count} published ${count === 1 ? "outfit" : "outfits"}`;
}
