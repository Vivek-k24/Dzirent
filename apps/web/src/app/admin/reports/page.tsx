import { serverClient } from "@/lib/supabase/server";
import { ReportsView, type ReportRow } from "@/components/admin/reports-view";
import { rentalPhotoPaths } from "@/components/admin/rental-evidence";

export const dynamic = "force-dynamic";


export default async function AdminReportsPage() {
  const client = await serverClient();
  // Fetch both open and closed reports to support client filtering
  const { data: reports } = await client.rpc("admin_list_reports", {
    p_status: null,
    p_limit: 100,
    p_offset: 0,
  });
  const rows = (reports as ReportRow[]) || [];

  // C3: rental reports carry condition photo paths; the bucket is private, so sign them here
  // (admins with a fresh two-step session can read it).
  const paths = rentalPhotoPaths(rows.filter((r) => r.target_type === "rental" && r.evidence).map((r) => r.evidence!));
  const rentalLinks: Record<string, string> = {};
  if (paths.length) {
    const { data } = await client.storage.from("rental-photos").createSignedUrls(paths, 3600);
    for (const link of data || []) if (link.path && link.signedUrl) rentalLinks[link.path] = link.signedUrl;
  }

  return <ReportsView initialReports={rows} rentalLinks={rentalLinks} />;
}
