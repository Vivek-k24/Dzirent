// C2: local stand-ins for the outside services, for the local backend only (never deployed).
// Runs in a container on the local Supabase Docker network (supabase/tests/stubs/run.mjs starts
// it), so the local database reaches it by name through the Vault addresses seed.sql sets:
//   POST /push   - stands in for send-push (Firebase). Checks the shared secret and the body like
//                  send-push does, then records what it would send. A body without the required
//                  fields gets 400 DZ-E9012, like the real function.
//   POST /scan   - stands in for scan-listing + the vision service. Checks the shared secret, starts
//                  the scan (vision_start_scan), answers each photo by its file name, and saves the
//                  result (vision_finish_scan):
//                    name contains "reject" -> rejected, "review" -> review, anything else -> allowed.
//   *    /stripe/... - C4: passes the call on to stripe-mock (the official stripe/stripe-mock image,
//                  container "dzirent-stripe-mock") and records it: method, path, idempotency key
//                  and form fields, never headers. A repeated POST with the same idempotency key
//                  gets the first answer again, as Stripe does (stripe-mock itself keeps no state).
//   GET  /log    - what was recorded: { push: [...], scan: [...], stripe: [...] }.  DELETE /log clears it.
//   GET  /health - "ok".
// Environment: SUPABASE_URL (inside the network), SERVICE_ROLE_KEY, PUSH_SECRET, SCAN_SECRET,
// STRIPE_MOCK_URL, PORT.
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 8787);
const SUPABASE_URL = (process.env.SUPABASE_URL ?? "http://kong:8000").replace(/\/$/, "");
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY ?? "";
const PUSH_SECRET = process.env.PUSH_SECRET ?? "local-push-secret";
const SCAN_SECRET = process.env.SCAN_SECRET ?? "local-scan-secret";
const STRIPE_MOCK_URL = (process.env.STRIPE_MOCK_URL ?? "http://dzirent-stripe-mock:12111").replace(/\/$/, "");

const log = { push: [], scan: [], stripe: [] };
/** Idempotency key -> the first answer (Stripe replays it for 24 hours). */
const replays = new Map();

async function rawBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

async function stripe(req, res, url) {
  const path = url.pathname.slice("/stripe".length) + url.search;
  const text = req.method === "POST" ? await rawBody(req) : "";
  const key = req.headers["idempotency-key"] ?? null;
  const params = Object.fromEntries(new URLSearchParams(req.method === "POST" ? text : url.search));
  const entry = { method: req.method, path: url.pathname.slice("/stripe".length), idempotency_key: key, params, at: new Date().toISOString() };
  if (req.method === "POST" && key && replays.has(key)) {
    const first = replays.get(key);
    log.stripe.push({ ...entry, status: first.status, replayed: true });
    res.writeHead(first.status, CLOSE);
    return res.end(first.body);
  }
  const headers = {};
  for (const h of ["authorization", "stripe-version", "content-type", "idempotency-key"]) {
    if (req.headers[h]) headers[h] = req.headers[h];
  }
  const answer = await fetch(`${STRIPE_MOCK_URL}${path}`, { method: req.method, headers, body: req.method === "POST" ? text : undefined });
  const body = await answer.text();
  let id = null;
  try {
    id = JSON.parse(body)?.id ?? null;
  } catch {}
  if (req.method === "POST" && key && answer.status < 500) replays.set(key, { status: answer.status, body });
  log.stripe.push({ ...entry, status: answer.status, id });
  res.writeHead(answer.status, CLOSE);
  return res.end(body);
}

// C4: every answer closes its connection. A test that waits longer than the server's keep-alive
// time between two calls otherwise reuses a socket the server already closed (UND_ERR_SOCKET).
const CLOSE = { "Content-Type": "application/json", Connection: "close" };

function send(res, status, body) {
  res.writeHead(status, CLOSE);
  res.end(JSON.stringify(body));
}

async function body(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return null;
  }
}

async function rpc(name, args) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, data: text ? JSON.parse(text) : null };
}

/** The verdict a photo's file name asks for. */
function decide(path) {
  const name = String(path).toLowerCase();
  if (name.includes("reject")) return "rejected";
  if (name.includes("review")) return "review";
  return "allowed";
}

/**
 * A stand-in for the model's 768-number photo fingerprint: random but fixed for each storage path,
 * so two different photos are never near each other (no false "copied photo" matches).
 */
async function fingerprint(path) {
  const out = [];
  let block = 0;
  while (out.length < 768) {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${path}#${block++}`)));
    for (const b of digest) out.push(b / 127.5 - 1);
  }
  const v = out.slice(0, 768);
  const norm = Math.hypot(...v);
  return v.map((x) => Number((x / norm).toFixed(6)));
}

/** The same hash as app_private.photo_set_hash: sha256 of the sorted "storage_path:slot" lines. */
async function photoSetHash(photos) {
  const lines = photos.map((p) => `${p.storage_path}:${p.slot ?? ""}`).sort();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(lines.join("\n")));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function scan(scanId) {
  const started = await rpc("vision_start_scan", { p_scan_id: scanId });
  if (!started.ok || !started.data) return { status: 409, body: { code: "DZ-E2024", message: "Scan is not running" } };
  const photos = started.data.photos ?? [];
  const verdicts = photos.map((p) => decide(p.storage_path));
  const verdict = verdicts.includes("rejected") ? "rejected" : verdicts.includes("review") ? "review" : "allowed";
  const reason = verdict === "rejected"
    ? "This item isn't allowed on Dzirent (local stub)."
    : verdict === "review"
      ? "Someone at Dzirent will check these photos before this listing can go live."
      : "These photos look good (local stub).";
  // A fixed suggestion for allowed checks, shaped like the vision service's (services/vision/app/scan.py).
  const suggestions = verdict === "allowed"
    ? {
        item_key: "cocktail_dress", item_label: "Cocktail dress", category: "Occasion & Party", item_type: null,
        garment_type: "dress", colors: ["green"], pattern: "solid", fabric: null, styles: ["Western formal"],
        title: "Green cocktail dress", description: "A green cocktail dress (local stub suggestion).",
        alternatives: [], confidence: 0.9,
      }
    : {};
  const result = {
    verdict,
    reason,
    model: "local-stub",
    suggestions,
    quality: { summary: "All photos look good.", photos: photos.length, photos_with_warnings: 0, warnings: [] },
    photos: await Promise.all(photos.map(async (p, i) => ({
      ok: true,
      photo_id: p.photo_id,
      fingerprint: await fingerprint(p.storage_path),
      decision: verdicts[i] === "allowed" ? "allowed" : verdicts[i] === "rejected" ? "not_allowed" : "unsure",
      blur_score: 0.1,
      brightness_score: 0.5,
      framing_score: 0,
      worn_probability: 0,
      warnings: [],
      labels: {},
    }))),
  };
  const finished = await rpc("vision_finish_scan", {
    p_scan_id: scanId,
    p_photo_set_hash: await photoSetHash(photos),
    p_result: result,
  });
  log.scan.push({ scan_id: scanId, verdict, photos: photos.length, saved: finished.ok, at: new Date().toISOString() });
  if (!finished.ok) {
    await rpc("vision_fail_scan", { p_scan_id: scanId, p_error: "stub_finish_failed" });
    return { status: 500, body: { code: "DZ-E9999", message: "Something went wrong. Please try again.", detail: finished.data } };
  }
  return { status: 200, body: { scan_id: scanId, status: "finished", verdict } };
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://stub");
    if (req.method === "GET" && url.pathname === "/health") return send(res, 200, "ok");
    if (req.method === "GET" && url.pathname === "/log") return send(res, 200, log);
    if (req.method === "DELETE" && url.pathname === "/log") {
      log.push.length = 0;
      log.scan.length = 0;
      log.stripe.length = 0;
      return send(res, 200, { ok: true });
    }
    if (url.pathname.startsWith("/stripe/")) return await stripe(req, res, url);
    if (req.method === "POST" && url.pathname === "/push") {
      if (req.headers["x-send-push-secret"] !== PUSH_SECRET) {
        return send(res, 401, { code: "DZ-E9004", message: "This request isn't allowed." });
      }
      const b = await body(req);
      const ok = b && typeof b === "object" && ["kind", "conversation_id", "recipient_id", "title"].every((k) => typeof b[k] === "string" && b[k]);
      if (!ok) return send(res, 400, { code: "DZ-E9012", message: "This request is missing required fields." });
      log.push.push({ ...b, at: new Date().toISOString() });
      return send(res, 200, { sent: 1, failed: 0, removed: 0, errors: [] });
    }
    if (req.method === "POST" && url.pathname === "/scan") {
      if (req.headers["x-scan-listing-secret"] !== SCAN_SECRET) {
        return send(res, 401, { code: "DZ-E9004", message: "This request isn't allowed." });
      }
      const b = await body(req);
      if (!b || typeof b.scan_id !== "string") return send(res, 400, { code: "DZ-E9016", message: "This request isn't valid." });
      const out = await scan(b.scan_id);
      return send(res, out.status, out.body);
    }
    return send(res, 404, { code: "DZ-E9016", message: "This request isn't valid." });
  } catch (e) {
    return send(res, 500, { code: "DZ-E9999", message: String(e?.message ?? e) });
  }
}).listen(PORT, () => console.log(`dzirent stubs on :${PORT}`));
