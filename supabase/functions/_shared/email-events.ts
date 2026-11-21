// E1: Resend's webhook (Svix): the signature check and what an event becomes. Pure code, so the
// email-events function and the Node unit tests share it.
//
// Signature (https://docs.svix.com/receiving/verifying-payloads/how-manual): the signed content
// is "<svix-id>.<svix-timestamp>.<raw body>"; the key is the base64 part of the secret after
// "whsec_"; the header svix-signature holds space-separated "v1,<base64 HMAC-SHA256>" entries,
// any of which may match. The timestamp must be within 5 minutes of now (replays).
import { errorBody, errorStatus } from "./errors.ts";

export const TOLERANCE_SECONDS = 300;
const encoder = new TextEncoder();

function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The v1 signature of [body] (tests sign their own events with it). */
export async function svixSignature(secret: string, id: string, timestamp: string, body: string): Promise<string> {
  const keyBytes = fromBase64(secret.startsWith("whsec_") ? secret.slice(6) : secret);
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`${id}.${timestamp}.${body}`));
  return toBase64(new Uint8Array(mac));
}

export type SvixHeaders = { id: string | null; timestamp: string | null; signature: string | null };
export type SvixCheck = "ok" | "unsigned" | "bad_signature" | "stale";

export async function verifySvix(secret: string, h: SvixHeaders, body: string, nowSeconds: number): Promise<SvixCheck> {
  if (!h.id || !h.timestamp || !h.signature) return "unsigned";
  if (!/^\d{1,12}$/.test(h.timestamp)) return "bad_signature";
  let expected: string;
  try {
    expected = await svixSignature(secret, h.id, h.timestamp, body);
  } catch {
    return "bad_signature";
  }
  const match = h.signature.split(" ").some((entry) => {
    const comma = entry.indexOf(",");
    return comma > 0 && entry.slice(0, comma) === "v1" && sameText(entry.slice(comma + 1), expected);
  });
  if (!match) return "bad_signature";
  // Checked after the signature, so an unsigned caller learns nothing about the clock.
  if (Math.abs(nowSeconds - Number(h.timestamp)) > TOLERANCE_SECONDS) return "stale";
  return "ok";
}

/** The parts of an event Dzirent keeps: never the subject, the sender or the email's text. */
export type EmailEvent = {
  eventId: string;
  type: string;
  messageId: string | null;
  addresses: string[];
  bounceType: string | null;
};

export function readEvent(eventId: string, payload: unknown): EmailEvent | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as { type?: unknown; data?: Record<string, unknown> };
  if (typeof p.type !== "string" || !p.type) return null;
  const data = (p.data && typeof p.data === "object" ? p.data : {}) as Record<string, unknown>;
  const to = Array.isArray(data.to) ? data.to : typeof data.to === "string" ? [data.to] : [];
  const bounce = data.bounce && typeof data.bounce === "object" ? (data.bounce as Record<string, unknown>) : null;
  return {
    eventId,
    type: p.type.slice(0, 60),
    messageId: typeof data.email_id === "string" ? data.email_id.slice(0, 200) : null,
    addresses: to.filter((a): a is string => typeof a === "string" && a.includes("@")).slice(0, 50).map((a) => a.slice(0, 320)),
    bounceType: bounce && typeof bounce.type === "string" ? bounce.type.slice(0, 40) : null,
  };
}

/** Only these change anything; every other event is answered 200 and not stored. */
export const HANDLED_EVENTS: readonly string[] = ["email.bounced", "email.complained"];

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
export type EmailEventsDeps = {
  env: (name: string) => string | undefined;
  rpc: Rpc;
  nowSeconds?: () => number;
};

const MAX_BODY = 64 * 1024;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
const refuse = (code: string) => json(errorStatus(code), errorBody(code));

/** The email-events function: Resend's webhook for bounces and spam complaints. */
export async function handleEmailEvents(req: Request, deps: EmailEventsDeps): Promise<Response> {
  if (req.method !== "POST") return refuse("DZ-E9005");
  const secret = (deps.env("RESEND_WEBHOOK_SECRET") ?? "").trim();
  if (!secret) return refuse("DZ-E7032");
  const raw = await req.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY) return refuse("DZ-E9013");
  const check = await verifySvix(secret, {
    id: req.headers.get("svix-id"),
    timestamp: req.headers.get("svix-timestamp"),
    signature: req.headers.get("svix-signature"),
  }, raw, (deps.nowSeconds ?? (() => Math.floor(Date.now() / 1000)))());
  if (check === "stale") return refuse("DZ-E7031");
  if (check !== "ok") return refuse("DZ-E7030");
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return refuse("DZ-E9014");
  }
  const event = readEvent(req.headers.get("svix-id") ?? "", payload);
  if (!event) return refuse("DZ-E9016");
  if (!HANDLED_EVENTS.includes(event.type)) return json(200, { ok: true, result: "ignored" });
  const done = await deps.rpc("email_event_record", {
    p_event_id: event.eventId,
    p_type: event.type,
    p_message_id: event.messageId,
    p_addresses: event.addresses,
    p_bounce_type: event.bounceType,
  });
  // A database error is a 500: Resend retries the event later.
  if (done.error) return refuse("DZ-E9999");
  return json(200, { ok: true, result: String(done.data) });
}
