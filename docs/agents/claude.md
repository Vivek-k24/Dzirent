# Claude Code handoff (initialized by bootstrap integrator)

This is a queued assignment, not a Claude implementation/test report. Only Claude edits this file after merge.

Task / issue: API-1 reserved; choose/claim a scoped GitHub issue after baseline merge.
Branch: `claude/api-phase1` (reserved, not created).
Worktree: `H:\DziRent\worktrees\claude-api` (reserved, not created).
Base SHA: on activation resolve and record full `foundation-v0.1.0` commit; do not use an independent branch tip.
Current pushed SHA: none for Claude; no role work started.
Owned paths after merge: services/api/**, services/worker/**, contracts/**, fixtures/catalog/**, infra/runtime/**.
Milestone/status: Phase 0 handoff ready for review; Phase 1B queued until foundation merges.
Implemented behavior/files changed by Claude: none. Initial scaffolds were authored temporarily by Codex bootstrap.
Contract: `0.1.0-candidate.1`; review ADR 0001 and examples before implementing; preserve approved shapes.
Checks run by Claude: none. Bootstrap integrator checks are separately recorded in docs/qa/bootstrap-validation.md.
Known dependencies: local PostgreSQL/migrations; real Clerk config + official Python verification SDK for connected auth;
hosted Neon/Render/S3 only when their milestones and authorization exist. Local mocks do not wait for them.
Requested changes: root/Compose/JS dependency requests go to Codex; independent verification requests to Antigravity.
Next action after merge: record full agreed SHA, claim API-1, adopt contract/fixtures, implement one Alembic head,
restricted idempotent seeds, real catalog then own-profile/lender CRUD with persistence/ownership/version tests.
Startup: `pnpm api:sync`; `pnpm dev:api` at 8000; optional `pnpm db:up` at 5432 / dzirent_dev.
Do not mount schema-only declarations as a working backend, accept mock identity in connected mode, or deploy infrastructure.
