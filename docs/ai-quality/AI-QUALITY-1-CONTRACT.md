# AI-QUALITY-1 — coordinated development contract (Phase 0)

Status: **PROPOSED / awaiting review; NOT a completed implementation**.
Feature: garment photo-quality screening (not garment measurement or damage recognition).
Owner/coordinator: ChatGPT; implementation lanes: Claude Code (Python/API) and Antigravity (web).
Source baseline: 8fcdc8dcf3bbe39d3e8bfc219d420e5d534c1a5c (main, 2026-10-20). This document lives on a coordination branch; do not assume it has merged.

## 1. Objective and authoritative existing state

Build a free-to-run local/test workflow that tells a lender if an overhead garment photo is usable or must be retaken. Return separate judgments for blur, light/exposure, US Letter reference paper, and full-garment framing. The Dzirent AI Services Plan describes these four checks and an eventual worker/queue; only the first standalone service and a local integration are in scope now.

The current Next.js lender listing form uses fixture photos and explicitly says real uploads are not connected. The FastAPI backend is already present, and the existing media-upload intent operations are contract-only, not live. The worker directory is reserved; no AI services exist on main. Do not pretend the pilot has production media infrastructure.

## 2. Reference-photo requirements (provisional v0 capture standard)

* Use **US Letter 8.5 × 11 in / 21.59 × 27.94 cm** white, unmarked printer paper.
* Lay garment and paper flat on the **same plane**, next to one another, not overlapping.
* Paper in **portrait orientation**, with its long 11-inch side roughly parallel to the garment's length.
* Four paper corners and the **entire garment** must be visible. Camera approximately straight overhead (90 degrees to the surface), without lens shadow/glare.
* Record failure or uncertainty if paper/corners cannot be verified. Do not return a falsely confident PASS.
* The business document says “standard printer paper” but does not independently fix placement/orientation. These are coordinator-proposed capture conventions, to be confirmed before production use. This milestone does **not** compute dimensions.

## 3. Contract to freeze before agents edit

Implement a dedicated local/test-only FastAPI service with:
* GET /health -> service health, no pretend model availability.
* GET /version -> schema and algorithm versions.
* POST /v1/check -> multipart/form-data; one image field named 'image' (JPEG/PNG only, <= 10 MiB), optional caller-provided request_id; reply JSON; no arbitrary photo URL input.

A local/test-only **monolith** proxy at POST /api/v1/dev/photo-quality will call this internal service so the web UI does not depend on a public-facing AI service. The monolith retains the application/API boundary. This experimental route must be absent or fail closed in staging/production. Internal service must be bound privately (loopback or internal Compose networking), not publicly exposed.

Response v0 shape (example values not evidence of passing analysis):
{
  "schema_version": "ai-quality.v0",
  "algorithm_version": "quality-rules-0.1.0",
  "request_id": "trace-id",
  "decision": "review",
  "checks": {
    "blur": {"status": "pass", "reason": "sharp"},
    "exposure": {"status": "pass", "reason": "acceptable_light"},
    "paper": {"status": "uncertain", "reason": "corners_not_confidently_detected"},
    "framing": {"status": "uncertain", "reason": "garment_boundary_uncertain"}
  },
  "message": "We could not verify the full paper and garment outline. Try a clearer overhead photo."
}

Allowed per-check status: pass | fail | uncertain. Overall decision: pass | retake | review. Derive decision deterministically: any confident fail => retake; all four pass => pass; otherwise review. "review" means no reliable automatic judgment, not permission to publish. Browser-side instant blur/light results are **preliminary** until service confirms them. Do not present accuracy/confidence percentages without calibration evidence.

Errors must be non-200, with machine-readable code/message: payload_too_large (413), unsupported_media_type (415), invalid_image (422), and service_unavailable (503). Validate actual file bytes, not only filename or browser-reported MIME. Restrict decoded image dimensions and memory use. No disk persistence of uploaded evidence, no EXIF/location logging, no external URL fetches, no real person/identity collection, and no raw images in CI artifacts.

## 4. Parallel ownership and technical approach

**Claude Code — backend lane (Phase 1A, Phase 2A Python):**
* Own new services/ai-quality/** and necessary narrowly scoped services/api/** adapter/config/test files, including that API service's dependency lock when required.
* Python 3.12, FastAPI/Pydantic, OpenCV and uv, with pinned dependencies. CPU only.
* Initial heuristics for blur and exposure; paper-corner detection and garment containment may return 'uncertain' when insufficiently reliable.
* Implement service health/version/check and locally gated monolith proxy. No external inference, model downloads, worker, database migrations, hosted secrets or cloud provisioning.
* Add targeted pytest unit tests for known sharp/blurry, exposure, supported/unsupported/corrupt image, oversized payload, decision derivation, and uncertain outcomes.

**Antigravity — frontend lane (Phase 1B, Phase 2A web, Phase 2B browser):**
* Own new apps/web/src/components/ai-quality/**, apps/web/src/lib/ai-quality/**, an isolated local/test verification page under apps/web/src/app/dev/photo-quality/**, and scoped UI tests in its test-owned paths.
* TypeScript/React, browser Canvas for quick local preliminary blur/exposure feedback, file pick/camera support where available, meaningful loading/errors and readable retake guidance.
* Use the frozen proxy contract. Do not introduce fake green results, hard-coded analysis outcomes, or MSW substitutes in the **integration** test. A mock is acceptable in isolated web unit tests only.
* Keep the local/test page out of publicly accessible production UX; test/prototype route must be gated or excluded in release builds.

**Coordinator-only shared changes:** Root AGENTS.md, README, compose.yaml, root JS manifests/lockfile, root CI/.github/workflows, ownership registry, and this contract. Agent requests for these changes must be raised as integration handoffs, not edited in parallel. Independent agent status/PR descriptions stay separate.

## 5. Bounded verification

Phase 1A/1B can run in parallel after both use the **same recorded contract commit SHA**, on separate branches/worktrees rooted at that commit.

Phase 2A — each agent runs focused local unit tests for its owned code. Keep deterministic synthetic image fixtures outside public photo assets. Do not assert classification accuracy beyond the tested cases.

Phase 2B — after integration of both candidates in a disposable branch, execute at least one real browser-to-local-FastAPI-to-ai-quality image request (no MSW success substitution); verify retake, uncertain/review, malformed input, and service-unavailable behavior. Keep service internal, and show that production-mode access is denied. Use focused Playwright and pytest/HTTPX; rerun only affected checks following fixes.

Phase 3 — commit/push branches, open reviewable PR(s), rely on existing public-repository GitHub Actions for reproducible checks; record full SHAs, passing/failing/skipped commands and exact limitations. No auto-assumption of a launched agent merely from an issue. Stop **before merge to main, automatic production deployment, or other AI services**.

## 6. Non-goals and budget guardrails

No real listing-image upload/public media system, measurement in centimeters, condition or damage model, before/after comparison, booking changes, Valkey/RQ worker, S3, cloud VMs, GPU, hosted LLM, external API, model training, data collection of customer photos, or production integration.

Open-source tooling and local/standard public-repository CI only. Existing paid coding-agent subscriptions/API billing, if any, remain distinct from $0 additional runtime infrastructure. No spend or cloud account creation without authorization.

## 7. Unresolved matters and fail-safe expectations

* Reliable paper and garment outline detection require field photographs and a labeled evaluation set; report 'uncertain' when they cannot be reliably established. Do not silently treat geometric assumptions as proven.
* The provisional paper/orientation standard is a coordinator convention, not an original exact requirement in the business document.
* Browser photo capture is a device/browser capability; no assertion of native Android/iOS support or real device coverage.
* Real uploader/privacy policy and storage integration are a later explicitly authorized milestone.
* The same production hosting rules still apply: main-only Vercel Git CD is enabled; this feature must remain unmerged until authorized.
