"use client";
import { createApiClient, readMode } from "@dzirent/client";
import { useSession } from "./store";

export const mode = readMode({ mode: process.env.NEXT_PUBLIC_DZIRENT_MODE ?? "demo", apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL });
// Phase 1B connects this bridge to first-party session handling. No token is persisted here.
let connectedToken: (() => Promise<string | null>) | undefined;
export function setConnectedTokenProvider(provider: () => Promise<string | null>) { connectedToken = provider; }
export const api = createApiClient({ mode: mode.mode, baseUrl: mode.mode === "connected" ? mode.apiBaseUrl : undefined,
  getToken: async () => mode.mode === "demo" ? (useSession.getState().role ? `dzirent-demo-${useSession.getState().role}` : null) : await connectedToken?.() ?? null });
