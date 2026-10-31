# Security log

Every Security Advisor warning and how it was handled. Updated by the coordinator from agent handoffs.

## Reference project findings (2026-10-30)

Found in the `Dzirent_Android` project. Handled by rebuilding cleanly in `dzirent-server`, not by editing the reference project.

| Finding | Handling in `dzirent-server` | Status |
| --- | --- | --- |
| 3 functions without a fixed search path | Every function gets a fixed search path | Done (1A) |
| Internal helper functions callable through the API | Not callable through the API | Done (1A) |
| Elevated-rights functions callable by guests | Guests can call shop window functions only | Done (1A) |
| Elevated-rights functions callable by signed-in users | Kept only where needed, each checks the caller, logged below | Done (1A) |
| `delete-account` relies on its own user check | User verified in code | Planned (Step 1.4) |
| Leaked-password protection off | Turned on | Done |
| Signed-in users can read every profile row | Profiles owner-only, public data through shop window | Done (1A), shop window in 1B |

## dzirent-server Advisor check (2026-10-31, after Step 1A)

Verified by the coordinator. No errors. Every remaining finding is intended:

| Finding | Function or table | Why it is intended |
| --- | --- | --- |
| INFO: RLS on, no policies | `us_cities` | Raw table is closed to everyone. Only `search_cities` reads it. |
| WARN: guests can run elevated function | `search_cities` | Guest city search. Returns public city reference data only, bounded results. |
| WARN: signed-in users can run elevated function | `search_cities` | Same as above. |
| WARN: signed-in users can run elevated function | `my_block_peer_ids` | Returns only the caller's own block relationships. |
| WARN: signed-in users can run elevated function | `record_accessory_declaration` | Append-only audit record for the caller. |
| WARN: signed-in users can run elevated function | `record_listing_declaration` | Append-only audit record, caller must own the listing. |
| WARN: signed-in users can run elevated function | `set_conversation_dates` | Renter-only date update through a validated function, no raw update access. |

All of these reject callers with no signed-in user (except `search_cities`).

## Edge Functions

| Function | Check | Status |
| --- | --- | --- |
| `delete-listing` | Gateway JWT check off (required with new API keys). Code verifies the user, confirms the caller owns the listing, runs as the caller under RLS, uses no secret key. Reviewed by coordinator. | Deployed (1A) |
| `delete-account` | Same pattern required | To do (1B) |
