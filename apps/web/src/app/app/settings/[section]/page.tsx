import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import { readSettings } from "@/lib/workflow-server";
import { Settings } from "@/components/settings";
import { Gate } from "@/components/cards";
export const metadata: Metadata = {
  title: "Your settings",
  robots: { index: false, follow: false },
};
export default async function SettingsPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section: asked } = await params;
  // C5: "payouts" is where the payment processor's onboarding returns by default: My studio.
  const section = asked === "payouts" ? "studio" : asked;
  if (!["studio", "measurements", "blocked", "preferences"].includes(section))
    notFound();
  if (!(await currentUser()))
    return <Gate reason="make it personal" next={"/app/settings/" + section} />;
  return <Settings section={section} initial={await readSettings()} />;
}
