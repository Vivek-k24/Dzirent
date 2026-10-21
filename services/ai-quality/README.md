# dzirent ai-quality (AI-QUALITY-1A) — local/test only

CPU-only photo-quality screening for a lender's overhead garment photo, per the coordination contract
`docs/ai-quality/AI-QUALITY-1-CONTRACT.md` (baseline `64ebd948e568ff9c51ebd641e134687dfecc95ec`).
Rule-based OpenCV heuristics; **no ML model, training, GPU, hosted LLM, external API, queue or storage.**
This is screening of photo usability, not garment measurement or damage recognition.

## API (schema `ai-quality.v0`, algorithm `quality-rules-0.1.0`)

| Route | Behaviour |
| --- | --- |
| `GET /health` | `{"status": "ok", ...}`; states that no ML model exists |
| `GET /version` | service, schema, algorithm and OpenCV versions |
| `POST /v1/check` | `multipart/form-data`: `image` (JPEG/PNG, ≤ 10 MiB), optional `request_id` |

Each of `blur`, `exposure`, `paper` and `framing` is `pass | fail | uncertain` with a machine-readable
`reason`. `decision` is derived deterministically: any `fail` → `retake`; all four `pass` → `pass`;
otherwise `review` ("no reliable automatic judgment", not permission to publish). `message` is plain
guidance; no confidence or accuracy percentages are reported.

Errors are non-200 with `{"error": {"code", "message", "details"}, "request_id"}`:
`payload_too_large` (413: body, file or decoded pixel dimensions), `unsupported_media_type` (415: bytes
are not JPEG/PNG, whatever the filename or declared MIME), `invalid_image` (422: missing field, corrupt
or undecodable data, or smaller than 200 px). The monolith proxy adds `service_unavailable` (503).

## Safety and privacy

- Format is decided by file signature bytes. Dimensions are read from the JPEG/PNG header and limited
  (≤ 12000 px per side, ≤ 40 MP) **before** decoding; OpenCV's own pixel cap is also set.
- Request bodies over 10 MiB + 256 KiB framing are refused by declared length or while streaming.
- Uploads are held in memory only (Starlette's 1 MiB disk spool threshold is raised); nothing is written
  to disk. Decoding discards EXIF/GPS metadata. Logs contain only request ID, statuses and timing.
- No URL input exists. The service refuses to start when `DZIRENT_ENVIRONMENT` is `staging` or
  `production`, and `python -m dzirent_ai_quality` binds to `127.0.0.1` only.

## How the checks work (and where they stop)

Analysis runs on a copy downscaled to 1280 px on the long side.

- **Blur**: 90th percentile of Laplacian variance over textured 8×8 tiles (flat paper/floor is ignored).
  `≥ 120` pass, `< 35` fail, otherwise uncertain. If exposure fails, a blur failure is downgraded to
  uncertain (`not_judged_due_to_exposure`) because darkness or clipping suppresses edge energy.
- **Exposure**: mean grey level and clipping fractions (`≤ 8` / `≥ 250`). Pass when mean is 70–200 with
  < 10% crushed and < 12% clipped pixels.
- **Paper**: bright, low-saturation convex quadrilateral, aspect ratio 1.18–1.42 (US Letter 1.294),
  corners within 15° of square, fill ≥ 92%, not touching the frame. A rectangular white region clipped
  by the frame is a confident `fail` (`paper_corner_out_of_frame`). White-on-white or no candidate is
  `uncertain`. Provisional orientation rule: if the garment is clearly elongated and the paper's long
  side is more than 35° off its length, the result is `uncertain`.
- **Framing**: background estimated from a border band (must be ≥ 70% one surface, else `uncertain`),
  colour-distance foreground minus the paper, largest component ≥ 3% of the frame. Touching the frame
  edge is `fail` (`garment_cut_off`); touching the paper is `uncertain`.

Thresholds were chosen against **deterministic synthetic scenes only** (`tests/synthetic.py`). There
is no labelled field-photo evaluation set yet, so no accuracy claim is made. Expect `uncertain`/`review`
on real photos with busy surfaces, patterned or white garments on light floors, strong shadows, steep
camera angles, crumpled paper or garments that touch the paper.

## Run and test (Python 3.12.15, uv 0.13.1)

```powershell
uv sync --directory services/ai-quality --frozen --python 3.12.15
uv run --directory services/ai-quality --frozen python -m dzirent_ai_quality --port 8300   # loopback only
uv run --directory services/ai-quality --frozen pytest -q
uv run --directory services/ai-quality --frozen ruff check . ; uv run --directory services/ai-quality --frozen mypy
```

Monolith proxy (local/test only): start the API with
`DZIRENT_PHOTO_QUALITY_URL=http://127.0.0.1:8300` and `DZIRENT_ENVIRONMENT=local|test`, then
`POST /api/v1/dev/photo-quality` with the same multipart body. The route is absent unless configured, is
excluded from `contracts/openapi.json`, and the setting is refused in staging/production.

Pinned runtime dependencies: FastAPI 0.146.0, Uvicorn 0.54.0, Pydantic 2.14.1, python-multipart 0.0.32,
NumPy 2.5.3, opencv-python-headless 4.14.0.94 (see `uv.lock`).
