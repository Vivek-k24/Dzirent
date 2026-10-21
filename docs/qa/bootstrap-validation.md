# Phase 0 integrator validation

Date: 2026-10-18 (America/Chicago). Tester: Codex bootstrap integrator, **not independent Antigravity QA**.
Checkout: `H:\DziRent\Dzirent_dev`, `bootstrap/foundation`; preserved main base
`bb77fb86b53b2086caf5a65f99614170a2d2c371`. These initial results were collected on the foundation
working tree, committed unchanged as implementation artifact
`8108879639ccb17b50e076a9e0f8d14f5c081cef`. The final candidate adds the validation receipt
and no-deploy guard; its exact SHA is the immutable `foundation-v0.1.0` tag / final PR head.
Contract: `0.1.0-candidate.1`; fixtures `0.1.0`.

Environment: Windows PowerShell, Node 22.23.3 (checksummed portable official distribution), pnpm
10.29.3, uv 0.13.1, managed CPython 3.12.15. Docker client/server reported 28.0.1. No .env credentials
or provider accounts were required/read. Playwright 1.64.1, Chromium 156.0.8078.4, axe adapter 4.14.0.

## Commands actually run

| Command/check | Actual result |
| --- | --- |
| `Get-Content ... -Encoding utf8` in complete bounded chunks | Entire 524-line brief read; initial raw terminal decoding was corrected to UTF-8 |
| `git status`, ancestor AGENTS checks, repository inventory | Initially brief only/no repository/no guidance; later concurrent user main commit inspected and preserved |
| `pnpm install --frozen-lockfile` | Exit 0, lockfile up to date and strict peer checks enabled |
| `uv lock --directory services/api --check --python 3.12.15` | Exit 0, 76 resolved packages |
| `pnpm api:sync` | Exit 0, frozen Python environment checked |
| `pnpm contracts:generate` | Exit 0, generated OpenAPI and TypeScript from FastAPI declarations |
| `pnpm check` | Exit 0: ESLint, client/web TypeScript including Next typegen, Ruff check/format, mypy (7 source files), pytest **8 passed**, OpenAPI/TS drift and fixture checks |
| `pnpm fixtures:check` (also inside check) | Exit 0: 8 roots, 40 leaves, 40 unique garments, one seed lender, valid references/bands/dates/counts, 21 schema-valid operation request/response examples; exact deterministic regeneration |
| `pnpm build` | Exit 0, Next 16.4.2 production shell compiled; `/` and `/_not-found` prerendered |
| `docker compose config --quiet` | Exit 0; optional local PostgreSQL definition parsed, container **not started** |
| `pnpm audit --audit-level high` | Exit 0, “No known vulnerabilities found” after removing optional Next lint preset |
| `uv run --directory services/api --frozen --python 3.12.15 pip-audit --skip-editable` | Exit 0, no known vulnerabilities; editable local dzirent-api skipped as expected |
| `pnpm dev:qa:web` | Started Next dev shell at http://127.0.0.1:3100 |
| `pnpm dev:qa:api` | Started Uvicorn health runtime at http://127.0.0.1:8100 |
| Python urllib GETs to `/api/v1/health/live`, `/health/ready`, `/catalog/products` on 8100 | **200**, **503** with common error/request_id, **404**, respectively; no CRUD/backend readiness claim |
| `pnpm exec playwright install chromium`; `pnpm smoke:web` | Browser installed; final smoke exit 0 at **390×900** and **1440×900**. Each: HTTP 200, visible demo/foundation text, local fallback asset 200, **0 axe violations / 0 console errors / 0 failed requests** |
| Screenshot inspection via local image viewer | Both generated shell screenshots visually inspected; readable, no clipped content. Local artifacts: ignored `test-results/foundation-390.png` / `foundation-1440.png` |
| `pnpm dev:web:connected` with missing API URL (historical guard subsequently changed) | Expected exit **1**: incomplete connected configuration; no mock fallback |
| `pnpm dev:api:connected` with empty DB/issuer/authorized parties | Expected exit **1**: missing connected dependencies; settings errors hide input values |
| Source brief `Get-FileHash -Algorithm SHA256` | Original bytes preserved: `b72a6a1b16a9ef9fe76393cd98ec4e2e90bca056824b2d6f4bcf7a856ed2a1c8` |

The eight API foundation tests cover mock identity rejection for connected/staging/production,
missing connected configuration, unknown modes, exact CORS/no wildcard, health/readiness/no catalog
runtime, and absence of caller-controlled ownership/roles in write schemas. They do not prove real
first-party session validation, row ownership, persistence or database correctness.

## Failures found and corrected

- Initial strict JS install failed because Vite was a missing MSW/Vitest peer; pinned Vite 8.3.4.
- Next's optional lint preset required ESLint 9 plugins; attempting ESLint 10 failed strict peers. The
  compatible ESLint 9 attempt emitted an upstream deprecation. Audit additionally found an unpatched
  high-severity braces advisory in that preset's dependency graph. Removed the optional preset and
  pinned compatible ESLint 10/TypeScript/React Hooks rules; strict installs and audit then passed.
- Initial smoke used `browser.newPage()`, incompatible with axe's cross-page analysis; changed to explicit
  browser contexts. Final smoke passed. This was smoke setup, not an application defect.
- FastAPI TestClient emitted an upstream HTTPX deprecation; foundation HTTP tests now use HTTPX's
  ASGI transport. Final pytest output had eight passes without that warning.
- No existing code requirement conflict was overwritten. Candidate navigation/availability ambiguities
  are recorded for review in ADR 0001, with the smallest compatible interpretation/change.

## Boundaries still untested/unimplemented

Hosted check outcomes and local staged/history Gitleaks are recorded below only after execution.
Workflow configuration alone is not a passing scan. Dependabot support was checked against GitHub's current ecosystem documentation;
actual scheduled updates have not run. No application Dockerfile exists, so no application container
image can be scanned/built yet; the first Trivy job scans source/dependencies/configuration.

No PostgreSQL migration/seed/CRUD, connected provider token/ownership/persistence flow, public web
presentation acceptance, Firefox/WebKit journeys, deployment preview, DNS, media upload/provider,
real device/native build, shared live updates, reservation or financial action was tested or implemented.
The smoke page deliberately has no application controls. Placeholder imagery is not the licensed
fashion photography required for the eventual presentation. Browser axe is not security certification.

Phase 0 review verdict: foundation artifacts are locally consistent; candidate contract/ADR review and
the foundation PR/CI review are required before role work. Phase 1 gates remain open.

## Immutable and hosted evidence

- Implementation artifact: `8108879639ccb17b50e076a9e0f8d14f5c081cef`.
- `git diff --cached --check`: exit 0 for all staged foundation files before artifact commit.
- Gitleaks 8.30.1 Windows release verified against publisher SHA256 checksums.
- `gitleaks git --pre-commit --staged --redact --no-banner`: exit 0, no leaks, ~994 KB scanned.
- `gitleaks git --redact --no-banner`: exit 0, no leaks across 3 commits / ~1.06 MB, including artifact.
- [Linux foundation run](https://github.com/Vivek-k24/Dzirent/actions/runs/39182873701): **success**
  at the artifact SHA; frozen installs, `pnpm check`, build and Compose parse passed on Ubuntu 24.04.
- [Security run](https://github.com/Vivek-k24/Dzirent/actions/runs/39182873736): dependency audits,
  Gitleaks, Trivy source/dependency/configuration scan and CodeQL all **success** at the artifact SHA.
  No application container image exists to scan.
- PR: https://github.com/Vivek-k24/Dzirent/pull/1.
- GitHub also reported an attached Vercel integration's automatic deployment **failure** for the first push
  (`dpl_HEytRmSwYN65zbmgXKsGV8paWeDk`). No deployment command/API was invoked by this agent and
  no successful deployment is claimed. Root and web-app `vercel.json` disable automatic Git deployments
  per the provider's documented switch. This external integration check is not foundation CI; hosting
  repair/redeployment is outside Phase 0.
- Both no-deploy JSON files were validated with jsonschema against the live official
  `https://openapi.vercel.sh/vercel.json` schema; assertions confirmed `git.deploymentEnabled=false`.
- Temporary local smoke servers were stopped by their verified process IDs after the checks.
