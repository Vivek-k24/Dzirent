// C4: the Stripe API over fetch (form-encoded) and webhook signature checks on the raw body.
// The three keys come from the function's environment only and are never logged or returned
// (the publishable key is public by design and goes to the app that shows Stripe's payment sheet).
// While any of the three is blank, stripeConfig() is null and every payment function answers
// DZ-E4030 "Payments aren't available yet."

/** Pinned so Stripe's answers don't change shape under us; update with care. */
export const STRIPE_API_VERSION = "2024-06-20";
/** Stripe's own default tolerance for webhook timestamps. */
const SIGNATURE_TOLERANCE_SECONDS = 300;
const LIVE_API = "https://api.stripe.com";

export type StripeConfig = {
  secretKey: string;
  publishableKey: string;
  /** The endpoint's signing secret, plus the Connect endpoint's when it is set. */
  webhookSecrets: string[];
  apiBase: string;
};

/** The Stripe settings, or null while a key is blank. */
export function stripeConfig(): StripeConfig | null {
  const secretKey = (Deno.env.get("STRIPE_SECRET_KEY") ?? "").trim();
  const publishableKey = (Deno.env.get("STRIPE_PUBLISHABLE_KEY") ?? "").trim();
  const webhookSecret = (Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "").trim();
  if (!secretKey || !publishableKey || !webhookSecret) return null;
  const connectSecret = (Deno.env.get("STRIPE_CONNECT_WEBHOOK_SECRET") ?? "").trim();
  // STRIPE_API_BASE points tests at stripe-mock. A live key always goes to Stripe itself.
  const override = (Deno.env.get("STRIPE_API_BASE") ?? "").trim().replace(/\/$/, "");
  const apiBase = override && !secretKey.startsWith("sk_live_") && !secretKey.startsWith("rk_live_") ? override : LIVE_API;
  return { secretKey, publishableKey, webhookSecrets: connectSecret ? [webhookSecret, connectSecret] : [webhookSecret], apiBase };
}

/** Stripe's form encoding: nested objects as a[b]=c, arrays as a[]=c. */
export function formEncode(params: Record<string, unknown>, prefix = "", out: string[] = []): string[] {
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      for (const item of v) out.push(`${encodeURIComponent(key + "[]")}=${encodeURIComponent(String(item))}`);
    } else if (typeof v === "object") {
      formEncode(v as Record<string, unknown>, key, out);
    } else {
      out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }
  return out;
}

export type StripeError = { type?: string; code?: string; decline_code?: string; message?: string; payment_intent?: { id?: string; status?: string } };
// deno-lint-ignore no-explicit-any
export type StripeObject = Record<string, any>;
export type StripeResult =
  | { ok: true; status: number; body: StripeObject }
  | { ok: false; status: number; error: StripeError | null };

/**
 * One Stripe API call. Every POST that creates or changes something carries [idempotencyKey], so
 * a retry (ours or the outbox's) never makes a second object. Never throws.
 */
export async function stripeCall(
  cfg: StripeConfig,
  method: "GET" | "POST",
  path: string,
  params: Record<string, unknown> = {},
  idempotencyKey?: string,
): Promise<StripeResult> {
  const query = method === "GET" ? formEncode(params).join("&") : "";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${cfg.secretKey}`,
    "Stripe-Version": STRIPE_API_VERSION,
  };
  if (method === "POST") {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  }
  try {
    const res = await fetch(`${cfg.apiBase}${path}${query ? `?${query}` : ""}`, {
      method,
      headers,
      body: method === "POST" ? formEncode(params).join("&") : undefined,
      signal: AbortSignal.timeout(8000),
    });
    const text = await res.text();
    let body: StripeObject | null = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (res.ok && body) return { ok: true, status: res.status, body };
    return { ok: false, status: res.status, error: (body?.error as StripeError | undefined) ?? null };
  } catch {
    return { ok: false, status: 0, error: null };
  }
}

/** A short, safe description of a Stripe failure for the operation log (no keys, no card data). */
export function stripeErrorText(result: { status: number; error: StripeError | null }): string {
  const e = result.error;
  if (!e) return result.status === 0 ? "Stripe didn't answer" : `Stripe answered ${result.status}`;
  return [e.type, e.code, e.decline_code].filter(Boolean).join(" / ").slice(0, 120) || `Stripe answered ${result.status}`;
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Stripe's webhook signature (the Stripe-Signature header): t=<unix time>,v1=<hex HMAC-SHA256 of
 * "<t>.<raw body>" with the endpoint's signing secret>. Checked on the raw bytes, before parsing.
 */
export async function verifyStripeSignature(
  rawBody: Uint8Array,
  header: string | null,
  secrets: string[],
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!header || secrets.length === 0) return false;
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.trim().split("=", 2);
    if (k === "t" && /^\d+$/.test(v ?? "")) timestamp = Number(v);
    else if (k === "v1" && v) signatures.push(v.toLowerCase());
  }
  if (timestamp === null || signatures.length === 0) return false;
  if (Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const prefix = new TextEncoder().encode(`${timestamp}.`);
  const signed = new Uint8Array(prefix.length + rawBody.length);
  signed.set(prefix, 0);
  signed.set(rawBody, prefix.length);
  for (const secret of secrets) {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const expected = hex(await crypto.subtle.sign("HMAC", key, signed));
    if (signatures.some((s) => sameText(s, expected))) return true;
  }
  return false;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", bytes));
}

/** Dollars (the database's numeric) to Stripe's cents. */
export function cents(amount: unknown): number {
  return Math.round(Number(amount) * 100);
}
