// E1: where Google sign-in and the sign-in emails come back to.
//  - Google (Supabase OAuth, PKCE): ?code= is exchanged for a session; ?error= (cancelled, refused)
//    goes back to the sign-in page with DZ-E7022 or DZ-E7020. A first-time Google account then sees
//    "Finish your profile" on whatever page it lands on (the shell), before it can list, rent or
//    message (the database refuses those anyway until complete_profile).
//  - Email links (confirmation, magic link, email change, invite): ?token_hash=&type= is verified
//    here, so the link works in any browser and for accounts made in the app. A confirmed sign-up
//    shows "You're confirmed"; an invite goes to the reset page to choose a password.
//  - A reset link goes to /auth/reset (the template sends it there); an old one sent here is
//    passed on with its token, and the reset page uses it when the form is sent. A reset link
//    Supabase answered with ?code= comes here from the reset page (flow=recovery): exchanged
//    once, then back to /auth/reset inside the reset window.
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { serverClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/types";
import { errorText, shown } from "@/lib/errors";
import { RESET_WINDOW_SECONDS, afterVerified, callbackStep, linkFailurePath } from "@/lib/auth-flows";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const jar = await cookies();
  const next = safeNext(q.get("next") || jar.get("dzirent-auth-next")?.value);
  const go = (path: string) => {
    const response = NextResponse.redirect(new URL(path, request.url));
    response.cookies.set("dzirent-auth-next", "", { path: "/", maxAge: 0 });
    return response;
  };
  const step = callbackStep({ code: q.get("code"), token_hash: q.get("token_hash"), type: q.get("type"), error: q.get("error") });

  if (step.step === "fail") {
    if (step.code === "DZ-E1076") return go(linkFailurePath(q.get("type")));
    return go("/auth?mode=signin&error=" + encodeURIComponent(errorText(shown(step.code))));
  }
  const client = await serverClient();
  if (step.step === "exchange") {
    const { error } = await client.auth.exchangeCodeForSession(step.code);
    // A reset link answered with ?code= (Supabase's default template, PKCE): exchanged once here,
    // then the reset page without the code, inside the reset window.
    if (q.get("flow") === "recovery") {
      if (error) return go("/auth/reset?expired=1");
      jar.set("dzirent-reset", "1", { path: "/", httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", maxAge: RESET_WINDOW_SECONDS });
      return go("/auth/reset");
    }
    if (error) return go("/auth?mode=signin&error=" + encodeURIComponent(errorText(shown("DZ-E7020"))));
    jar.set("dzirent-welcome", "seen", { path: "/", sameSite: "lax", httpOnly: true, maxAge: 31536000, secure: request.nextUrl.protocol === "https:" });
    return go(next);
  }
  if (step.type === "recovery") {
    return go("/auth/reset?token_hash=" + encodeURIComponent(step.tokenHash) + "&type=recovery");
  }
  const { error } = await client.auth.verifyOtp({ token_hash: step.tokenHash, type: step.type === "signup" ? "email" : step.type });
  if (error) return go(linkFailurePath(step.type));
  const then = afterVerified(step.type);
  if (then.resetWindow) {
    jar.set("dzirent-reset", "1", { path: "/", httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", maxAge: RESET_WINDOW_SECONDS });
  }
  jar.set("dzirent-welcome", "seen", { path: "/", sameSite: "lax", httpOnly: true, maxAge: 31536000, secure: request.nextUrl.protocol === "https:" });
  return go(then.path + (then.path.includes("?") ? "&" : "?") + "next=" + encodeURIComponent(next));
}
