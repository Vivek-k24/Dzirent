# Version baseline

Selected 2026-10-18. Exact direct pins are in manifests; resolved artifacts/hashes are in
`pnpm-lock.yaml` and `services/api/uv.lock`. No `latest`, caret or tilde direct application pins.
Updates are scoped integration changes, never three independent upgrades.

| Layer | Pinned baseline | Compatibility / verification scope |
| --- | --- | --- |
| Node / pnpm | 22.23.3 / 10.29.3 | Next 16 requires Node >=20.9; MSW 3/Vite 8/Vitest 5 require >=22.12; Expo 58 requires >=22.13 on the 22 line |
| Python / uv | 3.12.15 / 0.13.1 | Python stays on 3.12; uv managed interpreter used locally, project supports >=3.12,<3.13 |
| Next / React / React DOM | 16.4.2 / 19.3.1 / 19.3.1 | App Router; React peer requirements checked at install |
| TypeScript / openapi-typescript | 5.9.3 / 7.13.0 | Generator declares TS ^5.x; registry TS 7 is deliberately not selected |
| ESLint / @eslint/js | 10.13.0 / 10.0.1 | Optional Next preset omitted due to incompatible peers and unpatched braces dependency |
| typescript-eslint / React Hooks rules | 8.71.2 / 7.1.1 | Both declare ESLint 10 compatibility; browser accessibility remains independently tested |
| Tailwind / PostCSS plugin | 4.3.3 / 4.3.3 | CSS tokens reserved; shadcn components are added as owned source in Phase 1A, no floating CLI run |
| Radix dialog / Lucide | 1.3.1 / 1.59.0 | First primitive pinned; additional primitives requested through Codex |
| TanStack Query / Zustand | 5.104.4 / 5.0.15 | Server cache versus cart/transient state; URL owns filters |
| React Hook Form / Zod / resolvers | 7.90.0 / 4.6.7 / 5.9.2 | No forms implemented in bootstrap |
| Day picker / date-fns / MSW | 10.0.2 / 4.4.0 / 3.0.3 | Date-only semantics; MSW not activated in shell |
| Vitest / Vite / jsdom | 5.0.5 / 8.3.4 / 30.1.3 | Vite is a required test/mock peer, not the application framework |
| Playwright / axe-core adapter | 1.64.1 / 4.14.0 | Test tooling pinned; independent browser journeys belong to Antigravity |
| FastAPI / Uvicorn | 0.146.0 / 0.54.0 | Health runtime plus schema-only contract |
| Pydantic / settings | 2.14.1 / 2.16.0 | Candidate schemas and startup guards |
| SQLAlchemy / psycopg / Alembic | 2.1.5 / 3.3.6 / 1.20.0 | Dependency baseline only; no schema/migrations shipped |
| Argon2 (Issue #26 draft only) | argon2-cffi 25.1.0 | Required native-auth pin; bindings/cffi/parser exact artifacts in API uv.lock; Phase 2 security/concurrency validation not run |
| PostgreSQL | 17.11 | Current supported 17 minor; optional Docker Compose development service |
| pytest / HTTPX / Ruff / mypy | 9.1.1 / 0.28.1 / 0.17.1 / 2.4.0 | Foundation checks only |
| JSON Schema / pip-audit / pre-commit | 4.26.0 / 2.10.1 / 4.7.0 | Examples validated; audit tool available; no hook bypass claims |

## Native compatibility reference (deferred)

Expo SDK **58** (registry package **58.0.14**) targets React Native **0.88** and React **19.3.0**;
minimum Node **22.13.x**. Expo Router registry stable reference: **58.0.23**. Node 22.23.3 meets
these requirements; the web's React 19.3.1 is the same compatible patch line. No Expo/RN dependencies,
native lockfile, EAS account, build, simulator or device tests are created in Phase 0. At Phase 2 activation,
Codex must use Expo's SDK-specific dependency resolver, record exact native pins in the shared lockfile,
and independently validate Android/iOS. A matrix comparison is not a native compatibility test.

Sources checked for this bootstrap:

- [Next installation/system requirements](https://nextjs.org/docs/app/getting-started/installation)
- [Expo SDK version compatibility table](https://docs.expo.dev/versions/latest/)
- [Node 22.23.3 release artifacts/checksums](https://nodejs.org/dist/v22.23.3/)
- [PostgreSQL supported versions](https://www.postgresql.org/support/versioning/)
- [uv managed Python](https://docs.astral.sh/uv/guides/install-python/)
- Publisher package metadata from [npm](https://registry.npmjs.org/) and [PyPI](https://pypi.org/),
  used to verify exact stable releases, engine/peer constraints and Python requirements.

The original host had Node 18.20.7, Python 3.12.10 and pnpm 10.29.3; uv was absent from PATH.
Bootstrap installed a SHA256-verified portable Node and venv-local uv under ignored `.tools/`, then used
uv's managed Python 3.12.15. No system Node replacement or global shell configuration was performed.

Known tooling debt: add Next-specific lint rules after their dependencies support ESLint 10 and no longer
bring [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). The optional Next preset
was removed after strict peer/audit validation exposed those issues; checks were not suppressed.
