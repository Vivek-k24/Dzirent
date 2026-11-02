"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { workflow, isoToday } from "@/lib/workflows";
import { WorkflowModal, Notice } from "./workflow-ui";
import { Icon } from "./icon";
export function StartChat({
  listingId,
  start,
  end,
}: {
  listingId: string;
  start: string;
  end: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  return (
    <>
      <button className="button full" onClick={() => setOpen(true)}>
        <Icon name="message" />
        Message Lender
      </button>
      {open && (
        <WorkflowModal
          title="Your dates"
          onClose={() => setOpen(false)}
          busy={busy}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setBusy(true);
              setError("");
              try {
                const { id } = await workflow<{ id: string }>("start", {
                  listingId,
                  start: f.get("start"),
                  end: f.get("end"),
                });
                router.push("/app/messages/" + id);
                router.refresh();
              } catch (e) {
                setError((e as Error).message);
                setBusy(false);
              }
            }}
          >
            <div className="form-pair">
              <label className="field">
                <span>From</span>
                <input
                  type="date"
                  name="start"
                  defaultValue={start}
                  min={isoToday()}
                  required
                  disabled={busy}
                />
              </label>
              <label className="field">
                <span>To</span>
                <input
                  type="date"
                  name="end"
                  defaultValue={end}
                  min={isoToday()}
                  required
                  disabled={busy}
                />
              </label>
            </div>
            <Notice message={error} error />
            <button className="button full" disabled={busy}>
              {busy ? "Starting conversation..." : "Message Lender"}
            </button>
          </form>
        </WorkflowModal>
      )}
    </>
  );
}
