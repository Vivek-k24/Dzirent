# dzirent agent instructions

Applies to the entire repository. Read the complete engineering brief before changes.
Authority: explicit user instructions → reconciled brief → approved ADRs → frozen contract → implementation.
Use only this brief for implementation; other source documents supply no business or money rules.

1. Phase 0 ends at the reviewed foundation. Start role prompts only after it merges.
2. Read `docs/architecture/0001-foundation.md`, `contracts/README.md`, `docs/PROJECT_STATUS.md`, and all three `docs/agents/*.md`; record your exact base SHA.
3. Preserve user work. Inspect Git status and instructions before editing. No resets, force pushes, direct pushes to main, or history changes belonging to another agent.
4. Use separate worktrees: `codex/web-phase1`, `claude/api-phase1`, `antigravity/qa-phase1`. Paths, ports, and claims are in `docs/architecture/ownership.md`.
5. Claim a scoped issue before editing. The integrator-controlled ownership registry is the fallback until issues exist. Change that registry through Codex, not concurrent edits.
6. Edit owned paths only. Cross-owner changes need an issue/PR and explicit recorded handoff. Shared JS manifests and lockfile are integrated serially by Codex.
7. Bootstrap authorship is temporary. On foundation merge, Claude owns canonical contracts/fixtures and the API; Antigravity owns independent tests/CI. Each agent then edits only its own status file.
8. Never hand-edit generated OpenAPI or client types. Regenerate with `pnpm contracts:generate`; check drift before PRs. Breaking changes need an ADR, version change, and consumer notification.
9. Pin dependencies; do not independently upgrade to latest. Follow the version matrix and lockfiles.
10. Canonical modes are `demo` and `connected` in `contracts/modes.json`. Show demo simulation visibly. Connected requests fail closed; never substitute mocks on error. Mock API identity is local/test demo only.
11. Next.js is presentation, not a second catalog/authorization backend. FastAPI verifies identity and ownership. Do not trust client owner IDs or role strings.
12. All amounts/ratings are sample display data. No payments, payouts, commissions, protection funds, tax engine, shipping promises, automated pricing, or financial actions.
13. No deployment, DNS, cloud creation, native apps, workers, or Phase 2/3 work in bootstrap. Providers missing credentials do not block local mocks.
14. Never commit secrets or real identity/private evidence. Never persist live tokens/passwords in browser storage. Demo forms accept sample identities only.
15. Run checks relevant to changes. Record the exact command, result, environment, failures, unrun checks, and next action. Never claim an unrun command passed or a deployment exists without URL and SHA.
16. Update your status after milestones; open scoped PRs. Codex integrates one reviewed PR at a time, regenerates derived clients, and reruns affected checks.

Ownership details and post-merge worktree commands: `docs/architecture/ownership.md`.
