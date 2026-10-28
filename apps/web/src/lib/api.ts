"use client";
import { ApiError, createApiClient, readMode } from "@dzirent/client";
import type { CsrfChallenge } from "@dzirent/client";
import { useSession } from "./store";

export const mode = readMode({ mode: process.env.NEXT_PUBLIC_DZIRENT_MODE ?? "demo", apiBaseUrl: "/auth/api" });
let csrf: { value: string; until: number } | null = null;
let challenge: Promise<string> | null = null;
export function clearCsrf() { csrf = null; challenge = null; }
async function getCsrf(): Promise<string> {
  if (csrf && csrf.until > Date.now()) return csrf.value;
  if (challenge) return challenge;
  challenge = (async () => {
    const response = await fetch("/auth/api/auth/csrf", { credentials: "same-origin", cache: "no-store", redirect: "error" });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.csrf_token) throw new ApiError(response.status || 503, body?.error ? body : { error: { code: "dependency_unavailable", message: "Session protection is unavailable. Please retry.", details: [] }, request_id: "unavailable" });
    const result = body as CsrfChallenge;
    csrf = { value: result.csrf_token, until: Date.now() + Math.min(result.expires_in, 1500) * 1000 };
    return result.csrf_token;
  })();
  try { return await challenge; } finally { challenge = null; }
}
const request = createApiClient({ mode: mode.mode, baseUrl: mode.mode === "connected" ? mode.apiBaseUrl : undefined,
  cookieAuth: mode.mode === "connected", getCsrf,
  getToken: async () => useSession.getState().role ? `dzirent-demo-${useSession.getState().role}` : null });
export async function api<T>(path: string, options: RequestInit & { protected?: boolean } = {}): Promise<T> {
  try { return await request<T>(path, options); }
  catch (error) {
    if (mode.mode === "connected" && error instanceof ApiError) {
      if (error.body.error.code === "auth_csrf_failed") clearCsrf();
      if (error.status === 401 && error.body.error.code === "unauthenticated" && options.protected) useSession.getState().signOut();
    }
    throw error;
  }
}
