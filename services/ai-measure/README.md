# dzirent ai-measure (AI-MEASURE-1A, 2/Phase 1A) — local/test only

CPU-only garment geometry from **lender-placed points** and a **user-confirmed US Letter sheet** in the same
overhead photo, per `docs/ai-measure/AI-MEASURE-1-CONTRACT.md` (baseline
`b8ec467bf72c3bd389e7db7f3e15f1e4ccf44764`). Planar homography with NumPy/OpenCV; **no ML model, landmark or
seam recognition, automatic paper detection, training, GPU, hosted LLM, external API, queue, storage or
database writes.** Results are estimates pending lender confirmation and are never written to listings or fit
badges. AI-MEASURE-2 adds `POST /v1/calibrate-paper` (contract issue #46, baseline
`0fd9a2b057f67f33111f4a28d7a842cc22814bfc`): it *proposes* precise sheet corners near a quad the user placed
roughly, and the proposal must be reviewed and confirmed before it is used.

## API (schema `ai-measure.v0`, algorithm `paper-homography-0.1.0`)

| Route | Behaviour |
| --- | --- |
| `GET /health` | `{"status": "ok", ...}`; states that no ML model exists |
| `GET /version` | service, schema, algorithm and OpenCV versions |
| `POST /v1/measure` | `multipart/form-data`: `image` (JPEG/PNG ≤ 10 MiB), `annotation` (JSON string ≤ 64 KiB), optional `request_id` |
| `POST /v1/calibrate-paper` | same multipart shape; `annotation` is `paper-calibrate.v0` (see [Paper corner proposals](#paper-corner-proposals-post-v1calibrate-paper)) |

`annotation` (unknown fields are refused, so sheet sizes or scale factors cannot be supplied by clients):

```json
{
  "schema_version": "ai-measure.v0",
  "garment_class": "sleeved_top",
  "reference": {"type": "us_letter", "user_confirmed": true,
                "corners_px": [[x, y], [x, y], [x, y], [x, y]]},
  "landmarks": [
    {"key": "shoulder_width_cm", "geometry": "line", "points_px": [[x, y], [x, y]]},
    {"key": "chest_flat_cm", "geometry": "line", "points_px": [[x, y], [x, y]]},
    {"key": "body_length_cm", "geometry": "line", "points_px": [[x, y], [x, y]]},
    {"key": "sleeve_length_cm", "geometry": "polyline", "points_px": [[x, y], [x, y], [x, y]]}
  ]
}
```

- Corners are TL, TR, BR, BL of a **portrait** sheet: TL→TR is the short 8.5 in edge, and the long edge runs
  along the garment length. Coordinates are **intrinsic pixels of the decoded, upright image** (EXIF orientation
  applied, i.e. the browser's `naturalWidth`/`naturalHeight`), not CSS/display pixels. The response echoes
  `image.width/height` so clients can verify their transform.
- Lines need exactly 2 points; the sleeve polyline 2–20 points. Omitted keys are returned as
  `not_measurable` / `not_annotated`, never invented.

Response (200): `schema_version`, `algorithm_version`, `request_id`, `garment_class`, `calibration_status`
(`valid | uncertain | invalid`), `calibration` (`reference`, `user_confirmed`, server-constant `paper_cm`
21.59 × 27.94, echoed `corners_px`, machine-readable `reasons`, `camera_tilt_deg`, `shape_residual`), `image`,
`method: "paper_homography_and_landmarks"`, `confirmed_by_lender: false`, `measurements` (an object keyed by
measurement), human-readable `cautions` and a `message`. Each measurement has `key`, `status`
(`estimated | not_measurable`), `value_cm` (or `null`), `precision_cm` (`0.1 | 1.0`), `unit: "cm"`, `reason`,
`geometry`, the source `points_px`, the projected `points_cm`, `method`, `confirmed_by_lender: false` and
caution codes.

Errors are non-200 with `{"error": {"code", "message", "details"}, "request_id"}`; `details` lists field paths
and problems without echoing submitted values:

| Status | Code | When |
| --- | --- | --- |
| 413 | `payload_too_large` | body, file, decoded pixel dimensions or annotation over the limits |
| 415 | `unsupported_media_type` | bytes are not JPEG/PNG, whatever the filename or declared MIME |
| 422 | `invalid_image` | missing/corrupt/undecodable image, or under 200 px |
| 422 | `invalid_payload` | annotation is not valid JSON or does not match the schema (wrong types, NaN/Infinity, booleans as numbers, extra fields, unknown keys, wrong geometry or point count, duplicates) |
| 422 | `invalid_geometry` | a point is outside the decoded image, or consecutive points coincide |
| 422 | `unsupported_garment_class` | anything other than `sleeved_top` |
| 422 | `reference_not_confirmed` | `user_confirmed` is not `true` |

The monolith proxy adds `service_unavailable` (503).

## How the numbers are produced

1. **Corner structure** (`invalid`): collinear or duplicate corners, crossed (bow-tie), non-convex,
   counter-clockwise order, or an interior angle outside 25°–155°.
2. **Homography**: an exact four-point DLT (Hartley-normalised) maps image pixels to centimetres on the sheet's
   plane; a degenerate system or a round-trip error over 0.01 cm is `invalid`. A single px/cm scale is never
   used — on an oblique photo it is off by several centimetres (see `tests/test_geometry.py`).
3. **Physical consistency**: four points always fit a homography exactly, so reprojection error is zero by
   construction. Instead, a pinhole camera (square pixels, central principal point, focal length searched over
   0.3–6× the long side) must make the sheet's edges orthogonal and its 8.5:11 sides equal in metric scale. The
   remaining `shape_residual` is OK ≤ 0.03, `uncertain` ≤ 0.06, otherwise `invalid`; a sheet whose corners fit
   much better with the sides exchanged is `paper_orientation_swapped`. On synthetic views an A4 sheet labelled
   as US Letter scores ≈0.075 and US Legal ≈0.23. The same fit yields `camera_tilt_deg`: > 25° `uncertain`,
   > 50° `invalid`.
4. **Sheet size and appearance**: shortest sheet edge < 60 px `invalid`, < 150 px `uncertain`. The area inside
   the corners must look like a plain, light, neutral sheet, otherwise `uncertain`
   (`reference_region_not_plain_white`) — this catches corners placed on the floor or garment; it does not prove
   the sheet's size.
5. **Per measurement**: points are projected through the homography; lines are Euclidean distances and the
   sleeve is the sum of its segments. A measurement is `not_measurable` when calibration is invalid, a point is
   on the sheet, beyond the plane's horizon or more than 4.5 sheet diagonals (≈159 cm) from the sheet centre,
   the local scale differs from the sheet's by more than 2×, the value is outside a generous range (shoulder
   20–80, chest 20–90, body 30–130, sleeve 10–100 cm), or it is too sensitive to point placement (below).
   Cautions (not refusals) flag far points (> 3 diagonals), moderate perspective change, lines not square to the
   sheet's axes (> 15°) and sleeve paths that double back.
6. **Precision**: each value is recomputed with every corner and landmark coordinate nudged by a typical click
   error (`max(1.5 px, long side / 1500)`), giving a linearised 1σ sensitivity. Above 1 cm the value is rounded
   to whole centimetres with a caution; above 4 cm it is withheld. One decimal is returned only when calibration
   is `valid` and the measurement raised no caution; `uncertain` calibration always rounds to whole
   centimetres. The sensitivity is a gate, not an accuracy or confidence figure, and is not reported.

## Paper corner proposals (`POST /v1/calibrate-paper`)

Schema `paper-calibrate.v0`, algorithm `roi-paper-snap-0.1.0`, frozen in issue #46. An internal geometric
suggestion tool: it never changes a stored calibration, never feeds `/v1/measure` by itself and never proves
the sheet's size — US Letter rests on the user's separate attestation.

Request `annotation` (unknown fields refused; no client-supplied sizes):

```json
{"schema_version": "paper-calibrate.v0", "reference_type": "us_letter",
 "approx_corners_px": [[404, 35], [610, 152], [526, 421], [287, 322]]}
```

Corners are TL, TR, BR, BL in intrinsic pixels of the decoded, upright image, with (0, 0) at the top-left
corner of the top-left pixel (the browser convention); proposals use the same convention, rounded to 0.1 px.

Responses are HTTP 200 for every honest outcome. Sample from a synthetic 20°-tilted photo whose true corners
are `[[395.2, 41.9], [615.9, 143.5], [518.7, 414.8], [295.1, 330.9]]`:

```json
{"schema_version": "paper-calibrate.v0", "algorithm_version": "roi-paper-snap-0.1.0",
 "request_id": "sample-snap-1", "detection_status": "snapped", "reference_type": "us_letter",
 "proposed_corners_px": [[394.9, 42.1], [615.7, 143.4], [519.1, 414.7], [295.3, 331.1]],
 "calibration_status": "valid", "reason_codes": ["manual_corner_confirmation_required"],
 "requires_user_confirmation": true}
```

The same request on white paper over a white surface:

```json
{"schema_version": "paper-calibrate.v0", "algorithm_version": "roi-paper-snap-0.1.0",
 "request_id": "sample-white-1", "detection_status": "not_found", "reference_type": "us_letter",
 "proposed_corners_px": null, "calibration_status": null,
 "reason_codes": ["low_contrast_with_background", "manual_corners_unchanged"],
 "requires_user_confirmation": true}
```

| `detection_status` | Meaning | Reason codes |
| --- | --- | --- |
| `snapped` | one clear sheet outline near the quad; corners proposed | always `manual_corner_confirmation_required`; plus any calibration reasons from `/v1/measure` (e.g. `reference_shape_inconsistent`, `camera_not_perpendicular`) and `paper_edges_not_straight`, `subpixel_refinement_unavailable`, `large_adjustment_from_approximate_corners` |
| `not_found` | nothing usable: no sheet, sheet blends with the surface, or the quad is not on it | `paper_not_detected`, `low_contrast_with_background`, `paper_extends_beyond_search_area`, `paper_outline_not_confident` |
| `ambiguous` | a rival could be the sheet: another plausible sheet overlaps the quad, or the bright region under it merges into something else (e.g. a white garment touching the sheet) | `multiple_candidates`, `paper_merges_with_adjacent_white_region` |
| `invalid` | the sheet is cut off by the photo edge, or the quad is too small to search | `paper_corner_out_of_frame`, `approx_quad_too_small` |

Every non-snapped response has `proposed_corners_px: null`, `calibration_status: null` and
`manual_corners_unchanged`, so the existing manual workflow continues. For `snapped`, `calibration_status` is
the same geometric diagnostic `/v1/measure` would give these corners (`valid | uncertain | invalid`) — for
example an A4 sheet snaps cleanly but is `invalid` with `reference_shape_inconsistent`. It is a geometry check,
not certification. Errors: 413 `payload_too_large`, 415 `unsupported_media_type`, 422 `invalid_image`,
`invalid_payload` or `invalid_geometry` (a corner outside the photo, or crossed, collinear, non-convex or
counter-clockwise corners).

How a proposal is made:

1. **Bounded search**: only the box around the rough quad, plus 0.6 × its longest side (≥ 24 px), is
   examined, downscaled to ≤ 900 px for candidate search.
2. **Candidates**: bright, low-saturation regions at several cut-offs (global and local Otsu, and halfway
   between the brightness inside the quad and the ring around it), each simplified to a convex four-sided
   outline that fills ≥ 90% of its region and is 0.35–2.8× the rough quad's area.
3. **Gates and ranking**: overlap with the rough quad (IoU), every side brighter inside than outside by ≥ 12
   grey levels, no structural corner problem, and physical consistency with a portrait 8.5 × 11 rectangle
   under some pinhole camera (the `camera_fit` used by calibration, residual ≤ 0.10). Score = 0.45·IoU +
   0.30·contrast + 0.25·shape. A proposal needs IoU ≥ 0.25. A distinct rival with IoU ≥ 0.1 that overlaps
   ≥ 60% as much as the best, or scores within 15% of it, makes the result `ambiguous`.
4. **Sub-pixel refinement** at full resolution: along each side, the bright→dark step is located where the
   profile crosses halfway between the paper and surface levels; a robust (Huber) line is fitted per side and
   adjacent lines are intersected. Corners within 2 px of the photo edge mean the sheet may continue out of
   view (`invalid`).

On supersampled synthetic renders, proposals land within ≈0.2–0.45 px of the true corners from rough quads
jittered by ~10 px, shifted by 15% or scaled 0.8–1.2×. This verifies the implementation only.

## Limitations (read before relying on any number)

- **Paper snapping is synthetic-only.** There is no measured snap success or false-snap rate on real photos.
  Expect `not_found` / `ambiguous` with off-white or cream paper on light floors, strong shadows across an
  edge, glare, curled or creased sheets, patterned or white garments touching the sheet, and sheets partly
  covered by the garment. A sheet with a nearby but separate white garment, or on a light grey surface, did
  snap correctly in synthetic tests. Lens distortion bends edges and is not modelled. A pilot claim needs
  manually labelled real photographs (≥ 30 recommended) with resolution-normalised corner error, snap success
  and false snaps reported (issue #46).

- **Synthetic evidence only.** Tests use exact projected points from a simulated pinhole camera. They prove the
  geometry implementation, **not** landmark placement, garment measurement accuracy or the ≤ 1.5 cm field target.
  That needs tape-measured garments, labelled ground truth and reported mean/median absolute error in a separate
  evaluation milestone.
- **Corner placement dominates error.** In simulation, 1.5 px of corner noise on a sheet ~250 px wide moves a
  70 cm body length by a median 1.3 cm (95th percentile 3.6 cm); at typical overhead framings most values are
  therefore returned in whole centimetres. Fill the frame with the garment and sheet and zoom in to place corners.
- **The photo cannot prove the sheet is US Letter**; the result relies on the lender's attestation. The shape
  check catches clearly different sheets (A4, Legal) only when corners are placed accurately.
- Only points on the sheet's plane measure correctly: raised collars, padded shoulders, folds, curved fabric,
  lens distortion and cropped photos (off-centre principal point) add error that this version does not model.
- No seam, landmark or paper detection exists. Thresholds are reasoned from geometry and simulation, not tuned
  on field photos.

## Safety and privacy

- Same intake as ai-quality: format decided by signature bytes; JPEG/PNG header dimensions limited (≤ 12000 px
  per side, ≤ 40 MP) before decoding; OpenCV's pixel cap also set; bodies over 10 MiB + 64 KiB + 256 KiB framing
  refused by declared length or while streaming.
- Uploads stay in memory (Starlette's 1 MiB disk spool threshold is raised); nothing is written to disk.
  Decoding discards EXIF/GPS. Logs contain only request ID, calibration status, measurement statuses and timing
  — no coordinates, filenames or image data.
- No URL input exists. The service refuses to start when `DZIRENT_ENVIRONMENT` is `staging` or `production`,
  and `python -m dzirent_ai_measure` binds to `127.0.0.1` only.

## Run and test (Python 3.12.15, uv 0.13.1)

```powershell
uv sync --directory services/ai-measure --frozen --python 3.12.15
uv run --directory services/ai-measure --frozen python -m dzirent_ai_measure --port 8310   # loopback only
uv run --directory services/ai-measure --frozen pytest -q
uv run --directory services/ai-measure --frozen ruff check . ; uv run --directory services/ai-measure --frozen mypy
```

Monolith proxy (local/test only): start the API with `DZIRENT_GARMENT_MEASURE_URL=http://127.0.0.1:8310` and
`DZIRENT_ENVIRONMENT=local|test`, then `POST /api/v1/dev/garment-measure` with the same multipart body. The
route is absent unless configured, is excluded from `contracts/openapi.json`, and the setting is refused in
staging/production.

Pinned runtime dependencies: FastAPI 0.146.0, Uvicorn 0.54.0, Pydantic 2.14.1, python-multipart 0.0.32,
NumPy 2.5.3, opencv-python-headless 4.14.0.94 (see `uv.lock`).
