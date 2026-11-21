// E1: the rules behind the website's sign-in pages (forgot password, reset, the confirmation link,
// Google, "Finish your profile"), without Next or Supabase, so `npm test` runs them as they are.
// The .ts extensions let Node (type stripping) load this file.
import { shown, type ShownError } from "./errors.ts";

export const PASSWORD_MIN = 8;
/** Seconds between two "send the link again" clicks (Auth allows one per minute per address). */
export const RESEND_COOLDOWN_SECONDS = 60;
/** How long the reset page trusts the session a reset link made (then the link must be opened again). */
export const RESET_WINDOW_SECONDS = 15 * 60;

/** Always the answer to "Forgot password?", whether or not the address has an account. */
export const NEUTRAL_RESET = "If that address has an account, we've sent a link to reset its password. Check your inbox (and spam folder); the link works for one hour.";
/** The answer to "Send the link again" (it never says whether the address is waiting). */
export const NEUTRAL_RESEND = "If that address is waiting to be confirmed, we've sent the link again. Check your inbox and spam folder.";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** A missing or malformed address. */
export function emailProblem(email: string): ShownError | null {
  const e = email.trim();
  return !e || e.length > 320 || !EMAIL.test(e) ? shown("DZ-E1070") : null;
}

/** The new password's own rules, the same as sign-up (8 characters), and both fields the same. */
export function newPasswordProblem(password: string, confirm: string): ShownError | null {
  if (password.length < PASSWORD_MIN) return shown("DZ-E1071");
  if (confirm !== password) return shown("DZ-E1072");
  return null;
}

/** What Supabase Auth returns on a failure (AuthError's fields). */
export type AuthFailure = { code?: string | null; status?: number | null; message?: string | null; reasons?: string[] | null } | null | undefined;

/** The catalog code for an Auth failure on the reset and sign-up paths. */
export function authErrorCode(err: AuthFailure): string {
  if (!err) return "DZ-E9999";
  const code = err.code ?? "";
  const message = (err.message ?? "").toLowerCase();
  if (code === "weak_password") return (err.reasons ?? []).includes("pwned") ? "DZ-E1073" : "DZ-E1007";
  if (code === "same_password") return "DZ-E1074";
  if (code === "otp_expired" || code === "flow_state_expired" || code === "flow_state_not_found" || /expired|invalid.*(token|otp|link)/.test(message)) return "DZ-E1075";
  if (code === "email_address_invalid" || code === "validation_failed") return "DZ-E1070";
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || err.status === 429) return "DZ-E1008";
  if (/fetch failed|network|timed? ?out|econn/.test(message) || err.status === 0) return "DZ-E9002";
  if ((err.status ?? 0) >= 500) return "DZ-E1084";
  return "DZ-E9999";
}

/** The website's own limit on reset and confirmation emails (auth_email_allowed). */
export type LimitAnswer = "ok" | "ip_limited" | "address_limited";

export type EmailRequestOutcome = { sent: true } | { sent: false; error: ShownError };

/**
 * What the page says after a "Forgot password?" or "Send the link again" request. Only what
 * doesn't depend on the address is ever shown as an error (this network's limit, a malformed
 * address, no connection to the server). Everything that could tell whether an account exists
 * (Auth's per-address limit, a failure while sending, our own per-address limit) gets the same
 * neutral answer as a sent link.
 */
export function emailRequestOutcome(limit: LimitAnswer | null, err: AuthFailure): EmailRequestOutcome {
  if (limit === "ip_limited") return { sent: false, error: shown("DZ-E1008") };
  if (limit === "address_limited" || !err) return { sent: true };
  const code = err.code ?? "";
  if (code === "email_address_invalid" || code === "validation_failed") return { sent: false, error: shown("DZ-E1070") };
  if (code === "over_email_send_rate_limit") return { sent: true };
  if (code === "over_request_rate_limit" || err.status === 429) return { sent: false, error: shown("DZ-E1008") };
  if (authErrorCode(err) === "DZ-E9002") return { sent: false, error: shown("DZ-E9002") };
  return { sent: true };
}

/** Which email link this is: the types Dzirent's templates send. */
export const LINK_TYPES = ["email", "signup", "magiclink", "invite", "email_change", "recovery"] as const;
export type LinkType = (typeof LINK_TYPES)[number];

export type CallbackStep =
  | { step: "exchange"; code: string }
  | { step: "verify"; tokenHash: string; type: LinkType }
  | { step: "fail"; code: string };

/**
 * /auth/callback: Google comes back with ?code= (or ?error=), an email link with
 * ?token_hash=&type=. Anything else is a broken or old link.
 */
export function callbackStep(q: { code?: string | null; token_hash?: string | null; type?: string | null; error?: string | null }): CallbackStep {
  if (q.error) return { step: "fail", code: q.error === "access_denied" ? "DZ-E7022" : "DZ-E7020" };
  if (q.code && /^[\w-]{6,512}$/.test(q.code)) return { step: "exchange", code: q.code };
  const type = (q.type ?? "") as LinkType;
  if (q.token_hash && /^[\w-]{6,512}$/.test(q.token_hash) && (LINK_TYPES as readonly string[]).includes(type)) {
    return { step: "verify", tokenHash: q.token_hash, type };
  }
  return { step: "fail", code: q.code ? "DZ-E7020" : "DZ-E1076" };
}

/** Where a verified email link goes next. A reset or an invite needs a new password first. */
export function afterVerified(type: LinkType): { path: string; resetWindow: boolean } {
  if (type === "recovery") return { path: "/auth/reset", resetWindow: true };
  if (type === "invite") return { path: "/auth/reset?invite=1", resetWindow: true };
  if (type === "email_change") return { path: "/auth/confirmed?change=1", resetWindow: false };
  return { path: "/auth/confirmed", resetWindow: false };
}

/** The failure page for an email link: a reset link sends people back to "Forgot password?". */
export function linkFailurePath(type: string | null | undefined): string {
  return type === "recovery" ? "/auth/reset?expired=1" : "/auth/confirmed?error=DZ-E1076";
}

/** What /auth/reset shows. */
export type ResetView =
  | { view: "form"; tokenHash: string }
  | { view: "exchange"; code: string }
  | { view: "expired"; code: "DZ-E1075" | "DZ-E1083" };

const TOKEN = /^[\w-]{6,512}$/;

/**
 * /auth/reset: the link's token is used exactly once, when the form is sent. Once it has made a
 * recovery session ([recoverySession]: the 15-minute reset window and a signed-in user), every
 * later load of the page (a reload, the back button, the same email link opened again, a link
 * Supabase answered with an error because its token is used) shows the form without the token, so
 * it is never sent again and the page never says "expired" while that session lasts.
 * Without the session:
 *  - ?token_hash=&type=recovery (Dzirent's template): the form, carrying the token for the submit;
 *  - ?code= (Supabase's default template, or a link sent before Dzirent's): exchanged once by
 *    /auth/callback, which opens the window and comes back here without the code;
 *  - anything else: expired (DZ-E1075 for a link that failed, DZ-E1083 without one).
 */
export function resetView(
  q: { token_hash?: string | null; type?: string | null; code?: string | null; error?: string | null; expired?: string | null },
  recoverySession: boolean,
): ResetView {
  if (recoverySession) return { view: "form", tokenHash: "" };
  const failed = Boolean(q.error) || q.expired === "1";
  const token = q.token_hash ?? "";
  if (!failed && TOKEN.test(token) && (q.type || "recovery") === "recovery") return { view: "form", tokenHash: token };
  if (!failed && q.code && TOKEN.test(q.code)) return { view: "exchange", code: q.code };
  return { view: "expired", code: failed || token || q.code ? "DZ-E1075" : "DZ-E1083" };
}

/**
 * A profile whose profile_completed_at is empty (null) needs "Finish your profile" (Google's first
 * sign-in). Only an explicit null counts: a profile row without the field at all (a database
 * before the E1 migration) is never sent to the step.
 */
export function needsProfile(profile: { profile_completed_at?: string | null } | null | undefined): boolean {
  return Boolean(profile) && profile?.profile_completed_at === null;
}

/** "Finish your profile": the 18+ tick and the terms are required, the name 1-80 characters. */
export function finishProfileProblem(f: { name: string; adult: boolean; legal: boolean }): ShownError | null {
  const name = f.name.trim();
  if (!name || name.length > 80) return shown("DZ-E1080");
  if (!f.adult) return shown("DZ-E1079");
  if (!f.legal) return shown("DZ-E1081");
  return null;
}

/** The name to suggest from Google's profile (full_name, else name), at most 80 characters. */
export function suggestedName(meta: Record<string, unknown> | null | undefined): string {
  const raw = [meta?.display_name, meta?.full_name, meta?.name].find((v) => typeof v === "string" && v.trim());
  return typeof raw === "string" ? raw.trim().slice(0, 80) : "";
}

/** Seconds left before "Send the link again" works again (0: now). */
export function resendWait(lastSentAtMs: number | null | undefined, nowMs: number): number {
  if (!lastSentAtMs || !Number.isFinite(lastSentAtMs)) return 0;
  const left = Math.ceil((lastSentAtMs + RESEND_COOLDOWN_SECONDS * 1000 - nowMs) / 1000);
  return Math.max(0, Math.min(RESEND_COOLDOWN_SECONDS, left));
}

/** The person's network address on Vercel (its edge sets x-forwarded-for); none elsewhere. */
export function clientAddress(get: (name: string) => string | null, onVercel: boolean): string {
  if (!onVercel) return "";
  const first = (get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "";
  return first.slice(0, 100) || (get("x-real-ip") ?? "").trim().slice(0, 100);
}

/** True when the account can sign in with a password (it has the email provider). */
export function hasPasswordSignIn(user: { app_metadata?: { providers?: unknown } | null; identities?: { provider?: string }[] | null } | null | undefined): boolean {
  const providers = Array.isArray(user?.app_metadata?.providers) ? (user?.app_metadata?.providers as unknown[]) : [];
  return providers.includes("email") || Boolean(user?.identities?.some((i) => i.provider === "email"));
}

/**
 * The address a link in an email should come back to: the page's own site. The email templates
 * only ever use the preview site (exactly https://dzirent.vercel.app) or the Site URL
 * (https://dzirent.com) as the link's host, whatever this says.
 */
export function returnUrl(origin: string | null | undefined, path: string): string {
  let base = "https://dzirent.com";
  try {
    const u = new URL(origin ?? "");
    if (u.protocol === "https:" || u.hostname === "localhost" || u.hostname === "127.0.0.1") base = u.origin;
  } catch {
    // keep dzirent.com
  }
  return base + path;
}
