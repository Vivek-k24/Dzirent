# Vision service

Checks a listing's photos: what the piece is, whether Dzirent lists it, photo quality, colors
and suggested listing text. It runs on Cloud Run (`vision`, `us-west1`, project `dzirent`) and
is a pure function: photo URLs in, scan JSON out. It holds no keys and never calls Supabase.
The Supabase Edge Function `scan-listing` is its only caller (see `pranalika/contract.md`).

Model: [Marqo/marqo-fashionSigLIP](https://huggingface.co/Marqo/marqo-fashionSigLIP)
(Apache 2.0), pinned to commit `c56244cc94f92419e8369fa71efdaf403b124ce8`, on CPU PyTorch.

## API

Cloud Run accepts only signed-in Google callers with `roles/run.invoker` on the service.

- `GET /health`: model, revision, license, policy digest, start-up seconds.
- `POST /scan` with `{ "listing_id": "...", "photos": [{ "photo_id": "...", "url": "...", "slot": "front" }] }`
  (1-8 photos; `slot` is one of the listing slots or null). `url` is a public listing-photos
  URL (`VISION_ALLOWED_URL_PREFIXES`) or a `data:image/...;base64,` URL.

The response has `verdict` (`allowed`, `rejected`, `review`), `reason` (plain words for the
lender), `suggestions` (category, item type and garment type from the database's own values,
colors, pattern, fabric, styles, title, description; none when rejected), `quality` (a summary)
and, per photo: `blur_score` (0 sharp to 1 blurry), `brightness_score` (0 black to 1 white),
`framing_score` (0 = the whole piece is in frame; higher = more of its outline runs along the
edge), `worn_by_person` (probability), `warnings`, `decision`, `labels` (the label scores) and
`fingerprint` (768 numbers).

## How it decides

- `app/policy.json` is the item policy: every allowed garment and accessory, every item that
  isn't allowed (with the reason the lender sees) and things that aren't clothing at all, each
  with several prompt phrasings. The same rows are in the database table `policy_item_types`
  (`tests/test_policy_sync.py` keeps them identical, so a change needs a new migration).
- The build embeds every prompt (`app/build_assets.py`), so a cold start loads only the vision
  tower and the stored text embeddings.
- `app/verdict.py`: a photo is allowed only when allowed items take at least 0.90 of the
  probability and neither not-allowed items nor not-clothing labels take more than 0.08. A
  not-allowed item needs one policy group (all shoes together, say) at 0.60 or more with
  allowed items at 0.25 or less; not clothing needs 0.60 from both the labels and a separate
  general check. Everything in between is unsure, and unsure is never allowed: the listing goes
  to review. Photos that disagree also go to review. Size tag and close-up photos never decide
  the verdict, but a not-allowed item in one still sends the listing to review.
- Photo quality (`app/quality.py`, a port of the app's `PhotoQuality.kt`) never changes the
  verdict; it only adds warnings worded as on the phone.
- Colors come from the garment's pixels, not the model (`app/colors.py`, a port of the app's
  `ItemColor.kt`). Titles follow the app's template: "Emerald velvet cocktail dress".

Thresholds were chosen on the 12 sample listings plus a small set of openly licensed photos;
see the Step 8A handoff for the numbers.

## Develop

    python -m venv .venv && .venv/Scripts/pip install --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt pytest
    .venv/Scripts/python -m pytest tests          # pure logic, no model needed

Deploy (from the repo root):

    gcloud run deploy vision --source services/vision --project dzirent --region us-west1 \
      --no-allow-unauthenticated --service-account vision-runtime@dzirent.iam.gserviceaccount.com \
      --min-instances 0 --max-instances 1 --cpu 2 --memory 4Gi --timeout 120 --concurrency 4 \
      --set-env-vars VISION_ALLOWED_URL_PREFIXES=https://pwfzkyjeivadbtkfkdxr.supabase.co/storage/v1/object/public/listing-photos/

Evaluate the deployed service (needs `roles/run.invoker`):

    python services/vision/eval/run_eval.py --url <service URL> --out results.json
