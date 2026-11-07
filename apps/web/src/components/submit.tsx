"use client";
import { useRef, useState, type MouseEvent } from "react";
import { useFormStatus } from "react-dom";
import { Icon } from "./icon";
import { WorkflowModal } from "./workflow-ui";

/**
 * What still needs doing before the form can be sent, in plain words. A field can carry its own
 * wording for "empty" in data-required-message; otherwise its label and the browser's message are used.
 * Empty when the form is ready.
 */
function missingFields(form: HTMLFormElement | null | undefined): string[] {
  if (!form) return [];
  const missing: string[] = [];
  for (const el of Array.from(form.elements)) {
    if (
      !(el instanceof HTMLInputElement) &&
      !(el instanceof HTMLSelectElement) &&
      !(el instanceof HTMLTextAreaElement)
    )
      continue;
    if (el.willValidate && !el.checkValidity()) {
      const label = el.closest("label")?.querySelector("span")?.textContent?.trim();
      // The field's own wording is for an empty field; other problems (an email without @,
      // a password too short) keep the browser's explanation, under the field's label.
      const own = el.validity.valueMissing ? el.dataset.requiredMessage : undefined;
      missing.push(own || (label ? `${label}: ${el.validationMessage}` : el.validationMessage));
    }
  }
  return missing;
}

/** The overlay that lists what's missing, instead of the browser's grey bubble. */
function MissingDialog({ items, onClose }: { items: string[]; onClose: () => void }) {
  return (
    <WorkflowModal title="Before you continue" onClose={onClose}>
      <ul style={{ margin: "0 0 20px", paddingLeft: "20px" }}>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <div className="button-row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="button" onClick={onClose}>
          OK
        </button>
      </div>
    </WorkflowModal>
  );
}

/** The form's main button. Missing fields are listed in the site's overlay, not the browser's bubble. */
export function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  const [missing, setMissing] = useState<string[]>([]);
  function check(e: MouseEvent<HTMLButtonElement>) {
    const items = missingFields(e.currentTarget.form);
    if (items.length) {
      e.preventDefault();
      setMissing(items);
    }
  }
  return (
    <>
      <button className="button full" disabled={pending} onClick={check}>
        {pending ? "Just a moment..." : label}
        <Icon name="arrow" />
      </button>
      {missing.length > 0 && <MissingDialog items={missing} onClose={() => setMissing([])} />}
    </>
  );
}

/**
 * A button that asks for a confirmation in the site's overlay dialog, then sends its form.
 * Missing fields are listed first, in the same overlay.
 */
export function ConfirmSubmit({
  label,
  message,
  title = "Are you sure?",
  confirmLabel,
}: {
  label: string;
  message: string;
  title?: string;
  confirmLabel?: string;
}) {
  const { pending } = useFormStatus();
  const button = useRef<HTMLButtonElement>(null);
  const [asking, setAsking] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  function open() {
    const items = missingFields(button.current?.form);
    if (items.length) setMissing(items);
    else setAsking(true);
  }
  function confirm() {
    setAsking(false);
    button.current?.form?.requestSubmit();
  }
  return (
    <>
      <button
        ref={button}
        type="button"
        className="button secondary"
        disabled={pending}
        onClick={open}
      >
        {pending ? "Just a moment..." : label}
      </button>
      {asking && (
        <WorkflowModal title={title} onClose={() => setAsking(false)}>
          <p style={{ margin: "0 0 20px" }}>{message}</p>
          <div className="button-row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="button secondary" onClick={() => setAsking(false)}>
              Cancel
            </button>
            <button type="button" className="button" onClick={confirm}>
              {confirmLabel || label}
            </button>
          </div>
        </WorkflowModal>
      )}
      {missing.length > 0 && <MissingDialog items={missing} onClose={() => setMissing([])} />}
    </>
  );
}
