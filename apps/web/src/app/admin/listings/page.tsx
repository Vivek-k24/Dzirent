import { serverClient } from "@/lib/supabase/server";
import {
  ListingsView,
  type AdminListingItem,
} from "@/components/admin/listings-view";

export const dynamic = "force-dynamic";


export default async function AdminListingsPage() {
  const client = await serverClient();
  // Fetch up to 100 listings with their lender details and cover photo
  const { data: listings } = await client
    .from("listings")
    .select(
      `
      id,
      title,
      price_usd,
      category,
      city,
      status,
      hold,
      hold_reason,
      auto_paused_reason,
      lender:profiles!listings_lender_id_fkey(display_name, studio_name, studio_handle),
      photos:listing_photos(storage_path, position)
    `,
    )
    .order("created_at", { ascending: false })
    .limit(100);

  type RawListing = {
    id: string;
    title: string;
    price_usd: number | null;
    category: string;
    city: string;
    status: string;
    hold: string | null;
    hold_reason: string | null;
    auto_paused_reason: string | null;
    lender?: {
      display_name: string;
      studio_name: string | null;
      studio_handle: string | null;
    } | null;
    photos?: Array<{ storage_path: string; position: number }> | null;
  };

  const formatted: AdminListingItem[] = (
    (listings || []) as unknown as RawListing[]
  ).map((l) => {
    const sortedPhotos = (l.photos || []).sort(
      (a, b) => a.position - b.position,
    );
    const lenderObj = Array.isArray(l.lender) ? l.lender[0] : l.lender;
    return {
      id: l.id,
      title: l.title,
      price: l.price_usd || undefined,
      category: l.category,
      city: l.city,
      cover_photo_path: sortedPhotos[0]?.storage_path || null,
      studio_name: lenderObj?.studio_name || lenderObj?.display_name,
      studio_handle: lenderObj?.studio_handle || undefined,
      status: l.status,
      hold: l.hold,
      hold_reason: l.hold_reason,
      auto_paused_reason: l.auto_paused_reason,
    };
  });


  return <ListingsView initialListings={formatted} />;
}
