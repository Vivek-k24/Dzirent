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
  let isAdmin = false;
  if (user) {
    const client = await serverClient();
    const [{ data }, { data: needs }, { data: adminAal2 }] = await Promise.all([
      client.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      client.rpc("needs_legal_acceptance"),
      client.rpc("is_admin"),
    ]);
    name = data?.display_name || "Your account";
    userProfile = data;
    needsLegal = Boolean(needs);
    if (adminAal2) {
      isAdmin = true;
    } else {
      const { error: adminErr } = await client.rpc("admin_queues");
      if (
        adminErr?.message ===
        "Sign in with two-step verification to use admin tools"
      ) {
        isAdmin = true;
      }
    }
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
          isAdmin={isAdmin}
        >
          {children}
        </Shell>
      </body>
    </html>
  );
}
