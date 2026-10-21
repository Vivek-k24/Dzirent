import type { NextConfig } from "next";
import { photoQualityLocalAllowed } from "./src/lib/ai-quality/access";
import { readMode } from "@dzirent/client/mode";

readMode({
  mode: process.env.NEXT_PUBLIC_DZIRENT_MODE ?? "demo",
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL,
  clerkPublishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
});


// This never runs on Vercel; proxy experimental image bytes to the locally configured
// FastAPI server without exposing an arbitrary URL in client-side code.
const localQualityAccess = photoQualityLocalAllowed(
  process.env.DZIRENT_ENVIRONMENT,
  process.env.NODE_ENV,
  process.env.VERCEL_ENV,
);
const qualityApiOrigin = process.env.DZIRENT_DEV_API_ORIGIN ?? "http://127.0.0.1:8000";
if (localQualityAccess) {
  const upstream = new URL(qualityApiOrigin);
  if (upstream.protocol !== "http:" ||
      !["127.0.0.1", "localhost", "[::1]"].includes(upstream.hostname) ||
      upstream.username || upstream.password || upstream.pathname !== "/" ||
      upstream.search || upstream.hash) {
    throw new Error("DZIRENT_DEV_API_ORIGIN must be a loopback HTTP origin for local testing.");
  }
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    return localQualityAccess
      ? [
          { source: "/api/v1/dev/photo-quality", destination: qualityApiOrigin + "/api/v1/dev/photo-quality" },
          { source: "/api/v1/dev/garment-measure", destination: qualityApiOrigin + "/api/v1/dev/garment-measure" },
        ]
      : [];
  },
};
export default nextConfig;
