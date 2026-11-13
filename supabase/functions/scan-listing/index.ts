// Runs one listing's photo check (Step 8A). Called only by the database (public.request_scan,
// through pg_net), which proves it is the caller with the shared secret in x-scan-listing-secret.
// It sends the listing's public photo URLs to the vision service on Cloud Run, signed in as the
// vision-invoker Google service account, and saves the result through the server-only vision_*
// database functions. Any failure marks the scan failed and the listing goes to review.
// Apps never call this function.

import { readInput, UUID } from "../_shared/input.ts";
import { errorBody, errorStatus } from "../_shared/errors.ts";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
// The vision service's own limit (services/vision/app/config.py MAX_PHOTOS).
const MAX_PHOTOS = 8;
// Cloud Run stops a request at 120 s. This leaves time to save the result within the function's
// 150 s wall clock.
const VISION_TIMEOUT_MS = 115_000;

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

interface ScanPhoto {
  photo_id: string;
  storage_path: string;
  slot: string | null;
}

interface StartedScan {
  scan_id: string;
  listing_id: string;
  photos: ScanPhoto[];
}

interface Env {
  supabaseUrl: string;
  key: string;
  visionUrl: string;
  account: ServiceAccount;
}

/** A failure with a short code for the scan's error column (never shown to lenders). */
class ScanError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** C1: an error as { code, message } with the catalog status (contracts/error-codes.json). */
function refuse(code: string, message?: string): Response {
  return json(errorStatus(code), errorBody(code, message));
}

/** Compares in constant time, so the secret can't be guessed one byte at a time. */
function sameSecret(given: string, expected: string): boolean {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}

function decodeBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

function base64url(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The project's secret key if it has the new API keys, else the legacy service_role key. */
function serviceKey(): string | null {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (typeof keys?.default === "string" && keys.default) return keys.default;
  } catch {
    // Not set or not JSON: use the legacy key.
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? null;
}

/** New secret keys go only in apikey; the legacy service_role key is also the bearer JWT. */
function restHeaders(key: string): Record<string, string> {
  return key.startsWith("sb_secret_") ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };
}

/** The vision-invoker key (service account JSON), stored base64-encoded as a function secret. */
function loadInvokerKey(): ServiceAccount | null {
  const encoded = Deno.env.get("VISION_INVOKER_KEY_BASE64");
  if (!encoded) return null;
  try {
    const account = JSON.parse(new TextDecoder().decode(decodeBase64(encoded.trim())));
    if (typeof account?.client_email !== "string" || typeof account?.private_key !== "string") return null;
    return account;
  } catch {
    return null;
  }
}

// Google ID tokens last an hour; a warm function instance reuses one.
let cachedIdToken: { value: string; audience: string; expiresAt: number } | null = null;

/** A Google ID token for [audience] (the Cloud Run URL), signed in as the service account. */
async function identityToken(account: ServiceAccount, audience: string): Promise<string> {
  if (cachedIdToken && cachedIdToken.audience === audience && cachedIdToken.expiresAt > Date.now() + 300_000) {
    return cachedIdToken.value;
  }
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${
    base64url(JSON.stringify({
      iss: account.client_email,
      sub: account.client_email,
      aud: GOOGLE_TOKEN_URL,
      target_audience: audience,
      iat: now,
      exp: now + 3600,
    }))
  }`;
  const pem = account.private_key
    .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const key = await crypto.subtle.importKey(
    "pkcs8",
    decodeBase64(pem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)),
  );
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${base64url(signature)}`,
    }),
  });
  if (!response.ok) throw new ScanError(`google_token_http_${response.status}`);
  const idToken = (await response.json())?.id_token;
  if (typeof idToken !== "string") throw new ScanError("google_token_missing");
  cachedIdToken = { value: idToken, audience, expiresAt: Date.now() + 3600_000 };
  return idToken;
}

function rpc(env: { supabaseUrl: string; key: string }, name: string, args: Record<string, unknown>) {
  return fetch(`${env.supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { ...restHeaders(env.key), "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
}

/** sha256 of the sorted "storage_path:slot" lines: the same as app_private.photo_set_hash. */
async function photoSetHash(photos: ScanPhoto[]): Promise<string> {
  const lines = photos.map((p) => `${p.storage_path}:${p.slot ?? ""}`).sort();
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(lines.join("\n"))));
  return [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function publicUrl(supabaseUrl: string, storagePath: string): string {
  const path = storagePath.split("/").map(encodeURIComponent).join("/");
  return `${supabaseUrl}/storage/v1/object/public/listing-photos/${path}`;
}

async function runScan(env: Env, scan: StartedScan): Promise<void> {
  const started = Date.now();
  try {
    if (scan.photos.length === 0) throw new ScanError("no_photos");
    if (scan.photos.length > MAX_PHOTOS) throw new ScanError("too_many_photos");
    const token = await identityToken(env.account, env.visionUrl);
    const response = await fetch(`${env.visionUrl}/scan`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        listing_id: scan.listing_id,
        photos: scan.photos.map((p) => ({
          photo_id: p.photo_id,
          url: publicUrl(env.supabaseUrl, p.storage_path),
          slot: p.slot,
        })),
      }),
      signal: AbortSignal.timeout(VISION_TIMEOUT_MS),
    });
    if (!response.ok) throw new ScanError(`vision_http_${response.status}`);
    const result = await response.json().catch(() => null);
    if (!result || !["allowed", "rejected", "review"].includes(result.verdict) || !Array.isArray(result.photos)) {
      throw new ScanError("vision_bad_result");
    }
    const saved = await rpc(env, "vision_finish_scan", {
      p_scan_id: scan.scan_id,
      p_photo_set_hash: await photoSetHash(scan.photos),
      p_result: result,
    });
    if (!saved.ok) throw new ScanError(`save_http_${saved.status}`);
    const outcome = await saved.json().catch(() => null);
    // Counts and outcome only: never URLs, photos or listing text in the logs.
    console.log(JSON.stringify({
      scan: "done",
      photos: scan.photos.length,
      verdict: outcome?.verdict,
      duplicate: outcome?.duplicate,
      ms: Date.now() - started,
    }));
  } catch (error) {
    const code = error instanceof ScanError
      ? error.code
      : (error as Error)?.name === "TimeoutError"
      ? "vision_timeout"
      : "unexpected";
    console.log(JSON.stringify({ scan: "failed", error: code, ms: Date.now() - started }));
    await rpc(env, "vision_fail_scan", { p_scan_id: scan.scan_id, p_error: code }).catch(() => null);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return refuse("DZ-E9005");
  }

  const secret = Deno.env.get("SCAN_LISTING_SECRET");
  if (!secret || !sameSecret(req.headers.get("x-scan-listing-secret") ?? "", secret)) {
    return refuse("DZ-E9004");
  }

  const input = await readInput(req, { allowed: ["scan_id"], required: ["scan_id"], maxBytes: 1024 });
  const scanId = input.ok ? input.body.scan_id : null;
  if (typeof scanId !== "string" || !UUID.test(scanId)) {
    return refuse("DZ-E9016");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const key = serviceKey();
  if (!supabaseUrl || !key) {
    return refuse("DZ-E9003");
  }

  const startResponse = await rpc({ supabaseUrl, key }, "vision_start_scan", { p_scan_id: scanId });
  if (!startResponse.ok) {
    return refuse("DZ-E9003");
  }
  const scan: StartedScan | null = await startResponse.json().catch(() => null);
  if (!scan) {
    return refuse("DZ-E2024");
  }

  const visionUrl = Deno.env.get("VISION_URL")?.replace(/\/+$/, "");
  const account = loadInvokerKey();
  if (!visionUrl || !account) {
    await rpc({ supabaseUrl, key }, "vision_fail_scan", { p_scan_id: scanId, p_error: "not_configured" });
    return refuse("DZ-E9003");
  }

  // Answer the database at once; the scan itself can take a cold start plus a minute.
  const work = runScan({ supabaseUrl, key, visionUrl, account }, scan);
  if (typeof EdgeRuntime !== "undefined") {
    EdgeRuntime.waitUntil(work);
    return json(202, { scan_id: scanId, status: "running" });
  }
  await work;
  return json(200, { scan_id: scanId, status: "finished" });
});
