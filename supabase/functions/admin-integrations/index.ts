// C4: the admin Integrations page. For each outside service, only whether its secrets are set in
// this project's function secrets: "configured" or "not configured". Never a value, a length or a
// hint of one; nothing is accepted or stored. Admins only (two-step sign-in, fresh): the database
// checks that with the caller's own token and writes the read to the admin log.
// POST /functions/v1/admin-integrations  {}
import { readInput } from "../_shared/input.ts";
import { errorBody } from "../_shared/errors.ts";
import { bearer, corsHeaders, json, refuse, rpcAsCaller, server } from "../_shared/payments.ts";

/** The secret names each service needs (values are never read beyond "is it set"). */
const SERVICES: { key: string; name: string; secrets: string[] }[] = [
  { key: "payments", name: "Payments", secrets: ["STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY", "STRIPE_WEBHOOK_SECRET", "PAYMENTS_JOB_SECRET"] },
  { key: "id_checks", name: "ID checks", secrets: ["DIDIT_API_KEY", "DIDIT_WEBHOOK_SECRET"] },
  { key: "notifications", name: "Notifications", secrets: ["FIREBASE_SERVICE_ACCOUNT_BASE64", "SEND_PUSH_SECRET"] },
  { key: "email", name: "Email", secrets: ["EMAIL_API_KEY"] },
  { key: "photo_checks", name: "Photo checks", secrets: ["VISION_URL", "VISION_INVOKER_KEY_BASE64", "SCAN_LISTING_SECRET"] },
];

function isSet(name: string): boolean {
  return (Deno.env.get(name) ?? "").trim() !== "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return refuse("DZ-E9005");
  const srv = server();
  if (!srv) return refuse("DZ-E9003");
  const token = bearer(req);
  if (!token) return refuse("DZ-E1003");
  const input = await readInput(req, { allowed: [], maxBytes: 1024, emptyIsObject: true });
  if (!input.ok) return json(input.status, errorBody(input.code, input.message));

  const services = SERVICES.map((s) => ({ key: s.key, name: s.name, configured: s.secrets.every(isSet) }));
  try {
    // The admin check and the log entry, as the caller.
    const logged = await rpcAsCaller(srv, token, "admin_record_integrations_check", {
      p_status: Object.fromEntries(services.map((s) => [s.key, s.configured])),
    });
    if (!logged.ok) return refuse("DZ-E5008");
    return json(200, { ok: true, integrations: services.map((s) => ({ ...s, status: s.configured ? "configured" : "not configured" })) });
  } catch {
    return refuse("DZ-E9999");
  }
});
