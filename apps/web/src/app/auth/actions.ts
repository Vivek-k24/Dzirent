"use server";
// E1: the website's sign-in actions: "Forgot password?", the reset page, "Send the link again"
// and "Finish your profile". The rules are in lib/auth-flows.ts (unit tested); these call Supabase.
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { serverClient, currentUser } from "@/lib/supabase/server";
import { context } from "@/lib/data";
import { safeNext } from "@/lib/types";
import { fromServer, shown, type ShownError } from "@/lib/errors";
import {
  NEUTRAL_RESEND,
  NEUTRAL_RESET,
  RESET_WINDOW_SECONDS,
  authErrorCode,
  clientAddress,
  emailProblem,
  emailRequestOutcome,
  finishProfileProblem,
  newPasswordProblem,
  resendWait,
  returnUrl,
  type LimitAnswer,
} from "@/lib/auth-flows";

export type FormState = { error?: ShownError; notice?: string; expired?: boolean; done?: boolean } | null;

const field = (f: FormData, n: string) => String(f.get(n) ?? "").trim();
const secure = async () => ((await headers()).get("origin") ?? "").startsWith("https://");

/** The website's own limit on these emails (per network address and per address). */
async function emailLimit(kind: "recovery" | "signup_resend", email: string): Promise<LimitAnswer | null> {
  const h = await headers();
  const ip = clientAddress((n) => h.get(n), Boolean(process.env.VERCEL));
  const { data, error } = await (await serverClient()).rpc("auth_email_allowed", { p_kind: kind, p_ip: ip, p_email: email });
  if (error) return null; // The check itself failing never blocks a reset; Auth's own limits still apply.
  return data as LimitAnswer;
}

/** "Forgot password?": always the neutral answer unless the problem can't depend on the address. */
export async function requestPasswordReset(_: FormState, form: FormData): Promise<FormState> {
  const email = field(form, "email");
  const bad = emailProblem(email);
  if (bad) return { error: bad };
  const limit = await emailLimit("recovery", email);
  let failure = null;
  if (limit !== "ip_limited" && limit !== "address_limited") {
    const origin = (await headers()).get("origin");
    const { error } = await (await serverClient()).auth.resetPasswordForEmail(email, { redirectTo: returnUrl(origin, "/auth/reset") });
    failure = error;
    if (error) console.warn("password reset email not sent:", error.code ?? error.status);
  }
  const outcome = emailRequestOutcome(limit, failure);
  return outcome.sent ? { notice: NEUTRAL_RESET, done: true } : { error: outcome.error };
}

/**
 * The reset page. The email link's token is used only when the person submits (so a mail
 * scanner opening the link doesn't use it up). A password the rules refuse after the token was
 * used keeps the session the token made for RESET_WINDOW_SECONDS, so they can try again. After
 * the new password: every other session is signed out, and they land on the account page.
 */
export async function resetPassword(_: FormState, form: FormData): Promise<FormState> {
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("password_confirm") ?? "");
  const tokenHash = field(form, "token_hash");
  const problem = newPasswordProblem(password, confirm);
  if (problem) return { error: problem };
  const client = await serverClient();
  const jar = await cookies();
  // The window opened by a link used earlier in this same reset (a refused password, tried again).
  let windowOpen = Boolean(jar.get("dzirent-reset")) && Boolean((await client.auth.getUser()).data.user);
  if (tokenHash) {
    const { data, error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
    if (!error && data.user) {
      windowOpen = true;
      jar.set("dzirent-reset", "1", { path: "/", httpOnly: true, sameSite: "lax", secure: await secure(), maxAge: RESET_WINDOW_SECONDS });
    } else if (!windowOpen) {
      return { expired: true, error: shown("DZ-E1075") };
    }
  }
  if (!windowOpen) return { expired: true, error: shown("DZ-E1083") };
  const { error } = await client.auth.updateUser({ password });
  if (error) {
    const code = authErrorCode(error);
    return { error: shown(code, code === "DZ-E9002" || code === "DZ-E9999" ? undefined : "password") };
  }
  // The privacy policy promises it: a new password signs out every other device and browser.
  await client.auth.signOut({ scope: "others" });
  jar.set("dzirent-reset", "", { path: "/", maxAge: 0 });
  revalidatePath("/", "layout");
  redirect("/app/settings?notice=password-changed");
}

/** "Check your email" > "Send the link again" (after a password sign-up). */
export async function resendConfirmation(_: FormState, form: FormData): Promise<FormState> {
  const jar = await cookies();
  const email = field(form, "email") || jar.get("dzirent-pending-email")?.value || "";
  const bad = emailProblem(email);
  if (bad) return { error: bad };
  const wait = resendWait(Number(jar.get("dzirent-resent-at")?.value), Date.now());
  if (wait > 0) return { error: { ...shown("DZ-E1077"), message: `Wait ${wait} seconds before asking for another email.` } };
  const limit = await emailLimit("signup_resend", email);
  let failure = null;
  if (limit !== "ip_limited" && limit !== "address_limited") {
    const origin = (await headers()).get("origin");
    const { error } = await (await serverClient()).auth.resend({ type: "signup", email, options: { emailRedirectTo: returnUrl(origin, "/auth/callback") } });
    failure = error;
  }
  const outcome = emailRequestOutcome(limit, failure);
  if (!outcome.sent) return { error: outcome.error };
  jar.set("dzirent-resent-at", String(Date.now()), { path: "/", httpOnly: true, sameSite: "lax", secure: await secure(), maxAge: 3600 });
  return { notice: NEUTRAL_RESEND, done: true };
}

/**
 * "Finish your profile" (a Google sign-up's first visit): the 18+ tick, the name and the terms.
 * The rough location is the one the website already uses (Update location); the database
 * (complete_profile) checks everything again and is what lets the account list, rent and message.
 */
export async function finishProfile(_: FormState, form: FormData): Promise<FormState> {
  const user = await currentUser();
  if (!user) redirect("/auth?mode=signin");
  const name = field(form, "name");
  const problem = finishProfileProblem({ name, adult: form.get("adult") === "on", legal: form.get("legal") === "on" });
  if (problem) return { error: problem };
  const client = await serverClient();
  const where = await context();
  const { error } = await client.rpc("complete_profile", {
    p_display_name: name,
    p_adult: true,
    p_city: where.city,
    p_lat: where.lat,
    p_lng: where.lng,
  });
  if (error) return { error: fromServer(error.message, error.hint) ?? shown("DZ-E9999") };
  await client.rpc("accept_legal", { p_platform: "web" });
  // The age gate (P2C): the 18+ tick is a self-declared adult check, as at sign-up.
  await client.rpc("record_age_check", { p_source: "self_declared", p_result: "adult", p_platform: "web" });
  revalidatePath("/", "layout");
  redirect(safeNext(field(form, "next")));
}
