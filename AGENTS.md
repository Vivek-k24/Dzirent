# dzirent agent instructions

Applies to the entire repository. Follow the current assignment's required context and file ownership.
Authority: explicit user instructions → reconciled brief → approved ADRs → frozen contract → implementation.
Use only this brief for implementation; other source documents supply no business or money rules.

1. Phase 0 ends at the reviewed foundation. Start role prompts only after it merges.
2. Read the assignment's required files once and record the exact base SHA. Do not routinely reread the full brief, every log or unrelated directories. If no focused context is supplied, read the foundation/ownership notes and only the brief, contracts, status or logs needed for the assigned change. Business-rule changes still require the complete engineering brief; do not infer rules from unrelated sources.
3. Preserve user work. Inspect Git status and instructions before editing. No resets, force pushes, direct pushes to main, or history changes belonging to another agent.
4. Use the assignment's isolated worktree, branch and exact baseline. Historical Phase 1 worktrees are listed in `docs/architecture/ownership.md`; they do not override newer assignments. If the checkout is dirty, preserve it and use a sibling worktree rather than resetting it.
5. Claim a scoped issue before editing. The integrator-controlled ownership registry is the fallback until issues exist. Change that registry through Codex, not concurrent edits.
6. Record explicit owned paths in the issue/registry and edit only those paths. Cross-owner changes need an issue/PR and explicit recorded handoff. Explore additional files only for a demonstrated dependency, instruction boundary or failure; explain scope expansion. Shared JS manifests and lockfile are integrated serially by Codex.
7. Bootstrap authorship is temporary. On foundation merge, Claude owns canonical contracts/fixtures and the API; Antigravity owns independent tests/CI. Each agent then edits only its own status file.
8. Never hand-edit generated OpenAPI or client types. Regenerate with `pnpm contracts:generate`; check drift before PRs. Breaking changes need an ADR, version change, and consumer notification.
9. Pin dependencies; do not independently upgrade to latest. Follow the version matrix and lockfiles.
10. Canonical modes are `demo` and `connected` in `contracts/modes.json`. Show demo simulation visibly. Connected requests fail closed; never substitute mocks on error. Mock API identity is local/test demo only.
11. Next.js is presentation, not a second catalog/authorization backend. FastAPI verifies identity and ownership. Do not trust client owner IDs or role strings.
12. All amounts/ratings are sample display data. No payments, payouts, commissions, protection funds, tax engine, shipping promises, automated pricing, or financial actions.
13. No deployment, DNS, cloud creation, native apps, workers, or Phase 2/3 work in bootstrap. Providers missing credentials do not block local mocks.
14. Never commit secrets or real identity/private evidence. Never persist live tokens/passwords in browser storage. Demo forms accept sample identities only.
15. Follow the assignment's bounded verification budget. Run relevant checks once; after a failure/change rerun only affected checks and reuse valid evidence for unchanged code. Do not add unrelated builds, browser suites or broad test sweeps. Record exact commands, results, environment, partial results, failures, unrun checks and next action. Never claim an unrun command passed or a deployment exists without URL and SHA.
16. Update your status after milestones; open scoped PRs. Codex integrates one reviewed PR at a time, regenerates derived clients, and reruns affected checks.
17. Stop at the assignment's stated reviewable handoff. A setup/discovery task does not authorize provisioning, deployment, merges or starting other agents. Treat provider capability listings, effective permissions, quotas/capacity and benefit eligibility as separate evidence; mark unknowns explicitly.

## Historical two-workflow batch (2026-10-19)

For assignments continuing that batch, the user's newer instructions supersede the original retail-style layout and testing instructions.
Read `docs/parallel-rental-refresh/README.md` and ADR 0004 when that batch is assigned. Codex owns collection
browsing/shell and Claude owns Studio management/discovery end to end, including the explicitly
handed-off web paths. Antigravity starts after both candidates are ready. Do not add or run unit tests.
`pnpm check` now runs static/media/contract/fixture checks only. Use the bounded PostgreSQL integration
and Chromium desktop/mobile workflow suites; do not run the legacy full matrix on every edit.
The integrator owns CI/root tooling and deployment serialization. Preserve security scans.

Ownership details and post-merge worktree commands: `docs/architecture/ownership.md`.
