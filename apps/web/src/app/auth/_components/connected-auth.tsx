"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, ArrowRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { AuthNotice, AuthSessionRead } from "@dzirent/client";
import { api } from "@/lib/api";
import { acceptSession, registerAndLogin, restoreSession } from "@/lib/auth";
import { useSession } from "@/lib/store";
import { Button } from "@/components/ui/primitives";

export function SessionBoundary({ children }: { children: ReactNode }) {
  const status = useSession(state => state.status), error = useSession(state => state.error);
  if (status === "checking") return <p role="status">Checking your session…</p>;
  if (status === "unavailable") return <div className="stack-form"><p role="alert">Session check unavailable. {error}</p><Button onClick={() => void restoreSession()}>Retry session check</Button><Link href="/">Continue browsing</Link></div>;
  return children;
}

function VerificationNotice() {
  const [notice, setNotice] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  return <div className="stack-form"><p>Email verification is pending. Lender access requires a confirmed email address. You can continue browsing with your ordinary account.</p><p>Verification and password recovery require email delivery and may be unavailable in staging. When delivery is available, request a verification email and confirm the newest link explicitly.</p>
    <Button disabled={busy} onClick={async () => {
      setBusy(true); setError(""); setNotice("");
      try { const result = await api<AuthNotice>("/auth/email/request", { method: "POST", body: "{}", protected: true }); setNotice(result.message); }
      catch (error) { setError(error instanceof Error ? error.message : "Verification request unavailable."); }
      finally { setBusy(false); }
    }}>{busy ? "Requesting…" : "Request verification email"}</Button>
    <Button variant="outline" onClick={() => void restoreSession()}>Check verification status</Button>
    {notice ? <p role="status">{notice}</p> : null}{error ? <p className="field-error" role="alert">{error}</p> : null}
    <Link href="/auth/account">Account security and sign out</Link><Link href="/">Continue browsing</Link>
  </div>;
}

export function ConnectedAuth({ role, action, destination, enrollment }: { role: "renter" | "lender"; action: "login" | "signup"; destination: () => void; enrollment: ReactNode }) {
  const user = useSession(state => state.user), verified = useSession(state => state.emailVerified), synthetic = useSession(state => state.synthetic);
  const [visible, setVisible] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const client = useQueryClient();
  const schema = z.object({ email: z.email("Enter a valid email address.").max(254), password: z.string().min(action === "signup" ? 12 : 1).max(128), display_name: z.string().max(100) });
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "", display_name: "" } });
  return <SessionBoundary>{user ? role === "lender" && !verified ? <VerificationNotice /> : <div className="stack-form">
    {!verified ? <p role="status">Email verification pending. Your account has renter access; lender access requires verification.</p> : null}
    {!verified ? <VerificationNotice /> : null}
    {synthetic ? <p className="info-note">Synthetic staging identity. Email status is operator asserted; no sample-domain email is sent.</p> : null}
    {role === "lender" && !user.lender_profile ? enrollment : <><p>Signed in as {user.display_name}.</p><Button onClick={destination}>{role === "lender" ? "Open lender dashboard" : "Continue browsing"}<ArrowRight size={17} /></Button></>}
    <Link href="/auth/account">Account security and sign out</Link>
  </div> : <form className="stack-form" onSubmit={form.handleSubmit(async values => {
    setError(""); setNotice("");
    if (action === "signup" && !values.display_name.trim()) { form.setError("display_name", { message: "Enter a display name." }); return; }
    try {
      const result = action === "signup"
        ? await registerAndLogin(values)
        : await api<AuthSessionRead>("/auth/login", { method: "POST", body: JSON.stringify({ email: values.email, password: values.password }) });
      client.clear(); acceptSession(result);
      if (role !== "lender" || (result.email_verified && result.user.lender_profile)) destination();
    } catch (error) { setError(error instanceof Error ? error.message : "Authentication is unavailable."); }
    finally { form.resetField("password"); setVisible(false); }
  })}>
    <p>One Dzirent account can rent and lend. Signing up here creates ordinary renter membership; lender enrollment is a separate verified step.</p>
    {action === "signup" ? <><label htmlFor="native-name">Display name<input id="native-name" autoComplete="nickname" {...form.register("display_name")} aria-invalid={!!form.formState.errors.display_name} /></label><p className="field-error">{form.formState.errors.display_name?.message}</p></> : null}
    <label htmlFor="native-email">Email you own<input id="native-email" type="email" autoComplete="username" {...form.register("email")} aria-invalid={!!form.formState.errors.email} /></label><p className="field-error">{form.formState.errors.email?.message}</p>
    <label htmlFor="native-password">Password<span className="password-field"><input id="native-password" type={visible ? "text" : "password"} autoComplete={action === "signup" ? "new-password" : "current-password"} {...form.register("password")} minLength={action === "signup" ? 12 : 1} maxLength={128} aria-invalid={!!form.formState.errors.password} aria-describedby="native-password-rules" /><button type="button" className="icon-button" aria-pressed={visible} aria-label={visible ? "Hide password" : "Show password"} onClick={() => setVisible(value => !value)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
    <p id="native-password-rules" className="tiny muted">{action === "signup" ? "Use 12–128 characters. A long, unique passphrase is recommended; no character pattern is required." : "Use your Dzirent account password."}</p><p className="field-error">{form.formState.errors.password?.message}</p>
    {error ? <p className="field-error" role="alert">{error}</p> : null}{notice ? <p role="status">{notice}</p> : null}
    <Button type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? "Working…" : action === "signup" ? "Create account" : "Sign in"}<ArrowRight size={17} /></Button>
    <Link href={`/auth/${role}/${action === "signup" ? "login" : "signup"}`}>{action === "signup" ? "Already registered? Sign in" : "Create an account"}</Link><Link href="/auth/forgot-password">Password recovery (requires email delivery)</Link>
  </form>}</SessionBoundary>;
}
