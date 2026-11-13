import { Metadata } from "next";
import { serverClient } from "@/lib/supabase/server";
import { JobsView, type DeadJob, type JobsStatus } from "@/components/admin/jobs-view";

export const metadata: Metadata = {
  title: "Admin: Background jobs",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

/** C1: the outbox (app_private.async_jobs): counts, and the dead-letter list with Retry. */
export default async function AdminJobsPage() {
  const client = await serverClient();
  const [{ data: status }, { data: dead }] = await Promise.all([
    client.rpc("admin_jobs_status"),
    client.rpc("admin_list_dead_jobs", { p_limit: 50, p_offset: 0 }),
  ]);
  return <JobsView status={(status as JobsStatus | null) ?? null} initialDead={(dead as DeadJob[] | null) ?? []} />;
}
