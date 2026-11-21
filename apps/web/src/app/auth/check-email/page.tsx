import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { AuthFrame } from "@/components/auth-frame";
import { ResendConfirmationForm } from "@/components/auth-forms";
import { resendWait } from "@/lib/auth-flows";

export const metadata: Metadata = {
  title: "Check your email",
  robots: { index: false, follow: false },
};

/** Seconds until "Send the link again" works (the time of the last one is in a cookie). */
function secondsLeft(lastSent: string | undefined) {
  return resendWait(Number(lastSent), Date.now());
}

// E1: after a password sign-up (Confirm email is on): the link's address and "Send the link again".
// The address comes from a short-lived cookie the sign-up set, never from the page's address.
export default async function CheckEmail() {
  const jar = await cookies();
  const email = jar.get("dzirent-pending-email")?.value ?? "";
  const wait = secondsLeft(jar.get("dzirent-resent-at")?.value);
  return (
    <AuthFrame
      title="Check your email"
      lead={
        email
          ? `We sent a link to ${email}. Open it to confirm your account, then sign in.`
          : "We sent you a link. Open it to confirm your account, then sign in."
      }
    >
      <p className="notice">The link works for one hour. Look in your spam folder if it isn&apos;t in your inbox.</p>
      {email && <ResendConfirmationForm email={email} waitSeconds={wait} />}
      <p className="auth-switch">
        Confirmed already? <Link href="/auth?mode=signin">Sign in</Link>
      </p>
    </AuthFrame>
  );
}
