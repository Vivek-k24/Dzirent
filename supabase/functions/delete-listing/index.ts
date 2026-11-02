import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const BUCKET = "listing-photos";
const PAGE_SIZE = 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed", message: "Use POST." });
  }

  const authorization = req.headers.get("Authorization") ?? "";
  const token = /^Bearer\s+(.+)$/i.exec(authorization)?.[1]?.trim();
  if (!token) {
    return json(401, { error: "not_signed_in", message: "Please sign in again." });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !key) {
    return json(500, { error: "server_error", message: "Deletion is unavailable. Please try again." });
  }

  // All database and Storage requests run as the verified caller, under RLS.
  // No service-role credential is used by this function.
  const client = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: authData, error: authError } = await client.auth.getUser(token);
    if (authError || !authData.user) {
      return json(401, { error: "not_signed_in", message: "Please sign in again." });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "invalid_request", message: "Send a listing_id in a JSON object." });
    }
    const listingId = body && typeof body === "object" && "listing_id" in body
      ? body.listing_id
      : undefined;
    if (typeof listingId !== "string" || !UUID.test(listingId)) {
      return json(400, { error: "invalid_request", message: "A valid listing_id is required." });
    }

    const { data: listing, error: listingError } = await client
      .from("listings")
      .select("id,lender_id")
      .eq("id", listingId)
      .maybeSingle();
    if (listingError) {
      return json(500, { error: "server_error", message: "Couldn't load the listing. Please try again." });
    }
    if (!listing || listing.lender_id !== authData.user.id) {
      return json(404, { error: "listing_not_found", message: "Listing not found." });
    }

    // Remove every file in the listing's folder, including an upload whose
    // listing_photos insert failed. Always read the first page: deleting a page
    // before increasing an offset would skip files. Storage remove is limited
    // to 1000 paths per request. Never delete storage.objects directly.
    const bucket = client.storage.from(BUCKET);
    for (;;) {
      const { data: files, error: listError } = await bucket.list(listing.id, {
        limit: PAGE_SIZE,
        offset: 0,
        sortBy: { column: "name", order: "asc" },
      });
      if (listError || !files) {
        return json(503, { error: "photo_cleanup_failed", message: "Couldn't remove the photos. Please retry." });
      }
      if (files.length === 0) break;
      // Upload policies allow only {listing_id}/{random}.{ext}; a nested
      // folder is unexpected, so keep the listing rather than skip its files.
      if (files.some((file) => !file.id || file.name.includes("/"))) {
        return json(409, { error: "photo_cleanup_failed", message: "Couldn't remove all photos. Please retry." });
      }
      const { error: removeError } = await bucket.remove(
        files.map((file) => `${listing.id}/${file.name}`),
      );
      if (removeError) {
        return json(503, { error: "photo_cleanup_failed", message: "Couldn't remove the photos. Please retry." });
      }
    }

    // The database guard refuses deletion while any files remain. Its parent
    // row lock also serializes uploads, so a racing upload cannot be orphaned.
    const { error: deleteError } = await client.from("listings").delete().eq("id", listing.id);
    if (deleteError) {
      return json(409, {
        error: "listing_delete_failed",
        message: "Couldn't delete the listing. Stop uploading photos and retry.",
      });
    }
    return json(200, { ok: true });
  } catch {
    // Do not log tokens, request bodies, or upstream error payloads.
    return json(503, { error: "server_error", message: "Couldn't delete the listing. Please retry." });
  }
});
