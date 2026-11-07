import Link from "next/link";
import { serverClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";



type Metrics = {
  users: number;
  new_users_week: number;
  active_listings: number;
  messages_week: number;
  suspended_users: number;
  open_reports: number;
  scans_week: Record<string, number>;
};

type Queues = {
  open_reports: number;
  scans_in_review: number;
  open_takedowns: number;
  id_verification_reviews: number;
};

/** One cleanup job (P3B): its switch and its last run. */
type CleanupJob = {
  job: string;
  description: string | null;
  deletes: boolean;
  last_run: {
    mode: "count" | "delete";
    counts: Record<string, number> | null;
    error: string | null;
    finished_at: string;
  } | null;
};

const JOB_NAMES: Record<string, string> = {
  abandoned_drafts: "Abandoned drafts",
  orphan_photos: "Orphan photos",
  old_photo_checks: "Old photo checks",
  expired_reports: "Expired reports",
  old_data_exports: "Download records",
  old_age_checks: "Old age checks",
  old_suggestion_choices: "Suggestion choices",
  old_declarations: "Old declarations",
  stale_device_tokens: "Stale device tokens",
};

function countsText(counts: Record<string, number> | null) {
  if (!counts) return "No counts";
  return Object.entries(counts)
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
    .join(", ");
}

export default async function AdminOverviewPage() {
  const client = await serverClient();
  const [{ data: metricsRaw }, { data: queuesRaw }, { data: cleanupRaw }] = await Promise.all([
    client.rpc("admin_metrics"),
    client.rpc("admin_queues"),
    client.rpc("admin_cleanup_status"),
  ]);
  const cleanup = (cleanupRaw || []) as CleanupJob[];

  const metrics = (metricsRaw || {}) as Metrics;
  const queues = (queuesRaw || {}) as Queues;
  const scans = metrics.scans_week || {};

  return (
    <div className="admin-overview">
      <div className="admin-section-heading">
        <div>
          <h1>Operations overview</h1>
          <p className="muted">Live marketplace health and moderation queues</p>
        </div>
      </div>

      <div className="admin-queues-grid" style={{ margin: "24px 0" }}>
        <Link href="/admin/reports" className="admin-queue-card">
          <div className="queue-top">
            <span className="queue-label">Open reports</span>
            <span className="queue-count highlight">{queues.open_reports ?? 0}</span>
          </div>
          <p className="muted">Reports waiting for action</p>
        </Link>

        <Link href="/admin/photo-reviews" className="admin-queue-card">
          <div className="queue-top">
            <span className="queue-label">Photo reviews</span>
            <span className="queue-count highlight">{queues.scans_in_review ?? 0}</span>
          </div>
          <p className="muted">Listings with uncertain scan verdicts</p>
        </Link>

        <Link href="/admin/takedowns" className="admin-queue-card">
          <div className="queue-top">
            <span className="queue-label">Takedowns</span>
            <span className="queue-count">{queues.open_takedowns ?? 0}</span>
          </div>
          <p className="muted">DMCA and copyright requests</p>
        </Link>

        <Link href="/admin/id-verification" className="admin-queue-card">
          <div className="queue-top">
            <span className="queue-label">ID reviews</span>
            <span className="queue-count">0</span>
          </div>
          <p className="muted">Not active yet (P6A)</p>
        </Link>
      </div>

      <div className="admin-metrics-container">
        <h2 style={{ fontSize: "20px", margin: "32px 0 16px" }}>Platform metrics</h2>
        <div className="admin-metrics-grid">
          <div className="admin-metric-card">
            <span className="metric-title">Total registered users</span>
            <strong className="metric-val">{metrics.users ?? 0}</strong>
            <small className="muted">+{metrics.new_users_week ?? 0} past 7 days</small>
          </div>

          <div className="admin-metric-card">
            <span className="metric-title">Active listings</span>
            <strong className="metric-val">{metrics.active_listings ?? 0}</strong>
            <small className="muted">Currently in shop window</small>
          </div>

          <div className="admin-metric-card">
            <span className="metric-title">Messages sent (7 days)</span>
            <strong className="metric-val">{metrics.messages_week ?? 0}</strong>
            <small className="muted">In-app chat activity</small>
          </div>

          <div className="admin-metric-card">
            <span className="metric-title">Suspended users</span>
            <strong className="metric-val">{metrics.suspended_users ?? 0}</strong>
            <small className="muted">Currently suspended or banned</small>
          </div>
        </div>

        <div className="admin-card" style={{ marginTop: "24px", padding: "20px", border: "1px solid var(--line)", borderRadius: "8px", background: "var(--paper)" }}>
          <h3 style={{ fontSize: "16px", margin: "0 0 12px" }}>Photo scans (past 7 days)</h3>
          <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
            <div>
              <span className="muted" style={{ display: "block", fontSize: "12px" }}>Allowed</span>
              <strong style={{ fontSize: "20px", color: "#16a34a" }}>{scans.allowed ?? 0}</strong>
            </div>
            <div>
              <span className="muted" style={{ display: "block", fontSize: "12px" }}>Review required</span>
              <strong style={{ fontSize: "20px", color: "var(--accent, #8e1538)" }}>{scans.review ?? 0}</strong>
            </div>
            <div>
              <span className="muted" style={{ display: "block", fontSize: "12px" }}>Rejected</span>
              <strong style={{ fontSize: "20px", color: "var(--danger, #d32f2f)" }}>{scans.rejected ?? 0}</strong>
            </div>
            {scans.running !== undefined && (
              <div>
                <span className="muted" style={{ display: "block", fontSize: "12px" }}>In progress</span>
                <strong style={{ fontSize: "20px" }}>{scans.running}</strong>
              </div>
            )}
          </div>
        </div>

        <div className="admin-card" style={{ marginTop: "24px", padding: "20px", border: "1px solid var(--line)", borderRadius: "8px", background: "var(--paper)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "12px", flexWrap: "wrap" }}>
            <h3 style={{ fontSize: "16px", margin: "0 0 4px" }}>Cleanup jobs</h3>
            <Link href="/admin/flags" className="muted" style={{ fontSize: "13px" }}>
              Switch a job to deleting on the Flags page
            </Link>
          </div>
          <p className="muted" style={{ fontSize: "13px", margin: "0 0 14px" }}>
            Nightly. A job that only counts reports what it would delete and deletes nothing.
          </p>
          {cleanup.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>Cleanup status couldn&apos;t be loaded.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "12px" }}>
              {cleanup.map((j) => (
                <div key={j.job} style={{ border: "1px solid var(--line)", borderRadius: "6px", padding: "12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center" }}>
                    <strong style={{ fontSize: "14px" }}>{JOB_NAMES[j.job] || j.job}</strong>
                    <span
                      className="badge"
                      style={{ background: j.deletes ? "#c0392b" : "#7f8c8d", color: "#fff" }}
                    >
                      {j.deletes ? "Deletes" : "Counts only"}
                    </span>
                  </div>
                  {j.last_run ? (
                    <>
                      <div className="muted" style={{ fontSize: "12px", marginTop: "6px" }}>
                        Last run {new Date(j.last_run.finished_at).toLocaleString()} (
                        {j.last_run.mode === "delete" ? "deleted" : "counted"})
                      </div>
                      <div style={{ fontSize: "13px", marginTop: "4px" }}>{countsText(j.last_run.counts)}</div>
                      {j.last_run.error && (
                        <div style={{ fontSize: "12px", marginTop: "4px", color: "#c0392b" }}>
                          Error: {j.last_run.error}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="muted" style={{ fontSize: "12px", marginTop: "6px" }}>Not run yet</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
