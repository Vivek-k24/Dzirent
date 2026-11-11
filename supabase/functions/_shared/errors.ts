// C1: every Edge Function error is { code, message } with the catalog's status
// (contracts/error-codes.json, generated into ./error-codes.ts).

import { ERROR_CODES } from "./error-codes.ts";

export const FALLBACK_CODE = "DZ-E9999";

/** The body for [code]: the catalog's words unless [message] is given (the database's own sentence). */
export function errorBody(code: string, message?: string): { code: string; message: string } {
  const known = ERROR_CODES[code] ? code : FALLBACK_CODE;
  return { code: known, message: message ?? ERROR_CODES[known].message };
}

/** The catalog's HTTP status for [code]. */
export function errorStatus(code: string): number {
  return (ERROR_CODES[code] ?? ERROR_CODES[FALLBACK_CODE]).status;
}

/** The code a database refusal starts with ("DZ-E7001: You can download ..."), or null. */
export function codeOf(message: unknown): string | null {
  if (typeof message !== "string") return null;
  const m = /^(DZ-[EW]\d{4}):\s*/.exec(message);
  return m && ERROR_CODES[m[1]] ? m[1] : null;
}
