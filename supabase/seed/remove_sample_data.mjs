// Removes the 12 sample listings that supabase/seed/sample_data.mjs created, with their photos.
// RUN ONLY WHEN THE OWNER SAYS SO (pranalika/contract.md, "Sample data").
//
// It signs in as each sample owner (test users 1 and 2, from H:\DziRent\secrets\test-user.env)
// and calls the delete-listing Edge Function for each of that owner's listings whose title is one
// of the 12 sample titles, exactly like the apps delete a listing: the function removes the photo
// files through the Storage API, then the listing row. Nothing else is touched: other listings,
// chats about other listings, and the accounts stay.
//
// Chats, saves and declarations about a sample listing go with it (the database's own cascade
// rules for a deleted listing).
//
// Run from the repo root:  node supabase/seed/remove_sample_data.mjs --yes
// Without --yes it only lists what it would delete.
import { readFileSync } from "node:fs";

function loadEnvFile(path) {
  const env = {};
  try {
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx !== -1) env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
  } catch {}
  return env;
}

const serverEnv = { ...loadEnvFile("H:/DziRent/secrets/dzirent-server.env"), ...process.env };
const userEnv = { ...loadEnvFile("H:/DziRent/secrets/test-user.env"), ...process.env };
const SUPABASE_URL = serverEnv.SUPABASE_URL?.replace(/\/$/, "");
const SUPABASE_KEY = serverEnv.SUPABASE_PUBLISHABLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY");
  process.exit(1);
}
const CONFIRMED = process.argv.includes("--yes");

// The sample listings, by owner, exactly as sample_data.mjs creates them.
const SAMPLES = {
  TEST_USER_1: [
    "Silk Halter Evening Gown", "Tailored Charcoal Blazer", "Emerald Velvet Cocktail Dress",
    "Cashmere Belted Trench Coat", "Pleated Wide-Leg Trousers", "Linen Summer Sundress",
  ],
  TEST_USER_2: [
    "Embroidered Silk Lehenga Set", "Modern Qipao Midi Dress", "Minimalist Wool Day Coat",
    "Structured Silk Work Shirt", "Vintage Denim Jumpsuit", "Satin Backless Maxi Dress",
  ],
};

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`sign-in failed (${res.status})`);
  const data = await res.json();
  return { token: data.access_token, id: data.user.id };
}

async function ownListings(owner, titles) {
  const query = new URLSearchParams({
    select: "id,title",
    lender_id: `eq.${owner.id}`,
    title: `in.(${titles.map((t) => `"${t}"`).join(",")})`,
  });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/listings?${query}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${owner.token}` },
  });
  if (!res.ok) throw new Error(`listing lookup failed (${res.status})`);
  return res.json();
}

async function deleteListing(owner, listingId) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-listing`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${owner.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ listing_id: listingId }),
  });
  return { ok: res.ok, status: res.status };
}

async function run() {
  console.log(CONFIRMED ? "Removing the sample listings..." : "Dry run (add --yes to delete). Would remove:");
  let found = 0;
  let removed = 0;
  for (const [who, titles] of Object.entries(SAMPLES)) {
    const owner = await signIn(userEnv[`${who}_EMAIL`], userEnv[`${who}_PASSWORD`]);
    const listings = await ownListings(owner, titles);
    found += listings.length;
    console.log(`  ${who.toLowerCase().replace("_", " ")}: ${listings.length} of ${titles.length} sample listings found`);
    for (const listing of listings) {
      if (!CONFIRMED) {
        console.log(`    would delete: ${listing.title}`);
        continue;
      }
      const result = await deleteListing(owner, listing.id);
      if (result.ok) removed += 1;
      console.log(`    ${result.ok ? "deleted" : `NOT deleted (${result.status})`}: ${listing.title}`);
    }
  }
  console.log(CONFIRMED ? `\nDone: ${removed} of ${found} deleted.` : `\nDry run: ${found} would be deleted.`);
  if (CONFIRMED && removed !== found) process.exit(1);
}

run().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});
