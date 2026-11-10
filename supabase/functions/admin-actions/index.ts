// Admin steps that need the server key: banning or unbanning an account in Supabase Auth, and
// deleting photo files from Storage. The caller must be an admin signed in with two-step
// verification: the database decides that (is_admin()), asked with the caller's own token. The
// database side of each step (admin_record_ban, admin_remove_photos) also runs with the caller's
// token, so it checks again and writes the admin log. The server key comes from the function's
// environment only and is used for the Auth and Storage calls, nothing else.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { readInput, UUID } from "../_shared/input.ts";

const BUCKET = "listing-photos";
// About 100 years: Supabase Auth's way of saying "until unbanned".
const BAN_DURATION = "876000h";
// A listing has at most 6 photos; anything longer is not a real request.
const MAX_PHOTO_IDS = 20;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** The project's publishable key (new API keys), else the legacy anon key. */
function publishableKey(): string | null {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
    if (typeof keys?.default === "string" && keys.default) return keys.default;
  } catch {
    // Not set or not JSON: use the legacy key.
  }
  return Deno.env.get("SUPABASE_ANON_KEY") ?? null;
}

/** A database function called as the signed-in caller, so RLS and require_admin() see them. */
async function rpcAsCaller(url: string, key: string, token: string, name: string, args: Record<string, unknown>) {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { ok: response.ok, status: response.status, body };
}

function reasonOf(value: unknown): string | null {
  return typeof value === "string" && value.trim().length >= 3 ? value.trim().slice(0, 500) : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get("Authorization") ?? "")?.[1]?.trim();
  if (!token) {
    return json(401, { error: "not_signed_in" });
  }
  const url = Deno.env.get("SUPABASE_URL");
  const key = publishableKey();
  const serverKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key || !serverKey) {
    return json(500, { error: "not_configured" });
  }
  const admin = createClient(url, serverKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1. Who is calling, and are they an admin signed in with two-step verification?
  const { data: caller, error: callerError } = await admin.auth.getUser(token);
  if (callerError || !caller?.user?.id) {
    return json(401, { error: "not_signed_in" });
  }
  const check = await rpcAsCaller(url, key, token, "is_admin", {});
  if (!check.ok || check.body !== true) {
    return json(403, { error: "admins_only", message: "Admins only, signed in with two-step verification." });
  }

  const input = await readInput(req, {
    allowed: ["action", "reason", "user_id", "report_id", "listing_id", "photo_ids", "takedown_id"],
    required: ["action", "reason"],
    maxBytes: 16_384,
  });
  if (!input.ok) {
    return json(input.status, { error: input.error, message: input.message });
  }
  const body = input.body;
  const action = body.action;
  if (typeof body.reason !== "string" || body.reason.length > 500) {
    return json(400, { error: "bad_request", message: "Give a reason of at most 500 characters." });
  }
  const reason = reasonOf(body.reason);
  if (!reason) {
    return json(400, { error: "bad_request", message: "Give a reason (at least 3 characters)." });
  }

  try {
    if (action === "ban" || action === "unban") {
      const userId = body?.user_id;
      const reportId = body?.report_id ?? null;
      if (typeof userId !== "string" || !UUID.test(userId) || (reportId !== null && (typeof reportId !== "string" || !UUID.test(reportId)))) {
        return json(400, { error: "bad_request" });
      }
      if (userId === caller.user.id) {
        return json(400, { error: "bad_request", message: "Admins can't ban themselves." });
      }
      // 2. The Auth ban: no sign-in and no token refresh until unbanned.
      const { error: banError } = await admin.auth.admin.updateUserById(userId, {
        ban_duration: action === "ban" ? BAN_DURATION : "none",
      });
      if (banError) {
        return json(502, { error: "auth_failed", message: "Couldn't change the account in Supabase Auth." });
      }
      // 3. The database side, as the caller: suspension, listing holds, report outcome, admin log.
      const record = await rpcAsCaller(url, key, token, "admin_record_ban", {
        p_user_id: userId, p_banned: action === "ban", p_reason: reason, p_report_id: reportId,
      });
      if (!record.ok) {
        return json(500, {
          error: "record_failed",
          auth_changed: true,
          message: "The account was changed in Supabase Auth, but the record couldn't be saved. Try again.",
        });
      }
      console.log(JSON.stringify({ action, ok: true }));
      return json(200, { ok: true, action, result: record.body as Record<string, unknown> });
    }

    if (action === "remove_photos") {
      const listingId = body?.listing_id;
      const photoIds = body?.photo_ids;
      const takedownId = body?.takedown_id ?? null;
      if (typeof listingId !== "string" || !UUID.test(listingId) || !Array.isArray(photoIds) || photoIds.length === 0 ||
        photoIds.length > MAX_PHOTO_IDS || !photoIds.every((id) => typeof id === "string" && UUID.test(id)) ||
        (takedownId !== null && (typeof takedownId !== "string" || !UUID.test(takedownId)))) {
        return json(400, { error: "bad_request" });
      }
      // 2. The database removes the photo rows (and logs it), then the files go from Storage.
      const removed = await rpcAsCaller(url, key, token, "admin_remove_photos", {
        p_listing_id: listingId, p_photo_ids: photoIds, p_reason: reason, p_takedown_id: takedownId,
      });
      if (!removed.ok) {
        // The database's own plain sentence (for example "Photo not found on this listing") is
        // safe to show; anything else stays generic.
        const said = (removed.body as { message?: unknown } | null)?.message;
        const plain = removed.status === 400 && typeof said === "string" && said.length <= 200 ? said : null;
        return json(removed.status === 400 ? 400 : 500, {
          error: "remove_failed",
          message: plain ?? "Couldn't remove the photos. Try again.",
        });
      }
      const paths = ((removed.body as { storage_paths?: unknown })?.storage_paths ?? []) as string[];
      if (paths.length > 0) {
        const { error: storageError } = await admin.storage.from(BUCKET).remove(paths);
        if (storageError) {
          return json(502, { error: "storage_failed", rows_removed: paths.length });
        }
      }
      console.log(JSON.stringify({ action, ok: true, files: paths.length }));
      return json(200, { ok: true, action, files_removed: paths.length });
    }

    return json(400, { error: "bad_request", message: "Unknown action." });
  } catch {
    return json(500, { error: "server_error" });
  }
});
