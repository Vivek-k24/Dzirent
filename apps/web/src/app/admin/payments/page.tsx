import { Metadata } from "next";
import { serverClient } from "@/lib/supabase/server";
import { PaymentsView, type PaymentsOverview } from "@/components/admin/payments-view";

export const metadata: Metadata = {
  title: "Admin: Payments",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

/** C4: the payments queue (admin_payments_overview, logged). */
export default async function AdminPaymentsPage() {
  const client = await serverClient();
  const { data, error } = await client.rpc("admin_payments_overview");
  if (error || !data) return <p className="muted">The payments queue couldn&apos;t be loaded.</p>;
  return <PaymentsView overview={data as PaymentsOverview} />;
}
