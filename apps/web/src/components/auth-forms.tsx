"use client";
// E1: the forms on the sign-in pages: "Forgot password?", the new password, "Send the link again"
// and "Finish your profile". Errors show in place, under the field they are about, with their
// DZ code; the server actions (app/auth/actions.ts) and the database check everything again.
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { errorText, type ShownError } from "@/lib/errors";
import { PASSWORD_MIN } from "@/lib/auth-flows";
import { finishProfile, requestPasswordReset, resendConfirmation, resetPassword, type FormState } from "@/app/auth/actions";
import { Submit } from "./submit";

function FieldError({ error, field }: { error?: ShownError; field: string }) {
  if (!error || error.field !== field) return null;
  return (
    <p role="alert" className="notice error field-error">
      {errorText(error)}
    </p>
  );
}

/** An error that isn't about one field (a limit, no connection). */
function FormError({ error, fields }: { error?: ShownError; fields: string[] }) {
  if (!error || (error.field && fields.includes(error.field))) return null;
  return (
    <p role="alert" className="notice error">
      {errorText(error)}
    </p>
  );
}

export function ForgotPasswordForm({ email = "" }: { email?: string }) {
  const [state, action] = useActionState<FormState, FormData>(requestPasswordReset, null);
  return (
    <form action={action} noValidate>
      {state?.notice && (
        <p role="status" className="notice">
          {state.notice}
        </p>
      )}
      <FormError error={state?.error} fields={["email"]} />
      <label className="field">
        <span>Email</span>
        <input name="email" type="email" autoComplete="email" defaultValue={email} required maxLength={320} data-required-message="Enter your email address." />
        <FieldError error={state?.error} field="email" />
      </label>
      <Submit label={state?.done ? "Send another link" : "Send the link"} />
    </form>
  );
}

export function ResetPasswordForm({ tokenHash, invite = false }: { tokenHash: string; invite?: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(resetPassword, null);
  if (state?.expired) {
    return (
      <div>
        <p role="alert" className="notice error">
          {state.error ? errorText(state.error) : "This link has expired."}
        </p>
        <p className="auth-switch">
          <Link href="/auth/forgot">Ask for a new link</Link>
        </p>
      </div>
    );
  }
  return (
    <form action={action}>
      <input type="hidden" name="token_hash" value={tokenHash} />
      <FormError error={state?.error} fields={["password", "password_confirm"]} />
      <label className="field">
        <span>{invite ? "Choose a password" : "New password"}</span>
        <input name="password" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} required data-required-message={`Choose a password of at least ${PASSWORD_MIN} characters.`} />
        <small>At least {PASSWORD_MIN} characters.</small>
        <FieldError error={state?.error} field="password" />
      </label>
      <label className="field">
        <span>Type it again</span>
        <input name="password_confirm" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} required data-required-message="Type the new password again." />
        <FieldError error={state?.error} field="password_confirm" />
      </label>
      <Submit label={invite ? "Save my password" : "Change my password"} />
    </form>
  );
}

/** "Send the link again", with the seconds left until it works again. */
export function ResendConfirmationForm({ email, waitSeconds }: { email: string; waitSeconds: number }) {
  const [state, action] = useActionState<FormState, FormData>(resendConfirmation, null);
  const [left, setLeft] = useState(waitSeconds);
  useEffect(() => {
    if (state?.done) Promise.resolve().then(() => setLeft(60));
  }, [state]);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return (
    <form action={action}>
      <input type="hidden" name="email" value={email} />
      {state?.notice && (
        <p role="status" className="notice">
          {state.notice}
        </p>
      )}
      <FormError error={state?.error} fields={[]} />
      {left > 0 ? (
        <button className="button full secondary" disabled aria-live="polite">
          Send the link again in {left} s
        </button>
      ) : (
        <Submit label="Send the link again" />
      )}
    </form>
  );
}

/**
 * "Finish your profile": shown instead of the page to a signed-in account whose profile isn't
 * finished (a Google sign-up's first visit), until it is.
 */
export function FinishProfileScreen({
  suggestedName,
  city,
  next,
  onUpdateLocation,
  signOutAction,
}: {
  suggestedName: string;
  city: string;
  next: string;
  onUpdateLocation: () => void;
  signOutAction: () => Promise<void>;
}) {
  const [state, action] = useActionState<FormState, FormData>(finishProfile, null);
  return (
    <div className="terms-update-wrapper">
      <div className="terms-update-card finish-profile-card">
        <h2>Finish your profile</h2>
        <p className="terms-update-lead">A few details before you list, rent or message on Dzirent.</p>
        <form action={action}>
          <input type="hidden" name="next" value={next} />
          <FormError error={state?.error} fields={["display_name", "adult", "legal", "city"]} />
          <label className="field">
            <span>Your name</span>
            <input name="name" autoComplete="name" maxLength={80} defaultValue={suggestedName} required data-required-message="Enter your name." />
            <small>Shown to people you rent with. You can change it later.</small>
            <FieldError error={state?.error} field="display_name" />
          </label>
          <div className="field">
            <span>Your area</span>
            <p style={{ margin: 0 }}>
              {city}{" "}
              <button type="button" className="text-button accent" onClick={onUpdateLocation}>
                Change
              </button>
            </p>
            <small>Only your rough area, to show distances. Never your address.</small>
            <FieldError error={state?.error} field="city" />
          </div>
          <label className="checkbox">
            <input type="checkbox" name="adult" required data-required-message="Confirm that you are 18 or older." />
            <span>I confirm I am 18 years of age or older.</span>
          </label>
          <FieldError error={state?.error} field="adult" />
          <label className="checkbox">
            <input type="checkbox" name="legal" required data-required-message="Agree to the Terms of Use and Privacy Policy." />
            <span>
              I agree to the{" "}
              <Link className="accent" href="/terms" target="_blank">
                Terms of Use
              </Link>{" "}
              and{" "}
              <Link className="accent" href="/privacy" target="_blank">
                Privacy Policy
              </Link>
              .
            </span>
          </label>
          <FieldError error={state?.error} field="legal" />
          <Submit label="Save and continue" />
        </form>
        <form action={signOutAction} className="terms-update-signout-form">
          <button type="submit" className="text-button">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
