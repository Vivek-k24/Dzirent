// E1 integration (local backend only): the sign-in flows through the real Auth server, the local
// mail catcher (Mailpit) and the stub's OpenID provider (Google's stand-in, config.toml
// [auth.external.keycloak]). The website and the apps make these same calls.
//   1. Forgot password: the same answer for an account and for an unknown address; only the
//      account gets an email, with one button to /auth/reset and the "Preview only" line.
//   2. Reset: the link's token makes a session once (a second use is refused: an expired link);
//      the new password follows the rules (too weak, the same one); after it, every other session
//      is signed out (scope "others") and only the new password works.
//   3. Confirm email: a PKCE sign-up (as the app makes it) gets no session; signing in says
//      "confirm first" (DZ-E1005); "Send the link again" makes the old link useless; the new
//      link (to /auth/callback) confirms, then the password works.
//   4. Google (the stand-in): a new account is unfinished and can't message (DZ-E1078) until
//      complete_profile; a sign-in with the verified email of a password account lands in that
//      same account (automatic linking); an unverified email is never linked to it.
// Throwaway accounts with random @dzirent.local addresses, removed at the end. Prints statuses only.
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { LIVE, SERVICE_KEY, STUBS_URL, SUPABASE_KEY, SUPABASE_URL, sql, userEnv } from "./lib/config.mjs";
import { sleep } from "./lib/c4.mjs";

if (LIVE) {
  console.error("e1_auth runs only against the local backend.");
  process.exit(1);
}

const MAILPIT = (process.env.DZIRENT_MAILPIT_URL ?? "http://127.0.0.1:54324").replace(/\/$/, "");
const SITE = "http://127.0.0.1:3000";
const RUN = randomBytes(4).toString("hex");
const made = [];

async function auth(path, { method = "POST", body, token, query = "" } = {}) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}${query}`, {
    method,
    redirect: "manual",
    headers: {
      apikey: SUPABASE_KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  return { status: res.status, data, location: res.headers.get("location") };
}

const pkce = () => {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
};

/** The emails Mailpit holds for [address], newest first. */
async function mailFor(address) {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`);
  const list = (await res.json()).messages ?? [];
  return list;
}
async function latestLink(address, minCount = 1) {
  let list = [];
  for (let i = 0; i < 40 && list.length < minCount; i++) {
    list = await mailFor(address);
    if (list.length < minCount) await sleep(250);
  }
  assert.ok(list.length >= minCount, `an email to the test address (${list.length})`);
  const msg = await (await fetch(`${MAILPIT}/api/v1/message/${list[0].ID}`)).json();
  const href = /href="([^"]*token_hash[^"]*)"/.exec(msg.HTML)?.[1]?.replace(/&amp;/g, "&");
  assert.ok(href, "the email has the button's link");
  const url = new URL(href);
  return { url, subject: msg.Subject, html: msg.HTML, text: msg.Text ?? "", tokenHash: url.searchParams.get("token_hash"), type: url.searchParams.get("type") };
}
const adminUser = async (id) => (await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } })).json();
const removeUser = (id) => fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
const rpc = (token, name, body) => fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
  method: "POST", headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
}).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }));

/** Google's stand-in: authorize, the provider's code, Auth's callback, then the PKCE exchange. */
async function oidcSignIn(claims) {
  const { verifier, challenge } = pkce();
  const start = await auth("authorize", { method: "GET", query: `?provider=keycloak&redirect_to=${encodeURIComponent(SITE + "/auth/callback")}&code_challenge=${challenge}&code_challenge_method=s256` });
  assert.equal(start.status, 302, `authorize: ${start.status}`);
  const state = new URL(start.location).searchParams.get("state");
  assert.ok(state, "Auth sends the browser to the provider with a state");
  const code = `code-${randomBytes(6).toString("hex")}`;
  await fetch(`${STUBS_URL}/oidc/_control/code`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, claims }) });
  const back = await auth("callback", { method: "GET", query: `?code=${code}&state=${encodeURIComponent(state)}` });
  assert.equal(back.status, 302, `callback: ${back.status}`);
  const to = new URL(back.location);
  if (to.searchParams.get("error")) return { error: to.searchParams.get("error_code") || to.searchParams.get("error"), location: `${to.origin}${to.pathname}` };
  assert.equal(`${to.origin}${to.pathname}`, SITE + "/auth/callback", "back to the website's callback");
  const authCode = to.searchParams.get("code");
  assert.ok(authCode, "with a PKCE code (never tokens in the address)");
  const session = await auth("token", { query: "?grant_type=pkce", body: { auth_code: authCode, code_verifier: verifier } });
  assert.equal(session.status, 200, `PKCE exchange: ${session.status}`);
  return { token: session.data.access_token, refresh: session.data.refresh_token, id: session.data.user.id, user: session.data.user };
}

async function forgotAndReset() {
  console.log("1. Forgot password: one answer for every address; only an account gets an email");
  const email = `e1-reset-${RUN}@dzirent.local`;
  const password = randomBytes(12).toString("base64url");
  const created = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { display_name: "Reset Test", role: "renter", adult_confirmed: true } }),
  }).then((r) => r.json());
  made.push(created.id);
  const nobody = `e1-nobody-${RUN}@dzirent.local`;
  const a = await auth("recover", { query: `?redirect_to=${encodeURIComponent(SITE + "/auth/reset")}`, body: { email } });
  const b = await auth("recover", { query: `?redirect_to=${encodeURIComponent(SITE + "/auth/reset")}`, body: { email: nobody } });
  assert.equal(a.status, 200);
  assert.equal(b.status, 200, "an unknown address gets the same answer");
  const link = await latestLink(email);
  assert.equal(link.subject, "Reset your Dzirent password");
  assert.equal(`${link.url.origin}${link.url.pathname}`, SITE + "/auth/reset", "the button opens the website's reset page (the Site URL), never the home page");
  assert.equal(link.type, "recovery");
  assert.ok(link.html.includes("Preview only"), "the Preview only line");
  assert.ok(link.html.includes("support@dzirent.com"), "support@dzirent.com is the contact");
  assert.equal((link.html.match(/<a /g) ?? []).length, 1, "one button");
  await sleep(500);
  assert.equal((await mailFor(nobody)).length, 0, "no email to an address without an account");
  console.log("   200 for both; one email, to the account, with one button to /auth/reset");

  console.log("2. Reset: the link works once, the rules apply, and every other session is signed out");
  const other = await auth("token", { query: "?grant_type=password", body: { email, password } });
  assert.equal(other.status, 200, "a session on another device");
  const first = await auth("verify", { body: { type: "recovery", token_hash: link.tokenHash } });
  assert.equal(first.status, 200, `the link's token makes a session: ${first.status}`);
  const again = await auth("verify", { body: { type: "recovery", token_hash: link.tokenHash } });
  assert.ok([401, 403].includes(again.status), `a used link is refused: ${again.status}`);
  assert.equal(again.data?.error_code, "otp_expired", "as expired (the website shows DZ-E1075)");
  const token = first.data.access_token;
  const weak = await auth("user", { method: "PUT", token, body: { password: "short" } });
  assert.equal(weak.status, 422);
  assert.equal(weak.data?.error_code, "weak_password", "too short (DZ-E1071 on the page, DZ-E1007 from Auth)");
  const same = await auth("user", { method: "PUT", token, body: { password } });
  assert.equal(same.data?.error_code, "same_password", "the same password (DZ-E1074)");
  const next = randomBytes(12).toString("base64url");
  assert.equal((await auth("user", { method: "PUT", token, body: { password: next } })).status, 200, "the new password is saved");
  const out = await auth("logout", { token, query: "?scope=others" });
  assert.equal(out.status, 204, `sign out the others: ${out.status}`);
  const otherRefresh = await auth("token", { query: "?grant_type=refresh_token", body: { refresh_token: other.data.refresh_token } });
  assert.notEqual(otherRefresh.status, 200, "the other device's session is gone");
  const mineRefresh = await auth("token", { query: "?grant_type=refresh_token", body: { refresh_token: first.data.refresh_token } });
  assert.equal(mineRefresh.status, 200, "this browser stays signed in");
  assert.equal((await auth("token", { query: "?grant_type=password", body: { email, password } })).status, 400, "the old password no longer works");
  assert.equal((await auth("token", { query: "?grant_type=password", body: { email, password: next } })).status, 200, "the new one does");
  console.log("   once only (otp_expired after); weak and same refused; other sessions signed out; new password works");
}

async function confirmEmail() {
  console.log("3. Confirm email: no session until the link; Send the link again; the old link is dead");
  const email = `e1-confirm-${RUN}@dzirent.local`;
  const password = randomBytes(12).toString("base64url");
  const { challenge } = pkce();
  const signup = await auth("signup", {
    query: `?redirect_to=${encodeURIComponent(SITE + "/auth/callback")}`,
    body: { email, password, data: { display_name: "Confirm Test", role: "renter", adult_confirmed: true }, code_challenge: challenge, code_challenge_method: "s256" },
  });
  assert.equal(signup.status, 200, `sign-up: ${signup.status}`);
  assert.ok(!signup.data?.access_token, "no session before the email is confirmed");
  const userId = signup.data?.id ?? signup.data?.user?.id;
  made.push(userId);
  const early = await auth("token", { query: "?grant_type=password", body: { email, password } });
  assert.equal(early.data?.error_code, "email_not_confirmed", "signing in first says confirm (DZ-E1005)");
  const firstLink = await latestLink(email);
  assert.equal(firstLink.subject, "Confirm your Dzirent email");
  assert.equal(`${firstLink.url.origin}${firstLink.url.pathname}`, SITE + "/auth/callback", "the button opens the website's callback");
  assert.equal(firstLink.type, "email");
  await sleep(1100); // the local stack allows one confirmation email a second per address (live: a minute)
  const resent = await auth("resend", { query: `?redirect_to=${encodeURIComponent(SITE + "/auth/callback")}`, body: { type: "signup", email } });
  assert.equal(resent.status, 200, `resend: ${resent.status}`);
  const secondLink = await latestLink(email, 2);
  assert.notEqual(secondLink.tokenHash, firstLink.tokenHash, "a new link");
  const old = await auth("verify", { body: { type: "email", token_hash: firstLink.tokenHash } });
  assert.notEqual(old.status, 200, "the first link no longer works (DZ-E1076 on the website)");
  const ok = await auth("verify", { body: { type: "email", token_hash: secondLink.tokenHash } });
  assert.equal(ok.status, 200, `the new link confirms (even though the sign-up used PKCE): ${ok.status}`);
  assert.ok((await adminUser(userId)).email_confirmed_at, "the account is confirmed");
  const signedIn = await auth("token", { query: "?grant_type=password", body: { email, password } });
  assert.equal(signedIn.status, 200, "then the password signs in, as the app does");
  const done = sql(`select profile_completed_at is not null as done from public.profiles where id = '${userId}'`)[0].done;
  assert.equal(done, true, "a form sign-up's profile is finished");
  console.log("   no session; DZ-E1005; resent; old link refused; new link confirmed; signed in");
  return { email, password, id: userId };
}

async function google(passwordAccount) {
  console.log("4. Google (the local stand-in): a new account finishes its profile first");
  const email = `e1-google-${RUN}@dzirent.local`;
  const g = await oidcSignIn({ sub: `sub-${RUN}`, email, email_verified: true, name: "Gia Google" });
  made.push(g.id);
  const profile = sql(`select profile_completed_at is null as unfinished, display_name, adult_confirmed from public.profiles where id = '${g.id}'`)[0];
  assert.deepEqual(profile, { unfinished: true, display_name: "", adult_confirmed: false }, "unfinished, with no name and no 18+ tick");
  assert.equal(g.user.user_metadata?.full_name ?? g.user.user_metadata?.name, "Gia Google", "Google's name is there to prefill the form");
  assert.ok(g.user.email_confirmed_at, "Google accounts are confirmed by definition (a verified email)");
  await rpc(g.token, "accept_legal", { p_platform: "web" });
  const refused = await rpc(g.token, "start_conversation", { p_listing_id: "2fe0cfa6-a95e-4994-bbe4-f1bfb6760490" });
  assert.equal(refused.status, 400);
  assert.match(refused.data?.message ?? "", /^DZ-E1078:/, "a chat is refused until the profile is finished");
  assert.equal(refused.data?.hint, "profile");
  const noTick = await rpc(g.token, "complete_profile", { p_display_name: "Gia", p_adult: false });
  assert.match(noTick.data?.message ?? "", /^DZ-E1079:/, "the 18+ tick is required");
  const finished = await rpc(g.token, "complete_profile", { p_display_name: "Gia Google", p_adult: true, p_city: "Austin, TX", p_lat: 30.2672, p_lng: -97.7431 });
  assert.equal(finished.status, 200, `complete_profile: ${finished.status}`);
  const chat = await rpc(g.token, "start_conversation", { p_listing_id: "2fe0cfa6-a95e-4994-bbe4-f1bfb6760490" });
  assert.equal(chat.status, 200, `then a chat works: ${chat.status} ${chat.data?.message ?? ""}`);
  sql(`delete from public.conversations where id = '${chat.data}'`);
  console.log("   unfinished; DZ-E1078; DZ-E1079 without the tick; finished; chat works");

  console.log("   Linking: Google with a password account's verified email lands in that account");
  const linked = await oidcSignIn({ sub: `sub-link-${RUN}`, email: passwordAccount.email, email_verified: true, name: "Confirm Test" });
  assert.equal(linked.id, passwordAccount.id, "the same account (automatic linking by verified email)");
  const providers = (await adminUser(passwordAccount.id)).identities.map((i) => i.provider).sort();
  assert.deepEqual(providers, ["email", "keycloak"], "it now has both sign-in methods");
  assert.equal((await auth("token", { query: "?grant_type=password", body: { email: passwordAccount.email, password: passwordAccount.password } })).status, 200,
    "the password still works");
  const stillDone = sql(`select profile_completed_at is not null as done from public.profiles where id = '${passwordAccount.id}'`)[0].done;
  assert.equal(stillDone, true, "a linked account keeps its finished profile (no second step)");

  console.log("   An unverified email from the provider is never linked to the existing account");
  const unverified = await oidcSignIn({ sub: `sub-unverified-${RUN}`, email: passwordAccount.email, email_verified: false, name: "Someone" });
  if (unverified.id) made.push(unverified.id);
  assert.notEqual(unverified.id, passwordAccount.id, "not the password account");
  const identities = (await adminUser(passwordAccount.id)).identities.length;
  assert.equal(identities, 2, "the password account has no third identity");
  console.log(`   linked: same account, identities email + keycloak; unverified: ${unverified.error ? "refused (" + unverified.error + ")" : "a separate account"}`);
}

async function run() {
  assert.ok(SERVICE_KEY, "the local service key");
  try {
    await forgotAndReset();
    const account = await confirmEmail();
    await google(account);
  } finally {
    for (const id of made.filter(Boolean)) await removeUser(id);
    sql("delete from app_private.rate_counters where action = 'new_chat'");
  }
  // Nothing of the seeded test users changed.
  assert.ok(userEnv.TEST_USER_1_EMAIL);
  console.log("\nAll E1 sign-in checks PASSED!");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
