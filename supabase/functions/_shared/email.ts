// C5, E1: the email provider adapter: one HTTPS call to Resend, the key from function secrets.
//   RESEND_API_KEY  the Resend key. Blank = email isn't set up: send-email marks emails skipped.
//   EMAIL_API_URL   tests only: another address for the same request (a fake Resend)
// Every email is from "Dzirent <no-reply@mail.dzirent.com>" with replies to support@dzirent.com,
// and has a plain-text part next to the HTML. Resend's Idempotency-Key is the email's id, so an
// outbox retry never sends the same email twice.
// Nothing here logs an address, a key or an email's text. No imports: Deno and Node run it as is.

export const EMAIL_FROM = "Dzirent <no-reply@mail.dzirent.com>";
export const EMAIL_REPLY_TO = "support@dzirent.com";
const RESEND_URL = "https://api.resend.com/emails";

export type EmailConfig = { key: string; from: string; replyTo: string; url: string };
export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  tag: string;
  /** Extra headers, e.g. List-Unsubscribe on non-essential emails. */
  headers?: Record<string, string>;
  /** Our email's id: Resend sends one email per key within 24 hours. */
  idempotencyKey?: string;
};
export type EmailResult =
  | { ok: true; id: string | null }
  | { ok: false; retry: boolean; error: string };

type Env = (name: string) => string | undefined;
type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** The provider settings, or null while the key is blank. */
export function emailConfig(env: Env): EmailConfig | null {
  const key = (env("RESEND_API_KEY") ?? "").trim();
  if (!key) return null;
  const override = (env("EMAIL_API_URL") ?? "").trim();
  return { key, from: EMAIL_FROM, replyTo: EMAIL_REPLY_TO, url: override || RESEND_URL };
}

/** The JSON body Resend's POST /emails takes. */
export function resendBody(cfg: EmailConfig, msg: EmailMessage): Record<string, unknown> {
  const body: Record<string, unknown> = {
    from: cfg.from,
    to: [msg.to],
    reply_to: cfg.replyTo,
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
    tags: [{ name: "template", value: msg.tag.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 256) }],
  };
  if (msg.headers && Object.keys(msg.headers).length) body.headers = msg.headers;
  return body;
}

/** One request to Resend. 4xx (not 429) is final; no answer, 429 or 5xx is worth a retry. */
export async function sendEmail(cfg: EmailConfig, msg: EmailMessage, fetchFn: Fetch = fetch): Promise<EmailResult> {
  const headers: Record<string, string> = { Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" };
  if (msg.idempotencyKey) headers["Idempotency-Key"] = msg.idempotencyKey;
  let res: Response;
  try {
    res = await fetchFn(cfg.url, {
      method: "POST",
      headers,
      body: JSON.stringify(resendBody(cfg, msg)),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return { ok: false, retry: true, error: "The email service didn't answer" };
  }
  let body: Record<string, unknown> = {};
  try {
    body = await res.json();
  } catch {
    body = {};
  }
  if (res.ok) return { ok: true, id: typeof body.id === "string" ? body.id : null };
  const retry = res.status === 429 || res.status >= 500;
  return { ok: false, retry, error: `The email service answered HTTP ${res.status}` };
}
