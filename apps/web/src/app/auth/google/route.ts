// E1: "Continue with Google" (a plain link, so the strict form-action CSP doesn't apply): Supabase
// OAuth with PKCE. The code verifier goes into a cookie, Google sends the person to Supabase, and
// Supabase back to /auth/callback on this site. A Google sign-in with the email of an existing
// password account lands in that same account (Supabase links identities with the same verified
// email automatically).
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { serverClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/types";
import { errorText, shown } from "@/lib/errors";
import { returnUrl } from "@/lib/auth-flows";

export async function GET(request: NextRequest) {
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const jar = await cookies();
  jar.set("dzirent-auth-next", next, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    maxAge: 3600,
  });
  const { data, error } = await (await serverClient()).auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: returnUrl(request.nextUrl.origin, "/auth/callback"), skipBrowserRedirect: true },
  });
  if (error || !data?.url) {
    return NextResponse.redirect(new URL("/auth?mode=signin&error=" + encodeURIComponent(errorText(shown("DZ-E7021"))), request.url));
  }
  return NextResponse.redirect(data.url);
}
