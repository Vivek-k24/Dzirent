// P5A: the database's refusals that pages reached by a redirect (save, studio actions) show by
// a short notice code, in the database's own words.
export const REFUSALS = {
  terms: "Please accept the updated Terms of Use and Privacy Policy to continue.",
  "too-often": "You're doing that too often. Try again in a bit.",
} as const;

export type RefusalNotice = keyof typeof REFUSALS;

/** The notice code for a database refusal [message], or null when it isn't one of these. */
export function refusalNotice(message: string | null | undefined): RefusalNotice | null {
  for (const [code, sentence] of Object.entries(REFUSALS)) {
    if (message?.startsWith(sentence)) return code as RefusalNotice;
  }
  return null;
}

/** The sentence for a notice code from the URL, or null. */
export function refusalText(notice: string | null | undefined): string | null {
  return notice && notice in REFUSALS ? REFUSALS[notice as RefusalNotice] : null;
}
