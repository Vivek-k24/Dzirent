"use client";

import { useState } from "react";
import { setFlagAction } from "@/lib/admin-actions";
import { ActionDialog } from "./action-dialog";

export type FeatureFlag = {
  key: string;
  enabled: boolean;
  description: string;
  updated_at: string;
};

const FLAG_EXPLANATIONS: Record<string, { title: string; enforcement: string }> = {
  vision_required: {
    title: "Vision & Photo Checks Enforcement",
    enforcement:
      "Enforces that listings must pass server photo checks before they can go active. Rejected or unverified listings will be blocked from publishing, and automatic re-checks can pause active listings.",
  },
  verification_required: {
    title: "Identity Verification Enforcement",
    enforcement:
      "Enforces identity verification before users can publish listings or transact on the marketplace.",
  },
  payments_enabled: {
    title: "In-App Payments Enforcement",
    enforcement:
      "Accepting a rental then waits for the renter's payment, pickup needs the deposit hold, and returns open the claim window. Turn it on only after the Integrations page shows Payments as configured; until then every payment step answers \"Payments aren't available yet.\"",
  },
  preview_label: {
    title: "\"Preview only\" Label",
    enforcement:
      "Shows \"Preview only\" in red in the website header, on every page, for every visitor.",
  },
};

export function FlagsView({ initialFlags }: { initialFlags: FeatureFlag[] }) {
  const [flags, setFlags] = useState<FeatureFlag[]>(initialFlags);
  const [pendingFlag, setPendingFlag] = useState<FeatureFlag | null>(null);
  const [targetState, setTargetState] = useState<boolean>(false);
  const [updating, setUpdating] = useState(false);

  async function handleConfirm() {
    if (!pendingFlag) return;
    setUpdating(true);
    try {
      await setFlagAction(pendingFlag.key, targetState);
      setFlags((prev) =>
        prev.map((f) =>
          f.key === pendingFlag.key
            ? { ...f, enabled: targetState, updated_at: new Date().toISOString() }
            : f,
        ),
      );
    } finally {
      setUpdating(false);
      setPendingFlag(null);
    }
  }

  return (
    <div className="admin-flags-view">
      <div style={{ marginBottom: "24px" }}>
        <h2>Feature Flags</h2>
        <p className="muted">
          Manage system-wide enforcement flags stored in <code>app_settings</code>.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: "800px" }}>
        {flags.map((flag) => {
          const info = FLAG_EXPLANATIONS[flag.key] || {
            title: flag.key,
            enforcement: flag.description,
          };

          return (
            <div
              key={flag.key}
              style={{
                background: "var(--paper)",
                border: "1px solid var(--line)",
                borderRadius: "8px",
                padding: "20px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "20px",
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: 1, minWidth: "260px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "16px", fontWeight: 600 }}>{info.title}</span>
                  <code>{flag.key}</code>
                  <span
                    className="badge"
                    style={{
                      background: flag.enabled ? "#27ae60" : "#7f8c8d",
                      color: "#fff",
                    }}
                  >
                    {flag.enabled ? "Active" : "Disabled"}
                  </span>
                </div>
                <div style={{ fontSize: "13px", color: "var(--muted)", marginTop: "6px" }}>
                  {flag.description}
                </div>
                <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "4px" }}>
                  Last updated: {new Date(flag.updated_at).toLocaleString()}
                </div>
              </div>

              <div>
                <button
                  type="button"
                  className={flag.enabled ? "button button-outline" : "button button-primary"}
                  onClick={() => {
                    setPendingFlag(flag);
                    setTargetState(!flag.enabled);
                  }}
                  disabled={updating}
                  style={{
                    minWidth: "120px",
                    color: flag.enabled ? "#c0392b" : undefined,
                  }}
                >
                  {flag.enabled ? "Turn OFF" : "Turn ON"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {pendingFlag && (
        <ActionDialog
          title={
            targetState
              ? `Enable ${FLAG_EXPLANATIONS[pendingFlag.key]?.title || pendingFlag.key}`
              : `Disable ${FLAG_EXPLANATIONS[pendingFlag.key]?.title || pendingFlag.key}`
          }
          description={
            targetState
              ? `${FLAG_EXPLANATIONS[pendingFlag.key]?.enforcement || ""} Are you sure you want to turn this flag ON?`
              : pendingFlag.key === "preview_label"
                ? `The "Preview only" label will disappear from the website header for everyone. Are you sure you want to turn this flag OFF?`
                : `This will disable enforcement of this feature across the marketplace. Are you sure you want to turn this flag OFF?`
          }
          actionLabel={targetState ? "Turn ON" : "Turn OFF"}
          requireReason={false}
          onClose={() => setPendingFlag(null)}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}
