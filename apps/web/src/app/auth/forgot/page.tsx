import type { Metadata } from "next";
import Link from "next/link";
import { AuthFrame } from "@/components/auth-frame";
import { ForgotPasswordForm } from "@/components/auth-forms";

export const metadata: Metadata = {
  title: "Forgot your password?",
  robots: { index: false, follow: false },
};

// E1: "Forgot password?". The answer never says whether the address has an account.
export default function ForgotPassword() {
  return (
    <AuthFrame title="Forgot your password?" lead="Enter your account's email. We'll send a link to choose a new password.">
      <ForgotPasswordForm />
      <p className="auth-switch">
        Remembered it? <Link href="/auth?mode=signin">Sign in</Link>
      </p>
    </AuthFrame>
  );
}
