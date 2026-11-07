import { Metadata } from "next";
import { serverClient } from "@/lib/supabase/server";
import { AuditLogView, AuditLogEntry } from "@/components/admin/audit-log-view";

export const metadata: Metadata = {
  title: "Audit Log | Dzirent Admin",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

export default async function AdminAuditLogPage() {
  const client = await serverClient();
  const { data } = await client.rpc("admin_audit_log", {
    p_limit: 100,
    p_offset: 0,
  });

  const entries = (data || []) as AuditLogEntry[];

  return <AuditLogView initialEntries={entries} />;
}
