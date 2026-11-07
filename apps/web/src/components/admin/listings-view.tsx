"use client";

import { useState } from "react";
import { photoUrl } from "@/lib/supabase/config";
import { ActionDialog } from "./action-dialog";
import { hideListingAction, unhideListingAction } from "@/lib/admin-actions";

export type AdminListingItem = {
  id: string;
  title: string;
  price?: number;
  category: string;
  city: string;
  cover_photo_path?: string | null;
  studio_name?: string;
  studio_handle?: string;
  status?: string;
  hold?: string | null;
  hold_reason?: string | null;
  auto_paused_reason?: string | null;
};

export function ListingsView({ initialListings }: { initialListings: AdminListingItem[] }) {
  const [listings, setListings] = useState(initialListings);
  const [query, setQuery] = useState("");
  const [selectedListing, setSelectedListing] = useState<AdminListingItem | null>(null);
  const [actionType, setActionType] = useState<"hide" | "unhide" | null>(null);

  const filtered = listings.filter((l) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      l.title.toLowerCase().includes(q) ||
      l.id.toLowerCase().includes(q) ||
      (l.studio_handle && l.studio_handle.toLowerCase().includes(q)) ||
      (l.category && l.category.toLowerCase().includes(q))
    );
  });

  async function handleAction(reason: string) {
    if (!selectedListing || !actionType) return;
    if (actionType === "hide") {
      await hideListingAction(selectedListing.id, reason);
      setListings((prev) =>
        prev.map((l) =>
          l.id === selectedListing.id
            ? { ...l, status: "paused", hold: "hidden", hold_reason: reason, auto_paused_reason: `Hidden by Dzirent: ${reason}` }
            : l,
        ),
      );
    } else {
      await unhideListingAction(selectedListing.id, reason);
      setListings((prev) =>
        prev.map((l) =>
          l.id === selectedListing.id
            ? { ...l, status: "active", hold: null, hold_reason: null, auto_paused_reason: null }
            : l,
        ),
      );
    }
    setSelectedListing(null);
    setActionType(null);
  }

  return (
    <div className="admin-listings-view">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h2>Marketplace listings</h2>
          <p className="muted">Search pieces and apply administrative holds</p>
        </div>
        <div style={{ width: "320px" }}>
          <input
            type="search"
            placeholder="Search by title, handle, ID..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ width: "100%", padding: "10px 14px", borderRadius: "6px", border: "1px solid var(--line)" }}
          />
        </div>
      </div>

      <div className="admin-table-container" style={{ border: "1px solid var(--line)", borderRadius: "8px", overflow: "hidden" }}>
        <table className="admin-table" style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "14px" }}>
          <thead>
            <tr style={{ background: "var(--paper)", borderBottom: "1px solid var(--line)" }}>
              <th style={{ padding: "12px", width: "80px" }}>Photo</th>
              <th style={{ padding: "12px" }}>Title &amp; ID</th>
              <th style={{ padding: "12px" }}>Lender</th>
              <th style={{ padding: "12px" }}>Category</th>
              <th style={{ padding: "12px" }}>Status / Hold</th>
              <th style={{ padding: "12px", textAlign: "right" }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: "32px", textAlign: "center" }} className="muted">
                  No listings found matching your search.
                </td>
              </tr>
            ) : (
              filtered.map((l) => {
                const isHeld = Boolean(l.hold);
                return (
                  <tr key={l.id} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={{ padding: "12px" }}>
                      {l.cover_photo_path ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={photoUrl(l.cover_photo_path) || l.cover_photo_path}
                          alt={l.title}
                          width={60}
                          height={75}
                          style={{ objectFit: "cover", borderRadius: "4px", display: "block" }}
                        />
                      ) : (
                        <div style={{ width: "60px", height: "75px", background: "var(--line)", borderRadius: "4px" }} />
                      )}
                    </td>
                    <td style={{ padding: "12px" }}>
                      <strong>{l.title}</strong>
                      <span className="muted" style={{ display: "block", fontSize: "11px" }}>{l.id}</span>
                      {l.price && <span style={{ fontSize: "12px" }}>${l.price} / rental</span>}
                    </td>
                    <td style={{ padding: "12px" }}>
                      {l.studio_name || "Lender"}
                      {l.studio_handle && <span className="muted" style={{ display: "block", fontSize: "12px" }}>@{l.studio_handle}</span>}
                    </td>
                    <td style={{ padding: "12px" }}>{l.category}</td>
                    <td style={{ padding: "12px" }}>
                      {isHeld ? (
                        <span style={{ color: "var(--danger, #d32f2f)", fontWeight: "bold" }}>
                          Hold: {l.hold}
                        </span>
                      ) : (
                        <span style={{ color: l.status === "active" ? "#16a34a" : "var(--muted)" }}>
                          {l.status || "active"}
                        </span>
                      )}
                      {l.auto_paused_reason && (
                        <p className="muted" style={{ fontSize: "11px", margin: "2px 0 0" }}>
                          {l.auto_paused_reason}
                        </p>
                      )}
                    </td>
                    <td style={{ padding: "12px", textAlign: "right" }}>
                      {isHeld ? (
                        <button
                          type="button"
                          className="button secondary compact"
                          onClick={() => {
                            setSelectedListing(l);
                            setActionType("unhide");
                          }}
                        >
                          Unhide piece
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="button secondary compact danger-text"
                          onClick={() => {
                            setSelectedListing(l);
                            setActionType("hide");
                          }}
                        >
                          Hide piece
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {selectedListing && actionType && (
        <ActionDialog
          title={`${actionType === "hide" ? "Hide" : "Unhide"} "${selectedListing.title}"`}
          description={
            actionType === "hide"
              ? "Applies an administrative hold on this listing, removing it from the shop window. The reason will be recorded and shown on the listing."
              : "Lifts the administrative hold and restores the listing to active status in the shop window."
          }
          confirmLabel={actionType === "hide" ? "Hide piece" : "Unhide piece"}
          danger={actionType === "hide"}
          reasonPlaceholder={`Enter reason for ${actionType === "hide" ? "hiding" : "unhiding"} listing...`}
          onConfirm={handleAction}
          onClose={() => {
            setSelectedListing(null);
            setActionType(null);
          }}
        />
      )}
    </div>
  );
}
