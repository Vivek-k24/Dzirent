"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./icon";
export function WorkflowModal({
  title,
  onClose,
  busy = false,
  children,
}: {
  title: string;
  onClose: () => void;
  busy?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal workflow-modal"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current && !busy) onClose();
      }}
    >
      <div className="modal-content">
        <div className="modal-top">
          <h2>{title}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close"
            disabled={busy}
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
export function Notice({
  message,
  error = false,
}: {
  message: string;
  error?: boolean;
}) {
  return message ? (
    <p
      className={"form-message workflow-notice " + (error ? "error" : "")}
      role={error ? "alert" : "status"}
    >
      {message}
    </p>
  ) : null;
}
export function Changed() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("dzirent-inbox-changed"));
}
