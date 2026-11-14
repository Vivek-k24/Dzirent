// C4: helpers shared by the payment integration scripts (local backend only). Nothing here prints
// keys, tokens or emails.
import { createHmac } from "node:crypto";
import { STUBS_URL, SUPABASE_KEY, SUPABASE_URL } from "./config.mjs";

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

async function http(path, { method = "GET", token, body, headers = {} } = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined && typeof body !== "string" ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: res.ok, status: res.status, data };
}

export async function signIn(email, password) {
  const res = await http("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } });
  if (!res.ok) throw new Error(`Sign in failed: ${res.status}`);
  return { token: res.data.access_token, id: res.data.user.id };
}

/** A database function through the API; { ok, status, data }. */
export const call = (token, name, args = {}) => http(`/rest/v1/rpc/${name}`, { method: "POST", token, body: args });

/** The same, throwing on a refusal. */
export async function rpc(token, name, args = {}) {
  const res = await call(token, name, args);
  if (!res.ok) throw new Error(`${name} failed: ${res.status} ${res.data?.message ?? ""}`);
  return res.data;
}

export const rest = (token, path) => http(`/rest/v1/${path}`, { token });

/** An Edge Function: { ok, status, data }. */
export const fn = (name, { token, body = {}, headers = {} } = {}) =>
  http(`/functions/v1/${name}`, { method: "POST", token, body, headers });

/** A raw POST to an Edge Function (for the webhook: exact bytes and headers). */
export const fnRaw = (name, rawBody, headers = {}) =>
  http(`/functions/v1/${name}`, { method: "POST", body: rawBody, headers: { "Content-Type": "application/json", ...headers } });

/** A Stripe-style event, signed like Stripe does: t=<time>,v1=<HMAC-SHA256("<t>.<body>")>. */
export function signedEvent(secret, id, type, object, { time = Math.floor(Date.now() / 1000), account } = {}) {
  const body = JSON.stringify({ id, object: "event", type, ...(account ? { account } : {}), created: time, data: { object } });
  const v1 = createHmac("sha256", secret).update(`${time}.${body}`).digest("hex");
  return { body, header: `t=${time},v1=${v1}` };
}

/** What the stub recorded of the Stripe calls (stripe-mock behind it). */
export async function stripeLog() {
  const log = await (await fetch(`${STUBS_URL}/log`)).json();
  return log.stripe ?? [];
}

export async function pushes(conversationId) {
  const log = await (await fetch(`${STUBS_URL}/log`)).json();
  return (log.push ?? []).filter((p) => p.conversation_id === conversationId).map((p) => p.kind);
}

export async function waitFor(check, seconds = 30) {
  for (let i = 0; i < seconds * 2; i++) {
    if (await check()) return true;
    await sleep(500);
  }
  return false;
}

// TOTP (RFC 6238, SHA-1, 6 digits, 30 s), for the admin's two-step sign-in.
function base32(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const c of secret.replace(/=+$/, "").toUpperCase()) {
    value = (value << 5) | alphabet.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}
function totp(secret) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", base32(secret)).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1000000).padStart(6, "0");
}

/**
 * The local admin at aal2: enrolls a TOTP factor and verifies it. Returns { token, close() }; close
 * deletes the factor again.
 */
export async function adminSession(email, password) {
  const plain = await signIn(email, password);
  const me = await http("/auth/v1/user", { token: plain.token });
  for (const f of me.data?.factors ?? []) {
    if (f.status !== "verified") await http(`/auth/v1/factors/${f.id}`, { method: "DELETE", token: plain.token });
  }
  if ((me.data?.factors ?? []).some((f) => f.status === "verified")) throw new Error("the local admin already has a verified factor");
  const enrolled = await http("/auth/v1/factors", { method: "POST", token: plain.token, body: { factor_type: "totp", friendly_name: `c4-test-${Date.now()}` } });
  if (!enrolled.ok) throw new Error(`enroll: ${enrolled.status}`);
  const challenge = await http(`/auth/v1/factors/${enrolled.data.id}/challenge`, { method: "POST", token: plain.token, body: {} });
  const verified = await http(`/auth/v1/factors/${enrolled.data.id}/verify`, {
    method: "POST", token: plain.token, body: { challenge_id: challenge.data.id, code: totp(enrolled.data.totp.secret) },
  });
  if (!verified.ok) throw new Error(`verify: ${verified.status}`);
  const token = verified.data.access_token;
  return {
    id: plain.id,
    token,
    close: () => http(`/auth/v1/factors/${enrolled.data.id}`, { method: "DELETE", token }),
  };
}

/** Uploads one condition photo; returns { ok, status, path }. */
export async function uploadConditionPhoto(token, rentalId, stage, bytes) {
  const name = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`.padEnd(16, "x");
  const path = `${rentalId}/${stage}/${name}.jpg`;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/rental-photos/${path}`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, "Content-Type": "image/jpeg" },
    body: bytes,
  });
  return { ok: res.ok, status: res.status, path, body: res.ok ? null : (await res.text()).slice(0, 200) };
}
