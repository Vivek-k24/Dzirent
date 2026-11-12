// C2: uploads the files the local seed's listing_photos rows name (supabase/seed.sql), as each
// listing's owner through the Storage API, from supabase/seed/images/<slug>/{front,back}.jpg.
// LOCAL ONLY: refuses to run with --live. Re-running skips files that are already there.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { LIVE, REPO_ROOT, SUPABASE_URL, SUPABASE_KEY, userEnv } from "./config.mjs";

if (LIVE) {
  console.error("local_photos.mjs uploads seed photos to the LOCAL backend only.");
  process.exit(1);
}

const photosSource = readFileSync(join(REPO_ROOT, "supabase/seed/sample_photos.mjs"), "utf8");
const listings = [...photosSource.matchAll(/id: "([0-9a-f-]{36})",\s*slug: "([^"]+)",\s*title: "[^"]+",\s*ownerUser: (\d)/g)]
  .map((m) => ({ id: m[1], slug: m[2], owner: Number(m[3]) }));

async function signIn(n) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: userEnv[`TEST_USER_${n}_EMAIL`], password: userEnv[`TEST_USER_${n}_PASSWORD`] }),
  });
  if (!res.ok) throw new Error(`sign in test user ${n}: ${res.status}`);
  return (await res.json()).access_token;
}

export async function uploadSeedPhotos() {
  const tokens = { 1: await signIn(1), 2: await signIn(2) };
  let uploaded = 0;
  let present = 0;
  for (const l of listings) {
    for (const [side, file] of [["front", "front_local_sample.jpg"], ["back", "back_local_sample_.jpg"]]) {
      const dir = join(REPO_ROOT, "supabase/seed/images", l.slug);
      const bytes = existsSync(join(dir, `${side}.jpg`)) ? readFileSync(join(dir, `${side}.jpg`)) : readFileSync(join(dir, "front.jpg"));
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/listing-photos/${l.id}/${file}`, {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${tokens[l.owner]}`, "Content-Type": "image/jpeg" },
        body: bytes,
      });
      if (res.ok) uploaded++;
      else if (res.status === 409 || /exists/i.test(await res.text())) present++;
      else throw new Error(`upload ${l.id}/${file}: ${res.status}`);
    }
  }
  return { uploaded, present };
}

if (process.argv[1]?.endsWith("local_photos.mjs")) {
  uploadSeedPhotos().then((r) => console.log(`seed photos: ${r.uploaded} uploaded, ${r.present} already there`)).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
