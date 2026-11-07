import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { context } from "@/lib/data";
import { currentUser, serverClient } from "@/lib/supabase/server";
import { Shell } from "@/components/shell";
import "@fontsource-variable/roboto";
import "./globals.css";
export const metadata: Metadata = {
  metadataBase: new URL("https://dzirent.com"),
  icons: { icon: "/logo-mark.svg" },
  title: {
    default: "Dzirent - Your neighborhood wardrobe",
    template: "%s - Dzirent",
  },
  description:
    "Discover pieces for your next occasion from closets close to you. Browse local clothing rentals, find your fit, and get to know neighborhood studios.",
};
export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [ctx, user, jar] = await Promise.all([
    context(),
    currentUser(),
    cookies(),
  ]);
  let name = "Your account";
  let userProfile = null;
  let needsLegal = false;
  if (user) {
    const client = await serverClient();
    const [{ data }, { data: needs }] = await Promise.all([
      client.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      client.rpc("needs_legal_acceptance"),
    ]);
    name = data?.display_name || "Your account";
    userProfile = data;
    needsLegal = Boolean(needs);
  }
  return (
    <html lang="en">
      <body>
        <Shell
          ctx={ctx}
          authenticated={Boolean(user)}
          userId={user?.id || null}
          userProfile={userProfile}
          name={name}
          showWelcome={!user && !jar.get("dzirent-welcome")}
          needsLegal={needsLegal}
        >
          {children}
        </Shell>
      </body>
    </html>
  );
}
