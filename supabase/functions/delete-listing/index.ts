import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { readInput, UUID } from "../_shared/input.ts";
import { errorBody, errorStatus } from "../_shared/errors.ts";

const BUCKET = "listing-photos";
const PAGE_SIZE = 1000;
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return refuse("DZ-E9005");
  }

  const authorization = req.headers.get("Authorization") ?? "";
  const token = /^Bearer\s+(.+)$/i.exec(authorization)?.[1]?.trim();
  if (!token) {
    return refuse("DZ-E1003");
  }

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !key) {
    return refuse("DZ-E2005");
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
      return refuse("DZ-E1003");
    }

    const input = await readInput(req, { allowed: ["listing_id"], required: ["listing_id"], maxBytes: 1024 });
    if (!input.ok) {
      return json(input.status, errorBody(input.code, input.message));
    }
    const listingId = input.body.listing_id;
    if (typeof listingId !== "string" || !UUID.test(listingId)) {
      return refuse("DZ-E2003");
    }

    const { data: listing, error: listingError } = await client
      .from("listings")
      .select("id,lender_id")
      .eq("id", listingId)
      .maybeSingle();
    if (listingError) {
      return refuse("DZ-E2004");
    }
    if (!listing || listing.lender_id !== authData.user.id) {
      return refuse("DZ-E2002");
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
        return refuse("DZ-E2066");
      }
      if (files.length === 0) break;
      // Upload policies allow only {listing_id}/{random}.{ext}; a nested
      // folder is unexpected, so keep the listing rather than skip its files.
      if (files.some((file) => !file.id || file.name.includes("/"))) {
        return refuse("DZ-E2067");
      }
      const { error: removeError } = await bucket.remove(
        files.map((file) => `${listing.id}/${file.name}`),
      );
      if (removeError) {
        return refuse("DZ-E2066");
      }
    }

    // The database guard refuses deletion while any files remain. Its parent
    // row lock also serializes uploads, so a racing upload cannot be orphaned.
    const { error: deleteError } = await client.from("listings").delete().eq("id", listing.id);
    if (deleteError) {
      return refuse("DZ-E2006");
    }
    return json(200, { ok: true });
  } catch {
    // Do not log tokens, request bodies, or upstream error payloads.
    return refuse("DZ-E2007");
  }
});
