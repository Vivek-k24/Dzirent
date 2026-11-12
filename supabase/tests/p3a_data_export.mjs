// P3A test script: "Download my data" through the API, as test user 3.
// 1. Setup (SQL, test data only): test user 3's earlier export times are cleared, so the
//    once-a-day limit doesn't stop this run. Test user 3 must have a chat with test user 1
//    (the P2B and P2C tests made one; this script makes sure).
// 2. The export returns a JSON file (dzirent-data-<date>.json) with "about" first and every part.
// 3. Other people's data: test user 1 appears only as name + handle (chats, rentals, saved
//    studios, blocks, reports); test user 1's email and account id are nowhere in the file.
// 4. A second export within 24 hours is refused with the once-a-day message (HTTP 429).
// 5. No token: 401.
// The export time stays recorded, so test user 3 can't export again for 24 hours.
// Run from the repo root with Node 18+ and the Supabase CLI linked: node supabase/tests/p3a_data_export.mjs

import assert from "node:assert/strict";
import { userEnv, SUPABASE_URL, SUPABASE_KEY, sql, CLI } from "./lib/config.mjs";

async function http(path, { method = "GET", token, body } = {}) {
  const headers = { apikey: SUPABASE_KEY };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${SUPABASE_URL}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { ok: res.ok, status: res.status, headers: res.headers, text: await res.text() };
}
async function signIn(email, password) {
  const res = await http("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } });
  assert.ok(res.ok, `sign-in failed: ${res.status}`);
  const data = JSON.parse(res.text);
  return { token: data.access_token, id: data.user.id };
}
const rest = async (token, path, opts = {}) => {
  const res = await http(`/rest/v1/${path}`, { token, ...opts });
  return { ...res, data: res.text ? JSON.parse(res.text) : null };
};
const exportData = (token) => http("/functions/v1/export-my-data", { method: "POST", token, body: {} });

const PARTS = [
  "account", "profile", "private_profile", "listings", "saved_pieces", "saved_studios", "chats",
  "rentals", "blocked_people", "reports_filed", "warnings", "accessory_declarations",
  "listing_declarations", "legal_acceptances", "age_checks", "notification_settings", "devices",
  "suggestion_choices", "listing_activity", "earlier_exports",
];

/** Every "other person" in the file: an object with only name and handle. */
function people(file) {
  const out = [];
  for (const c of file.chats) out.push(["chat", c.other_person]);
  for (const r of file.rentals) out.push(["rental", r.other_person]);
  for (const p of file.blocked_people) out.push(["block", p]);
  for (const r of file.reports_filed) if (r.person) out.push(["report", r.person]);
  for (const s of file.saved_studios) out.push(["saved studio", Object.fromEntries(Object.entries(s).filter(([k]) => k !== "saved_at"))]);
  return out;
}

async function run() {
  console.log("1. Setup...");
  const u1 = await signIn(userEnv.TEST_USER_1_EMAIL, userEnv.TEST_USER_1_PASSWORD);
  const u3 = await signIn(userEnv.TEST_USER_3_EMAIL, userEnv.TEST_USER_3_PASSWORD);
  const u1Profile = (await rest(u1.token, `profiles?select=display_name,studio_name,studio_handle&id=eq.${u1.id}`)).data[0];
  const listing = (await rest(u1.token, `listings?select=id&status=eq.active&lender_id=eq.${u1.id}&limit=1`)).data[0];
  assert.ok(listing, "test user 1 needs an active listing");
  const chat = await rest(u3.token, "rpc/start_conversation", { method: "POST", body: { p_listing_id: listing.id } });
  assert.ok(chat.ok, `test user 3's chat with test user 1: ${chat.status} ${chat.text}`);
  sql(`delete from public.data_exports where user_id = '${u3.id}'`);
  console.log("   chat with test user 1 ready; test user 3's earlier export times cleared");

  console.log("\n2. The export...");
  const res = await exportData(u3.token);
  assert.equal(res.status, 200, `export: ${res.status} ${res.text.slice(0, 300)}`);
  assert.match(res.headers.get("content-disposition") ?? "", /attachment; filename="dzirent-data-\d{4}-\d{2}-\d{2}\.json"/);
  const file = JSON.parse(res.text);
  const keys = Object.keys(file);
  assert.equal(keys[0], "about", "the file starts with the about part");
  assert.equal(keys[1], "exported_at");
  for (const part of PARTS) {
    assert.ok(part in file, `part ${part} is in the file`);
    assert.ok(part in file.about.parts, `part ${part} is explained in about`);
  }
  assert.equal(file.account.email.toLowerCase(), userEnv.TEST_USER_3_EMAIL.toLowerCase(), "the caller's own email");
  assert.equal(file.profile.id, u3.id, "the caller's own profile");
  assert.ok(file.chats.length > 0, "test user 3 has chats");
  for (const l of file.listings) for (const p of l.photos) assert.ok(String(p.link).includes("/storage/v1/object/public/listing-photos/"), "photo link");
  const sizes = PARTS.map((p) => `${p} ${Array.isArray(file[p]) ? file[p].length : file[p] === null ? "none" : "yes"}`);
  console.log(`   ${res.headers.get("content-disposition")}; ${res.text.length} characters`);
  console.log(`   parts: ${sizes.join(", ")}`);

  console.log("\n3. Other people's data...");
  const u1Name = (u1Profile.studio_name?.trim() || u1Profile.display_name);
  const u1Chat = file.chats.find((c) => c.other_person?.handle === u1Profile.studio_handle && c.other_person?.name === u1Name);
  assert.ok(u1Chat, "the chat with test user 1 shows them by name and handle");
  for (const [where, person] of people(file)) {
    assert.deepEqual(Object.keys(person ?? {}).sort(), ["handle", "name"], `${where}: only name and handle (${JSON.stringify(person)})`);
  }
  for (const c of file.chats) for (const m of c.messages) {
    assert.deepEqual(Object.keys(m).sort(), ["from", "sent_at", "text"], "a message holds only from, text and time");
    assert.ok(m.from === "you" || m.from === "other person");
  }
  const lower = res.text.toLowerCase();
  assert.ok(!lower.includes(userEnv.TEST_USER_1_EMAIL.toLowerCase()), "test user 1's email is not in the file");
  assert.ok(!lower.includes(u1.id.toLowerCase()), "test user 1's account id is not in the file");
  console.log(`   test user 1 appears as ${JSON.stringify(u1Chat.other_person)} only; their email and account id are nowhere in the file`);
  console.log(`   ${people(file).length} other-person entries, each name + handle only; ${file.chats.reduce((n, c) => n + c.messages.length, 0)} messages, each from / text / time only`);

  console.log("\n4. A second export the same day...");
  const again = await exportData(u3.token);
  assert.equal(again.status, 429, `second export: ${again.status} ${again.text}`);
  const said = JSON.parse(again.text).message;
  assert.match(said, /^You can download your data once a day\. Try again after [A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2} [AP]M UTC\.$/);
  console.log(`   refused (429): "${said}"`);

  console.log("\n5. Without a token...");
  const none = await exportData(null);
  assert.equal(none.status, 401, `no token: ${none.status}`);
  console.log("   refused (401)");

  console.log("\nP3A data export test PASSED");
}

run().catch((e) => {
  console.error("\nP3A data export test FAILED:", e.message);
  process.exit(1);
});
