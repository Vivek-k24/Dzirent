"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { decideIdVerificationAction, resetIdAttemptsAction, type IdReview } from "@/lib/admin-actions";
import { ActionDialog } from "./action-dialog";

type Pending = { row: IdReview; action: "approve" | "reject" | "reset" };

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "-");

/**
 * C6: ID checks in review and declined. Approve (verified, the badge) or reject (declined) with a
 * reason and a confirmation; reset attempts. Every action is in the audit log. The provider's console
 * holds the images; this page shows only the status, reason, attempts and dates.
 */
export function IdVerificationView({ rows }: { rows: IdReview[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const who = (r: IdReview) => r.studio_name || r.display_name || "Dzirent member";

  async function confirm(reason: string) {
    if (!pending) return;
    const { row, action } = pending;
    if (action === "reset") await resetIdAttemptsAction(row.user_id, reason);
    else await decideIdVerificationAction(row.user_id, action, reason);
    setMessage(
      action === "reset"
        ? `${who(row)} can start ${row.max_attempts} new checks.`
        : `${who(row)} is ${action === "approve" ? "verified" : "not verified"}.`,
    );
    router.refresh();
  }

  return (
    <div className="admin-id-verification-page">
      <div className="admin-section-heading">
        <div>
          <h1>ID verification</h1>
          <p className="muted">
            Checks in review (a possible duplicate account, or the verification provider&apos;s own review) and declined
            checks. Look at the session in the provider&apos;s console, then approve or reject here. No images or legal
            names are shown or kept by Dzirent.
          </p>
        </div>
      </div>
      {message && (
        <p role="status" className="form-message">
          {message}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="muted">Nothing to review.</p>
      ) : (
        <div style={{ overflowX: "auto", marginTop: "20px" }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Person</th>
                <th scope="col">Status</th>
                <th scope="col">Reason</th>
                <th scope="col">Attempts</th>
                <th scope="col">Dates</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.user_id}>
                  <td>
                    <strong>{who(r)}</strong>
                    {r.studio_handle && <div className="muted">@{r.studio_handle}</div>}
                    {r.session_id && (
                      <div className="muted" style={{ fontSize: "12px" }}>
                        Session <code>{r.session_id}</code>
                      </div>
                    )}
                  </td>
                  <td>
                    <span className="badge">{r.status === "in_review" ? "In review" : "Declined"}</span>
                  </td>
                  <td>{r.reason || "-"}</td>
                  <td>
                    {r.attempts} of {r.max_attempts}
                  </td>
                  <td style={{ fontSize: "12px" }}>
                    Started {when(r.created_at)}
                    <br />
                    Updated {when(r.updated_at)}
                  </td>
                  <td>
                    <div className="button-row" style={{ gap: "6px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="button compact"
                        onClick={() => setPending({ row: r, action: "approve" })}
                        aria-label={`Approve ${who(r)}`}
                      >
                        Approve
                      </button>
                      {r.status === "in_review" && (
                        <button
                          type="button"
                          className="button secondary compact"
                          onClick={() => setPending({ row: r, action: "reject" })}
                          aria-label={`Reject ${who(r)}`}
                        >
                          Reject
                        </button>
                      )}
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => setPending({ row: r, action: "reset" })}
                        aria-label={`Reset attempts for ${who(r)}`}
                      >
                        Reset attempts
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pending && (
        <ActionDialog
          title={
            pending.action === "approve"
              ? `Approve ${who(pending.row)}?`
              : pending.action === "reject"
                ? `Reject ${who(pending.row)}?`
                : `Reset attempts for ${who(pending.row)}?`
          }
          description={
            pending.action === "approve"
              ? "They become verified and get the Verified badge. Check the session in the verification provider's console first."
              : pending.action === "reject"
                ? "Their check becomes declined. They can try again while they have attempts left."
                : `They can start ${pending.row.max_attempts} new checks.`
          }
          actionLabel={pending.action === "approve" ? "Approve" : pending.action === "reject" ? "Reject" : "Reset attempts"}
          danger={pending.action === "reject"}
          onClose={() => setPending(null)}
          onConfirm={confirm}
        />
      )}
    </div>
  );
}
