import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import { readSettings, readVerification } from "@/lib/workflow-server";
import { Settings } from "@/components/settings";
import { Gate } from "@/components/cards";
import { safeReturnPath } from "@/lib/verification";
export const metadata: Metadata = {
  title: "Your settings",
  robots: { index: false, follow: false },
};
export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const [{ section: asked }, query] = await Promise.all([params, searchParams]);
  // C5: "payouts" is where the payment processor's onboarding returns by default: My studio.
  const section = asked === "payouts" ? "studio" : asked;
  if (!["studio", "measurements", "blocked", "preferences", "verification"].includes(section))
    notFound();
  if (!(await currentUser()))
    return <Gate reason="make it personal" next={"/app/settings/" + section} />;
  // C6: Settings > Verification; `next` is the page to go back to once verified (a refused action).
  const verification = section === "verification" ? await readVerification() : null;
  const next = safeReturnPath(Array.isArray(query.next) ? query.next[0] : query.next);
  return <Settings section={section} initial={await readSettings()} verification={verification} verifyNext={next} />;
}
