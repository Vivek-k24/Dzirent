"use client";

import { useState } from "react";
import { photoUrl } from "@/lib/supabase/config";
import { ActionDialog } from "./action-dialog";
import {
  dismissReportAction,
  warnUserAction,
  removeReportedContentAction,
  suspendUserAction,
  unsuspendUserAction,
  banUserAction,
  unbanUserAction,
} from "@/lib/admin-actions";

export type ReportRow = {
  id: string;
  created_at: string;
  status: "open" | "closed";
  target_type: "message" | "listing" | "profile" | "user";
  target_id: string;
  target_user_id: string;
  reason: string;
  details: string | null;
  outcome: string | null;
  outcome_note: string | null;
  closed_at: string | null;
  closed_by: string | null;
  reporter_id: string | null;
  reporter_handle: string | null;
  reporter_name: string | null;
  target_handle: string | null;
  target_name: string | null;
  evidence: Record<string, unknown> | null;
  evidence_captured_at: string | null;
};

export function ReportsView({ initialReports }: { initialReports: ReportRow[] }) {
  const [reports, setReports] = useState(initialReports);
  const [filter, setFilter] = useState<"open" | "closed">("open");
  const [selectedReport, setSelectedReport] = useState<ReportRow | null>(null);

  // Dialog action state
  const [actionType, setActionType] = useState<
    "dismiss" | "warn" | "remove_content" | "suspend" | "unsuspend" | "ban" | "unban" | null
  >(null);
  const [suspendDays, setSuspendDays] = useState(7);

  const displayed = reports.filter((r) => r.status === filter);

  function handleActionClose() {
    setActionType(null);
  }

  async function handleDismiss(reason: string) {
    if (!selectedReport) return;
    await dismissReportAction(selectedReport.id, reason);
    setReports((prev) =>
      prev.map((r) =>
        r.id === selectedReport.id
          ? { ...r, status: "closed", outcome: "dismissed", outcome_note: reason }
          : r,
      ),
    );
    setSelectedReport(null);
  }

  async function handleWarn(reason: string) {
    if (!selectedReport) return;
    await warnUserAction(selectedReport.target_user_id, reason, selectedReport.id);
    setReports((prev) =>
      prev.map((r) =>
        r.id === selectedReport.id
          ? { ...r, status: "closed", outcome: "warned", outcome_note: reason }
          : r,
      ),
    );
    setSelectedReport(null);
  }

  async function handleRemoveContent(reason: string) {
    if (!selectedReport) return;
    await removeReportedContentAction(selectedReport.id, reason);
    setReports((prev) =>
      prev.map((r) =>
        r.id === selectedReport.id
          ? { ...r, status: "closed", outcome: "content_removed", outcome_note: reason }
          : r,
      ),
    );
    setSelectedReport(null);
  }

  async function handleSuspend(reason: string) {
    if (!selectedReport) return;
    await suspendUserAction(selectedReport.target_user_id, suspendDays, reason, selectedReport.id);
    setReports((prev) =>
      prev.map((r) =>
        r.id === selectedReport.id
          ? { ...r, status: "closed", outcome: "suspended", outcome_note: reason }
          : r,
      ),
    );
    setSelectedReport(null);
  }

  async function handleUnsuspend(reason: string) {
    if (!selectedReport) return;
    await unsuspendUserAction(selectedReport.target_user_id, reason);
  }

  async function handleBan(reason: string) {
    if (!selectedReport) return;
    await banUserAction(selectedReport.target_user_id, reason, selectedReport.id);
    setReports((prev) =>
      prev.map((r) =>
        r.id === selectedReport.id
          ? { ...r, status: "closed", outcome: "banned", outcome_note: reason }
          : r,
      ),
    );
    setSelectedReport(null);
  }

  async function handleUnban(reason: string) {
    if (!selectedReport) return;
    await unbanUserAction(selectedReport.target_user_id, reason, selectedReport.id);
  }

  function renderEvidence(report: ReportRow) {
    const e = report.evidence;
    if (!e) return <p className="muted">No evidence snapshot recorded.</p>;

    // Message evidence
    if (e.message || report.target_type === "message") {
      const msg = e.message as Record<string, unknown> | undefined;
      const before = (e.before as Array<Record<string, unknown>>) || [];
      const after = (e.after as Array<Record<string, unknown>>) || [];
      return (
        <div className="admin-evidence-box">
          <h4>Chat conversation snapshot</h4>
          <div className="chat-evidence-log" style={{ display: "flex", flexDirection: "column", gap: "8px", margin: "12px 0" }}>
            {before.map((m, idx) => (
              <div key={idx} className="evidence-message-row" style={{ padding: "8px", background: "var(--paper)", borderRadius: "6px" }}>
                <span className="muted" style={{ fontSize: "11px" }}>
                  {m.sender_name ? String(m.sender_name) : "User"} (@{String(m.sender_handle || "user")}) · {new Date(String(m.created_at)).toLocaleTimeString()}:
                </span>
                <p style={{ margin: "2px 0 0", fontSize: "14px" }}>{String(m.body || "")}</p>
              </div>
            ))}
            {msg && (
              <div
                className="evidence-message-row reported-target"
                style={{
                  padding: "10px",
                  background: "var(--rose, #fff1f2)",
                  border: "2px solid var(--accent, #8e1538)",
                  borderRadius: "6px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "11px", fontWeight: "bold", color: "var(--accent, #8e1538)" }}>
                    REPORTED MESSAGE: {String(msg.sender_name || "User")} (@{String(msg.sender_handle || "user")}) · {new Date(String(msg.created_at)).toLocaleTimeString()}
                  </span>
                </div>
                <p style={{ margin: "4px 0 0", fontSize: "15px", fontWeight: "600" }}>{String(msg.body || "")}</p>
              </div>
            )}
            {after.map((m, idx) => (
              <div key={idx} className="evidence-message-row" style={{ padding: "8px", background: "var(--paper)", borderRadius: "6px" }}>
                <span className="muted" style={{ fontSize: "11px" }}>
                  {m.sender_name ? String(m.sender_name) : "User"} (@{String(m.sender_handle || "user")}) · {new Date(String(m.created_at)).toLocaleTimeString()}:
                </span>
                <p style={{ margin: "2px 0 0", fontSize: "14px" }}>{String(m.body || "")}</p>
              </div>
            ))}
          </div>
        </div>
      );
    }

    // Listing evidence
    if (e.title || report.target_type === "listing") {
      const photos = (e.photos as string[]) || [];
      return (
        <div className="admin-evidence-box">
          <h4>Listing snapshot</h4>
          <p><strong>Title:</strong> {String(e.title || "")}</p>
          <p><strong>Category:</strong> {String(e.category || "")}</p>
          <p><strong>Status at report:</strong> {String(e.status || "")}</p>
          {Boolean(e.description) && <p><strong>Description:</strong> {String(e.description)}</p>}
          {photos.length > 0 && (

            <div style={{ display: "flex", gap: "10px", marginTop: "10px", flexWrap: "wrap" }}>
              {photos.map((p, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={photoUrl(p) || p}
                  alt={`Listing photo ${i + 1}`}
                  width={100}
                  height={120}
                  style={{ objectFit: "cover", borderRadius: "4px", border: "1px solid var(--line)" }}
                />
              ))}
            </div>
          )}
        </div>
      );
    }

    // Profile evidence
    return (
      <div className="admin-evidence-box">
        <h4>Profile snapshot</h4>
        <p><strong>Display name:</strong> {String(e.display_name || "")}</p>
        <p><strong>Handle:</strong> @{String(e.studio_handle || "")}</p>
        <p><strong>Studio name:</strong> {String(e.studio_name || "None")}</p>
        <p><strong>Bio:</strong> {String(e.studio_bio || "None")}</p>
        <p><strong>Pickup area:</strong> {String(e.pickup_area || "None")}</p>
      </div>
    );
  }

  return (
    <div className="admin-reports-view">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div>
          <h2>Reports queue</h2>
          <p className="muted">Review member reports and enforce community guidelines</p>
        </div>
        <div className="segmented-control">
          <button
            type="button"
            aria-pressed={filter === "open"}
            onClick={() => setFilter("open")}
          >
            Open ({reports.filter((r) => r.status === "open").length})
          </button>
          <button
            type="button"
            aria-pressed={filter === "closed"}
            onClick={() => setFilter("closed")}
          >
            Closed ({reports.filter((r) => r.status === "closed").length})
          </button>
        </div>
      </div>

      <div className="admin-table-container" style={{ border: "1px solid var(--line)", borderRadius: "8px", overflow: "hidden" }}>
        <table className="admin-table" style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "14px" }}>
          <thead>
            <tr style={{ background: "var(--paper)", borderBottom: "1px solid var(--line)" }}>
              <th style={{ padding: "12px" }}>Date</th>
              <th style={{ padding: "12px" }}>Target</th>
              <th style={{ padding: "12px" }}>Type</th>
              <th style={{ padding: "12px" }}>Reason</th>
              <th style={{ padding: "12px" }}>Reporter</th>
              <th style={{ padding: "12px" }}>Status</th>
              <th style={{ padding: "12px", textAlign: "right" }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {displayed.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: "32px", textAlign: "center" }} className="muted">
                  No {filter} reports found.
                </td>
              </tr>
            ) : (
              displayed.map((r) => (
                <tr
                  key={r.id}
                  style={{ borderBottom: "1px solid var(--line)", cursor: "pointer" }}
                  onClick={() => setSelectedReport(r)}
                >
                  <td style={{ padding: "12px" }}>{new Date(r.created_at).toLocaleDateString()}</td>
                  <td style={{ padding: "12px" }}>
                    <strong>{r.target_name || "Unknown"}</strong>
                    {r.target_handle && <span className="muted" style={{ display: "block", fontSize: "12px" }}>@{r.target_handle}</span>}
                  </td>
                  <td style={{ padding: "12px" }}>
                    <span className="pill" style={{ textTransform: "capitalize", fontSize: "12px" }}>{r.target_type}</span>
                  </td>
                  <td style={{ padding: "12px" }}>
                    <strong>{r.reason}</strong>
                    {r.details && <p className="muted" style={{ margin: "2px 0 0", fontSize: "12px" }}>{r.details.slice(0, 50)}</p>}
                  </td>
                  <td style={{ padding: "12px" }}>
                    {r.reporter_name ? `${r.reporter_name} (@${r.reporter_handle})` : "Anonymous/Deleted"}
                  </td>
                  <td style={{ padding: "12px" }}>
                    <span style={{ fontWeight: "600", color: r.status === "open" ? "var(--accent)" : "var(--muted)" }}>
                      {r.status === "open" ? "Open" : `Closed (${r.outcome || "resolved"})`}
                    </span>
                  </td>
                  <td style={{ padding: "12px", textAlign: "right" }}>
                    <button
                      type="button"
                      className="button secondary compact"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedReport(r);
                      }}
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Report Detail Modal */}
      {selectedReport && (
        <div
          className="admin-report-detail-overlay"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 800,
            display: "flex",
            justifyContent: "flex-end",
          }}
          onClick={() => setSelectedReport(null)}
        >
          <div
            className="admin-detail-drawer"
            style={{
              width: "100%",
              maxWidth: "640px",
              height: "100%",
              background: "var(--paper, #fff)",
              color: "var(--ink)",
              overflowY: "auto",
              padding: "28px",
              boxShadow: "-4px 0 20px rgba(0,0,0,0.15)",
              display: "flex",
              flexDirection: "column",
              gap: "20px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <span className="eyebrow accent">{selectedReport.target_type.toUpperCase()} REPORT</span>
                <h3 style={{ fontSize: "22px", margin: "4px 0" }}>Report details</h3>
                <span className="muted" style={{ fontSize: "12px" }}>ID: {selectedReport.id} · {new Date(selectedReport.created_at).toLocaleString()}</span>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setSelectedReport(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="admin-card" style={{ padding: "16px", borderRadius: "6px", border: "1px solid var(--line)" }}>
              <p><strong>Reason:</strong> {selectedReport.reason}</p>
              {selectedReport.details && <p style={{ marginTop: "8px" }}><strong>Reporter comments:</strong> {selectedReport.details}</p>}
              <div style={{ marginTop: "12px", fontSize: "13px" }}>
                <span className="muted">Reporter: </span>
                <strong>{selectedReport.reporter_name || "Unknown"}</strong> {selectedReport.reporter_handle && `(@${selectedReport.reporter_handle})`}
              </div>
              <div style={{ marginTop: "4px", fontSize: "13px" }}>
                <span className="muted">Reported user: </span>
                <strong>{selectedReport.target_name || "Unknown"}</strong> {selectedReport.target_handle && `(@${selectedReport.target_handle})`}
                <span className="muted" style={{ marginLeft: "6px", fontSize: "11px" }}>({selectedReport.target_user_id})</span>
              </div>
              {selectedReport.status === "closed" && (
                <div style={{ marginTop: "12px", padding: "10px", background: "var(--paper)", borderRadius: "4px" }}>
                  <strong>Closed outcome:</strong> {selectedReport.outcome}
                  {selectedReport.outcome_note && <p className="muted" style={{ margin: "4px 0 0" }}>{selectedReport.outcome_note}</p>}
                </div>
              )}
            </div>

            {/* Evidence snapshot */}
            {renderEvidence(selectedReport)}

            {/* Action buttons */}
            <div style={{ marginTop: "auto", borderTop: "1px solid var(--line)", paddingTop: "16px" }}>
              <h4>Take moderation action</h4>
              <p className="muted" style={{ fontSize: "12px", marginBottom: "12px" }}>
                All actions require a written reason and are permanently recorded in the admin audit log.
              </p>
              <div className="button-row" style={{ flexWrap: "wrap", gap: "8px" }}>
                {selectedReport.status === "open" && (
                  <>
                    <button
                      type="button"
                      className="button secondary compact"
                      onClick={() => setActionType("dismiss")}
                    >
                      Dismiss report
                    </button>
                    <button
                      type="button"
                      className="button secondary compact"
                      onClick={() => setActionType("warn")}
                    >
                      Warn user
                    </button>
                    <button
                      type="button"
                      className="button secondary compact"
                      onClick={() => setActionType("remove_content")}
                    >
                      Remove content
                    </button>
                    <button
                      type="button"
                      className="button secondary compact"
                      onClick={() => setActionType("suspend")}
                    >
                      Suspend user…
                    </button>
                    <button
                      type="button"
                      className="button danger compact"
                      style={{ background: "var(--danger, #c62828)", borderColor: "var(--danger, #c62828)", color: "#fff" }}
                      onClick={() => setActionType("ban")}
                    >
                      Ban user
                    </button>
                  </>
                )}
                {selectedReport.status === "closed" && (
                  <>
                    <button
                      type="button"
                      className="button secondary compact"
                      onClick={() => setActionType("unsuspend")}
                    >
                      Unsuspend user
                    </button>
                    <button
                      type="button"
                      className="button secondary compact"
                      onClick={() => setActionType("unban")}
                    >
                      Unban user
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialogs */}
      {actionType === "dismiss" && selectedReport && (
        <ActionDialog
          title="Dismiss report"
          description="Closing this report without action. The reporter's evidence will remain preserved."
          confirmLabel="Dismiss report"
          onConfirm={handleDismiss}
          onClose={handleActionClose}
        />
      )}

      {actionType === "warn" && selectedReport && (
        <ActionDialog
          title={`Warn ${selectedReport.target_name || "user"}`}
          description="Send an official warning note. The warning will be recorded against the user account."
          confirmLabel="Issue warning"
          reasonPlaceholder="Enter warning explanation to user..."
          onConfirm={handleWarn}
          onClose={handleActionClose}
        />
      )}

      {actionType === "remove_content" && selectedReport && (
        <ActionDialog
          title="Remove reported content"
          description={`This will immediately remove the reported ${selectedReport.target_type} (deletes message, hides listing, or clears studio profile). Original evidence stays intact.`}
          confirmLabel="Remove content"
          danger
          onConfirm={handleRemoveContent}
          onClose={handleActionClose}
        />
      )}

      {actionType === "suspend" && selectedReport && (
        <ActionDialog
          title={`Suspend ${selectedReport.target_name || "user"}`}
          description="Suspends the user from messaging, reporting, and publishing, and holds all their active listings."
          confirmLabel={`Suspend for ${suspendDays} days`}
          danger
          onConfirm={handleSuspend}
          onClose={handleActionClose}
        >
          <label className="field" style={{ marginBottom: "12px" }}>
            <span>Suspension duration (days)</span>
            <input
              type="number"
              min={1}
              max={3650}
              value={suspendDays}
              onChange={(e) => setSuspendDays(Math.max(1, Math.min(3650, parseInt(e.target.value) || 1)))}
              required
            />
          </label>
        </ActionDialog>
      )}

      {actionType === "ban" && selectedReport && (
        <ActionDialog
          title={`Ban ${selectedReport.target_name || "user"}`}
          description="Permanently bans this account in Supabase Auth (cancelling all tokens and sign-in) and sets an open-ended suspension on all listings."
          confirmLabel="Confirm permanent ban"
          danger
          onConfirm={handleBan}
          onClose={handleActionClose}
        />
      )}

      {actionType === "unsuspend" && selectedReport && (
        <ActionDialog
          title={`Unsuspend ${selectedReport.target_name || "user"}`}
          description="Lifts the suspension and restores held listings back to active."
          confirmLabel="Unsuspend user"
          onConfirm={handleUnsuspend}
          onClose={handleActionClose}
        />
      )}

      {actionType === "unban" && selectedReport && (
        <ActionDialog
          title={`Unban ${selectedReport.target_name || "user"}`}
          description="Removes the Supabase Auth ban and clears account suspension."
          confirmLabel="Unban user"
          onConfirm={handleUnban}
          onClose={handleActionClose}
        />
      )}
    </div>
  );
}
