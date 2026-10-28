import type { NextConfig } from "next";
import { readMode } from "@dzirent/client/mode";

readMode({
  mode: process.env.NEXT_PUBLIC_DZIRENT_MODE ?? "demo",
  apiBaseUrl: "/auth/api",
});

const nextConfig: NextConfig = { reactStrictMode: true, poweredByHeader: false };
export default nextConfig;
