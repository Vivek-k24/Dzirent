# Antigravity handoff (initialized by bootstrap integrator)

This is a queued assignment, not independent QA approval. Only Antigravity edits this file after merge.

Task / issue: QA-1 reserved; choose/claim a scoped GitHub issue after baseline merge.
Branch: `antigravity/qa-phase1` (reserved, not created).
Worktree: `H:\DziRent\worktrees\antigravity-qa` (reserved, not created).
Base SHA: on activation resolve and record full `foundation-v0.1.0` commit; all roles use exactly that SHA.
Current pushed SHA: none for Antigravity; no role work started.
Owned paths after merge: tests/e2e/**, tests/contracts/**, tests/native/**, docs/qa/**, docs/runbooks/**,
.github/workflows/**, infra/ci/**. Read/test all code; route production fixes to its owner.
Milestone/status: Phase 0 handoff ready for review; independent Phase 1 verification queued until merge.
Implemented behavior/files changed by Antigravity: none. Bootstrap checks/workflows were temporarily authored by Codex.
Contract: `0.1.0-candidate.1`; review candidate clarifications and fixture examples before freezing acceptance expectations.
Checks run by Antigravity: none. Codex's foundation validation is not independent acceptance.
Known gaps: full 1A browser acceptance, real connected persistence/authorization, deployed preview, native devices all unrun.
Requested changes: root dependencies/lockfile through Codex; backend/contract/fixture changes through Claude after merge.
Next action after merge: record full common SHA, claim QA-1, create requirements matrix, independent browser/contract
tests and CI/runbooks. Test failed paths, URL/history, accessibility, true counts and mode separation.
Startup: `pnpm dev:qa:web` 3100 and `pnpm dev:qa:api` 8100. Isolated PostgreSQL project dzirent-qa,
port 55432 / database dzirent_qa; never share Claude's database or use production data.
Report tested SHA/commands/environment and untested gates. Browser emulation cannot prove native-device compatibility.
