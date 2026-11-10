import { guestListing, photoData, priceAndCity } from "@/lib/preview";
import { genericImage, listingImage, OG_SIZE, OG_TYPE } from "@/lib/og";
import { photoUrl } from "@/lib/supabase/config";

// P5C: the listing's link preview image. Guest data only; a piece that is no longer available
// gets the generic Dzirent image.
export const alt = "A piece to rent on Dzirent";
export const size = OG_SIZE;
export const contentType = OG_TYPE;

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const listing = await guestListing(id);
  if (!listing) return genericImage("This piece is no longer available");
  const first = [...(listing.photos || [])].sort((a, b) => a.position - b.position)[0];
  return listingImage({
    photo: await photoData(photoUrl(first?.storage_path)),
    title: listing.title,
    line: priceAndCity(listing),
    handle: listing.studio_handle,
  });
}
