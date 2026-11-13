import "server-only";
import { createClient } from "@supabase/supabase-js";
import { config, photoUrl } from "./supabase/config";
import { retryingFetch } from "./retry";
import { cityLabel, perDay, type Card, type Listing } from "./types";

// P5C link previews. Everything here is read as a guest (an anonymous client, no cookies), so a
// preview can only ever show what the shop window shows a guest: title, price, city, studio name,
// handle and listing photos. Never coordinates, email, account ids or anything private.

function guestClient() {
  const { url, key } = config();
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: retryingFetch() },
  });
}

/** A route parameter, percent-decoded when it still is encoded; never throws. */
export function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

const UUID =/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The listing as a guest sees it, or null when it is paused, deleted, hidden or not a listing id. */
export async function guestListing(id: string): Promise<Listing | null> {
  if (!UUID.test(id)) return null;
  const { data, error } = await guestClient().rpc("get_listing", { p_listing_id: id });
  if (error) return null;
  return ((data as Listing[] | null)?.[0] ?? null) as Listing | null;
}

/** "$25 · Austin, TX" (the city left out when it isn't known). */
export function priceAndCity(listing: Pick<Card, "price" | "city">): string {
  const place = cityLabel(listing.city);
  return place === "City unavailable" ? perDay(listing.price) : `${perDay(listing.price)} · ${place}`;
}

export type StudioPreview = { name: string; handle: string; photos: string[] };

/**
 * A studio's public card for previews: its name and handle and up to 4 cover photos, from the
 * guest shop window (studio pages themselves are for signed-in people only). Reads at most 10
 * pages of 30; null when the studio has no active pieces there.
 */
export async function studioPreview(handle: string): Promise<StudioPreview | null> {
  const wanted = handle.trim().toLowerCase();
  if (!wanted || wanted.length > 60) return null;
  const client = guestClient();
  const cards: Card[] = [];
  for (let page = 0; page < 10 && cards.length < 4; page++) {
    const { data, error } = await client.rpc("browse_listings", {
      p_limit: 30,
      p_offset: page * 30,
      p_sort: "newest",
    });
    if (error || !data) break;
    const rows = data as Card[];
    cards.push(...rows.filter((c) => c.studio_handle?.toLowerCase() === wanted));
    if (rows.length < 30) break;
  }
  if (!cards.length) return null;
  return {
    name: cards[0].studio_name || cards[0].studio_handle || handle,
    handle: cards[0].studio_handle || handle,
    photos: cards
      .map((c) => photoUrl(c.cover_photo_path))
      .filter((p): p is string => Boolean(p))
      .slice(0, 4),
  };
}

/** Newest pieces a guest can see, for the "no longer available" page. */
export async function newestPieces(limit = 8): Promise<Card[]> {
  const { data, error } = await guestClient().rpc("browse_listings", {
    p_limit: limit,
    p_offset: 0,
    p_sort: "newest",
  });
  return error || !data ? [] : (data as Card[]);
}

/**
 * A listing photo as a data URI the preview renderer can draw, or null. Only the project's own
 * public listing-photos URLs (photoUrl checks that), only JPEG or PNG, at most 10 MB, 5 seconds.
 */
export async function photoData(url: string | null): Promise<string | null> {
  if (!url || !photoUrl(url)) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: "error" });
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > 10 * 1024 * 1024) return null;
    const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
    const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    if (!jpeg && !png) return null;
    return `data:image/${jpeg ? "jpeg" : "png"};base64,${Buffer.from(bytes).toString("base64")}`;
  } catch {
    return null;
  }
}
