import { Metadata } from "next";
import { serverClient } from "@/lib/supabase/server";
import { TakedownsView, AdminTakedownItem } from "@/components/admin/takedowns-view";

export const metadata: Metadata = {
  title: "Admin: Takedowns",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

export default async function AdminTakedownsPage() {
  const client = await serverClient();
  const { data } = await client.rpc("admin_list_takedowns", {
    p_status: null, // null loads open ones (received & countered)
    p_limit: 50,
    p_offset: 0,
  });

  const takedowns = (data || []) as AdminTakedownItem[];

  return <TakedownsView initialTakedowns={takedowns} />;
}
