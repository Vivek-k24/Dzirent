# Project status

Date: 2026-10-18 (America/Chicago). Owner: Codex integration owner.
Milestone: **Phase 0 candidate foundation; ready for review after recorded checks**.
Phase 1A/1B/native/realtime work has not started.

Repository: https://github.com/Vivek-k24/Dzirent. PR base:
`bb77fb86b53b2086caf5a65f99614170a2d2c371` (preserved user commit on main).
Candidate baseline: immutable `foundation-v0.1.0` tag; exact full SHA is given by
`git rev-parse 'foundation-v0.1.0^{commit}'` and the foundation PR head.
Contract version: **0.1.0-candidate.1**. This is a proposed freeze, not an assertion of prior joint approval.

Delivered: workspace/version baseline and exact lockfiles; minimal Next status shell/API health;
candidate schema-only OpenAPI with generated TypeScript; deterministic 8-root/40-leaf/40-garment
manifest with one lender and 21 operation examples; canonical modes and startup guards; root scripts,
ownership/agent handoff, architecture notes, first CI/security configuration and actual bootstrap validation.

Read [validation](qa/bootstrap-validation.md) for real commands/results and untested checks.
No full application, CRUD/database schema/migrations, provider authentication, cloud service,
deployment, DNS, native build, reservation or payment work was performed. Readiness remains 503.

Merge gate: review ADR 0001's navigation/availability clarifications, candidate contract and fixture set;
review CI results, then merge the foundation. All roles subsequently start from the **same exact**
tagged SHA in separate worktrees; if review changes code, publish a new candidate tag and notify all roles.
Temporary bootstrap ownership then ends: Claude owns contracts/fixtures/API, Antigravity owns tests/CI.

| Agent | Status | First next task after merge |
| --- | --- | --- |
| Codex | Queued; `codex/web-phase1`, reserved `H:\DziRent\worktrees\codex-web` | Read all logs/contract, record exact base, claim WEB-1; MSW adapter/reset and licensed fashion images; PLP/URL/navigation |
| Claude | Queued; `claude/api-phase1`, reserved `H:\DziRent\worktrees\claude-api` | Adopt contract/fixtures; migrations, deterministic restricted seeds and catalog; Clerk/owner CRUD implementation |
| Antigravity | Queued; `antigravity/qa-phase1`, reserved `H:\DziRent\worktrees\antigravity-qa` | Requirements-to-tests matrix, independent contract/browser checks, extend CI/runbooks |

No role worktree/branch has been activated or agent asked to edit shared files.
Startup commands and separate ports/databases: [README](../README.md) and
[ownership registry](architecture/ownership.md). Provider/media/reviewer dependencies:
[setup list](architecture/setup-dependencies.md). They do not block local mock development.
