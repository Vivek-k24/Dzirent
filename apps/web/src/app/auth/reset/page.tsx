import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth-frame";
import { ResetPasswordForm } from "@/components/auth-forms";
import { currentUser } from "@/lib/supabase/server";
import { errorText, shown } from "@/lib/errors";
import { resetView } from "@/lib/auth-flows";
import { Query, value } from "@/lib/types";

export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { index: false, follow: false },
};

/**
 * E1: the page a reset email opens. What it shows is resetView (lib/auth-flows.ts): the link's
 * token is used exactly once, when the form is sent; once a recovery session exists (the
 * dzirent-reset window and a signed-in user), every later load shows the form without the token
 * and never "expired". A ?code= link (Supabase's default template) is exchanged once by
 * /auth/callback, which comes back here without it. The recovery link never lands on the home page.
 */
export default async function ResetPassword({ searchParams }: { searchParams: Promise<Query> }) {
  const q = await searchParams;
  const recoverySession = Boolean((await cookies()).get("dzirent-reset")) && Boolean(await currentUser());
  const view = resetView(
    {
      token_hash: value(q, "token_hash"),
      type: value(q, "type"),
      code: value(q, "code"),
      error: value(q, "error") || value(q, "error_code"),
      expired: value(q, "expired"),
    },
    recoverySession,
  );
  if (view.view === "exchange") redirect("/auth/callback?flow=recovery&code=" + encodeURIComponent(view.code));
  const invite = value(q, "invite") === "1";
  if (view.view === "expired") {
    return (
      <AuthFrame title="This link has expired">
        <p role="alert" className="notice error">
          {errorText(shown(view.code))}
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
      <ResetPasswordForm tokenHash={view.tokenHash} invite={invite} />
    </AuthFrame>
  );
}
