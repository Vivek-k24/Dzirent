// P5A: the database's refusals that pages reached by a redirect (save, studio actions) show by
// a short notice code. C1: matched by their catalog codes and shown with the code.
import { codeOf, errorText, shown } from "./errors";

export const REFUSALS = {
  terms: "DZ-E1010",
  "too-often": "DZ-E9001",
} as const;

export type RefusalNotice = keyof typeof REFUSALS;

/** The notice code for a database refusal [message], or null when it isn't one of these. */
export function refusalNotice(message: string | null | undefined): RefusalNotice | null {
  const code = codeOf(message);
  for (const [notice, refusal] of Object.entries(REFUSALS)) {
    if (code === refusal) return notice as RefusalNotice;
  }
  return null;
}

/** The sentence (with its code) for a notice code from the URL, or null. */
export function refusalText(notice: string | null | undefined): string | null {
  return notice && notice in REFUSALS ? errorText(shown(REFUSALS[notice as RefusalNotice])) : null;
}
