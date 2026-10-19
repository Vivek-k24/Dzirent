import type { ApiErrorBody } from "./types";
export class ApiError extends Error {
  constructor(public status: number, public body: ApiErrorBody) { super(body.error.message); this.name = "ApiError"; }
}
export function createApiClient(config: { mode: "demo" | "connected"; baseUrl?: string; getToken?: () => Promise<string | null> }) {
  if (config.mode === "connected" && !config.baseUrl) throw new Error("Connected API URL is required.");
  const base = config.mode === "demo" ? "/api/v1" : config.baseUrl!.replace(/\/$/, "");
  return async function request<T>(path: string, options: RequestInit & { protected?: boolean } = {}): Promise<T> {
    const { protected: protectedCall = false, ...init } = options;
    const headers = new Headers(init.headers);
    if (init.body) headers.set("Content-Type", "application/json");
    const token = protectedCall ? await config.getToken?.() : null;
    if (protectedCall && !token) throw new ApiError(401, { error: { code: "unauthenticated", message: "Sign in to continue.", details: [] }, request_id: "client-identity-required" });
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(`${base}${path}`, { ...init, headers, cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(response.status, body?.error ? body : { error: { code: "request_failed", message: `The request failed (${response.status}). Please retry.`, details: [] }, request_id: "unavailable" });
    if (!body) throw new Error("The API returned an empty or invalid response.");
    return body as T;
  };
}
