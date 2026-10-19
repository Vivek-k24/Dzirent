"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, Eye, EyeOff, Shirt } from "lucide-react";
import { safeReturnTo } from "@dzirent/client";
import type { CurrentUser } from "@dzirent/client";
import { api } from "@/lib/api";
import { useSession } from "@/lib/store";
import { useReferences, useRuntime } from "./providers";
import { Button, Modal } from "./ui/primitives";

const credentials = z.object({ display_name: z.string().trim().min(1, "Enter a display name.").max(100), email: z.enum(["renter@example.invalid", "lender@example.invalid"]), demo_password: z.literal("demo-only") });
const enrollment = z.object({ display_name: z.string().trim().min(1, "Enter a display name.").max(100), metro_id: z.uuid("Choose a metro.") });

function EnrollmentForm({ done }: { done: () => void }) {
  const user = useSession(s => s.user), role = useSession(s => s.role), { refs } = useReferences(), [error, setError] = useState("");
  const form = useForm<z.infer<typeof enrollment>>({ resolver: zodResolver(enrollment), defaultValues: { display_name: user?.display_name ?? "Sample Lender", metro_id: refs?.locations.items[0]?.id ?? "" } });
  return <form className="stack-form" onSubmit={form.handleSubmit(async values => {
    setError("");
    try { await api("/me/lender-profile", { method: "POST", body: JSON.stringify(values), protected: true }); const updated = await api<CurrentUser>("/me", { protected: true }); useSession.getState().signIn(updated, role!); done(); }
    catch (error) { setError(error instanceof Error ? error.message : "Enrollment failed."); }
  })}><p className="info-note">You’re signed in as a sample renter. Add a lender profile to start your own demo wardrobe.</p>
    <label htmlFor="enroll-name">Lender display name<input id="enroll-name" {...form.register("display_name")} aria-invalid={!!form.formState.errors.display_name} /></label><p className="field-error">{form.formState.errors.display_name?.message}</p>
    <label htmlFor="enroll-metro">Metro<select id="enroll-metro" {...form.register("metro_id")}>{refs?.locations.items.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
    {error ? <p role="alert" className="field-error">{error}</p> : null}<Button type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? "Creating…" : "Create sample lender profile"}<ArrowRight size={17} /></Button>
  </form>;
}

export function AuthDialog({ role, action, onClose }: { role: "renter" | "lender"; action: "login" | "signup"; onClose?: () => void }) {
  const router = useRouter(), params = useSearchParams(), runtime = useRuntime(), user = useSession(s => s.user);
  const [visible, setVisible] = useState(false), [error, setError] = useState("");
  const returnTo = safeReturnTo(params.get("returnTo"));
  const enroll = role === "lender" && !!user && !user.lender_profile;
  const form = useForm<z.infer<typeof credentials>>({ resolver: zodResolver(credentials), defaultValues: { display_name: role === "lender" ? "Sample Lender" : "Sample Renter", email: `${role}@example.invalid`, demo_password: "demo-only" } });
  const close = () => { if (onClose) onClose(); else router.push(returnTo.startsWith("/lender/") ? "/" : returnTo); };
  const destination = () => { router.push(role === "lender" ? "/lender/dashboard" : returnTo.startsWith("/lender/") ? "/" : returnTo); useSession.getState().notify(role === "lender" ? "Welcome to your demo lender workspace." : "You’re signed in as a sample renter."); };
  const title = enroll ? "Share your wardrobe" : action === "signup" ? `Create your ${role} account` : `Welcome back, ${role}`;
  return <Modal open onOpenChange={open => { if (!open) close(); }} title={title} description={runtime.demo ? "Presentation demo · sample identity only" : "Connected identity"} restoreId="header-account">
    {!runtime.demo ? <div className="stack-form"><p>Connected sign-in requires the configured identity provider. Sample sign-in is available in demo mode.</p><Button onClick={close}>Return to browsing</Button></div>
      : enroll ? <EnrollmentForm done={destination} />
      : user?.lender_profile && role === "lender" ? <div className="stack-form"><Shirt size={30} /><p>You’re already using the sample lender profile, {user.display_name}.</p><Button onClick={destination}>Open lender dashboard<ArrowRight size={17} /></Button></div>
      : <form className="stack-form" onSubmit={form.handleSubmit(async values => {
        setError("");
        const previous = useSession.getState();
        useSession.setState({ role });
        try {
          let account = await api<CurrentUser>("/me/bootstrap", { method: "POST", protected: true });
          if (action === "signup") account = await api<CurrentUser>("/me", { method: "PATCH", protected: true, body: JSON.stringify({ display_name: values.display_name }) });
          useSession.getState().signIn(account, role); destination();
        } catch (error) { useSession.setState({ user: previous.user, role: previous.role }); setError(error instanceof Error ? error.message : "Sample sign-in failed."); }
      })}>
        <p className="auth-intro">{role === "renter" ? "Your next occasion starts with a great outfit." : "Great pieces deserve more than one occasion."}</p>
        {action === "signup" ? <><label htmlFor="auth-name">Display name<input id="auth-name" {...form.register("display_name")} autoComplete="nickname" aria-invalid={!!form.formState.errors.display_name} /></label><p role={form.formState.errors.display_name ? "alert" : undefined} className="field-error">{form.formState.errors.display_name?.message}</p></> : null}
        <label htmlFor="auth-email">Sample email<input id="auth-email" type="email" {...form.register("email")} readOnly autoComplete="off" /></label>
        <label htmlFor="auth-password">Sample password<span className="password-field"><input id="auth-password" type={visible ? "text" : "password"} {...form.register("demo_password")} readOnly autoComplete="off" /><button type="button" aria-label={`${visible ? "Hide" : "Show"} sample password`} className="icon-button" onClick={() => setVisible(v => !v)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
        <p className="tiny muted">Sample credentials are fixed. This form simulates identity; it does not verify an account or send email.</p>
        {error ? <p className="field-error" role="alert">{error}</p> : null}
        <Button type="submit" disabled={!runtime.ready || form.formState.isSubmitting}>{form.formState.isSubmitting ? "Opening your demo…" : action === "signup" ? "Create sample profile" : `Continue as sample ${role}`}<ArrowRight size={17} /></Button>
        <p className="auth-switch">{action === "login" ? "New here?" : "Already have a sample profile?"} <Link href={`/auth/${role}/${action === "login" ? "signup" : "login"}?returnTo=${encodeURIComponent(returnTo)}`}>{action === "login" ? "Create an account" : "Sign in"}</Link></p>
      </form>}
  </Modal>;
}
