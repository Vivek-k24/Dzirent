import { readFileSync } from "node:fs";

function loadEnvFile(path) {
  const env = {};
  try {
    const content = readFileSync(path, "utf8");
    for (const line of content.split(/\r?\n/)) {
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

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Sign in failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return { token: data.access_token, user: data.user };
}

async function getListings(token, userId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/listings?lender_id=eq.${userId}&select=id,title,category,garment_type,status,price_usd,city,created_at&order=created_at.asc`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${token}`,
      },
    }
  );
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${await res.text()}`);
  return await res.json();
}

async function main() {
  const u1 = await signIn(userEnv.TEST_USER_1_EMAIL, userEnv.TEST_USER_1_PASSWORD);
  const u2 = await signIn(userEnv.TEST_USER_2_EMAIL, userEnv.TEST_USER_2_PASSWORD);

  const l1 = await getListings(u1.token, u1.user.id);
  const l2 = await getListings(u2.token, u2.user.id);

  console.log("--- USER 1 (Elena Rostova / Studio Rostova) ---");
  for (const l of l1) {
    console.log(`[${l.id}] ${l.title} | Cat: ${l.category} | GarmentType: ${l.garment_type} | Owner: User 1`);
  }

  console.log("\n--- USER 2 (Maya Lin / Atelier Maya) ---");
  for (const l of l2) {
    console.log(`[${l.id}] ${l.title} | Cat: ${l.category} | GarmentType: ${l.garment_type} | Owner: User 2`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
