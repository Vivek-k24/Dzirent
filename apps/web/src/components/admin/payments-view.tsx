"use client";

import { useState } from "react";
import { claimEvidenceLinksAction, decideClaimAction, refundRentalAction } from "@/lib/admin-actions";
import { ActionDialog } from "./action-dialog";

type Person = { id: string; name: string | null; handle: string | null } | null;
export type PaymentsOverview = {
  payments_enabled: boolean;
  claims: {
    id: string;
    rental_id: string;
    status: "open" | "disputed";
    amount: number;
    reason: string;
    evidence_paths: string[];
    renter_note: string | null;
    deposit_amount: number | null;
    deposit_status: string;
    listing_title: string | null;
    lender: Person;
    renter: Person;
    created_at: string;
  }[];
  card_disputes: { id: string; rental_id: string | null; amount: number | null; reason: string | null; status: string | null; opened_at: string | null; closed_at: string | null }[];
  failed_payments: { rental_id: string; status: string; payment_status: string; deposit_status: string; total: number | null; deposit_amount: number | null; listing_title: string | null; lender: Person; renter: Person; updated_at: string }[];
  failed_operations: { id: string; rental_id: string | null; kind: string; amount: number | null; error: string | null; attempts: number; created_at: string }[];
  payout_problems: { lender: Person; charges_enabled: boolean; payouts_enabled: boolean; details_submitted: boolean; updated_at: string }[];
  refundable: { rental_id: string; status: string; payment_status: string; total: number | null; refund_amount: number; refundable: number; listing_title: string | null; renter: Person; lender: Person; start_date: string; end_date: string }[];
};

const money = (n: number | null | undefined) => (n == null ? "-" : `$${Number(n).toFixed(2)}`);
const who = (p: Person) => (p ? `${p.name ?? "Unknown"}${p.handle ? ` (@${p.handle})` : ""}` : "Deleted account");
const when = (t: string | null) => (t ? new Date(t).toLocaleString() : "");
const short = (id: string | null) => (id ? id.slice(0, 8) : "-");
const STEP_NAMES: Record<string, string> = {
  refund: "Refund",
  payment_cancel: "Cancel an unpaid payment",
  deposit_place: "Place a deposit hold",
  deposit_release: "Release a deposit hold",
  deposit_capture: "Capture from a deposit",
  deposit_renew: "Renew a deposit hold",
};

function AmountField({ label, value, onChange, max }: { label: string; value: string; onChange: (v: string) => void; max: number }) {
  return (
    <label className="field">
      <span>
        {label} (at most {money(max)})
      </span>
      <input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function amountOf(text: string, max: number, allowZero: boolean): number {
  const n = Number(text.trim());
  if (!/^\d+(\.\d{1,2})?$/.test(text.trim()) || n > max || (!allowZero && n <= 0)) {
    throw new Error(`Enter an amount ${allowZero ? "from $0" : "above $0"} up to ${money(max)}.`);
  }
  return n;
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section style={{ margin: "28px 0" }}>
      <h2 style={{ fontSize: "18px", margin: "0 0 12px" }}>
        {title} ({count})
      </h2>
      {count === 0 ? <p className="muted">Nothing here.</p> : children}
    </section>
  );
}

export function PaymentsView({ overview }: { overview: PaymentsOverview }) {
  const [claims, setClaims] = useState(overview.claims);
  const [refundable, setRefundable] = useState(overview.refundable);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [deciding, setDeciding] = useState<PaymentsOverview["claims"][number] | null>(null);
  const [refunding, setRefunding] = useState<PaymentsOverview["refundable"][number] | null>(null);
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="admin-payments-view">
      <div className="admin-section-heading">
        <div>
          <h1>Payments</h1>
          <p className="muted">
            Claims, card disputes, failed payments and payouts. Payments are{" "}
            <strong>{overview.payments_enabled ? "on" : "off"}</strong> (Flags). Money moves through the payment
            processor; every decision here needs a reason and is written to the audit log.
          </p>
        </div>
      </div>
      {message && (
        <p role="status" className="form-message">
          {message}
        </p>
      )}

      <Section title="Open and disputed claims" count={claims.length}>
        {claims.map((c) => (
          <div key={c.id} className="admin-evidence-box" style={{ marginBottom: "12px" }}>
            <h3 style={{ fontSize: "16px", margin: "0 0 6px" }}>
              {c.listing_title ?? "Listing no longer available"} · {money(c.amount)} of a {money(c.deposit_amount)} deposit ·{" "}
              {c.status === "disputed" ? "Disputed by the renter" : "Waiting for the renter"}
            </h3>
            <p>
              <strong>Lender:</strong> {who(c.lender)} · <strong>Renter:</strong> {who(c.renter)} · rental{" "}
              <code>{short(c.rental_id)}</code> · filed {when(c.created_at)}
            </p>
            <p>
              <strong>Reason:</strong> {c.reason}
              {c.renter_note && (
                <>
                  {" "}
                  · <strong>Renter:</strong> {c.renter_note}
                </>
              )}
            </p>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", margin: "8px 0" }}>
              {c.evidence_paths.map((p, i) =>
                links[p] ? (
                  <a key={p} href={links[p]} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={links[p]} alt={`Claim evidence ${i + 1}: the piece at return`} width={100} height={100} style={{ objectFit: "cover", borderRadius: "4px" }} />
                  </a>
                ) : null,
              )}
            </div>
            <div className="button-row">
              <button
                type="button"
                className="button secondary compact"
                onClick={async () => setLinks({ ...links, ...(await claimEvidenceLinksAction(c.evidence_paths)) })}
              >
                Show evidence ({c.evidence_paths.length})
              </button>
              <button
                type="button"
                className="button compact"
                onClick={() => {
                  setDeciding(c);
                  setAmount(String(c.amount));
                }}
              >
                Decide claim
              </button>
            </div>
          </div>
        ))}
      </Section>

      <Section title="Card disputes" count={overview.card_disputes.length}>
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Dispute</th>
              <th scope="col">Rental</th>
              <th scope="col">Amount</th>
              <th scope="col">Reason</th>
              <th scope="col">Status</th>
              <th scope="col">Opened</th>
            </tr>
          </thead>
          <tbody>
            {overview.card_disputes.map((d) => (
              <tr key={d.id}>
                <td>
                  <code>{d.id}</code>
                </td>
                <td>
                  <code>{short(d.rental_id)}</code>
                </td>
                <td>{money(d.amount)}</td>
                <td>{d.reason ?? ""}</td>
                <td>{d.status ?? ""}</td>
                <td>{when(d.opened_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted">Respond to card disputes in the payment processor&apos;s dashboard.</p>
      </Section>

      <Section title="Failed payments and deposit holds" count={overview.failed_payments.length}>
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Rental</th>
              <th scope="col">Piece</th>
              <th scope="col">Renter</th>
              <th scope="col">Payment</th>
              <th scope="col">Deposit</th>
            </tr>
          </thead>
          <tbody>
            {overview.failed_payments.map((f) => (
              <tr key={f.rental_id}>
                <td>
                  <code>{short(f.rental_id)}</code> ({f.status})
                </td>
                <td>{f.listing_title ?? ""}</td>
                <td>{who(f.renter)}</td>
                <td>
                  {f.payment_status} · {money(f.total)}
                </td>
                <td>
                  {f.deposit_status} · {money(f.deposit_amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Failed payment steps" count={overview.failed_operations.length}>
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Step</th>
              <th scope="col">Rental</th>
              <th scope="col">Amount</th>
              <th scope="col">Error</th>
              <th scope="col">Tries</th>
            </tr>
          </thead>
          <tbody>
            {overview.failed_operations.map((o) => (
              <tr key={o.id}>
                <td>{STEP_NAMES[o.kind] ?? o.kind}</td>
                <td>
                  <code>{short(o.rental_id)}</code>
                </td>
                <td>{money(o.amount)}</td>
                <td>{o.error ?? ""}</td>
                <td>{o.attempts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Payout accounts with problems (failed payouts)" count={overview.payout_problems.length}>
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Lender</th>
              <th scope="col">Charges</th>
              <th scope="col">Payouts</th>
              <th scope="col">Updated</th>
            </tr>
          </thead>
          <tbody>
            {overview.payout_problems.map((p, i) => (
              <tr key={i}>
                <td>{who(p.lender)}</td>
                <td>{p.charges_enabled ? "On" : "Off"}</td>
                <td>{p.payouts_enabled ? "On" : "Off"}</td>
                <td>{when(p.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Paid rentals (refund)" count={refundable.length}>
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Rental</th>
              <th scope="col">Piece</th>
              <th scope="col">Renter</th>
              <th scope="col">Paid</th>
              <th scope="col">Refunded</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {refundable.map((r) => (
              <tr key={r.rental_id}>
                <td>
                  <code>{short(r.rental_id)}</code> ({r.status}) {r.start_date} to {r.end_date}
                </td>
                <td>{r.listing_title ?? ""}</td>
                <td>{who(r.renter)}</td>
                <td>{money(r.total)}</td>
                <td>{money(r.refund_amount)}</td>
                <td>
                  <button
                    type="button"
                    className="button button-outline compact"
                    disabled={r.refundable <= 0}
                    onClick={() => {
                      setRefunding(r);
                      setAmount(String(r.refundable));
                    }}
                    aria-label={`Refund rental ${short(r.rental_id)}`}
                  >
                    Refund
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {deciding && (
        <ActionDialog
          title="Decide the claim"
          description={`Capture up to ${money(Math.min(deciding.amount, deciding.deposit_amount ?? 0))} from the renter's deposit for the lender. $0 releases the whole hold. The rental then completes and both people are told.`}
          actionLabel="Decide"
          onClose={() => setDeciding(null)}
          onConfirm={async (reason) => {
            const max = Math.min(deciding.amount, deciding.deposit_amount ?? 0);
            const n = amountOf(amount, max, true);
            await decideClaimAction(deciding.id, n, reason);
            setClaims((rows) => rows.filter((c) => c.id !== deciding.id));
            setMessage(n > 0 ? `Claim decided: ${money(n)} will be captured.` : "Claim decided: the deposit hold will be released.");
          }}
        >
          <AmountField label="Capture" value={amount} onChange={setAmount} max={Math.min(deciding.amount, deciding.deposit_amount ?? 0)} />
        </ActionDialog>
      )}

      {refunding && (
        <ActionDialog
          title="Refund the renter"
          description="The refund goes back to the renter's card through the payment processor; the lender's share and the fee come back in proportion."
          actionLabel="Refund"
          danger
          onClose={() => setRefunding(null)}
          onConfirm={async (reason) => {
            const n = amountOf(amount, refunding.refundable, false);
            await refundRentalAction(refunding.rental_id, n, reason);
            setRefundable((rows) => rows.map((r) => (r.rental_id === refunding.rental_id ? { ...r, refundable: r.refundable - n } : r)));
            setMessage(`Refund of ${money(n)} sent to the payment processor.`);
          }}
        >
          <AmountField label="Refund" value={amount} onChange={setAmount} max={refunding.refundable} />
        </ActionDialog>
      )}
    </div>
  );
}
