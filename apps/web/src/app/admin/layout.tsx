import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentUser, serverClient } from "@/lib/supabase/server";
import { AdminNav, type AdminQueueCounts } from "@/components/admin/admin-nav";
import { AdminMfaGate } from "@/components/admin/mfa-gate";

export const metadata: Metadata = {
  title: "Admin - Dzirent",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";


export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  if (!user) {
    notFound();
  }

  const client = await serverClient();
  const { data: isAdmin } = await client.rpc("is_admin");

  if (!isAdmin) {
    // Check if user is an admin account that needs 2-step verification (at aal1)
    const { error: queuesError } = await client.rpc("admin_queues");
    if (
      queuesError?.message ===
      "Sign in with two-step verification to use admin tools"
    ) {
      return (
        <div className="page-width admin-shell-container" style={{ padding: "30px 16px" }}>
          <AdminMfaGate />
        </div>
      );
    }
    // Not an admin at all: return plain 404
    notFound();
  }

  const { data: queues } = await client.rpc("admin_queues");

  return (
    <div className="page-width admin-shell-container" style={{ padding: "24px 16px 60px" }}>
      <AdminNav queues={(queues as AdminQueueCounts) || null} />
      <div className="admin-page-body" style={{ marginTop: "24px" }}>
        {children}
      </div>
    </div>
  );
}
