// C4: what every payment Edge Function shares: responses, the "not available" answer, the caller
// check, server calls to the database, and the shared-secret check for outbox calls.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import { codeOf, errorBody, errorStatus } from "./errors.ts";
import { ERROR_CODES } from "./error-codes.ts";
import { stripeConfig, type StripeConfig } from "./stripe.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

/** An error as { code, message } with the catalog status (contracts/error-codes.json). */
export function refuse(code: string, message?: string): Response {
  return json(errorStatus(code), errorBody(code, message));
}

/** A database refusal: its code, and the database's sentence when the catalog says it carries details. */
export function dbRefusal(error: { message?: string } | null | undefined): Response {
  const code = codeOf(error?.message);
  if (!code) return refuse("DZ-E9999");
  const sentence = (error?.message ?? "").replace(/^DZ-[EW]\d{4}:\s*/, "");
  return refuse(code, ERROR_CODES[code]?.serverDetail ? sentence : undefined);
}

export const notAvailable = () => refuse("DZ-E4030");

/** The project's publishable key (new API keys), else the legacy anon key. */
function publishableKey(): string | null {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
    if (typeof keys?.default === "string" && keys.default) return keys.default;
  } catch {
    // Not set or not JSON: the legacy key.
  }
  return Deno.env.get("SUPABASE_ANON_KEY") ?? null;
}

export type Server = { url: string; key: string; db: SupabaseClient };

/** The database with the server key, or null when the function isn't configured. */
export function server(): Server | null {
  const url = Deno.env.get("SUPABASE_URL");
  const serverKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const key = publishableKey();
  if (!url || !serverKey || !key) return null;
  return { url, key, db: createClient(url, serverKey, { auth: { persistSession: false, autoRefreshToken: false } }) };
}

export function bearer(req: Request): string | null {
  return /^Bearer\s+(.+)$/i.exec(req.headers.get("Authorization") ?? "")?.[1]?.trim() || null;
}

/** The signed-in caller's id from their token (verified by Supabase Auth), or null. */
export async function callerId(srv: Server, token: string | null): Promise<string | null> {
  if (!token) return null;
  const { data, error } = await srv.db.auth.getUser(token);
  return error ? null : data?.user?.id ?? null;
}

/** A database function as the signed-in caller (auth.uid() is theirs), for the user-facing steps. */
export async function rpcAsCaller(srv: Server, token: string, name: string, args: Record<string, unknown>) {
  const res = await fetch(`${srv.url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: srv.key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { ok: res.ok, status: res.status, body };
}

/**
 * Payments run only with all three Stripe keys set and payments_enabled on. Returns the Stripe
 * settings, or null (then answer notAvailable()).
 */
export async function paymentsReady(srv: Server): Promise<StripeConfig | null> {
  const cfg = stripeConfig();
  if (!cfg) return null;
  const { data, error } = await srv.db.rpc("payments_available");
  return !error && data === true ? cfg : null;
}

/** Outbox calls carry x-payments-secret = PAYMENTS_JOB_SECRET (Vault payments_job_secret). */
export function fromOutbox(req: Request): boolean {
  const expected = Deno.env.get("PAYMENTS_JOB_SECRET") ?? "";
  const given = req.headers.get("x-payments-secret") ?? "";
  if (!expected || expected.length !== given.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

/** Allowed return addresses for Stripe-hosted pages (onboarding): Dzirent's own site only. */
export function safeReturnUrl(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  try {
    const u = new URL(value);
    const allowed = ["dzirent.com", "www.dzirent.com", "dzirent.vercel.app"];
    return u.protocol === "https:" && allowed.includes(u.hostname) && value.length <= 300 ? value : fallback;
  } catch {
    return fallback;
  }
}
