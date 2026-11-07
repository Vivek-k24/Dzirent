import { Metadata } from "next";

export const metadata: Metadata = {
  title: "ID Verification | Dzirent Admin",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";


export default function AdminIdVerificationPage() {
  return (
    <div className="admin-id-verification-page">
      <div style={{ marginBottom: "24px" }}>
        <h2>Identity Verification Reviews</h2>
        <p className="muted">Lender and renter identity check reviews</p>
      </div>

      <div
        style={{
          background: "var(--paper)",
          border: "1px solid var(--line)",
          borderRadius: "8px",
          padding: "48px 24px",
          textAlign: "center",
          maxWidth: "600px",
        }}
      >
        <div style={{ fontSize: "36px", marginBottom: "12px" }}>🪪</div>
        <h3 style={{ margin: "0 0 8px 0" }}>Not active yet</h3>
        <p className="muted" style={{ fontSize: "14px", lineHeight: "1.5", margin: 0 }}>
          Identity verification reviews will arrive with P6A (Didit integration).
          Until then, manual verification reviews are not required, and all users
          can list and rent without an active ID review queue.
        </p>
      </div>
    </div>
  );
}
