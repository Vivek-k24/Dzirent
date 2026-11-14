// C4: npm test: the admin Settings page's reading and checking of a value (the database checks again).
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatSettingValue, groupSettings, parseSettingInput, settingInput, type AdminSetting } from "./admin-settings.ts";

const hours = { type: "integer" as const, min: 1, max: 336, unit: "hours", choices: null };
const percent = { type: "number" as const, min: 0, max: 30, unit: "percent of the rental price", choices: null };

test("numbers are checked against the range and kind", () => {
  assert.deepEqual(parseSettingInput(hours, " 48 "), { ok: true, value: 48 });
  assert.deepEqual(parseSettingInput(hours, "0"), { ok: false, problem: "Enter a value from 1 to 336 (hours)." });
  assert.deepEqual(parseSettingInput(hours, "12.5"), { ok: false, problem: "Enter a whole number." });
  assert.deepEqual(parseSettingInput(hours, "soon"), { ok: false, problem: "Enter a number." });
  assert.deepEqual(parseSettingInput(percent, "2.5"), { ok: true, value: 2.5 });
  assert.equal(parseSettingInput(percent, "31").ok, false);
});

test("switches, time zones, choices and rate limits", () => {
  assert.deepEqual(parseSettingInput({ type: "boolean", min: null, max: null, unit: null, choices: null }, "true"), { ok: true, value: true });
  assert.deepEqual(parseSettingInput({ type: "timezone", min: null, max: null, unit: null, choices: null }, "America/Chicago"), { ok: true, value: "America/Chicago" });
  assert.equal(parseSettingInput({ type: "timezone", min: null, max: null, unit: null, choices: null }, "Austin time").ok, false);
  assert.equal(parseSettingInput({ type: "choice", min: null, max: null, unit: null, choices: ["latest"] }, "all").ok, false);
  const rate = { type: "rate_limit" as const, min: 1, max: 1000, unit: "per minute", choices: null, value: { max: 30, window_seconds: 60 } };
  assert.equal(settingInput(rate), "30");
  assert.equal(formatSettingValue(rate), "30 per minute");
  assert.deepEqual(parseSettingInput(rate, "45"), { ok: true, value: 45 });
});

test("values read as words, grouped by area", () => {
  assert.equal(formatSettingValue({ type: "integer", value: 48, unit: "hours" }), "48 hours");
  assert.equal(formatSettingValue({ type: "boolean", value: false, unit: null }), "Off");
  const row = (key: string, area: AdminSetting["area"], label: string) => ({ key, area, label }) as AdminSetting;
  const groups = groupSettings([row("b", "retention", "Zeta"), row("a", "payments", "Fee"), row("c", "retention", "Alpha")]);
  assert.deepEqual(groups.map(([title, rows]) => [title, rows.map((r) => r.key)]), [["Payments", ["a"]], ["Retention", ["c", "b"]]]);
});
