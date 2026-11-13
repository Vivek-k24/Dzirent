"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/icon";

export function ActionDialog({
  title,
  description,
  confirmLabel,
  actionLabel,
  danger = false,
  requireReason = true,
  reasonPlaceholder = "Write a reason for this action (at least 3 characters)...",
  children,
  onConfirm,
  onClose,
}: {
  title: string;
  description?: string;
  confirmLabel?: string;
  actionLabel?: string;
  danger?: boolean;
  requireReason?: boolean;
  reasonPlaceholder?: string;
  children?: ReactNode;
  onConfirm: (reason: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const buttonLabel = confirmLabel || actionLabel || "Confirm";


  useEffect(() => {
    const dialog = ref.current;
    const previouslyFocused = (typeof document !== "undefined" ? document.activeElement : null) as HTMLElement | null;
    dialog?.showModal();
    const handleClick = (e: MouseEvent) => {
      if (e.target === dialog && !busy) onClose();
    };
    dialog?.addEventListener("click", handleClick);
    return () => {
      dialog?.removeEventListener("click", handleClick);
      dialog?.close();
      previouslyFocused?.focus();
    };
  }, [busy, onClose]);


  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (requireReason && reason.trim().length < 3) {
      setError("Please write a reason of at least 3 characters.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (err) {
      setError((err as Error).message || "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      className="modal admin-action-dialog"
      aria-label={title}
      onCancel={onClose}
    >

      <div className="modal-content" style={{ maxWidth: "520px" }}>
        <div className="modal-top">
          <h2>{title}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close"
            onClick={onClose}
            disabled={busy}
          >
            <Icon name="close" />
          </button>
        </div>
        {description && <p className="muted" style={{ margin: "0 0 16px" }}>{description}</p>}
        {error && (
          <div className="policy-note notice error" style={{ margin: "0 0 16px" }}>
            <p><strong>{error}</strong></p>
          </div>
        )}
        <form onSubmit={handleSubmit}>
          {children}
          {requireReason && (
            <label className="field" style={{ margin: "14px 0" }}>
              <span>Reason</span>
              <textarea
                rows={3}
                required
                value={reason}
                placeholder={reasonPlaceholder}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (error) setError("");
                }}
                disabled={busy}
              />
            </label>
          )}
          <div className="button-row" style={{ marginTop: "20px", justifyContent: "flex-end" }}>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={danger ? "button danger" : "button"}
              disabled={busy || (requireReason && reason.trim().length < 3)}
              style={danger ? { background: "var(--danger, #c62828)", borderColor: "var(--danger, #c62828)" } : undefined}
            >
              {busy ? "Saving..." : buttonLabel}

            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
