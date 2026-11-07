"use client";

import { useState } from "react";

export type AuditLogEntry = {
  id: number;
  admin_id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  reason: string | null;
  state_before: Record<string, unknown> | null;
  state_after: Record<string, unknown> | null;
  created_at: string;
  admin_handle: string | null;
  admin_name: string | null;
};

export function AuditLogView({ initialEntries }: { initialEntries: AuditLogEntry[] }) {
  const [entries] = useState(initialEntries);
  const [filter, setFilter] = useState("");

  const filtered = entries.filter((e) => {
    if (!filter.trim()) return true;
    const q = filter.toLowerCase();
    return (
      e.action.toLowerCase().includes(q) ||
      (e.admin_handle && e.admin_handle.toLowerCase().includes(q)) ||
      (e.admin_name && e.admin_name.toLowerCase().includes(q)) ||
      (e.target_type && e.target_type.toLowerCase().includes(q)) ||
      (e.target_id && e.target_id.toLowerCase().includes(q)) ||
      (e.reason && e.reason.toLowerCase().includes(q))
    );
  });

  return (
    <div className="admin-audit-log-view">
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
          <h2>Admin Audit Log</h2>
          <p className="muted">
            Append-only record of all administrative actions, decisions, and system inspections
          </p>
        </div>
        <div style={{ width: "280px" }}>
          <input
            type="search"
            placeholder="Filter by action, admin, ID..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: "6px",
              border: "1px solid var(--line)",
              background: "var(--paper)",
              color: "var(--ink)",
              fontSize: "13px",
            }}
          />
        </div>
      </div>

      <div
        className="admin-table-container"
        style={{
          border: "1px solid var(--line)",
          borderRadius: "8px",
          overflow: "hidden",
          background: "var(--paper)",
        }}
      >
        <table
          className="admin-table"
          style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}
        >
          <thead>
            <tr style={{ background: "var(--paper)", borderBottom: "1px solid var(--line)" }}>
              <th style={{ padding: "12px", width: "160px" }}>Timestamp</th>
              <th style={{ padding: "12px", width: "150px" }}>Admin</th>
              <th style={{ padding: "12px", width: "180px" }}>Action</th>
              <th style={{ padding: "12px" }}>Target</th>
              <th style={{ padding: "12px" }}>Reason / Note</th>
              <th style={{ padding: "12px", width: "100px" }}>State Details</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: "36px", textAlign: "center" }} className="muted">
                  No log entries found.
                </td>
              </tr>
            ) : (
              filtered.map((item) => (
                <tr
                  key={item.id}
                  style={{ borderBottom: "1px solid var(--line)", verticalAlign: "top" }}
                >
                  <td style={{ padding: "12px", whiteSpace: "nowrap", color: "var(--muted)" }}>
                    {new Date(item.created_at).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </td>
                  <td style={{ padding: "12px" }}>
                    <div style={{ fontWeight: 500 }}>
                      {item.admin_handle ? `@${item.admin_handle}` : item.admin_name || "Admin"}
                    </div>
                  </td>
                  <td style={{ padding: "12px" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: "4px",
                        background: "var(--bg)",
                        border: "1px solid var(--line)",
                        fontFamily: "monospace",
                        fontSize: "12px",
                      }}
                    >
                      {item.action}
                    </span>
                  </td>
                  <td style={{ padding: "12px" }}>
                    {item.target_type ? (
                      <div>
                        <span className="muted" style={{ textTransform: "capitalize" }}>
                          {item.target_type}:{" "}
                        </span>
                        <code style={{ fontSize: "12px" }}>
                          {item.target_id ? item.target_id.slice(0, 8) + "..." : "—"}
                        </code>
                      </div>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td style={{ padding: "12px" }}>
                    {item.reason ? (
                      <span>{item.reason}</span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td style={{ padding: "12px" }}>
                    {(item.state_before || item.state_after) ? (
                      <details style={{ cursor: "pointer" }}>
                        <summary style={{ fontSize: "12px", color: "var(--ink)" }}>Diff</summary>
                        <div
                          style={{
                            marginTop: "6px",
                            padding: "8px",
                            background: "var(--bg)",
                            borderRadius: "4px",
                            fontSize: "11px",
                            fontFamily: "monospace",
                            whiteSpace: "pre-wrap",
                            maxWidth: "280px",
                            overflowX: "auto",
                          }}
                        >
                          {item.state_before && (
                            <div>
                              <strong>Before:</strong>
                              <br />
                              {JSON.stringify(item.state_before, null, 2)}
                            </div>
                          )}
                          {item.state_after && (
                            <div style={{ marginTop: "6px" }}>
                              <strong>After:</strong>
                              <br />
                              {JSON.stringify(item.state_after, null, 2)}
                            </div>
                          )}
                        </div>
                      </details>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
