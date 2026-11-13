// C1: error and warning codes (contracts/error-codes.json, generated into error-codes.generated.ts).
// The database starts each refusal with its code ("DZ-E2010: Add a photo first") and puts the
// field in the HINT; Edge Functions send { code, message }. The page shows the catalog's words for
// the code (the server's words when the entry says the server adds details), else the server's
// words for a code this build doesn't know yet, else DZ-E9999.
// The .ts extension lets `npm test` (Node, type stripping) load this file as it is.
import { ERROR_CODES } from "./error-codes.generated.ts";

export const FALLBACK_CODE = "DZ-E9999";

export type ShownError = { code: string; message: string; field?: string };

const CODED = /^(DZ-[EW]\d{4}):\s*([\s\S]*)$/;

/** "DZ-E2010: Add a photo first" -> { code, words }; null without a code. */
export function parseCoded(message: string | null | undefined): { code: string; words: string } | null {
  const m = CODED.exec((message ?? "").trim());
  return m ? { code: m[1], words: m[2].trim() } : null;
}

/** The code a message starts with, or null. */
export function codeOf(message: string | null | undefined): string | null {
  return parseCoded(message)?.code ?? null;
}

/** The catalog's words for an error the website itself decided on. */
export function shown(code: string, field?: string): ShownError {
  const known = ERROR_CODES[code] ? code : FALLBACK_CODE;
  const entry = ERROR_CODES[known];
  return { code: known, message: entry.message, field: field ?? entry.field };
}

/** What to show for a coded server message, with [hint] as the field; null without a code. */
export function fromServer(message: string | null | undefined, hint?: string | null): ShownError | null {
  const parsed = parseCoded(message);
  if (!parsed) return null;
  const field = hint?.trim() || undefined;
  const entry = ERROR_CODES[parsed.code];
  if (!entry) {
    return { code: parsed.code, message: parsed.words || ERROR_CODES[FALLBACK_CODE].message, field };
  }
  const words = entry.serverDetail && parsed.words ? parsed.words : entry.message;
  return { code: parsed.code, message: words, field: field ?? entry.field };
}

/** Any error: a database error ({ message, hint }), an Edge Function body ({ code, message }) or anything else. */
export function describeError(error: unknown): ShownError {
  const e = (error ?? {}) as { message?: unknown; hint?: unknown; code?: unknown };
  const message = typeof e.message === "string" ? e.message : undefined;
  const hint = typeof e.hint === "string" ? e.hint : undefined;
  const fromMessage = fromServer(message, hint);
  if (fromMessage) return fromMessage;
  if (typeof e.code === "string" && /^DZ-[EW]\d{4}$/.test(e.code)) {
    return fromServer(`${e.code}: ${message ?? ""}`, hint) ?? shown(FALLBACK_CODE);
  }
  return shown(FALLBACK_CODE);
}

/** "Add a photo first (DZ-E2010)": the words, then the code, so people can quote it. */
export function errorText(error: ShownError): string {
  return `${error.message} (${error.code})`;
}

/** The DZ-W code for a photo warning worded as the scanner words it, or null. */
export function warningCode(message: string): string | null {
  const text = message.trim();
  for (const [code, entry] of Object.entries(ERROR_CODES)) {
    if (entry.kind === "warning" && entry.message === text) return code;
  }
  return null;
}

/** "Too dark: try daylight (DZ-W2002)" for a known photo warning; the words alone otherwise. */
export function warningText(message: string): string {
  const code = warningCode(message);
  return code ? `${message} (${code})` : message;
}
