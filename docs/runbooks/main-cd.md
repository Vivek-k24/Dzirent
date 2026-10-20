# Main-branch Vercel continuous deployment (effective 2026-10-20)

## Scope and ownership
This page supersedes the former manual-only Git deployment switch documented in historical presentation release instructions. It governs the existing Dzirent Vercel project `prj_hG63XH3glAqy9VcyMvLNnY4CLsnI`, already GitHub-linked to `Vivek-k24/Dzirent`. It does not create a new project, DNS record, Azure service, backend, identity provider, or payment system.

## Automatic production deployment
- `vercel.json` and `apps/web/vercel.json` set `git.deploymentEnabled` to `{"*":false,"main":true}`. This enables the existing Vercel Git integration on `main` only; other branches do **not** trigger Vercel preview deployments. GitHub Actions PR checks continue independently.
- Each accepted commit to GitHub `main`, including a merged PR, is eligible for Vercel auto-deploy. The production environment in Vercel must track `main`: Project Settings > Environments > Production > Branch Tracking. That branch-tracking value cannot be independently confirmed by the repository files alone.
- Use the existing Vercel framework (Next.js), root `apps/web`, Node 22, frozen pnpm install and pinned build command. Production remains the sample-data `demo` application; real hosted API, live auth and payments are not authorized by this change.
- Existing domains `dzirent.com`, `www.dzirent.com` and `dzirent.vercel.app` remain untouched.

## Merge gates, limitations and risks
1. Require **Foundation / foundation**, **Foundation / PostgreSQL workflow integration**, and all **Security** jobs to pass on each PR before merging.
2. Configure GitHub branch protection or a repository ruleset on `main` to require PR reviews and checks, and block direct pushes. **This repository integration cannot configure those rules**; as of this change, this is a remaining manual admin action.
3. Native Vercel Git auto-deploy reacts to *every* push on `main`, not just PR merges, and does not wait for a post-push GitHub Actions run to pass. Protected merges are the effective pre-deploy gate; do not claim that Vercel itself checks Foundation/Security before assigning production.
4. Vercel may require confirming Production Branch Tracking = `main`. If a push produces a preview instead of production, correct that Vercel setting before declaring continuous production delivery operational.
5. Do not add Vercel tokens to GitHub secrets: the existing Vercel GitHub app supplies Git-source permissions. Treat any failed automatic Git deployment as a failure, not as proof of a successful pipeline.

## Post-deployment check
`.github/workflows/vercel-production-smoke.yml` listens for a successful **GitHub deployment_status** event with a production environment name (from Vercel's GitHub Deployments integration). It runs actual Chromium desktop/mobile catalog/product checks against public `https://dzirent.com` and uploads failure artifacts.
- This is *post-deployment detection*, not a promotion gate or automated rollback.
- Some provider configurations may not emit the expected GitHub deployment_status webhook. If no production-smoke run appears after a Vercel Git deployment, troubleshoot the GitHub deployment event/integration; don't claim the smoke check happened.
- Inspect Vercel project Deployments to verify new deployments are **production**, **READY**, tied to the merge SHA, and assigned to the public domain.

## Rollback
Keep the previous known-good production deployment ID before each deployment. If a new release is broken, use Vercel's rollback action for the same project and immediately retest public catalog/PDP on `dzirent.com`. Rollback does not revert Git history or database schema, and automatic future `main` merges can replace the rollback. Record incidents with commit SHA, deployment ID, and browser-test evidence.

## Review note
Automatic Git deployment has intentionally been turned on only for the existing presentation site. Manual releases and legacy runbooks predate this change; use this file for current source-of-truth CD behavior.
