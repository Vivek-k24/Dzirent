import type { ApiErrorBody } from "./types";
export class ApiError extends Error {
  constructor(public status: number, public body: ApiErrorBody) { super(body.error.message); this.name = "ApiError"; }
}
export function createApiClient(config: { mode: "demo" | "connected"; baseUrl?: string; getToken?: () => Promise<string | null>; cookieAuth?: boolean; getCsrf?: () => Promise<string> }) {
  if (config.mode === "connected" && !config.baseUrl) throw new Error("Connected API URL is required.");
  const base = config.mode === "demo" ? "/api/v1" : config.baseUrl!.replace(/\/$/, "");
  return async function request<T>(path: string, options: RequestInit & { protected?: boolean } = {}): Promise<T> {
    const { protected: protectedCall = false, ...init } = options;
    const headers = new Headers(init.headers);
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const token = protectedCall && !config.cookieAuth ? await config.getToken?.() : null;
    if (protectedCall && !config.cookieAuth && !token) throw new ApiError(401, { error: { code: "unauthenticated", message: "Sign in to continue.", details: [] }, request_id: "client-identity-required" });
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (config.cookieAuth) {
      headers.delete("Authorization");
      if (!["GET", "HEAD", "OPTIONS"].includes((init.method ?? "GET").toUpperCase())) {
        const csrf = await config.getCsrf?.();
        if (!csrf) throw new Error("Session protection is unavailable. Refresh and try again.");
        headers.set("X-Dzirent-CSRF", csrf);
        if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
      }
    }
    const response = await fetch(`${base}${path}`, { ...init, headers, cache: "no-store", credentials: config.cookieAuth ? "same-origin" : "omit", redirect: "error" });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(response.status, body?.error ? body : { error: { code: "request_failed", message: `The request failed (${response.status}). Please retry.`, details: [] }, request_id: "unavailable" });
    if (response.status === 204) return undefined as T;
    if (!body) throw new Error("The API returned an empty or invalid response.");
    return body as T;
  };
}
