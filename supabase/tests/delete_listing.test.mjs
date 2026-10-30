// Run with Node >=22.13: node --test supabase/tests/delete_listing.test.mjs
// Auth, database, and Storage are mocked; no environment secrets or network.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const LISTING_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "22222222-2222-4222-8222-222222222222";
const source = stripTypeScriptTypes(
  readFileSync(new URL("../functions/delete-listing/index.ts", import.meta.url), "utf8")
    .replace(/^import[^\r\n]*\r?\n/, ""),
);

function setup({ lenderId = OWNER_ID, files = [], cleanupError = null } = {}) {
  const events = [];
  let remainingFiles = [...files];
  let handler;
  const client = {
    auth: {
      async getUser() {
        events.push("verify-user");
        return { data: { user: { id: OWNER_ID } }, error: null };
      },
    },
    from(table) {
      assert.equal(table, "listings");
      return {
        select() {
          return {
            eq(column, value) {
              assert.equal(column, "id");
              assert.equal(value, LISTING_ID);
              return {
                async maybeSingle() {
                  events.push("read-listing");
                  return { data: { id: LISTING_ID, lender_id: lenderId }, error: null };
                },
              };
            },
          };
        },
        delete() {
          return {
            async eq(column, value) {
              assert.equal(column, "id");
              assert.equal(value, LISTING_ID);
              events.push("delete-listing");
              return { error: null };
            },
          };
        },
      };
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, "listing-photos");
        return {
          async list(folder, { limit, offset }) {
            assert.equal(folder, LISTING_ID);
            events.push(`list:${offset}`);
            return { data: remainingFiles.slice(offset, offset + limit), error: null };
          },
          async remove(paths) {
            events.push(`remove:${paths.length}`);
            assert.ok(paths.length <= 1000);
            for (const path of paths) assert.ok(path.startsWith(`${LISTING_ID}/`));
            if (cleanupError) return { error: cleanupError };
            const removed = new Set(paths);
            remainingFiles = remainingFiles.filter((file) => !removed.has(`${LISTING_ID}/${file.name}`));
            return { error: null };
          },
        };
      },
    },
  };
  const deno = {
    env: { get: (name) => name === "SUPABASE_URL" ? "https://example.test" : "mock-key" },
    serve: (callback) => { handler = callback; },
  };
  new Function("Deno", "createClient", source)(deno, (_url, _key, options) => {
    events.push("create-client");
    assert.equal(options.global.headers.Authorization, "Bearer mock-token");
    return client;
  });
  return { events, handler };
}

function request(signedIn = true) {
  return new Request("https://example.test/functions/v1/delete-listing", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(signedIn ? { Authorization: "Bearer mock-token" } : {}),
    },
    body: JSON.stringify({ listing_id: LISTING_ID }),
  });
}

test("missing authentication performs no database or Storage work", async () => {
  const { handler, events } = setup();
  const response = await handler(request(false));
  assert.equal(response.status, 401);
  assert.deepEqual(events, []);
});

test("another owner's listing cannot reach cleanup or deletion", async () => {
  const { handler, events } = setup({ lenderId: "33333333-3333-4333-8333-333333333333" });
  const response = await handler(request());
  assert.equal(response.status, 404);
  assert.deepEqual(events, ["create-client", "verify-user", "read-listing"]);
});

test("all photo pages are removed before deleting the listing", async () => {
  const files = Array.from({ length: 1001 }, (_, i) => ({ id: `photo-${i}`, name: `photo-${i}.jpg` }));
  const { handler, events } = setup({ files });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(events, [
    "create-client", "verify-user", "read-listing",
    "list:0", "remove:1000", "list:0", "remove:1", "list:0", "delete-listing",
  ]);
});

test("failed photo cleanup keeps the listing for retry", async () => {
  const { handler, events } = setup({
    files: [{ id: "photo", name: "photo.jpg" }],
    cleanupError: { message: "mock Storage failure" },
  });
  const response = await handler(request());
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "photo_cleanup_failed");
  assert.ok(events.includes("remove:1"));
  assert.ok(!events.includes("delete-listing"));
});
