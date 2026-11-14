import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { readInput } from "../_shared/input.ts";
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

  // Takes no input: the account comes only from the verified token.
  const input = await readInput(req, { allowed: [], maxBytes: 1024, emptyIsObject: true });
  if (!input.ok) {
    return json(input.status, errorBody(input.code, input.message));
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    return refuse("DZ-E7011");
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // 1. Verify caller with Auth
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    const userId = authData?.user?.id;
    if (authError || !userId) {
      return refuse("DZ-E1003");
    }

    // 2. Refuse deletion while a rental is in progress (as renter or lender). C3: from accepted
    // until it is completed or cancelled; a request alone doesn't block. The database decides
    // (account_has_rental_in_progress, server key only).
    const { data: inProgress, error: rentalError } = await admin.rpc("account_has_rental_in_progress", {
      p_user: userId,
    });
    if (rentalError || typeof inProgress !== "boolean") {
      return refuse("DZ-E7012");
    }
    if (inProgress) {
      return refuse("DZ-E7010");
    }

    // 3. Delete the caller's listing photo folders through the Storage API first.
    // Listing photos are stored at {listing_id}/{random}.{ext}.
    const { data: listings, error: listingsError } = await admin
      .from("listings")
      .select("id")
      .eq("lender_id", userId);
    if (listingsError) {
      return refuse("DZ-E7013");
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
          return refuse("DZ-E7014");
        }
        if (files.length === 0) break;
        const { error: removeError } = await bucket.remove(
          files.map((file) => `${listing.id}/${file.name}`),
        );
        if (removeError) {
          return refuse("DZ-E7014");
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
    const email = authData.user.email ?? null;
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
      return refuse("DZ-E7015");
    }

    // 5. C5: the "your account was deleted" email to the address the account had, through the
    // outbox (send-email). The database keeps the address only until the email is sent or skipped.
    // A failure here never undoes or fails the deletion.
    if (email) {
      try {
        await admin.rpc("queue_account_deleted_email", { p_email: email });
      } catch {
        // The account is gone either way.
      }
    }

    return json(200, { ok: true });
  } catch {
    return refuse("DZ-E7015");
  }
});

