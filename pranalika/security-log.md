# Security log

Every Security Advisor warning and how it was handled. Updated by the coordinator from agent handoffs.

## Reference project findings (2026-10-30)

Found in the `Dzirent_Android` project. Handled by rebuilding cleanly in `dzirent-server`, not by editing the reference project.

| Finding | Handling in `dzirent-server` | Status |
| --- | --- | --- |
| 3 functions without a fixed search path | Every function gets a fixed search path | Planned (Step 1.2) |
| Internal helper functions callable through the API | Not callable through the API | Planned (Step 1.2) |
| Elevated-rights functions callable by guests | Guests can call shop window functions only | Planned (Step 1.2) |
| Elevated-rights functions callable by signed-in users | Kept only where needed, each checks the caller, logged below | Planned (Step 1.2) |
| `delete-account` relies on its own user check | User verified in code | Planned (Step 1.4) |
| Leaked-password protection off | Turned on | Done |
| Signed-in users can read every profile row | Profiles owner-only, public data through shop window | Planned (Step 1.2) |

## Intended elevated-rights functions

Filled in by Codex in Step 1.6.
