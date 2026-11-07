import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { currentUser } from "@/lib/supabase/server";
import { Query, value, safeNext } from "@/lib/types";
import { authenticate } from "@/app/actions";
import { Submit } from "@/components/submit";
import { Icon } from "@/components/icon";
import { BrowseGuest } from "@/components/shell";
export const metadata: Metadata = {
  title: "Make yourself at home",
  robots: { index: false, follow: false },
};
export default async function Auth({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const q = await searchParams;
  if (
    process.env.VERCEL_ENV === "preview" &&
    (await headers()).get("host") !== "dzirent.vercel.app"
  ) {
    const query = new URLSearchParams();
    Object.entries(q).forEach(([key, v]) => {
      if (v) query.set(key, Array.isArray(v) ? v[0] : v);
    });
    redirect("https://dzirent.vercel.app/auth?" + query.toString());
  }
  const signup = value(q, "mode") === "signup";
  const next = safeNext(value(q, "next"));
  if (await currentUser()) redirect(next);
  const reasons: Record<string, string> = {
    save: "Keep the pieces you love close.",
    message: "Start a conversation with a local studio.",
    studio: "Get to know the people behind the pieces.",
    list: "Give a good piece another outing.",
    fit: "Find pieces that feel made for you.",
  };
  return (
    <div className="auth-layout page-width">
      <section className="auth-story">
        <span className="eyebrow">THE NEIGHBORHOOD WARDROBE</span>
        <h1>
          A little more
          <br />
          possibility.
          <br />
          <span>A lot more you.</span>
        </h1>
        <p>
          {reasons[value(q, "reason")] ||
            "Good pieces, great people, and your next occasion. All a little closer."}
        </p>
        <div className="auth-values">
          <div>
            <Icon name="pin" /> Find pieces in your neighborhood
          </div>
          <div>
            <Icon name="bookmark" /> Keep your favorites together
          </div>
          <div>
            <Icon name="sparkle" /> Discover what’s likely to fit
          </div>
        </div>
      </section>
      <section className="auth-card">
        <h2>{signup ? "Make yourself at home." : "Welcome back."}</h2>
        <p>
          {signup
            ? "A neighborhood wardrobe, ready when you are."
            : "Your next look is waiting nearby."}
        </p>
        {value(q, "error") && (
          <p role="alert" className="notice error">
            {value(q, "error")}
          </p>
        )}
        {value(q, "message") && (
          <p role="status" className="notice">
            {value(q, "message")}
          </p>
        )}
        <form action={authenticate}>
          <input
            type="hidden"
            name="mode"
            value={signup ? "signup" : "signin"}
          />
          <input type="hidden" name="next" value={next} />
          {signup && (
            <label className="field">
              <span>Your name</span>
              <input name="name" autoComplete="name" maxLength={80} required />
            </label>
          )}
          <label className="field">
            <span>Email</span>
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              name="password"
              type="password"
              autoComplete={signup ? "new-password" : "current-password"}
              minLength={signup ? 8 : undefined}
              required
            />
            {signup && <small>At least 8 characters.</small>}
          </label>
          {signup && (
            <>
              <label className="field">
                <span>I’m here to</span>
                <select name="role" defaultValue="both">
                  <option value="renter">Discover and rent pieces</option>
                  <option value="lender">Share my closet</option>
                  <option value="both">A little of both</option>
                </select>
              </label>
              <label className="checkbox">
                <input type="checkbox" name="adult" required />
                <span>I confirm I am 18 years of age or older.</span>
              </label>
              <label className="checkbox">
                <input type="checkbox" name="legal" required />
                <span>
                  I agree to the{" "}
                  <Link className="accent" href="/terms" target="_blank">
                    Terms of Use
                  </Link>{" "}
                  and{" "}
                  <Link className="accent" href="/privacy" target="_blank">
                    Privacy Policy
                  </Link>
                  .
                </span>
              </label>
              <p style={{ fontSize: "12px", margin: "-6px 0 16px 28px" }}>
                <Link className="muted" href="/about#how-it-works">
                  Read how Dzirent works
                </Link>
              </p>
            </>
          )}
          <Submit label={signup ? "Create account" : "Sign in"} />
        </form>
        <p className="auth-switch">
          {signup ? "Already part of the neighborhood?" : "New around here?"}{" "}
          <Link
            href={
              "/auth?mode=" +
              (signup ? "signin" : "signup") +
              "&next=" +
              encodeURIComponent(next)
            }
          >
            {signup ? "Sign in" : "Create an account"}
          </Link>
        </p>
        <BrowseGuest />
      </section>
    </div>
  );
}
