// The database's refusals that mean "this is an admin who needs to enter a two-step code"
// (app_private.require_admin): none in this session yet, or the last one is older than 24 hours.
export const ADMIN_CODE_FIRST = "Sign in with two-step verification to use admin tools";
export const ADMIN_CODE_STALE = "Enter a new two-step code to keep using admin tools";
export const ADMIN_CODE_NEEDED = [ADMIN_CODE_FIRST, ADMIN_CODE_STALE];
