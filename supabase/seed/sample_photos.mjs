// Upload realistic sample listing photos to Dzirent Storage and database
// Runs as the test users through the normal API, exactly like client apps.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile(filePath) {
  const env = {};
  try {
    const content = readFileSync(filePath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
      }
    }
  } catch {
    // File may not exist if env vars are already set in process.env
  }
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

// 12 sample listings mapped to their folder slugs and expected owners
const SAMPLE_LISTINGS = [
  // Elena Rostova (User 1)
  {
    id: "c05269c8-dc62-4fe6-a1c2-68b0f2448d1c",
    slug: "silk-halter-evening-gown",
    title: "Silk Halter Evening Gown",
    ownerUser: 1,
  },
  {
    id: "3cd2a771-2f4e-4ee5-b0c5-18295ef5999f",
    slug: "tailored-charcoal-blazer",
    title: "Tailored Charcoal Blazer",
    ownerUser: 1,
  },
  {
    id: "2fe0cfa6-a95e-4994-bbe4-f1bfb6760490",
    slug: "emerald-velvet-cocktail-dress",
    title: "Emerald Velvet Cocktail Dress",
    ownerUser: 1,
  },
  {
    id: "0415cc17-423a-4232-b481-df74cec8e4ae",
    slug: "cashmere-belted-trench-coat",
    title: "Cashmere Belted Trench Coat",
    ownerUser: 1,
  },
  {
    id: "3f8b0763-cb28-46b3-a210-a18499de5b65",
    slug: "pleated-wide-leg-trousers",
    title: "Pleated Wide-Leg Trousers",
    ownerUser: 1,
  },
  {
    id: "a79481ab-8f15-426c-b9db-f704b09e94f0",
    slug: "linen-summer-sundress",
    title: "Linen Summer Sundress",
    ownerUser: 1,
  },

  // Maya Lin (User 2)
  {
    id: "a7417052-55ff-4cb8-b49d-054a69a6e719",
    slug: "embroidered-silk-lehenga-set",
    title: "Embroidered Silk Lehenga Set",
    ownerUser: 2,
  },
  {
    id: "80a55094-9699-4b7f-a55f-f3094c3dc526",
    slug: "modern-qipao-midi-dress",
    title: "Modern Qipao Midi Dress",
    ownerUser: 2,
  },
  {
    id: "49737980-7f0e-44bc-97bb-7b06914e9848",
    slug: "minimalist-wool-day-coat",
    title: "Minimalist Wool Day Coat",
    ownerUser: 2,
  },
  {
    id: "a87b4861-52a9-43ac-afdc-12a751c92d35",
    slug: "structured-silk-work-shirt",
    title: "Structured Silk Work Shirt",
    ownerUser: 2,
  },
  {
    id: "ed999629-5802-4a8b-abb5-67d35710f02c",
    slug: "vintage-denim-jumpsuit",
    title: "Vintage Denim Jumpsuit",
    ownerUser: 2,
  },
  {
    id: "32c885a9-a286-4fc4-a77e-2bae9fa0141b",
    slug: "satin-backless-maxi-dress",
    title: "Satin Backless Maxi Dress",
    ownerUser: 2,
  },
];

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`Sign in failed for a test user (no address shown): HTTP ${res.status} ${(await res.json().catch(() => ({}))).error_code ?? ""}`);
  }
  const data = await res.json();
  return { token: data.access_token, user: data.user };
}

function clientFor(token) {
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  return {
    async rest(subPath, options = {}) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${subPath}`, {
        ...options,
        headers: { ...headers, ...options.headers },
      });
      if (!res.ok) {
        throw new Error(`REST ${subPath} failed: ${res.status} ${await res.text()}`);
      }
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    },

    async uploadPhoto(listingId, filename, buffer) {
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/listing-photos/${listingId}/${filename}`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${token}`,
          "Content-Type": "image/jpeg",
        },
        body: buffer,
      });
      if (!res.ok) {
        throw new Error(`Upload photo failed: ${res.status} ${await res.text()}`);
      }
      return `${listingId}/${filename}`;
    },

    async deleteStoragePhotos(prefixes) {
      if (!prefixes || prefixes.length === 0) return;
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/listing-photos`, {
        method: "DELETE",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prefixes }),
      });
      if (!res.ok) {
        throw new Error(`Delete storage photos failed: ${res.status} ${await res.text()}`);
      }
    },
  };
}

async function updateListingPhotos(client, listing, imagesDir) {
  const slugDir = path.join(imagesDir, listing.slug);
  const frontPath = path.join(slugDir, "front.jpg");
  const backPath = path.join(slugDir, "back.jpg");

  const hasFront = existsSync(frontPath);
  const hasBack = existsSync(backPath);

  if (!hasFront && !hasBack) {
    console.log(`[${listing.slug}] No new photos found in ${slugDir}, skipping.`);
    return false;
  }

  console.log(`[${listing.slug}] Updating photos (front: ${hasFront}, back: ${hasBack})...`);

  // 1. Load existing photo records for this listing
  const existingPhotos = await client.rest(`listing_photos?listing_id=eq.${listing.id}&select=*`);

  // 2. Remove old photos from storage
  if (existingPhotos && existingPhotos.length > 0) {
    const oldPaths = existingPhotos.map((p) => p.storage_path).filter(Boolean);
    if (oldPaths.length > 0) {
      try {
        await client.deleteStoragePhotos(oldPaths);
        console.log(`  Removed ${oldPaths.length} old storage object(s).`);
      } catch (err) {
        console.warn(`  Warning removing old storage objects:`, err.message);
      }
    }

    // 3. Delete existing listing_photos rows
    await client.rest(`listing_photos?listing_id=eq.${listing.id}`, {
      method: "DELETE",
    });
    console.log(`  Deleted ${existingPhotos.length} existing listing_photo row(s).`);
  }

  // 4. Upload front photo
  if (hasFront) {
    const frontBuffer = readFileSync(frontPath);
    const frontRandomName = `${crypto.randomBytes(8).toString("hex")}.jpg`;
    const frontStoragePath = await client.uploadPhoto(listing.id, frontRandomName, frontBuffer);

    await client.rest("listing_photos", {
      method: "POST",
      body: JSON.stringify({
        listing_id: listing.id,
        storage_path: frontStoragePath,
        position: 0,
        slot: "front",
      }),
    });
    console.log(`  Uploaded front photo: ${frontStoragePath} (${frontBuffer.length} bytes)`);
  }

  // 5. Upload back photo
  if (hasBack) {
    const backBuffer = readFileSync(backPath);
    const backRandomName = `${crypto.randomBytes(8).toString("hex")}.jpg`;
    const backStoragePath = await client.uploadPhoto(listing.id, backRandomName, backBuffer);

    await client.rest("listing_photos", {
      method: "POST",
      body: JSON.stringify({
        listing_id: listing.id,
        storage_path: backStoragePath,
        position: 1,
        slot: "back",
      }),
    });
    console.log(`  Uploaded back photo: ${backStoragePath} (${backBuffer.length} bytes)`);
  }

  return true;
}

async function main() {
  console.log("Signing in as test users...");
  const u1 = await signIn(userEnv.TEST_USER_1_EMAIL, userEnv.TEST_USER_1_PASSWORD);
  const u2 = await signIn(userEnv.TEST_USER_2_EMAIL, userEnv.TEST_USER_2_PASSWORD);

  const client1 = clientFor(u1.token);
  const client2 = clientFor(u2.token);

  const imagesDir = path.join(__dirname, "images");
  console.log(`Reading images from: ${imagesDir}`);

  let updatedCount = 0;
  for (const listing of SAMPLE_LISTINGS) {
    const client = listing.ownerUser === 1 ? client1 : client2;
    const ok = await updateListingPhotos(client, listing, imagesDir);
    if (ok) updatedCount++;
  }

  console.log(`\nFinished: Updated ${updatedCount} / ${SAMPLE_LISTINGS.length} listings with realistic photos.`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
