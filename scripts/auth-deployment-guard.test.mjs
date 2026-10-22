import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

// Use the already pinned ESLint dependency; no new package or provider call.
const require = createRequire(import.meta.url);
const { minimatch } = createRequire(require.resolve("eslint"))("minimatch");
const authBranch = "codex/native-auth-phase1";
function enabled(rules, branch) {
  const matches = Object.entries(rules).filter(([pattern]) => minimatch(branch, pattern));
  return matches.length === 0 || matches.some(([, value]) => value);
}
test("old star guard does not match a branch containing a slash", () => {
  assert.equal(enabled({ "*": false, main: true }, authBranch), true);
});
for (const file of ["vercel.json", "apps/web/vercel.json"]) {
  test(`${file} suppresses the exact auth branch without disabling main`, () => {
    const rules = JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8")).git.deploymentEnabled;
    assert.equal(rules[authBranch], false);
    assert.equal(enabled(rules, authBranch), false);
    assert.equal(enabled(rules, "main"), true);
  });
}
