// C6: reads one session's decision from Didit and applies it (didit_apply_decision). Called only by
// the database's outbox (job kind didit_sync: after an Approved, Declined or In Review webhook, and by
// the reconciliation job for sessions still in progress after 30 minutes), with x-didit-job-secret =
// DIDIT_JOB_SECRET (Vault didit_job_secret).
// The decision is held in memory only: what goes to the database is the status, the legal name, an
// 18+ result (computed here from the birthdate, which is then dropped), a duplicate-face flag and a
// reason of risk codes. Never the birthdate, document details, address, nationality, images or IP.
// POST /functions/v1/didit-sync  { "session_id": "<id>" }
// Answers 503 DZ-E6002 while a Didit key is blank and 502 DZ-E6006 when Didit doesn't answer, so the
// outbox tries again (1, 5, 30 and 120 minutes).
import { readInput } from "../_shared/input.ts";
import { errorBody } from "../_shared/errors.ts";
import { json, refuse, server } from "../_shared/payments.ts";
import { diditCall, diditConfig, fromDiditJob, SESSION_ID, summarizeDecision } from "../_shared/didit.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return refuse("DZ-E9005");
  if (!fromDiditJob(req)) return refuse("DZ-E9004");
  const srv = server();
  if (!srv) return refuse("DZ-E9003");
  const input = await readInput(req, { allowed: ["session_id"], required: ["session_id"], maxBytes: 1024 });
  if (!input.ok) return json(input.status, errorBody(input.code, input.message));
  const sessionId = input.body.session_id;
  if (typeof sessionId !== "string" || !SESSION_ID.test(sessionId)) return refuse("DZ-E9016");
  const cfg = diditConfig();
  if (!cfg) return refuse("DZ-E6002");

  try {
    const decision = await diditCall(cfg, "GET", `/v3/session/${encodeURIComponent(sessionId)}/decision/`);
    let summary;
    if (decision.ok) {
      summary = summarizeDecision(decision.body);
    } else if (decision.status === 404) {
      // Gone at Didit: an unfinished check ends as expired (a verified one is never touched).
      summary = { status: "Expired", legalName: null, isAdult: null, duplicate: false, reason: null };
    } else {
      return refuse("DZ-E6006");
    }
    if (!summary.status) return json(200, { ok: true, result: "no_status" });
    const applied = await srv.db.rpc("didit_apply_decision", {
      p_session_id: sessionId,
      p_status: summary.status,
      p_legal_name: summary.legalName,
      p_is_adult: summary.isAdult,
      p_duplicate: summary.duplicate,
      p_reason: summary.reason,
    });
    if (applied.error) return refuse("DZ-E9999");
    const result = (applied.data as { result?: string } | null)?.result ?? null;
    console.log(JSON.stringify({ fn: "didit-sync", result }));
    return json(200, { ok: true, result });
  } catch {
    return refuse("DZ-E9999");
  }
});
