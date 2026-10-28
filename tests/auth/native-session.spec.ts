import { randomBytes } from "node:crypto";
import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

const base = "http://127.0.0.1:3500";
const control = "http://127.0.0.1:8500/_auth62/control";
const key = process.env.DZIRENT_AUTH62_CONTROL;
if (!key || process.env.DZIRENT_ENVIRONMENT !== "test" || process.env.DZIRENT_REQUIRE_DB_TESTS !== "1") throw new Error("Private local test configuration is required");

async function mailToken(request: APIRequestContext, email: string, purpose = "verify_email") {
  const response = await request.get(control, { headers: { "X-Auth62-Control": key! }, params: { email, purpose } });
  expect(response.status()).toBe(200);
  return (await response.json()).token as string;
}
async function setMode(request: APIRequestContext, mode: string) {
  const response = await request.post(control, { headers: { "X-Auth62-Control": key! }, data: { mode } });
  expect(response.status()).toBe(200);
}
async function privatePassword(page: Page, id: string, value: string) {
  // No trace/video/screenshots, and no secret in locator action/error call logs.
  await page.locator(id).waitFor();
  await page.evaluate(({ id, value }) => {
    const input = document.querySelector<HTMLInputElement>(id)!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, { id, value });
}
async function recover(page: Page, action: "verify-email" | "reset-password", token: string) {
  // The private fragment is installed in-memory; navigation/error URLs never contain it.
  await page.addInitScript(({ action, token }) => {
    if (location.pathname === `/auth/${action}`) history.replaceState(null, "", `${location.pathname}#token=${token}`);
  }, { action, token });
  await page.goto(`/auth/${action}`);
  await expect(page.getByText("Confirm this request to consume your single-use link.", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => location.hash.length)).toBe(0);
}
async function register(page: Page, request: APIRequestContext, email: string, password: string, role: "renter" | "lender") {
  await page.goto(`/auth/${role}/signup`);
  await page.getByLabel("Display name", { exact: true }).fill(`Local ${role}`);
  await page.getByLabel("Email you own").fill(email);
  await privatePassword(page, "#native-password", password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByText("Registration does not verify your email.", { exact: false })).toBeVisible();
  const token = await mailToken(request, email);
  await recover(page, "verify-email", token);
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(page.getByText("Email verified. You can sign in.", { exact: true })).toBeVisible();
}
async function signIn(page: Page, email: string, password: string, role: "renter" | "lender" = "renter") {
  await page.goto(`/auth/${role}/login`);
  await page.getByLabel("Email you own").fill(email);
  await privatePassword(page, "#native-password", password);
  await page.getByRole("button", { name: "Sign in", exact: true }).focus();
  await page.keyboard.press("Enter");
}
async function identity(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch("/auth/api/me", { cache: "no-store" });
    return { status: response.status, body: await response.json() };
  });
}

test.beforeEach(async ({ context, request }) => {
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    return ["127.0.0.1", "localhost"].includes(url.hostname) ? route.continue() : route.abort();
  });
  await setMode(request, "normal");
});

test("renter signup, private recovery, session restoration, reset, logout and deactivation", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.name));
  const email = `auth62-browser-renter-${randomBytes(4).toString("hex")}@mail.dzirent.com`;
  const password = randomBytes(24).toString("base64url"), fresh = randomBytes(24).toString("base64url");
  await register(page, request, email, password, "renter");
  await signIn(page, email, password);
  await page.waitForURL(base + "/");
  await page.goto("/auth/account");
  await expect(page.getByText("Email confirmed", { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByText(email, { exact: false })).toBeVisible();
  const own = await identity(page);
  expect(own.status).toBe(200); expect(own.body.roles).toEqual(["renter"]);
  const storage = await page.evaluate(() => ({ local: JSON.stringify(localStorage), session: JSON.stringify(sessionStorage), visibleCookie: document.cookie }));
  expect(![email, password].some(value => storage.local.includes(value) || storage.session.includes(value))).toBe(true);
  expect(storage.visibleCookie).not.toMatch(/dzirent_(session|csrf|client)/);
  for (const cookie of (await page.context().cookies()).filter(cookie => cookie.name.startsWith("dzirent_"))) {
    expect(cookie.httpOnly).toBe(true); expect(cookie.sameSite).toBe("Lax"); expect(cookie.path).toBe("/"); expect(cookie.domain).toBe("127.0.0.1");
  }
  await page.getByRole("button", { name: "Sign out this session", exact: true }).click();
  await page.waitForURL(base + "/");
  expect((await identity(page)).status).toBe(401);
  await page.goto("/auth/forgot-password");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Request recovery email", exact: true }).click();
  await expect(page.getByText("If this account is eligible", { exact: false })).toBeVisible();
  await recover(page, "reset-password", await mailToken(request, email, "reset_password"));
  await privatePassword(page, "#recovery-password", fresh);
  await page.getByRole("button", { name: "Reset password", exact: true }).click();
  await expect(page.getByText("Password changed. Sign in again", { exact: false })).toBeVisible();
  await signIn(page, email, fresh);
  await page.waitForURL(base + "/");
  await page.goto("/auth/account");
  await page.getByRole("combobox", { name: "Action", exact: true }).selectOption("deactivate");
  await privatePassword(page, "#current-password", fresh);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Deactivate account", exact: true }).click();
  await page.waitForURL(/\/auth\/renter\/login$/);
  expect((await identity(page)).status).toBe(401);
  expect(errors).toEqual([]);
});

test("verified lender enrollment and isolation from a separate renter context", async ({ page, request, browser }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.name));
  const email = `auth62-browser-lender-${randomBytes(4).toString("hex")}@mail.dzirent.com`;
  const password = randomBytes(24).toString("base64url");
  await register(page, request, email, password, "lender");
  await signIn(page, email, password, "lender");
  await page.getByLabel("Lender display name").fill("Local browser lender");
  await page.getByRole("combobox", { name: "Metro", exact: true }).selectOption({ label: "Houston" });
  await page.getByRole("button", { name: "Create lender profile", exact: true }).click();
  await page.waitForURL(/\/lender\/dashboard$/);
  const own = await identity(page);
  expect(own.status).toBe(200); expect(own.body.roles).toEqual(["renter", "lender"]);
  expect(own.body.lender_profile.display_name).toBe("Local browser lender");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Hello, Local lender.", exact: true })).toBeVisible();
  const other = await browser.newContext({ baseURL: base });
  try {
    await other.route("**/*", route => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
    const visitor = await other.newPage();
    visitor.on("pageerror", error => errors.push(error.name));
    await visitor.goto("/auth/renter/login");
    await expect(visitor.getByLabel("Email you own")).toBeVisible();
    expect((await identity(visitor)).status).toBe(401);
    const renterEmail = `auth62-browser-other-${randomBytes(4).toString("hex")}@mail.dzirent.com`;
    const renterPassword = randomBytes(24).toString("base64url");
    await register(visitor, request, renterEmail, renterPassword, "renter");
    await signIn(visitor, renterEmail, renterPassword);
    await visitor.waitForURL(base + "/");
    const renter = await identity(visitor);
    expect(renter.status).toBe(200); expect(renter.body.roles).toEqual(["renter"]);
    expect(renter.body.id).not.toBe(own.body.id); expect(renter.body.lender_profile).toBeNull();
    expect((await identity(page)).body.id).toBe(own.body.id);
    expect(await visitor.evaluate(async () => (await fetch("/auth/api/lender/products")).status)).toBe(403);
  } finally { await other.close(); }
  expect(errors).toEqual([]);
});

test("real BFF denies injected identity, traversal, CSRF, oversized input and redirects", async ({ page, request }) => {
  await page.goto("/");
  const response = await request.get(`${base}/auth/api/me`, { headers: { Authorization: "Bearer mock:sample-lender", "X-User-ID": "other", "X-Role": "platform_admin", "X-Forwarded-For": "203.0.113.1" } });
  expect(response.status()).toBe(401);
  const observation = await request.get(control, { headers: { "X-Auth62-Control": key! } });
  expect((await observation.json()).observed.forbidden_headers).toEqual([]);
  for (const path of ["admin/users", "auth/login/extra", "catalog/products/a%2Fb", "%252e%252e/me"]) expect((await request.get(`${base}/auth/api/${path}`)).status()).toBe(404);
  expect((await request.get(`${base}/auth/api/auth/session`, { headers: { Host: "evil.example" } })).status()).toBe(403);
  expect((await request.post(`${base}/auth/api/auth/logout`, { headers: { Origin: base }, data: {} })).status()).toBe(403);
  expect((await request.post(`${base}/auth/api/auth/login`, { headers: { Origin: "https://evil.example" }, data: {} })).status()).toBe(403);
  expect((await request.post(`${base}/auth/api/auth/login`, { headers: { Origin: base, "Sec-Fetch-Site": "cross-site" }, data: {} })).status()).toBe(403);
  expect((await request.post(`${base}/auth/api/auth/login`, { headers: { Origin: base, "Content-Type": "application/json" }, data: "x".repeat(16385) })).status()).toBe(413);
  await setMode(request, "redirect");
  expect((await request.get(`${base}/auth/api/catalog/facets`, { maxRedirects: 0 })).status()).toBe(503);
  await setMode(request, "normal");
});

test("connected outage is visible and never becomes a mock session", async ({ page, request }) => {
  await setMode(request, "offline");
  try {
    await page.goto("/auth/renter/login");
    await expect(page.getByText("Session check unavailable.", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry session check" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue as sample renter" })).toHaveCount(0);
    await expect(page.getByLabel("Email you own")).toHaveCount(0);
  } finally { await setMode(request, "normal"); }
});
