// Transport only. FastAPI owns passwords, sessions, identity, CSRF and business authorization.
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
type Context = { params: Promise<{ path: string[] }> };
const photoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const photoPut = (path: string[], method: string) => method === "PUT" && path.length === 6 && path[0] === "lender" && path[1] === "products" && uuid.test(path[2]) && path[3] === "images" && path[4] === "uploads" && uuid.test(path[5]);
const unsafe = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const fixedRoutes: Record<string, string[]> = {
  "auth/csrf": ["GET"], "auth/session": ["GET"], "auth/register": ["POST"],
  "auth/login": ["POST"], "auth/logout": ["POST"], "auth/logout-all": ["POST"],
  "auth/password/change": ["POST"], "auth/password/request": ["POST"],
  "auth/password/reset": ["POST"], "auth/email/request": ["POST"],
  "auth/email/verify": ["POST"], "auth/deactivate": ["POST"],
  "me": ["GET", "PATCH", "DELETE"], "me/bootstrap": ["POST"],
  "me/preferences": ["GET", "PATCH"], "me/lender-profile": ["POST"],
  "me/studio": ["GET", "PUT"], "lender/products": ["GET", "POST"],
  "admin/access": ["GET"], "catalog/products": ["GET"], "catalog/categories": ["GET"],
  "catalog/facets": ["GET"], "locations/metros": ["GET"], "studios": ["GET"],
  "health/live": ["GET"], "health/ready": ["GET"],
};

function allowed(path: string[], method: string) {
  if (!path.length || path.some(segment => !/^[A-Za-z0-9:_-]{1,200}$/.test(segment))) return false;
  if (photoPut(path, method)) return true;
  if (path.length === 5 && path[0] === "lender" && path[1] === "products" && uuid.test(path[2]) && path[3] === "images" && ["upload-intent", "complete"].includes(path[4])) return method === "POST";
  if (path.length === 2 && path[0] === "media" && uuid.test(path[1])) return method === "GET";
  const route = path.join("/");
  if (Object.hasOwn(fixedRoutes, route) && fixedRoutes[route].includes(method)) return true;
  if (path.length === 3 && path[0] === "catalog" && path[1] === "products") return method === "GET";
  if (path.length === 3 && path[0] === "lender" && path[1] === "products") return ["GET", "PATCH", "DELETE"].includes(method);
  return path[0] === "studios" && (path.length === 2 || (path.length === 3 && path[2] === "products")) && method === "GET";
}

function failure(status: number, code: string, message: string) {
  return Response.json({ error: { code, message, details: [] }, request_id: randomUUID() }, {
    status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}

function configuration() {
  const originValue = process.env.DZIRENT_WEB_ORIGIN;
  const upstreamValue = process.env.DZIRENT_API_UPSTREAM_URL;
  if (!originValue || !upstreamValue) throw new Error("Missing transport configuration");
  const origin = new URL(originValue), upstream = new URL(upstreamValue);
  const local = (url: URL) => url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname) && process.env.NODE_ENV !== "production";
  if (originValue !== origin.origin || origin.username || origin.password || (origin.protocol !== "https:" && !local(origin))) throw new Error("Invalid origin");
  if (!upstream.pathname.endsWith("/api/v1") || upstream.username || upstream.password || upstream.search || upstream.hash || (upstream.protocol !== "https:" && !local(upstream))) throw new Error("Invalid upstream");
  return { origin, upstream };
}

async function bodyBytes(request: Request, limit: number): Promise<ArrayBuffer> {
  if (!request.body) return new ArrayBuffer(0);
  const reader = request.body.getReader(), parts: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    length += chunk.value.byteLength;
    if (length > limit) { await reader.cancel(); throw new Error("body-limit"); }
    parts.push(chunk.value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return bytes.buffer;
}

async function proxy(request: Request, context: Context) {
  if ((process.env.NEXT_PUBLIC_DZIRENT_MODE ?? "demo") !== "connected") return failure(404, "not_found", "Not found.");
  const { path } = await context.params;
  if (!allowed(path, request.method)) return failure(404, "not_found", "Not found.");
  let config: ReturnType<typeof configuration>;
  try { config = configuration(); }
  catch { return failure(503, "dependency_unavailable", "Connected API transport is not configured."); }
  // Next may normalize the internal Request URL to localhost. Validate the actual
  // HTTP authority; never accept a client-asserted X-Forwarded-Host instead.
  if (request.headers.get("host") !== config.origin.host) {
    return failure(403, "auth_origin_rejected", "Request host is not allowed.");
  }
  const origin = request.headers.get("origin"), site = request.headers.get("sec-fetch-site");
  if ((unsafe.has(request.method) && origin !== config.origin.origin) || (origin !== null && origin !== config.origin.origin) || (site !== null && !["same-origin", "none"].includes(site))) {
    return failure(403, "auth_origin_rejected", "Request origin is not allowed.");
  }
  const rawPhoto = photoPut(path, request.method);
  const contentType = request.headers.get("content-type")?.split(";")[0] ?? "";
  if (unsafe.has(request.method) && (rawPhoto ? !photoTypes.has(contentType) : contentType !== "application/json")) return failure(415, "unsupported_media_type", rawPhoto ? "Use JPEG, PNG or WebP photo bytes." : "Use application/json.");
  const secure = config.origin.protocol === "https:";
  const names = secure ? ["__Host-dzirent_session", "__Host-dzirent_csrf", "__Host-dzirent_client"] : ["dzirent_session", "dzirent_csrf", "dzirent_client"];
  const cookies = (request.headers.get("cookie") ?? "").split(";").map(value => value.trim()).filter(value => {
    const [name, ...rest] = value.split("=");
    return names.includes(name) && /^[A-Za-z0-9_.-]{0,200}$/.test(rest.join("="));
  });
  const headers = new Headers({ Accept: "application/json" });
  if (cookies.length) headers.set("Cookie", cookies.join("; "));
  if (origin) headers.set("Origin", origin);
  if (site) headers.set("Sec-Fetch-Site", site);
  const csrf = request.headers.get("X-Dzirent-CSRF");
  if (csrf && /^[A-Za-z0-9_.-]{1,200}$/.test(csrf)) headers.set("X-Dzirent-CSRF", csrf);
  // Never forward Authorization, role/user headers, X-Forwarded-For, upstream URLs or arbitrary headers.
  let body: string | ArrayBuffer | undefined;
  if (unsafe.has(request.method)) {
    headers.set("Content-Type", rawPhoto ? contentType : "application/json");
    try {
      const bytes = await bodyBytes(request, rawPhoto ? 4_000_000 : path[0] === "auth" ? 16384 : 1048576);
      body = rawPhoto ? bytes : new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    }
    catch { return failure(413, "payload_too_large", "Request is too large or malformed."); }
  }
  const target = new URL(`${config.upstream.href}/${path.map(encodeURIComponent).join("/")}`);
  target.search = new URL(request.url).search;
  try {
    const upstream = await fetch(target, { method: request.method, headers, body, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (upstream.status >= 300 && upstream.status < 400) return failure(503, "dependency_unavailable", "Unexpected upstream redirect.");
    const output = new Headers({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" });
    for (const name of ["Content-Type", "X-Request-ID", "Retry-After"]) {
      const value = upstream.headers.get(name);
      if (value) output.set(name, value);
    }
    for (const cookie of upstream.headers.getSetCookie()) {
      const name = cookie.split("=", 1)[0];
      if (!names.includes(name) || /;\s*domain=/i.test(cookie) || !/;\s*httponly(?:;|$)/i.test(cookie) || !/;\s*path=\/(?:;|$)/i.test(cookie) || !/;\s*samesite=lax(?:;|$)/i.test(cookie) || (secure && !/;\s*secure(?:;|$)/i.test(cookie))) return failure(503, "dependency_unavailable", "Upstream session configuration is unavailable.");
      output.append("Set-Cookie", cookie);
    }
    return new Response(upstream.body, { status: upstream.status, headers: output });
  } catch {
    return failure(503, "dependency_unavailable", "Connected API is unavailable. Please retry.");
  }
}

export { proxy as GET, proxy as POST, proxy as PATCH, proxy as PUT, proxy as DELETE };
