// C5: the email provider adapter: one HTTPS call, the provider and key from function secrets.
//   EMAIL_PROVIDER  resend (default) or postmark: the request shape
//   EMAIL_API_KEY   the provider key. Blank = email isn't set up: send-email marks emails skipped.
//   EMAIL_FROM      the sender, e.g. "Dzirent <rentals@dzirent.com>" (a verified sender domain)
//   EMAIL_API_URL   tests only: another address for the same request (ignored without a key)
// Nothing here logs an address, a key or an email's text.

export type EmailConfig = { provider: "resend" | "postmark"; key: string; from: string; url: string };
export type EmailMessage = { to: string; subject: string; html: string; text: string; tag: string };
export type EmailResult =
  | { ok: true; id: string | null }
  | { ok: false; retry: boolean; error: string };

const DEFAULT_URL = { resend: "https://api.resend.com/emails", postmark: "https://api.postmarkapp.com/email" };

/** The provider settings, or null while the key (or sender) is blank. */
export function emailConfig(env: (name: string) => string | undefined = (n) => Deno.env.get(n)): EmailConfig | null {
  const key = (env("EMAIL_API_KEY") ?? "").trim();
  const from = (env("EMAIL_FROM") ?? "").trim();
  if (!key || !from) return null;
  const provider = (env("EMAIL_PROVIDER") ?? "resend").trim().toLowerCase() === "postmark" ? "postmark" : "resend";
  const override = (env("EMAIL_API_URL") ?? "").trim();
  return { provider, key, from, url: override || DEFAULT_URL[provider] };
}

/** One request to the provider. 4xx (not 429) is final; no answer, 429 or 5xx is worth a retry. */
export async function sendEmail(cfg: EmailConfig, msg: EmailMessage): Promise<EmailResult> {
  const request = cfg.provider === "postmark"
    ? {
      headers: { "X-Postmark-Server-Token": cfg.key, Accept: "application/json", "Content-Type": "application/json" },
      body: { From: cfg.from, To: msg.to, Subject: msg.subject, HtmlBody: msg.html, TextBody: msg.text, Tag: msg.tag, MessageStream: "outbound" },
    }
    : {
      headers: { Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" },
      body: { from: cfg.from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text, tags: [{ name: "template", value: msg.tag }] },
    };
  let res: Response;
  try {
    res = await fetch(cfg.url, { method: "POST", headers: request.headers, body: JSON.stringify(request.body), signal: AbortSignal.timeout(10000) });
  } catch {
    return { ok: false, retry: true, error: "The email service didn't answer" };
  }
  let body: Record<string, unknown> = {};
  try {
    body = await res.json();
  } catch {
    body = {};
  }
  if (res.ok) {
    const id = typeof body.id === "string" ? body.id : typeof body.MessageID === "string" ? body.MessageID : null;
    return { ok: true, id };
  }
  const retry = res.status === 429 || res.status >= 500;
  return { ok: false, retry, error: `The email service answered HTTP ${res.status}` };
}
