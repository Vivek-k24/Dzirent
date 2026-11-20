# Vision service

Checks a listing's photos: what the piece is, whether Dzirent lists it, photo quality, colors
and suggested listing text. It runs on Cloud Run (`vision`, `us-west1`, project `dzirent`) and
is a pure function: photo URLs in, scan JSON out. It holds no keys and never calls Supabase.
The Supabase Edge Function `scan-listing` is its only caller (see `pranalika/contract.md`).

Model: [Marqo/marqo-fashionSigLIP](https://huggingface.co/Marqo/marqo-fashionSigLIP)
(Apache 2.0), pinned to commit `c56244cc94f92419e8369fa71efdaf403b124ce8`, on CPU PyTorch.
Image safety model (P2A): [Marqo/nsfw-image-detection-384](https://huggingface.co/Marqo/nsfw-image-detection-384)
(Apache 2.0, a ViT-Tiny fine-tuned from `timm/vit_tiny_patch16_384.augreg_in21k_ft_in1k`), pinned
to commit `0c26ec22111b83f106d72a55f611ec35962bcb65` and built into the image under `/opt/model/safety`.

## API

Cloud Run accepts only signed-in Google callers with `roles/run.invoker` on the service.

- `GET /health`: model, revision, license, policy digest, `service_version` (`v1b.1`),
  `vocabulary_version`, the number of type and gallery pins, start-up seconds.
- `POST /scan` with `{ "listing_id": "...", "photos": [{ "photo_id": "...", "url": "...", "slot": "front" }] }`
  (1-8 photos; `slot` is one of the listing slots or null). `url` is a public listing-photos
  URL (`VISION_ALLOWED_URL_PREFIXES`) or a `data:image/...;base64,` URL.

The response has `verdict` (`allowed`, `rejected`, `review`), `reason` (plain words for the
lender), `suggestions` (category, item type and garment type from the database's own values,
colors with their `color_confidence`, pattern, fabric, styles, title, description; none when
rejected), `quality` (a summary)
and, per photo: `blur_score` (0 sharp to 1 blurry), `brightness_score` (0 black to 1 white),
`framing_score` (0 = the whole piece is in frame; higher = more of its outline runs along the
edge), `worn_by_person` (probability, recorded only), `warnings`, `decision`, `labels` (the label
scores, with `hooded`, `safety.nsfw` and, since V1b, `pins`: that photo's type, confidence,
agreement and banned score) and `fingerprint` (768 numbers).

V1b adds, for the whole-piece photos together: `type` (`qid`, `english_name`, `category`,
`item_type`, `garment_type`, from `data/vision/taxonomy/vocabulary.json`), `type_confidence`,
`agreement` (the text and gallery pins chose the same type), `top_types` (the 5 most likely text
pins, each with `qid`, `english_name`, `allowed` and `score`), `banned_score` (the highest of any
photo's and the photos' together) and `vocabulary_version`. Every earlier field is unchanged; the
suggestions still come from `policy.json`, and their `garment_type` is never `costume` (the apps
don't list it yet; `type.garment_type` carries it).

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
- Content safety (P2A, `app/safety.py` and `app/verdict.py`): a photo the safety model gives a
  nudity or sexual-content probability of 0.90 or more is rejected ("This photo isn't allowed on
  Dzirent."), before any other rule; 0.40 or more sends the listing to review unless it is already
  rejected. A photo the `hooded` prompt bank reads as hooded (0.60 or more) turns allowed into
  review. Every photo counts, size tags and close-ups too. Tests use synthetic images only.
- Photo quality (`app/quality.py`, a port of the app's `PhotoQuality.kt`) never changes the
  verdict; it only adds warnings worded as on the phone. A piece being worn never changes the
  verdict and never adds a warning.
- Colors (V1a, `app/color_reader.py`) come from the garment's own pixels, with the model as a
  second opinion. Per photo: OpenCV GrabCut separates the garment from its background (seeded
  with the framing check's item, or the middle of the photo on a busy background); the light's
  cast is read from a neutral background (a point on the daylight locus, 3500-10000 K) and
  removed, and a dim photo is brightened. The garment's pixels are clustered in CIELAB
  (lightness counts half; a fold's shadow joins its fabric) and each cluster takes the nearest of
  the xkcd survey's 949 color names (`app/color_names.json`, CC0), mapped to one of the apps' 15
  values (`app/colors.py`). The model then compares "a photo of a <name> garment" prompts for the
  names near the colors the pixels found: it can settle a close call, and when it disagrees the
  pixel answer stays with a lower `color_confidence` (0.4; 0.9 when they agree). Only the 15
  values are ever returned. Titles follow the app's template: "Emerald velvet cocktail dress".

- Type pins (V1b, `app/pins.py`): `app/vocabulary.npz` holds one text pin per vocabulary type (843:
  691 allowed, 152 not allowed), the mean of "a photo of a <name>" over its English name and up to
  5 also-called names; `app/gallery.npz` one pin per kept train photo (never a test photo). Both
  are built by `data/vision/embed/build_pins.py` with this service's own model code, and
  `app/pins.json` names the vocabulary version and the gallery's sha256: the service won't start
  if they don't match. The gallery isn't in git: Cloud Build fetches it from the bucket
  (`cloudbuild.yaml`) and the image carries it, so a cold start never reads the bucket. Per photo,
  and for the whole-piece photos together: the text pins as probabilities (softmax of 100 x cosine;
  top 5 reported) and the 10 nearest gallery photos voting for their type by similarity. Text and
  gallery agree: that type, confidence the mean of the two scores. They disagree: the higher-scoring
  one, its score halved, and `agreement` false.
- The banned gate (V1b), computed apart from the type: `banned_score` is the larger of the highest
  probability of any not-allowed text pin and the not-allowed share of the gallery vote. A
  whole-piece photo, or the photos together, at `banned_min` or more: rejected, always, whatever
  the type says, with the reason of the photo's closest not-allowed policy item ("This item isn't
  allowed on Dzirent." when there is none). A size tag or close-up at `banned_min`: review.
- The verdict (V1b), strongest first: clear nudity, rejected; the banned gate, rejected; the policy
  check's rejections (a not-allowed item, not clothing); unsure safety, review; the policy check's
  reviews about the photos (one couldn't be opened, no whole piece, photos that disagree); then
  allowed only for an allowed type the text and gallery agree on with `type_confidence` at
  `type_min_confidence` or more, every whole-piece photo the same kind of thing (garment or the same
  accessory); a hood turns that into review. Anything else is review. Worn never counts.
- `app/thresholds.json` holds every number the pins and the gate use, each with its reason. They
  were chosen on the train split, each photo read without its own gallery pin
  (`eval/calibrate.py`), never on the test split; `eval/run_eval.py --local` measures them on the
  locked test split and writes `eval/report-v1b.md`.
- Policy (V1b): costumes and replica suits are the garment type `costume` (a `policy.json` row and
  a database value since `20261119120000_v1b_costume_and_scan_type.sql`); certified protective
  equipment is never a type.

Thresholds were chosen on the 12 sample listings plus a small set of openly licensed photos;
see the Step 8A handoff for the numbers. V1b's are in `app/thresholds.json` (above).

## Develop

    python -m venv .venv && .venv/Scripts/pip install --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt pytest
    .venv/Scripts/python -m pytest tests          # pure logic and the sample photos, no model needed
    # with VISION_SAFETY_DIR set to a folder holding the safety model, its load test runs too

Locally the service needs the gallery pins: `gcloud storage cp
gs://dzirent-vision-data-dzirent/pins/<vocabulary_version>/gallery.npz services/vision/app/` (the
version is in `app/pins.json`), or `data/vision/embed/build_pins.py gallery`.

Deploy (from the repo root; V1b builds with Cloud Build, which fetches the gallery pins first):

    gcloud builds submit services/vision --project dzirent --region us-west1 \
      --config services/vision/cloudbuild.yaml --substitutions _IMAGE=<registry>/vision:<tag>
    gcloud run deploy vision --image <registry>/vision:<tag> --project dzirent --region us-west1 \
      --no-allow-unauthenticated --service-account vision-runtime@dzirent.iam.gserviceaccount.com \
      --min-instances 0 --max-instances 1 --cpu 2 --memory 4Gi --timeout 120 --concurrency 4 \
      --set-env-vars VISION_ALLOWED_URL_PREFIXES=https://pwfzkyjeivadbtkfkdxr.supabase.co/storage/v1/object/public/listing-photos/

Evaluate the deployed service (needs `roles/run.invoker`; `--key-file` signs in with a service
account key instead of gcloud):

    python services/vision/eval/run_eval.py --url <service URL> --out results.json
    python services/vision/eval/run_eval.py --url <service URL> --key-file H:\DziRent\secrets\vision-invoker-key.json

Evaluate on this PC (V1b; the locked test split and the two folders, no deployed service):

    services/vision/.venv/Scripts/python.exe services/vision/eval/calibrate.py        # the train split
    services/vision/.venv/Scripts/python.exe services/vision/eval/run_eval.py --local # the test split
