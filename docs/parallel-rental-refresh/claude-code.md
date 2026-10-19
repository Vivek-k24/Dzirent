# Claude Code launch: manage and explore a lender Studio

Work in `H:\DziRent\worktrees\claude-api` on new branch `claude/studio-workflow`, from the exact
coordination baseline supplied in the launch message. Inspect status and preserve existing work. If
dirty, use a new sibling worktree; never reset old work. Read ancestor/repo AGENTS.md, the brief,
ADR 0004, this folder's README and `contracts/changes/0002-studios.md`. Your explicit end-to-end web
handoff is recorded there; the historical API-only ownership rule does not block these specific files.

Complete one workflow: lender edits their Studio -> persisted API profile -> public Studio directory/
page -> rotating previews of that Studio's published products -> product page. Own its complete UI,
API/migration/contract/demo-adapter implementation within the exclusive Claude file set in README.
Codex simultaneously owns shared shell, theme, catalog/category sidebar and PDP fixes. Do not edit
those files, root JS manifests/lockfile/CI or another agent's log.

Implement:

1. A Studio is a public lender profile, not a brand, category or random product collection. Add one
   optional Studio record per lender with stable server-controlled handle, display name, bio, public
   visibility and version. Owner settings route is `/lender/studio`; add only its link to the existing
   lender dashboard. Current sample identities remain demo-only; authenticated API ownership comes
   from the verified principal. No arbitrary owner/lender ID from the client.
2. Implement the additive proposed routes in the Studio change note (own GET/PUT settings; public
   directory, profile and paginated owned published products). Use SQLAlchemy/Alembic, one migration
   head, safe idempotent development seeds and version-based update conflicts. Persist profile edits
   and verify them through a second client/database session. Hide private/inactive Studios and private/
   draft/archived listings from public responses. Count distinct actual products, not carousel slides.
3. `/studios` is an Explore Studios directory: Studio name, actual public count, profile link and a
   carousel of that Studio's own published garments. Replace the reference's three fixed/random outfit
   tiles with rotation through ALL published products, including later API pages. For each outfit show
   only its portrait image, title and listed size; clicking opens its canonical PDP. No rental price,
   retail/discount/rating overlays on these previews, invented follower counts or inert social buttons.
4. `/studios/[handle]` displays public profile and the owner's published wardrobe with functional PDP
   links. Empty/private/missing/loading/error states must be genuine. Say Texas, not a city or metro.
   Keep private addresses, email, provider subjects and drafts out of public DTOs. Don't invent a verified badge.
5. Carousel: lightweight native React/CSS, no new JS package. All items reachable; pause/resume and
   manual controls; pause on hover/focus, stop automatic rotation under reduced motion, do not move
   keyboard focus, and reserve 3:4 image space. Style your pages using scoped CSS modules and the
   agreed neutral palette so Codex can change global layout without collisions.
6. Add the necessary MSW handlers under your owned mock paths; maintain wire parity with real API.
   The public demo runs without Azure/auth-provider credentials. Preserve existing 40 garment IDs,
   seed ownership and licensed images. One real seeded Studio is acceptable. Faker can generate
   labeled non-image integration/development data if needed; do not scrape/reuse reference screenshots'
   people, add fake verified users, redistribute seed listings or fabricate counts to fill a directory.
7. Generate OpenAPI/client types and deterministic examples through the repository commands. Publish
   a backward-compatible candidate version/change note; preserve all existing catalog paths/fields/query
   behavior so Codex needs no moving contract target. Do not hand-edit generated TypeScript/OpenAPI.

No Azure/cloud provisioning, new authentication system, payments, shipping estimates, booking state
machine, private evidence processing or actual uploads in this task. Keep current demo labeling.
Internal legacy metro data may remain for compatibility but never add a user-facing metro selector.

Runtime: web port 3200 (`pnpm --filter @dzirent/web dev --port 3200` with demo mode), API port 8200
(`uv run --directory services/api --frozen --python 3.12.15 uvicorn dzirent_api.main:app --host 127.0.0.1
--port 8200` with explicit local/test demo identity). Use your own disposable PostgreSQL `*_test` database;
never drop/reseed shared development or production data. Need no Azure to implement/test this workflow.

Verification budget: no unit tests or unfiltered pytest. At most four meaningful PostgreSQL/API cases
in `services/api/tests/workflows/test_studios.py`, covering persistence/versioning, owner isolation,
public visibility and all-product pagination. At most two browser scenarios in
`tests/workflows/studios.spec.ts`, covering owner settings and Studio/carousel/PDP flow. One candidate
run: relevant static checks, build, selected integration cases, and bounded Chromium desktop/mobile
E2E. Three-minute browser budget, zero retries; rerun only failures after a fix. API database acceptance
cannot pass on skipped tests or be inferred from MSW browser results. Report those evidence types separately.

Push one coherent feature branch/PR to main, publish the exact contract diff and update only
`docs/agents/claude.md` plus your issue/PR status. With existing authorized Vercel access, create a unique
explicit demo preview of the pushed SHA; do not assign production aliases, change protection/DNS, relax
Git guards or merge main. Your isolated preview uses old shell until Codex's PR is integrated; link
the `/studios` path directly in the preview report. Missing deployment access is a recorded blocker,
not permission to add infrastructure. Record SHA, actual commands/results, URL and ready-for-AG status.
The user launches Antigravity after both feature candidates are ready; don't start its QA work now.
