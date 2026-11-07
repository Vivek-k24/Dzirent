import { serverClient } from "@/lib/supabase/server";
import { ReportsView, type ReportRow } from "@/components/admin/reports-view";

export const dynamic = "force-dynamic";


export default async function AdminReportsPage() {
  const client = await serverClient();
  // Fetch both open and closed reports to support client filtering
  const { data: reports } = await client.rpc("admin_list_reports", {
    p_status: null,
    p_limit: 100,
    p_offset: 0,
  });

  return <ReportsView initialReports={(reports as ReportRow[]) || []} />;
}
