"use client";
import Link from "next/link";
import { type ReactNode, type CSSProperties, useRef, useEffect } from "react";
import { Icon } from "./icon";

export type GatedActionKey = "save" | "message" | "studio" | "list" | "fit";

export const GATED_ACTIONS: Record<
  GatedActionKey,
  { title: string; message: string }
> = {
  save: {
    title: "Save pieces to your closet",
    message: "Sign in or create an account to save pieces and view them anytime.",
  },
  message: {
    title: "Message the lender",
    message: "Sign in or create an account to chat with lenders and arrange rentals.",
  },
  studio: {
    title: "View lender studios",
    message: "Sign in or create an account to see lender studios and saved collections.",
  },
  list: {
    title: "List a piece",
    message: "Sign in or create an account to list your outfits and start renting them.",
  },
  fit: {
    title: "See what fits you",
    message: "Sign in or create an account and save your measurements to see personalized fit matches.",
  },
};

export function openGuestGate(action: GatedActionKey) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("dzirent-open-guest-gate", { detail: { action } }),
    );
  }
}

export function GuestGateDialog({
  action,
  nextUrl,
  onClose,
}: {
  action: GatedActionKey;
  nextUrl?: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const info = GATED_ACTIONS[action] || GATED_ACTIONS.save;
  const returnUrl =
    nextUrl ||
    (typeof window !== "undefined"
      ? window.location.pathname + window.location.search
      : "/");

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
    return () => {
      if (dialog && dialog.open) {
        dialog.close();
      }
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className="modal guest-gate-modal"
      aria-label={info.title}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-content">
        <div className="modal-top">
          <h2>{info.title}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        <p
          className="muted"
          style={{
            margin: "10px 0 24px",
            lineHeight: "1.6",
            fontSize: "14px",
          }}
        >
          {info.message}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <Link
            href={"/auth?mode=signup&next=" + encodeURIComponent(returnUrl)}
            className="button full"
            onClick={onClose}
          >
            Create account
          </Link>
          <Link
            href={"/auth?mode=signin&next=" + encodeURIComponent(returnUrl)}
            className="button secondary full"
            onClick={onClose}
          >
            Sign in
          </Link>
          <button
            type="button"
            className="text-button full"
            onClick={onClose}
            style={{ textAlign: "center", padding: "10px" }}
          >
            Not now
          </button>
        </div>
      </div>
    </dialog>
  );
}

export function GatedActionTrigger({
  action,
  authenticated,
  href,
  children,
  className = "",
  style,
  onClick,
}: {
  action: GatedActionKey;
  authenticated?: boolean;
  href?: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
}) {
  if (authenticated && href) {
    return (
      <Link href={href} className={className} style={style} onClick={onClick}>
        {children}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={className}
      style={style}
      onClick={(e) => {
        if (!authenticated) {
          e.preventDefault();
          openGuestGate(action);
        } else if (onClick) {
          onClick();
        }
      }}
    >
      {children}
    </button>
  );
}
