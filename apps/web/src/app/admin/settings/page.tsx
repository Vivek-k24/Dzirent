import { Metadata } from "next";
import { serverClient } from "@/lib/supabase/server";
import { SettingsView } from "@/components/admin/settings-view";
import type { AdminSetting } from "@/lib/admin-settings";

export const metadata: Metadata = {
  title: "Admin: Settings",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

/** C4: the closed settings table (admin_list_settings, logged), grouped by area. */
export default async function AdminSettingsPage() {
  const client = await serverClient();
  const { data, error } = await client.rpc("admin_list_settings");
  if (error) return <p className="muted">The settings couldn&apos;t be loaded.</p>;
  return <SettingsView initial={(data as AdminSetting[] | null) ?? []} />;
}
