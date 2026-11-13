"use client";
import { useState, useSyncExternalStore } from "react";
import { Icon } from "./icon";

const noSubscribe = () => () => {};
// The server (and the first render) say "Copy link"; the browser then says "Share" if it can.
const browserCanShare = () => typeof navigator.share === "function";
const serverCanShare = () => false;

/**
 * P5C Share: the browser's share menu where there is one (phones, some desktops), otherwise
 * "Copy link" with a "Link copied" confirmation. [text] is "<title> on Dzirent: <link>".
 */
export function ShareButton({ text, link, className = "button secondary" }: { text: string; link: string; className?: string }) {
  const [status, setStatus] = useState("");
  const canShare = useSyncExternalStore(noSubscribe, browserCanShare, serverCanShare);

  async function share() {
    setStatus("");
    if (canShare) {
      try {
        await navigator.share({ text });
        return;
      } catch (e) {
        // Closing the share menu is not an error.
        if ((e as Error).name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(link);
      setStatus("Link copied");
    } catch {
      setStatus("Couldn't copy the link. Copy it from the address bar.");
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={() => void share()}>
        <Icon name="share" />
        {canShare ? "Share" : "Copy link"}
      </button>
      <span className="share-status" role="status" aria-live="polite">
        {status}
      </span>
    </>
  );
}
