"use client";

import { useState } from "react";
import {
  findUserAction,
  suspendUserAction,
  unsuspendUserAction,
  banUserAction,
  unbanUserAction,
  warnUserAction,
} from "@/lib/admin-actions";
import { ActionDialog } from "./action-dialog";

export type AdminUserData = {
  id: string;
  email: string;
  display_name: string | null;
  studio_name: string | null;
  studio_handle: string | null;
  city: string | null;
  role: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  banned_until: string | null;
  suspended_until: string | null;
  suspension_reason: string | null;
  is_admin: boolean;
  reports_made: number;
  reports_against: number;
  open_reports_against: number;
  warnings: number;
  listings_total: number;
  listings_active: number;
  listings_held: number;
  /** The latest age check (P2C), or null if none was recorded. */
  age_check: {
    source: "store_signal" | "self_declared";
    result: "adult" | "minor" | "unknown";
    platform: "web" | "android" | "ios";
    checked_at: string;
  } | null;
  /** Blocked by the age gate: only reading and deleting the account work. */
  age_blocked: boolean;
};

function ageCheckLabel(u: AdminUserData) {
  const c = u.age_check;
  if (!c) return "No check yet";
  const source = c.source === "store_signal" ? "App store signal" : "Self-declared";
  const platform = c.platform === "web" ? "website" : c.platform === "ios" ? "iPhone" : "Android";
  return `${source}: ${c.result} (${platform}, ${new Date(c.checked_at).toLocaleDateString()})`;
}

export function UsersView({ initialUsers, initialQuery }: { initialUsers: AdminUserData[]; initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery || "");
  const [users, setUsers] = useState<AdminUserData[]>(initialUsers);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [selectedUser, setSelectedUser] = useState<AdminUserData | null>(null);
  const [actionType, setActionType] = useState<"suspend" | "unsuspend" | "ban" | "unban" | "warn" | null>(null);
  const [suspendDays, setSuspendDays] = useState(7);
  const [now] = useState(() => Date.now());

  async function handleSearch(e?: React.FormEvent) {

    if (e) e.preventDefault();
    const q = query.trim();
    if (q.length < 3) {
      setSearchError("Please enter at least 3 characters (email, handle, or user ID)");
      return;
    }
    setSearchError(null);
    setLoading(true);
    try {
      const results = await findUserAction(q);
      setUsers((results as unknown) as AdminUserData[]);

    } catch (err: unknown) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(reason: string) {
    if (!selectedUser || !actionType) return;

    if (actionType === "suspend") {
      await suspendUserAction(selectedUser.id, suspendDays, reason);
      const untilDate = new Date();
      untilDate.setDate(untilDate.getDate() + suspendDays);
      setUsers((prev) =>
        prev.map((u) =>
          u.id === selectedUser.id
            ? { ...u, suspended_until: untilDate.toISOString(), suspension_reason: reason }
            : u,
        ),
      );
    } else if (actionType === "unsuspend") {
      await unsuspendUserAction(selectedUser.id, reason);
      setUsers((prev) =>
        prev.map((u) =>
          u.id === selectedUser.id
            ? { ...u, suspended_until: null, suspension_reason: null }
            : u,
        ),
      );
    } else if (actionType === "ban") {
      await banUserAction(selectedUser.id, reason);
      setUsers((prev) =>
        prev.map((u) =>
          u.id === selectedUser.id
            ? { ...u, banned_until: "infinity", suspended_until: "infinity", suspension_reason: reason }
            : u,
        ),
      );
    } else if (actionType === "unban") {
      await unbanUserAction(selectedUser.id, reason);
      setUsers((prev) =>
        prev.map((u) =>
          u.id === selectedUser.id
            ? { ...u, banned_until: null, suspended_until: null, suspension_reason: null }
            : u,
        ),
      );
    } else if (actionType === "warn") {
      await warnUserAction(selectedUser.id, reason);
      setUsers((prev) =>
        prev.map((u) =>
          u.id === selectedUser.id
            ? { ...u, warnings: (u.warnings || 0) + 1 }
            : u,
        ),
      );
    }

    setSelectedUser(null);
    setActionType(null);
  }

  function isSuspended(u: AdminUserData) {
    if (!u.suspended_until) return false;
    if (u.suspended_until === "infinity") return true;
    return new Date(u.suspended_until).getTime() > now;
  }

  function isBanned(u: AdminUserData) {
    if (u.banned_until === "infinity") return true;
    if (u.suspended_until === "infinity") return true;
    if (u.banned_until && new Date(u.banned_until).getTime() > now) return true;
    return false;
  }


  return (
    <div className="admin-users-view">
      <div style={{ marginBottom: "24px" }}>
        <h2>User Management</h2>
        <p className="muted">Look up user accounts by exact email, studio handle, or user ID</p>
      </div>

      <form
        onSubmit={handleSearch}
        style={{
          display: "flex",
          gap: "10px",
          maxWidth: "540px",
          marginBottom: "24px",
        }}
      >
        <input
          type="search"
          placeholder="Search by email, @handle, or UUID..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            flex: 1,
            padding: "10px 14px",
            borderRadius: "6px",
            border: "1px solid var(--line)",
            background: "var(--paper)",
            color: "var(--ink)",
            fontSize: "14px",
          }}
        />
        <button
          type="submit"
          className="button button-primary"
          disabled={loading || query.trim().length < 3}
          style={{ whiteSpace: "nowrap" }}
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </form>

      {searchError && (
        <div style={{ padding: "12px", background: "rgba(180, 40, 40, 0.1)", color: "#c0392b", borderRadius: "6px", marginBottom: "20px" }}>
          {searchError}
        </div>
      )}

      {users.length === 0 ? (
        <div style={{ padding: "48px 24px", textAlign: "center", border: "1px dashed var(--line)", borderRadius: "8px" }} className="muted">
          {query.trim().length >= 3
            ? "No users found matching that exact email, studio handle, or ID."
            : "Enter an email, studio handle (e.g. @studio), or account ID to look up users."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {users.map((u) => {
            const banned = isBanned(u);
            const suspended = isSuspended(u);

            return (
              <div
                key={u.id}
                style={{
                  background: "var(--paper)",
                  border: "1px solid var(--line)",
                  borderRadius: "8px",
                  padding: "20px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "18px", fontWeight: 600 }}>
                        {u.display_name || u.studio_name || "Unnamed User"}
                      </span>
                      {u.studio_handle && (
                        <span className="muted" style={{ fontSize: "14px" }}>
                          @{u.studio_handle}
                        </span>
                      )}
                      {u.is_admin && (
                        <span className="badge" style={{ background: "#4a3b89", color: "#fff" }}>
                          Admin
                        </span>
                      )}
                      {u.age_blocked && (
                        <span className="badge" style={{ background: "#8e44ad", color: "#fff" }}>
                          Under 18: blocked
                        </span>
                      )}
                      {banned ? (
                        <span className="badge" style={{ background: "#c0392b", color: "#fff" }}>
                          Banned
                        </span>
                      ) : suspended ? (
                        <span className="badge" style={{ background: "#d35400", color: "#fff" }}>
                          Suspended
                        </span>
                      ) : (
                        <span className="badge" style={{ background: "#27ae60", color: "#fff" }}>
                          Active
                        </span>
                      )}
                    </div>

                    <div style={{ marginTop: "6px", fontSize: "13px", color: "var(--muted)" }}>
                      <span style={{ fontFamily: "monospace", color: "var(--ink)" }}>{u.email}</span>
                      <span style={{ margin: "0 8px" }}>•</span>
                      <span>ID: <code>{u.id}</code></span>
                      {u.city && (
                        <>
                          <span style={{ margin: "0 8px" }}>•</span>
                          <span>City: {u.city}</span>
                        </>
                      )}
                      {u.role && (
                        <>
                          <span style={{ margin: "0 8px" }}>•</span>
                          <span>Role: {u.role}</span>
                        </>
                      )}
                    </div>

                    {(suspended || banned) && (
                      <div
                        style={{
                          marginTop: "12px",
                          padding: "10px 14px",
                          background: "rgba(211, 84, 0, 0.08)",
                          borderLeft: "4px solid #d35400",
                          borderRadius: "4px",
                          fontSize: "13px",
                        }}
                      >
                        <div>
                          <strong>{banned ? "Account Banned" : "Account Suspended"}</strong>
                          {u.suspended_until && u.suspended_until !== "infinity" && (
                            <span> until {new Date(u.suspended_until).toLocaleDateString()}</span>
                          )}
                        </div>
                        {u.suspension_reason && (
                          <div style={{ marginTop: "4px", color: "var(--ink)" }}>
                            Reason: {u.suspension_reason}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="button button-outline"
                      style={{ fontSize: "13px", padding: "6px 12px" }}
                      onClick={() => {
                        setSelectedUser(u);
                        setActionType("warn");
                      }}
                    >
                      Warn
                    </button>

                    {suspended || banned ? (
                      <button
                        type="button"
                        className="button button-outline"
                        style={{ fontSize: "13px", padding: "6px 12px" }}
                        onClick={() => {
                          setSelectedUser(u);
                          setActionType("unsuspend");
                        }}
                      >
                        Unsuspend
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="button button-outline"
                        style={{ fontSize: "13px", padding: "6px 12px" }}
                        onClick={() => {
                          setSelectedUser(u);
                          setActionType("suspend");
                        }}
                      >
                        Suspend
                      </button>
                    )}

                    {banned ? (
                      <button
                        type="button"
                        className="button button-outline"
                        style={{ fontSize: "13px", padding: "6px 12px" }}
                        onClick={() => {
                          setSelectedUser(u);
                          setActionType("unban");
                        }}
                      >
                        Unban
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="button button-outline"
                        style={{ fontSize: "13px", padding: "6px 12px", color: "#c0392b" }}
                        onClick={() => {
                          setSelectedUser(u);
                          setActionType("ban");
                        }}
                      >
                        Ban
                      </button>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                    gap: "12px",
                    marginTop: "16px",
                    paddingTop: "16px",
                    borderTop: "1px solid var(--line)",
                    fontSize: "12px",
                  }}
                >
                  <div>
                    <div className="muted">Listings</div>
                    <div style={{ fontSize: "14px", fontWeight: 600, marginTop: "2px" }}>
                      {u.listings_total} total ({u.listings_active} active, {u.listings_held} held)
                    </div>
                  </div>
                  <div>
                    <div className="muted">Reports Against</div>
                    <div style={{ fontSize: "14px", fontWeight: 600, marginTop: "2px" }}>
                      {u.reports_against} total
                      {u.open_reports_against > 0 && (
                        <span style={{ color: "#c0392b", marginLeft: "4px" }}>
                          ({u.open_reports_against} open)
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="muted">Reports Made</div>
                    <div style={{ fontSize: "14px", fontWeight: 600, marginTop: "2px" }}>
                      {u.reports_made}
                    </div>
                  </div>
                  <div>
                    <div className="muted">Warnings</div>
                    <div style={{ fontSize: "14px", fontWeight: 600, marginTop: "2px" }}>
                      {u.warnings}
                    </div>
                  </div>
                  <div>
                    <div className="muted">Signed Up</div>
                    <div style={{ fontSize: "13px", marginTop: "2px" }}>
                      {new Date(u.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div>
                    <div className="muted">Last Sign-in</div>
                    <div style={{ fontSize: "13px", marginTop: "2px" }}>
                      {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : "Never"}
                    </div>
                  </div>
                  <div>
                    <div className="muted">Age Check</div>
                    <div style={{ fontSize: "13px", marginTop: "2px", color: u.age_blocked ? "#8e44ad" : undefined }}>
                      {ageCheckLabel(u)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedUser && actionType === "suspend" && (
        <ActionDialog
          title={`Suspend @${selectedUser.studio_handle || selectedUser.email}`}
          description="A suspended user cannot post listings, send messages, or submit reports. Active listings will be held during suspension."
          actionLabel="Suspend user"
          onClose={() => {
            setSelectedUser(null);
            setActionType(null);
          }}
          onConfirm={handleAction}
        >
          <div style={{ marginBottom: "12px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 500 }}>
              <span style={{ display: "block", marginBottom: "4px" }}>Suspension duration (days):</span>
              <input
                type="number"
                min={1}
                max={3650}
                value={suspendDays}
                onChange={(e) => setSuspendDays(Math.max(1, parseInt(e.target.value) || 1))}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: "4px",
                  border: "1px solid var(--line)",
                  background: "var(--paper)",
                  color: "var(--ink)",
                }}
              />
            </label>
          </div>

        </ActionDialog>
      )}

      {selectedUser && actionType === "unsuspend" && (
        <ActionDialog
          title={`Unsuspend @${selectedUser.studio_handle || selectedUser.email}`}
          description="Clears the user suspension and restores their previously active listings."
          actionLabel="Unsuspend user"
          onClose={() => {
            setSelectedUser(null);
            setActionType(null);
          }}
          onConfirm={handleAction}
        />
      )}

      {selectedUser && actionType === "ban" && (
        <ActionDialog
          title={`Ban @${selectedUser.studio_handle || selectedUser.email}`}
          description="Banning disables the user's Supabase Auth credentials indefinitely and sets their suspension to infinity. Their listings will be paused."
          actionLabel="Ban user"
          onClose={() => {
            setSelectedUser(null);
            setActionType(null);
          }}
          onConfirm={handleAction}
        />
      )}

      {selectedUser && actionType === "unban" && (
        <ActionDialog
          title={`Unban @${selectedUser.studio_handle || selectedUser.email}`}
          description="Removes the Supabase Auth ban and clears the infinite suspension."
          actionLabel="Unban user"
          onClose={() => {
            setSelectedUser(null);
            setActionType(null);
          }}
          onConfirm={handleAction}
        />
      )}

      {selectedUser && actionType === "warn" && (
        <ActionDialog
          title={`Issue warning to @${selectedUser.studio_handle || selectedUser.email}`}
          description="The user will see this warning in their account notifications/profile."
          actionLabel="Issue warning"
          reasonPlaceholder="Describe the policy issue or warning note..."
          onClose={() => {
            setSelectedUser(null);
            setActionType(null);
          }}
          onConfirm={handleAction}
        />
      )}
    </div>
  );
}
