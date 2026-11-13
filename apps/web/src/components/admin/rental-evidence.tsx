// C3: a rental as admins see it (report evidence and user lookup): who, dates, price, the whole
// timeline and the condition photos (private bucket; [links] are short-lived signed links).
type Snapshot = Record<string, unknown>;
type Step = { from: string | null; to: string; actor_role: string; note: string | null; at: string };
type Photo = { storage_path: string; stage: string; by_role: string; uploaded_at: string };

export function RentalEvidence({ snapshot, links }: { snapshot: Snapshot; links: Record<string, string> }) {
  if (snapshot.missing) return <p className="muted">The rental no longer exists.</p>;
  const steps = (snapshot.events as Step[]) || [];
  const photos = (snapshot.photos as Photo[]) || [];
  const money =
    snapshot.total != null
      ? `${String(snapshot.days)} days · $${String(snapshot.total)} (${String(snapshot.price_per_day)}/day)`
      : "No price recorded";
  return (
    <div className="admin-evidence-box">
      <h4>Rental: {String(snapshot.listing_title || "Listing no longer available")}</h4>
      <p>
        <strong>Renter:</strong> {String(snapshot.renter_name || "Deleted account")} (@{String(snapshot.renter_handle || "none")}) ·{" "}
        <strong>Lender:</strong> {String(snapshot.lender_name || "Deleted account")} (@{String(snapshot.lender_handle || "none")})
      </p>
      <p>
        <strong>State:</strong> {String(snapshot.status)} · <strong>Dates:</strong> {String(snapshot.start_date)} to{" "}
        {String(snapshot.end_date)} · {money}
      </p>
      <ol style={{ margin: "8px 0", paddingLeft: "18px", fontSize: "13px" }}>
        {steps.map((s, i) => (
          <li key={i}>
            {s.from ? `${s.from} → ` : ""}
            {s.to} by {s.actor_role} · {new Date(s.at).toLocaleString()}
            {s.note ? ` · “${s.note}”` : ""}
          </li>
        ))}
      </ol>
      {photos.length > 0 ? (
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          {photos.map((p) =>
            links[p.storage_path] ? (
              <a key={p.storage_path} href={links[p.storage_path]} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={links[p.storage_path]}
                  alt={`At ${p.stage}, by the ${p.by_role}, ${new Date(p.uploaded_at).toLocaleDateString()}`}
                  width={100}
                  height={100}
                  style={{ objectFit: "cover", borderRadius: "4px", border: "1px solid var(--line)" }}
                />
              </a>
            ) : (
              <span key={p.storage_path} className="muted" style={{ fontSize: "12px" }}>
                {p.stage} photo by the {p.by_role} (file removed)
              </span>
            ),
          )}
        </div>
      ) : (
        <p className="muted">No condition photos.</p>
      )}
    </div>
  );
}

/** Every condition photo path in a list of rental snapshots, for signing. */
export function rentalPhotoPaths(snapshots: Snapshot[]): string[] {
  return snapshots.flatMap((s) => ((s.photos as Photo[]) || []).map((p) => p.storage_path));
}
