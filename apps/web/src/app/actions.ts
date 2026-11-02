"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { serverClient, currentUser } from "@/lib/supabase/server";
import { safeNext } from "@/lib/types";
import { context } from "@/lib/data";
const field = (f: FormData, n: string) => String(f.get(n) || "").trim();
export async function authenticate(form: FormData) {
  const client = await serverClient();
  const mode = field(form, "mode");
  const next = safeNext(field(form, "next"));
  const email = field(form, "email");
  const password = String(form.get("password") || "");
  const fail = (message: string) =>
    redirect(
      "/auth?mode=" +
        mode +
        "&next=" +
        encodeURIComponent(next) +
        "&error=" +
        encodeURIComponent(message),
    );
  if (!email || !password) fail("Enter your email and password.");
  if (mode === "signup") {
    if (form.get("adult") !== "on") fail("Please confirm you are at least 18.");
    if (form.get("policy") !== "on")
      fail("Please confirm you understand Dzirent only connects people.");
    if (!field(form, "name")) fail("Enter your name.");
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
        error.code === "user_already_exists"
          ? "An account already exists. Please sign in."
          : "We could not create your account. Check your details and try again.",
      );
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
    if (error) fail("Email or password did not match. Please try again.");
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
  if (result.error) redirect(next + "?notice=save-error");
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
    redirect("/studio/" + encodeURIComponent(handle) + "?notice=action-error");
  revalidatePath("/", "layout");
  redirect(
    action === "block"
      ? "/"
      : "/studio/" +
          encodeURIComponent(handle) +
          (action === "report" ? "?notice=reported" : ""),
  );
}
