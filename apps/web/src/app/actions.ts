"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { serverClient, currentUser } from "@/lib/supabase/server";
import { safeNext } from "@/lib/types";
import { context } from "@/lib/data";
import { refusalNotice } from "@/lib/refusals";
import { errorText, fromServer, shown } from "@/lib/errors";
const field = (f: FormData, n: string) => String(f.get(n) || "").trim();
export async function authenticate(form: FormData) {
  const client = await serverClient();
  const mode = field(form, "mode");
  const next = safeNext(field(form, "next"));
  const email = field(form, "email");
  const password = String(form.get("password") || "");
  const name = field(form, "name");
  const fail = (message: string, nameError?: string) => {
    const params = new URLSearchParams();
    params.set("mode", mode);
    params.set("next", next);
    if (nameError) {
      params.set("name_error", nameError);
    } else {
      params.set("error", message);
    }
    if (email) params.set("email", email);
    if (name) params.set("name", name);
    redirect("/auth?" + params.toString());
  };
  if (!email || !password) fail("Enter your email and password.");
  if (mode === "signup") {
    if (password.length < 8) fail("Password must be at least 8 characters.");
    if (form.get("adult") !== "on") fail("Please confirm you are at least 18.");
    if (form.get("legal") !== "on")
      fail("Please agree to the Terms of Use and Privacy Policy.");
    if (!name) fail("Enter your name.");
    const { data: nameRefusal } = await client.rpc("check_text", {
      p_text: name,
      p_where: "profile",
    });
    if (nameRefusal) {
      // C1: "DZ-E1050: ..." shown as the catalog's words with the code.
      const refusal = fromServer(String(nameRefusal));
      fail("", refusal ? errorText(refusal) : String(nameRefusal));
    }
    const origin = (await headers()).get("origin") || "https://dzirent.com";
    const location = await context();
    (await cookies()).set("dzirent-auth-next", next, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: origin.startsWith("https://"),
      maxAge: 3600,
    });
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: new URL("/auth/callback", origin).toString(),
        data: {
          display_name: field(form, "name").slice(0, 80),
          role: field(form, "role") || "both",
          adult_confirmed: true,
          city: location.city,
          approx_lat: location.lat,
          approx_lng: location.lng,
        },
      },
    });
    if (error)
      fail(
        errorText(
          shown(
            error.code === "user_already_exists"
              ? "DZ-E1006"
              : error.code === "weak_password"
                ? "DZ-E1007"
                : error.status === 429
                  ? "DZ-E1008"
                  : "DZ-E9999",
          ),
        ),
      );
    if (data.session) {
      await client.rpc("accept_legal", { p_platform: "web" });
      // The age gate (P2C): the website has no app store signal, so the 18+ tick is recorded
      // as self-declared. No birthdate is asked for or stored.
      await client.rpc("record_age_check", {
        p_source: "self_declared",
        p_result: "adult",
        p_platform: "web",
      });
    }
    if (!data.session)
      redirect(
        "/auth?mode=signin&message=" +
          encodeURIComponent(
            "Check your email to confirm your account, then sign in.",
          ) +
          "&next=" +
          encodeURIComponent(next),
      );
  } else {
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error)
      fail(
        errorText(
          shown(
            error.code === "email_not_confirmed"
              ? "DZ-E1005"
              : error.status === 429
                ? "DZ-E1008"
                : "DZ-E1004",
          ),
        ),
      );
  }
  (await cookies()).set("dzirent-welcome", "seen", {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    maxAge: 31536000,
    secure: process.env.NODE_ENV === "production",
  });
  revalidatePath("/", "layout");
  redirect(next);
}
export async function acceptLegalAction() {
  const client = await serverClient();
  const user = await currentUser();
  if (!user) redirect("/auth?mode=signin");
  await client.rpc("accept_legal", { p_platform: "web" });
  revalidatePath("/", "layout");
}
export async function signOut() {
  await (await serverClient()).auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
export async function savePiece(form: FormData) {
  const id = field(form, "id");
  const next = safeNext(field(form, "next"));
  const user = await currentUser();
  if (!user) redirect("/auth?mode=signup&next=" + encodeURIComponent(next));
  if (!/^[a-f0-9-]{36}$/i.test(id)) redirect("/saved");
  const client = await serverClient();
  const result =
    field(form, "saved") === "true"
      ? await client
          .from("saved_listings")
          .delete()
          .eq("user_id", user.id)
          .eq("listing_id", id)
      : await client
          .from("saved_listings")
          .upsert(
            { user_id: user.id, listing_id: id },
            { onConflict: "user_id,listing_id" },
          );
  if (result.error)
    redirect(next + "?notice=" + (refusalNotice(result.error.message) ?? "save-error"));
  revalidatePath("/saved");
  revalidatePath(next);
  redirect(next);
}
export async function studioAction(form: FormData) {
  const handle = field(form, "handle");
  const action = field(form, "action");
  if (!(await currentUser()))
    redirect(
      "/auth?mode=signup&next=" + encodeURIComponent("/studio/" + handle),
    );
  const client = await serverClient();
  const rpc =
    action === "save"
      ? "save_studio"
      : action === "unsave"
        ? "unsave_studio"
        : action === "block"
          ? "block_user"
          : "report_user";
  const { error } = await client.rpc(
    rpc,
    action === "report"
      ? {
          p_handle: handle,
          p_reason: field(form, "reason"),
          p_details: field(form, "details").slice(0, 500) || null,
        }
      : { p_handle: handle },
  );
  if (error)
    redirect(
      "/studio/" + encodeURIComponent(handle) + "?notice=" + (refusalNotice(error.message) ?? "action-error"),
    );
  revalidatePath("/", "layout");
  redirect(
    action === "block"
      ? "/"
      : "/studio/" +
          encodeURIComponent(handle) +
          (action === "report" ? "?notice=reported" : ""),
  );
}
