"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import type { AuthNotice, AuthSessionRead } from "@dzirent/client";
import { api, clearCsrf, mode } from "@/lib/api";
import { acceptSession, logoutSession } from "@/lib/auth";
import { useSession } from "@/lib/store";
import { Button } from "@/components/ui/primitives";
import { SessionBoundary } from "../_components/connected-auth";

export default function Account() {
  const user = useSession(state => state.user), verified = useSession(state => state.emailVerified);
  const [operation, setOperation] = useState("change"), [currentPassword, setCurrentPassword] = useState(""), [newPassword, setNewPassword] = useState("");
  const [visible, setVisible] = useState(false), [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const router = useRouter(), client = useQueryClient();
  return <main id="main-content" className="content-width credits-page"><h1>Account security</h1>{mode.mode !== "connected" ? <p>Demo accounts simulate identity. Account security is available in connected mode.</p> : <SessionBoundary>{!user ? <Link href="/auth/renter/login">Sign in to manage your account</Link> : <div className="stack-form">
    <p>{user.display_name} · {user.email} · {verified ? "Email confirmed" : "Email verification pending"}</p>
    {!verified ? <Button variant="outline" disabled={busy} onClick={async () => {
      setBusy(true); setError(""); setNotice("");
      try {
        const result = await api<AuthNotice>("/auth/email/request", { method: "POST", body: "{}", protected: true });
        setNotice(result.message);
      } catch (error) { setError(error instanceof Error ? error.message : "Verification email unavailable."); }
      finally { setBusy(false); }
    }}>Request verification email (requires email delivery)</Button> : null}
    <p>Account deactivation hides owned listings and revokes sessions. There is no self-service reactivation.</p>
    <form className="stack-form" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError(""); setNotice("");
      try {
        if (operation === "change") {
          const result = await api<AuthSessionRead>("/auth/password/change", { method: "POST", body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }), protected: true });
          client.clear(); acceptSession(result); setNotice("Password changed. Other sessions and outstanding links were revoked.");
        } else {
          await api<void>(operation === "deactivate" ? "/auth/deactivate" : "/auth/logout-all", { method: "POST", body: JSON.stringify({ current_password: currentPassword }), protected: true });
          clearCsrf(); useSession.getState().signOut(); client.clear(); router.push("/auth/renter/login");
        }
      } catch (error) { setError(error instanceof Error ? error.message : "Account action unavailable."); }
      finally { setBusy(false); setCurrentPassword(""); setNewPassword(""); setVisible(false); setConfirm(false); }
    }}>
      <label htmlFor="security-action">Action<select id="security-action" value={operation} disabled={busy} onChange={event => { setOperation(event.target.value); setConfirm(false); setError(""); setNotice(""); }}><option value="change">Change password</option><option value="logout-all">Sign out all sessions</option><option value="deactivate">Deactivate account</option></select></label>
      <label htmlFor="current-password">Current password<input id="current-password" required type={visible ? "text" : "password"} maxLength={128} autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /></label>
      {operation === "change" ? <><label htmlFor="new-password">New password<input id="new-password" required type={visible ? "text" : "password"} minLength={12} maxLength={128} autoComplete="new-password" aria-describedby="security-rules" value={newPassword} onChange={event => setNewPassword(event.target.value)} /></label><p id="security-rules">12–128 characters. Use a long, unique passphrase.</p></> : null}
      <button type="button" className="text-button" aria-pressed={visible} onClick={() => setVisible(value => !value)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}{visible ? "Hide passwords" : "Show passwords"}</button>
      {operation === "deactivate" ? <label><input type="checkbox" checked={confirm} onChange={event => setConfirm(event.target.checked)} required />I understand this deactivates my account and hides my listings.</label> : null}
      {error ? <p className="field-error" role="alert">{error}</p> : null}{notice ? <p role="status">{notice}</p> : null}
      <Button type="submit" disabled={busy || (operation === "deactivate" && !confirm)}>{busy ? "Working…" : operation === "change" ? "Change password" : operation === "deactivate" ? "Deactivate account" : "Sign out all sessions"}</Button>
    </form>
    <Button variant="outline" disabled={busy} onClick={async () => {
      setBusy(true); setError("");
      try { await logoutSession(); client.clear(); router.push("/"); }
      catch (error) { setError(error instanceof Error ? error.message : "Sign out could not be confirmed."); }
      finally { setBusy(false); }
    }}>Sign out this session</Button>
    <Link href={user.lender_profile ? "/lender/dashboard" : "/auth/lender/signup"}>{user.lender_profile ? "Lender dashboard" : "Become a lender"}</Link>
  </div>}</SessionBoundary>}<p><Link href="/">Return to browsing</Link></p></main>;
}
