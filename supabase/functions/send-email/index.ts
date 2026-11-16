// C5: transactional emails, called only by the database through the outbox ({ "email_id" } with
// x-email-secret = EMAIL_JOB_SECRET, Vault email_job_secret). The database decides who gets which
// email and when (rental requests and answers, the payment receipt, pickup and return reminders,
// claims, account deleted); email_prepare gives the account's own address and the plain fields the
// templates use (_shared/email-templates.ts), never messages, measurements or places.
//  - While EMAIL_API_KEY (or EMAIL_FROM) is blank the email is marked skipped ("not_configured")
//    and the answer is 200 { skipped: true }: the outbox marks the job skipped, not failed.
//  - Sent: marked sent with the provider's id. A refusal the provider decides (4xx): failed, 200.
//  - No answer, 429 or 5xx: 503, so the outbox tries again (the email stays queued).
// Never logs an address, a key or an email's text.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { errorBody, errorStatus } from "../_shared/errors.ts";
import { isUuid, readInput } from "../_shared/input.ts";
import { emailConfig, sendEmail } from "../_shared/email.ts";
import { renderEmail } from "../_shared/email-templates.ts";

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
const refuse = (code: string) => json(errorStatus(code), errorBody(code));

function fromOutbox(req: Request): boolean {
  const expected = Deno.env.get("EMAIL_JOB_SECRET") ?? "";
  const given = req.headers.get("x-email-secret") ?? "";
  if (!expected || expected.length !== given.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return refuse("DZ-E9005");
  if (!fromOutbox(req)) return refuse("DZ-E9004");
  const url = Deno.env.get("SUPABASE_URL");
  const serverKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serverKey) return refuse("DZ-E9003");
  const db = createClient(url, serverKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const input = await readInput(req, { allowed: ["email_id"], required: ["email_id"], maxBytes: 1024 });
  if (!input.ok) return json(input.status, errorBody(input.code, input.message));
  const emailId = input.body.email_id;
  if (!isUuid(emailId)) return refuse("DZ-E9016");

  const finish = async (status: "sent" | "skipped" | "failed", reason: string | null, providerId: string | null = null) => {
    const done = await db.rpc("email_finish", { p_email_id: emailId, p_status: status, p_reason: reason, p_provider_id: providerId });
    if (done.error) return refuse("DZ-E9999");
    return json(200, { ok: true, email_id: emailId, state: status, skipped: status === "skipped" });
  };

  try {
    // No provider key yet: nothing is read or sent; the email and its job are marked skipped.
    const cfg = emailConfig();
    if (!cfg) return await finish("skipped", "not_configured");

    const prepared = await db.rpc("email_prepare", { p_email_id: emailId });
    if (prepared.error) return refuse("DZ-E9999");
    const p = prepared.data as { state: string; to?: string; template?: string; data?: Record<string, unknown> } | null;
    if (!p || p.state !== "send" || !p.to || !p.template) {
      // Gone, already finished, or skipped by the database (turned off, no address, rental gone).
      return json(200, { ok: true, email_id: emailId, state: p?.state ?? "gone", skipped: p?.state === "skipped" });
    }
    const email = renderEmail(p.template, p.data ?? {});
    if (!email) return await finish("failed", "Unknown template");

    const sent = await sendEmail(cfg, { to: p.to, subject: email.subject, html: email.html, text: email.text, tag: p.template });
    if (sent.ok) return await finish("sent", null, sent.id);
    if (!sent.retry) return await finish("failed", sent.error);
    return refuse("DZ-E9003");
  } catch {
    return refuse("DZ-E9999");
  }
});
