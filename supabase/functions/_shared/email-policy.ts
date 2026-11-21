// E1: which emails always go, the preference check, and the one-click unsubscribe link.
// No imports (WebCrypto only): send-email, email-unsubscribe and the Node unit tests run it as is.
//
// Essential emails are always sent: rental reminders (pickup and return, overdue included) and the
// account email (account deleted). Every other email follows "Email me about rentals" and stops
// while the address is flagged (a hard bounce or a spam complaint from Resend's webhook), and it
// carries List-Unsubscribe (RFC 2369) with one-click (RFC 8058) to the email-unsubscribe function.

export const ESSENTIAL_TEMPLATES: readonly string[] = ["pickup_reminder", "return_reminder", "account_deleted"];

export function isEssential(template: string): boolean {
  return ESSENTIAL_TEMPLATES.includes(template);
}

export type EmailPrefs = { email_rentals?: boolean; email_status?: string };
export type EmailDecision = { send: true } | { send: false; reason: "turned_off" | "suppressed" };

/** Send or skip (with the reason recorded on the email). Missing facts count as "on" and "ok". */
export function emailDecision(template: string, prefs: EmailPrefs | null | undefined): EmailDecision {
  if (isEssential(template)) return { send: true };
  const status = prefs?.email_status ?? "ok";
  if (status !== "ok") return { send: false, reason: "suppressed" };
  if (prefs?.email_rentals === false) return { send: false, reason: "turned_off" };
  return { send: true };
}

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** HMAC-SHA256 of the account id with the outbox secret, under its own label (never a login). */
export async function unsubscribeToken(secret: string, userId: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode("dzirent-list-unsubscribe:v1:" + userId.toLowerCase()));
  return base64url(new Uint8Array(mac));
}

/** Constant-time comparison of two strings. */
export function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function unsubscribeTokenValid(secret: string, userId: string, token: string): Promise<boolean> {
  if (!secret || !userId || !token) return false;
  return sameText(await unsubscribeToken(secret, userId), token);
}

/** The headers of a non-essential email: the one-click link to email-unsubscribe. */
export async function unsubscribeHeaders(functionsBase: string, secret: string, userId: string): Promise<Record<string, string>> {
  const url = `${functionsBase.replace(/\/$/, "")}/functions/v1/email-unsubscribe?u=${encodeURIComponent(userId)}&t=${await unsubscribeToken(secret, userId)}`;
  return { "List-Unsubscribe": `<${url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
}
