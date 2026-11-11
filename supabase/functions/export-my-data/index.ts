// P3A "Download my data": one JSON file of everything Dzirent holds about the caller.
//
// 1. Verifies the caller's token with Supabase Auth, in code (verify_jwt is off, like delete-account).
// 2. Calls export_my_data() as the caller (their own token), so the database builds the export
//    from auth.uid() only and enforces once per 24 hours. This function holds no server key and
//    can't read anyone else's data.
// 3. Adds the plain-language "about" part and public links to the caller's own photos, and
//    returns the file (Content-Disposition: dzirent-data-<date>.json).
// Errors are JSON { error, message } with the same plain sentence in both fields.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { readInput } from "../_shared/input.ts";
import { codeOf, errorBody, errorStatus } from "../_shared/errors.ts";

const BUCKET = "listing-photos";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "content-disposition",
};

/** C1: an error as { code, message } with the catalog status (contracts/error-codes.json). */
function fail(code: string, message?: string): Response {
  return new Response(JSON.stringify(errorBody(code, message)), {
    status: errorStatus(code),
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

type Photo = { storage_path?: string | null; [key: string]: unknown };
type Listing = { photos?: Photo[]; [key: string]: unknown };
type Export = Record<string, unknown> & { listings?: Listing[] };

/** What each part of the file is, in plain words. */
const ABOUT = {
  what_this_is:
    "This file holds the information Dzirent keeps about you, as it was when you downloaded it. " +
    "Other people appear only by the name and studio handle everyone already sees, never their " +
    "email, location, measurements or other private details.",
  photo_links:
    "Each listing photo has a link. These are the public web addresses of your own listing photos; " +
    "anyone with the link can open them, as with every listing photo on Dzirent.",
  how_often: "You can download your data once a day.",
  parts: {
    account: "The email you sign in with, when you created your account, and when you last signed in. Your password is never readable, so it isn't here.",
    profile: "Your profile and studio: names, handle, role, city, approximate location (rounded), bio, style tags, pickup area, your 18+ confirmation and any suspension.",
    private_profile: "Your private body measurements, when you consented to them, your fit profile and style interests. Nobody else sees these.",
    listings: "Your listings with their details, garment measurements, available dates, photos (with links) and the automatic photo checks with their results.",
    saved_pieces: "Pieces you saved. The title is shown while the piece is still public.",
    saved_studios: "Studios you saved, by name and handle.",
    chats: "Every chat you are part of, with all its messages. The other person is shown only by their name and handle.",
    rentals: "Rentals arranged in your chats.",
    blocked_people: "People you blocked, by name and handle.",
    reports_filed: "Reports you made, with your reason and details. Reports other people made about you are not included.",
    warnings: "Warnings Dzirent sent you.",
    accessory_declarations: "Accessory declarations you signed: your legal name, email, city, app version, IP address, browser or app, and time.",
    listing_declarations: "Per-listing declarations you signed.",
    legal_acceptances: "Which versions of the Terms of Use and Privacy Policy you agreed to, and when.",
    age_checks: "Age checks: the answer (18 or older, under 18, or no answer), where it came from, and when. Never a birthdate.",
    notification_settings: "Your notification choices.",
    devices: "The kinds of phone registered for your notifications, and when. Not the phones' notification codes.",
    suggestion_choices: "Whether you kept, changed or cleared the suggestions filled in from your photos.",
    listing_activity: "Listings you viewed, saved or messaged about in the apps.",
    earlier_exports: "When you downloaded your data before.",
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return fail("DZ-E9005");

  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get("Authorization") ?? "")?.[1]?.trim();
  if (!token) return fail("DZ-E1003");

  // Takes no input ({} or nothing): the export comes only from the caller's token.
  const input = await readInput(req, { allowed: [], maxBytes: 1024, emptyIsObject: true });
  if (!input.ok) return fail(input.code, input.message);

  const url = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  const key = publishableKey();
  if (!url || !key) return fail("DZ-E7003");

  try {
    // 1. Who is calling.
    const auth = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: caller, error: callerError } = await auth.auth.getUser(token);
    if (callerError || !caller?.user?.id) return fail("DZ-E1003");

    // 2. The export, built by the database as the caller.
    const response = await fetch(`${url}/rest/v1/rpc/export_my_data`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: "{}",
    });
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (!response.ok) {
      const said = (body as { message?: string } | null)?.message ?? "";
      // The database's sentence for once a day carries the time: "DZ-E7001: You can download ...".
      if (codeOf(said) === "DZ-E7001") return fail("DZ-E7001", said.replace(/^DZ-E7001:\s*/, ""));
      if (response.status === 401 || response.status === 403) return fail("DZ-E1003");
      return fail("DZ-E7002");
    }
    const data = (body ?? {}) as Export;

    // 3. Photo links, then the file in a fixed order with "about" first.
    const photoLink = (path: string) =>
      `${url}/storage/v1/object/public/${BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
    const listings = (data.listings ?? []).map((listing) => ({
      ...listing,
      photos: (listing.photos ?? []).map((photo) => ({
        ...photo,
        link: photo.storage_path ? photoLink(photo.storage_path) : null,
      })),
    }));
    const now = new Date();
    const file: Record<string, unknown> = {
      about: ABOUT,
      exported_at: now.toISOString(),
    };
    for (const part of Object.keys(ABOUT.parts)) {
      file[part] = part === "listings" ? listings : (data[part] ?? null);
    }

    const date = now.toISOString().slice(0, 10);
    return new Response(JSON.stringify(file, null, 2), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="dzirent-data-${date}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return fail("DZ-E7002");
  }
});
