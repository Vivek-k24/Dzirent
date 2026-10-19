# Ownership and baseline registry

This registry is maintained only by Codex. It is a coordination record, not a shared markdown mutex.
Bootstrap claim `BOOT-0`: Codex integration owner, Phase 0 foundation only, base
`bb77fb86b53b2086caf5a65f99614170a2d2c371`, branch `bootstrap/foundation` (preserves concurrent user main commit).
It expires on foundation merge. No other agent is running or has been asked to edit shared files.

| Domain after merge | Sole author / reviewer lane |
| --- | --- |
| `apps/web/**`, `apps/mobile/**`, `packages/design-tokens/**`, `packages/client/**` | Codex; generated types are generated only |
| `services/api/**`, `services/worker/**`, `infra/runtime/**` | Claude Code; one Alembic head; Python manifest/uv.lock belong here |
| `contracts/**`, `fixtures/catalog/**` | Claude Code, after joint baseline review/merge |
| `tests/e2e/**`, `tests/contracts/**`, `tests/native/**`, `docs/qa/**`, `docs/runbooks/**`, `.github/workflows/**`, `infra/ci/**` | Antigravity; product-code fixes go to their owner |
| Root manifests/JS lockfile, `compose.yaml`, `AGENTS.md`, `README.md`, both CODEOWNERS files, root tooling, `docs/architecture/**`, `docs/PROJECT_STATUS.md` | Codex integrator; dependencies requested by issue/PR, integrated serially |
| `docs/agents/codex.md`, `claude.md`, `antigravity.md` | Only the named agent after bootstrap |

CODEOWNERS uses the real available GitHub account `@Vivek-k24`. AI lane names are not GitHub
reviewer accounts. Independent human/automation collaborator accounts still need assignment for
enforceable separate domain review. Keep root and `.github/CODEOWNERS` synchronized.

## Reserved role work

All claims below are **queued, inactive until foundation merge**. On activation, choose/create a scoped
GitHub issue and record its link plus the exact baseline SHA in the lane's own status file.
No branch or worktree below has been started by the bootstrap.

| Claim | Agent / branch | Working directory | Ports / database | First scoped task |
| --- | --- | --- | --- | --- |
| WEB-1 | Codex / `codex/web-phase1` | `H:\DziRent\worktrees\codex-web` | web 3000 | MSW contract adapter + reset, licensed fixture photography; header/nav/PLP/URL state |
| API-1 | Claude / `claude/api-phase1` | `H:\DziRent\worktrees\claude-api` | API 8000; PG 5432 / `dzirent_dev` | Adopt candidate contracts/fixtures, migrations/schema/seed, catalog and protected own-profile/listing CRUD |
| QA-1 | Antigravity / `antigravity/qa-phase1` | `H:\DziRent\worktrees\antigravity-qa` | web 3100, API 8100; PG 55432 / `dzirent_qa` | Independent requirements-to-tests matrix; contract/browser acceptance tests and CI/security checks |

After merge, fetch and resolve **one** foundation SHA. The tag must point to the PR's reviewed commit;
if the review changes it, use a new candidate tag rather than moving the old one. Do not use three
independently chosen branch tips. Start in the integration checkout:

```powershell
git fetch origin --tags
$baseline = git rev-parse 'foundation-v0.1.0^{commit}'
git show --no-patch --format=fuller $baseline
git worktree add -b codex/web-phase1 H:/DziRent/worktrees/codex-web $baseline
git worktree add -b claude/api-phase1 H:/DziRent/worktrees/claude-api $baseline
git worktree add -b antigravity/qa-phase1 H:/DziRent/worktrees/antigravity-qa $baseline
```

Run `pnpm install --frozen-lockfile` and `pnpm api:sync` separately as needed in each worktree.
Record the resolved full SHA in each status file. Claude's `pnpm dev:api` uses 8000; Antigravity's
`pnpm dev:qa:*` use 3100/8100. Tests must not share Claude's DB. A QA PostgreSQL instance can use
the committed Compose with `DZIRENT_DB_PORT=55432`, `DZIRENT_DB_NAME=dzirent_qa`, and
`docker compose -p dzirent-qa up -d db`; connect only to that disposable database.

Do not start dependent role work until the foundation is merged and candidate clarifications accepted.
The PR targets the user-created main branch. Configure required checks/review after review;
no branch protection or merge is claimed here.

## Change protocol

Claim by scoped issue or this integrator-controlled registry. Any exception to path ownership needs
an explicit handoff recorded in GitHub. Antigravity may read/test all code but reports production fixes
to Codex or Claude. Contract changes need an ADR/change note, version coordination and notification to
consumers; generated client changes and root JS dependencies are integrated by Codex. Push small
commits, update your own status, open a PR, and let Codex integrate one reviewed candidate at a time.
Never force-push or directly push main. An unpushed local log is not shared coordination.
