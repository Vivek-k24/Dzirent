"use client";

import { useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase/client";


type Factor = {
  id: string;
  status: string;
  friendly_name?: string;
};

export function AdminMfaGate() {
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"enroll" | "challenge">("challenge");
  const [factorId, setFactorId] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function init() {
      setLoading(true);
      setError("");
      try {
        const client = browserClient();
        const { data: factors, error: factorsError } =
          await client.auth.mfa.listFactors();
        if (factorsError) throw factorsError;

        const totpList = (factors?.totp || []) as Factor[];
        const verified = totpList.filter((f) => f.status === "verified");

        if (verified.length > 0) {
          setMode("challenge");
          setFactorId(verified[0].id);
        } else {
          // Unenroll any unverified stale factors
          for (const f of totpList) {
            if (f.status !== "verified") {
              await client.auth.mfa.unenroll({ factorId: f.id }).catch(() => {});
            }
          }
          const { data: enrolled, error: enrollError } =
            await client.auth.mfa.enroll({
              factorType: "totp",
              friendlyName: "Dzirent Admin",
            });
          if (enrollError) throw enrollError;
          setMode("enroll");
          setFactorId(enrolled.id);
          setQrCode(enrolled.totp.qr_code);
          setSecret(enrolled.totp.secret);
        }
      } catch (err) {
        setError((err as Error).message || "Failed to initialize authenticator.");
      } finally {
        setLoading(false);
      }
    }
    void init();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanCode = code.trim().replace(/\s+/g, "");
    if (cleanCode.length !== 6) {
      setError("Please enter a 6-digit code.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const client = browserClient();
      const { data: challenge, error: challengeError } =
        await client.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await client.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: cleanCode,
      });
      if (verifyError) throw verifyError;

      // Successfully verified at aal2! Reload page so server components pick up aal2 session
      window.location.reload();
    } catch (err) {
      setError((err as Error).message || "Invalid authenticator code.");
    } finally {
      setBusy(false);
    }
  }

  function copySecret() {
    if (!secret) return;
    void navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="page-width admin-mfa-container" style={{ padding: "60px 20px", textAlign: "center" }}>
        <p className="muted">Checking security status…</p>
      </div>
    );
  }

  return (
    <div className="page-width admin-mfa-container" style={{ maxWidth: "480px", margin: "40px auto", padding: "0 20px" }}>
      <div className="admin-card" style={{ padding: "32px", borderRadius: "8px", border: "1px solid var(--line)", background: "var(--paper)" }}>
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <span className="eyebrow accent">ADMIN ACCESS</span>
          <h1 style={{ fontSize: "28px", margin: "8px 0" }}>
            {mode === "enroll" ? "Set up two-step verification" : "Two-step verification"}
          </h1>
          <p className="muted" style={{ fontSize: "14px" }}>
            {mode === "enroll"
              ? "Scan this QR code with an authenticator app (Google Authenticator, 1Password, Authy), then enter the 6-digit code to complete setup."
              : "Enter the 6-digit code from your authenticator app to unlock the admin area."}
          </p>
        </div>

        {error && (
          <div className="policy-note notice error" style={{ margin: "0 0 20px" }}>
            <p><strong>{error}</strong></p>
          </div>
        )}

        {mode === "enroll" && qrCode && (
          <div style={{ textAlign: "center", margin: "20px 0" }}>
            <div style={{ display: "inline-block", background: "#fff", padding: "12px", borderRadius: "8px", border: "1px solid var(--line)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrCode} alt="TOTP QR Code" width={180} height={180} style={{ display: "block" }} />
            </div>
            {secret && (
              <div style={{ marginTop: "12px", fontSize: "13px" }}>
                <span className="muted">Setup key: </span>
                <code style={{ background: "var(--line)", padding: "2px 6px", borderRadius: "4px", fontSize: "12px", letterSpacing: "1px" }}>
                  {secret}
                </code>
                <button
                  type="button"
                  className="text-button"
                  onClick={copySecret}
                  style={{ marginLeft: "8px", fontSize: "12px", padding: "2px 6px" }}
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label className="field">
            <span>6-digit code</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (error) setError("");
              }}
              style={{ fontSize: "24px", letterSpacing: "6px", textAlign: "center", padding: "12px" }}
              disabled={busy}
              required

            />
          </label>
          <button
            type="submit"
            className="button full"
            disabled={busy || code.trim().length !== 6}
            style={{ marginTop: "16px" }}
          >
            {busy ? "Verifying..." : mode === "enroll" ? "Confirm & continue" : "Verify code"}
          </button>
        </form>
      </div>
    </div>
  );
}
