// C6: Didit over fetch (https://docs.didit.me): sessions, decisions, deletions, and the webhook
// signature. The API key and the webhook secret come from the function's environment only and are
// never logged or returned. While either is blank, diditConfig() is null and every Didit function
// answers DZ-E6002 "ID verification isn't available yet."
//
// Privacy: a decision holds the ID's data (name, birthdate, document number, address, nationality,
// images, IP). It is read here in memory only; summarizeDecision() keeps the status, the legal name,
// an 18+ result computed from the birthdate (the date itself is dropped), whether a duplicate face
// was flagged, and a short reason made of the provider's risk codes. Nothing else leaves this file.

const LIVE_API = "https://verification.didit.me";
/** The owner's Didit console: reject a webhook whose body timestamp is more than 5 minutes away. */
export const WEBHOOK_TOLERANCE_SECONDS = 300;
/** Where the hosted flow returns people on the website. */
export const DEFAULT_RETURN_URL = "https://dzirent.com/verify/done";
const RETURN_HOSTS = ["dzirent.com", "www.dzirent.com", "dzirent.vercel.app"];

export type DiditConfig = { apiKey: string; webhookSecret: string; apiBase: string };

/** The Didit settings, or null while a key is blank. */
export function diditConfig(): DiditConfig | null {
  const apiKey = (Deno.env.get("DIDIT_API_KEY") ?? "").trim();
  const webhookSecret = (Deno.env.get("DIDIT_WEBHOOK_SECRET") ?? "").trim();
  if (!apiKey || !webhookSecret) return null;
  return { apiKey, webhookSecret, apiBase: apiBase() };
}

/**
 * DIDIT_API_BASE points tests at the local stub. Only a local Docker name (no dot) or 127.0.0.1 is
 * accepted, so a stray value can't send the key anywhere else; it is never set on the live project.
 */
function apiBase(): string {
  const override = (Deno.env.get("DIDIT_API_BASE") ?? "").trim().replace(/\/$/, "");
  if (!override) return LIVE_API;
  try {
    const u = new URL(override);
    const local = (u.protocol === "http:" || u.protocol === "https:") &&
      (!u.hostname.includes(".") || u.hostname === "127.0.0.1");
    return local ? override : LIVE_API;
  } catch {
    return LIVE_API;
  }
}

// deno-lint-ignore no-explicit-any
export type DiditBody = any;
export type DiditResult = { ok: true; status: number; body: DiditBody } | { ok: false; status: number };

/** One Didit API call with the x-api-key header. Never throws; status 0 means no answer. */
export async function diditCall(
  cfg: DiditConfig,
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
): Promise<DiditResult> {
  try {
    const res = await fetch(`${cfg.apiBase}${path}`, {
      method,
      headers: {
        "x-api-key": cfg.apiKey,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000),
    });
    const text = await res.text();
    let parsed: DiditBody = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    return res.ok ? { ok: true, status: res.status, body: parsed } : { ok: false, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

export const SESSION_ID = /^[0-9A-Za-z_-]{8,100}$/;

/** POST /v3/session/: our account id as vendor_data, the return address as callback. */
export async function createSession(
  cfg: DiditConfig,
  workflowId: string,
  userId: string,
  callback: string,
): Promise<{ ok: true; sessionId: string; sessionToken: string; url: string } | { ok: false; status: number }> {
  const r = await diditCall(cfg, "POST", "/v3/session/", { workflow_id: workflowId, vendor_data: userId, callback });
  if (!r.ok) return r;
  const { session_id: sessionId, session_token: sessionToken, url } = r.body ?? {};
  if (typeof sessionId !== "string" || !SESSION_ID.test(sessionId)) return { ok: false, status: 502 };
  if (typeof sessionToken !== "string" || !sessionToken || sessionToken.length > 2000) return { ok: false, status: 502 };
  if (typeof url !== "string" || !/^https:\/\//.test(url) || url.length > 2000) return { ok: false, status: 502 };
  return { ok: true, sessionId, sessionToken, url };
}

/** DELETE /v3/session/{id}/delete/: the session with its images and face data. Gone already counts as done. */
export async function deleteSession(cfg: DiditConfig, sessionId: string): Promise<boolean> {
  const r = await diditCall(cfg, "DELETE", `/v3/session/${encodeURIComponent(sessionId)}/delete/`);
  return r.ok || r.status === 404;
}

/** POST /v3/users/delete/: Didit's user record for our account id (vendor_data). */
export async function deleteUser(cfg: DiditConfig, userId: string): Promise<boolean> {
  const r = await diditCall(cfg, "POST", "/v3/users/delete/", { vendor_data_list: [userId] });
  return r.ok || r.status === 404;
}

/** The return address on the site the request came from (dzirent.com or the preview site), else dzirent.com. */
export function verifyReturnUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 300) return DEFAULT_RETURN_URL;
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.port || !RETURN_HOSTS.includes(u.hostname) || u.pathname !== "/verify/done") {
      return DEFAULT_RETURN_URL;
    }
    return `https://${u.hostname}/verify/done`;
  } catch {
    return DEFAULT_RETURN_URL;
  }
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time comparison of two strings of the same length. */
export function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * The webhook signature, as the owner's Didit console shows it: X-Signature is the hex HMAC-SHA256
 * of the raw request body bytes with the webhook secret (64 hex characters). Checked before parsing.
 */
export async function verifyDiditSignature(raw: Uint8Array, header: string | null, secret: string): Promise<boolean> {
  const given = (header ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(given) || !secret) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return sameText(given, hex(await crypto.subtle.sign("HMAC", key, raw)));
}

/** The body's own timestamp (Unix seconds) is within 5 minutes of now. The X-Timestamp header is never used. */
export function freshTimestamp(timestamp: unknown, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  const t = typeof timestamp === "number" ? timestamp : typeof timestamp === "string" && /^\d+$/.test(timestamp) ? Number(timestamp) : NaN;
  return Number.isFinite(t) && Math.abs(nowSeconds - t) <= WEBHOOK_TOLERANCE_SECONDS;
}

/** The outbox's calls carry x-didit-job-secret = DIDIT_JOB_SECRET (Vault didit_job_secret). */
export function fromDiditJob(req: Request): boolean {
  const expected = (Deno.env.get("DIDIT_JOB_SECRET") ?? "").trim();
  const given = req.headers.get("x-didit-job-secret") ?? "";
  return expected !== "" && sameText(expected, given);
}

/** Risk codes that mean the face was already seen in another person's approved check. */
const DUPLICATE_RISKS = new Set(["DUPLICATED_FACE", "POSSIBLE_DUPLICATED_FACE"]);

export type DecisionSummary = {
  status: string | null;
  legalName: string | null;
  isAdult: boolean | null;
  duplicate: boolean;
  reason: string | null;
};

/** Every warning in the decision's feature arrays (V3: id_verifications[], liveness_checks[], ...). */
function warnings(decision: DiditBody): { risk?: unknown; log_type?: unknown }[] {
  const out: { risk?: unknown; log_type?: unknown }[] = [];
  if (!decision || typeof decision !== "object") return out;
  for (const value of Object.values(decision)) {
    if (!Array.isArray(value)) continue;
    for (const feature of value) {
      const list = feature && typeof feature === "object" ? (feature as { warnings?: unknown }).warnings : null;
      if (Array.isArray(list)) for (const w of list) if (w && typeof w === "object") out.push(w);
    }
  }
  return out;
}

/** A name for display to nobody but the person and the server: trimmed, one space, no control characters. */
function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // deno-lint-ignore no-control-regex
  const text = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 200) : null;
}

/** 18 or older on [today] (UTC), from "YYYY-MM-DD"; null when there is no usable date. */
export function adultFrom(dateOfBirth: unknown, today: Date = new Date()): boolean | null {
  if (typeof dateOfBirth !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateOfBirth.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  let age = today.getUTCFullYear() - y;
  const tm = today.getUTCMonth() + 1;
  if (tm < mo || (tm === mo && today.getUTCDate() < d)) age--;
  if (age < 0 || age > 150) return null;
  return age >= 18;
}

/** What Dzirent keeps from a decision (GET /v3/session/{id}/decision/ or a webhook's decision). */
export function summarizeDecision(decision: DiditBody, today: Date = new Date()): DecisionSummary {
  const status = typeof decision?.status === "string" ? decision.status : null;
  const ids: DiditBody[] = Array.isArray(decision?.id_verifications) ? decision.id_verifications : [];
  const id = ids.find((x) => x && typeof x === "object" && (x.full_name || x.first_name || x.date_of_birth)) ?? null;
  const legalName = cleanName(id?.full_name) ??
    cleanName([id?.first_name, id?.last_name].filter((p) => typeof p === "string" && p.trim()).join(" "));
  let isAdult = adultFrom(id?.date_of_birth, today);
  if (isAdult === null && typeof id?.age === "number" && Number.isFinite(id.age)) isAdult = id.age >= 18;
  const all = warnings(decision);
  const duplicate = all.some((w) => DUPLICATE_RISKS.has(String(w.risk)));
  let reason: string | null = null;
  if (status === "Declined") {
    const codes = [...new Set(all.filter((w) => w.log_type === "error").map((w) => String(w.risk ?? "")))]
      .filter((c) => /^[A-Z0-9_]{2,60}$/.test(c)).slice(0, 3);
    reason = codes.length ? `Declined by the verification provider (${codes.join(", ")})` : null;
  }
  return { status, legalName, isAdult, duplicate, reason };
}
