import { Metadata } from "next";
import { integrationsAction, type IntegrationStatus } from "@/lib/admin-actions";

export const metadata: Metadata = {
  title: "Admin: Integrations",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

/**
 * C4: for each outside service, only whether its secrets are set on the server. Secret values are
 * never shown, accepted or stored here; they are set as Supabase function secrets (contract.md).
 */
export default async function AdminIntegrationsPage() {
  let rows: IntegrationStatus[] | null = null;
  try {
    rows = await integrationsAction();
  } catch {
    rows = null;
  }
  return (
    <div className="admin-integrations-view">
      <div className="admin-section-heading">
        <div>
          <h1>Integrations</h1>
          <p className="muted">
            Whether each outside service has its keys set on the server. This page never shows or accepts a key:
            keys are set only as server secrets, by the team that runs Dzirent.
          </p>
        </div>
      </div>
      {rows === null ? (
        <p className="muted">The check couldn&apos;t be run. Try again.</p>
      ) : (
        <div style={{ overflowX: "auto", marginTop: "20px" }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Service</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td>{r.name}</td>
                  <td>
                    <span className="badge" style={{ background: r.configured ? "#27ae60" : "#7f8c8d", color: "#fff" }}>
                      {r.configured ? "Configured" : "Not configured"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
