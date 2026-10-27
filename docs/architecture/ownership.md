# Ownership and baseline registry

This registry is maintained only by Codex. It is a coordination record, not a shared markdown mutex.

## Focused assignments

### REL-2 / issue #72 - storefront preparation while provider gates remain blocked

Codex scoped claim and explicit fixture/test/Studio-display handoff:
[#72](https://github.com/Vivek-k24/Dzirent/issues/72), under owner assignment #70.
Isolated worktree `H:\DziRent\worktrees\codex-storefront-release`, branch
`codex/storefront-release-20261027`, exact parent `1d48763ed8c4a43b8fb690233d74c92264af617b`
(draft #71); fetched main `c7b3db3929e3cbda6a7d689d3e398b12a792a0bc`.
Review this stack against `codex/production-integration-20261027`, retaining disabled deploy guards.

Owned paths: shell/providers/globals/credits and necessary mock bootstrap; bag price refresh and its
focused test; only the Studio card rental display; fixture generator/manifest/examples/README;
foundation validator; affected collection/release-storefront/taxonomy-fixture checks; the four-test
Foundation CI selection; this entry, project status, own Codex log and the scoped release report.
The issue records each demonstrated dependency before its edit. No other agent log, API/schema,
OpenAPI/generated type, dependency pin/lockfile, source lane or owner review checkout is modified.

Application source `c98732116678f138f69d49aca2fd851412c2bc35`, final assertion fix
`da3500e19c2cad9690c1fd5b5556f91a565f1851`. Fixture content 0.1.1, API candidate.2 unchanged.
All 40 sample base rates are 1800-4000 cents; future lender Band D prices remain valid. Public debug
controls removed, truthful disclosures retained. Final local browser run: 12 pass / 0 skip; earlier
intermittent PDP loading failures remain an explicit independent-review risk. No release approval.
SMTP remains disabled/unverified; protected SQL values remain blank and no hosted SQL was attempted.
Full exact checks, limitations and serial #61 -> #65/#66 integration handoff are in the
[storefront report](../releases/2026-10-27-storefront-preparation.md). Stop at a reviewable draft;
no cloud/SQL/mail/account/deployment/merge/tag changes or new agent activation in this slice.

### REL-2 / issue #70 — owner-authorized integration, 2026-10-27

Codex claim and explicit cross-owner handoff:
[#70](https://github.com/Vivek-k24/Dzirent/issues/70). Worktree
`H:\DziRent\worktrees\codex-production-integration`, branch `codex/production-integration-20261027`,
exact base `c7b3db3929e3cbda6a7d689d3e398b12a792a0bc`.
The master assignment authorizes scoped production integration but conditions cloud writes/migrations,
merges and release on actual cost, security, recovery and review gates. It does not authorize real mail tests.

This checkpoint edits only both `vercel.json` files, `scripts/check-deployment-guards.mjs`, check wiring
in `scripts/task.mjs` / root `package.json`, this registry, `docs/PROJECT_STATUS.md`, own Codex log,
and `docs/releases/2026-10-27-production-readiness.md`. The deployment change prevents an automatic
preview/promotion while preparing and eventually merging partial candidates; it does not itself deploy.
Pinned dependencies/locks, contract/fixtures, product/API code and other agent logs are unchanged.
Read-only Azure helpers/raw evidence remain ignored; the existing PR #31 tooling branch is not edited.
Missing protected SQL settings block schema/data/ACL verification; hosted phase stops there. Do not
reuse destructive test fixtures, reset SQL passwords, grant admin or skip the gate. Broader feature work
and the serial merge/release sequence remain pending under the owner's master assignment.

The current explicit assignment defines required context, exact baseline, owned files, verification
budget and stopping point. Read required context once. Inspect other files only for a demonstrated
dependency, instruction boundary or failure. Historical lane/batch instructions below do not require
unrelated exploration or override a newer scoped handoff. Preserve security, contract ownership and
history protections; expand file ownership only through an explicit recorded handoff.

### AZ-DISC / issue #23 — read-only Azure discovery

Owner: Codex. [Issue #23](https://github.com/Vivek-k24/Dzirent/issues/23).
Workspace `H:\DziRent\worktrees\codex-web`, branch `codex/azure-discovery`, exact baseline
`9581874f0653e2ecfae278472a84bcca775e632a`; verified against one fetch. Existing work/branches preserved.

Required context once: root `AGENTS.md`, this registry, `docs/architecture/version-matrix.md`,
`docs/architecture/setup-dependencies.md`, `infra/runtime/README.md`. No business-rule work is assigned.

Exclusive edits: `AGENTS.md`, this registry, `infra/azure/discover.py`, `infra/azure/pyproject.toml`,
`infra/azure/uv.lock`, `infra/azure/discovery.example.json`, `infra/azure/README.md`,
`infra/azure/.gitignore`, `docs/infra/azure-discovery.md`, `docs/agents/codex.md` (preserve history).
Infrastructure Python dependencies are isolated from the application. Raw local evidence belongs only
in ignored `infra/azure/.local/`; committed findings/configuration are sanitized.

Verify syntax/help and perform one bounded live read-only SDK run; install isolated dependencies once,
then rerun only affected failed sections. No unit tests, browser suites or application builds. Stop at
one pushed reviewable PR with actual authentication/results, explicit unknowns and a conditional minimal
PostgreSQL-17/storage setup plan. No Azure create/update/delete/register/deploy, RBAC/network changes,
secret retrieval, hosted migrations, app/contract/fixture/lock changes, other agents, merges or Vercel
deployment. Provisioning requires the next assignment. Application hosting remains on Vercel.

## Current workflow ownership amendment

For this batch only, ADR 0004 and `docs/parallel-rental-refresh/README.md` supersede the historical
per-language lanes below. The user explicitly requested two independent end-to-end owners and deferred
Antigravity. Claude has the listed Studio web routes/components/MSW extension plus its API/contracts/
fixtures; Codex has shell/catalog/PDP/theme paths. The integrator serially maintains root/CI/this registry.
Both agents use the coordination PR's merged SHA, not their old phase-one branch heads. Their own
agent logs and task-specific test files are separate. No concurrent edits to shared coordination files.

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
