import type { Metadata } from "next";
import { currentUser } from "@/lib/supabase/server";
import { readVerification } from "@/lib/workflow-server";
import { Gate } from "@/components/cards";
import { VerifyDone } from "@/components/verify-done";
import type { VerificationData } from "@/lib/verification";

export const metadata: Metadata = {
  title: "Checking your ID",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * C6: where the verification provider's pages send people back (the session's callback, on the site
 * they started from). Shows "Checking..." until the result arrives, then continues to the page whose
 * action needed the check, if any. The provider's own query parameters are ignored: only the
 * database's status counts.
 */
export default async function VerifyDonePage() {
  const user = await currentUser();
  if (!user) return <Gate reason="see your ID check" next="/verify/done" />;
  let initial: VerificationData | null = null;
  try {
    initial = await readVerification();
  } catch {
    initial = null;
  }
  return <VerifyDone me={user.id} initial={initial} />;
}
