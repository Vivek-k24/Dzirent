"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./icon";
import { isVerificationGate, verifyHref } from "@/lib/verification";
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
    const previouslyFocused = (typeof document !== "undefined" ? document.activeElement : null) as HTMLElement | null;
    d?.showModal();
    const handleClick = (e: MouseEvent) => {
      if (e.target === d && !busy) onClose();
    };
    d?.addEventListener("click", handleClick);
    return () => {
      d?.removeEventListener("click", handleClick);
      d?.close();
      previouslyFocused?.focus();
    };
  }, [busy, onClose]);

  return (
    <dialog
      ref={ref}
      className="modal workflow-modal"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
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
  verifyNext,
}: {
  message: string;
  error?: boolean;
  /** C6: where "Verify ID" comes back to (default: this page). */
  verifyNext?: string;
}) {
  return message ? (
    <p
      className={"form-message workflow-notice " + (error ? "error" : "")}
      role={error ? "alert" : "status"}
    >
      {message}
      {/* C6: the one-time ID check (DZ-E6001, only while verification_required is on). */}
      {error && isVerificationGate(message) && (
        <>
          {" "}
          <a
            className="text-link accent"
            href={verifyHref(verifyNext)}
            onClick={(e) => {
              e.preventDefault();
              window.location.assign(verifyHref(verifyNext ?? window.location.pathname + window.location.search));
            }}
          >
            Verify ID
          </a>
        </>
      )}
    </p>
  ) : null;
}
export function Changed() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("dzirent-inbox-changed"));
}
