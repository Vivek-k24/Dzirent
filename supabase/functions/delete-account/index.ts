import { createClient } from "npm:@supabase/supabase-js@2.45.4";

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
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    return json(500, {
      error: "server_error",
      message: "Account deletion is unavailable. Please try again.",
    });
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // 1. Verify caller with Auth
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    const userId = authData?.user?.id;
    if (authError || !userId) {
      return json(401, { error: "not_signed_in", message: "Please sign in again." });
    }

    // 2. Refuse deletion while having active rentals (as renter or lender)
    const { count, error: rentalError } = await admin
      .from("rentals")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .or(`renter_id.eq.${userId},lender_id.eq.${userId}`);
    if (rentalError) {
      return json(500, {
        error: "server_error",
        message: "Couldn't verify rental status. Please try again.",
      });
    }
    if ((count ?? 0) > 0) {
      return json(409, {
        error: "active_rental",
        message:
          "You have an active rental. In its chat, mark it as returned (or that the deal didn't happen), then delete your account.",
      });
    }

    // 3. Delete the caller's listing photo folders through the Storage API first.
    // Listing photos are stored at {listing_id}/{random}.{ext}.
    const { data: listings, error: listingsError } = await admin
      .from("listings")
      .select("id")
      .eq("lender_id", userId);
    if (listingsError) {
      return json(500, {
        error: "server_error",
        message: "Couldn't load your listings. Please try again.",
      });
    }

    const bucket = admin.storage.from(BUCKET);
    for (const listing of listings ?? []) {
      for (;;) {
        const { data: files, error: listError } = await bucket.list(listing.id, {
          limit: PAGE_SIZE,
          offset: 0,
          sortBy: { column: "name", order: "asc" },
        });
        if (listError || !files) {
          return json(503, {
            error: "photo_cleanup_failed",
            message: "Couldn't remove listing photos. Please retry.",
          });
        }
        if (files.length === 0) break;
        const { error: removeError } = await bucket.remove(
          files.map((file) => `${listing.id}/${file.name}`),
        );
        if (removeError) {
          return json(503, {
            error: "photo_cleanup_failed",
            message: "Couldn't remove listing photos. Please retry.",
          });
        }
      }
    }

    // Also remove legacy user folder if present
    for (;;) {
      const { data: userFiles, error: userListError } = await bucket.list(userId, {
        limit: PAGE_SIZE,
        offset: 0,
      });
      if (userListError || !userFiles || userFiles.length === 0) break;
      await bucket.remove(userFiles.map((f) => `${userId}/${f.name}`));
    }

    // 4. Delete the auth user. Database foreign keys CASCADE all user data.
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
      return json(500, {
        error: "server_error",
        message: "Couldn't delete your account. Please try again.",
      });
    }

    return json(200, { ok: true });
  } catch {
    return json(500, {
      error: "server_error",
      message: "Couldn't delete your account. Please retry.",
    });
  }
});

