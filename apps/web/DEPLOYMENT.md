# Phase 1A preview candidate

No deployment has been authorized or run. Both root and web `vercel.json` retain
`git.deploymentEnabled: false`. Keep these guards through PR review.

After the user authorizes a preview, select the existing intended Vercel project/team and GitHub
repository `Vivek-k24/Dzirent`. Do not create a project, service or domain implicitly. Set:

| Setting | Value |
| --- | --- |
| Root directory | `apps/web` with workspace files outside the root included |
| Framework | Next.js |
| Node | 22.x (repository baseline 22.23.3) |
| Package manager | pnpm 10.29.3 from root packageManager |
| Install | `pnpm install --frozen-lockfile` |
| Build | `pnpm --filter @dzirent/web build` |
| Output | `.next` |
| Preview public config | `NEXT_PUBLIC_DZIRENT_MODE=demo` |

Demo needs no API, Clerk, database, S3 or image API credentials. It serves photos/fonts locally.
The visible simulation banner, sample identity forms, illustrative-photo credits and non-transactional
summary must remain visible in a public presentation. The service worker requires HTTPS (localhost
is allowed for local checks). It caches no identity or password.

Publish the reviewed immutable presentation candidate, record its full SHA and resulting URL, and
repeat browser/axe workflows against that URL. No public URL, hosting integration behavior or exact
Vercel build environment has been validated by local tests. Do not label Phase 1A's public-preview
exit gate complete until that check is recorded.

For Phase 1B, preserve the presentation tag. The same adapter selects connected mode with an explicit
HTTPS `/api/v1` base URL and Clerk publishable configuration. Claude's approved API/DB/identity/media
work and provider-supported token bridge are required. Missing configuration fails startup; failed API
requests remain errors. No sample identity or MSW fallback may be enabled for connected mode.

Concrete external dependencies: user deployment authorization; target Vercel team/project access;
foundation and web review; Antigravity's independent acceptance results. Connected work additionally
needs Clerk application/issuer/authorized-party settings, FastAPI hosting/CORS, disposable development
PostgreSQL/Neon configuration and approved S3/CloudFront media credentials. None block local mocks.
