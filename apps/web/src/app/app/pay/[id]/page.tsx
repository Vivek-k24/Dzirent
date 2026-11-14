// C5: the renter pays an accepted rental here, in Stripe's own Payment Element. This is the only
// page that loads Stripe.js, and the only one whose Content-Security-Policy allows Stripe's
// domains (next.config.ts; security-log.md "Payments screens").
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import { session, uuid } from "@/lib/workflow-server";
import { Gate } from "@/components/cards";
import { PayForm, PaySummary } from "@/components/pay-form";
import type { RentalView } from "@/lib/rentals";

export const metadata: Metadata = {
  title: "Pay for your rental",
  robots: { index: false, follow: false },
};

export default async function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuid(id)) notFound();
  if (!(await currentUser())) return <Gate reason="pay for your rental" next={"/app/pay/" + id} />;
  const { client } = await session();
  const { data, error } = await client.rpc("get_rental", { p_rental_id: id });
  if (error || !data) notFound();
  const rental = data as RentalView;
  const chat = "/app/messages/" + rental.conversation_id;
  const ready = rental.your_role === "renter" && rental.status === "awaiting_payment" && rental.payments_enabled;
  return (
    <div className="page-width workflow-page pay-page">
      {/* A full page load back, so the chat runs under the site's stricter policy again. */}
      <a href={chat} className="text-link">
        <span aria-hidden="true">←</span> Back to the chat
      </a>
      <h1>Pay for {rental.listing_title || "your rental"}</h1>
      <PaySummary rental={rental} />
      {ready ? (
        <PayForm rentalId={rental.id} total={rental.total} deposit={rental.deposit_amount ?? null} dueAt={rental.payment_due_at ?? null} chatPath={chat} />
      ) : (
        <p className="muted">
          {rental.status === "paid" || rental.payment_status === "paid"
            ? "This rental is paid."
            : !rental.payments_enabled
              ? "Payments aren't available yet."
              : "This rental doesn't need a payment from you now."}
        </p>
      )}
    </div>
  );
}
