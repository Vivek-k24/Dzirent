// E1: the one-click unsubscribe of non-essential emails (List-Unsubscribe-Post, RFC 8058).
//  - POST ?u=<account>&t=<token>: the mail app's one-click. The token is the HMAC send-email
//    put in the link (email-policy.ts); a valid one turns "Email me about rentals" off.
//  - GET (someone opened the link): changes nothing, and sends them to Settings on the website,
//    where the switch is. A GET never unsubscribes, so link scanners can't turn emails off.
// Rental reminders and account emails are essential and keep coming.
import { errorBody, errorStatus } from "./errors.ts";
import { isUuid } from "./input.ts";
import { unsubscribeTokenValid } from "./email-policy.ts";

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
export type UnsubscribeDeps = { env: (name: string) => string | undefined; rpc: Rpc };

export const SETTINGS_URL = "https://dzirent.com/app/settings/preferences";

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
const refuse = (code: string) => json(errorStatus(code), errorBody(code));

export async function handleUnsubscribe(req: Request, deps: UnsubscribeDeps): Promise<Response> {
  if (req.method === "GET") return new Response(null, { status: 303, headers: { Location: SETTINGS_URL } });
  if (req.method !== "POST") return refuse("DZ-E9005");
  const secret = deps.env("EMAIL_JOB_SECRET") ?? "";
  if (!secret) return refuse("DZ-E9003");
  const url = new URL(req.url);
  const user = url.searchParams.get("u") ?? "";
  const token = url.searchParams.get("t") ?? "";
  if (!isUuid(user) || !(await unsubscribeTokenValid(secret, user, token))) return refuse("DZ-E7033");
  const done = await deps.rpc("email_unsubscribe", { p_user_id: user.toLowerCase() });
  if (done.error) return refuse("DZ-E9999");
  return json(200, { ok: true, result: String(done.data) });
}
