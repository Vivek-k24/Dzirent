import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { AuthFrame } from "@/components/auth-frame";
import { ResetPasswordForm } from "@/components/auth-forms";
import { currentUser } from "@/lib/supabase/server";
import { errorText, shown } from "@/lib/errors";
import { Query, value } from "@/lib/types";

export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { index: false, follow: false },
};

/**
 * E1: the page a reset email opens (?token_hash=&type=recovery; the token is used when the form is
 * sent), and where an invite or an old-style link lands after /auth/callback used it (the
 * dzirent-reset cookie, 15 minutes). Without either: a clear message and a way back to
 * "Forgot password?". The recovery link never lands on the home page.
 */
export default async function ResetPassword({ searchParams }: { searchParams: Promise<Query> }) {
  const q = await searchParams;
  const tokenHash = value(q, "token_hash");
  const usable = /^[\w-]{6,512}$/.test(tokenHash) && (value(q, "type") || "recovery") === "recovery";
  const invite = value(q, "invite") === "1";
  const windowOpen = Boolean((await cookies()).get("dzirent-reset")) && Boolean(await currentUser());
  if (value(q, "expired") === "1" || (!usable && !windowOpen)) {
    return (
      <AuthFrame title="This link has expired">
        <p role="alert" className="notice error">
          {errorText(shown(value(q, "expired") === "1" ? "DZ-E1075" : "DZ-E1083"))}
        </p>
        <p className="auth-switch">
          <Link href="/auth/forgot">Ask for a new link</Link> or <Link href="/auth?mode=signin">sign in</Link>
        </p>
      </AuthFrame>
    );
  }
  return (
    <AuthFrame
      title={invite ? "Choose your password" : "Choose a new password"}
      lead={invite ? "You'll sign in with your email and this password." : "After this, you're signed in here and signed out everywhere else."}
    >
      <ResetPasswordForm tokenHash={usable ? tokenHash : ""} invite={invite} />
    </AuthFrame>
  );
}
