"use client";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icon";
export default function WorkflowFailure({ reset }: { reset: () => void }) {
  const path = usePathname();
  return (
    <div className="page-width workflow-page empty-state">
      <Icon name="closet" />
      <h1>
        {path === "/app/messages"
          ? "Failed to load your inbox."
          : path === "/app/closet"
            ? "Failed to load your closet."
            : "Could not load this page."}
      </h1>
      <p>Please try again.</p>
      <button className="button" onClick={reset}>
        Retry
      </button>
    </div>
  );
}
