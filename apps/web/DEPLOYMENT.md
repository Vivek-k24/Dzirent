# Presentation release and rollback

The user has authorized the verified Phase 1A demo frontend on the **existing** Vercel project
associated with `Vivek-k24/Dzirent`. No DNS change, new service, backend deployment or payment
integration is included. Independent QA and passing relevant CI are release gates.

## Released result — 2026-10-19

Public presentation: **https://dzirent.vercel.app/**. Production deployment
`dpl_EinNXwHamr1YpjVnvMqQmm737RXe` serves merged commit
`baf04b67ccaede358b3e4aab526c0b6889bb09bb`, tree `2de479c05a32089d5787ad828f471852d0a4447d`.
The staged production build was browser-tested before promotion; public-origin smoke then passed.
See [exact evidence](../../docs/qa/release-integration.md). Existing project root/framework/runtime/build
settings were applied through the authenticated Vercel integration. Standard Protection remains on
for preview/unique URLs; the production presentation alias is public. Git auto-deploy guards remain
false. The manual deployment explicitly selected main and its SHA; the obsolete automatic production
branch setting was not changed or relied upon. No DNS/custom domain was configured.

The verified production deployment above is the rollback reference for future presentation changes.
No final release tag was published; use the exact SHA/deployment ID. Historical planning below is
retained for context; the release evidence supersedes its pending status and sequential-PR wording.

## Verified target and configuration plan

Read-only inspection on 2026-10-18/19 verified both the authenticated CLI account and project:

| Setting | Verified target / required release value |
| --- | --- |
| Account/team | `vivekkallakuri-8617`, `team_Ur6AwuUGgeBixSwdnTTrTECE` |
| Existing project | `dzirent`, `prj_hG63XH3glAqy9VcyMvLNnY4CLsnI` |
| Git association | GitHub `Vivek-k24/Dzirent`, repository ID `1424947620` |
| Production branch | Change obsolete `bootstrap/brief` to `main` |
| Root directory | Change repository root to `apps/web` |
| Workspace access | Enable `sourceFilesOutsideRootDirectory` |
| Framework / Node | Change Other / 24.x to Next.js / 22.x |
| Package manager | Repository pin `pnpm@10.29.3` |
| Install | `pnpm install --frozen-lockfile` |
| Build | `pnpm --filter @dzirent/web build` |
| Output | `.next` |
| Deployment build/runtime public value | `NEXT_PUBLIC_DZIRENT_MODE=demo` |
| Intended public alias | `https://dzirent.vercel.app` (must be tested after promotion) |

These are inspected values and the reviewable plan, not a claim that settings were already applied
or a URL is live. Record actual configuration/deployment results and independent QA evidence in
`docs/PROJECT_STATUS.md`. Never retrieve or print provider authentication secrets or project env values.

Both `vercel.json` files intentionally retain `git.deploymentEnabled: false`. This blocks automatic
Git deployments, not an explicitly invoked CLI release. **No guard relaxation is necessary** for the
authorized staged CLI release. This is smaller than enabling unreviewed branch deployments.
The existing project's Vercel Authentication policy protects all generated URLs. Keep preview protection;
use the narrow Standard Protection setting for a public production alias if required. The user's explicit
audience-access authorization covers that project-specific production access change. Do not disable
team-wide protection or assume an authenticated test proves public access.

## Reviewed release sequence

1. Fetch origin in the assigned Codex checkout, preserve user work, reconcile with main without rewriting
   history, and retarget frontend PR #5 to main. Keep dependency upgrade PRs separate.
2. Antigravity independently tests the exact frontend candidate with its reviewed QA code. Fix defects
   in the frontend owner's paths. Require a report with full SHAs, actual commands/browsers/results and
   visible limitations; rerun affected checks after changes. Review the QA diff and relevant CI.
3. Merge the reviewed frontend PR, then the dependent QA PR. Fetch and fast-forward the assigned web
   branch to the integrated main SHA; do not switch branches or edit the main checkout. Rerun relevant
   static/unit/contract/browser checks on that integrated tree. Never include an unreviewed backend PR.
4. Verify `vercel whoami --format json` and `vercel project inspect dzirent --scope vivekkallakuri-8617
   --non-interactive`. Link **only** this existing project explicitly if needed. Local `.vercel/` files are
   ignored and must not be committed. Apply only the reviewed settings above to this project.
5. From the clean integrated SHA, stage a production deployment with `vercel deploy --prod --skip-domain
   --scope vivekkallakuri-8617 --build-env NEXT_PUBLIC_DZIRENT_MODE=demo --env NEXT_PUBLIC_DZIRENT_MODE=demo`.
   Use the repository root as CLI source with the project's `apps/web` root setting. Do not pass `--public`
   (that exposes source files), deploy dirty source, upload `.tools`/environment secrets, or assign domains yet.
   Record the exact deployment ID, URL, Git SHA and build result. A remote Vercel build is a separate check
   from the local Next production build. If a platform-specific build issue occurs, fix/review/retest it first.
   Before upload, run `vercel deploy --dry --json` and inspect its file list. The CLI does not inherit
   `.gitignore`; root `.vercelignore` explicitly excludes local tools, caches, reports, dependency installs
   and environment files. Verify all forty photos, both fonts, canonical fixture JSON, shared packages,
   workspace manifests/lockfile and web source remain included. A dry run creates no deployment.
6. Verify the staged build with authorized protected-preview access, then promote that **same production
   deployment**, avoiding a preview-to-production rebuild. Repeat independent browser acceptance on the
   actual public alias without Vercel cookies or bypass headers: homepage, shared filtered links, PDP URL
   refresh, bag, sample auth, lender CRUD/availability/reset, local images, accessibility and browser errors.
   If staged browser access is unavailable, do not pretend an authenticated curl is a browser check; record
   the limit and test the actual public alias before declaring the release passed.
7. Tag the verified deployed SHA `demo-v0.1.0` (or the next unused release version). The existing
   `demo-v0.1.0-rc.1` tag is immutable. Record merged PRs, exact report/test SHAs, final URL and limitations.

Demo needs no external identity provider, API, database, S3 or image API credentials. It serves photos/fonts locally. Visible
simulation labels, fixed sample identities, illustrative-photo credits and the non-transactional preview
remain present. The service worker requires HTTPS (localhost is permitted). It stores no live identity or
password. Real-device iPhone/Android checks are separate from browser emulation and must be reported honestly.

## Rollback

Inspect the existing production deployments before release and save the previous successful deployment ID
if one exists. Initial inspection found only an ERROR deployment, so no known-good production deployment
can be assumed. Once this release is verified, its deployment ID and immutable tag become the rollback target.

For a later failed frontend release, verify the project and run `vercel rollback <known-good-deployment-url>
--scope vivekkallakuri-8617`. Confirm the public alias, demo label, shared link/PDP refresh, images and bag
again. Rollback does not change database schemas or Git history and can disable future automatic production
assignment; verify assignment policy before the next promotion. Do not move the release tag or force-push main.
For a first-release failure with no good deployment, retain the staged URL for diagnosis and fix/review/retest;
do not describe the old failed shell or an unverified candidate as a working rollback.

## Phase 1B dependencies

Preserve the demo release tag while connecting the same API adapter. Connected mode needs an explicit HTTPS
`/api/v1` URL, first-party secure session handling (Issue #26), the reviewed
FastAPI/PostgreSQL implementation, exact CORS and real persistence/ownership validation. Media upload needs
separately approved S3/CloudFront configuration. Missing config fails startup; failed connected calls remain
errors without sample identity or MSW substitution. Those dependencies do not block the demo presentation.
