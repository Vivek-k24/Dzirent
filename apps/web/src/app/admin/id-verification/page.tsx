import { Metadata } from "next";
import { idReviewsAction, type IdReview } from "@/lib/admin-actions";
import { IdVerificationView } from "@/components/admin/id-verification-view";

export const metadata: Metadata = {
  title: "Admin: ID Verification",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

/**
 * C6: the ID verification queue: checks in review (a possible duplicate account, or the provider's
 * own review) and declined ones, with approve, reject and reset attempts. Status, reason, attempts and
 * dates only: never ID images, selfies or the legal name (admin_list_id_reviews, logged).
 */
export default async function AdminIdVerificationPage() {
  let rows: IdReview[] | null = null;
  try {
    rows = await idReviewsAction();
  } catch {
    rows = null;
  }
  if (!rows) return <p className="muted">The ID verification queue couldn&apos;t be loaded.</p>;
  return <IdVerificationView rows={rows} />;
}
