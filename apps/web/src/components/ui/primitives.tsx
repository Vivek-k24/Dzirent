"use client";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, AlertCircle, ArrowRight } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useRef, useState } from "react";
export const PopoverClose = DialogPrimitive.Close;

export function Button({ className = "", variant = "primary", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "outline" | "quiet" }) {
  return <button type="button" className={`button button-${variant} ${className}`} {...props} />;
}
export function Modal({ open, onOpenChange, title, description, children, side = "center", trigger, restoreId }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; children: ReactNode;
  side?: "left" | "right" | "center"; trigger?: ReactNode; restoreId?: string;
}) {
  const previousFocus = useRef<HTMLElement | null>(null);
  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
    {trigger ? <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger> : null}
    <DialogPrimitive.Portal><DialogPrimitive.Overlay className="dialog-overlay" /><DialogPrimitive.Content className={`dialog-content dialog-${side}`} onOpenAutoFocus={() => {
      previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }} onCloseAutoFocus={event => {
      let target = restoreId ? document.getElementById(restoreId) : previousFocus.current;
      if (target?.matches(":disabled")) target = target.closest("article, section")?.querySelector<HTMLElement>("button:not(:disabled), a[href]") ?? null;
      if (target?.isConnected) { event.preventDefault(); target.focus(); }
    }}>
      <div className="dialog-heading"><div><DialogPrimitive.Title>{title}</DialogPrimitive.Title><DialogPrimitive.Description className={description ? "muted" : "sr-only"}>{description ?? title}</DialogPrimitive.Description></div><DialogPrimitive.Close className="icon-button" aria-label={`Close ${title}`}><X size={20} /></DialogPrimitive.Close></div>
      {children}
    </DialogPrimitive.Content></DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}
export function Popover({ trigger, title, children, wide = false }: { trigger: ReactNode; title: string; children: ReactNode; wide?: boolean }) {
  const anchor = useRef<HTMLSpanElement>(null), [open, setOpen] = useState(false), [position, setPosition] = useState({ left: 16, top: 100, width: 340 });
  return <DialogPrimitive.Root modal={false} open={open} onOpenChange={value => {
    if (value && anchor.current) { const rect = anchor.current.getBoundingClientRect(); const width = Math.min(wide ? 640 : 340, window.innerWidth - 32); setPosition({ width, left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)), top: Math.max(16, Math.min(rect.bottom + 8, window.innerHeight - 440)) }); }
    setOpen(value);
  }}><span className="popover-root" ref={anchor}><DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger></span>
    <DialogPrimitive.Portal><DialogPrimitive.Content className="popover-content" style={position}><div className="popover-heading"><DialogPrimitive.Title>{title}</DialogPrimitive.Title><DialogPrimitive.Close className="icon-button" aria-label={`Close ${title}`}><X size={17} /></DialogPrimitive.Close></div><DialogPrimitive.Description className="sr-only">{title}. Selections apply immediately.</DialogPrimitive.Description>{children}</DialogPrimitive.Content></DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="error-state" role="alert"><AlertCircle size={25} /><h2>Something didn’t load</h2><p>{message}</p>{retry ? <Button variant="outline" onClick={retry}>Retry <ArrowRight size={15} /></Button> : null}</div>;
}
export function Skeletons() {
  return <div className="product-grid" aria-busy="true" aria-label="Loading outfits">{Array.from({ length: 8 }, (_, i) => <div className="skeleton-card" data-skeleton="true" aria-hidden="true" key={i}><div className="skeleton-photo" /><div className="skeleton-line" /><div className="skeleton-line short" /></div>)}</div>;
}
