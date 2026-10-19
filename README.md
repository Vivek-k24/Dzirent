# dzirent

Phase 0 foundation only. The authoritative specification is
[`Dzirent_Engineering_Brief_and_AI_Prompts.md`](Dzirent_Engineering_Brief_and_AI_Prompts.md), read in full for bootstrap.
No catalog UI, working CRUD, database schema, provider identity, deployment, or native client is delivered here.

The candidate baseline is the commit tagged `foundation-v0.1.0`; resolve the exact SHA with
`git rev-parse 'foundation-v0.1.0^{commit}'`. Contract: **0.1.0-candidate.1**.
Review/merge the foundation before starting any of the three role prompts.

## Local start

Use Node **22.23.3**, pnpm **10.29.3**, Python **3.12.15**, uv **0.13.1**.
The machine's original Node 18 is unsupported. No global tool configuration was changed.
On this Windows checkout, a checksummed Node distribution and uv were installed under ignored `.tools/`:

```powershell
$env:Path = "$PWD\.tools\node-v22.23.3-win-x64;$PWD\.tools\bootstrap\Scripts;$env:Path"
node --version
pnpm install --frozen-lockfile
pnpm api:sync
pnpm dev:web
```

In a second terminal using the same tool versions:

```powershell
pnpm dev:api
```

Web: http://127.0.0.1:3000 (foundation status page). API liveness:
http://127.0.0.1:8000/api/v1/health/live. Readiness deliberately returns **503** until
Claude implements a real DB check. Candidate CRUD routes exist in generated OpenAPI only;
they are not mounted by the health runtime. A successful health check is not connected acceptance.

Fresh clones need Node/pnpm/uv installed at the versions above. `uv python install 3.12.15`
can provide the pinned Python. `.tools/` is a checkout-local convenience and is not committed.
No provider account, external API key, database, or Docker is needed to start the shell or author MSW mocks.

## Root commands

| Command | Purpose |
| --- | --- |
| `pnpm dev:web` / `pnpm dev:api` | Explicit local demo shell / health process, ports 3000 / 8000 |
| `pnpm dev:web:connected` / `pnpm dev:api:connected` | Connected configuration guards; require configured env and later Phase 1B implementation |
| `pnpm dev:qa:web` / `pnpm dev:qa:api` | Separate QA demo ports 3100 / 8100 |
| `pnpm api:sync` | Frozen Python install from `services/api/uv.lock` |
| `pnpm contracts:generate` | FastAPI declarations → OpenAPI → TypeScript; never hand-edit generated output |
| `pnpm contracts:check` | Detect generated contract/type drift without changing tracked files |
| `pnpm fixtures:check` | Cardinalities, references, example schemas, deterministic regeneration |
| `pnpm check` | JS lint/typecheck; Python Ruff/mypy/pytest; contract/fixture checks |
| `pnpm build` | Build the minimal Next.js shell; does not prove Phase 1A |
| `pnpm smoke:web` | Chromium/axe shell smoke at port 3100 (after `pnpm exec playwright install chromium` and `pnpm dev:qa:web`) |
| `pnpm db:up` / `pnpm db:down` | Optional loopback-only PostgreSQL 17.11; down preserves the volume |

Environment templates: `apps/web/.env.example`, `services/api/.env.example`.
Set env in the terminal or copy to ignored `.env.local` (web) / `.env` (API).
Never place server secrets in `NEXT_PUBLIC_*`. See [modes](contracts/README.md#modes).

## Shared handoff

| Lane | Branch / separate reserved directory | Start after foundation merge | Next task |
| --- | --- | --- | --- |
| Codex | `codex/web-phase1` / `H:\DziRent\worktrees\codex-web` | `pnpm dev:web` (3000) | Phase 1A MSW adapter, licensed fashion fixtures, header/navigation/PLP/URL filters |
| Claude Code | `claude/api-phase1` / `H:\DziRent\worktrees\claude-api` | `pnpm dev:api` (8000); optional `pnpm db:up` | Adopt contract/fixtures; Alembic schema/seeds, public catalog, verified identity and owner CRUD |
| Antigravity | `antigravity/qa-phase1` / `H:\DziRent\worktrees\antigravity-qa` | `pnpm dev:qa:web` (3100), `pnpm dev:qa:api` (8100) | Independent requirements matrix, browser/contract tests; extend first CI |

These directories/branches are reserved, not active agent work. Create each from the exact merged-agreed
foundation SHA using the commands in [ownership](docs/architecture/ownership.md).
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
