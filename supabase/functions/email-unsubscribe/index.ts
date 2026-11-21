// E1: one-click unsubscribe from non-essential emails (verify_jwt = false: the link carries its
// own signed token; see _shared/email-unsubscribe.ts). POST turns "Email me about rentals" off; a
// GET only sends the person to Settings on the website.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { errorBody, errorStatus } from "../_shared/errors.ts";
import { handleUnsubscribe } from "../_shared/email-unsubscribe.ts";

Deno.serve(async (req) => {
  const url = Deno.env.get("SUPABASE_URL");
  const serverKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serverKey) {
    return new Response(JSON.stringify(errorBody("DZ-E9003")), { status: errorStatus("DZ-E9003"), headers: { "Content-Type": "application/json" } });
  }
  const db = createClient(url, serverKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    return await handleUnsubscribe(req, {
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
