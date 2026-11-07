// P3B cleanup-files: the two cleanup jobs that delete photo files.
//
// Called only by the database (app_private.request_file_cleanup, nightly through pg_cron and
// pg_net) with the shared secret in x-cleanup-secret. Apps never call it.
//
// 1. cleanup_file_plan() says what may go, and whether each job deletes or only counts.
// 2. abandoned_drafts: listings never published and not edited for the retention period. In
//    delete mode each listing's photo folder is emptied through the Storage API, then the listing
//    row is deleted, the same way delete-listing does it (the database refuses to delete a
//    listing whose folder still has files).
// 3. orphan_photos: files with no photo row. In delete mode they are removed through the Storage API.
// 4. Each job's run (mode, counts, errors) is recorded with cleanup_record_run.
// Storage rows are never deleted directly.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const BUCKET = "listing-photos";
const PAGE_SIZE = 1000;
const REMOVE_BATCH = 100;

/** Compares in constant time, so the secret can't be guessed one byte at a time. */
function sameSecret(given: string, expected: string): boolean {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

type Plan = {
  abandoned_drafts: { delete: boolean; listings: { id: string; files: number }[] };
  orphan_photos: { delete: boolean; paths: string[] };
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const secret = Deno.env.get("CLEANUP_FILES_SECRET");
  if (!secret || !sameSecret(req.headers.get("x-cleanup-secret") ?? "", secret)) {
    return json(401, { error: "not_allowed" });
  }
  const url = Deno.env.get("SUPABASE_URL");
  const serverKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serverKey) return json(500, { error: "not_configured" });
  const admin = createClient(url, serverKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const bucket = admin.storage.from(BUCKET);

  const record = async (job: string, mode: string, counts: Record<string, unknown> | null, error: string | null, startedAt: string) => {
    await admin.rpc("cleanup_record_run", {
      p_job: job, p_mode: mode, p_counts: counts, p_error: error, p_started_at: startedAt,
    });
  };

  const started = new Date().toISOString();
  const { data, error: planError } = await admin.rpc("cleanup_file_plan");
  if (planError || !data) {
    const message = `plan failed: ${planError?.code ?? "no data"}`;
    await record("abandoned_drafts", "count", null, message, started);
    await record("orphan_photos", "count", null, message, started);
    return json(500, { error: "plan_failed" });
  }
  const plan = data as Plan;
  const result: Record<string, unknown> = {};

  // Abandoned drafts.
  {
    const job = plan.abandoned_drafts;
    const mode = job.delete ? "delete" : "count";
    const counts = {
      listings: job.listings.length,
      photos: job.listings.reduce((n, l) => n + Number(l.files ?? 0), 0),
      deleted_listings: 0,
      deleted_photos: 0,
    };
    const errors: string[] = [];
    if (job.delete) {
      for (const listing of job.listings) {
        try {
          // Empty the listing's folder through the Storage API, like delete-listing.
          for (;;) {
            const { data: files, error: listError } = await bucket.list(listing.id, {
              limit: PAGE_SIZE, offset: 0, sortBy: { column: "name", order: "asc" },
            });
            if (listError || !files) throw new Error("list failed");
            if (files.length === 0) break;
            const paths = files.map((f) => `${listing.id}/${f.name}`);
            const { error: removeError } = await bucket.remove(paths);
            if (removeError) throw new Error("remove failed");
            counts.deleted_photos += paths.length;
          }
          const { error: deleteError } = await admin.from("listings").delete().eq("id", listing.id);
          if (deleteError) throw new Error(`listing delete failed: ${deleteError.code ?? ""}`);
          counts.deleted_listings += 1;
        } catch (e) {
          errors.push(`${listing.id}: ${(e as Error).message}`);
        }
      }
    }
    await record("abandoned_drafts", mode, counts, errors.length ? errors.slice(0, 10).join("; ") : null, started);
    result.abandoned_drafts = { mode, ...counts, errors: errors.length };
  }

  // Orphan photos.
  {
    const job = plan.orphan_photos;
    const mode = job.delete ? "delete" : "count";
    const counts = { files: job.paths.length, deleted_files: 0 };
    const errors: string[] = [];
    if (job.delete) {
      for (let i = 0; i < job.paths.length; i += REMOVE_BATCH) {
        const batch = job.paths.slice(i, i + REMOVE_BATCH);
        const { error: removeError } = await bucket.remove(batch);
        if (removeError) errors.push(`batch ${i / REMOVE_BATCH + 1}: remove failed`);
        else counts.deleted_files += batch.length;
      }
    }
    await record("orphan_photos", mode, counts, errors.length ? errors.join("; ") : null, started);
    result.orphan_photos = { mode, ...counts, errors: errors.length };
  }

  return json(200, { ok: true, ...result });
});
