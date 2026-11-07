import { Metadata } from "next";
import { serverClient } from "@/lib/supabase/server";
import { UsersView, AdminUserData } from "@/components/admin/users-view";

export const metadata: Metadata = {
  title: "User Management | Dzirent Admin",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const resolvedParams = await searchParams;
  const query = resolvedParams.q || "";
  let initialUsers: AdminUserData[] = [];

  if (query.trim().length >= 3) {
    const client = await serverClient();
    const { data } = await client.rpc("admin_find_user", {
      p_query: query.trim(),
    });
    if (data && Array.isArray(data)) {
      initialUsers = data as AdminUserData[];
    }
  }

  return <UsersView initialUsers={initialUsers} initialQuery={query} />;
}
