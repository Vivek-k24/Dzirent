// E1: Resend's webhook for bounces and spam complaints (verify_jwt = false: Resend signs it).
// The signature is checked on the raw body with RESEND_WEBHOOK_SECRET (Svix: svix-id,
// svix-timestamp within 5 minutes, svix-signature); see _shared/email-events.ts. A hard bounce or
// a complaint flags the account's address (profiles.email_status) through email_event_record,
// each event once; non-essential emails to it stop. Every other event is answered and dropped.
// Never logs an address or an email's text.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { errorBody, errorStatus } from "../_shared/errors.ts";
import { handleEmailEvents } from "../_shared/email-events.ts";

Deno.serve(async (req) => {
  const url = Deno.env.get("SUPABASE_URL");
  const serverKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serverKey) {
    return new Response(JSON.stringify(errorBody("DZ-E9003")), { status: errorStatus("DZ-E9003"), headers: { "Content-Type": "application/json" } });
  }
  const db = createClient(url, serverKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    return await handleEmailEvents(req, {
      env: (name) => Deno.env.get(name),
      rpc: async (fn, args) => {
        const { data, error } = await db.rpc(fn, args);
        return { data, error };
      },
    });
  } catch {
    return new Response(JSON.stringify(errorBody("DZ-E9999")), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
