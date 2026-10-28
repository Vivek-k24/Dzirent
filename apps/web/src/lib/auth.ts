"use client";
import { ApiError } from "@dzirent/client";
import type { AuthNotice, AuthSessionRead } from "@dzirent/client";
import { api, clearCsrf, mode } from "./api";
import { useSession } from "./store";
let sessionRevision = 0;

export function acceptSession(result: AuthSessionRead) {
  sessionRevision++;
  clearCsrf();
  useSession.setState({ user: result.user, role: result.user.lender_profile ? "lender" : "renter", status: "signed-in", error: "", emailVerified: result.email_verified, synthetic: result.synthetic, capabilities: result.capabilities });
}

export async function restoreSession() {
  if (mode.mode !== "connected") return;
  const revision = ++sessionRevision;
  clearCsrf();
  // Hide stale privileged state while checking. No credential/session data is persisted.
  useSession.setState({ user: null, role: null, status: "checking", error: "", capabilities: [], emailVerified: false, synthetic: false });
  try {
    const result = await api<AuthSessionRead>("/auth/session");
    if (revision === sessionRevision) acceptSession(result);
  }
  catch (error) {
    if (revision !== sessionRevision) return;
    if (error instanceof ApiError && error.status === 401) useSession.getState().signOut();
    else useSession.setState({ user: null, role: null, status: "unavailable", error: error instanceof Error ? error.message : "Session check unavailable.", capabilities: [], emailVerified: false, synthetic: false });
  }
}

export async function logoutSession() {
  sessionRevision++;
  if (mode.mode === "connected") await api<void>("/auth/logout", { method: "POST", body: "{}" });
  clearCsrf();
  useSession.getState().signOut();
}

// Registration remains a generic 202 with no session. Only normal login after the committed
// response can authenticate; duplicate-email responses never manufacture or adopt an identity.
export async function registerAndLogin(input: { email: string; password: string; display_name: string }): Promise<AuthSessionRead> {
  await api<AuthNotice>("/auth/register", { method: "POST", body: JSON.stringify(input) });
  return api<AuthSessionRead>("/auth/login", { method: "POST", body: JSON.stringify({ email: input.email, password: input.password }) });
}

// Explicit submission only. Refresh the existing session from the API after confirmation;
// confirmation itself never creates a login or asserts client-side verification.
export async function verifyEmail(token: string): Promise<AuthNotice> {
  const result = await api<AuthNotice>("/auth/email/verify", { method: "POST", body: JSON.stringify({ token }) });
  await restoreSession();
  return result;
}
