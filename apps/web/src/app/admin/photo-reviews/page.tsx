import { serverClient } from "@/lib/supabase/server";
import {
  PhotoReviewsView,
  type PhotoReviewItem,
} from "@/components/admin/photo-reviews-view";

export const dynamic = "force-dynamic";


export default async function AdminPhotoReviewsPage() {
  const client = await serverClient();
  const { data: reviews } = await client.rpc("admin_list_scan_reviews", {
    p_limit: 50,
    p_offset: 0,
  });

  return (
    <PhotoReviewsView initialItems={(reviews as PhotoReviewItem[]) || []} />
  );
}
