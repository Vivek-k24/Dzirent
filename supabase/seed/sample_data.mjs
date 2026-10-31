// Seed sample data for Dzirent
// Runs as the test users through the normal API, exactly like client apps.
import { readFileSync } from "node:fs";
import crypto from "node:crypto";

function loadEnvFile(path) {
  const env = {};
  try {
    const content = readFileSync(path, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
      }
    }
  } catch {
    // File may not exist if env vars are already set
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

// 1x1 valid JPEG
const PLACEHOLDER_JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
  0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
  0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
  0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
  0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
  0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01,
  0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04,
  0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
  0x00, 0xbe, 0x00, 0xff, 0xd9,
]);

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`Sign in failed for ${email}: ${res.status} ${await res.text()}`);
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
    async rest(path, options = {}) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        ...options,
        headers: { ...headers, ...options.headers },
      });
      if (!res.ok) {
        throw new Error(`REST ${path} failed: ${res.status} ${await res.text()}`);
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

    async deleteListing(listingId) {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-listing`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ listing_id: listingId }),
      });
      if (!res.ok) {
        throw new Error(`delete-listing failed: ${res.status} ${await res.text()}`);
      }
      return await res.json();
    },
  };
}

async function cleanPreviousListings(client, userId) {
  const existing = await client.rest(`listings?select=id&lender_id=eq.${userId}`);
  for (const item of existing ?? []) {
    await client.deleteListing(item.id);
  }
}

async function main() {
  console.log("Signing in test users...");
  const u1 = await signIn(userEnv.TEST_USER_1_EMAIL, userEnv.TEST_USER_1_PASSWORD);
  const u2 = await signIn(userEnv.TEST_USER_2_EMAIL, userEnv.TEST_USER_2_PASSWORD);
  const u3 = await signIn(userEnv.TEST_USER_3_EMAIL, userEnv.TEST_USER_3_PASSWORD);

  const c1 = clientFor(u1.token);
  const c2 = clientFor(u2.token);
  const c3 = clientFor(u3.token);

  console.log("Setting up Lender 1 profile (Studio Rostova)...");
  await c1.rest(`profiles?id=eq.${u1.user.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      display_name: "Elena Rostova",
      role: "lender",
      studio_name: "Studio Rostova",
      studio_handle: "studiorostova",
      studio_bio: "Curated eveningwear and contemporary designer pieces in Austin.",
      style_tags: ["Classic", "Vintage", "Glam"],
      city: "Austin, TX",
      approx_lat: 30.2672,
      approx_lng: -97.7431,
      pickup_area: "Downtown / South Congress",
      adult_confirmed: true,
    }),
  });

  console.log("Setting up Lender 2 profile (Atelier Maya)...");
  await c2.rest(`profiles?id=eq.${u2.user.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      display_name: "Maya Lin",
      role: "lender",
      studio_name: "Atelier Maya",
      studio_handle: "ateliermaya",
      studio_bio: "Silk, traditional fusion, and tailored professional garments.",
      style_tags: ["Traditional", "Workwear", "Designer"],
      city: "Austin, TX",
      approx_lat: 30.3072,
      approx_lng: -97.756,
      pickup_area: "Central Austin / Hyde Park",
      adult_confirmed: true,
    }),
  });

  console.log("Setting up Renter User 3 profile and private measurements...");
  await c3.rest(`profiles?id=eq.${u3.user.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      display_name: "Jordan Bell",
      role: "renter",
      city: "Austin, TX",
      approx_lat: 30.25,
      approx_lng: -97.75,
      adult_confirmed: true,
    }),
  });

  await c3.rest("private_profiles", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      user_id: u3.user.id,
      chest_cm: 90.0,
      waist_cm: 72.0,
      hips_cm: 96.0,
      shoulder_cm: 39.0,
      height_cm: 170.0,
      fit_profile: "woman",
      style_interests: ["Western formal", "Western casual", "East Asian"],
    }),
  });

  console.log("Cleaning previous listings for User 1 & User 2 via delete-listing...");
  await cleanPreviousListings(c1, u1.user.id);
  await cleanPreviousListings(c2, u2.user.id);

  console.log("Creating 12 sample active listings across categories (no Accessories)...");

  const today = new Date().toISOString().split("T")[0];
  const in90Days = new Date(Date.now() + 90 * 86400 * 1000).toISOString().split("T")[0];

  const user1Listings = [
    {
      title: "Silk Halter Evening Gown",
      category: "Occasion & Party",
      garment_type: "dress",
      size_label: "M / US 6",
      description: "Floor-length silk halter gown with an open back and delicate drape.",
      price_usd: 65,
      deposit_note: "Refundable deposit required upon pickup.",
      city: "Austin, TX",
      approx_lat: 30.2672,
      approx_lng: -97.7431,
      listing_styles: ["Western formal"],
      measurements: [
        { label: "Bust (flat)", value: 47.0, unit: "cm" },
        { label: "Waist (flat)", value: 37.5, unit: "cm" },
        { label: "Hips (flat)", value: 50.0, unit: "cm" },
      ],
    },
    {
      title: "Tailored Charcoal Blazer",
      category: "Career & Professional",
      garment_type: "suit",
      size_label: "M",
      description: "Italian wool blend tailored blazer with notched lapels and satin lining.",
      price_usd: 45,
      city: "Austin, TX",
      approx_lat: 30.2672,
      approx_lng: -97.7431,
      listing_styles: ["Western formal"],
      measurements: [
        { label: "Chest", value: 98.0, unit: "cm" },
        { label: "Waist", value: 78.0, unit: "cm" },
        { label: "Shoulder", value: 40.0, unit: "cm" },
      ],
    },
    {
      title: "Emerald Velvet Cocktail Dress",
      category: "Occasion & Party",
      garment_type: "dress",
      size_label: "S / US 4",
      description: "Deep emerald green velvet cocktail dress with structured shoulders.",
      price_usd: 55,
      city: "Austin, TX",
      approx_lat: 30.2672,
      approx_lng: -97.7431,
      listing_styles: ["Western formal"],
      measurements: [
        { label: "Bust", value: 88.0, unit: "cm" },
        { label: "Waist", value: 68.0, unit: "cm" },
      ],
    },
    {
      title: "Cashmere Belted Trench Coat",
      category: "Outerwear",
      garment_type: "top",
      size_label: "M",
      description: "Luxurious double-breasted cashmere and wool trench coat in camel.",
      price_usd: 75,
      city: "Austin, TX",
      approx_lat: 30.2672,
      approx_lng: -97.7431,
      listing_styles: ["Western formal", "Western casual"],
      measurements: [
        { label: "Chest", value: 105.0, unit: "cm" },
        { label: "Waist", value: 85.0, unit: "cm" },
        { label: "Shoulder", value: 41.5, unit: "cm" },
      ],
    },
    {
      title: "Pleated Wide-Leg Trousers",
      category: "Career & Professional",
      garment_type: "trousers",
      size_label: "US 6",
      description: "High-waisted wide-leg tailored trousers with front pleats.",
      price_usd: 30,
      city: "Austin, TX",
      approx_lat: 30.2672,
      approx_lng: -97.7431,
      listing_styles: ["Western casual"],
      measurements: [
        { label: "Waist (flat)", value: 37.0, unit: "cm" },
        { label: "Hips (flat)", value: 51.0, unit: "cm" },
      ],
    },
    {
      title: "Linen Summer Sundress",
      category: "Everyday",
      garment_type: "dress",
      size_label: "XS",
      description: "Breezy tiered linen sundress in terracotta.",
      price_usd: 14, // Under $15
      city: "Austin, TX",
      approx_lat: 30.2672,
      approx_lng: -97.7431,
      listing_styles: ["Western casual"],
      measurements: [
        { label: "Bust", value: 82.0, unit: "cm" },
        { label: "Waist", value: 62.0, unit: "cm" },
      ],
    },
  ];

  const user2Listings = [
    {
      title: "Embroidered Silk Lehenga Set",
      category: "Cultural & Traditional",
      garment_type: "skirt",
      size_label: "M / US 6",
      description: "Hand-embroidered zari silk lehenga with matching blouse and sheer dupatta.",
      price_usd: 85,
      city: "Austin, TX",
      approx_lat: 30.3072,
      approx_lng: -97.756,
      listing_styles: ["South Asian"],
      measurements: [
        { label: "Bust", value: 98.0, unit: "cm" },
        { label: "Waist", value: 78.0, unit: "cm" },
        { label: "Hips", value: 106.0, unit: "cm" },
      ],
    },
    {
      title: "Modern Qipao Midi Dress",
      category: "Cultural & Traditional",
      garment_type: "dress",
      size_label: "M",
      description: "Contemporary silk jacquard qipao with mandarin collar and side slit.",
      price_usd: 50,
      city: "Austin, TX",
      approx_lat: 30.3072,
      approx_lng: -97.756,
      listing_styles: ["East Asian"],
      measurements: [
        { label: "Chest", value: 96.0, unit: "cm" },
        { label: "Waist", value: 76.0, unit: "cm" },
        { label: "Hips", value: 104.0, unit: "cm" },
      ],
    },
    {
      title: "Minimalist Wool Day Coat",
      category: "Outerwear",
      garment_type: "top",
      size_label: "S",
      description: "Unstructured cocoon wool coat in heather grey.",
      price_usd: 60,
      city: "Austin, TX",
      approx_lat: 30.3072,
      approx_lng: -97.756,
      listing_styles: ["Western casual"],
      measurements: [
        { label: "Chest", value: 96.0, unit: "cm" },
        { label: "Waist", value: 76.0, unit: "cm" },
      ],
    },
    {
      title: "Structured Silk Work Shirt",
      category: "Career & Professional",
      garment_type: "top",
      size_label: "M",
      description: "Crisp mulberry silk button-down shirt with mother of pearl buttons.",
      price_usd: 28,
      city: "Austin, TX",
      approx_lat: 30.3072,
      approx_lng: -97.756,
      listing_styles: ["Western formal"],
      measurements: [
        { label: "Chest", value: 96.0, unit: "cm" },
        { label: "Shoulder", value: 40.5, unit: "cm" },
      ],
    },
    {
      title: "Vintage Denim Jumpsuit",
      category: "Everyday",
      garment_type: "one_size",
      size_label: "M",
      description: "Relaxed utility jumpsuit in vintage washed cotton denim.",
      price_usd: 12, // Under $15
      city: "Austin, TX",
      approx_lat: 30.3072,
      approx_lng: -97.756,
      listing_styles: ["Western casual"],
      measurements: [
        { label: "Chest", value: 98.0, unit: "cm" },
        { label: "Waist", value: 78.0, unit: "cm" },
        { label: "Hips", value: 104.0, unit: "cm" },
      ],
    },
    {
      title: "Satin Backless Maxi Dress",
      category: "Occasion & Party",
      garment_type: "dress",
      size_label: "L / US 10",
      description: "Champagne bias-cut satin gown with low cowl back.",
      price_usd: 70,
      city: "Austin, TX",
      approx_lat: 30.3072,
      approx_lng: -97.756,
      listing_styles: ["Western formal"],
      measurements: [
        { label: "Bust", value: 104.0, unit: "cm" },
        { label: "Waist", value: 86.0, unit: "cm" },
      ],
    },
  ];

  async function createListings(client, userId, listings) {
    for (const item of listings) {
      const { measurements, ...listingData } = item;
      const listingId = crypto.randomUUID();

      // 1. Insert listing
      await client.rest("listings", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          id: listingId,
          lender_id: userId,
          ...listingData,
          status: "active",
        }),
      });

      // 2. Upload placeholder photo to {listing_id}/{random}.jpg
      const photoName = `${crypto.randomBytes(8).toString("hex")}.jpg`;
      const storagePath = await client.uploadPhoto(listingId, photoName, PLACEHOLDER_JPEG);

      // 3. Insert listing_photo row
      await client.rest("listing_photos", {
        method: "POST",
        body: JSON.stringify({
          listing_id: listingId,
          storage_path: storagePath,
          position: 0,
          slot: "front",
        }),
      });

      // 4. Insert availability
      await client.rest("availability", {
        method: "POST",
        body: JSON.stringify({
          listing_id: listingId,
          start_date: today,
          end_date: in90Days,
        }),
      });

      // 5. Insert measurements
      if (measurements && measurements.length > 0) {
        await client.rest("listing_measurements", {
          method: "POST",
          body: JSON.stringify(
            measurements.map((m) => ({
              listing_id: listingId,
              label: m.label,
              value: m.value,
              unit: m.unit,
            })),
          ),
        });
      }
    }
  }

  await createListings(c1, u1.user.id, user1Listings);
  await createListings(c2, u2.user.id, user2Listings);

  console.log("Sample data setup complete! 12 active listings created.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
