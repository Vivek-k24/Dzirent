# ADR 0004: Two workflow owners and bounded verification

Date: 2026-10-19. Authority: the user's explicit two-agent, end-to-end-workflow instruction.
Source baseline: `a63acc0e9d55d79a918775a57d09bcec63cd3726`.

The user now wants Codex and Claude Code to deliver non-conflicting workflows including their necessary
client/server work. Antigravity will run independent QA after both are ready. This is an explicit scoped
handoff from the historical per-language/path ownership. Exact paths and acceptance are in
`docs/parallel-rental-refresh/README.md`. Only the integrator edits shared CI/root tooling/ownership.

Retail hero slides and horizontal category/mega-menu navigation are replaced by All collections and
Explore Studios. Categories become a collapsible sidebar; existing search/sort/filter semantics remain.
Warm neutral surfaces replace the large white page background. Explore Studios is a lender directory;
each Studio card rotates through all of that Studio's published outfits, showing image/title/size only
for the outfit. This is not a homepage marketing slide. Auto rotation must have pause/manual controls,
pause on hover/focus and respect reduced motion.

The user prohibits unit tests for this batch. Existing unit files are retained but not run. `pnpm check`
now performs static/media/contract/fixture validation only. Routine CI has two workflow gates: static/
build/Chromium desktop+mobile smoke, and a small real-PostgreSQL persistence/ownership selection plus
at most four Studio integration cases. Each agent owns at most two E2E scenarios in its separate file.
Run one bounded invocation per candidate, rerunning only a failed affected scenario after a fix.
The legacy independent QA workflow is manual until Antigravity updates its superseded layout assertions.
Security/dependency scans stay enabled. No dependency updates are bundled with this change.

Both agents may publish branch candidates to the existing deliberate preview process; production
promotion and main merges remain serialized by the integrator. Automatic Git deployment guards stay
false. Never overwrite the other lane's preview/alias or release environment. Record exact SHA and URL;
if authenticated deployment access is absent, push the PR and record that concrete blocker.

The current round does not provision Azure, replace identity, implement payments, or claim hosted DB
integration. Claude's Studio backend is verified with a disposable local/CI PostgreSQL database;
deployed presentation uses explicit MSW demo responses. Real authentication remains independently
developable but integrated with all workflows in the next service-connected milestone.

User geography amendment remains authoritative: no wardrobe city/metro choice. Public Studio UI says
Texas; private origin/address and actual delivery estimation need the future verified-address contract.
This batch removes metro-facing copy/choices from the changed user flows. Existing internal metro wire
fields may be retained only for backward compatibility; do not claim the database migration is complete.
