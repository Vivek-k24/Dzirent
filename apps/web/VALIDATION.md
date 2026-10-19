# Phase 1A web validation

Production-server replay passed using `pnpm --filter @dzirent/web start --port 3000` after the final
production build. This document covers Codex's integration checks. Antigravity owns independent
acceptance tests, browser coverage and CI policy. Validated implementation artifact:
`e238261fec9789940e71e4a6ba28ede256bc212b`; [web PR #5](https://github.com/Vivek-k24/Dzirent/pull/5).
The immutable `demo-v0.1.0-rc.1` tag includes final handoff metadata; no public deployment is claimed.

Environment: Windows, Node 22.23.3, pnpm 10.29.3, Python 3.12.15, uv 0.13.1. Commands ran only in
`H:\DziRent\worktrees\codex-web`, branch `codex/web-phase1`, based on
`37957823213cd2b25e980edad5058becdf9a7fbb`. The host Node 18 was not used. Portable Node and a local
uv bootstrap live under ignored `.tools`; frozen API dependencies are in ignored `services/api/.venv`.

| Actual command/check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed; no dependency/version/lockfile change |
| `pnpm check` | Passed: ESLint, TS, 14 web tests, local media integrity, Ruff/format/mypy, 8 Python foundation tests, OpenAPI/generated TS drift, deterministic fixture regeneration |
| `pnpm build` | Passed; all web routes and the scoped demo 404 proxy built |
| `pnpm audit --audit-level high` | Passed; no known vulnerabilities reported |
| GitHub checks at the implementation artifact | Foundation, dependency audit, secrets, source-scan and CodeQL all passed |
| `node apps/web/scripts/check-media.mjs` | 40 unique local JPEGs, canonical product/image IDs, SHA256/source/license metadata and two OFL fonts verified |
| `pnpm smoke:web` on the production server / Chromium 156.0.8078.4 | Passed all four widths and full keyboard/PLP facets/history/drafts/sort/dates/location/error recovery, PDP/bag/preview/auth/enrollment, form accessibility and lender CRUD/reset workflows, followed by loading/image/HTTP 404 checks |
| `DZIRENT_SMOKE_BROWSERS=firefox,webkit node apps/web/scripts/verify-web.mjs` on the production server | Firefox 157.0 / WebKit 27.2 passed 390/768/1100/1440 responsive catalog/axe checks plus small-screen search/drawer; no console errors |
| `node apps/web/scripts/verify-states.mjs` | Passed: 8 visible initial skeletons, presentation delay, one 40-item request, single image-failure fallback without layout shift, unknown outfit and route HTTP 404 |
| `node apps/web/scripts/verify-mode-switch.mjs` | Passed in one browser across a demo-to-connected local restart: old MSW controller released, bag partitioned, connected 503 visible, zero fixture products and no sample sign-in |
| `git diff --name-only <base> -- contracts fixtures services tests .github/workflows docs/agents/claude.md docs/agents/antigravity.md` | Empty: other-owner files preserved |

The connected boundary check deliberately supplied a synthetic public-key marker and fulfilled the
local API requests with a contract-shaped 503. It does not verify Clerk, FastAPI CRUD, database
persistence, media uploads or a real provider account. No server credentials were used.

During interactive tests three 503 resource errors are intentional (catalog, availability and listing
save). Baseline catalog checks assert zero console errors; all workflows assert zero uncaught page
exceptions. Failure/retry preserves form values, restores optimistic availability and keeps failed writes
out of the catalog. Draft listing publish/edit/archive/reset all run through the API adapter/MSW handlers.

Earlier failures were used to fix the MSW 3 browser-export SSR boundary, text contrast/visible labels,
WebKit hydration timing, streamed HTTP status, and overlay focus behavior. Test assertions now await
asynchronous URL/API updates. A cold dev route compilation exceeded a five-second assertion; production
replay uses built routes. No failed intermediate command is represented as a pass.

Not run: Antigravity's independent acceptance/contract/browser suite, Android/iOS native tests, live
Clerk/API/PostgreSQL/media integration, deployed Vercel smoke, DNS, payments or business integrations.
Public-preview exit gate remains incomplete until deployment is authorized and its URL/SHA tested.
No external approved PR has been integrated; foundation PR #1 remains unmerged.

Read-only QA handoff review at branch `75d7184f3d03189e0d6187b4cbf7a97d0fdddc58`: its Phase 0 early-return
gates are framework evidence, not acceptance of this client. The final suite needs alignment with accessible
roles/labels or existing `data-section` markers, collection-button → mega-menu → Shop the collection navigation,
Account → renter/lender choice → centered auth, sign-in before expecting forty owner listings, and adding a
bag item before asserting its summary. Calendar tests should consume the canonical demo dates. No QA file
was changed and no unrun independent test is claimed to pass; this remains Antigravity's review lane.

Contract issue [#4](https://github.com/Vivek-k24/Dzirent/issues/4): Occasion/Fabric have metadata but no
filter query parameters. Current menus display informative text; Codex did not invent API fields.
See [architecture decision](../../docs/architecture/0002-web-presentation.md) and
[guarded preview preparation](DEPLOYMENT.md).

Recorded evidence: [desktop](docs/desktop.png), [mobile](docs/mobile.png),
[Chromium results](docs/chromium-results.json), [Firefox/WebKit results](docs/browser-matrix.json),
[loading/image/404 trace](docs/states.json), [connected boundary](docs/connected-boundary.json).
