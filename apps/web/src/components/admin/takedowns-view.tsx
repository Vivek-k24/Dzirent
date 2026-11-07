"use client";

import { useState } from "react";
import {
  createTakedownAction,
  takedownRemoveListingAction,
  recordCounterNoticeAction,
  setTakedownStatusAction,
} from "@/lib/admin-actions";
import { ActionDialog } from "./action-dialog";

export type AdminTakedownItem = {
  id: string;
  claimant_name: string;
  claimant_contact: string;
  work: string;
  urls: string[];
  listing_ids: string[];
  received_at: string;
  status: "received" | "actioned" | "rejected" | "countered" | "restored";
  notes?: string | null;
  counter_notice?: string | null;
  counter_received_at?: string | null;
  created_at: string;
};

export function TakedownsView({ initialTakedowns }: { initialTakedowns: AdminTakedownItem[] }) {
  const [takedowns, setList] = useState(initialTakedowns);
  const [filter, setFilter] = useState<"open" | "all" | "actioned" | "rejected" | "restored">("open");
  const [isCreating, setIsCreating] = useState(false);

  // New Takedown form state
  const [newName, setNewName] = useState("");
  const [newContact, setNewContact] = useState("");
  const [newWork, setNewWork] = useState("");
  const [newUrls, setNewUrls] = useState("");
  const [newListingIds, setNewListingIds] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [submittingCreate, setSubmittingCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Action states
  const [selectedTakedown, setSelectedTakedown] = useState<AdminTakedownItem | null>(null);
  const [activeAction, setActiveAction] = useState<"remove_listing" | "counter_notice" | "status" | null>(null);
  const [targetListingId, setTargetListingId] = useState<string>("");
  const [newStatus, setNewStatus] = useState<string>("actioned");
  const [counterNoticeText, setCounterNoticeText] = useState<string>("");

  const filtered = takedowns.filter((t) => {
    if (filter === "open") return t.status === "received" || t.status === "countered";
    if (filter === "all") return true;
    return t.status === filter;
  });

  async function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !newContact.trim() || !newWork.trim()) {
      setCreateError("Claimant name, contact, and description of work are required.");
      return;
    }
    setSubmittingCreate(true);
    setCreateError(null);
    try {
      const urls = newUrls
        .split(/[\n,]/)
        .map((u) => u.trim())
        .filter(Boolean);
      const listingIds = newListingIds
        .split(/[\n,]/)
        .map((id) => id.trim())
        .filter(Boolean);

      await createTakedownAction({
        claimantName: newName.trim(),
        claimantContact: newContact.trim(),
        work: newWork.trim(),
        urls,
        listingIds,
        note: newNotes.trim() || null,
      });

      setIsCreating(false);
      window.location.reload();
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Failed to create takedown");
    } finally {
      setSubmittingCreate(false);
    }
  }

  async function handleDialogConfirm(reasonOrNote: string) {
    if (!selectedTakedown || !activeAction) return;

    if (activeAction === "remove_listing") {
      await takedownRemoveListingAction(selectedTakedown.id, targetListingId, reasonOrNote);
      setList((prev) =>
        prev.map((t) => (t.id === selectedTakedown.id ? { ...t, status: "actioned" } : t)),
      );
    } else if (activeAction === "counter_notice") {
      await recordCounterNoticeAction(selectedTakedown.id, counterNoticeText);
      setList((prev) =>
        prev.map((t) =>
          t.id === selectedTakedown.id
            ? { ...t, status: "countered", counter_notice: counterNoticeText }
            : t,
        ),
      );
    } else if (activeAction === "status") {
      await setTakedownStatusAction(
        selectedTakedown.id,
        newStatus,
        reasonOrNote,
      );
      setList((prev) =>
        prev.map((t) =>
          t.id === selectedTakedown.id
            ? {
                ...t,
                status: newStatus as AdminTakedownItem["status"],
                notes: t.notes ? `${t.notes}\n${reasonOrNote}` : reasonOrNote,
              }
            : t,
        ),
      );
    }

    setSelectedTakedown(null);
    setActiveAction(null);
    setCounterNoticeText("");
  }

  function getStatusColor(status: AdminTakedownItem["status"]) {
    switch (status) {
      case "received":
        return "#d35400";
      case "countered":
        return "#9b59b6";
      case "actioned":
        return "#27ae60";
      case "rejected":
        return "#7f8c8d";
      case "restored":
        return "#2980b9";
    }
  }

  return (
    <div className="admin-takedowns-view">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div>
          <h2>Copyright &amp; Takedown Requests</h2>
          <p className="muted">Manage DMCA / takedown claims entered from support emails</p>
        </div>
        <button
          type="button"
          className="button button-primary"
          onClick={() => setIsCreating(true)}
        >
          + Log takedown request
        </button>
      </div>

      <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
        {(["open", "all", "actioned", "rejected", "restored"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`admin-filter-pill ${filter === tab ? "active" : ""}`}
            onClick={() => setFilter(tab)}
            style={{
              padding: "6px 14px",
              borderRadius: "20px",
              border: "1px solid var(--line)",
              background: filter === tab ? "var(--ink)" : "var(--paper)",
              color: filter === tab ? "var(--paper)" : "var(--ink)",
              fontSize: "13px",
              cursor: "pointer",
              textTransform: "capitalize",
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div
          style={{
            padding: "48px 24px",
            textAlign: "center",
            border: "1px dashed var(--line)",
            borderRadius: "8px",
          }}
          className="muted"
        >
          No takedown requests in this view.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {filtered.map((t) => (
            <div
              key={t.id}
              style={{
                background: "var(--paper)",
                border: "1px solid var(--line)",
                borderRadius: "8px",
                padding: "20px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                  gap: "12px",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "17px", fontWeight: 600 }}>{t.claimant_name}</span>
                    <span
                      className="badge"
                      style={{ background: getStatusColor(t.status), color: "#fff", textTransform: "capitalize" }}
                    >
                      {t.status}
                    </span>
                  </div>
                  <div style={{ fontSize: "13px", color: "var(--muted)", marginTop: "4px" }}>
                    <span>Contact: {t.claimant_contact}</span>
                    <span style={{ margin: "0 8px" }}>•</span>
                    <span>Received: {new Date(t.received_at).toLocaleDateString()}</span>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="button button-outline"
                    style={{ fontSize: "13px", padding: "6px 12px" }}
                    onClick={() => {
                      setSelectedTakedown(t);
                      setActiveAction("counter_notice");
                    }}
                  >
                    Counter-notice
                  </button>
                  <button
                    type="button"
                    className="button button-outline"
                    style={{ fontSize: "13px", padding: "6px 12px" }}
                    onClick={() => {
                      setSelectedTakedown(t);
                      setNewStatus(t.status);
                      setActiveAction("status");
                    }}
                  >
                    Change Status
                  </button>
                </div>
              </div>

              <div style={{ marginTop: "14px", fontSize: "14px" }}>
                <div>
                  <strong>Protected Work:</strong> {t.work}
                </div>
                {t.urls && t.urls.length > 0 && (
                  <div style={{ marginTop: "6px" }}>
                    <strong>URLs:</strong>{" "}
                    {t.urls.map((u, i) => (
                      <span key={i} style={{ marginRight: "8px" }}>
                        <a href={u} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
                          {u}
                        </a>
                      </span>
                    ))}
                  </div>
                )}
                {t.listing_ids && t.listing_ids.length > 0 && (
                  <div style={{ marginTop: "8px" }}>
                    <strong>Target Listing IDs:</strong>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "4px" }}>
                      {t.listing_ids.map((lid) => (
                        <div
                          key={lid}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "8px",
                            padding: "4px 8px",
                            background: "var(--bg)",
                            border: "1px solid var(--line)",
                            borderRadius: "4px",
                            fontSize: "12px",
                          }}
                        >
                          <code>{lid}</code>
                          <button
                            type="button"
                            className="button button-outline"
                            style={{ fontSize: "11px", padding: "2px 6px", color: "#c0392b" }}
                            onClick={() => {
                              setSelectedTakedown(t);
                              setTargetListingId(lid);
                              setActiveAction("remove_listing");
                            }}
                          >
                            Remove listing
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {t.counter_notice && (
                <div
                  style={{
                    marginTop: "12px",
                    padding: "10px 14px",
                    background: "rgba(155, 89, 182, 0.08)",
                    borderLeft: "4px solid #9b59b6",
                    borderRadius: "4px",
                    fontSize: "13px",
                  }}
                >
                  <strong>Counter-Notice Recorded:</strong>
                  <div style={{ whiteSpace: "pre-wrap", marginTop: "4px" }}>{t.counter_notice}</div>
                </div>
              )}

              {t.notes && (
                <div style={{ marginTop: "10px", fontSize: "12px", color: "var(--muted)" }}>
                  <strong>Notes:</strong> {t.notes}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Takedown Dialog */}
      {isCreating && (
        <dialog
          open
          className="admin-modal-overlay"
          style={{
            position: "fixed",
            inset: 0,
            width: "100%",
            height: "100%",
            background: "rgba(0, 0, 0, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            border: "none",
            padding: "16px",
          }}
        >
          <div
            style={{
              background: "var(--paper)",
              color: "var(--ink)",
              border: "1px solid var(--line)",
              borderRadius: "8px",
              padding: "24px",
              maxWidth: "540px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <h3 style={{ margin: "0 0 8px 0" }}>Log Copyright Takedown Request</h3>
            <p className="muted" style={{ fontSize: "13px", margin: "0 0 16px 0" }}>
              Enter claim details received via support email or DMCA notice
            </p>

            {createError && (
              <div
                style={{
                  padding: "10px",
                  background: "rgba(180, 40, 40, 0.1)",
                  color: "#c0392b",
                  borderRadius: "4px",
                  fontSize: "13px",
                  marginBottom: "14px",
                }}
              >
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateSubmit}>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 500, marginBottom: "4px" }}>
                  Claimant Name *
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. John Doe / Studio Brand"
                  style={{ width: "100%", padding: "8px 10px", borderRadius: "4px", border: "1px solid var(--line)" }}
                />
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 500, marginBottom: "4px" }}>
                  Claimant Contact (Email / Phone) *
                </label>
                <input
                  type="text"
                  required
                  value={newContact}
                  onChange={(e) => setNewContact(e.target.value)}
                  placeholder="e.g. legal@brand.com"
                  style={{ width: "100%", padding: "8px 10px", borderRadius: "4px", border: "1px solid var(--line)" }}
                />
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 500, marginBottom: "4px" }}>
                  Description of Copyrighted Work *
                </label>
                <textarea
                  required
                  rows={2}
                  value={newWork}
                  onChange={(e) => setNewWork(e.target.value)}
                  placeholder="Describe original photograph, design, or work claimed..."
                  style={{ width: "100%", padding: "8px 10px", borderRadius: "4px", border: "1px solid var(--line)" }}
                />
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 500, marginBottom: "4px" }}>
                  Relevant URLs (comma or newline separated)
                </label>
                <textarea
                  rows={2}
                  value={newUrls}
                  onChange={(e) => setNewUrls(e.target.value)}
                  placeholder="https://..."
                  style={{ width: "100%", padding: "8px 10px", borderRadius: "4px", border: "1px solid var(--line)" }}
                />
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 500, marginBottom: "4px" }}>
                  Listing IDs (comma or newline separated UUIDs)
                </label>
                <textarea
                  rows={2}
                  value={newListingIds}
                  onChange={(e) => setNewListingIds(e.target.value)}
                  placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                  style={{ width: "100%", padding: "8px 10px", borderRadius: "4px", border: "1px solid var(--line)" }}
                />
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 500, marginBottom: "4px" }}>
                  Notes (optional)
                </label>
                <textarea
                  rows={2}
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Internal administrative notes..."
                  style={{ width: "100%", padding: "8px 10px", borderRadius: "4px", border: "1px solid var(--line)" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  className="button button-outline"
                  onClick={() => setIsCreating(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={submittingCreate}
                >
                  {submittingCreate ? "Saving..." : "Create request"}
                </button>
              </div>
            </form>
          </div>
        </dialog>
      )}

      {/* Remove Listing Dialog */}
      {selectedTakedown && activeAction === "remove_listing" && (
        <ActionDialog
          title={`Remove listing ${targetListingId}`}
          description="This will apply an administrative hold on the listing and mark the takedown request as actioned."
          actionLabel="Remove listing"
          onClose={() => {
            setSelectedTakedown(null);
            setActiveAction(null);
          }}
          onConfirm={handleDialogConfirm}
        />
      )}

      {/* Record Counter Notice Dialog */}
      {selectedTakedown && activeAction === "counter_notice" && (
        <ActionDialog
          title={`Record Counter-Notice for claim #${selectedTakedown.id.slice(0, 8)}`}
          description="Enter the counter-notice text received from the listing owner. This changes the status to 'countered'."
          actionLabel="Record counter-notice"
          requireReason={false}
          onClose={() => {
            setSelectedTakedown(null);
            setActiveAction(null);
            setCounterNoticeText("");
          }}
          onConfirm={handleDialogConfirm}
        >
          <div style={{ marginBottom: "12px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 500, marginBottom: "4px" }}>
              Counter-Notice content:
            </label>
            <textarea
              rows={4}
              required
              value={counterNoticeText}
              onChange={(e) => setCounterNoticeText(e.target.value)}
              placeholder="Paste counter-notice statement received from lender..."
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: "4px",
                border: "1px solid var(--line)",
                background: "var(--paper)",
                color: "var(--ink)",
              }}
            />
          </div>
        </ActionDialog>
      )}

      {/* Set Status Dialog */}
      {selectedTakedown && activeAction === "status" && (
        <ActionDialog
          title={`Update status for claim #${selectedTakedown.id.slice(0, 8)}`}
          description="Select new status and provide an administrative note explaining the change."
          actionLabel="Update status"
          reasonPlaceholder="Reason for status change..."
          onClose={() => {
            setSelectedTakedown(null);
            setActiveAction(null);
          }}
          onConfirm={handleDialogConfirm}
        >
          <div style={{ marginBottom: "12px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 500, marginBottom: "4px" }}>
              New Status:
            </label>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: "4px",
                border: "1px solid var(--line)",
                background: "var(--paper)",
                color: "var(--ink)",
              }}
            >
              <option value="received">received</option>
              <option value="actioned">actioned</option>
              <option value="rejected">rejected</option>
              <option value="countered">countered</option>
              <option value="restored">restored</option>
            </select>
          </div>
        </ActionDialog>
      )}
    </div>
  );
}
