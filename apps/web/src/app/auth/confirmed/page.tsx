import type { Metadata } from "next";
import Link from "next/link";
import { AuthFrame } from "@/components/auth-frame";
import { currentUser } from "@/lib/supabase/server";
import { errorText, shown } from "@/lib/errors";
import { Query, safeNext, value } from "@/lib/types";

export const metadata: Metadata = {
  title: "You're confirmed",
  robots: { index: false, follow: false },
};

// E1: where a confirmation link ends (after /auth/callback verified it). An account made in the
// app is signed in here too; on the phone they sign in as usual.
export default async function Confirmed({ searchParams }: { searchParams: Promise<Query> }) {
  const q = await searchParams;
  const next = safeNext(value(q, "next"));
  if (value(q, "error")) {
    return (
      <AuthFrame title="This link didn't work">
        <p role="alert" className="notice error">
          {errorText(shown("DZ-E1076"))}
        </p>
        <p className="auth-switch">
          <Link href="/auth?mode=signin">Sign in</Link> or <Link href="/auth/check-email">send the link again</Link>
        </p>
      </AuthFrame>
    );
  }
  const user = await currentUser();
  const change = value(q, "change") === "1";
  return (
    <AuthFrame
      title={change ? "Email change confirmed" : "You're confirmed"}
      lead={
        change
          ? "If we also sent a link to your other address, open that one too. The change finishes once both are confirmed."
          : "Your email is confirmed. Welcome to Dzirent. If you signed up in the app, go back to it and sign in."
      }
    >
      <p>
        <Link className="button full" href={user ? next : "/auth?mode=signin"}>
          {user ? "Continue" : "Sign in"}
        </Link>
      </p>
    </AuthFrame>
  );
}
