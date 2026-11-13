// The database's refusals that mean "this is an admin who needs to enter a two-step code"
// (app_private.require_admin): none in this session yet, or the last one is older than 24 hours.
// C1: matched by their codes (contracts/error-codes.json), not their words.
import { codeOf } from "./errors";

export const ADMIN_CODE_FIRST = "DZ-E5002";
export const ADMIN_CODE_STALE = "DZ-E5003";
export const ADMIN_CODE_NEEDED = [ADMIN_CODE_FIRST, ADMIN_CODE_STALE];

/** True when [message] is one of the two "enter a two-step code" refusals. */
export function adminCodeNeeded(message: string | null | undefined): boolean {
  const code = codeOf(message);
  return code !== null && ADMIN_CODE_NEEDED.includes(code);
}
