// apps/web/src/components/terms-update.tsx
import Link from "next/link";
import { acceptLegalAction, signOut } from "@/app/actions";
import { Icon } from "./icon";

export function TermsUpdateScreen() {
  return (
    <div className="terms-update-wrapper">
      <div className="terms-update-card">
        <div className="terms-update-icon">
          <Icon name="bookmark" />
        </div>
        <h2>We&apos;ve updated our terms</h2>
        <p className="terms-update-lead">
          To keep using Dzirent, please read and agree to our{" "}
          <Link href="/terms" target="_blank" className="accent">
            Terms of Use
          </Link>{" "}
          and{" "}
          <Link href="/privacy" target="_blank" className="accent">
            Privacy Policy
          </Link>
          .
        </p>

        <form action={acceptLegalAction} className="terms-update-agree-form">
          <button type="submit" className="button full">
            Agree
          </button>
        </form>

        <form action={signOut} className="terms-update-signout-form">
          <button type="submit" className="text-button">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
