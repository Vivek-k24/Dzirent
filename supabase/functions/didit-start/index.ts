// C6: a signed-in person starts their one-time ID check, or asks whether checks are available.
// POST /functions/v1/didit-start
//   { "action": "check" }  -> 200 { ok, available }   (available: the Didit keys are set)
//   { "action"?: "start", "return_url"?: "https://dzirent.com/verify/done" }
//                          -> 200 { ok, url, session_token, verification }
// Start: reserves an attempt (didit_start_prepare: refuses DZ-E6004 verified, DZ-E6005 in review,
// DZ-E6003 no attempts left), creates the Didit session with the workflow from the settings, our
// account id as vendor_data and a return address on the site the request came from (allow-listed),
// then marks the check in progress (didit_start_record). The website opens `url`; the Android app
// starts Didit's SDK with `session_token`. Answers DZ-E6002 while a Didit key is blank.
import { readInput } from "../_shared/input.ts";
import { errorBody } from "../_shared/errors.ts";
import { bearer, callerId, corsHeaders, dbRefusal, json, refuse, server } from "../_shared/payments.ts";
import { createSession, diditConfig, verifyReturnUrl } from "../_shared/didit.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return refuse("DZ-E9005");
  const srv = server();
  if (!srv) return refuse("DZ-E9003");

  const uid = await callerId(srv, bearer(req));
  if (!uid) return refuse("DZ-E1003");
  const input = await readInput(req, { allowed: ["action", "return_url"], maxBytes: 2048, emptyIsObject: true });
  if (!input.ok) return json(input.status, errorBody(input.code, input.message));
  const action = input.body.action ?? "start";
  if (action !== "start" && action !== "check") return refuse("DZ-E9016");

  const cfg = diditConfig();
  if (action === "check") return json(200, { ok: true, available: cfg !== null });
  if (!cfg) return refuse("DZ-E6002");

  try {
    const prep = await srv.db.rpc("didit_start_prepare", { p_user: uid });
    if (prep.error) return dbRefusal(prep.error);
    const workflowId = (prep.data as { workflow_id?: unknown } | null)?.workflow_id;
    if (typeof workflowId !== "string" || !workflowId) {
      await srv.db.rpc("didit_start_release", { p_user: uid });
      return refuse("DZ-E9020");
    }
    const session = await createSession(cfg, workflowId, uid, verifyReturnUrl(input.body.return_url));
    if (!session.ok) {
      // The attempt wasn't used: give it back.
      await srv.db.rpc("didit_start_release", { p_user: uid });
      console.log(JSON.stringify({ fn: "didit-start", ok: false, provider_status: session.status }));
      return refuse("DZ-E6006");
    }
    const recorded = await srv.db.rpc("didit_start_record", { p_user: uid, p_session_id: session.sessionId });
    if (recorded.error) return refuse("DZ-E9999");
    console.log(JSON.stringify({ fn: "didit-start", ok: true }));
    return json(200, { ok: true, url: session.url, session_token: session.sessionToken, verification: recorded.data });
  } catch {
    return refuse("DZ-E9999");
  }
});
