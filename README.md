# dzirent

Phase 1A web candidate: a responsive catalog, PDP, bag, non-transactional checkout preview,
sample auth and a resettable lender workspace. All forty canonical outfits use local licensed
fashion photography. The authoritative specification is
[`Dzirent_Engineering_Brief_and_AI_Prompts.md`](Dzirent_Engineering_Brief_and_AI_Prompts.md).
No connected CRUD, live identity, deployment, native app or business/payment integration is claimed.

Base: **37957823213cd2b25e980edad5058becdf9a7fbb**, immutable `foundation-v0.1.0`.
Contract: **0.1.0-candidate.1**, consumed unchanged. The user activated this web lane explicitly
while foundation PR #1 remained open. Foundation approval/merge remains an integration dependency.
See [web validation](apps/web/VALIDATION.md) and [preview preparation](apps/web/DEPLOYMENT.md).

## Local start

Use Node **22.23.3**, pnpm **10.29.3**, Python **3.12.15**, uv **0.13.1**.
The machine's original Node 18 is unsupported. No global tool configuration was changed.
On this Windows checkout, a checksummed Node distribution and uv were installed under ignored `.tools/`:

```powershell
$env:Path = "$PWD\.tools\node-v22.23.3-win-x64;$PWD\.tools\bootstrap\Scripts;$env:Path"
node --version
pnpm install --frozen-lockfile
pnpm dev:web
```

Demo mode needs no API process, database, provider account or key. Optional API foundation checks:

```powershell
pnpm api:sync
pnpm dev:api
```

Web: http://127.0.0.1:3000. API foundation liveness:
http://127.0.0.1:8000/api/v1/health/live. Readiness deliberately returns **503** until
Claude implements a real DB check. Candidate CRUD routes exist in generated OpenAPI only;
they are not mounted by the health runtime. A successful health check is not connected acceptance.

Fresh clones need Node/pnpm/uv installed at the versions above. `uv python install 3.12.15`
can provide the pinned Python. `.tools/` is a checkout-local convenience and is not committed.
No provider account, external API key, database, or Docker is needed for the complete local demo.
Use Demo controls to reset the forty outfits or simulate request/save failures. Sample passwords are fixed;
no real credentials are accepted. Photos are illustrative; credits/licenses are available at `/credits`.

## Root commands

| Command | Purpose |
| --- | --- |
| `pnpm dev:web` / `pnpm dev:api` | Complete local MSW web demo / API foundation health, ports 3000 / 8000 |
| `pnpm dev:web:connected` / `pnpm dev:api:connected` | Connected configuration guards; require configured env and later Phase 1B implementation |
| `pnpm dev:qa:web` / `pnpm dev:qa:api` | Separate QA demo ports 3100 / 8100 |
| `pnpm api:sync` | Frozen Python install from `services/api/uv.lock` |
| `pnpm contracts:generate` | FastAPI declarations → OpenAPI → TypeScript; never hand-edit generated output |
| `pnpm contracts:check` | Detect generated contract/type drift without changing tracked files |
| `pnpm fixtures:check` | Cardinalities, references, example schemas, deterministic regeneration |
| `pnpm test:web` / `pnpm media:check` | Focused adapter/mock tests; verify local media hashes, canonical IDs and licenses |
| `pnpm check` | JS lint/typecheck/tests/media; Python Ruff/mypy/pytest; contract/fixture checks |
| `pnpm build` | Production Next build; public deployment and independent QA remain separate gates |
| `pnpm smoke:web` | Web-lane Chromium/axe workflows and loading/image/404 checks at port 3000; start `pnpm dev:web` first |
| `pnpm db:up` / `pnpm db:down` | Optional loopback-only PostgreSQL 17.11; down preserves the volume |

Environment templates: `apps/web/.env.example`, `services/api/.env.example`.
Set env in the terminal or copy to ignored `.env.local` (web) / `.env` (API).
Never place server secrets in `NEXT_PUBLIC_*`. See [modes](contracts/README.md#modes).
Install browser engines with `pnpm exec playwright install chromium firefox webkit`.
Set `DZIRENT_SMOKE_URL` to test another local port and `DZIRENT_SMOKE_BROWSERS=firefox,webkit`
for the responsive/accessibility matrix. Full mutation workflows run in Chromium. These integration
checks live in `apps/web/scripts`; Antigravity retains ownership of independent acceptance tests/CI.

## Shared handoff

| Lane | Branch / separate reserved directory | Start after foundation merge | Next task |
| --- | --- | --- | --- |
| Codex | `codex/web-phase1` / `H:\DziRent\worktrees\codex-web` | `pnpm dev:web` (3000) | Active WEB-1/#2; complete Phase 1A candidate, independent review and authorized preview |
| Claude Code | `claude/api-phase1` / `H:\DziRent\worktrees\claude-api` | `pnpm dev:api` (8000); optional `pnpm db:up` | Adopt contract/fixtures; Alembic schema/seeds, public catalog, verified identity and owner CRUD |
| Antigravity | `antigravity/qa-phase1` / `H:\DziRent\worktrees\antigravity-qa` | `pnpm dev:qa:web` (3100), `pnpm dev:qa:api` (8100) | Independent requirements matrix, browser/contract tests; extend first CI |

The Codex lane is active under the user's explicit instructions. Other lanes remain governed by
foundation review and their own agent logs. Start each from the exact agreed foundation SHA
using [ownership](docs/architecture/ownership.md); do not pick independent branch tips.
QA database: `dzirent_qa` on its separate disposable instance/port **55432**, Compose project `dzirent-qa`;
API development: `dzirent_dev`, **5432**, Compose project `dzirent-local`.

Read [AGENTS.md](AGENTS.md), [architecture](docs/architecture/0001-foundation.md),
[contract semantics/examples](contracts/README.md), [fixture notes](fixtures/catalog/README.md),
[project status](docs/PROJECT_STATUS.md), and all [agent logs](docs/agents/) before role work.
Actual commands/results and untested gates are recorded in [bootstrap validation](docs/qa/bootstrap-validation.md).
Provider setup dependencies are listed in [setup](docs/architecture/setup-dependencies.md).

The remote was initially empty. The brief-only base was preserved on `bootstrap/brief`.
A concurrent user commit created `main` (`bb77fb86b53b2086caf5a65f99614170a2d2c371`),
which is preserved as the foundation PR base. Protect main and require CI/owner review after the
reviewed foundation lands. This agent did not push or merge changes directly to main.

An attached Vercel GitHub integration reported a failed automatic deployment when the first foundation
commit was pushed. Root and web-app `vercel.json` files now disable all automatic Git deployments.
Re-enabling them is a later reviewed, explicitly authorized release change. No successful deployment,
Vercel project configuration, DNS or cloud service creation is claimed by bootstrap.
