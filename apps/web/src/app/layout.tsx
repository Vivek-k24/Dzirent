import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { context } from "@/lib/data";
import { currentUser, serverClient } from "@/lib/supabase/server";
import { Shell } from "@/components/shell";
import { ADMIN_CODE_FIRST } from "@/lib/admin-code";
import { codeOf } from "@/lib/errors";
import "@fontsource-variable/roboto";
import "./globals.css";
export const metadata: Metadata = {
  metadataBase: new URL("https://dzirent.com"),
  icons: { icon: "/logo-mark.svg" },
  title: {
    default: "Dzirent - Your neighborhood wardrobe",
    template: "%s | Dzirent",
  },
  description:
    "Discover pieces for your next occasion from closets close to you. Browse local clothing rentals, find your fit, and get to know neighborhood studios.",
};
export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};
/** The "Preview only" header label (app_settings flag preview_label, readable by guests). Shown if the flag can't be read. */
async function previewLabelOn(): Promise<boolean> {
  const client = await serverClient();
  const { data, error } = await client
    .from("app_settings")
    .select("enabled")
    .eq("key", "preview_label")
    .maybeSingle();
  if (error || !data) return true;
  return Boolean(data.enabled);
}
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [ctx, user, jar, previewLabel] = await Promise.all([
    context(),
    currentUser(),
    cookies(),
    previewLabelOn(),
  ]);
  let name = "Your account";
  let userProfile = null;
  let needsLegal = false;
  let isAdmin = false;
  let ageBlocked = false;
  if (user) {
    const client = await serverClient();
    const [{ data }, { data: needs }, { data: adminAal2 }, { data: blocked }] = await Promise.all([
      client.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      client.rpc("needs_legal_acceptance"),
      client.rpc("is_admin"),
      client.rpc("age_blocked"),
    ]);
    name = data?.display_name || "Your account";
    userProfile = data;
    needsLegal = Boolean(needs);
    ageBlocked = blocked === true;
    if (adminAal2) {
      isAdmin = true;
    } else {
      const { error: adminErr } = await client.rpc("admin_queues");
      if (codeOf(adminErr?.message) === ADMIN_CODE_FIRST) {
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
          previewLabel={previewLabel}
          ageBlocked={ageBlocked}
        >
          {children}
        </Shell>
      </body>
    </html>
  );
}
