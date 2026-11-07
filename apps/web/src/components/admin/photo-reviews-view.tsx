"use client";

import { useState } from "react";
import { photoUrl } from "@/lib/supabase/config";
import { ActionDialog } from "./action-dialog";
import { decideScanAction } from "@/lib/admin-actions";

export type PhotoReviewItem = {
  scan_id: string;
  listing_id: string;
  title: string;
  listing_status: string;
  lender_id: string;
  lender_handle: string | null;
  created_at: string;
  finished_at: string | null;
  reason: string | null;
  suggestions: Record<string, unknown> | null;
  photos: Array<{
    photo_id: string;
    storage_path: string;
    slot: string;
    decision: string;
    warnings: string[];
    looks_like?: string;
    nsfw?: number;
    hooded?: boolean;
  }>;
};

export function PhotoReviewsView({ initialItems }: { initialItems: PhotoReviewItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [selectedScan, setSelectedScan] = useState<PhotoReviewItem | null>(null);
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);

  async function handleDecide(reason: string) {
    if (!selectedScan || !decision) return;
    await decideScanAction(selectedScan.scan_id, decision, reason);
    setItems((prev) => prev.filter((i) => i.scan_id !== selectedScan.scan_id));
    setSelectedScan(null);
    setDecision(null);
  }

  return (
    <div className="admin-photo-reviews-view">
      <div style={{ marginBottom: "20px" }}>
        <h2>Photo reviews queue</h2>
        <p className="muted">Listings with pending photo checks flagged for manual review</p>
      </div>

      {items.length === 0 ? (
        <div className="admin-card" style={{ padding: "40px", textAlign: "center", border: "1px solid var(--line)", borderRadius: "8px" }}>
          <p className="muted">All photo reviews are complete. The queue is empty.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {items.map((item) => (
            <div
              key={item.scan_id}
              className="admin-card"
              style={{ padding: "24px", border: "1px solid var(--line)", borderRadius: "8px", background: "var(--paper)" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <span className="eyebrow accent">REVIEW REQUIRED</span>
                  <h3 style={{ fontSize: "20px", margin: "4px 0" }}>{item.title}</h3>
                  <p className="muted" style={{ fontSize: "13px" }}>
                    Lender: @{item.lender_handle || "user"} · Flagged: {new Date(item.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="button-row">
                  <button
                    type="button"
                    className="button secondary compact"
                    onClick={() => {
                      setSelectedScan(item);
                      setDecision("approved");
                    }}
                  >
                    Approve piece
                  </button>
                  <button
                    type="button"
                    className="button danger compact"
                    style={{ background: "var(--danger, #c62828)", borderColor: "var(--danger, #c62828)", color: "#fff" }}
                    onClick={() => {
                      setSelectedScan(item);
                      setDecision("rejected");
                    }}
                  >
                    Reject piece
                  </button>
                </div>
              </div>

              {item.reason && (
                <div className="policy-note" style={{ margin: "14px 0", background: "var(--line)" }}>
                  <strong>Server scan verdict note:</strong> {item.reason}
                </div>
              )}

              {/* Photos grid */}
              <div style={{ margin: "16px 0" }}>
                <span className="muted" style={{ fontSize: "12px", display: "block", marginBottom: "8px" }}>
                  Submitted listing photos:
                </span>
                <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                  {item.photos.map((p, idx) => (
                    <div
                      key={p.photo_id || idx}
                      style={{
                        border: "1px solid var(--line)",
                        borderRadius: "6px",
                        overflow: "hidden",
                        width: "160px",
                        background: "#fff",
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photoUrl(p.storage_path) || p.storage_path}
                        alt={`${item.title || "Listing piece"} - slot ${p.slot}`}
                        width={160}

                        height={200}
                        style={{ width: "100%", height: "180px", objectFit: "cover", display: "block" }}
                      />
                      <div style={{ padding: "8px", fontSize: "11px" }}>
                        <strong>Slot: {p.slot}</strong>
                        <div>Verdict: {p.decision}</div>
                        {p.hooded && <div style={{ color: "var(--accent)" }}>Hood detected</div>}
                        {p.nsfw !== undefined && p.nsfw > 0.1 && (
                          <div style={{ color: "var(--danger)" }}>NSFW: {(p.nsfw * 100).toFixed(1)}%</div>
                        )}
                        {p.warnings && p.warnings.length > 0 && (
                          <div className="muted" style={{ marginTop: "4px" }}>
                            {p.warnings.join(", ")}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Suggestions */}
              {item.suggestions && (
                <div style={{ fontSize: "13px", borderTop: "1px solid var(--line)", paddingTop: "12px" }}>
                  <span className="muted">Suggestions from model: </span>
                  {Object.entries(item.suggestions)
                    .filter(([k]) => ["category", "garment_type", "styles", "item_type"].includes(k))
                    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`)
                    .join(" · ")}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {selectedScan && decision && (
        <ActionDialog
          title={`${decision === "approved" ? "Approve" : "Reject"} "${selectedScan.title}"`}
          description={
            decision === "approved"
              ? "Approves the listing under photo scanning rules. The lender will be able to publish this piece live."
              : "Rejects the photos for this listing. The reason will be clearly shown to the lender in their listing editor."
          }
          confirmLabel={decision === "approved" ? "Approve listing" : "Reject listing"}
          danger={decision === "rejected"}
          reasonPlaceholder={`Enter reason to lender for ${decision}...`}
          onConfirm={handleDecide}
          onClose={() => {
            setSelectedScan(null);
            setDecision(null);
          }}
        />
      )}
    </div>
  );
}
