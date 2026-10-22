import { delay, http, HttpResponse } from "msw";
import { z } from "zod";
import type { CurrentUser, ProductDetail } from "@dzirent/client";
import type { Studio, StudioProduct, StudioSettings } from "../../components/studios/types";
import { DEMO_STUDIOS, CURATED_LENDER_IDS } from "../demo-studios";

// Demo-only Studio simulation with the same wire shapes and rules as the FastAPI implementation.
interface StudioRecord { id: string; lender_profile_id: string; handle: string; display_name: string; bio: string; is_public: boolean; version: number; created_at: string; updated_at: string }
interface Deps {
  products: () => ProductDetail[];
  identity: (request: Request) => CurrentUser | null;
  owners: () => CurrentUser[];
  failure: (status: number, message: string, code?: string, details?: Record<string, unknown>[]) => Response;
}

const HANDLE = /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/;
// Mirrors the API text rules: no control characters (a multiline bio may keep tab/CR/LF).
function hasControl(text: string, multiline: boolean) {
  return [...text].some(char => { const code = char.charCodeAt(0); return code === 127 || (code < 32 && !(multiline && [9, 10, 13].includes(code))); });
}
const DETAIL_ONLY = ["lender_profile_id", "description", "garment_type", "audience", "fabric", "occasion", "stretch", "alterations", "known_wear", "measurements", "images", "date_blocks"] as const;

function seedStudios(): StudioRecord[] {
  return DEMO_STUDIOS.map(s => ({
    id: s.id,
    lender_profile_id: s.lender_profile_id,
    handle: s.handle,
    display_name: s.display_name,
    bio: s.bio,
    is_public: s.is_public,
    version: s.version,
    created_at: s.created_at,
    updated_at: s.updated_at,
  }));
}
let studios = seedStudios();
let sequence = 3000;
export function resetStudios() { studios = seedStudios(); sequence = 3000; }

function baseHandle(name: string) {
  const ascii = name.normalize("NFKD").replace(/[^\p{ASCII}]/gu, "");
  return ascii.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48).replace(/^-+|-+$/g, "") || "studio";
}
function newestFirst(a: ProductDetail, b: ProductDetail) {
  return Date.parse(b.created_at) - Date.parse(a.created_at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
function toCard(product: ProductDetail): StudioProduct {
  const card: Record<string, unknown> = { ...product };
  for (const key of DETAIL_ONLY) delete card[key];
  return card as unknown as StudioProduct;
}
function paging(params: URLSearchParams) {
  const page = Number(params.get("page") ?? 1), size = Number(params.get("page_size") ?? 24);
  return Number.isInteger(page) && page >= 1 && Number.isInteger(size) && size >= 1 && size <= 100 ? { page, size } : null;
}
const update = z.object({ display_name: z.string(), bio: z.string().optional().default(""), is_public: z.boolean(),
  expected_version: z.number().int().positive().nullable().optional() }).strict();

export function studioHandlers({ products, identity, owners, failure }: Deps) {
  const ownerActive = (s: StudioRecord) =>
    CURATED_LENDER_IDS.has(s.lender_profile_id) ||
    owners().some(u => u.status === "active" && u.lender_profile?.id === s.lender_profile_id && u.lender_profile.status === "active");
  const published = (s: StudioRecord) => products().filter(p => p.lender_profile_id === s.lender_profile_id && p.status === "published").sort(newestFirst);
  const visible = (s: StudioRecord) => s.is_public && ownerActive(s);
  const toPublic = (s: StudioRecord): Studio => ({ id: s.id, handle: s.handle, display_name: s.display_name, bio: s.bio, state_code: "TX", published_product_count: published(s).length });
  const toSettings = (s: StudioRecord): StudioSettings => ({ ...toPublic(s), is_public: s.is_public, version: s.version, created_at: s.created_at, updated_at: s.updated_at });
  const byHandle = (handle: string) => HANDLE.test(handle) ? studios.find(s => s.handle === handle && visible(s)) : undefined;
  const owner = (request: Request) => {
    const user = identity(request);
    if (!user) return { error: failure(401, "Use a sample identity to continue.") };
    if (!user.lender_profile) return { error: failure(403, "Create a sample lender profile first.") };
    return { profileId: user.lender_profile.id };
  };
  const stale = (current: number | null) => failure(409, "This Studio changed since it was loaded. Refresh before saving.", "stale_version", [{ field: "expected_version", current_version: current }]);

  return [
    http.get("*/api/v1/me/studio", async ({ request }) => {
      await delay(20);
      const who = owner(request);
      if (who.error) return who.error;
      const studio = studios.find(s => s.lender_profile_id === who.profileId);
      return studio ? HttpResponse.json(toSettings(studio)) : failure(404, "Create your Studio with PUT /me/studio.", "studio_not_found");
    }),
    http.put("*/api/v1/me/studio", async ({ request }) => {
      await delay(40);
      const who = owner(request);
      if (who.error) return who.error;
      const body = update.safeParse(await request.json().catch(() => null));
      if (!body.success) return failure(422, "Check the submitted fields.");
      const name = body.data.display_name.trim(), bio = body.data.bio.trim();
      if (!name || name.length > 80 || hasControl(name, false)) return failure(422, "Enter a Studio name of 1–80 characters.");
      if (bio.length > 600 || hasControl(bio, true)) return failure(422, "Keep the bio to 600 characters without control characters.");
      const existing = studios.find(s => s.lender_profile_id === who.profileId);
      const stamp = new Date(Date.UTC(2026, 10, 2, 12, 0, ++sequence % 60)).toISOString();
      if (!existing) {
        if (body.data.expected_version != null) return stale(null);
        const id = `d3120000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`;
        const base = baseHandle(name), handle = studios.some(s => s.handle === base) ? `${base}-${id.replace(/-/g, "").slice(0, 6)}` : base;
        const created = { id, lender_profile_id: who.profileId, handle, display_name: name, bio, is_public: body.data.is_public, version: 1, created_at: stamp, updated_at: stamp };
        studios = [...studios, created];
        return HttpResponse.json(toSettings(created));
      }
      if (body.data.expected_version !== existing.version) return stale(existing.version);
      const saved = { ...existing, display_name: name, bio, is_public: body.data.is_public, version: existing.version + 1, updated_at: stamp };
      studios = studios.map(s => s.id === saved.id ? saved : s);
      return HttpResponse.json(toSettings(saved));
    }),
    http.get("*/api/v1/studios", async ({ request }) => {
      await delay(25);
      const page = paging(new URL(request.url).searchParams);
      if (!page) return failure(422, "Invalid pagination.");
      const listed = studios.filter(s => visible(s) && published(s).length > 0).sort((a, b) => a.handle < b.handle ? -1 : a.handle > b.handle ? 1 : a.id < b.id ? -1 : 1);
      return HttpResponse.json({ items: listed.slice((page.page - 1) * page.size, page.page * page.size).map(toPublic), total: listed.length, page: page.page, page_size: page.size });
    }),
    http.get("*/api/v1/studios/:handle", async ({ params }) => {
      await delay(20);
      const studio = byHandle(String(params.handle));
      return studio ? HttpResponse.json(toPublic(studio)) : failure(404, "Studio not found.");
    }),
    http.get("*/api/v1/studios/:handle/products", async ({ request, params }) => {
      await delay(25);
      const page = paging(new URL(request.url).searchParams);
      if (!page) return failure(422, "Invalid pagination.");
      const studio = byHandle(String(params.handle));
      if (!studio) return failure(404, "Studio not found.");
      const items = published(studio);
      return HttpResponse.json({ items: items.slice((page.page - 1) * page.size, page.page * page.size).map(toCard), total: items.length, page: page.page, page_size: page.size });
    }),
  ];
}
