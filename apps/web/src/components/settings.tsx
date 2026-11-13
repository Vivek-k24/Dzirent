"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { workflow, type SettingsData } from "@/lib/workflows";
import { cityLabel } from "@/lib/types";
import { signOut } from "@/app/actions";
import { StudioEditor } from "./studio-editor";
import { MeasurementsEditor } from "./measurements-editor";
import { LocalPreferences } from "./local-preferences";
import { FinishSetupCard } from "./onboarding";
import { WorkflowModal, Notice } from "./workflow-ui";
import { Icon } from "./icon";
import { Empty } from "./cards";
import { UpdateLocation } from "./shell";
import type { NotificationChoicesData } from "@/lib/workflows";

/**
 * Settings > Notifications (C3): the same three switches as the apps. Notifications go to the
 * Dzirent app on your phone; the website itself sends none. Rental reminders: the day before a
 * pickup or return, and overdue returns.
 */
function NotificationChoices({ initial }: { initial: NotificationChoicesData }) {
  const [saved, setSaved] = useState(initial);
  const [error, setError] = useState("");
  async function save(next: NotificationChoicesData) {
    const before = saved;
    setSaved(next);
    setError("");
    try {
      await workflow("account/notifications", next);
    } catch (e) {
      setSaved(before);
      setError((e as Error).message);
    }
  }
  const rows: [keyof NotificationChoicesData, string, string][] = [
    ["messages", "Messages", "New messages, new chats, date changes and rental requests and answers"],
    ["show_message_text", "Show message text", "Show what they wrote in notifications, also on the lock screen"],
    ["rental_reminders", "Rental reminders", "The day before a pickup or return, and when a return is overdue"],
  ];
  return (
    <div className="account-section">
      <h3>Notifications</h3>
      <p className="muted">Notifications go to the Dzirent app on your phone.</p>
      {rows.map(([key, label, hint]) => (
        <div key={key} className="toggle-row">
          <input
            id={"notify-" + key}
            type="checkbox"
            checked={saved[key]}
            disabled={key === "show_message_text" && !saved.messages}
            onChange={(e) => void save({ ...saved, [key]: e.target.checked })}
          />
          <label htmlFor={"notify-" + key}>
            <strong>{label}</strong>
            <small className="muted"> {hint}</small>
          </label>
        </div>
      ))}
      <Notice message={error} error />
    </div>
  );
}
export function Settings({
  initial,
  section = "profile",
}: {
  initial: SettingsData;
  section?: string;
}) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  useEffect(() => {
    Promise.resolve().then(() => setData(initial));
  }, [initial]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState<
    "role" | "password" | "delete" | "withdraw_consent" | null
  >(null);
  const [confirmation, setConfirmation] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState({ text: "", error: false });
  /** Download my data (P3A): saves dzirent-data-<date>.json. Once a day. */
  async function downloadData() {
    setExporting(true);
    setExportMessage({ text: "", error: false });
    try {
      const response = await fetch("/api/workflows/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        cache: "no-store",
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "Couldn't prepare your data. Please try again.");
      }
      const blob = await response.blob();
      const name =
        /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") || "")?.[1] ||
        `dzirent-data-${new Date().toISOString().slice(0, 10)}.json`;
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      setExportMessage({ text: `Saved as ${name}.`, error: false });
    } catch (e) {
      setExportMessage({ text: (e as Error).message, error: true });
    } finally {
      setExporting(false);
    }
  }
  async function role(next: string, confirm = false) {
    setBusy(true);
    setError("");
    try {
      await workflow("account/role", { role: next, confirm });
      setData(await workflow<SettingsData>("settings"));
      setModal(null);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const links = [
    ["profile", "Profile", "user"],
    ...(data.profile.role !== "renter"
      ? [["studio", "My studio", "hanger"]]
      : []),
    ["measurements", "My measurements", "sparkle"],
    ["preferences", "Settings", "filter"],
    ["blocked", "Blocked users", "user"],
  ];
  return (
    <div className="page-width workflow-page settings-page">
      <div className="workflow-heading">
        <div>
          <span className="eyebrow accent">MAKE IT PERSONAL</span>
          <h1>Profile &amp; settings</h1>
        </div>
      </div>
      <div className="settings-layout">
        <aside>
          <div className="account-summary">
            <span className="avatar">
              {data.profile.display_name.slice(0, 1).toUpperCase()}
            </span>
            <strong>{data.profile.display_name}</strong>
            <p>{cityLabel(data.profile.city)}</p>
          </div>
          <nav aria-label="Account">
            {links.map(([s, label, icon]) => (
              <Link
                key={s}
                href={s === "profile" ? "/app/settings" : "/app/settings/" + s}
                aria-current={section === s ? "page" : undefined}
              >
                <Icon name={icon} />
                {label}
                <Icon name="chevron" />
              </Link>
            ))}
            <Link href="/about">
              <Icon name="compass" />
              About Dzirent
              <Icon name="chevron" />
            </Link>
          </nav>
          <form action={signOut}>
            <button className="text-button">Sign out</button>
          </form>
        </aside>
        <section className="settings-content">
          {section === "profile" ? (
            <>
              <FinishSetupCard
                userId={data.profile.id}
                profile={data.profile}
                privateProfile={data.privateProfile}
                onOpenChecklist={() =>
                  window.dispatchEvent(new Event("dzirent-open-checklist"))
                }
              />
              <h2>{data.profile.display_name}</h2>
              <p className="muted">{cityLabel(data.profile.city)}</p>
              <h3>I want to</h3>
              <div className="segmented-control role-choices">
                {[
                  ["renter", "Rent"],
                  ["lender", "Lend"],
                  ["both", "Both"],
                ].map(([r, label]) => (
                  <button
                    type="button"
                    key={r}
                    disabled={busy}
                    aria-pressed={data.profile.role === r}
                    onClick={() => {
                      if (r === data.profile.role) return;
                      if (r === "renter" && data.activeListings > 0) {
                        setModal("role");
                        return;
                      }
                      void role(r);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="muted">
                Your role controls what you see in your Closet.
              </p>
              <div className="profile-links">
                <Link href="/app/settings/measurements">
                  <span>
                    <strong>My measurements</strong>
                    <small>
                      Private. Used to find pieces likely to fit you.
                    </small>
                  </span>
                  <Icon name="chevron" />
                </Link>
                {data.profile.role !== "renter" && (
                  <Link href="/app/settings/studio">
                    <span>
                      <strong>My studio</strong>
                      <small>Your name, style and neighborhood.</small>
                    </span>
                    <Icon name="chevron" />
                  </Link>
                )}
              </div>
              <div className="account-section">
                <h3>Account</h3>
                <label className="field">
                  <span>Email</span>
                  <input type="email" value={data.email} readOnly />
                </label>
                <div className="button-row">
                  <button
                    className="button secondary"
                    onClick={() => {
                      setError("");
                      setModal("password");
                    }}
                  >
                    Change password
                  </button>
                  <button
                    className="text-button danger"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      setError("");
                      try {
                        setData(await workflow<SettingsData>("settings"));
                        setConfirmation("");
                        setModal("delete");
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Delete account
                  </button>
                </div>
              </div>
            </>
          ) : section === "studio" ? (
            <StudioEditor profile={data.profile} />
          ) : section === "measurements" ? (
            <MeasurementsEditor initial={data.privateProfile} />
          ) : section === "preferences" ? (
            <>
              <LocalPreferences />
              <h3>Location</h3>
              <p className="muted">
                {data.profile.city
                  ? cityLabel(data.profile.city)
                  : "Not set yet"}
              </p>
              <UpdateLocation />

              <NotificationChoices initial={data.notifications} />

              <h3 id="privacy">Privacy &amp; safety</h3>
              <div className="account-section">
                <strong>Download my data</strong>
                <p className="muted">
                  One file with everything Dzirent keeps about you: your account,
                  profile, measurements, listings and photos, chats, saved pieces and
                  more. Other people appear only by name and studio handle. You can
                  download it once a day.
                </p>
                <button
                  type="button"
                  className="button secondary compact"
                  disabled={exporting}
                  onClick={downloadData}
                >
                  {exporting ? "Preparing your file..." : "Download my data"}
                </button>
                <Notice message={exportMessage.text} error={exportMessage.error} />
              </div>
              <div className="account-section">
                <strong>Measurements consent</strong>
                <p className="muted">
                  {data.privateProfile?.measurements_consent_at
                    ? "Given. Click to withdraw it and delete your saved measurements."
                    : "Not given. You'll be asked when you save measurements."}
                </p>
                {data.privateProfile?.measurements_consent_at && (
                  <button
                    type="button"
                    className="button secondary compact danger-text"
                    disabled={busy}
                    onClick={() => {
                      setError("");
                      setModal("withdraw_consent");
                    }}
                  >
                    Withdraw consent
                  </button>
                )}
              </div>

              <h3>Help &amp; legal</h3>
              <div className="profile-links">
                <Link href="/help">
                  <span>
                    <strong>Help</strong>
                    <small>FAQs, guides, and support</small>
                  </span>
                  <Icon name="chevron" />
                </Link>
                <Link href="/safety">
                  <span>
                    <strong>Safety</strong>
                    <small>Trust and safety tips for meetups</small>
                  </span>
                  <Icon name="chevron" />
                </Link>
                <Link href="/community-guidelines">
                  <span>
                    <strong>Community guidelines</strong>
                    <small>Rules for respectful sharing</small>
                  </span>
                  <Icon name="chevron" />
                </Link>
                <Link href="/terms">
                  <span>
                    <strong>Terms</strong>
                    <small>Terms of Use</small>
                  </span>
                  <Icon name="chevron" />
                </Link>
                <Link href="/privacy">
                  <span>
                    <strong>Privacy</strong>
                    <small>Privacy Policy</small>
                  </span>
                  <Icon name="chevron" />
                </Link>
                <Link href="/copyright">
                  <span>
                    <strong>Copyright</strong>
                    <small>DMCA and intellectual property policy</small>
                  </span>
                  <Icon name="chevron" />
                </Link>
                <Link href="/delete-account">
                  <span>
                    <strong>Delete account</strong>
                    <small>Permanently delete your profile and data</small>
                  </span>
                  <Icon name="chevron" />
                </Link>
                <Link href="/support">
                  <span>
                    <strong>Support</strong>
                    <small>Contact our team</small>
                  </span>
                  <Icon name="chevron" />
                </Link>
                <button
                  type="button"
                  className="profile-link-btn"
                  onClick={() =>
                    window.dispatchEvent(new Event("dzirent-start-tour"))
                  }
                >
                  <span>
                    <strong>App tour</strong>
                    <small>Take the interactive tour of Dzirent</small>
                  </span>
                  <Icon name="chevron" />
                </button>
              </div>
            </>
          ) : section === "blocked" ? (
            <>
              <h2>Blocked users</h2>
              {data.blocks.length ? (
                <div className="blocked-list">
                  {data.blocks.map((b) => (
                    <div className="blocked-row" key={b.blocked_id}>
                      <span className="avatar">
                        <Icon name="user" />
                      </span>
                      <strong>Dzirent member</strong>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          setError("");
                          try {
                            await workflow("account/unblock", {
                              id: b.blocked_id,
                            });
                            setData((old) => ({
                              ...old,
                              blocks: old.blocks.filter(
                                (row) => row.blocked_id !== b.blocked_id,
                              ),
                            }));
                          } catch (e) {
                            setError((e as Error).message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Unblock
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty
                  title="No blocked users"
                  text="People you block from a chat show up here, and you can unblock them any time."
                />
              )}
            </>
          ) : null}
          <Notice message={error} error />
          <Notice message={notice} />
        </section>
      </div>
      {modal === "role" && (
        <WorkflowModal
          title="Switch to Rent only?"
          busy={busy}
          onClose={() => setModal(null)}
        >
          <p>
            Your listings will be paused. You can turn them on again after
            switching back to Lend or Both.
          </p>
          <Notice message={error} error />
          <div className="button-row">
            <button
              className="button"
              disabled={busy}
              onClick={() => void role("renter", true)}
            >
              Pause and switch
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setModal(null)}
            >
              Cancel
            </button>
          </div>
        </WorkflowModal>
      )}
      {modal === "password" && (
        <WorkflowModal
          title="Change password"
          busy={busy}
          onClose={() => setModal(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setBusy(true);
              setError("");
              try {
                await workflow("account/password", {
                  current: f.get("current"),
                  password: f.get("password"),
                });
                setModal(null);
                setNotice("Password changed");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <fieldset disabled={busy} className="workflow-fieldset">
              <label className="field">
                <span>Current password</span>
                <input
                  type="password"
                  name="current"
                  autoComplete="current-password"
                  minLength={8}
                  required
                />
              </label>
              <label className="field">
                <span>New password</span>
                <input
                  type="password"
                  name="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </label>
              <Notice message={error} error />
              <div className="button-row">
                <button className="button" disabled={busy}>
                  Change
                </button>
                <button
                  className="button secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => setModal(null)}
                >
                  Cancel
                </button>
              </div>
            </fieldset>
          </form>
        </WorkflowModal>
      )}
      {modal === "delete" && (
        <WorkflowModal
          title="Delete account?"
          busy={busy}
          onClose={() => setModal(null)}
        >
          {data.activeRentals > 0 ? (
            <>
              <p>
                You have active rentals. Mark them as returned or say the deal
                didn&apos;t happen in the chat before deleting your account.
              </p>
              <button className="button" onClick={() => setModal(null)}>
                OK
              </button>
            </>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  await workflow("account/delete", { confirm: confirmation });
                  router.replace("/");
                  router.refresh();
                } catch (e) {
                  setError((e as Error).message);
                  setBusy(false);
                }
              }}
            >
              <p>
                This permanently removes your profile and studio, listings and
                photos, chats and messages for both people, saves, measurements
                and rental history. Accessory declarations remain without your
                account.
              </p>
              <label className="field">
                <span>Type DELETE to confirm</span>
                <input
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  autoComplete="off"
                  disabled={busy}
                />
              </label>
              <Notice message={error} error />
              <div className="button-row">
                <button
                  className="button danger-button"
                  disabled={busy || confirmation.trim() !== "DELETE"}
                >
                  {busy ? "Deleting..." : "Delete account"}
                </button>
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setModal(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </WorkflowModal>
      )}
      {modal === "withdraw_consent" && (
        <WorkflowModal
          title="Withdraw consent?"
          busy={busy}
          onClose={() => setModal(null)}
        >
          <p>
            Your saved body measurements will be deleted, and &ldquo;Likely to
            fit you&rdquo; stops until you add them again.
          </p>
          <Notice message={error} error />
          <div className="button-row">
            <button
              className="button danger-button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await workflow("account/withdraw_measurements_consent");
                  setData((old) => ({
                    ...old,
                    privateProfile: old.privateProfile
                      ? {
                          ...old.privateProfile,
                          chest_cm: null,
                          waist_cm: null,
                          hips_cm: null,
                          shoulder_cm: null,
                          height_cm: null,
                          inseam_cm: null,
                          measurements_consent_at: null,
                        }
                      : null,
                  }));
                  setModal(null);
                  setNotice(
                    "Consent withdrawn. Your measurements were deleted.",
                  );
                  router.refresh();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Deleting..." : "Withdraw and delete"}
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => setModal(null)}
            >
              Cancel
            </button>
          </div>
        </WorkflowModal>
      )}
    </div>
  );
}
