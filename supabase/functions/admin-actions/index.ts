// Admin steps that need the server key: banning or unbanning an account in Supabase Auth, and
// deleting photo files from Storage. The caller must be an admin signed in with two-step
// verification: the database decides that (is_admin()), asked with the caller's own token. The
// database side of each step (admin_record_ban, admin_remove_photos) also runs with the caller's
// token, so it checks again and writes the admin log. The server key comes from the function's
// environment only and is used for the Auth and Storage calls, nothing else.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { readInput, UUID } from "../_shared/input.ts";
import { codeOf, errorBody, errorStatus } from "../_shared/errors.ts";

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

/** C1: an error as { code, message } with the catalog status (contracts/error-codes.json). */
function refuse(code: string, message?: string): Response {
  return json(errorStatus(code), errorBody(code, message));
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
    return refuse("DZ-E9005");
  }

  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get("Authorization") ?? "")?.[1]?.trim();
  if (!token) {
    return refuse("DZ-E1003");
  }
  const url = Deno.env.get("SUPABASE_URL");
  const key = publishableKey();
  const serverKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key || !serverKey) {
    return refuse("DZ-E9003");
  }
  const admin = createClient(url, serverKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1. Who is calling, and are they an admin signed in with two-step verification?
  const { data: caller, error: callerError } = await admin.auth.getUser(token);
  if (callerError || !caller?.user?.id) {
    return refuse("DZ-E1003");
  }
  const check = await rpcAsCaller(url, key, token, "is_admin", {});
  if (!check.ok || check.body !== true) {
    return refuse("DZ-E5008");
  }

  const input = await readInput(req, {
    allowed: ["action", "reason", "user_id", "report_id", "listing_id", "photo_ids", "takedown_id"],
    required: ["action", "reason"],
    maxBytes: 16_384,
  });
  if (!input.ok) {
    return json(input.status, errorBody(input.code, input.message));
  }
  const body = input.body;
  const action = body.action;
  if (typeof body.reason !== "string" || body.reason.length > 500) {
    return refuse("DZ-E5007");
  }
  const reason = reasonOf(body.reason);
  if (!reason) {
    return refuse("DZ-E5006");
  }

  try {
    if (action === "ban" || action === "unban") {
      const userId = body?.user_id;
      const reportId = body?.report_id ?? null;
      if (typeof userId !== "string" || !UUID.test(userId) || (reportId !== null && (typeof reportId !== "string" || !UUID.test(reportId)))) {
        return refuse("DZ-E9016");
      }
      if (userId === caller.user.id) {
        return refuse("DZ-E5021");
      }
      // 2. The Auth ban: no sign-in and no token refresh until unbanned.
      const { error: banError } = await admin.auth.admin.updateUserById(userId, {
        ban_duration: action === "ban" ? BAN_DURATION : "none",
      });
      if (banError) {
        return refuse("DZ-E5024");
      }
      // 3. The database side, as the caller: suspension, listing holds, report outcome, admin log.
      const record = await rpcAsCaller(url, key, token, "admin_record_ban", {
        p_user_id: userId, p_banned: action === "ban", p_reason: reason, p_report_id: reportId,
      });
      if (!record.ok) {
        return json(errorStatus("DZ-E5025"), { ...errorBody("DZ-E5025"), auth_changed: true });
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
        return refuse("DZ-E9016");
      }
      // 2. The database removes the photo rows (and logs it), then the files go from Storage.
      const removed = await rpcAsCaller(url, key, token, "admin_remove_photos", {
        p_listing_id: listingId, p_photo_ids: photoIds, p_reason: reason, p_takedown_id: takedownId,
      });
      if (!removed.ok) {
        // The database's own plain sentence (for example "Photo not found on this listing") is
        // safe to show; anything else stays generic.
        // A database refusal starts with its catalog code ("DZ-E5034: Pick the photos to remove");
        // that code and the catalog's words are safe to show. Anything else stays generic.
        const code = codeOf((removed.body as { message?: unknown } | null)?.message);
        return code ? refuse(code) : refuse("DZ-E5035");
      }
      const paths = ((removed.body as { storage_paths?: unknown })?.storage_paths ?? []) as string[];
      if (paths.length > 0) {
        const { error: storageError } = await admin.storage.from(BUCKET).remove(paths);
        if (storageError) {
          return json(errorStatus("DZ-E5036"), { ...errorBody("DZ-E5036"), rows_removed: paths.length });
        }
      }
      console.log(JSON.stringify({ action, ok: true, files: paths.length }));
      return json(200, { ok: true, action, files_removed: paths.length });
    }

    return refuse("DZ-E5009");
  } catch {
    return refuse("DZ-E9999");
  }
});
