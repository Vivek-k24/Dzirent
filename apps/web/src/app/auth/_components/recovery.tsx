"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import type { AuthNotice } from "@dzirent/client";
import { api, clearCsrf, mode } from "@/lib/api";
import { verifyEmail } from "@/lib/auth";
import { useSession } from "@/lib/store";
import { Button } from "@/components/ui/primitives";

type RecoveryAction = "request" | "verify" | "reset";
const subscribe = () => () => {};
const browserSnapshot = () => true;
const serverSnapshot = () => false;

export function Recovery({ action }: { action: RecoveryAction }) {
  // Hydrate consistently, then mount the private form in the browser. No state update in an effect.
  const browser = useSyncExternalStore(subscribe, browserSnapshot, serverSnapshot);
  return browser ? <RecoveryForm key={action} action={action} /> : <p role="status">Loading account request…</p>;
}

function RecoveryForm({ action }: { action: RecoveryAction }) {
  const [token, setToken] = useState(() => {
    if (action === "request") return "";
    const value = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
    return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : "";
  });
  const [email, setEmail] = useState(""), [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  useEffect(() => {
    if (action === "request") return;
    // No token in query strings, referrers, storage or automatic GET/confirmation requests.
    window.history.replaceState(null, "", window.location.pathname);
  }, [action]);
  const title = action === "request" ? "Recover your account" : action === "verify" ? "Verify your email" : "Choose a new password";
  return <main id="main-content" className="content-width credits-page"><h1>{title}</h1>{mode.mode !== "connected" ? <p>Account recovery is available only in connected mode. Demo identities do not send email.</p> : <form className="stack-form" onSubmit={async event => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const path = action === "request" ? "/auth/password/request" : action === "verify" ? "/auth/email/verify" : "/auth/password/reset";
      const body = action === "request" ? { email } : action === "verify" ? { token } : { token, new_password: password };
      const result = action === "verify" ? await verifyEmail(token) : await api<AuthNotice>(path, { method: "POST", body: JSON.stringify(body) });
      setNotice(result.message);
      if (action !== "request") setToken("");
      if (action === "reset") { clearCsrf(); useSession.getState().signOut(); }
    } catch (error) { setError(error instanceof Error ? error.message : "Account request unavailable."); }
    finally { setBusy(false); setPassword(""); setVisible(false); }
  }}>
    {action === "request" ? <><p>Enter the email address you own. Requests use the same response whether or not an eligible account exists.</p><label htmlFor="recovery-email">Email<input id="recovery-email" type="email" autoComplete="username" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} /></label></> : !token ? <p role="status">{notice ? "This link has been consumed. You can sign in below." : "No usable link is present. Request a new link; refreshing this page clears a private token from memory."}</p> : <p>Confirm this request to consume your single-use link. Opening the page alone does not change your account.</p>}
    {action === "reset" && token ? <><label htmlFor="recovery-password">New password<span className="password-field"><input id="recovery-password" required type={visible ? "text" : "password"} minLength={12} maxLength={128} autoComplete="new-password" aria-describedby="recovery-rules" value={password} onChange={event => setPassword(event.target.value)} /><button type="button" className="icon-button" aria-pressed={visible} aria-label={visible ? "Hide password" : "Show password"} onClick={() => setVisible(value => !value)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label><p id="recovery-rules">12–128 characters. Use a long, unique passphrase.</p></> : null}
    {error ? <p role="alert" className="field-error">{error}</p> : null}{notice ? <p role="status">{notice}</p> : null}
    <Button type="submit" disabled={busy || (action !== "request" && !token)}>{busy ? "Working…" : action === "request" ? "Request recovery email" : action === "verify" ? "Verify email" : "Reset password"}</Button>
  </form>}<p><Link href="/auth/renter/login">Sign in</Link> · <Link href="/auth/forgot-password">Request a new recovery link</Link> · <Link href="/">Browse outfits</Link></p></main>;
}
