import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./[...path]/route";

const origin = "http://127.0.0.1:3500";
const upstream = "http://127.0.0.1:8500/api/v1";
function request(path: string, options: RequestInit = {}) {
  return new Request(`${origin}/auth/api/${path}`, { ...options, headers: { Host: "127.0.0.1:3500", ...options.headers } });
}
const context = (...path: string[]) => ({ params: Promise.resolve({ path }) });

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_DZIRENT_MODE", "connected");
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("DZIRENT_WEB_ORIGIN", origin);
  vi.stubEnv("DZIRENT_API_UPSTREAM_URL", upstream);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("native authentication BFF", () => {
  it("forwards only allowed headers and cookies to a fixed upstream", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ roles: ["renter"] }));
    vi.stubGlobal("fetch", fetch);
    const response = await GET(request("me", { headers: { Host: "127.0.0.1:3500", Authorization: "Bearer mock:sample-lender", "X-Role": "platform_admin", "X-User-ID": "other", "X-Forwarded-For": "203.0.113.9", Cookie: "dzirent_session=abc; dzirent_client=abc.def.123; unrelated=private" } }), context("me"));
    expect(response.status).toBe(200);
    const [target, options] = fetch.mock.calls[0];
    expect(target.href).toBe(`${upstream}/me`);
    expect(options.headers.get("Cookie")).toBe("dzirent_session=abc; dzirent_client=abc.def.123");
    for (const key of ["Authorization", "X-Role", "X-User-ID", "X-Forwarded-For"]) expect(options.headers.has(key)).toBe(false);
    expect(options.redirect).toBe("manual");
    expect(options.cache).toBe("no-store");
  });

  it.each([["../me"], ["%2e%2e", "me"], ["auth", "login", "extra"], ["admin", "users"], ["catalog", "products", "a/b"]])("rejects path injection %j", async (...path) => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect((await GET(request("invalid"), context(...path))).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("preserves catalog query values without changing target authority", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({})); vi.stubGlobal("fetch", fetch);
    await GET(request("catalog/products?q=https%3A%2F%2Fexample.invalid%2F..%2F&metro_id=local"), context("catalog", "products"));
    const target = fetch.mock.calls[0][0] as URL;
    expect(target.origin).toBe("http://127.0.0.1:8500");
    expect(target.pathname).toBe("/api/v1/catalog/products");
    expect(target.searchParams.get("q")).toBe("https://example.invalid/../");
  });

  it("replaces a browser-supplied proxy credential with the server-only value", async () => {
    const key = "a".repeat(64); // Non-secret local fixture, never a deployed value.
    vi.stubEnv("DZIRENT_AUTH_STAGING_PROXY_KEY", key);
    vi.stubEnv("VERCEL_ENV", "preview");
    const fetch = vi.fn().mockResolvedValue(Response.json({})); vi.stubGlobal("fetch", fetch);
    const response = await GET(request("auth/session", { headers: { "X-Dzirent-Staging-Proxy": "browser-asserted" } }), context("auth", "session"));
    expect(response.status).toBe(200);
    expect(fetch.mock.calls[0][1].headers.get("X-Dzirent-Staging-Proxy")).toBe(key);
    expect(response.headers.has("X-Dzirent-Staging-Proxy")).toBe(false);
    expect(await response.text()).not.toContain(key);
  });

  it("never forwards a client proxy key when no server credential is configured", async () => {
    vi.stubEnv("DZIRENT_AUTH_STAGING_PROXY_KEY", "");
    const fetch = vi.fn().mockResolvedValue(Response.json({})); vi.stubGlobal("fetch", fetch);
    await GET(request("auth/session", { headers: { "X-Dzirent-Staging-Proxy": "browser-asserted" } }), context("auth", "session"));
    expect(fetch.mock.calls[0][1].headers.has("X-Dzirent-Staging-Proxy")).toBe(false);
  });

  it("refuses staging credentials in a production Vercel runtime", async () => {
    vi.stubEnv("DZIRENT_AUTH_STAGING_PROXY_KEY", "a".repeat(64));
    vi.stubEnv("VERCEL_ENV", "production");
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect((await GET(request("auth/session"), context("auth", "session"))).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects an unapproved Host even with the approved Origin", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({})); vi.stubGlobal("fetch", fetch);
    const result = await GET(request("auth/session", { headers: { Host: "evil.example", Origin: origin } }), context("auth", "session"));
    expect(result.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("accepts Next's internal URL normalization only with the exact HTTP Host", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({})); vi.stubGlobal("fetch", fetch);
    const result = await GET(new Request("http://localhost:3500/auth/api/auth/session", { headers: { Host: "127.0.0.1:3500" } }), context("auth", "session"));
    expect(result.status).toBe(200);
    const denied = await GET(request("auth/session", { headers: { Host: "evil.example", "X-Forwarded-Host": "127.0.0.1:3500" } }), context("auth", "session"));
    expect(denied.status).toBe(403);
  });

  it.each<Record<string, string>>([{ Origin: "https://evil.example" }, { Origin: "null" }, { Origin: origin, "Sec-Fetch-Site": "cross-site" }, { Origin: origin, "Sec-Fetch-Site": "same-site" }])("rejects origin or Fetch Metadata %j", async headers => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const result = await POST(request("auth/login", { method: "POST", headers: { Host: "127.0.0.1:3500", "Content-Type": "application/json", ...headers }, body: "{}" }), context("auth", "login"));
    expect(result.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("limits auth bodies and refuses media-type confusion before forwarding", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    for (const [type, body, status] of [["application/json", "x".repeat(16385), 413], ["text/plain", "{}", 415]] as const) {
      const result = await POST(request("auth/login", { method: "POST", headers: { Host: "127.0.0.1:3500", Origin: origin, "Content-Type": type }, body }), context("auth", "login"));
      expect(result.status).toBe(status);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails closed on API outages and redirects", async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error("private upstream failure")).mockResolvedValueOnce(new Response(null, { status: 307, headers: { Location: "https://example.invalid" } }));
    vi.stubGlobal("fetch", fetch);
    for (let index = 0; index < 2; index++) {
      const result = await GET(request("auth/session"), context("auth", "session"));
      expect(result.status).toBe(503);
      expect(result.headers.has("Location")).toBe(false);
      expect(await result.text()).not.toContain("private upstream failure");
    }
  });

  it.each(["dzirent_session=abc; Path=/; HttpOnly; SameSite=lax; Domain=evil.example", "dzirent_session=abc; Path=/; SameSite=lax", "unrelated=abc; Path=/; HttpOnly; SameSite=lax"])("refuses unsafe upstream cookies", async cookie => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({}, { headers: { "Set-Cookie": cookie } })));
    expect((await GET(request("auth/csrf"), context("auth", "csrf"))).status).toBe(503);
  });

  it("keeps demo mode independent and rejects malformed connected configuration", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    vi.stubEnv("NEXT_PUBLIC_DZIRENT_MODE", "demo");
    expect((await GET(request("auth/session"), context("auth", "session"))).status).toBe(404);
    vi.stubEnv("NEXT_PUBLIC_DZIRENT_MODE", "connected");
    vi.stubEnv("DZIRENT_API_UPSTREAM_URL", "http://example.invalid/api/v1");
    expect((await GET(request("auth/session"), context("auth", "session"))).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });
});
