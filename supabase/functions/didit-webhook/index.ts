// C6: Didit's webhook (status.updated, data.updated), checked exactly as the owner's Didit console
// shows: the X-Signature header is the hex HMAC-SHA256 of the raw body bytes with
// DIDIT_WEBHOOK_SECRET, compared in constant time before anything is parsed (else 401 DZ-E6007); the
// body's own timestamp must be within 300 seconds of now (else 400 DZ-E6008; the X-Timestamp header
// is never used); the application_id must be ours (else 400 DZ-E6009). Each event id is processed
// once (app_private.didit_events), and the answer comes at once: Didit waits 5 seconds at most and
// retries only twice. The decision itself is read afterwards through the outbox (didit-sync), so this
// function stores nothing from the payload but the event id, session, status and type.
// POST /functions/v1/didit-webhook (Didit only; no Supabase token)
// Answers DZ-E6002 (503) while a Didit key is blank.
import { errorBody } from "../_shared/errors.ts";
import { isUuid } from "../_shared/input.ts";
import { json, refuse, server } from "../_shared/payments.ts";
import { diditConfig, freshTimestamp, verifyDiditSignature } from "../_shared/didit.ts";

const MAX_BYTES = 1024 * 1024;

Deno.serve(async (req) => {
  if (req.method !== "POST") return refuse("DZ-E9005");
  const srv = server();
  if (!srv) return refuse("DZ-E9003");
  const cfg = diditConfig();
  if (!cfg) return refuse("DZ-E6002");

  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_BYTES) return json(413, errorBody("DZ-E9013"));
  let raw: Uint8Array;
  try {
    raw = new Uint8Array(await req.arrayBuffer());
  } catch {
    return refuse("DZ-E9014");
  }
  if (raw.byteLength > MAX_BYTES) return json(413, errorBody("DZ-E9013"));

  // 1. The signature, on the exact bytes Didit sent.
  if (!(await verifyDiditSignature(raw, req.headers.get("X-Signature"), cfg.webhookSecret))) {
    return refuse("DZ-E6007");
  }

  // 2. Only now is the body read.
  // deno-lint-ignore no-explicit-any
  let event: any;
  try {
    event = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
  } catch {
    return refuse("DZ-E9010");
  }
  if (!event || typeof event !== "object" || Array.isArray(event)) return refuse("DZ-E9010");
  if (!freshTimestamp(event.timestamp)) return refuse("DZ-E6008");
  if (!isUuid(event.event_id) || typeof event.webhook_type !== "string" || typeof event.application_id !== "string") {
    return refuse("DZ-E9016");
  }
  const text = (v: unknown, max: number) => (typeof v === "string" && v.length <= max ? v : null);
  const createdAt = typeof event.created_at === "number" && Number.isFinite(event.created_at)
    ? Math.trunc(event.created_at)
    : null;

  try {
    const handled = await srv.db.rpc("didit_webhook_received", {
      p_event_id: event.event_id,
      p_type: text(event.webhook_type, 100),
      p_application_id: text(event.application_id, 100),
      p_session_id: text(event.session_id, 100),
      p_vendor_data: text(event.vendor_data, 200),
      p_status: text(event.status, 50),
      p_created_at: createdAt,
    });
    if (handled.error) {
      if (/^DZ-E6009:/.test(handled.error.message ?? "")) return refuse("DZ-E6009");
      // Didit sends it again (twice) and the reconciliation job catches anything missed.
      return refuse("DZ-E9999");
    }
    const result = (handled.data as { result?: string } | null)?.result ?? null;
    console.log(JSON.stringify({ fn: "didit-webhook", type: event.webhook_type, result }));
    return json(200, { received: true, result });
  } catch {
    return refuse("DZ-E9999");
  }
});
