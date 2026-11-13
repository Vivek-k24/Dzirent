// Delivers chat notifications through Firebase Cloud Messaging (HTTP v1 API).
// Called only by the database (app_private.queue_push, through the async_jobs outbox and pg_net), which has already
// checked blocks, the recipient's settings and the wording. The database proves it is the
// caller with the shared secret in x-send-push-secret. Apps never call this function.

import { readInput, UUID } from "../_shared/input.ts";
import { errorBody, errorStatus } from "../_shared/errors.ts";

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const KINDS = new Set(["message", "new_chat", "dates"]);
// A chat notification that couldn't be delivered for a day is stale; the inbox has it.
const TTL = "86400s";

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

interface PushRequest {
  kind: string;
  conversation_id: string;
  recipient_id: string;
  title: string;
  body: string | null;
}

type SendResult =
  | { ok: true }
  | { ok: false; code: string; deadToken: boolean; authExpired: boolean };

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

/** The Firebase server key (service account JSON), stored base64-encoded as a function secret. */
function loadServiceAccount(): ServiceAccount | null {
  const encoded = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_BASE64");
  if (!encoded) return null;
  try {
    const account = JSON.parse(new TextDecoder().decode(decodeBase64(encoded.trim())));
    if (
      typeof account?.project_id !== "string" ||
      typeof account?.client_email !== "string" ||
      typeof account?.private_key !== "string"
    ) {
      return null;
    }
    return account;
  } catch {
    return null;
  }
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

function parseRequest(value: unknown): PushRequest | null {
  const v = (value ?? {}) as Record<string, unknown>;
  const { kind, conversation_id, recipient_id, title, body } = v;
  if (typeof kind !== "string" || !KINDS.has(kind)) return null;
  if (typeof conversation_id !== "string" || !UUID.test(conversation_id)) return null;
  if (typeof recipient_id !== "string" || !UUID.test(recipient_id)) return null;
  if (typeof title !== "string" || !title.trim() || title.length > 200) return null;
  if (body != null && (typeof body !== "string" || body.length > 1000)) return null;
  return { kind, conversation_id, recipient_id, title, body: body ?? null };
}

// Google access tokens last an hour; a warm function instance reuses one.
let cachedAccessToken: { value: string; expiresAt: number } | null = null;

async function accessToken(account: ServiceAccount): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.value;
  }
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${
    base64url(JSON.stringify({
      iss: account.client_email,
      scope: FCM_SCOPE,
      aud: GOOGLE_TOKEN_URL,
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
  if (!response.ok) throw new Error(`Google token request failed: ${response.status}`);
  const data = await response.json();
  cachedAccessToken = {
    value: data.access_token,
    expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
  };
  return cachedAccessToken.value;
}

/** Sends one high-priority data message; the app builds the notification itself. */
async function sendOne(
  account: ServiceAccount,
  bearer: string,
  deviceToken: string,
  data: Record<string, string>,
): Promise<SendResult> {
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: { token: deviceToken, data, android: { priority: "high", ttl: TTL } },
      }),
    },
  );
  if (response.ok) return { ok: true };

  const error = (await response.json().catch(() => null))?.error ?? {};
  const details: Array<Record<string, unknown>> = Array.isArray(error.details) ? error.details : [];
  const fcmCode = details.find((d) => String(d["@type"] ?? "").endsWith("FcmError"))?.errorCode;
  const tokenField = details.some((d) =>
    Array.isArray(d.fieldViolations) &&
    d.fieldViolations.some((f: Record<string, unknown>) => f?.field === "message.token")
  );
  // Firebase says the token will never work again: unregistered (app removed, token
  // deleted), from another Firebase project, or not a token at all.
  const deadToken = fcmCode === "UNREGISTERED" || fcmCode === "SENDER_ID_MISMATCH" ||
    response.status === 404 ||
    (response.status === 400 && (tokenField || /registration token/i.test(String(error.message ?? ""))));
  return {
    ok: false,
    code: String(fcmCode ?? error.status ?? `HTTP_${response.status}`),
    deadToken,
    authExpired: response.status === 401,
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return refuse("DZ-E9005");
  }

  const secret = Deno.env.get("SEND_PUSH_SECRET");
  if (!secret || !sameSecret(req.headers.get("x-send-push-secret") ?? "", secret)) {
    return refuse("DZ-E9004");
  }

  const account = loadServiceAccount();
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const key = serviceKey();
  if (!account || !supabaseUrl || !key) {
    return refuse("DZ-E9003");
  }

  const input = await readInput(req, {
    allowed: ["kind", "conversation_id", "recipient_id", "title", "body"],
    required: ["kind", "conversation_id", "recipient_id", "title"],
    maxBytes: 8192,
  });
  const push = input.ok ? parseRequest(input.body) : null;
  if (!push) {
    return refuse("DZ-E9016");
  }

  // Android phones only: iOS delivery comes with the iOS app (Step 5).
  const tokensResponse = await fetch(
    `${supabaseUrl}/rest/v1/device_tokens?select=token&platform=eq.android&user_id=eq.${push.recipient_id}`,
    { headers: restHeaders(key) },
  );
  if (!tokensResponse.ok) {
    return refuse("DZ-E9003");
  }
  const rows: Array<{ token: string }> = await tokensResponse.json();
  if (rows.length === 0) {
    return json(200, { sent: 0, failed: 0, removed: 0, errors: [] });
  }

  // Everything in a data message is a string. The tag makes quick messages in one chat
  // replace each other's notification instead of stacking.
  const data: Record<string, string> = {
    kind: push.kind,
    conversation_id: push.conversation_id,
    recipient_id: push.recipient_id,
    title: push.title,
    tag: `chat_${push.conversation_id}`,
  };
  if (push.body) data.body = push.body;

  let bearer: string;
  try {
    bearer = await accessToken(account);
  } catch {
    return refuse("DZ-E9003");
  }

  const results = await Promise.all(rows.map((row) => sendOne(account, bearer, row.token, data)));
  if (results.some((r) => !r.ok && r.authExpired)) {
    cachedAccessToken = null;
    const fresh = await accessToken(account).catch(() => null);
    if (fresh) {
      await Promise.all(results.map(async (r, i) => {
        if (!r.ok && r.authExpired) results[i] = await sendOne(account, fresh, rows[i].token, data);
      }));
    }
  }

  let removed = 0;
  for (let i = 0; i < rows.length; i++) {
    const result = results[i];
    if (result.ok || !result.deadToken) continue;
    const deleted = await fetch(
      `${supabaseUrl}/rest/v1/device_tokens?token=eq.${encodeURIComponent(rows[i].token)}`,
      { method: "DELETE", headers: { ...restHeaders(key), Prefer: "return=minimal" } },
    );
    if (deleted.ok) removed++;
  }

  const sent = results.filter((r) => r.ok).length;
  const errors = [...new Set(results.flatMap((r) => (r.ok ? [] : [r.code])))];
  // Counts only: never tokens or message text in the logs.
  console.log(JSON.stringify({ kind: push.kind, sent, failed: rows.length - sent, removed, errors }));
  // C1: nothing delivered and a phone still worth trying (not a dead token): answer an error so
  // the database's outbox (app_private.async_jobs) tries again later.
  if (sent === 0 && results.some((r) => !r.ok && !r.deadToken)) {
    return json(errorStatus("DZ-E9003"), { ...errorBody("DZ-E9003"), sent, failed: rows.length - sent, removed, errors });
  }
  return json(200, { sent, failed: rows.length - sent, removed, errors });
});
