// C5, E1: what send-email does with one email from the outbox, with the database calls and the
// network passed in (the Edge Function gives the real ones; the unit tests a fake database and a
// fake Resend). The database decides who gets which email and when; this decides whether it goes.
//  - RESEND_API_KEY blank: the email is marked skipped ("not_configured") before anything is read.
//  - The preference check (email-policy.ts): rental reminders and the account email always go;
//    the rest are skipped while "Email me about rentals" is off ("turned_off") or the address is
//    flagged ("suppressed").
//  - Sent: marked sent with Resend's id. A refusal Resend decides (4xx): failed, 200.
//  - No answer, 429 or 5xx: 503, so the outbox tries again (the email stays queued).
// Never logs an address, a key or an email's text.
import { errorBody, errorStatus } from "./errors.ts";
import { isUuid, readInput } from "./input.ts";
import { emailConfig, sendEmail } from "./email.ts";
import { renderEmail } from "./email-templates.ts";
import { emailDecision, isEssential, sameText, unsubscribeHeaders, type EmailPrefs } from "./email-policy.ts";

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
type Fetch = (url: string, init: RequestInit) => Promise<Response>;
export type SendEmailDeps = {
  env: (name: string) => string | undefined;
  rpc: Rpc;
  fetch?: Fetch;
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
const refuse = (code: string) => json(errorStatus(code), errorBody(code));

type Prepared = {
  state: string;
  to?: string;
  template?: string;
  data?: Record<string, unknown>;
  recipient_id?: string | null;
  prefs?: EmailPrefs;
};

export async function handleSendEmail(req: Request, deps: SendEmailDeps): Promise<Response> {
  if (req.method !== "POST") return refuse("DZ-E9005");
  const expected = deps.env("EMAIL_JOB_SECRET") ?? "";
  if (!expected || !sameText(expected, req.headers.get("x-email-secret") ?? "")) return refuse("DZ-E9004");

  const input = await readInput(req, { allowed: ["email_id"], required: ["email_id"], maxBytes: 1024 });
  if (!input.ok) return json(input.status, errorBody(input.code, input.message));
  const emailId = input.body.email_id;
  if (!isUuid(emailId)) return refuse("DZ-E9016");

  const finish = async (status: "sent" | "skipped" | "failed", reason: string | null, providerId: string | null = null) => {
    const done = await deps.rpc("email_finish", { p_email_id: emailId, p_status: status, p_reason: reason, p_provider_id: providerId });
    if (done.error) return refuse("DZ-E9999");
    return json(200, { ok: true, email_id: emailId, state: status, skipped: status === "skipped", reason });
  };

  try {
    // No provider key yet: nothing is read or sent; the email and its job are marked skipped.
    const cfg = emailConfig(deps.env);
    if (!cfg) return await finish("skipped", "not_configured");

    const prepared = await deps.rpc("email_prepare", { p_email_id: emailId });
    if (prepared.error) return refuse("DZ-E9999");
    const p = prepared.data as Prepared | null;
    if (!p || p.state !== "send" || !p.to || !p.template) {
      // Gone, already finished, or skipped by the database (no address, the rental gone).
      return json(200, { ok: true, email_id: emailId, state: p?.state ?? "gone", skipped: p?.state === "skipped" });
    }

    const decision = emailDecision(p.template, p.prefs);
    if (!decision.send) return await finish("skipped", decision.reason);

    const email = renderEmail(p.template, p.data ?? {});
    if (!email) return await finish("failed", "Unknown template");

    // Non-essential emails carry the one-click unsubscribe link (signed with the outbox secret).
    const base = deps.env("SUPABASE_URL") ?? "";
    const headers = !isEssential(p.template) && p.recipient_id && base
      ? await unsubscribeHeaders(base, expected, p.recipient_id)
      : undefined;

    const sent = await sendEmail(cfg, {
      to: p.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      tag: p.template,
      headers,
      idempotencyKey: emailId,
    }, deps.fetch);
    if (sent.ok) return await finish("sent", null, sent.id);
    if (!sent.retry) return await finish("failed", sent.error);
    return refuse("DZ-E9003");
  } catch {
    return refuse("DZ-E9999");
  }
}
