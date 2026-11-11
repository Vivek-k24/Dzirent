#!/usr/bin/env node
// C1: turns contracts/error-codes.json into the code each client reads. One script, no packages.
//   node contracts/generate.mjs          write the generated files
//   node contracts/generate.mjs --check  exit 1 if any generated file is out of date
// The website build (prebuild) and the Android build (generateErrorCodes) run it. The generated
// files are committed, so a machine without Node (the Mac) builds from them as they are.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "contracts", "error-codes.json");
const NOTE = "Generated from contracts/error-codes.json by contracts/generate.mjs. Do not edit.";

export function loadCatalog(path = SOURCE) {
  const catalog = JSON.parse(readFileSync(path, "utf8"));
  const seen = new Set();
  const problems = [];
  for (const e of catalog.codes) {
    const m = /^DZ-([EW])(\d)\d{3}$/.exec(e.code ?? "");
    if (!m) problems.push(`${e.code}: code must look like DZ-E1234 or DZ-W1234`);
    else {
      if ((m[1] === "E") !== (e.kind === "error")) problems.push(`${e.code}: kind must be ${m[1] === "E" ? "error" : "warning"}`);
      if (!catalog.families[m[2]]) problems.push(`${e.code}: no family ${m[2]}xxx`);
    }
    if (seen.has(e.code)) problems.push(`${e.code}: used twice`);
    seen.add(e.code);
    if (!["error", "warning"].includes(e.kind)) problems.push(`${e.code}: kind is error or warning`);
    if (typeof e.area !== "string" || !e.area) problems.push(`${e.code}: area is required`);
    if (typeof e.message !== "string" || !e.message.trim()) problems.push(`${e.code}: message is required`);
    if (!Number.isInteger(e.status) || e.status < 100 || e.status > 599) problems.push(`${e.code}: status is an HTTP status`);
    if (e.field !== undefined && (typeof e.field !== "string" || !e.field)) problems.push(`${e.code}: field is text`);
    const extra = Object.keys(e).filter((k) => !["code", "kind", "area", "status", "message", "field", "server_detail"].includes(k));
    if (extra.length) problems.push(`${e.code}: unknown keys ${extra.join(", ")}`);
  }
  if (!seen.has("DZ-E9999")) problems.push("DZ-E9999 (the fallback) is required");
  if (problems.length) throw new Error("contracts/error-codes.json:\n  " + problems.join("\n  "));
  return catalog;
}

const kt = (s) => '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$/g, "\\$") + '"';

function kotlin(catalog) {
  const rows = catalog.codes.map((e) =>
    `        ErrorCode(${kt(e.code)}, ${e.kind === "error" ? "ErrorKind.ERROR" : "ErrorKind.WARNING"}, ${kt(e.area)}, ${kt(e.message)}, ` +
    `${e.field ? kt(e.field) : "null"}, ${e.status}, ${e.server_detail ? "true" : "false"})`);
  return `// ${NOTE}
package com.dzirent.shared.util

enum class ErrorKind { ERROR, WARNING }

/** One catalog entry: [message] is what people see; [field] the input it is about. */
data class ErrorCode(
    val code: String,
    val kind: ErrorKind,
    val area: String,
    val message: String,
    val field: String?,
    val status: Int,
    /** The server's own sentence carries details (a date, a reason): show it after the code. */
    val serverDetail: Boolean
)

object ErrorCodes {
    val all: List<ErrorCode> = listOf(
${rows.join(",\n")}
    )
}
`;
}

function typescript(catalog) {
  const rows = catalog.codes.map((e) => {
    const o = { kind: e.kind, area: e.area, message: e.message, status: e.status };
    if (e.field) o.field = e.field;
    if (e.server_detail) o.serverDetail = true;
    return `  ${JSON.stringify(e.code)}: ${JSON.stringify(o)},`;
  });
  return `// ${NOTE}
export type ErrorCodeEntry = {
  kind: "error" | "warning";
  area: string;
  message: string;
  status: number;
  field?: string;
  /** The server's own sentence carries details (a date, a reason): show it after the code. */
  serverDetail?: boolean;
};

export const ERROR_CODES: Record<string, ErrorCodeEntry> = {
${rows.join("\n")}
};
`;
}

function markdown(catalog) {
  const esc = (s) => String(s).replace(/\|/g, "\\|");
  const lines = [
    "# Error and warning codes",
    "",
    `<!-- ${NOTE} -->`,
    "",
    "The one source is `contracts/error-codes.json`; this table is generated from it. Errors are `DZ-E####`, warnings `DZ-W####`. The database starts each refusal's message with its code (`DZ-E2010: Add a photo first`) and puts the field in the HINT; Edge Functions answer `{ code, message }` with the status below. Apps and the website show the message for the code (the server's own words when \"Server words\" is yes), then the code in brackets; an unknown code shows the server's words, and anything else `DZ-E9999`.",
    "",
  ];
  for (const [digit, name] of Object.entries(catalog.families)) {
    const rows = catalog.codes.filter((e) => e.code[4] === digit);
    lines.push(`## ${digit}xxx - ${name}`, "");
    if (!rows.length) {
      lines.push("Reserved: no codes yet.", "");
      continue;
    }
    lines.push("| Code | Kind | Area | Status | Field | Server words | Message |", "| --- | --- | --- | --- | --- | --- | --- |");
    for (const e of rows) {
      lines.push(`| \`${e.code}\` | ${e.kind} | ${esc(e.area)} | ${e.status} | ${e.field ? "`" + e.field + "`" : ""} | ${e.server_detail ? "yes" : ""} | ${esc(e.message)} |`);
    }
    lines.push("");
  }
  const errors = catalog.codes.filter((e) => e.kind === "error").length;
  lines.push(`${catalog.codes.length} codes: ${errors} errors, ${catalog.codes.length - errors} warnings.`, "");
  return lines.join("\n");
}

export const OUTPUTS = {
  "mobile/shared/src/commonMain/kotlin/com/dzirent/shared/util/ErrorCodes.kt": kotlin,
  "apps/web/src/lib/error-codes.generated.ts": typescript,
  "supabase/functions/_shared/error-codes.ts": typescript,
  "pranalika/error-codes.md": markdown,
};

function main() {
  const check = process.argv.includes("--check");
  const catalog = loadCatalog();
  const stale = [];
  for (const [path, render] of Object.entries(OUTPUTS)) {
    const target = join(ROOT, path);
    const text = render(catalog);
    const current = existsSync(target) ? readFileSync(target, "utf8").replace(/\r\n/g, "\n") : null;
    if (current === text) continue;
    if (check) {
      stale.push(relative(ROOT, target));
    } else {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, text);
      console.log(`wrote ${path}`);
    }
  }
  if (check && stale.length) {
    console.error("Out of date (run node contracts/generate.mjs):\n  " + stale.join("\n  "));
    process.exit(1);
  }
  if (check) console.log(`error codes: ${catalog.codes.length} codes, generated files up to date`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
