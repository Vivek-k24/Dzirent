# Ownership and baseline registry

This registry is maintained only by Codex. It is a coordination record, not a shared markdown mutex.
Completed integration claim `REL-1`: Codex, PR #13 merged at
`baf04b67ccaede358b3e4aab526c0b6889bb09bb`; deployed presentation demo at
https://dzirent.vercel.app/. Release-record follow-up uses `codex/release-record` from that exact
merged baseline and changes documentation/evidence only. Original foundation base
`2ff5cae77ec165637ae02fade6d4619826760f28`. The user's explicit completion instruction authorizes
the scoped API/QA handoff in ADR 0003; existing role branches and agent logs remain preserved.
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

WEB-1 is active under the user's explicit Phase 1A instructions:
[issue #2](https://github.com/Vivek-k24/Dzirent/issues/2), base
`37957823213cd2b25e980edad5058becdf9a7fbb`, assigned checkout and branch below. The directory was empty;
Codex initialized that isolated checkout directly without switching branches or editing the main checkout.
Foundation PR #1 merged at `2ff5cae77ec165637ae02fade6d4619826760f28`. API-1 has separately claimed
issue #3 under explicit user activation. Under the user's Section 13.2 continuation, Antigravity's
independent QA lane is explicitly delegated QA-2 / #10 in its assigned checkout, with no frontend/API
ownership handoff. Each lane's implementation status belongs to its own log/PR. Frontend #5, backend #11 and QA #12 are now merged through REL-1 PR #13. Their role work and
log entries below remain historical records. New lane work starts from latest origin/main; see
`docs/PROJECT_STATUS.md` for the deployed code baseline and connected-provider limitations.

| Claim | Agent / branch | Working directory | Ports / database | First scoped task |
| --- | --- | --- | --- | --- |
| WEB-1 / #2 | Codex / `codex/web-phase1` | `H:\DziRent\worktrees\codex-web` | web 3000 | Active Phase 1A web candidate; review, independent QA, authorized preview |
| API-1 / #3 | Claude / `claude/api-phase1` | `H:\DziRent\worktrees\claude-api` | API 8000; PG 5432 / `dzirent_dev` | Separately claimed; approved catalog and protected own-profile/listing CRUD handoff |
| QA-1 | Antigravity / `antigravity/qa-phase1` | `H:\DziRent\worktrees\antigravity-qa` | web 3100, API 8100; PG 55432 / `dzirent_qa` | Independent requirements-to-tests matrix; contract/browser acceptance tests and CI/security checks |

After merge, fetch and resolve **one** foundation SHA. Create only missing role checkouts/branches;
do not rerun the Codex creation command against its existing assigned checkout.
The tag must point to the PR's reviewed commit;
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
