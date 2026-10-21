import modes from "../../../contracts/modes.json";

export type ModeConfig =
  | { mode: "demo" }
  | { mode: "connected"; apiBaseUrl: string };

export function readMode(input: { mode: string; apiBaseUrl?: string }): ModeConfig {
  if (!modes.values.includes(input.mode)) throw new Error("Invalid dzirent mode");
  if (input.mode === "demo") return { mode: "demo" };
  if (!input.apiBaseUrl) {
    throw new Error("Connected mode requires an API URL");
  }
  const url = new URL(input.apiBaseUrl);
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error("Connected API requires HTTPS except for local development");
  }
  if (!url.pathname.endsWith("/api/v1") || url.username || url.password || url.search || url.hash) {
    throw new Error("API base URL must end in /api/v1 without credentials, query, or fragment");
  }
  return { mode: "connected", apiBaseUrl: input.apiBaseUrl };
}
