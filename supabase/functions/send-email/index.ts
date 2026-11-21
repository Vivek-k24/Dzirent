// C5, E1: transactional emails, called only by the database through the outbox ({ "email_id" }
// with x-email-secret = EMAIL_JOB_SECRET, Vault email_job_secret). The work is in
// _shared/send-email.ts (Resend, the preference check, the plain-text part, List-Unsubscribe on
// non-essential emails); this file gives it the database and the environment.
// Never logs an address, a key or an email's text.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { errorBody, errorStatus } from "../_shared/errors.ts";
import { handleSendEmail } from "../_shared/send-email.ts";

Deno.serve(async (req) => {
  const url = Deno.env.get("SUPABASE_URL");
  const serverKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serverKey) {
    return new Response(JSON.stringify(errorBody("DZ-E9003")), { status: errorStatus("DZ-E9003"), headers: { "Content-Type": "application/json" } });
  }
  const db = createClient(url, serverKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return await handleSendEmail(req, {
    env: (name) => Deno.env.get(name),
    rpc: async (fn, args) => {
      const { data, error } = await db.rpc(fn, args);
      return { data, error };
    },
  });
});
