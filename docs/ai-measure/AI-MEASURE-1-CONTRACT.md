# AI-MEASURE-1 — garment geometry / fit-measurement prototype

**Status:** Phase 0 contract, not implemented. Coordinator baseline: \`96339e056937a9b636e20609e10e3658cc63350d\` on the **draft** \`coord/ai-quality-1-integration\` branch. The original AI-QUALITY-1 pull requests #30, #33, #35, #36 remain unmerged; DO NOT merge or deploy either feature without explicit approval.

## 1. Objective and dependency

Develop the next Dzirent feature after AI-QUALITY-1: **derive actual centimeter distances from points on a flat-laid garment using a known-size US Letter reference sheet in the same overhead photo.** This is image geometry with local CPU processing, not an LLM estimating dimensions.

This first increment is **a garment-measurement calibration and human-verified annotation prototype**, not a claim of fully autonomous landmark recognition, body measurements or production fit. Begin with **flat-laid sleeved upper-body apparel** (shirt/blazer/jacket). A subsequent explicitly scoped increment can propose landmarks automatically and evaluate on field images. Accurate landmark placement is as important as accurate scale; do not substitute contour extremities for seams and claim success.

Reuse current Dzirent concepts: the AI-quality local photo gate, Next.js/React dev-only image screen, FastAPI, Python 3.12, uv, OpenCV/NumPy, existing listing \`measurements: [{key, value, unit:"cm"}]\` model. Existing listing field \`chest\` is not a validated physical circumference; **do not write calculated measurements into the listing database or published fit badges** in this milestone.

## 2. Reference and capture contract

- Physical reference: one **white US Letter 8.5 × 11 in (21.59 × 27.94 cm)** unmarked sheet, resting flat **beside** (not above/under or touching) a flat-laid garment, on **the same approximately planar surface**.
- Portrait orientation, long 11-inch side approximately parallel to garment length; fully visible four corners, camera as close to perpendicular to the plane as practical. Require explicit user's assertion that paper size is US Letter; **the photograph alone cannot prove physical paper dimensions**.
- Account for projective distortion via **planar homography** from selected paper corners to real-world paper coordinates (0–21.59 cm wide, 0–27.94 cm long). A single px/cm scale from one side must not be used on oblique photos.
- 4 paper corner coordinates are on the **original decoded image** (not rendered/resized CSS pixels). UI must transform between display and intrinsic image pixel coordinates, including browser zoom, containment, resize and mobile touch.
- Geometry only applies reliably to points on the same plane; bulky collars, raised shoulders, folded sleeves, perspective/lens distortion and curved fabric lengths are important errors. Always label results **estimated, pending lender confirmation**.
- Distinguish **paper detection** by AI-quality from validated *corner coordinates*. The existing quality service may find a paper-shaped quadrilateral on synthetic scenes, but its \`pass\` does not prove this sheet's identity or corner calibration. Manual 4-corner confirmation required for v0. Automated suggestions are optional and must be clearly provisional.

## 3. First garment and measurement definitions

**Eligible for this prototype:** a flat-laid, visibly sleeved upper-body garment: shirt, blouse, blazer, jacket. Support one image of front/back with points visible. Reject or label \`unsupported\` for lower-body wear, dresses, sarees and other fabrics requiring different protocols.

For v0, annotation is lender-placed points (no inferred seam coordinates):
1. **shoulder_width_cm** — one straight line from left shoulder seam to right shoulder seam at the upper back (only if those seams are visibly identifiable).
2. **chest_flat_cm** — straight width across the garment from left to right underarm at the same vertical position (NOT chest circumference; don't silently double it or write to \`chest\`).
3. **body_length_cm** — straight length from a defined upper shoulder reference at the neckline to corresponding hem point, aligned with garment length. Use a clear annotated graphic to distinguish neckline/high-point vs back collar.
4. **sleeve_length_cm** — shoulder seam to cuff following the sleeve's outer seam with a user-selected polyline (at least 2 points, capped reasonable vertex count); calculate piecewise line length. Do not use Euclidean single-endpoint length for bent/curved sleeves.

Not all measurement keys are mandatory: unavailable/hidden seam -> \`not_measurable\` and a reason, never a fabricated value. Each result must preserve its source annotation and indicate \`estimated\` / \`confirmed_by_lender\` separately.

## 4. API and schema v0

- Standalone CPU-only **services/ai-measure/** Python uv service on loopback, no cloud, no GPUs, no hosted model. GET /health; GET /version; POST /v1/measure accepting multipart field \`image\` (JPEG/PNG ≤10 MiB) plus JSON string field \`annotation\`.
- \`annotation\` (version \`ai-measure.v0\`) includes \`garment_class: "sleeved_top"\`, \`reference: {type: "us_letter", user_confirmed: true, corners_px: [[x,y] TL,[x,y] TR,[x,y] BR,[x,y] BL]}\`, and \`landmarks: [{key, geometry:"line"|"polyline", points_px:[[x,y],...]}]\`. Coordinates are relative to intrinsic decoded image; validate finite, bounds, order and nonzero geometry.
- **Never trust user-supplied physical sheet width/height values:** always derive physical dimensions from the US Letter constant on the server.
- Output contains schema_version, algorithm_version, request_id, \`calibration_status\` (\`valid|uncertain|invalid\`), \`garment_class\`, per-measurement \`value_cm\` (one decimal only for valid geometry), \`status\` (\`estimated|not_measurable\`), \`method: "paper_homography_and_landmarks"\`, \`confirmed_by_lender:false\`, and human-readable cautions. Return machine-readable 413/415/422 errors for invalid payloads and 503 from monolith when the internal service is offline.
- Numerical calculation: infer H mapping paper photo corners to physical centimeter corners; project garment annotation vertices through H; straight segment Euclidean distances and polyline sum. Check reprojection, degeneracy, collinear/self-intersecting corners, out-of-frame and extreme extrapolation. If geometry is unreliable, mark calibration uncertain or reject — **never return plausible-looking measurements on bad calibration**.
- Cap image byte length and decoded pixel dimensions; use existing AI-quality intake/privacy conventions wherever compatible. No EXIF logging, no persistent photo bytes, no external URL fetching.
- Monolith experiment: **POST /api/v1/dev/garment-measure**, proxy only when \`DZIRENT_GARMENT_MEASURE_URL\` is configured in local/test and server is not deployed. Exclude experimental route from the canonical public OpenAPI/client contract. Internal host restricted to loopback/single-label private hosts.
- Maintain existing AI-quality service and tests unchanged unless a narrowly justified and coordinated bug fix is necessary.

## 5. UX contract (local/test only)

- New isolated page \`/dev/garment-measure\`, gated with the existing **server-controlled** \`photoQualityLocalAllowed\` policy. No query/header overrides and no preview/production access.
- Workflow: (a) select/capture photo (b) read visible reference instructions and **attest actual US Letter paper** (c) place/adjust the four labeled paper corners with a zoomable image overlay and confirm (d) choose garment measurement labels and place endpoint or polyline landmarks (e) run server geometry calculation (f) show individual values with measurement illustrations, limitations, user confirmation controls and retake/reset. All numbers explicitly **estimated** until confirmation; confirmation is client-side local/test only.
- Reuse browser input MIME/size validation and visual feedback if available; do not imply the photo quality service is automatically called unless it actually is. If quality screening is connected, indicate quality \`review\` cannot be treated as \`pass\`.
- Accessible desktop/mobile, keyboard-addressable alternatives for coordinate edits (numeric pixel positions or similar), pinch/touch behavior when supported, loading/error/offline retry, no unbounded object URLs or race between uploads.
- Show where the measurement comes from (drawn line/polyline on photo); **never show a "Fits me" badge** from unvalidated dimensions.
- Don't edit the public lender listing form, Studio, payment or booking flows during this local prototype.

## 6. Two parallel development lanes

**Claude Code / Phase 1A, then Python 2A:** new \`services/ai-measure/**\`, narrowly scoped \`services/api/**\` dev proxy/settings/tests. Own math/homography, validation, versioned response/error contract, focused pytest; no generated public API schema changes or root CI changes.

**Antigravity / Phase 1B, then web 2A:** new \`apps/web/src/components/ai-measure/**\`, \`apps/web/src/lib/ai-measure/**\`, \`apps/web/src/app/dev/garment-measure/**\`, and standalone browser/unit tests. Draw adjustable overlays and landmarks; send multipart image+JSON to the frozen dev proxy. Keep code independent of Claude's paths.

**Coordinator only:** root CI/workflows, \`apps/web/next.config.ts\` local-only rewrite, \`scripts/\` shared fixture generator, root manifests/lockfile, shared docs and the final integration merge. Branches rooted at the same coordination SHA; separately scoped file ownership and distinct PRs.

## 7. Bounded verification

**Phase 2A per agent:** unit tests once for pure homography/known geometry, dimension calculation, polyline, extreme/off-frame/invalid corners, incorrect garment class, invalid file, no persistence and deployed-mode denial; browser state transitions, coordinate transforms with responsive letterboxing, visible uncertainty, keyboard interactions and error handling.

**Phase 2B (combined only):** real local photo -> browser -> local Next.js rewrite -> FastAPI dev proxy -> local Python service; include synthetic known-size paper at a perspective angle, known calibration-to-centimeters target, missing/invalid calibration, service-offline 503, unsupported image 415 and production route denied. Do not use mocked successful measurements in this end-to-end check.

**Evidence rule:** tests on synthetic points prove math implementation, **not actual landmark detection, garment measurement accuracy or ≤1.5 cm field accuracy**. Measure physical garments manually with a tape, keep labeled ground truth in a separate evaluation milestone, report mean/median absolute error and failure cases before a production claim.

## 8. Delivery, boundaries and stop

- Local tooling + standard public-repository GitHub Actions only. No paid API, GPU, hosting, cloud deployment or model downloads.
- No production image storage, database writes, listing integration, shipping/fit recommendation, body-image measurement, condition diagnosis, clothing classification outside chosen class, worker/queue.
- Do not merge \`main\`, edit existing AI-QUALITY-1 PRs, activate auto-deploy, or claim a live hosted service.
- Each agent commits/pushes only its owned branch, opens a PR against this coordination contract branch and reports tests; the coordinator merges disjoint changes into a draft integration branch, runs real local CI, and stops at review.

## 9. Known limitations and decision checkpoint

This work deliberately prioritizes a **verifiable geometric measuring engine**. Fully automatic garment keypoint placement, paper detection at scale, measurement confidence and physical fit-badge matching are separate, subsequently scoped tasks **within the ai-measure feature**, and must not be claimed complete by this v0 increment. The business proposal calls for AI-assisted automatic landmarks; it remains a goal, not evidence that v0 provides it.
