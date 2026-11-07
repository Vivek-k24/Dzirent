import { Metadata } from "next";
import { serverClient } from "@/lib/supabase/server";
import { FlagsView, FeatureFlag } from "@/components/admin/flags-view";

export const metadata: Metadata = {
  title: "Feature Flags | Dzirent Admin",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

export default async function AdminFlagsPage() {
  const client = await serverClient();
  const { data } = await client
    .from("app_settings")
    .select("key, enabled, description, updated_at")
    .order("key");

  const flags = (data || []) as FeatureFlag[];

  return <FlagsView initialFlags={flags} />;
}
