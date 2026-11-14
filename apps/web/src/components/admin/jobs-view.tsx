"use client";

import { useState } from "react";
import { retryJobAction } from "@/lib/admin-actions";

/** C1: one background job kind's counts (admin_jobs_status). */
export type JobKindStatus = {
  kind: "send_push" | "scan_listing" | "stripe_deposit" | "stripe_refund" | "send_email";
  pending: number;
  running: number;
  done_day: number;
  dead: number;
  retrying: number;
  /** C5: jobs skipped in 24 h (emails while the provider key is blank). */
  skipped_day?: number;
};

export type JobsStatus = {
  kinds: JobKindStatus[];
  oldest_waiting_at: string | null;
  last_dead_at: string | null;
  schedule_minutes: number[];
  max_attempts: number;
};

/** A dead job (admin_list_dead_jobs): what it was for, never the push text. */
export type DeadJob = {
  id: number;
  kind: "send_push" | "scan_listing" | "stripe_deposit" | "stripe_refund" | "send_email";
  attempts: number;
  last_error: string | null;
  created_at: string;
  died_at: string | null;
  push_kind: string | null;
  conversation_id: string | null;
  scan_id: string | null;
  operation_id?: string | null;
  /** C5: which email (the template), never its address or text. */
  email_template?: string | null;
};

export const JOB_KIND_NAMES: Record<string, string> = {
  send_push: "Push notifications",
  scan_listing: "Photo checks",
  stripe_deposit: "Deposit holds",
  stripe_refund: "Refunds",
  send_email: "Emails",
};

function target(job: DeadJob) {
  if (job.kind === "send_push") return `${job.push_kind ?? "push"} · chat ${job.conversation_id?.slice(0, 8) ?? "?"}`;
  if (job.kind === "stripe_deposit" || job.kind === "stripe_refund") return `payment step ${job.operation_id?.slice(0, 8) ?? "?"}`;
  if (job.kind === "send_email") return `email ${job.email_template ?? "?"}`;
  return `check ${job.scan_id?.slice(0, 8) ?? "?"}`;
}

export function JobsView({ status, initialDead }: { status: JobsStatus | null; initialDead: DeadJob[] }) {
  const [dead, setDead] = useState<DeadJob[]>(initialDead);
  const [busy, setBusy] = useState<number | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  async function retry(job: DeadJob) {
    setBusy(job.id);
    setMessage(null);
    try {
      const result = await retryJobAction(job.id);
      setDead((rows) => rows.filter((r) => r.id !== job.id));
      setMessage({
        text: `Job ${job.id} started again (attempt ${result.attempts}, now ${result.status}).`,
        error: false,
      });
    } catch (e) {
      setMessage({ text: (e as Error).message, error: true });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="admin-jobs-view">
      <div className="admin-section-heading">
        <div>
          <h1>Background jobs</h1>
          <p className="muted">
            Push notifications, photo checks, payment steps and emails go out through a queue. A failed attempt is tried again after{" "}
            {(status?.schedule_minutes ?? [1, 5, 30, 120]).join(", ")} minutes; after{" "}
            {status?.max_attempts ?? 5} attempts the job is dead and waits here for a retry.
          </p>
        </div>
      </div>

      {status ? (
        <div className="admin-metrics-grid" style={{ margin: "20px 0" }}>
          {status.kinds.map((k) => (
            <div key={k.kind} className="admin-metric-card">
              <span className="metric-title">{JOB_KIND_NAMES[k.kind] ?? k.kind}</span>
              <strong className="metric-val">{k.dead}</strong>
              <small className="muted">
                dead · {k.pending} waiting ({k.retrying} retrying) · {k.running} sending · {k.done_day} done in 24 h{k.skipped_day ? ` · ${k.skipped_day} skipped (not set up)` : ""}
              </small>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">Job counts couldn&apos;t be loaded.</p>
      )}

      <h2 style={{ fontSize: "18px", margin: "28px 0 12px" }}>Dead jobs</h2>
      {message && (
        <p role={message.error ? "alert" : "status"} style={{ color: message.error ? "var(--danger, #c0392b)" : undefined }}>
          {message.text}
        </p>
      )}
      {dead.length === 0 ? (
        <p className="muted">No dead jobs.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Job</th>
                <th scope="col">Kind</th>
                <th scope="col">For</th>
                <th scope="col">Attempts</th>
                <th scope="col">Last error</th>
                <th scope="col">Died</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {dead.map((job) => (
                <tr key={job.id}>
                  <td>{job.id}</td>
                  <td>{JOB_KIND_NAMES[job.kind] ?? job.kind}</td>
                  <td>
                    <code>{target(job)}</code>
                  </td>
                  <td>{job.attempts}</td>
                  <td>{job.last_error ?? ""}</td>
                  <td>{job.died_at ? new Date(job.died_at).toLocaleString() : ""}</td>
                  <td>
                    <button
                      type="button"
                      className="button button-outline"
                      disabled={busy !== null}
                      onClick={() => retry(job)}
                      aria-label={`Retry job ${job.id}`}
                    >
                      {busy === job.id ? "Retrying…" : "Retry"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
