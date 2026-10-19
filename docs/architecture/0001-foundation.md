# ADR 0001: Phase 0 shared foundation

Date: 2026-10-18 (America/Chicago). Status: candidate; accepted only when foundation merges.
Authority: the complete engineering brief v1.0, plus the explicit Phase 0-only instruction.

## Inspection and scope

Initial directory inspection found only the 524-line engineering brief, no `.git`, code, or
AGENTS.md in this checkout or its `H:\DziRent` / `H:\` ancestors. No existing implementation
was replaced. Source file SHA256 (original bytes):
`b72a6a1b16a9ef9fe76393cd98ec4e2e90bca056824b2d6f4bcf7a856ed2a1c8`.
The brief-only review base is `075fcc5e03180229344e8d478b2f6a8bb51824e4`.
User-specified remote: https://github.com/Vivek-k24/Dzirent (public, initially empty).
Other source/business documents were not read or imported.

During preparation, a concurrent user Git operation committed the initial README, renamed the checkout
branch to main, and pushed `bb77fb86b53b2086caf5a65f99614170a2d2c371`. Inspection confirmed it is
the brief-only commit's descendant with only README added. That commit is preserved; a new
`bootstrap/foundation` branch starts from it and the PR targets main. No user commit was reset/replaced.

The monorepo has a Next.js App Router shell, API health scaffold, schema-only candidate
FastAPI declarations, generated OpenAPI/TypeScript, deterministic catalog/reference/example data,
ownership/status documentation and first CI. Mobile/worker/test lanes are reserved.
This is not a Phase 1 application. No deployment, DNS, cloud, payment, or external identity work occurs.

## Boundaries and mode safety

Next.js owns presentation; web/mobile share `/api/v1`. FastAPI owns persistence validation and
authorization; PostgreSQL becomes authoritative in Phase 1B. The schema-only router is intentionally
absent from runtime. `GET /api/v1/health/ready` remains 503 until a real database readiness check exists.
No credential bypass or seed fallback can satisfy connected acceptance.

`contracts/modes.json` is canonical. Demo means MSW plus resettable public samples and visible
simulation labeling; it accepts no real credentials. Connected means Clerk/FastAPI/PostgreSQL with
failed writes/errors surfaced and no mock substitution. Server mock identity is limited to local/test
demo settings, including when production settings are set. Current guards do not implement token
verification; Claude must add the official provider SDK before protected runtime routes exist.
No live tokens/passwords are stored in browser localStorage.

## Candidate clarifications for review

There are no pre-existing code conflicts. These brief ambiguities need one common interpretation:

1. **Navigation versus category filter state.** A sorted repeated `category` parameter cannot encode
   both the selected navigation root and optional broadened category filters while preserving navigation
   on Clear all. Add optional `collection` as navigation context in browser/API queries; retain repeated
   `category` for filter values. This is an additive candidate change. Other URL keys stay as specified.
2. **Forty initial cards versus unavailable seed garments.** All forty seeds are published listings
   belonging to an active sample lender. With no date selection, temporarily unavailable garments remain
   visible but cannot enter cart; `available_total` reports the eligible subset. A date selection additionally
   excludes global unavailability and overlapping blocks. Here “active listing” means published by an
   active profile, distinct from physical availability. This preserves the required forty-card initial load.
   If review instead requires globally unavailable listings hidden, the smallest change is to change that
   public predicate and the initial-card acceptance expectation together; do not let lanes diverge.
3. **Owner updates.** PATCH has `expected_version`, optional full allowlisted `data`, and/or an
   availability toggle. DELETE archives and takes `expected_version` as a query parameter, returning
   the updated ProductDetail with incremented version. Cross-owner reads/writes consistently return 404;
   a signed-in user without lender enrollment receives 403 on lender collection operations.
4. **Photos.** A locally authored 900×1200 SVG is the only bootstrap media. It is explicitly a placeholder,
   with no third-party licensing assertion. Phase 1A must add curated licensed fashion images and provenance
   before claiming the presentation-image gate. This avoids introducing a scraping/provider dependency.
5. **Repository review base.** Preserve the existing user-created main commit above and open the
   foundation PR against main. The earlier brief-only base remains an ancestor/reference. No direct main
   push or unreviewed merge by the bootstrap agent. Set the repository default to the established main
   branch; branch protection/reviewer setup remains a documented integration dependency.
6. **Version compatibility.** TypeScript 7 is the registry default but openapi-typescript 7.13.0 requires
   TypeScript 5; pin 5.9.3. MSW/Vitest need Vite even though Next.js builds the application; pin Vite as
   a test peer only. The optional Next lint preset requires deprecated ESLint 9 and brings an unpatched
   high-severity braces advisory. Use ESLint 10 with compatible TypeScript/React Hooks rules for the
   foundation instead; independent axe/browser checks remain Antigravity's lane. Do not disable strict
   peers or suppress the advisory. Add Next-specific lint rules once the upstream dependency set is fixed.
7. **Attached deployment automation.** The first foundation push exposed an existing Vercel GitHub
   integration: its automatic deployment check failed. No deployment was invoked by the agent. To
   honor the explicit no-deploy boundary, root and web-app `vercel.json` set `git.deploymentEnabled=false`.
   This is the smallest repository-level compatibility change; no provider account/DNS was modified.
   Re-enable only in a later reviewed release with deployment authorization. See the
   [official Git configuration](https://vercel.com/docs/project-configuration/git-configuration#turning-off-all-automatic-deployments).

Merge accepts the candidate contract version `0.1.0-candidate.1` without inventing prior consensus.
Before merging, owner/reviewer should assess these clarifications. Contract changes after merge belong
to Claude and require an approved change note/version coordination with Codex/Antigravity.

## Versions, ownership and follow-through

See [version matrix](version-matrix.md) and [ownership registry](ownership.md). Bootstrap integrator
authorship of scaffolds/contracts/fixtures/first checks expires at merge. After that, Claude owns
contracts/fixtures/API, Antigravity owns independent verification and CI, and Codex owns clients/integration.
The `foundation-v0.1.0` tag identifies the proposed immutable common baseline. Role work is not started
by this bootstrap; all three must use that exact reviewed SHA and separate worktrees after merge.
