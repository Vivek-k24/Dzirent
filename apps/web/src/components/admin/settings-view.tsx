"use client";

import { useState } from "react";
import { setSettingAction } from "@/lib/admin-actions";
import {
  decidedByLabels,
  formatSettingValue,
  groupSettings,
  parseSettingInput,
  settingInput,
  type AdminSetting,
} from "@/lib/admin-settings";
import { ActionDialog } from "./action-dialog";

/** C4: every business number and rule (app_private.settings), by area, with edit and a log entry. */
export function SettingsView({ initial }: { initial: AdminSetting[] }) {
  const [settings, setSettings] = useState<AdminSetting[]>(initial);
  const [editing, setEditing] = useState<AdminSetting | null>(null);
  const [input, setInput] = useState("");
  const [confirming, setConfirming] = useState<{ setting: AdminSetting; value: unknown } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const problem = editing ? parseSettingInput(editing, input) : null;

  function startEdit(s: AdminSetting) {
    setEditing(s);
    setInput(settingInput(s));
    setMessage(null);
  }

  async function save(reason: string) {
    if (!confirming) return;
    const result = await setSettingAction(confirming.setting.key, confirming.value, reason);
    setSettings((rows) =>
      rows.map((r) => (r.key === result.key ? { ...r, value: result.new_value, updated_at: new Date().toISOString() } : r)),
    );
    setMessage(`${confirming.setting.label} is now ${formatSettingValue(confirming.setting, result.new_value)}.`);
    setEditing(null);
  }

  return (
    <div className="admin-settings-view">
      <div className="admin-section-heading">
        <div>
          <h1>Settings</h1>
          <p className="muted">
            Every business number and rule Dzirent uses. A change takes effect at once, needs a reason, and is
            written to the audit log. Values outside a setting&apos;s range are refused.
          </p>
        </div>
      </div>
      {message && (
        <p role="status" className="form-message">
          {message}
        </p>
      )}
      {groupSettings(settings).map(([title, rows]) => (
        <section key={title} style={{ margin: "24px 0" }}>
          <h2 style={{ fontSize: "18px", margin: "0 0 12px" }}>{title}</h2>
          <div style={{ overflowX: "auto" }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Setting</th>
                  <th scope="col">Value</th>
                  <th scope="col">Allowed</th>
                  <th scope="col">Decided by</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.key}>
                    <td>
                      <strong>{s.label}</strong>
                      {s.affects_terms && (
                        <span className="badge" style={{ marginLeft: "8px" }}>
                          Legal pages
                        </span>
                      )}
                      <div className="muted" style={{ fontSize: "13px", marginTop: "4px" }}>
                        {s.description}
                      </div>
                      <code style={{ fontSize: "12px" }}>{s.key}</code>
                    </td>
                    <td>{formatSettingValue(s)}</td>
                    <td>
                      {s.min != null && s.max != null
                        ? `${s.min} to ${s.max}`
                        : s.type === "boolean"
                          ? "On or off"
                          : s.type === "timezone"
                            ? "A time zone name"
                            : (s.choices ?? []).join(", ")}
                    </td>
                    <td>{decidedByLabels[s.decided_by]}</td>
                    <td>
                      <button
                        type="button"
                        className="button button-outline compact"
                        onClick={() => startEdit(s)}
                        aria-label={`Edit ${s.label}`}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {editing && !confirming && (
        <ActionDialog
          title={`Edit ${editing.label}`}
          description={editing.description}
          actionLabel="Review the change"
          requireReason={false}
          onClose={() => setEditing(null)}
          onConfirm={() => {
            const parsed = parseSettingInput(editing, input);
            if (!parsed.ok) throw new Error(parsed.problem);
            setConfirming({ setting: editing, value: parsed.value });
          }}
        >
          <label className="field">
            <span>
              New value{editing.unit ? ` (${editing.unit})` : ""}
            </span>
            {editing.type === "boolean" ? (
              <select value={input} onChange={(e) => setInput(e.target.value)}>
                <option value="true">On</option>
                <option value="false">Off</option>
              </select>
            ) : editing.type === "choice" ? (
              <select value={input} onChange={(e) => setInput(e.target.value)}>
                {(editing.choices ?? []).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={input}
                inputMode={editing.type === "timezone" ? "text" : "decimal"}
                onChange={(e) => setInput(e.target.value)}
                aria-describedby="setting-problem"
              />
            )}
          </label>
          {problem && !problem.ok && (
            <p id="setting-problem" className="form-message error">
              {problem.problem}
            </p>
          )}
        </ActionDialog>
      )}

      {confirming && (
        <ActionDialog
          title={`Change ${confirming.setting.label}?`}
          description={`From ${formatSettingValue(confirming.setting)} to ${formatSettingValue(confirming.setting, confirming.setting.type === "rate_limit" ? { max: confirming.value } : confirming.value)}.`}
          actionLabel="Save the change"
          onClose={() => setConfirming(null)}
          onConfirm={async (reason) => {
            await save(reason);
            setConfirming(null);
          }}
        >
          {confirming.setting.affects_terms && (
            <div className="policy-note notice" role="note">
              <p>
                <strong>The legal pages may need updating.</strong> The Terms of Use or Privacy Policy state this
                value. Check them with the {decidedByLabels[confirming.setting.decided_by].toLowerCase()} before or right
                after this change.
              </p>
            </div>
          )}
        </ActionDialog>
      )}
    </div>
  );
}
