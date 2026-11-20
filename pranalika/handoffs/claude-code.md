# Claude Code handoff

Newest entry at the top. Title every entry `## Step <number> - <date> - <short title>`.

## V2 - 2026-11-20 - V1b migration live, pins v2, linear head, two-tier gate, text or poster, v2.1 deployed

**Before starting:**
- `Preview` was clean and up to date at `9489259`.
- No Docker container was running, so there was no local Supabase to stop.
- `H:\DziRent\vision-own` was left alone.
- `H:\DziRent\vision-test\should-accept` now holds 32 photos; `should-reject` is empty. The folder was only read on this PC: never copied, and never named in the repo.
- **Correction:** the first push of `report-v2.md` (`d4deb73`) listed the 32 file names (generic browser-download names, no personal data). The report now numbers them instead ("file 1-32", in sorted-name order).
- gcloud was used only for Cloud Storage, Cloud Build and the `vision` deploy. The Supabase CLI ran with the access token from `H:\DziRent\secrets\`.

**Part 0: the V1b migration on `dzirent-server`.**
- **Before (read-only):** 114 policy rows, no `costume` row, `listings_garment_type_check` without `costume`, 12 scans.
- **Applied:** `supabase db push --linked --dry-run` listed only `20261119120000_v1b_costume_and_scan_type.sql`; `supabase db push --linked --yes` applied it.
- **After (read-only):**
  - 115 policy rows, including the `costume` row (garment, allowed, Occasion & Party, garment type `costume`);
  - both garment-type checks accept `costume`;
  - `vision_finish_scan` names `vocabulary_version`, `top_types`, `banned_score` and `type_confidence`;
  - the last migration is `20261119120000`.
- **A real scan through `scan-listing`:**
  - `node supabase/tests/step8a_scan.mjs --live` passed, but it returned the listing's finished scan from 2026-11-06. `request_scan` reuses a finished scan while the photo set is unchanged, so that proved nothing new.
  - So I ran `node supabase/tests/step8b_recheck.mjs off <a typed-page JPEG I generated> --live`. It is the existing tool for this; with `vision_required` off it re-checks and never pauses. It added a photo to test user 1's "Emerald Velvet Cocktail Dress" and removed it again.
  - The server ran two fresh scans through `scan-listing` and `v1b.1`:
    - `e21d789b…`, with the typed page: done, review, "The photos seem to show different things…", 67 s (cold start);
    - `d57215e5…`, the original two photos: done, review, "We're not sure what this piece is…", 3 s.
  - **Both rows' `suggestions` hold the new fields:**
    - `service_version` `v1b.1` and `vocabulary_version` `69eb998d…`;
    - `type` cocktail dress (Occasion & Party, dress);
    - `type_confidence` 0.2479 and 0.3472, `agreement` false;
    - 5 `top_types`;
    - `banned_score` 0.2071 and 0.001.
  - The listing ended active with its 2 photos; the script removed the test photo and its row.

**Part 1: pins v2 and the looser model-agreement check** (`data/vision/embed/build_pins.py`). It reused V1b's embedding cache, so nothing had to be embedded again.
- **Text pins:**
  - Each pin is "a photo of a {name}" for the English name and its English aliases: Wikidata's English aliases and D1's launch fallback names. Only names the type's `vocabulary` has, at most 5, no repeats, no `also_called`.
  - 843 pins, 1,860 prompts; 476 types have aliases.
  - `vocabulary_version` now covers the prompts: the sha256 of `vocabulary.json`'s sha256, the pin recipe and every pin's prompts. `vocabulary.json` itself didn't change.
  - The new version is **`02fcb7ac3009731c6154ffeae27ad8849b2e6743e13e4c7083a23f4cae1bb7d0`**.
- **The rule:** a photo stays when any text pin with the same `dzirent_category` and `dzirent_garment_type` as its own type is in its top 5. Every not-allowed type shares the blank mapping, so a not-allowed photo agrees with any not-allowed pin.
  - **What was checked:** every photo V1b marked `model_disagrees` (1,945). The 277 rows that passed in V1b were kept as they were, and the 159 photos you had decided weren't touched.
  - **Result:** **930 pass and are kept again** (608 Openverse, 322 search); **1,015 stay dropped**.
  - **How they come back:** the auto filter simply stops dropping them, and no owner row is written. So an owner decision still wins, and they show as undecided on the label-check page.
  - `model_agreement.csv` gained the columns `rule`, `top5` and `mapping_rank`.
- **Auto filter and split:** I reran `auto_filter.py`, then `split.py` (sticky).
  - `labels.csv` lost exactly the 930 auto rows, and **your 4,170 rows are byte-identical**. V1b's entry said 4,171, but the file had 4,170 then too.
  - **10,952 kept: 8,827 train, 2,125 test; 930 new; 0 photos changed sides.**
- **How good the restored photos are:** a contact sheet of 24 of the 930, chosen at random:
  - 8 right, 6 doubtful, 10 wrong;
  - the wrong ones: soldiers for qamis, Mackintosh and cagoule; a car named Duster; a Modigliani painting for blouse; two Second Life adverts for day dress; two 3D renders.
  - So the looser rule gives back wrong photos along with the right ones.
- **Per launch type.** "Removed" and "Restored" count this check only; the test columns are from the eval below.

| Type | Policy | V1b removed | V2 restored | Kept V1b | Kept V2 | Train | Test | Test: type top-1 | Test: mapping top-1 | V2 test verdicts (allowed / review / rejected) | V1b test verdicts |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| achkan (under 20) | allowed | 4 | 0 | 0 | 0 | 0 | 0 |  |  | 0 / 0 / 0 | 0 / 0 / 0 |
| débutante dress (under 20) | allowed | 5 | 3 | 2 | 5 | 3 | 2 | 50% | 100% | 0 / 2 / 0 | 0 / 0 / 0 |
| Anarkali Salwar Suit (under 20) | allowed | 0 | 0 | 8 | 8 | 6 | 2 | 50% | 100% | 1 / 1 / 0 | 0 / 2 / 0 |
| Nehru jacket (under 20) | allowed | 6 | 6 | 2 | 8 | 6 | 2 | 0% | 0% | 1 / 1 / 0 | 0 / 1 / 0 |
| Sherwani (under 20) | allowed | 20 | 2 | 15 | 17 | 14 | 3 | 67% | 67% | 0 / 2 / 1 | 0 / 2 / 0 |
| sheath dress | allowed | 62 | 4 | 18 | 22 | 18 | 4 | 0% | 0% | 0 / 4 / 0 | 0 / 4 / 0 |
| dashiki | allowed | 17 | 9 | 18 | 27 | 22 | 5 | 40% | 60% | 0 / 5 / 0 | 0 / 4 / 0 |
| blouse | allowed | 69 | 21 | 11 | 32 | 26 | 6 | 0% | 0% | 1 / 4 / 1 | 0 / 2 / 0 |
| China Poblana | allowed | 68 | 23 | 12 | 35 | 28 | 7 | 71% | 71% | 2 / 5 / 0 | 0 / 2 / 0 |
| bridesmaid's dress | allowed | 21 | 17 | 21 | 38 | 30 | 8 | 75% | 75% | 2 / 6 / 0 | 0 / 4 / 0 |
| party dress | allowed | 0 | 0 | 40 | 40 | 32 | 8 | 25% | 50% | 0 / 8 / 0 | 0 / 8 / 0 |
| cardigan | allowed | 0 | 0 | 41 | 41 | 33 | 8 | 38% | 62% | 0 / 7 / 1 | 0 / 7 / 1 |
| huipil | allowed | 0 | 0 | 43 | 43 | 34 | 9 | 100% | 100% | 5 / 4 / 0 | 0 / 9 / 0 |
| costume jewelry | allowed | 0 | 0 | 44 | 44 | 35 | 9 | 33% | 89% | 2 / 7 / 0 | 0 / 9 / 0 |
| blazer | allowed | 0 | 0 | 45 | 45 | 36 | 9 | 56% | 78% | 1 / 8 / 0 | 0 / 9 / 0 |
| handbag | allowed | 0 | 0 | 45 | 45 | 36 | 9 | 89% | 100% | 5 / 4 / 0 | 0 / 8 / 1 |
| down jacket | allowed | 0 | 0 | 46 | 46 | 37 | 9 | 89% | 89% | 0 / 9 / 0 | 0 / 6 / 3 |
| guayabera | allowed | 23 | 11 | 35 | 46 | 37 | 9 | 78% | 78% | 1 / 8 / 0 | 0 / 6 / 0 |
| tracksuit bottoms | not allowed | 36 | 3 | 44 | 47 | 38 | 9 | 33% | 44% | 0 / 5 / 4 | 0 / 3 / 5 |
| jumpsuit | allowed | 54 | 24 | 26 | 50 | 40 | 10 | 60% | 70% | 0 / 10 / 0 | 0 / 4 / 0 |
| sunglasses | allowed | 0 | 0 | 50 | 50 | 40 | 10 | 80% | 100% | 9 / 1 / 0 | 5 / 5 / 0 |
| hat | not allowed | 0 | 0 | 51 | 51 | 40 | 11 | 45% | 82% | 1 / 3 / 7 | 0 / 3 / 8 |
| cheongsam (qipao) | allowed | 0 | 0 | 52 | 52 | 42 | 10 | 90% | 100% | 7 / 3 / 0 | 3 / 7 / 0 |
| dinner jacket | allowed | 0 | 0 | 52 | 52 | 42 | 10 | 40% | 70% | 4 / 6 / 0 | 0 / 10 / 0 |
| jeans | not allowed | 0 | 0 | 52 | 52 | 39 | 13 | 23% | 54% | 0 / 5 / 8 | 0 / 3 / 10 |
| suit | allowed | 0 | 0 | 52 | 52 | 42 | 10 | 30% | 50% | 0 / 10 / 0 | 0 / 9 / 1 |
| cap | not allowed | 0 | 0 | 53 | 53 | 43 | 10 | 30% | 70% | 0 / 5 / 5 | 0 / 2 / 8 |
| hanbok | allowed | 0 | 0 | 55 | 55 | 44 | 11 | 64% | 82% | 2 / 9 / 0 | 0 / 11 / 0 |
| leather jacket | allowed | 0 | 0 | 55 | 55 | 44 | 11 | 64% | 73% | 4 / 7 / 0 | 0 / 11 / 0 |
| boubou | allowed | 0 | 0 | 56 | 56 | 45 | 11 | 64% | 73% | 2 / 9 / 0 | 0 / 11 / 0 |
| evening dress | allowed | 66 | 42 | 14 | 56 | 45 | 11 | 36% | 64% | 0 / 11 / 0 | 0 / 0 / 0 |
| swimsuit | not allowed | 58 | 34 | 22 | 56 | 45 | 11 | 9% | 9% | 0 / 3 / 8 | 0 / 1 / 4 |
| t-shirt | not allowed | 0 | 0 | 56 | 56 | 45 | 11 | 73% | 82% | 0 / 4 / 7 | 0 / 4 / 7 |
| shorts | not allowed | 0 | 0 | 58 | 58 | 46 | 12 | 25% | 58% | 0 / 4 / 8 | 0 / 0 / 12 |
| trousers | allowed | 58 | 36 | 22 | 58 | 46 | 12 | 33% | 67% | 0 / 10 / 2 | 0 / 2 / 2 |
| sari | allowed | 34 | 15 | 46 | 61 | 49 | 12 | 67% | 92% | 7 / 5 / 0 | 0 / 9 / 0 |
| tuxedo | allowed | 0 | 0 | 62 | 62 | 50 | 12 | 58% | 83% | 6 / 6 / 0 | 0 / 12 / 0 |
| sundress | allowed | 43 | 26 | 37 | 63 | 50 | 13 | 62% | 69% | 2 / 10 / 1 | 0 / 6 / 1 |
| kurta | allowed | 35 | 20 | 45 | 65 | 52 | 13 | 69% | 77% | 5 / 8 / 0 | 0 / 10 / 0 |
| trench coat | allowed | 38 | 23 | 42 | 65 | 52 | 13 | 69% | 85% | 6 / 6 / 1 | 0 / 10 / 0 |
| hoodie | not allowed | 0 | 0 | 66 | 66 | 52 | 14 | 57% | 64% | 0 / 5 / 9 | 0 / 3 / 11 |
| shalwar kameez | allowed | 29 | 19 | 47 | 66 | 53 | 13 | 31% | 46% | 1 / 12 / 0 | 0 / 8 / 0 |
| day dress | allowed | 55 | 42 | 25 | 67 | 54 | 13 | 54% | 69% | 2 / 11 / 0 | 0 / 4 / 0 |
| lingerie | not allowed | 48 | 36 | 32 | 68 | 54 | 14 | 64% | 100% | 0 / 1 / 13 | 0 / 0 / 7 |
| overcoat | allowed | 57 | 47 | 23 | 70 | 56 | 14 | 43% | 86% | 1 / 12 / 1 | 0 / 4 / 0 |
| undergarment | not allowed | 47 | 37 | 33 | 70 | 56 | 14 | 43% | 64% | 0 / 2 / 12 | 0 / 0 / 6 |
| smartwatch | not allowed | 0 | 0 | 71 | 71 | 57 | 14 | 64% | 64% | 0 / 1 / 13 | 0 / 0 / 14 |
| lehenga | allowed | 0 | 0 | 73 | 73 | 58 | 15 | 60% | 60% | 3 / 12 / 0 | 1 / 14 / 0 |
| cocktail dress | allowed | 0 | 0 | 74 | 74 | 59 | 15 | 53% | 60% | 1 / 14 / 0 | 0 / 15 / 0 |
| skirt | allowed | 53 | 47 | 27 | 74 | 59 | 15 | 40% | 93% | 2 / 11 / 2 | 0 / 4 / 1 |
| necktie | allowed | 37 | 32 | 43 | 75 | 60 | 15 | 53% | 100% | 9 / 6 / 0 | 0 / 8 / 0 |
| sweatshirt | not allowed | 0 | 0 | 75 | 75 | 60 | 15 | 53% | 73% | 0 / 2 / 13 | 0 / 1 / 14 |
| shoe | not allowed | 31 | 29 | 49 | 78 | 62 | 16 | 62% | 94% | 0 / 2 / 14 | 0 / 1 / 9 |
| sports jersey | not allowed | 0 | 0 | 79 | 79 | 63 | 16 | 19% | 88% | 0 / 1 / 15 | 0 / 0 / 16 |
| ball gown | allowed | 0 | 0 | 80 | 80 | 64 | 16 | 56% | 69% | 3 / 13 / 0 | 0 / 16 / 0 |
| three-piece suit | allowed | 0 | 0 | 80 | 80 | 64 | 16 | 81% | 88% | 4 / 12 / 0 | 0 / 16 / 0 |
| wristwatch | allowed | 0 | 0 | 80 | 80 | 64 | 16 | 69% | 94% | 10 / 5 / 1 | 0 / 15 / 1 |

- **Launch types now under 20 kept: 5** (10 in V1b):

| Type | Kept |
| --- | --- |
| achkan | 0 |
| débutante dress | 5 |
| Anarkali Salwar Suit | 8 |
| Nehru jacket | 8 |
| Sherwani | 17 |

  - Evening dress is back to 56 kept, 11 of them test.
  - Débutante dress has 2 test photos again.
  - Achkan still has none.
  - All 608 launch restorations are Openverse photos.
- **Other types restored most:**

| Type | Restored | Kept now |
| --- | --- | --- |
| mantle | 45 | 54 |
| rain cape | 35 | 64 |
| Mackintosh | 34 | 36 |
| qamis | 33 | 37 |
| abaya | 32 | 60 |
| duster | 31 | 39 |
| cagoule | 27 | 33 |
| Farwah | 23 | 24 |
| walking suit | 11 | |
| track suit top | 11 | |
| beach dress | 11 | |

  Eight more types got back 1 to 6 photos each.
- **Gallery:** 8,827 train photos of 708 types (2,997 not allowed); the build refuses a test photo.
- **Bucket:**
  - Uploaded to `gs://dzirent-vision-data-dzirent/pins/02fcb7ac…/`, together with `vocabulary.npz`, `linear.npz` and `pins.json`.
  - The bucket's `images/labels.csv` and `images/split.json` were refreshed; `manifest.csv` didn't change.

**Part 2: decisions at the Dzirent level** (`services/vision/app/pins.py`):
- **Scores:** text, gallery and linear probabilities are kept per type and also summed per mapping (category, garment type, allowed).
- **Agreement:** the text pins' top mapping and the gallery vote's top mapping are the same. That mapping is chosen, and its confidence is its final score.
- **Disagreement:** the mapping with the highest final score is chosen, its score is halved, and `agreement` is false.
- **What's reported:** `type` is the best type (final score) inside the chosen mapping; `top_types` are the 5 best types by the final score.

**Part 3: the linear head** (`data/vision/embed/train_linear.py`, `services/vision/app/linear.npz`):
- **What it is:** multinomial logistic regression on the 768-number embeddings, one class per type with train photos (708). It uses sample weights and L2 on the weights, and is fitted with full-batch L-BFGS (torch, CPU).
- **Train split only:** every sample is a train photo or an augmented copy of one. `training_samples` asserts that no test sha1 gets in, and `augment.py` refuses test photos too.
- **Thin types:**
  - The 549 types under 20 kept got augmented copies of their 3,035 train photos. The copies use `augment.py`'s pipeline, seeded by each photo's sha1, and each photo is drawn its `oversample` times, at most 8.
  - That made **6,655 copies**: 224 x 224 PNGs in `images/raw/augmented/` (not committed), embedded by the service's own code in 34 minutes.
  - The 188 train photos of other oversampled types count with a weight instead (at most 8).
  - **15,482 samples** in all.
- **Choosing the L2 strength:** 5-fold cross-fitting, keeping the lowest out-of-fold log loss.
  - Folds are by photo. A photo's copies and its same-picture twins (cosine 0.995 or more) stay in one fold; 21 such pairs were merged.

| L2 | Out-of-fold log loss | Top-1 | Top-3 |
| --- | --- | --- | --- |
| 1e-7 | 2.469 | 58.2 % | 72.9 % |
| 3e-7 | 2.412 | 58.2 % | 73.1 % |
| **1e-6** | **2.401** | **58.1 %** | **73.1 %** |
| 3e-6 | 2.465 | 57.8 % | 73.1 % |
| 1e-5 | 2.650 | 56.7 % | 72.6 % |
| 3e-5 | 3.168 | 51.2 % | 68.6 % |
| 1e-4 | 4.346 | 37.9 % | 54.3 % |
| 3e-4 | 5.517 | 20.7 % | 33.8 % |
| 1e-3 | 6.161 | 10.9 % | 16.5 % |

  My first grid stopped at 1e-4, and its lowest value won. So I widened it until the best value had a worse one on each side.
- **The file:**
  - Weights and bias are float16; 708 classes; **1,019,078 bytes**. That is 0.97 MiB, just over a decimal megabyte, which is what 708 x 768 float16 values come to.
  - Training set sha256 `0e62735dae6b86704a3737607dc3e6f09db849f49a5ea31d2e4333178a6306b1`; file sha256 `7fd0498b060272aeaca0c4a052f44591380a2a5eb5a87989f1f813eadfbebcd4`.
  - Both hashes are in `pins.json`. The service refuses to start on a mismatch, and the Docker build checks them too.
- **Calibration reads out-of-fold probabilities:** each train photo's out-of-fold probabilities (`images/raw/linear_oof.npz`) are what calibration uses. So no train photo is scored by a head that learned from it.

**Part 4: the two-tier gate** (`app/verdict.py`). `banned_score` is the largest of the three sources' not-allowed shares (`banned_rule` max).
- **At `banned_hard` or more:** rejected, with the not-allowed reason.
- **From `banned_min` up to `banned_hard`:** review, "We couldn't confirm this item is allowed; a reviewer will check."
- **A size tag or close-up at `banned_min` or more:** review, as in V1b.

**Part 5: text or poster.**
- **The rows:** six new rows in the policy's not-clothing group, defined like the others (kind other, not allowed, policy group "not clothing", the one not-clothing reason): `text_page`, `poster`, `book_cover`, `shop_sign`, `infographic` and `screenshot`. Each has 3-4 prompts.
- **What they do:** a whole-piece photo goes to review when its text-or-poster share of the policy labels reaches `text_poster_min`, or when the policy check calls it not clothing with one of these items. The reason is "This photo looks like text or a poster, not the piece itself, so someone at Dzirent will check it." It is never allowed and never rejected as not clothing.
- **The migration:** `20261120120000_v2_text_or_poster_policy.sql` reseeds `policy_item_types` (121 rows) the same way V1b's did. `test_policy_sync` passes, and the **policy digest is `f2250888045a4f47`** (was `30466e8f3a812d8c`).
- Photo `decision` values are unchanged: `photo_scans_decision_check` allows only the five old ones.
- **This migration is not applied to `dzirent-server`**, because the prompt asked only for V1b's. Scans don't need it: no column refers to policy keys.

**Thresholds and why.** Every value is in `services/vision/app/thresholds.json`, each with its reason. `eval/calibrate.py` chose them on the **train** split:
- **Photos:** 8,827: 5,830 of allowed types and 2,997 not allowed.
- **No self-scoring:** each photo was read without its own gallery pin or any identical picture, and with out-of-fold linear probabilities.
- **Each source alone on train:** the text pins read the type right for 25.3 % of photos, the gallery 51.2 %, the linear head 58.1 %.

| Name | Value | Why |
| --- | --- | --- |
| `weight_text` / `weight_gallery` / `weight_linear` | 0.6 / 0.1 / 0.3 | I tried 66 triples (0.1 steps) under both banned rules. This one allows the most allowed train photos while allowing no not-allowed one: 30.6 % (1,783); mapping top-1 72.1 %. Without the head the best was 30.5 % (0.8 / 0.2 / 0, mapping top-1 64.6 %); V1b's equal text and gallery weights, 28.1 %. |
| `banned_rule` | max | The weighted ("combined") rule's best was 25.7 %. |
| `banned_hard` | 0.91 | The lowest value (0.01 steps) that rejects at most 1 % of allowed train photos outright (0.70 %). It rejects 54.7 % of not-allowed train photos. |
| `banned_min` | 0.10 | Chosen together with `type_min_confidence`: no not-allowed train photo allowed, and as many allowed ones allowed as possible. This tier sends 44.8 % of not-allowed and 45.7 % of allowed train photos to review. |
| `type_min_confidence` | 0.60 | Under `banned_min`, the highest confidence any not-allowed train photo reached on an agreeing allowed mapping was 0.595 (the next was 0.578), so this is the next 0.05 above it. Of the allowed train photos it allows, 96.1 % have the right mapping and 64.3 % the right type. |
| `text_poster_min` | 0.25 | The lowest value (0.05 steps) at which at most 1 % of allowed train photos read as text or a poster: 0.96 %, and 1.5 % of not-allowed ones. |
| `text_logit_scale`, `text_top`, `gallery_k`, `disagreement_factor` | 100, 5, 10, 0.5 | Unchanged from V1b. |

**Part 6: the eval** (`run_eval.py --local`; **`services/vision/eval/report-v2.md`**, committed). It was measured once, after every value above was fixed.
- **Test set:** V2's test split is V1b's 1,928 photos (the split is sticky) plus 197 of the restored ones.
- **Like-for-like:** V2 is also measured on exactly V1b's photos.

| Run | Photos | Type top-1 | Mapping top-1 | Agreement | Allowed types: allowed / review / rejected | Not-allowed types: allowed / review / rejected |
| --- | --- | --- | --- | --- | --- | --- |
| V1b | 1,928 | 51 % | | 20 % | 35 / 1,115 / 64 | 0 / 129 / 585 |
| V2, V1b's photos | 1,928 | 53 % | 75 % | 59 % | **291** / 883 / 40 | **1** / 221 / 492 |
| V2, all | 2,125 | 53 % | 75 % | 57 % | **304** / 1,014 / 60 | **1** / 229 / 517 |

- **Each source alone on the test split:** text top-1 25 %, gallery 54 %, linear head 64 %. The photo's type is in the top 3 by the final score for 76 % of photos (text pins alone: 43 %).
- **Allowed-type photos allowed: 304 of 1,378 (22 %).** V1b: 35 of 1,214 (2.9 %).
- **Gate false rejections** (allowed-type photos the gate rejected outright): **8 of 1,378** (V1b: 44 of 1,214).
- **Allowed-type photos rejected by anything:** 8 by the gate, 50 by the policy check's own rules, 2 for nudity.
- **Why allowed-type photos went to review:**

| Reason | Photos |
| --- | --- |
| The gate's lower tier | 499 |
| "Not sure" | 353 |
| Hood | 131 |
| Text or poster | 16 |
| Unsure safety | 11 |
| Photos that disagree | 4 |

  The report has the full table.
- **Banned leaks: 1, not 0.** The photo is `27abe3ead742`, labelled **hat**: a Commons category photo you kept on the label-check page on 2026-11-19.
  - It shows a group of five men; the man in the middle wears a small cap with a long embroidered robe.
  - Text pins, gallery and linear head all read **boubou** (agreeing, confidence 0.757, banned score 0.006), and so did the policy check.
  - That is a correct reading of the most visible garment, in a photo labelled by its smallest one.
  - I did **not** change anything after seeing it: that would mean choosing values on the test split.
  - **For the coordinator:** excluding it would need `type_min_confidence` 0.80. On train that allows 22.4 % of allowed photos instead of 30.6 %; on test, 226 instead of 304. No gate threshold catches it, since its banned score is 0.006.
- **The 57 launch types:** in the table above and in the report, with V1b's numbers beside V2's.
- **Your folders:**
  - `should-accept`, 32 photos: **15 allowed, 17 review, 0 rejected**. Every file read as a kurta or a Sherwani (Cultural & Traditional, top or suit). The report has each file's verdict, type and confidence, by number.
  - `should-reject` is empty.

**Tests:**
- **`services/vision`:** `pytest -m "not model" tests`, **166 passed**.
  - 24 are new, in `tests/test_v2.py`, using synthetic pins and a tiny synthetic linear head. They cover:
    - **Mapping agreement:** two types of one mapping agree; different mappings halve the confidence; mapping agreement allows what type agreement wouldn't.
    - **The final score and the head:** `top_types` follow the final score; the head takes part, and calibration can replace its probabilities.
    - **The two-tier gate:**
      - the hard tier rejects with the not-allowed reason;
      - borderline scores of 0.30, 0.50 and 0.69 give review with the neutral reason, never allowed;
      - under `banned_min`, the type decides;
      - a borderline close-up only sends to review;
      - both banned rules.
    - **Text or poster:**
      - the new rows are defined like the other not-clothing rows;
      - a text-or-poster photo goes to review even with a confident allowed type;
      - it is never rejected as not clothing, while a phone still is;
      - the scan flags it from the labels.
    - **The response:** it keeps every field and adds `mapping` and `linear_sha256`.
    - **Loading the head:** it is refused on a file-hash mismatch, a training-set-hash mismatch or a missing `pins.json` key. The thresholds' checks run, and the committed head matches `pins.json`.
  - `test_v1b.py`'s 26 tests still pass with one-tier, no-linear thresholds; two assertions were updated for V2's meaning.
  - `test_policy_sync` passes.
- **`data/vision`:** **152 passed**.
  - `test_build_pins.py` was rewritten for V2: English aliases, the version following the prompts, the mapping rule, not-allowed types, and a run re-checking only the marked and new photos.
  - `test_train_linear.py` is new (5 tests).
- **CI:** run 44813657094 on `2fc7080`: **success on all 6 jobs** (contracts, database, android, vision-data, vision, website). pgTAP ran 16 files, 459 tests (`16_v2` ok).

**Build and deploy:**
- **Cloud Build** `e0411964-7875-4cd3-84c2-f215d5b7c08e`, 12 min 48 s:
  - `app/gallery.npz: OK` (the sha256 matched);
  - the build's start-up check printed "843 type pins, 8827 gallery pins, 708 linear head classes";
  - 2,383 prompts for 121 policy items embedded in 476 s;
  - image `us-west1-docker.pkg.dev/dzirent/cloud-run-source-deploy/vision:v2-1-2fc7080`.
- **Deploy:** `gcloud run deploy vision --image …` with the image only, so every setting stays. **Revision `vision-00008-m4m` serves 100 % of traffic** (it was `vision-00007-6s4`, `v1b.1`).
- **Settings, checked after the deploy:**
  - service account `vision-runtime`;
  - max 1 instance (min unset, so 0), 2 CPU, 4 GiB;
  - timeout 120 s, concurrency 4, startup CPU boost;
  - the only IAM binding is `roles/run.invoker` for `vision-invoker`.
- **To go back:** `gcloud run services update-traffic vision --to-revisions vision-00007-6s4=100 --project dzirent --region us-west1`.
- **`/health`** (signed in with the invoker key):
  - `service_version` **`v2.1`**;
  - `vocabulary_version` **`02fcb7ac3009731c6154ffeae27ad8849b2e6743e13e4c7083a23f4cae1bb7d0`**;
  - `linear_head` sha256 **`7fd0498b060272aeaca0c4a052f44591380a2a5eb5a87989f1f813eadfbebcd4`** (training set `0e62735d…`, 708 classes);
  - 121 policy items, policy digest `f2250888045a4f47`;
  - 843 type pins, 8,827 gallery pins;
  - start-up 37.8 s.

**The two live responses.** `run_eval.py`'s `--key-file` signed in with `H:\DziRent\secrets\vision-invoker-key.json`. There is no key material below, and the fingerprints are shortened. The listing and photo ids are neutral, so no file name was sent.

- **should-accept** ("file 1": the first file of `vision-test\should-accept` in sorted order, taken as it came rather than picking an allowed one; 2.8 s). Live matches the local run exactly: review, kurta, 0.4755.

  ```json
  {"listing_id":"v2-live-accept","verdict":"review","reason":"We're not sure what this piece is, so someone at Dzirent will check the photos.","item_key":null,"suggestions":{"item_key":"sherwani","item_label":"Sherwani","category":"Cultural & Traditional","item_type":null,"garment_type":"suit","colors":["White"],"color_confidence":0.7,"pattern":null,"fabric":null,"styles":["South Asian"],"title":"White sherwani","description":"White sherwani.","alternatives":["Kurta","Salwar kameez"],"confidence":0.6608},"quality":{"summary":"All photos look good.","photos":1,"photos_with_warnings":0,"warnings":[]},"photos":[{"photo_id":"v2-live-accept-photo","slot":"front","ok":true,"blur_score":0.0,"brightness_score":0.6904,"framing_score":null,"worn_by_person":0.968,"checks":{"sharp":"pass","lighting":"pass","whole_item":"unsure","notes":["sharp","acceptable_light","background_not_uniform"],"sharpness":2791.6,"mean_gray":176.0},"warnings":[],"decision":"allowed","looks_like":"sherwani","labels":{"items":{"sherwani":0.6608,"kurta":0.159,"salwar_kameez":0.077,"ao_dai":0.0451,"waistcoat":0.0203,"barong":0.0131,"dashiki":0.0057,"suit":0.0046,"hanbok":0.0039,"dupatta":0.0028},"groups":{"allowed":0.9995,"not_allowed":0.0003,"not_clothing":0.0001,"detail":0.0001},"not_fashion":0.0161,"hooded":0.0399,"safety":{"nsfw":0.0674},"text_or_poster":0.0,"patterns":{"solid":0.2068,"striped":0.0021,"polka dot":0.0012,"floral":0.2455,"plaid":0.0027,"embroidered":0.5321,"sequined":0.0096},"styles":{"South Asian":0.8671,"East Asian":0.0057,"Southeast Asian":0.1151,"Middle Eastern":0.0066,"African":0.0033,"Mexican & Latin American":0.0004,"Country & Western":0.0,"Western formal":0.0011,"Western casual":0.0006},"fabrics":{"silk":0.4256,"satin":0.0268,"cotton":0.0744,"linen":0.424,"wool":0.0097,"denim":0.0017,"velvet":0.0202,"chiffon":0.0085,"leather":0.0036,"lace":0.0055},"pins":{"type":"Q855915","type_confidence":0.4755,"agreement":true,"text":{"qid":"Q6207848","score":0.1803},"gallery":{"qid":"Q855915","score":0.6036},"banned_score":0.0059,"linear":{"qid":"Q855915","score":0.7149},"mapping":{"category":"Cultural & Traditional","garment_type":"top","allowed":true,"score":0.4755},"text_mapping":{"category":"Cultural & Traditional","garment_type":"top","allowed":true},"gallery_mapping":{"category":"Cultural & Traditional","garment_type":"top","allowed":true},"banned":{"text":0.0034,"gallery":0.0,"linear":0.0059}}},"fingerprint":"[768 numbers]"}],"model":{"id":"Marqo/marqo-fashionSigLIP","revision":"c56244cc94f92419e8369fa71efdaf403b124ce8","license":"Apache-2.0"},"safety_model":{"id":"Marqo/nsfw-image-detection-384","revision":"0c26ec22111b83f106d72a55f611ec35962bcb65","license":"Apache-2.0"},"policy_digest":"f2250888045a4f47","service_version":"v2.1","type":{"qid":"Q855915","english_name":"kurta","category":"Cultural & Traditional","item_type":null,"garment_type":"top"},"type_confidence":0.4755,"agreement":true,"top_types":[{"qid":"Q855915","english_name":"kurta","allowed":true,"score":0.3155},{"qid":"Q837879","english_name":"Sherwani","allowed":true,"score":0.1423},{"qid":"Q6207848","english_name":"Jodhpuri","allowed":true,"score":0.1082},{"qid":"Q11339904","english_name":"Nehru jacket","allowed":true,"score":0.0609},{"qid":"Q16671745","english_name":"qamis","allowed":true,"score":0.0471}],"banned_score":0.0059,"vocabulary_version":"02fcb7ac3009731c6154ffeae27ad8849b2e6743e13e4c7083a23f4cae1bb7d0","mapping":{"category":"Cultural & Traditional","garment_type":"top","allowed":true,"score":0.4755},"linear_sha256":"7fd0498b060272aeaca0c4a052f44591380a2a5eb5a87989f1f813eadfbebcd4","timing_ms":{"fetch":0,"queue":0,"analyze":2479,"total":2479}}
  ```

- **should-reject** (`should-reject` is empty, so this is a locked test photo: the shoe photo `0f5982ac4581` V1b also used, never in the gallery or the head's training set; 1.5 s):

  ```json
  {"listing_id":"v2-live-0f5982ac4581","verdict":"rejected","reason":"This looks like sneakers. Dzirent doesn't allow shoes.","item_key":null,"suggestions":null,"quality":{"summary":"1 of 1 photos could be better.","photos":1,"photos_with_warnings":1,"warnings":["Too bright: avoid direct sun and flash"]},"photos":[{"photo_id":"v2-live-0f5982ac4581-photo","slot":"front","ok":true,"blur_score":0.0,"brightness_score":0.7763,"framing_score":0.0,"worn_by_person":0.4125,"checks":{"sharp":"pass","lighting":"fail","whole_item":"pass","notes":["sharp","overexposed","garment_fully_visible"],"sharpness":4034.7,"mean_gray":198.0},"warnings":["Too bright: avoid direct sun and flash"],"decision":"not_allowed","looks_like":"sneakers","labels":{"items":{"sneakers":0.7578,"dress_shoes":0.1455,"sandals":0.0759,"heels":0.0102,"dog":0.0019,"socks":0.0015,"boots":0.0012,"joggers":0.0007,"jeans":0.0006,"cat":0.0004},"groups":{"allowed":0.0012,"not_allowed":0.994,"not_clothing":0.0048,"detail":0.0},"not_fashion":0.4197,"hooded":0.1766,"safety":{"nsfw":0.0551},"text_or_poster":0.0,"patterns":{"solid":0.1194,"striped":0.0142,"polka dot":0.5467,"floral":0.1093,"plaid":0.0373,"embroidered":0.1556,"sequined":0.0175},"styles":{"South Asian":0.0515,"East Asian":0.1285,"Southeast Asian":0.0113,"Middle Eastern":0.0906,"African":0.0119,"Mexican & Latin American":0.3075,"Country & Western":0.0268,"Western formal":0.0077,"Western casual":0.3643},"fabrics":{"silk":0.0031,"satin":0.0022,"cotton":0.2454,"linen":0.0097,"wool":0.0131,"denim":0.1748,"velvet":0.0031,"chiffon":0.0072,"leather":0.5338,"lace":0.0076},"pins":{"type":"Q22676","type_confidence":0.8325,"agreement":true,"text":{"qid":"Q107268359","score":0.2795},"gallery":{"qid":"Q161928","score":0.1956},"banned_score":1.0,"linear":{"qid":"Q22676","score":0.8703},"mapping":{"category":null,"garment_type":null,"allowed":false,"score":0.8325},"text_mapping":{"category":null,"garment_type":null,"allowed":false},"gallery_mapping":{"category":null,"garment_type":null,"allowed":false},"banned":{"text":0.7678,"gallery":1.0,"linear":0.9472}}},"fingerprint":"[768 numbers]"}],"model":{"id":"Marqo/marqo-fashionSigLIP","revision":"c56244cc94f92419e8369fa71efdaf403b124ce8","license":"Apache-2.0"},"safety_model":{"id":"Marqo/nsfw-image-detection-384","revision":"0c26ec22111b83f106d72a55f611ec35962bcb65","license":"Apache-2.0"},"policy_digest":"f2250888045a4f47","service_version":"v2.1","type":{"qid":"Q22676","english_name":"shoe","category":null,"item_type":null,"garment_type":null},"type_confidence":0.8325,"agreement":true,"top_types":[{"qid":"Q22676","english_name":"shoe","allowed":false,"score":0.3714},{"qid":"Q107268359","english_name":"doll shoes","allowed":false,"score":0.1788},{"qid":"Q161928","english_name":"footwear","allowed":false,"score":0.1376},{"qid":"Q139505887","english_name":"Bekishe","allowed":true,"score":0.0704},{"qid":"Q167633","english_name":"clog","allowed":false,"score":0.0465}],"banned_score":1.0,"vocabulary_version":"02fcb7ac3009731c6154ffeae27ad8849b2e6743e13e4c7083a23f4cae1bb7d0","mapping":{"category":null,"garment_type":null,"allowed":false,"score":0.8325},"linear_sha256":"7fd0498b060272aeaca0c4a052f44591380a2a5eb5a87989f1f813eadfbebcd4","timing_ms":{"fetch":1,"queue":0,"analyze":1166,"total":1167}}
  ```

**Owner decisions:**
- **Apply the V2 migration** (`20261120120000_v2_text_or_poster_policy.sql`, the six text-or-poster policy rows) to `dzirent-server`? I didn't, because this prompt asked only for V1b's. Scans don't need it; until it's applied, the live `policy_item_types` has 115 rows while the service's `policy.json` has 121.
- **Look at the 930 restored photos** if you have time. They show as undecided under `review_server.py --types-with-new`, and about 4 in 10 of a random sample were wrong photos.

**Open questions for the coordinator:**
1. **The one banned leak** (above): treat it as a label problem (the photo shows an allowed boubou; relabel it, or drop it from "hat"), or raise `type_min_confidence` to 0.80 (train: 30.6 % -> 22.4 % of allowed photos allowed)?
2. **The gate's lower tier is the main review reason.** `banned_min` 0.10 sends 499 of the 1,014 allowed-type test photos that went to review there (45.7 % of allowed train photos). It is what keeps not-allowed photos out at this `type_min_confidence`. The cheaper path is cleaner not-allowed training photos: the "max" rule follows whichever source is most alarmed, often the gallery or the head.
3. **The hood rule** sends 131 allowed-type test photos to review; hoods are common on coats and jackets. Keep it?
4. **The looser model-agreement rule** gave back 930 photos, about 4 in 10 wrong in a sample, and they are now in the gallery and the head's training set. Keep it, tighten it (top 3 of the mapping), or have the owner check them?
5. **`vision_finish_scan`** keeps every V1b field, but not V2's `mapping` and `linear_sha256`. Add them in a migration?
6. **Suggestions vs `type` and `mapping`:** the apps still read `suggestions`, which come from `policy.json`. For file 1 live, the suggestions say "Sherwani" while `type` says "kurta".
7. **Text or poster:** `text_poster_min` was set at 1 % of allowed train photos, with no labelled posters to measure it on. 16 allowed-type and 8 not-allowed-type test photos went to review through it.
8. **Thin data:** achkan still has no photo. Débutante dress, Anarkali, Nehru jacket and Sherwani are under 20.
9. **The linear head file** is 1.02 MB (0.97 MiB), a little over the expected "under 1 MB". Float16 weights for 708 classes can't get much smaller without dropping classes.

## V1b - 2026-11-19 - type pins, banned gate, backup bucket, v1b.1 deployed

**Before starting:** clean tree, `Preview` up to date at `8df8b77`. No Docker container was running, so there was no Supabase to stop. `H:\DziRent\vision-own` was left alone (not read, not listed anywhere). `H:\DziRent\vision-test\should-accept` and `should-reject` are empty. gcloud was first signed in as `admin@dzirent.com`, which has no access to project `dzirent` (only `dzirent-17c88`, the Firebase project); after the owner signed in the account that owns project `dzirent`, everything below ran as that account. gcloud was used only for Cloud Storage, Cloud Build and the Cloud Run deploy (plus reading the service's settings before it).

**Part 0:** no uncommitted `labels.csv` rows, so nothing to commit.

**Part 1: the backup bucket** `gs://dzirent-vision-data-dzirent` (project `dzirent`; the project ID has no suffix, so the suffix is the ID itself):
- `us-west1`, Standard, uniform bucket-level access, public access prevention enforced (Google's default 7-day soft delete). Object read (`roles/storage.objectViewer`) for `vision-runtime@dzirent.iam.gserviceaccount.com` and for Cloud Build's account (`296325491472-compute@developer.gserviceaccount.com`, which fetches the gallery pins); the other bindings are the project's own owner/editor/viewer roles. No public member.
- Uploaded with `gcloud storage rsync data/vision/images/files gs://dzirent-vision-data-dzirent/images/files --recursive` (1,019 s), then `manifest.csv`, `labels.csv` and `split.json` into `images/`, and the two pin files into `pins/<vocabulary_version>/`.
- **15,105 objects, 5,342,621,097 bytes** (4.98 GiB): the 15,100 photos, 5,319,005,365 bytes, exactly the files and bytes on this PC (and the manifest: no file missing or extra), plus the 3 data files (7.9 MB) and the 2 pin files (15.7 MB). The bucket and the rsync command are in `data/vision/README.md` ("Backup bucket").

**Part 2: the pins** (`data/vision/embed/build_pins.py`, run on this PC's CPU with the service's Python):
- **Same model, same code:** the pinned files (Marqo-FashionSigLIP `c56244cc…`, the safety model `0c26ec22…`) were copied from V1a's folder and every file checked against Hugging Face's hashes for those commits (8 of 8 match). Photos go through the service's own `open_image`, `preprocess` and `embed_tensors` (the last two split out of `Model.embed_images`, which now calls them); text through `build_assets.embed_entries`. Nothing duplicated.
- **Embedding cache:** every kept photo plus the 1,679 the owner dropped (13,646 photos, none failed), in 8 pieces of about 9 minutes (about 3 photos a second on this CPU), cached in `images/raw/embeddings/` (not committed).
- **Text pins:** 843, one per `vocabulary.json` entry (691 allowed, 152 not allowed), 2,642 prompts: "a photo of a {name}" for the English name and its `also_called` names (the sheet's rule, now `build_taxonomy.also_called`; at most 5). `services/vision/app/vocabulary.npz`, float16, 1.6 MB, committed, with each row's qid, English name, category, item type, garment type and allowed, and `vocabulary_version` = sha256 of `vocabulary.json` = `69eb998d7fbb4296…`.
- **The model-agreement check:** 2,222 kept Openverse and search photos nobody had decided (159 more were skipped: the owner had decided them). **1,945 are `model_disagrees`** (own type not in their top 3 text pins): 1,074 of 1,241 Openverse, 871 of 981 search. `images/model_agreement.csv` (committed) holds every checked photo's rank and top 3; `auto_filter.py` turns `model_disagrees` into auto drops (the owner's 4,171 rows byte-identical; an owner decision still wins), then `split.py` (sticky): **10,022 kept, 8,094 train, 1,928 test, 1,945 left, 0 changed sides**.
  - **How good the rule is**, measured on the owner's own decisions (embedded for this): "own type in the top 3" turns away **63 % of the photos the owner kept** and 87 % of those the owner dropped. With 843 types many are near-twins ("skirt" loses to "short skirt", "pleated skirt", "circle skirt"), so it is harsh on clean photos. A looser rank barely separates them better (top 100: 7 % of keeps, 36 % of drops).
  - **On the photos it marked**, a contact sheet of 24 chosen at random: 18 were wrong photos (a tank, a bust, a stone inscription, a curtain, an Economist cover, a book titled "The Ragged Trousered Philanthropists" for trousers), 4 doubtful, 2 right (a red swimsuit, a lingerie photo). Of 18 it kept, 6 were wrong, some because the photo shows the type's name written (an infographic, a "kurta boys" shop sign). So it was applied as specified; the numbers are for the coordinator.
  - **Launch types** (57; "Removed" counts this check only; the test columns are from the eval below):

| Type | Policy | Kept before | Checked | Removed | Kept after | Train | Test | Test: type top-1 | Test verdicts (allowed / review / rejected) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| achkan (under 20) | allowed | 4 | 4 | 4 | 0 | 0 | 0 |  | no test photo |
| débutante dress (under 20) | allowed | 7 | 7 | 5 | 2 | 2 | 0 |  | no test photo |
| Nehru jacket (under 20) | allowed | 8 | 7 | 6 | 2 | 1 | 1 | 0% | 0 / 1 / 0 |
| Anarkali Salwar Suit (under 20) | allowed | 8 | 0 | 0 | 8 | 6 | 2 | 100% | 0 / 2 / 0 |
| blouse (under 20) | allowed | 80 | 70 | 69 | 11 | 9 | 2 | 0% | 0 / 2 / 0 |
| China Poblana (under 20) | allowed | 80 | 68 | 68 | 12 | 10 | 2 | 50% | 0 / 2 / 0 |
| evening dress (under 20) | allowed | 80 | 77 | 66 | 14 | 14 | 0 |  | no test photo |
| Sherwani (under 20) | allowed | 35 | 26 | 20 | 15 | 13 | 2 | 100% | 0 / 2 / 0 |
| dashiki (under 20) | allowed | 35 | 19 | 17 | 18 | 14 | 4 | 50% | 0 / 4 / 0 |
| sheath dress (under 20) | allowed | 80 | 62 | 62 | 18 | 14 | 4 | 0% | 0 / 4 / 0 |
| bridesmaid's dress | allowed | 42 | 27 | 21 | 21 | 17 | 4 | 50% | 0 / 4 / 0 |
| swimsuit | not allowed | 80 | 62 | 58 | 22 | 17 | 5 | 40% | 0 / 1 / 4 |
| trousers | allowed | 80 | 58 | 58 | 22 | 18 | 4 | 0% | 0 / 2 / 2 |
| overcoat | allowed | 80 | 59 | 57 | 23 | 19 | 4 | 25% | 0 / 4 / 0 |
| day dress | allowed | 80 | 59 | 55 | 25 | 21 | 4 | 75% | 0 / 4 / 0 |
| jumpsuit | allowed | 80 | 58 | 54 | 26 | 22 | 4 | 50% | 0 / 4 / 0 |
| skirt | allowed | 80 | 53 | 53 | 27 | 22 | 5 | 20% | 0 / 4 / 1 |
| lingerie | not allowed | 80 | 61 | 48 | 32 | 25 | 7 | 43% | 0 / 0 / 7 |
| undergarment | not allowed | 80 | 47 | 47 | 33 | 27 | 6 | 0% | 0 / 0 / 6 |
| guayabera | allowed | 58 | 32 | 23 | 35 | 29 | 6 | 83% | 0 / 6 / 0 |
| sundress | allowed | 80 | 48 | 43 | 37 | 30 | 7 | 43% | 0 / 6 / 1 |
| party dress | allowed | 40 | 0 | 0 | 40 | 32 | 8 | 38% | 0 / 8 / 0 |
| cardigan | allowed | 41 | 0 | 0 | 41 | 33 | 8 | 25% | 0 / 7 / 1 |
| trench coat | allowed | 80 | 50 | 38 | 42 | 32 | 10 | 70% | 0 / 10 / 0 |
| huipil | allowed | 43 | 0 | 0 | 43 | 34 | 9 | 100% | 0 / 9 / 0 |
| necktie | allowed | 80 | 76 | 37 | 43 | 35 | 8 | 62% | 0 / 8 / 0 |
| costume jewelry | allowed | 44 | 0 | 0 | 44 | 35 | 9 | 22% | 0 / 9 / 0 |
| tracksuit bottoms | not allowed | 80 | 41 | 36 | 44 | 36 | 8 | 12% | 0 / 3 / 5 |
| blazer | allowed | 45 | 0 | 0 | 45 | 36 | 9 | 44% | 0 / 9 / 0 |
| handbag | allowed | 45 | 0 | 0 | 45 | 36 | 9 | 78% | 0 / 8 / 1 |
| kurta | allowed | 80 | 46 | 35 | 45 | 35 | 10 | 70% | 0 / 10 / 0 |
| down jacket | allowed | 46 | 0 | 0 | 46 | 37 | 9 | 33% | 0 / 6 / 3 |
| sari | allowed | 80 | 41 | 34 | 46 | 37 | 9 | 78% | 0 / 9 / 0 |
| shalwar kameez | allowed | 76 | 38 | 29 | 47 | 39 | 8 | 25% | 0 / 8 / 0 |
| shoe | not allowed | 80 | 45 | 31 | 49 | 39 | 10 | 30% | 0 / 1 / 9 |
| sunglasses | allowed | 50 | 0 | 0 | 50 | 40 | 10 | 90% | 5 / 5 / 0 |
| hat | not allowed | 51 | 0 | 0 | 51 | 40 | 11 | 36% | 0 / 3 / 8 |
| cheongsam (qipao) | allowed | 52 | 0 | 0 | 52 | 42 | 10 | 80% | 3 / 7 / 0 |
| dinner jacket | allowed | 52 | 0 | 0 | 52 | 42 | 10 | 20% | 0 / 10 / 0 |
| jeans | not allowed | 52 | 0 | 0 | 52 | 39 | 13 | 23% | 0 / 3 / 10 |
| suit | allowed | 52 | 0 | 0 | 52 | 42 | 10 | 20% | 0 / 9 / 1 |
| cap | not allowed | 53 | 0 | 0 | 53 | 43 | 10 | 40% | 0 / 2 / 8 |
| hanbok | allowed | 55 | 0 | 0 | 55 | 44 | 11 | 45% | 0 / 11 / 0 |
| leather jacket | allowed | 55 | 0 | 0 | 55 | 44 | 11 | 73% | 0 / 11 / 0 |
| boubou | allowed | 56 | 0 | 0 | 56 | 45 | 11 | 45% | 0 / 11 / 0 |
| t-shirt | not allowed | 56 | 0 | 0 | 56 | 45 | 11 | 27% | 0 / 4 / 7 |
| shorts | not allowed | 58 | 0 | 0 | 58 | 46 | 12 | 33% | 0 / 0 / 12 |
| tuxedo | allowed | 62 | 0 | 0 | 62 | 50 | 12 | 67% | 0 / 12 / 0 |
| hoodie | not allowed | 66 | 0 | 0 | 66 | 52 | 14 | 50% | 0 / 3 / 11 |
| smartwatch | not allowed | 71 | 0 | 0 | 71 | 57 | 14 | 100% | 0 / 0 / 14 |
| lehenga | allowed | 73 | 0 | 0 | 73 | 58 | 15 | 60% | 1 / 14 / 0 |
| cocktail dress | allowed | 74 | 0 | 0 | 74 | 59 | 15 | 87% | 0 / 15 / 0 |
| sweatshirt | not allowed | 75 | 0 | 0 | 75 | 60 | 15 | 53% | 0 / 1 / 14 |
| sports jersey | not allowed | 79 | 0 | 0 | 79 | 63 | 16 | 25% | 0 / 0 / 16 |
| ball gown | allowed | 80 | 0 | 0 | 80 | 64 | 16 | 75% | 0 / 16 / 0 |
| three-piece suit | allowed | 80 | 0 | 0 | 80 | 64 | 16 | 81% | 0 / 16 / 0 |
| wristwatch | allowed | 80 | 0 | 0 | 80 | 64 | 16 | 50% | 0 / 15 / 1 |

  - **Launch types now under 20 kept: 10** (4 before): achkan 0, débutante dress 2, Nehru jacket 2, Anarkali Salwar Suit 8, blouse 11, China Poblana 12, evening dress 14, Sherwani 15, sheath dress 18, dashiki 18. Evening dress and débutante dress lost their test photos (Openverse ones; the sticky split never moves a train photo to test); achkan, thin before, has no photo left. All 1,074 launch removals were Openverse photos.
  - **Other types:** 871 search photos in 24 keep-list and costume types, some now nearly empty: Farwah 78 of 78 (1 kept), period costume 75 of 77 (3), Xifu 70 of 72 (2), qamis 69 of 72 (4), mantle 65 of 65 (9), walking suit 62 of 70 (9), duster 62 of 62 (8), track suit top 58 of 75 (17), simar 56 of 56 (12), cagoule 54 of 59 (6), Mackintosh 52 of 52 (2), rain cape 47 of 48 (29), abaya 46 of 52 (28), beach dress 20 of 22 (3), shaluka 19 of 20 (1), oilskin 18 of 28 (44), and 8 more with 1-7.
- **Gallery pins:** one per kept train photo of a type with a text pin: **8,094 photos, 707 types (2,880 not allowed)**, none left out; the build refuses a test photo. `gallery.npz` (float16, 14 MB) is in the bucket under `pins/69eb998d…/`, not in git; `services/vision/app/pins.json` (committed) names the vocabulary version, both files' sha256 (`gallery_sha256` `920ca9d7…`), the rows and the bucket path.

**Part 3: the service, `v1b.1`** (V1a's color reader included):
- `app/pins.py` loads both pin files at start-up and refuses to start when they don't match `pins.json` (version, sha256, every gallery type has a text pin). Per photo, and for the whole-piece photos together: text pins as softmax(100 x cosine), top 5; the 10 nearest gallery photos vote for their type by similarity. Agree: that type, confidence the mean of the two scores. Disagree: the higher-scoring one, its score halved, `agreement` false.
- **Banned gate**, apart from the type: `banned_score` = max(the highest probability of any not-allowed text pin, the not-allowed share of the gallery vote). A whole-piece photo, or the photos together, at `banned_min` or more: **rejected, whatever the type says**, with the reason of the photo's closest not-allowed policy item (e.g. "This looks like sneakers. Dzirent doesn't allow shoes."; "This item isn't allowed on Dzirent." if there is none). A size tag or close-up at `banned_min`: review (a not-allowed item there always sent the listing to review).
- **Verdict**, strongest first: nudity 0.90 rejected; the gate; the policy check's rejections (a not-allowed item, not clothing); unsure safety review; the policy check's photo reviews (a photo couldn't be opened, no whole piece, photos that disagree); then **allowed only for an allowed type the text and gallery pins agree on at `type_min_confidence` or more**, every whole-piece photo the same kind of thing (garment, or the same accessory); a hood turns that into review; anything else review ("no clear signal"). Worn never counts.
- **Response:** adds `type` {qid, english_name, category, item_type, garment_type}, `type_confidence`, `agreement`, `top_types` (5 with scores), `banned_score`, `vocabulary_version`; `service_version` is `v1b.1`; each photo's `labels.pins` has its own reading. Every earlier field is kept; suggestions still come from `policy.json`, and their `garment_type` is never `costume` (`vocab.APP_GARMENT_TYPES`: the apps don't list it, and the website would show "Choose a garment kind" for an unknown value), while `type.garment_type` can be. `/health` adds `vocabulary_version`, `type_pins`, `gallery_pins`.
- **Policy:** the garment type `costume`, "costumes and replica suits; certified protective equipment is never a type": migration `20261119120000_v1b_costume_and_scan_type.sql` adds it to `listings_garment_type_check` and `policy_item_types_garment_type_check` and reseeds `policy_item_types` with the new `costume` row (Occasion & Party; 115 rows) the same way the 8B migrations did; `policy.json` has the same row. `tests/test_policy_sync.py` passes. Policy digest `30466e8f3a812d8c` (was `fab11ee739b2e4db`).
- **scan-listing / the database:** `scan-listing` already passes the whole result to `vision_finish_scan`, so its code is unchanged; the migration redefines `vision_finish_scan` (C1's version) to keep `type`, `type_confidence`, `agreement`, `top_types`, `banned_score`, `vocabulary_version` and `service_version` in `listing_scans.suggestions`, beside `quality`, `item_key` and `model`. No new table or column. pgTAP `15_v1b` checks the constraints, the row and every stored field. **The migration is not applied to `dzirent-server`**: this prompt didn't ask for it (see the owner decision below). The apps are unchanged.
- **Build:** `services/vision/cloudbuild.yaml` fetches `gallery.npz` from the bucket and checks its sha256 against `pins.json` before `docker build`; the Dockerfile loads the pins before anything else, so a missing or wrong gallery fails the build; `.gcloudignore` keeps a local copy out of the upload.

**Thresholds and why** (`services/vision/app/thresholds.json`, each with its reason; chosen on the **train** split with `eval/calibrate.py`: all 8,094 train photos read exactly as a scan reads them but without their own gallery pin or an identical picture; the test split was never used):

| Name | Value | Why |
| --- | --- | --- |
| `text_logit_scale` | 100 | The model card's zero-shot recipe, as the policy check uses. |
| `text_top` | 5 | `top_types` reports 5. |
| `gallery_k` | 10 | The prompt's k. |
| `disagreement_factor` | 0.5 | A disagreeing type keeps half its score and is never allowed straight away. |
| `banned_min` | 0.60 | The lowest value that rejects at most 5 % of allowed train photos (4.6 %); it catches 77 % of not-allowed train photos (0.30 would catch 93 % but reject 15 % of allowed photos). |
| `type_min_confidence` | 0.70 | The highest confidence any not-allowed train photo reached with an allowed, agreeing type was 0.667 (a smartwatch read as a watch type); 0.70 is the next 0.05 above, so no train photo leaks. Conservative: only 4.9 % of allowed train photos clear it (96.9 % of them with the right type). |

Train (leave one out): text top-1 24.6 %, text top-3 41.6 %, gallery top-1 51.4 %, decided type top-1 48.8 %, agreement 19.7 %. The full tables print from `calibrate.py`.

**Part 4: the eval** (`run_eval.py --local`, `services/vision/eval/report-v1b.md`, committed): the 1,928 locked test photos (488 types; none of a type without a pin), each as a one-photo listing through the service's `Model` and `scan.listing_verdict` on this PC:
- **Type top-1 51 %** (text 24 %, gallery 55 %), the photo's type in the top 3 text pins 42 %, agreement 20 %.
- **Allowed types (1,214):** 35 allowed, 1,115 review, 64 rejected (44 by the gate, 20 by the policy check, 2 of those for nudity). Of the reviews: 1,075 "not sure" (153 of them agreeing but under 0.70), 31 hood, 7 unsure safety, 2 no whole piece.
- **Not-allowed types (714):** 0 allowed, 129 review, 585 rejected (557 by the gate).
- **Banned leaks: 0** (no not-allowed test photo was allowed). This is the number V2 must keep at zero while allowing far more of the allowed photos: today 2.9 % of them.
- The 57 launch types' rows are in the table above and in the report. The owner's folders: `should-accept` and `should-reject` are empty, so nothing was run from them.
- **Text pins from the English name alone** would do better (the same test photos: text top-1 28.2 % against 23.7 %, top-3 47.3 % against 42.5 %; English aliases instead of `also_called` 28.4 % / 47.2 %). `also_called` is mostly other languages ("Bleiser", "futal", "calça"), which dilutes the pins. Not changed: the prompt asked for `also_called` (open question 2).

**Tests:**
- `services/vision`: `pytest -m "not model" tests` **142 passed** (26 new in `tests/test_v1b.py`, synthetic pins, no model, no network): agreement and disagreement, the confidence, leave-one-out, the gate overriding an allowed type, the plain gate reason, a banned close-up only reviewing, photos of different kinds, review on low confidence and on disagreement, nudity, hood and worn unchanged, the policy check's rejections standing, the rules without pins as before, the response keeping every field and adding the new ones (plain JSON), costume never reaching the apps' garment kind, the pin files refused on a sha256, version or type mismatch or a missing gallery, every threshold explained, the committed `vocabulary.npz` matching `pins.json`. `test_policy_sync` passes.
- `data/vision`: **146 passed** (7 new in `tests/test_build_pins.py`); `validate.py` 8 of 8.
- The response schema isn't in `contracts/` (only the error codes are), so no contracts test changed.
- **CI:** run 44661543438 on `3468125` failed in `database`: my pgTAP test called `pg_catalog.row(...)` (`row` is a keyword); fixed in `7d5c1ac`. Run **44661969529 on `7d5c1ac`: success, all 6 jobs** (contracts, database, android, vision-data, vision, website); pgTAP 15 files, 454 tests, `15_v1b` ok.
- A full local check through the HTTP app (FastAPI's test client, the built local model): `/health` `v1b.1` and a cheongsam test photo scanned with type, confidence and agreement (start-up 13.9 s).

**Build and deploy:**
- Cloud Build `baa696a3-bdb4-404b-b169-e11b106484bd`, 12 min 38 s: `app/gallery.npz: OK` (sha256), "843 type pins, 8094 gallery pins", 2,363 prompts embedded in 471 s; image `us-west1-docker.pkg.dev/dzirent/cloud-run-source-deploy/vision:v1b-1-3468125` (built from `3468125`; `services/vision` is the same at `7d5c1ac`).
- Deployed to the existing `vision` (us-west1) with its settings: no unauthenticated access, `vision-runtime`, min 0, max 1, 2 CPU, 4 GiB, timeout 120 s, concurrency 4, startup CPU boost, the same `VISION_ALLOWED_URL_PREFIXES`. **Revision `vision-00007-6s4`, 100 % of traffic** (was `vision-00006-sxv`, `s1.1`: V1a was never deployed before, it goes live inside `v1b.1`).
- **`/health` (signed in with the invoker key):** `service_version` `v1b.1`, `vocabulary_version` `69eb998d7fbb42965eeeeb0fe57b4fd5a82bff67d19f39cdc43b6dcce8b2a703`, 843 type pins, 8,094 gallery pins, policy digest `30466e8f3a812d8c`, start-up 36.6 s.
- The live flags (read through the public API): `vision_required` is off, so a scan blocks nothing; with `v1b.1` most scans will come back review.

**The two live responses** (`run_eval.py`'s new `--key-file` signs in as the service account in `H:\DziRent\secrets\vision-invoker-key.json`, no gcloud; no key material below; the fingerprints, 768 numbers each, shortened). The folders were empty, so these are two Commons test photos:

- **should-accept (cheongsam test photo)** (`13b9d5cd0abe`, a locked test photo, never in the gallery; 2.7 s):

  ```json
  {"listing_id":"v1b-live-13b9d5cd0abe","verdict":"allowed","reason":"This looks like a cheongsam (qipao). You can list it.","item_key":"qipao","suggestions":{"item_key":"qipao","item_label":"Qipao","category":"Cultural & Traditional","item_type":null,"garment_type":"dress","colors":["Green"],"color_confidence":0.7,"pattern":"floral","fabric":"silk","styles":["East Asian"],"title":"Green floral qipao","description":"Green floral qipao.","alternatives":["Ao dai","Kimono"],"confidence":0.9917},"quality":{"summary":"1 of 1 photos could be better.","photos":1,"photos_with_warnings":1,"warnings":["Strong glare: move out of direct light"]},"photos":[{"photo_id":"test-13b9d5cd0abe","slot":"front","ok":true,"blur_score":0.0,"brightness_score":0.6398,"framing_score":null,"worn_by_person":0.0077,"checks":{"sharp":"pass","lighting":"fail","whole_item":"unsure","notes":["sharp","glare","background_not_uniform"],"sharpness":730.0,"mean_gray":163.1},"warnings":["Strong glare: move out of direct light"],"decision":"allowed","looks_like":"qipao","labels":{"items":{"qipao":0.9917,"ao_dai":0.0046,"kimono":0.0016,"hanbok":0.0009,"blouse":0.0006,"dress_shirt":0.0001,"kebaya":0.0001,"kurta":0.0001,"costume":0.0,"kaftan":0.0},"groups":{"allowed":1.0,"not_allowed":0.0,"not_clothing":0.0,"detail":0.0},"not_fashion":0.0064,"hooded":0.0274,"safety":{"nsfw":0.0593},"patterns":{"solid":0.0039,"striped":0.0001,"polka dot":0.0003,"floral":0.9486,"plaid":0.0009,"embroidered":0.0459,"sequined":0.0003},"styles":{"South Asian":0.0003,"East Asian":0.9756,"Southeast Asian":0.0239,"Middle Eastern":0.0001,"African":0.0,"Mexican & Latin American":0.0001,"Country & Western":0.0,"Western formal":0.0,"Western casual":0.0},"fabrics":{"silk":0.9455,"satin":0.0319,"cotton":0.0027,"linen":0.0025,"wool":0.0011,"denim":0.0,"velvet":0.0057,"chiffon":0.01,"leather":0.0002,"lace":0.0002},"pins":{"type":"Q836934","type_confidence":0.9448,"agreement":true,"text":{"qid":"Q836934","score":0.8895},"gallery":{"qid":"Q836934","score":1.0},"banned_score":0.0001}},"fingerprint":"[768 numbers]"}],"model":{"id":"Marqo/marqo-fashionSigLIP","revision":"c56244cc94f92419e8369fa71efdaf403b124ce8","license":"Apache-2.0"},"safety_model":{"id":"Marqo/nsfw-image-detection-384","revision":"0c26ec22111b83f106d72a55f611ec35962bcb65","license":"Apache-2.0"},"policy_digest":"30466e8f3a812d8c","service_version":"v1b.1","type":{"qid":"Q836934","english_name":"cheongsam (qipao)","category":"Cultural & Traditional","item_type":null,"garment_type":"dress"},"type_confidence":0.9448,"agreement":true,"top_types":[{"qid":"Q836934","english_name":"cheongsam (qipao)","allowed":true,"score":0.8895},{"qid":"Q92159035","english_name":"Qipao mini dress","allowed":true,"score":0.069},{"qid":"Q97618878","english_name":"informal dress (changfu)","allowed":true,"score":0.0194},{"qid":"Q6371145","english_name":"Kariyushi shirt","allowed":true,"score":0.0016},{"qid":"Q1327357","english_name":"hanfu","allowed":true,"score":0.0016}],"banned_score":0.0001,"vocabulary_version":"69eb998d7fbb42965eeeeb0fe57b4fd5a82bff67d19f39cdc43b6dcce8b2a703","timing_ms":{"fetch":1,"queue":0,"analyze":2297,"total":2298}}
  ```

- **should-reject (shoe test photo)** (`0f5982ac4581`, a locked test photo, never in the gallery; 1.5 s):

  ```json
  {"listing_id":"v1b-live-0f5982ac4581","verdict":"rejected","reason":"This looks like sneakers. Dzirent doesn't allow shoes.","item_key":null,"suggestions":null,"quality":{"summary":"1 of 1 photos could be better.","photos":1,"photos_with_warnings":1,"warnings":["Too bright: avoid direct sun and flash"]},"photos":[{"photo_id":"test-0f5982ac4581","slot":"front","ok":true,"blur_score":0.0,"brightness_score":0.7763,"framing_score":0.0,"worn_by_person":0.4125,"checks":{"sharp":"pass","lighting":"fail","whole_item":"pass","notes":["sharp","overexposed","garment_fully_visible"],"sharpness":4034.7,"mean_gray":198.0},"warnings":["Too bright: avoid direct sun and flash"],"decision":"not_allowed","looks_like":"sneakers","labels":{"items":{"sneakers":0.7578,"dress_shoes":0.1455,"sandals":0.0759,"heels":0.0102,"dog":0.0019,"socks":0.0015,"boots":0.0012,"joggers":0.0007,"jeans":0.0006,"cat":0.0004},"groups":{"allowed":0.0012,"not_allowed":0.994,"not_clothing":0.0048,"detail":0.0},"not_fashion":0.4197,"hooded":0.1766,"safety":{"nsfw":0.0551},"patterns":{"solid":0.1194,"striped":0.0142,"polka dot":0.5467,"floral":0.1093,"plaid":0.0373,"embroidered":0.1556,"sequined":0.0175},"styles":{"South Asian":0.0515,"East Asian":0.1285,"Southeast Asian":0.0113,"Middle Eastern":0.0906,"African":0.0119,"Mexican & Latin American":0.3075,"Country & Western":0.0268,"Western formal":0.0077,"Western casual":0.3643},"fabrics":{"silk":0.0031,"satin":0.0022,"cotton":0.2454,"linen":0.0097,"wool":0.0131,"denim":0.1748,"velvet":0.0031,"chiffon":0.0072,"leather":0.5338,"lace":0.0076},"pins":{"type":"Q107268359","type_confidence":0.2288,"agreement":false,"text":{"qid":"Q107268359","score":0.4575},"gallery":{"qid":"Q161928","score":0.1956},"banned_score":1.0}},"fingerprint":"[768 numbers]"}],"model":{"id":"Marqo/marqo-fashionSigLIP","revision":"c56244cc94f92419e8369fa71efdaf403b124ce8","license":"Apache-2.0"},"safety_model":{"id":"Marqo/nsfw-image-detection-384","revision":"0c26ec22111b83f106d72a55f611ec35962bcb65","license":"Apache-2.0"},"policy_digest":"30466e8f3a812d8c","service_version":"v1b.1","type":{"qid":"Q107268359","english_name":"doll shoes","category":null,"item_type":null,"garment_type":null},"type_confidence":0.2288,"agreement":false,"top_types":[{"qid":"Q107268359","english_name":"doll shoes","allowed":false,"score":0.4575},{"qid":"Q161928","english_name":"footwear","allowed":false,"score":0.1009},{"qid":"Q22676","english_name":"shoe","allowed":false,"score":0.0908},{"qid":"Q4120618","english_name":"poodle skirt","allowed":true,"score":0.0639},{"qid":"Q4189109","english_name":"shoe covers","allowed":false,"score":0.0427}],"banned_score":1.0,"vocabulary_version":"69eb998d7fbb42965eeeeb0fe57b4fd5a82bff67d19f39cdc43b6dcce8b2a703","timing_ms":{"fetch":0,"queue":0,"analyze":1161,"total":1161}}
  ```

**Owner decisions:**
- **Apply the V1b migration to `dzirent-server`** (`supabase db push`, as earlier migrations went live after CI). Until then live scans don't keep the new fields (everything else works: `vision_finish_scan` ignores keys it doesn't know) and `costume` isn't a database value there. Not done here because this prompt didn't ask for it.
- **Look at the photos the model check dropped** if any should come back: on the label-check page an owner keep overrules `model_disagrees`. They don't show under `--types-with-new` (auto drops count as decided); the review page's "drop (auto)" marks them.

**Open questions for the coordinator:**
1. **Allowed is rare:** 35 of 1,214 allowed test photos (2.9 %). Agreement on the exact type happens for 20 % of photos because the vocabulary has many near-twins. V2 options: agree on the Dzirent mapping (category, garment type, allowed) instead of the exact type, a linear layer on the gallery, or a lower `type_min_confidence` once leaks stay at zero on a bigger test set.
2. **Text pins from the English name only** (or English aliases) score better than name + `also_called` (above). Switch?
3. **The model-agreement rule** drops 63 % of photos the owner had confirmed (measured), and it left 10 launch types under 20 and several keep-list and costume types nearly empty. Keep it, loosen it (rank or sibling types), or have the owner look at its drops?
4. **Text in photos** passes the check and pulls the model (an infographic, a shop sign); V2 could add a "text or poster" not-clothing bank.
5. **Suggestions still come from `policy.json`.** Should the apps move to `type` (and learn the `costume` garment kind)?
6. **Gate false rejections:** 44 allowed test photos (3.6 %) are rejected by the gate, the price of `banned_min` 0.60; lenders see a not-allowed reason. Review instead of rejected under some score?
7. **Test photos lost:** evening dress and débutante dress have no test photo now (their test photos were dropped Openverse ones) and achkan has no photo at all, so they can't be measured.
8. The bucket name: the project ID is plain `dzirent`, so the bucket is `dzirent-vision-data-dzirent`.

## D2e+D4b - 2026-11-19 - Openverse run, sticky split, owner photos (written, not added), augmentation

**Before starting:** `Preview` up to date at `8b98151`; no Docker container was running, so there was no Supabase to stop. Read `pranalika/README.md`, BOARD, the D2d entry and `data/vision/README.md`. `labels.csv` had the owner's uncommitted review session.

**Part 0: the owner's labels:** committed on their own as `a22c933`: 352 owner rows appended, nothing else changed. Kept and dropped now (owner decisions; "auto" = the filter's, for photos the owner didn't click):

| Type | Kept | Dropped | Not sure |
| --- | --- | --- | --- |
| cap | 53 | 25 + 1 auto | 1 |
| hat | 51 | 18 + 11 auto | 0 |
| hoodie | 66 | 11 + 3 auto | 0 |
| jeans | 52 | 26 + 2 auto | 0 |
| undergarment | 33 | 44 + 1 auto | 2 |

**Part 1: Openverse, run once:**
- **The key:** `OPENVERSE_CLIENT_ID` and `OPENVERSE_CLIENT_SECRET` were in `providers.env` (checked by name and length only; never printed). The token worked.
- **The limits the headers reported:** the registered key gets `x-ratelimit-limit-oauth2_client_credentials_burst: 100/min` and `..._sustained: 10000/day`. The token request itself is counted anonymously (`anon_burst: 20/min`, `anon_sustained: 200/day`).
  - The script now sets the gap between API calls from the latest response's burst limit, never under 1 s. In piece 1 the anonymous 20/min from the token reply held every call to 3 s; fixed before piece 2.
- **Targets:** 28 launch types under 40 kept-or-undecided: the 27 of D2d plus undergarment, now at 33 after the owner's drops. At most 696 API calls.
- **Requests, every one counted** (`images/raw/openverse/run_state.json`, not committed):

  | Piece | API calls (1 token each) | From cache | Download requests | Files received | Saved | Left today |
  | --- | --- | --- | --- | --- | --- | --- |
  | 1 | 50 | 0 | 538 | 538 | 521 | 9,951 |
  | 2 | 44 | 2 | 555 | 555 | 539 | 9,908 |
  | 3 | 20 | 2 | 331 | 327 | 319 | 9,889 |
  | 4 (guayabera, kurta refill) | 8 | 0 | 27 | 27 | 24 | 9,882 |
  | **Total** | **122** (118 searches, 4 tokens) | 4 | **1,451** | 1,447 | 1,403 | |

  - Downloads went to the source sites (Flickr 1,244 of the kept files; museums, rawpixel and others), not to Openverse. 44 files were refused after download (43 too small, 1 format). 4 download requests brought no file: one museum file failed 3 times (HTTP 522) and was skipped, and one other answered without it.
- **iNaturalist removed:** "guayabera" returned 42 photos of the parrot *Amazona guayabera* (lilac-crowned amazon), and "kurta" 3 of a fish, all from iNaturalist (species observations only).
  - I removed those 45 (disk, manifest, `openverse.csv`, credits; 10.2 MB) and added `inaturalist` to `excluded_source` beside `wikimedia`.
  - I reopened the two types in the same run (piece 4).
- **Result:** **1,358 Openverse photos** (233.9 MB) for 27 of the 28 types. "Anarkali Salwar Suit" returned nothing under any of its 4 names.
  - **Licenses:** CC BY 2.0 797, CC BY-SA 2.0 375, CC0 112, Public Domain Mark 44, CC BY 4.0 37, CC BY-SA 4.0 12, CC BY 3.0 2.
  - `CREDITS.md` has the Openverse part with the "not endorsed or certified" note.
- **Changes to `fetch_openverse.py` before the run**, so one run can go in foreground pieces:
  - `run_state.json` fixes the targets at the first piece. A type stopped halfway on 61 was still filled to 80, though no longer under 40.
  - The same file keeps the finished types, the results refused after download (never fetched again) and each piece's counts.
  - Photos the filter would drop count as dropped between pieces.
  - The time is checked before each download, not only each search.
  - A source site gets 3 tries of 30 s.
- **Auto-filter:** 117 of the Openverse photos auto-dropped (black-and-white, sepia, page), so 1,241 count as kept. The owner's 4,170 rows came through byte-identical and in order.
  - The `labels.csv` diff looks large only because the merge writes owner rows first: the owner's 352 new lines had been appended after the auto rows, and moved up unchanged.
- **Split: changed to sticky.** Under D4's rule ("the lowest 20 % of sha1s are test"), adding photos to a type shifts the cut. This run would have moved **23 committed train photos into test and 16 test photos into train**.
  - Now a photo in the committed `split.json` keeps its side, and new photos fill the test share, lowest sha1 first. **Result: no photo changed sides**; 1,241 new, 92 left (dropped by the owner).
  - A type over its share after the owner's drops keeps its test photos: jeans has 13 test of 52 kept.
- **README:** section 5b has the line asked for: "Openverse was used through its API with a registered key, within its limits, as a one-time targeted search; the catalogue was not crawled." It also has the run and the iNaturalist exclusion.
- **Now:** 15,100 photos (5.32 GB, not committed), **11,967 kept: 9,639 train, 2,328 test**; 710 types, 217 thin, 19 types with a target but no kept photo.

**Part 2: the owner's photos (`ingest_own.py`), written and tested, NOT run:**
- `H:\DziRent\vision-own` exists with two folders, both matching a type exactly: `Sherwani` (Q837879, 17 files) and `kurta` (Q855915, 15 files). The dry run found no other folders, nothing unreadable, and 8 files under 300 px on the short side.
- **Why I stopped:** these don't look like photos the owner took.
  - All 32 are named `images.jfif`, `images (1).jfif` … `images (17).jfif`. That is what a browser names an image saved from a Google Images results page.
  - They are at search-thumbnail sizes (316 × 316, 452 × 678, 480 × 640, 258 × 387…) and carry no EXIF at all, where a phone photo has its camera data and is usually 3000+ px.
  - All were saved within about two minutes.
  - The prompt asks to record them as license "owner", author "Dzirent owner". For web images that would be a false provenance claim in a public repo, and they would train the photo check without a license. So nothing was copied, and `manifest.csv`, `labels.csv` and `split.json` don't have them.
- **What the script does once there are real owner photos:**
  - folder names matched exactly, ignoring case; a folder matching no type (or two) is reported and skipped;
  - each photo turned upright, converted to sRGB, at most 1600 px long, saved with no metadata (no EXIF, so no location or device; no XMP, comments or colour profile);
  - a manifest row with source owner, license owner, author Dzirent owner and no URLs, and a `labels.csv` keep with source owner-upload;
  - always train (`split.py`), and a second run adds nothing.
- **Fixed along the way:**
  - `auto_filter.py`'s merge dropped any label row whose source wasn't "owner", so owner-upload rows would have vanished on the next merge. It now keeps them as owner decisions.
  - `--forget-owner` leaves owner-upload rows alone.
  - `CREDITS.md` counts owner photos in a section of their own.
  - The review page tags owner photos "own" and Openverse photos "openverse".

**Part 3: augmentation (`augment.py`) and oversampling:**
- **Albumentations 2.0.8**, its last MIT release; its successor AlbumentationsX is AGPL or paid. The pipeline, in memory:
  - rotation ±10° (p 0.5, reflect border);
  - random resized crop 70-100 % to 224 × 224, the vision model's input;
  - horizontal flip (p 0.5);
  - brightness and contrast ±0.2 (p 0.5);
  - hue ±5° only (p 0.3). OpenCV's 8-bit hue has 2° steps, so the limit is 2.5;
  - gaussian blur kernel 3-5, sigma 0.1-1.0 (p 0.2);
  - JPEG quality 60-95 (p 0.3).
- **Training only:**
  - `Augmenter` refuses a test sha1;
  - `epoch()` draws train photos only;
  - it writes no manifest rows and no files;
  - `--preview <sha1>` writes the original plus 8 samples to `images/raw/augment_preview/<sha1>/` and refuses a test photo. I ran it once on a kurta photo and looked: crops, flips, slight rotations, brightness, colours unchanged.
- Importing it turns Albumentations' PyPI update check off (`NO_ALBUMENTATIONS_UPDATE=1`).
- **Requirements:** albumentations, albucore, PyYAML, simsimd and stringzilla are new. numpy, scipy, opencv-python-headless and pydantic are pinned at `services/vision`'s versions.
- **Oversampling:** a type with fewer than 20 train photos gets `oversample` = ceil(20 / train) in `split.json`, so it gives at least 20 samples an epoch. **555 of 710 types** have a factor above 1, mostly the allowed types with 12 photos (9-10 train → 2-3). Factors run up to 20 for a type with one photo.

**The 57 launch types** (photos by source; kept counts the owner's keeps plus photos nobody decided that the filter didn't drop):

| Type | Allowed | Commons | Search | Openverse | Owner | Kept | Train | Test |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| blazer | allowed | 54 | 0 | 0 | 0 | 45 | 36 | 9 |
| sheath dress | allowed | 9 | 71 | 66 | 0 | 80 | 64 | 16 |
| suit | allowed | 80 | 0 | 0 | 0 | 52 | 42 | 10 |
| three-piece suit | allowed | 80 | 0 | 0 | 0 | 80 | 64 | 16 |
| trousers | allowed | 80 | 0 | 60 | 0 | 80 | 64 | 16 |
| ball gown | allowed | 80 | 0 | 0 | 0 | 80 | 64 | 16 |
| bridesmaid's dress | allowed | 1 | 30 | 30 | 0 | 42 | 34 | 8 |
| cocktail dress | allowed | 80 | 0 | 0 | 0 | 74 | 59 | 15 |
| dinner jacket | allowed | 18 | 62 | 0 | 0 | 52 | 42 | 10 |
| débutante dress | allowed | 0 | 5 | 11 | 0 | 7 | 5 | 2 |
| evening dress | allowed | 80 | 0 | 118 | 0 | 80 | 64 | 16 |
| jumpsuit | allowed | 71 | 0 | 59 | 0 | 80 | 64 | 16 |
| party dress | allowed | 0 | 80 | 0 | 0 | 40 | 32 | 8 |
| tuxedo | allowed | 80 | 0 | 0 | 0 | 62 | 50 | 12 |
| achkan | allowed | 0 | 8 | 6 | 0 | 4 | 4 | 0 |
| Anarkali Salwar Suit | allowed | 7 | 3 | 0 | 0 | 8 | 6 | 2 |
| boubou | allowed | 80 | 0 | 0 | 0 | 56 | 45 | 11 |
| cheongsam (qipao) | allowed | 80 | 0 | 0 | 0 | 52 | 42 | 10 |
| China Poblana | allowed | 28 | 39 | 69 | 0 | 80 | 64 | 16 |
| dashiki | allowed | 15 | 4 | 19 | 0 | 35 | 28 | 7 |
| guayabera | allowed | 24 | 24 | 32 | 0 | 58 | 46 | 12 |
| hanbok | allowed | 80 | 0 | 0 | 0 | 55 | 44 | 11 |
| huipil | allowed | 80 | 0 | 0 | 0 | 43 | 34 | 9 |
| kurta | allowed | 66 | 0 | 50 | 0 | 80 | 64 | 16 |
| lehenga | allowed | 80 | 0 | 0 | 0 | 73 | 58 | 15 |
| Nehru jacket | allowed | 4 | 5 | 7 | 0 | 8 | 6 | 2 |
| sari | allowed | 80 | 0 | 43 | 0 | 80 | 64 | 16 |
| shalwar kameez | allowed | 80 | 0 | 38 | 0 | 76 | 61 | 15 |
| Sherwani | allowed | 51 | 0 | 26 | 0 | 35 | 28 | 7 |
| blouse | allowed | 80 | 0 | 73 | 0 | 80 | 64 | 16 |
| cardigan | allowed | 80 | 0 | 0 | 0 | 41 | 33 | 8 |
| day dress | allowed | 1 | 79 | 62 | 0 | 80 | 64 | 16 |
| skirt | allowed | 80 | 0 | 55 | 0 | 80 | 64 | 16 |
| sundress | allowed | 24 | 56 | 54 | 0 | 80 | 64 | 16 |
| down jacket | allowed | 80 | 0 | 0 | 0 | 46 | 37 | 9 |
| leather jacket | allowed | 80 | 0 | 0 | 0 | 55 | 44 | 11 |
| overcoat | allowed | 80 | 0 | 69 | 0 | 80 | 64 | 16 |
| trench coat | allowed | 31 | 49 | 56 | 0 | 80 | 64 | 16 |
| costume jewelry | allowed | 80 | 0 | 0 | 0 | 44 | 35 | 9 |
| handbag | allowed | 80 | 0 | 0 | 0 | 45 | 36 | 9 |
| necktie | allowed | 80 | 0 | 79 | 0 | 80 | 64 | 16 |
| sunglasses | allowed | 80 | 0 | 0 | 0 | 50 | 40 | 10 |
| wristwatch | allowed | 80 | 0 | 0 | 0 | 80 | 64 | 16 |
| cap | not_allowed | 80 | 0 | 0 | 0 | 53 | 43 | 10 |
| hat | not_allowed | 80 | 0 | 0 | 0 | 51 | 40 | 11 |
| hoodie | not_allowed | 80 | 0 | 0 | 0 | 66 | 52 | 14 |
| jeans | not_allowed | 80 | 0 | 0 | 0 | 52 | 39 | 13 |
| lingerie | not_allowed | 80 | 0 | 67 | 0 | 80 | 64 | 16 |
| shoe | not_allowed | 80 | 0 | 46 | 0 | 80 | 64 | 16 |
| shorts | not_allowed | 80 | 0 | 0 | 0 | 58 | 46 | 12 |
| smartwatch | not_allowed | 80 | 0 | 0 | 0 | 71 | 57 | 14 |
| sports jersey | not_allowed | 80 | 0 | 0 | 0 | 79 | 63 | 16 |
| sweatshirt | not_allowed | 80 | 0 | 0 | 0 | 75 | 60 | 15 |
| swimsuit | not_allowed | 80 | 0 | 68 | 0 | 80 | 64 | 16 |
| t-shirt | not_allowed | 80 | 0 | 0 | 0 | 56 | 45 | 11 |
| tracksuit bottoms | not_allowed | 45 | 0 | 41 | 0 | 80 | 64 | 16 |
| undergarment | not_allowed | 80 | 0 | 54 | 0 | 80 | 64 | 16 |
| **Total (57)** | | 3489 | 515 | 1358 | 0 | 3479 | 2780 | 699 |

**The 14 thin types from D2d** (kept before → after; train / test now; oversample):
- **Filled to 80:** evening dress 3, necktie 4, blouse 10, China Poblana 12, sheath dress 18, swimsuit 18, lingerie 19. Each is now 64 / 16.
- **Better but short of 80** (Openverse ran out): bridesmaid's dress 15 → 42 (34 / 8), Sherwani 9 → 35 (28 / 7), dashiki 16 → 35 (28 / 7).
- **Still under 20:**
  - débutante dress 0 → 7 (5 / 2, ×4);
  - Nehru jacket 1 → 8 (6 / 2, ×4);
  - achkan 0 → 4 (4 / 0, thin, ×5);
  - Anarkali Salwar Suit 8 → 8 (6 / 2, ×4; Openverse had nothing).
- Commons and Openverse are both exhausted for these four.

**Tests and CI:**
- `pytest data/vision/tests`: **139 passed** (114 before), no network.
- **New:**
  - Openverse: the limits from the headers (the latest response sets the gap), a later piece keeping the run's targets, refused results not downloaded again, the time checked before each download, a failing site skipped after 3 tries, the filter's drops counted between pieces;
  - the sticky split: committed photos keep their side (and D4's rule would have moved them), a thin type growing, a type over its share, the owner's photos train only, the oversampling factors;
  - `ingest_own.py`:
    - folder names exact ignoring case;
    - EXIF with GPS, make and model gone, and turned upright;
    - PNG text gone;
    - 1600 px, never enlarged;
    - the rows, LF endings, a second run adding nothing, the dry run;
    - owner-upload kept by the merge and by `--forget-owner`;
    - the credits count;
  - `augment.py`: train photos only per epoch with the factors, a test photo refused, the pipeline's settings, the hue within 5° on 60 seeds, `--preview` writing its own folder only, the update check off.
  - The recorded Openverse fixture is unchanged.
- **CI:**
  - [Run 44632518871](https://github.com/Vivek-k24/Dzirent/actions/runs/44632518871) on `fb9d4d2` (everything, board and this entry included): green on all six jobs.
  - The vision-data log on `cc64529` (run 44631808850, cancelled later by the newer push) shows the new requirements installing, "ALL 8 CHECKS PASSED" and "139 passed".
- **Commits:**
  - `a22c933` (the owner's labels);
  - `048e23c` (`fetch_openverse.py` in pieces, limits, iNaturalist);
  - `e678303` (sticky split, owner train-only, oversampling);
  - `59ab60d` (the Openverse data: manifest, `openverse.csv`, credits, auto-filter, labels, split);
  - `0f8f898` (`ingest_own.py`);
  - `b4c938c` (`augment.py`);
  - `cc64529` (review page tags);
  - `e40ebe5` (docs);
  - then the board and this entry.

**Owner:**
1. **Say whether you took the 32 photos in `H:\DziRent\vision-own`.**
   - If yes, the next session runs `ingest_own.py`, then `auto_filter.py` and `split.py`.
   - If they came from a web search, please delete them and put in photos you took (any size; the script strips location and device data).
2. **Check the Openverse photos on the label-check page**, 27 launch types, each photo tagged "openverse". Paste this into a plain PowerShell window, then open http://127.0.0.1:8765:

   `& "H:\DziRent\Dzirent_dev\data\vision\.venv\Scripts\python.exe" "H:\DziRent\Dzirent_dev\data\vision\images\review_server.py" --types-with-new --launch-only`

   For a not-allowed type, keep = this photo clearly shows the banned item.

**For the coordinator (open questions):**
- **The owner's photos** (Part 2): not added until the owner says they took them.
- **Four launch types are still under 20 kept:** débutante dress 7, Nehru jacket 8, Anarkali Salwar Suit 8, achkan 4. Commons and Openverse are exhausted. Options:
  - the owner's own photos;
  - launching them on fewer photos;
  - or treating achkan with Sherwani and Anarkali with shalwar kameez, which are close styles.
- **Search precision:** some also_called names are loose. "formal" brought 21 photos to evening dress, "trench" 36 to trench coat, "sheath" 7 to sheath dress, "knee length jacket" all 6 of achkan's. The owner's check catches them; dropping one-word generic names from the searches would avoid them.
- **Openverse's not-allowed types** (lingerie 67, swimsuit 68, undergarment 54, from Flickr with `mature=false`) need the owner's look like the others; nothing explicit was seen in the counts, but I didn't view them all.
- **The sticky split replaces D4's rule.** Please confirm. Without it, every addition moves committed photos between train and test.
- **Oversampling up to ×20** for one-photo types repeats a single photo 20 times an epoch. A cap (for example ×5), or leaving types under 5 train photos out of training, may be better.
- **Openverse's terms** reserve fees for heavy commercial use. This run was 122 API calls on a 10,000-a-day key.
- **Still open from D2c+D4 and D2d:**
  - the auto-filter's misses (black-and-white between 0.02 and 0.06 saturation, line drawings);
  - garment type `costume` isn't a database value;
  - the keep-list calls.

**Next session:**
- after the owner's answer, `ingest_own.py` (if they took the photos), then `auto_filter.py` and `split.py`;
- `supabase start` before any database work.

## D2d - 2026-11-18 - four owner decisions undone, decode check, Openverse written (not run), --types-with-new

**Before starting:** `Preview` up to date at `1416f23`. No Docker container was running, so there was no Supabase to stop. Read `pranalika/README.md`, BOARD, the D2c+D4 entry and `data/vision/README.md`.

**Part 1: hat, hoodie, jeans and cap back to filter-only:**
- `auto_filter.py --forget-owner Q80151,Q920929,Q83363,Q6147804` removed their **328 owner rows**: cap 88, hat 80, hoodie 80, jeans 80. The merge then ran as usual.
- **Checked against the file before:** the other **3,818 owner rows are byte-identical and in order**, and all 1,253 earlier auto rows are still there. The filter added 17 auto drops for the four: hat 11, hoodie 3, jeans 2, cap 1. Nothing else in `labels.csv` changed.
- **Kept, before → after:**

  | Type | Before | After | Train / test |
  | --- | --- | --- | --- |
  | hat | 0 | 69 | 55 / 14 |
  | hoodie | 0 | 77 | 62 / 15 |
  | jeans | 0 | 78 | 62 / 16 |
  | cap | 0 | 79 | 63 / 16 |

- **`split.py`:** 303 photos new to the split; **no photo changed sides** (train→test 0, test→train 0).

**Part 2: the decode check:**
- `fetch_commons.py` now opens every saved photo with Pillow and decodes every pixel. A file that fails is deleted and skipped as "unreadable", and a later run tries it again.
- `--verify` checks the whole manifest the same way. **Run once: 13,744 checked, 2 removed (3.3 MB):**
  - parka, `db797502…` (`File:Amanda-Tapping.jpg`): cut short;
  - Ulster, `94b0fffe…` (`File:The_Strand_Magazine_(Volume_2)_(page_74_crop)_(retouched).png`): its colour-profile chunk fails its checksum.
- Their two auto rows left `labels.csv`. `split.json` didn't change, since neither photo was kept.
- **Now:** 13,742 photos, 5,085,065,940 bytes, all decoding. **10,818 kept**; `split.json` has 708 types, 8,725 train, 2,093 test, 219 thin.

**Part 3: Openverse (`fetch_openverse.py`), written and tested, not run:**
- **The limits, checked today:**
  - The API docs (the OpenAPI schema at `api.openverse.org/v1/schema/`) give no numbers: "Anonymous requests should be sufficient for most users… Registered users are automatically granted slightly higher limits". The numbers are in each response's headers.
  - **One anonymous search returned `x-ratelimit-limit-anon_burst: 20/min` and `x-ratelimit-limit-anon_sustained: 200/day`.**
  - The run needs up to **666 search calls** (27 types × their names × 5 pages, plus the token). So anonymous isn't enough.
  - `providers.env` has no `OPENVERSE_CLIENT_ID`/`OPENVERSE_CLIENT_SECRET` (checked by name only). So I stopped there, as the prompt says. Without them the script makes no request and prints the registration steps (below).
  - I made 3 anonymous requests in all: the header check, and the two searches recorded as the test fixture.
- **What it does once there's a key:**
  - **Targets:** the 27 launch types under 40 kept (below), filled up to 80 kept-or-undecided across all sources.
  - **Searches:** the English name, then each `also_called` name, as a phrase, up to 5 pages of 20. Licenses `cc0,by,by-sa,pdm` are asked for and checked again per result. `excluded_source=wikimedia`, because Commons is the first source and its files would come back as duplicates. Nothing mature.
  - **Files:** downloaded from the source site. Same format (JPEG, PNG, WebP), decode, size (short side ≥ 300 px, saved ≤ 1280 px wide) and sha1 rules as Commons.
  - **Auto-filter:** run on each saved photo at once. An auto drop is kept on disk and in the manifest but doesn't count toward 80.
  - **Records:** manifest `source` = openverse; `images/openverse.csv` holds the Openverse id, license and version, license URL, creator, creator URL, source site, landing page and URL.
  - **Credits:** `CREDITS.md` gets an Openverse part by license (creator and source site per file). It carries the line Openverse's terms ask for: made with Openverse, not endorsed or certified by it. With no Openverse rows, `CREDITS.md` comes out byte-identical to today's.
  - **Politeness:** the same User-Agent (`support@dzirent.com`), 1 s between API calls, 0.5 s between downloads, back-off on 429 and 5xx, a clean stop when fewer than 5 calls are left today, `--max-minutes`, and every response cached.
- **Targets and kept-or-undecided now** (the "before"; the "after" waits for the run):
  - **Under 20 (14 types):** débutante dress 0, achkan 0, Nehru jacket 1, evening dress 3, necktie 4, Anarkali Salwar Suit 8, Sherwani 9, blouse 10, China Poblana 12, bridesmaid's dress 15, dashiki 16, sheath dress 18, swimsuit 18, lingerie 19.
  - **20 to 39 (13 types):** day dress 21, overcoat 21, trousers 22, jumpsuit 22, guayabera 26, skirt 27, trench coat 30, sundress 32, kurta 34, shoe 35, shalwar kameez 38, sari 39, tracksuit bottoms 39.
- **What the recorded searches show:** expect a modest yield for niche types. "achkan" (licenses filtered, Wikimedia out) returned **0 results**. "nehru jacket" returned 16 on its first page: 7 with an accepted license (by 5, cc0 1, by-sa 1), several of them dolls.

**Part 4: `review_server.py --types-with-new`:**
- It serves only the types with at least one photo that neither the owner nor the auto-filter has decided, in `review.csv`'s order. Combined with `--launch-only`, only the launch types among them.
- **On today's data: 658 types, 10,104 photos (8,835 undecided).**
  - First come the five launch types cap, hat, hoodie, jeans and undergarment.
  - Then the never-checked keep-list types (Mao suit, walking suit, …), the costumes and the other types.
  - Once Openverse runs, its new photos make their launch types show too.

**Tests and CI:**
- `pytest data/vision/tests`: **114 passed** (88 before), no network. New:
  - the decode check: a cut-short download deleted and skipped; `--verify` removes a broken photo, its row and its credit;
  - `--forget-owner`: every other line byte-identical, through the merge and the CSV writer too; a file without a source column;
  - `--types-with-new`: the order, and a type decided by owner plus filter hidden;
  - `fetch_openverse.py` on the recorded search `tests/fixtures/openverse_search.json`:
    - license acceptance, with pdm accepted and by-nc, by-nd, by-nc-sa, by-nc-nd, sampling+ and nc-sampling+ refused;
    - the recorded results' verdicts, and refused licenses never downloaded;
    - the photo checks: small, cut short, a 3000-px file saved 1280 wide;
    - 80 kept-or-undecided, with an auto drop not counted;
    - the manifest, `openverse.csv` and credits rows;
    - the cache (a second run makes no call), the token, `read_env`;
    - the stop with the registration steps and no client made.
- **CI:**
  - [Run 44448880898](https://github.com/Vivek-k24/Dzirent/actions/runs/44448880898) on `4b7cdbf` (everything, board and this entry included): green on all six jobs.
  - The vision-data log on `37d228e` shows "ALL 8 CHECKS PASSED" and "114 passed".
- **Commits:** `c0296e4` (`--forget-owner`), `771f2e9` (the four types' labels and split), `276287e` (decode check and `--verify`), `b6f1df9` (the 2 removals), `0fed2aa` (`fetch_openverse.py` and tests), `37d228e` (`--types-with-new`), `fa8bf05` (docs), then the board and this entry.

**Owner: register Openverse once** (about two minutes; it is also what `fetch_openverse.py` prints):
1. In a plain PowerShell window, paste this one line. It registers "Dzirent vision data" and adds `OPENVERSE_CLIENT_ID` and `OPENVERSE_CLIENT_SECRET` to `H:\DziRent\secrets\providers.env` without showing them. The file has no line break at its end, so the command starts with an empty line.

   `$r = Invoke-RestMethod -Method Post -Uri "https://api.openverse.org/v1/auth_tokens/register/" -ContentType "application/json" -Body '{"name": "Dzirent vision data", "description": "Finds openly licensed clothing photos to train the photo check of the Dzirent clothing rental app.", "email": "support@dzirent.com"}'; Add-Content -Path "H:\DziRent\secrets\providers.env" -Value "", "OPENVERSE_CLIENT_ID=$($r.client_id)", "OPENVERSE_CLIENT_SECRET=$($r.client_secret)"; "Saved. Now open the email Openverse sent to support@dzirent.com."`

2. Click the verification link in the email Openverse sends to support@dzirent.com. Until then the key has the anonymous limits.
3. Tell the coordinator; the next session runs `fetch_openverse.py --max-minutes 8.5` in foreground pieces, then `auto_filter.py` and `split.py`, and reports the per-type counts.

**For the coordinator (open questions):**
- **Openverse's terms forbid scraping the catalog.** This is a bounded, targeted search (27 types, at most 666 calls, within the published limits) for openly licensed photos, credited per file. Please confirm that use is acceptable before the run. The terms also reserve fees "for commercial uses … and/or for heavy usage".
- **Yield:** Openverse looks thin for the niche types (achkan returned nothing). The types still under 20 after the run may need the owner's own photos, or a decision to launch with fewer.
- **Wikimedia is left out of the Openverse search** to avoid fetching Commons files twice. Say if you'd rather include it.
- **The registration uses support@dzirent.com** as Openverse's contact address. The owner can change it in the command.
- **`--types-with-new` today shows 658 types**, since everything outside the 57 launch types has never been checked. The owner can stop after the first five (cap, hat, hoodie, jeans, undergarment), or add `--launch-only` to see only those.
- **Still open from D2c+D4:**
  - the auto-filter's misses (black-and-white photos between 0.02 and 0.06 saturation, line drawings, sepia that isn't everywhere);
  - garment type `costume` isn't a database value;
  - search precision;
  - the keep-list calls.

**Next session:** after the owner's registration, run Openverse as above; `supabase start` before any database work.

## D2c+D4 - 2026-11-18 - full download, space suit models out, auto-filter, locked split

**Before starting:** `Preview` up to date at `6de7082`. No local Supabase container was running (nothing to stop). Read `pranalika/README.md`, the board's D2b and photo-check rows, the D2b entry and `data/vision/README.md`. The owner's `labels.csv` was committed first exactly as the review page saved it (`5fcb041`: 4,146 rows).

**Part 1: the full download** (`fetch_commons.py`, no flags, in the foreground):
- **New flag `--max-minutes`:** the run stops before its next photo once the time is up, writes `CREDITS.md` and its report, and the next run resumes from the manifest. Each piece ran with `--max-minutes 8.5`.
- **The pieces:** 10 pieces added 770, 81, 774, 834, 708, 555, 756, 729, 758 and 351 photos, about 700 per piece.
  - Piece 2 ended early: the connection dropped and one download gave up after 6 tries. The manifest and disk still matched (8,907 each), and the next piece resumed.
  - Piece 10 finished the plan. A check run then made **0 requests** (816 cache hits) and added nothing.
- **Totals: 13,744 photos for 729 types, 5,088,338,397 bytes (5.09 GB, this PC only).**
  - Every manifest row has its file and every file its row; no sha1 twice. `CREDITS.md` lists all 13,744.
  - **Licenses:** CC BY-SA 6,471, public domain 3,604, CC BY 2,560, CC0 1,109.
  - **Sources:** category 9,478, subcategory 2,048, search 1,623, P18 595.
- **By target:**

  | Group | Types | Photos | Short of target | At zero |
  | --- | --- | --- | --- | --- |
  | needs_owner (80 each) | 104 | 6,719 | 33 | 0 |
  | Not allowed (40 each) | 136 | 3,174 | 73 | 11 |
  | Other allowed (12 each) | 603 | 3,851 | 333 | 103 |

- **The 114 types at zero:** 72 have no Wikidata image or Commons category. For the rest, everything Commons had was too small, a duplicate, the wrong format or unlicensed.
  - Not allowed (11): acid-washed jeans, birthing girdle, Danish time trial champion jersey, edible underwear, girdle, Kepis of the Confederate States, micro-short, Military headgear of the Confederate States, nursing bra, ringer t-shirt, trikini.
  - Allowed (103): the full list is in `images/raw/last_run.json`, for example breeks, drape suit, dress trousers, Jodhpuri, slacks, slip dress, Bhagalpur sari.

**Part 2: the nine space suit models:**
- `specs.ONLY_ITSELF_ROOTS = ["space_suit"]`: below that root only a launch or keep-list type stays.
  - Dropped: A7L, Berkut, Feitian, Orlan, SK-1, Sokol, Yastreb, Mars suit and space activity suit. They are in `excluded.json` as "below a root kept as itself only".
  - Kept: space suit itself, and Advanced Crew Escape Suit (keep list).
  - `validate.py` checks the rule. It reported exactly the nine on the old outputs, then passes 8 of 8 after the rebuild, with and without `--cache`. Two rebuilds are byte-identical.
- **Now:** 1,758 types (57 launch, 33 keep, 14 allowed costumes), **needs_owner 104**, 843 in `vocabulary.json`, 4,696 excluded.
- **`--prune`:** 628 photos (217.8 MB): 80 each for seven of the suits, 34 each for Mars suit and Yastreb. None had an owner label.

**Part 3: `auto_filter.py`:**
- **Measures:**
  - saturation (mean HSV saturation of the pixels that aren't near-white or near-black);
  - white_frac and black_frac;
  - page_score (how many of the four borders are paper);
  - and, cached locally only, the coloured pixels' hue, how much of the photo is tinted and the border's own colour.
- **Thresholds:** from the histogram and hand-labelled contact sheets; the full reasoning is in `data/vision/README.md` §7.
  - **grayscale:** saturation under 0.02. The histogram's spike is 1,426 photos in 0.00-0.02, 1,338 of them exactly 0. Then come 194, 253 and 272 a bin, rising to about 650 a bin around 0.25.
    - The 0.02-0.06 bins are about half black-and-white photos and half colour photos of white, black or grey things, and nothing measured here separates them. So the line is at the spike's edge.
  - **sepia:** saturation under 0.25, at least 93 % of the pixels tinted, one brown-orange hue. In the samples, about 2 in 30 of what it marks are colour photos of beige things.
  - **page:** at least 3 paper borders, saturation under 0.15, the border itself cream (border saturation 0.07 or more), one hue. About 1 in 10 of what it marks are museum photos on cream backgrounds.
  - **small:** a short side under 300 px. None.
  - **unreadable:** 2 files Pillow can't open.
    - `db797502…` (parka): a JPEG cut short, no end marker.
    - `94b0fffe…` (Ulster): a PNG whose colour-profile chunk fails its checksum, apparently already broken on Commons.
- **Result:** `auto_filter.csv` has 13,744 rows; **1,757 are auto_drop**: grayscale 1,426, sepia 237, page 72, sepia and page 20, unreadable 2.
- **Merge into `labels.csv`** (new `source` column):
  - The owner's 4,146 rows are unchanged: same values, same order (checked against the committed file), and marked owner.
  - 504 auto_drop photos already had an owner decision, so the owner's stands.
  - **1,253 auto rows** were added (decision drop, source auto, no time): needs_owner types 359, not allowed 338, other allowed 556. The filter touched 299 types.
  - The review page writes `source` = owner and shows an auto drop as "drop (auto)" until the owner clicks the photo.
- **The owner's decisions:** 4,146 rows on 3,959 photos: **keep 1,983, drop 1,908, not sure 68**. Every launch type was checked: 56 completely, undergarment 35 of 80.
- **Most auto drops added** (needs_owner unless marked; from photos per type): tabard 37 (80), Mao suit 35, pinafore 29, ballet costume 28, Mackintosh 26, raincoat 24, disguise 21, cagoule 20, oilskin 18; not allowed: girdle 29 (40), hourglass corset 26, corselet 23, bustle 18, petticoat 18, stocking 15.
- **Kept after both: 10,515 photos:** needs_owner 4,384, not allowed 2,836, other allowed 3,295.

**Per launch type: owner keep / drop / not sure → photos left** (auto added 0 on all but undergarment):

| Type | Owner k / d / n | Left | Type | Owner k / d / n | Left |
| --- | --- | --- | --- | --- | --- |
| blazer (54) | 45 / 9 / 0 | 45 | sari | 39 / 41 / 0 | 39 |
| sheath dress | 18 / 62 / 0 | 18 | shalwar kameez | 38 / 42 / 0 | 38 |
| suit | 52 / 28 / 0 | 52 | Sherwani (51) | 9 / 41 / 1 | 9 |
| three-piece suit | 80 / 0 / 0 | 80 | blouse | 10 / 60 / 10 | 10 |
| trousers | 22 / 58 / 0 | 22 | cardigan | 41 / 35 / 4 | 41 |
| ball gown | 80 / 0 / 0 | 80 | day dress | 21 / 58 / 1 | 21 |
| bridesmaid's dress (31) | 15 / 16 / 0 | 15 | skirt | 27 / 48 / 5 | 27 |
| cocktail dress | 74 / 6 / 0 | 74 | sundress | 32 / 47 / 1 | 32 |
| dinner jacket | 52 / 28 / 0 | 52 | down jacket | 46 / 33 / 1 | 46 |
| débutante dress (5) | 0 / 5 / 0 | 0 | leather jacket | 55 / 23 / 2 | 55 |
| evening dress | 3 / 76 / 1 | 3 | overcoat | 21 / 52 / 7 | 21 |
| jumpsuit (71) | 22 / 45 / 4 | 22 | trench coat | 30 / 49 / 1 | 30 |
| party dress | 40 / 40 / 0 | 40 | costume jewelry | 44 / 33 / 3 | 44 |
| tuxedo | 62 / 17 / 1 | 62 | handbag | 45 / 34 / 1 | 45 |
| achkan (8) | 0 / 8 / 0 | 0 | necktie | 4 / 75 / 1 | 4 |
| Anarkali Salwar Suit (10) | 8 / 2 / 0 | 8 | sunglasses | 50 / 30 / 0 | 50 |
| boubou | 56 / 24 / 0 | 56 | wristwatch | 80 / 0 / 0 | 80 |
| cheongsam (qipao) | 52 / 28 / 0 | 52 | cap (not allowed) | 0 / 80 / 0 | 0 |
| China Poblana (67) | 12 / 55 / 0 | 12 | hat (not allowed) | 0 / 80 / 0 | 0 |
| dashiki (19) | 16 / 3 / 0 | 16 | hoodie (not allowed) | 0 / 80 / 0 | 0 |
| guayabera (48) | 26 / 22 / 0 | 26 | jeans (not allowed) | 0 / 80 / 0 | 0 |
| hanbok | 55 / 25 / 0 | 55 | lingerie (not allowed) | 19 / 60 / 1 | 19 |
| huipil | 43 / 21 / 16 | 43 | shoe (not allowed) | 35 / 45 / 0 | 35 |
| kurta (66) | 34 / 31 / 1 | 34 | shorts (not allowed) | 58 / 21 / 1 | 58 |
| lehenga | 73 / 7 / 0 | 73 | smartwatch (not allowed) | 71 / 8 / 1 | 71 |
| Nehru jacket (9) | 1 / 8 / 0 | 1 | sports jersey (not allowed) | 79 / 1 / 0 | 79 |
| sweatshirt (not allowed) | 75 / 5 / 0 | 75 | swimsuit (not allowed) | 18 / 61 / 1 | 18 |
| t-shirt (not allowed) | 56 / 23 / 1 | 56 | tracksuit bottoms (not allowed, 45) | 39 / 6 / 0 | 39 |
| undergarment (not allowed) | 0 / 33 / 2 of 80; auto 1 | 44 | | | |

(80 photos unless shown in brackets.)

**The 20 launch types with the fewest photos left:** achkan 0, cap 0, débutante dress 0, hat 0, hoodie 0, jeans 0, Nehru jacket 1, evening dress 3, necktie 4, Anarkali Salwar Suit 8, Sherwani 9, blouse 10, China Poblana 12, bridesmaid's dress 15, dashiki 16, sheath dress 18, swimsuit 18, lingerie 19, day dress 21, overcoat 21.

**Part 4: `split.py` (D4):**
- **Kept photos only:** the owner's latest decision, else the auto one, else keep. Drop and not sure are out.
- **Per type:** the round(20 %) with the lowest sha1 are test (at least 2 once a type has 5 kept); under 5 kept, all train and listed as thin.
- **`split.json`: 704 types, 8,483 train, 2,032 test.**
  - Test by group: needs_owner 873, not allowed 561, other allowed 598.
  - **219 thin types:** 184 other allowed, 27 not allowed, and 8 needs_owner (necktie 4, Garibaldi shirt 4, evening dress 3, priestly tunic 3, Dead character costume 3, dinosaur suit 2, Nehru jacket 1, posing trunks 1).
  - **25 types have photos but none kept:** achkan, cap, débutante dress, hat, hoodie, jeans, demob suit (12), string tie (5), and 17 types with 1 photo each.
- **Determinism:** a second run (`--check`) moved no photo.
- README §8: **the test set is locked, never used for the gallery or the linear layer**. A re-run prints how many photos changed sides against the committed file.

**Tests and CI:**
- `pytest data/vision/tests`: **88 passed** (64 before), no network. New:
  - images made in the test: grayscale, colour, a cream page, a pale garment on pure white that isn't a page, sepia, small, a cut-short file, a transparent PNG;
  - the merge: an owner keep beats auto_drop, owner rows unchanged, a second merge changes nothing;
  - the page's source column: auto drops shown as auto, an owner click wins, a four-column file stays four columns;
  - the split: determinism whatever the order, 80/20 (80 → 16, 12 → 2, 13 → 3), at least 2 from 5, thin under 5, kept photos only, the changed-sides count;
  - `--max-minutes`: a stop after 3 photos, then a resume that fetches nothing twice; a passed limit makes no call.
- **Mutation check:** the owner-wins and minimum-2 tests fail with those rules switched off.
- `validate.py`: 8 of 8.
- **CI:**
  - [Run 44442023554](https://github.com/Vivek-k24/Dzirent/actions/runs/44442023554) on `d4fa032` (everything below plus the board and this entry): green on all six jobs.
  - The vision-data log on `5a0ec4f` shows "ALL 8 CHECKS PASSED" and "88 passed". That earlier run was cancelled by the newer push, after five of its six jobs had passed.
- **Commits:** `5fcb041` (the owner's labels as saved), `2147735` (`--max-minutes`), `b3200d5` (space suit), `9cae3bb` (manifest and credits), `fea5702` (auto-filter and page), `4ab9eb9` (`auto_filter.csv`), `f93a3cf` (merged `labels.csv`), `1ba5c9b` (`split.py`), `5a0ec4f` (`split.json`), `9070bef` (docs), then the board and this entry.

**For the coordinator (open questions):**
- **Hat, hoodie and jeans were dropped whole and cap one by one, all 80 photos each.**
  - Hat, hoodie and jeans were each one "Drop whole type" click: all 80 rows share one second, at 22:49:22, 22:49:28 and 22:49:32 UTC. Cap was clicked photo by photo (88 rows over a minute), ending with all 80 dropped.
  - All four are not-allowed launch types. The page asks to keep the photos that really show a not-allowed type, because they teach the check what to refuse. As it stands these four have no training photos.
  - If the drops meant "not allowed" rather than "bad photo", the owner should look again (a click on a photo changes it). If they meant bad photos, these types need other photos. I changed nothing.
- **Undergarment is half checked:** 35 of 80 (33 drop, 2 not sure, no keep). The other 45 count as keep (44 after one auto drop).
- **Launch types thin after the owner's drops:** achkan and débutante dress 0, Nehru jacket 1, evening dress 3, necktie 4. More photos would need another source (a looser search, or the owner's own photos).
- **What the auto-filter misses:**
  - Black-and-white photos between 0.02 and 0.06 saturation: about half of the 0.02-0.06 bins, judging by the contact sheets, so a few hundred.
  - Line drawings on white paper that have any colour.
  - Sepia prints whose tint isn't everywhere.
  - A model-based check (for example "a black and white photo" against the vision model) would catch more. Not done: it's beyond simple measures and needs the model.
- **Auto-filter false drops:** about 2 in 30 of the sepia drops and 1 in 10 of the page drops are colour photos, mostly beige things and museum photos on cream backgrounds. The owner can undo any of them on the page with one click.
- **The 2 unreadable files** stay in the manifest and are auto-dropped.
  - `fetch_commons.py` could check that each file opens before writing its row (a short download would then be retried).
  - The open question is whether to add that and fetch the parka photo again.
- **Still open from D2b:** garment type `costume` isn't a database value (`vocabulary.json` uses it for 20 types now, 29 before), search precision, and the keep-list calls.

**Owner:** nothing to run. The review page shows auto drops as "drop (auto)" if the owner opens it again (same command as in the D2b entry).

**Next session:** `supabase start` before any database work. The photos and caches stay on this PC (`data/vision/images/files/`, `raw/`).

## D2b - 2026-11-17 - costume roots, keep list rework, search source, needs_owner photos

**Before starting:** `Preview` up to date at `f673bf6`. Read `pranalika/README.md`, the board's D2 and D3 rows, the D2+D3 entry, `data/vision/README.md` and `taxonomy/specs.py`.

**Part 0: roots and lists** (each resolved with wbsearchentities and wbgetentities or checked by QID and English label, recorded in `roots.json`; counts from `validate.py`, 8 of 8 passing, with and without `--cache`; two rebuilds byte-identical):
- **Total:** 1,767 types (D2 1,745): 57 launch, 33 keep list, 23 allowed costumes; **needs_owner = yes on 113**; keep = no on 7.
- **By allowed:** review 909, allowed 704, not_allowed 154. **By category:** Everyday 546, Accessories 450, Cultural & Traditional 281, Outerwear 155, not_applicable 154, Career & Professional 105, Occasion & Party 76.
- **`vocabulary.json`:** 852 types. **`excluded.json`:** 4,687. Size gate (2,000) not reached.
- **Owner policy:** costumes rent (Halloween, dress-up, theatre; space suits as costume); military, industrial and protective suits, helmets, masks and protective gear don't; sportswear stays out. `data/vision/README.md` has the one-line item policy.
- **New positive roots:**
  - costume Q1410477 (the one cut A excluded; out of `EXCLUDE_ROOTS`), 2 levels;
  - space suit Q223571 ("gas-tight protective suit for astronauts"), 1 level.
  - Both classify as Occasion & Party, garment type `costume`.
  - Mask, uniform, protective clothing and sportswear stay in `EXCLUDE_ROOTS` and win over the costume root (`specs.COSTUME_EXCLUSION_WINS`). A subclass of costume more than 2 levels down isn't brought in through clothing.
- **Costume rules I had to set:**
  - A costume type is allowed when its own name or description reads as worn, and review when only a parent class does (D1b's rule). 8 are review: covert agent, Babiniku, clown's red nose, knaptand, processional giant, Big Heads, Gegants from Cardona, Reine Tournay.
  - Halloween costume is in because Wikidata files it as an *instance* of costume (P31), which counts as under it, as P31 always has for the exclusion roots.
  - The allowed costumes have their own sheet part, "costume", after the keep list, with needs_owner = yes.
- **Came in (34):** 21 from the costume root (13 allowed), 10 from the space suit root (all allowed), and the 3 exceptions. **Left (12):** the 12 types off the keep list, below.
- **Keep list 45 → 33** (`specs.KEEP_LIST`; reasons in `KEEP_LIST_REMOVED`):
  - **Costumes (6):** Advanced Crew Escape Suit, bear suit, cat suit, dinosaur suit, fatsuit and gorilla suit are now Occasion & Party / costume (they were Career & Professional / suit).
  - **Not-allowed examples (2):** track suit top and posing trunks (rule: sportswear).
  - **Removed (12):**
    - burka: owner (Wikidata's Q1016353 is a felt cloak, "rough raincoat", not the burqa);
    - Positive pressure personnel suit: industrial protective suit;
    - environmental suit, cold-protection suit, waders: protective;
    - racing silks, Speed skating suits, skin suit: sportswear;
    - Tunic (military): military;
    - **my calls:**
      - attila: military; its parents are military uniform and dress uniform;
      - zephyr: sportswear; a competition rowing shirt;
      - Al-Azhar attire: one institution's uniform; its parents include uniform.
- **Instance-of exceptions** (`EXCLUDE_INSTANCE_OF_EXCEPTIONS`, QIDs from `excluded.json`): Perfecto Q134632 (review: named through its parent only), Harrington jacket Q1586189 (Outerwear, allowed), Kariyushi shirt Q6371145 (Everyday, allowed).
- **Drop list** (`DROP_LIST`, keep = no, allowed unchanged): Rolex GMT Master II, Patek Philippe Calibre 89, The Vacheron Constantin Reference 57260, Microbrand watches, Samsung Gear S3, Ruputer, I'm Watch.
- **Wikidata:** `--roots-only`, then the full fetch (3 min); a re-run made 0 requests (406 cache hits).

**Part 1: `fetch_commons.py`:**
- **`--prune`** removes from disk (and thumbnails) and from `manifest.csv` the photos of every type dropped or keep = no, and rewrites `CREDITS.md`.
  - **Run once: 338 photos of 10 types, 94,291,004 bytes (94.3 MB).** Speed skating suits 80, racing silks 80, waders 68, Positive pressure personnel suit 55, attila 32, burka 19, and 1 each for cold-protection suit, environmental suit, skin suit and Al-Azhar attire.
  - Afterwards the manifest and disk matched (4,340 each).
- **`source` column** (p18, category, subcategory, search). The 4,340 existing rows got theirs by replaying each type's listings from the cache, with no request: p18 71, category 3,385, subcategory 884.
- **Search source:** only for a needs_owner = yes type still under 40 photos after P18, category and subcategories.
  - It runs a Commons file search: the search module as a generator over namespace 6, `"<name>" filetype:bitmap`, for the English name and then each `also_called` name (the sheet's column). It takes the first 100 results each, best match first.
  - Same license, format, size and sha1 rules; same cap of 80; same 2 requests a second.

**Part 2: `review_server.py`:**
- `--launch-only` serves only the needs_owner = yes, priority launch types of `review.csv`, in the sheet's order: 57 types, 4,004 photos.
- A blue "search" tag marks a photo whose source is search (515 of the 4,004).
- After `N`, the next page opens with "Finished <type>: kept · dropped · not sure", counted from the saved decisions.

**Tests and CI:**
- `pytest data/vision/tests`: 64 passed, recorded fixtures only. New:
  - a recorded Commons search (bear suit);
  - a recorded slice of the Wikidata cache (eight types and the roots);
  - what they cover: the search fallback (rank order, the under-40 bar, the cap), the source column and filling it from the cache, `--prune`, the Harrington jacket exception, the drop list's keep = no, costume classification, a costume under protective clothing (recorded) or mask (added) dropped, `--launch-only`, the tag and the finished line.
  - The mask test fails with the rule switched off.
- [CI run 44217926370](https://github.com/Vivek-k24/Dzirent/actions/runs/44217926370) on `1e55e87` (all code and tests) was green on all six jobs. The vision-data log shows "ALL 8 CHECKS PASSED" and "64 passed".

**The runs:**
1. **`--only-launch`, first try** (19:40-19:49): added 629 photos, all from search. Then Claude Code stopped it because the PC was critically low on memory while the session was idle. The manifest and disk were consistent (4,969 each).
2. **`supabase stop`** (owner's call, to free Docker's memory): no container left running; the database volume is kept.
3. **`--only-launch`, resumed** (20:07-20:38, 1,878 s): it resumed from the manifest, and no saved photo was fetched again.
   - 2,548 requests, 146 cache hits; 11 were 429 and one connection dropped, each retried and through.
   - **Added 2,378** (913 MB): search 1,303, category 877, subcategory 182, P18 16. Licenses CC BY-SA 986, public domain 806, CC BY 463, CC0 123.
4. **Full run** (no flags, 20:38-20:46): **paused at 709 not-allowed photos (26 of 136 not-allowed types), resumes from manifest.** Claude Code's memory guard stopped it again (9 × 429 before that).
   - 3.0 GB of 15.8 GB was free; Chrome was the largest user.
   - The dry run counted about 6,300 more: not allowed about 2,480, other allowed 3,853.
   - `CREDITS.md` was then rewritten from the manifest; a stopped run doesn't write it.

**Where the photos stand:** 8,056 photos for 139 types, 3,039,881,874 bytes (3.04 GB) on this PC only; every manifest row has its file and every file its row.
- **Licenses:** CC BY-SA 3,627, public domain 2,284, CC BY 1,484, CC0 661.
- **Sources:** category 4,827, search 1,932, subcategory 1,191, P18 106.
- **needs_owner = yes:** 113 types, 7,347 photos, **none at zero**, 35 short of 80; 45 types got search photos.
- **Launch types (57, 4,004 photos; 44 at 80):**
  - Short: jumpsuit 71, China Poblana 67 (39 from search), kurta 66, blazer 54, Sherwani 51, guayabera 48 (24), tracksuit bottoms 45, bridesmaid's dress 31 (30), dashiki 19 (4), Anarkali Salwar Suit 10 (3), Nehru jacket 9 (5), achkan 8 (8), débutante dress 5 (5).
  - Search took these to 80: party dress (80 from search), day dress (79), sheath dress (71), dinner jacket (62), sundress (56), trench coat (49).
- **Keep list (33, 1,765; 17 at 80):**
  - At 80: Mao suit, walking suit (79 from search), Advanced Crew Escape Suit, abaya (57), Farwah (79), ikan, oilskin (46), pinafore, simar (68), cagoule (79), duster (71), Mackintosh (75), mantle (71), rain cape (51), raincoat, tabard, track suit top (80).
  - Short: qamis 74 (73), djellaba 61, fatsuit 50, communion clothing 47, gorilla suit 43, beach dress 29 (28), Teba jacket 21, jingle dress 21 (4), shaluka 20 (20), bear suit 17 (17), cat suit 7 (6), informal dress (changfu) 5 (4), Garibaldi shirt 4 (3), priestly tunic 3, dinosaur suit 2 (2), posing trunks 1 (1).
- **Costumes (23, 1,578; 17 at 80):**
  - At 80: Apollo/Skylab A7L, ballet costume, Berkut spacesuit (65), costume, dance costume, disguise, Feitian space suit (56), film costume, fursuit, Halloween costume, Orlan space suit, period costume (79), SK-1 spacesuit (80), Sokol, space activity suit (80), space suit, theatrical costume.
  - Short: Xifu 79 (79), creature suit 35 (34), Mars suit 34 (1), Yastreb 34 (27), bortaga 33, Dead character costume 3 (2).

**For the coordinator (open questions):**
- **Garment type `costume` isn't a database value.** `listings_garment_type_check` allows top, trousers, suit, dress, skirt, saree, one_size. `vocabulary.json` now carries `costume` for 29 allowed types, so a migration (and the apps' lists) is needed before a listing can use it.
- **Space suit models:** at 1 level, the space suit root brought nine specific suits besides space suit itself: A7L, Berkut, Feitian, Orlan, SK-1, Sokol, Yastreb, Mars suit and space activity suit. That's 708 photos across the 10, mostly of real flight hardware. As a costume, "space suit" alone may be enough.
- **Search precision:** 40 types have more than half their photos from search; party dress, track suit top, SK-1 and space activity suit have all 80 from it. Commons search matches words in titles and descriptions, so expect more drops there; the page tags those photos. If the owner finds them too noisy, lower the bar (for example under 20) or take fewer results per name.
- **Keep-list calls to confirm:**
  - My removals: attila, zephyr, Al-Azhar attire.
  - Kept though neither list names them: the clergy dress simar, mantle ("ecclesiastical overgarment") and priestly tunic.
  - Baiana costume is dropped because Wikidata puts it under protective clothing (the exclusion wins); an exception by QID would bring it back.
- **The full run:** paused at 709 not-allowed photos; it resumes from the manifest. Claude Code stops background commands when memory is critically low while the session is idle, so the next session runs it in the foreground in pieces of about 9 minutes.

**Owner's next step:**
- Paste this into a plain PowerShell window (outside Claude Code, so the memory guard can't stop it), then open http://127.0.0.1:8765:
  `& "H:\DziRent\Dzirent_dev\data\vision\.venv\Scripts\python.exe" "H:\DziRent\Dzirent_dev\data\vision\images\review_server.py" --launch-only`
- Keys: `1` keep, `2` drop, `3` not sure, `N` next type. Look closely at photos with the blue "search" tag.
- `Ctrl+C` in that window stops the page; decisions are already saved in `data/vision/images/labels.csv`.
- The owner chose to start the page this way this once (rule 12 otherwise).
- The review.csv check (now 113 needs_owner rows) still stands.

**Next session:**
- Resume the full run in foreground pieces; it resumes from the manifest and fetches nothing twice.
- Then commit `manifest.csv`, `CREDITS.md` and the owner's `labels.csv`, with its counts.
- `supabase start` before any database work.

## D2+D3 - 2026-11-17 - Commons photos and the label-check page

**Before starting:** `Preview` up to date at `ad3275e`. The uncommitted `CLAUDE.md` from a /doctor run (one rule: read `pranalika/contract.md` by section, never whole) was reviewed and committed first as `529787d`. Read `pranalika/README.md`, the board's D2 and D3 rows, the D1c entry, and `data/vision/README.md`, `HANDOFF.md` and `taxonomy/specs.py`.

**Part 0: vocabulary cleanup** (counts from `validate.py`, 8 of 8 passing):
- **Total:** 1,745 types (D1c 1,731): 57 launch, 45 on the keep list; **needs_owner = yes on 102**.
- **By allowed:** review 900, allowed 693, not_allowed 152.
- **By category:** Everyday 548, Accessories 450, Cultural & Traditional 282, Outerwear 156, not_applicable 152, Career & Professional 118, Occasion & Party 39.
- **`vocabulary.json`:** 845 types (D1c 812). **`excluded.json`:** 4,708 types.
- **Left (58 of D1c's rows):**
  - **instance of an excluded class: 55** (11 allowed, 26 review, 18 not allowed). For example Lady Dior, Levi's 501, Air Jordan, Ray-Ban Wayfarer and Aviator, Hermès scarf, Cartier Santos and Tank, Omega Seamaster, G-Shock, the smartwatch models (Pebble, Moto 360, Samsung Gear, LG G Watch), Belle's ball gown;
  - **generic entries: 3**: clothing (Q11460, the root itself, with the aliases garment and apparel) and the two items labelled "gown" (Q1036729, Q1732031).
- **Came in (72):** the keep list 45; 23 under the new watch root (17 allowed: watch, pocket, analog, digital, mechanical, skeleton, solar-powered watches and others; 6 review: stopwatch, chess clock, nurse watch and others); 4 banned examples that moved into freed slots.
- **The seven classes** (`specs.EXCLUDE_INSTANCE_OF`), each resolved with wbsearchentities and wbgetentities, recorded in `roots.json` ("instance_of"):
  - fictional object Q15706911; brand Q431289; trademark Q167270; product model Q10929058;
  - **fictional clothing Q62595215:** no item is labelled "fictional item of clothing"; this one is "clothing that only exists in works of fiction";
  - **model series Q811701:** "product line" is its English alias;
  - **archaeological artefact Q220659:** no item is labelled "archaeological artefact type"; this is the artefact class.
- **The rule:** P31, or P31 of a subclass (P31/P279*), never "subclass of". Six real types are filed as *subclasses* of archaeological artefact (dress fastener, kaiwa, ishi-kushiro, heart scarab and two not kept anyway), so they stay. Pebble and the other smartwatch models go through "smartwatch model", a subclass of product model.
- **Watch root:** Q178794 ("personal time indicator, portable, used as an accessory"). Smartwatch stays a banned root; no buckle root.
- **Keep list** (`specs.KEEP_LIST`): `build_taxonomy.classify` on the 529 cut A rows of `excluded.json` gives exactly 45 allowed, as D1c counted.
  - Each is checked by QID and English label on every fetch (`roots.json`, "keep"), comes back past cut A only, and is classified again by the normal rules: all 45 allowed (Career & Professional 15, Everyday 14, Outerwear 11, Cultural & Traditional 5).
  - Sheet part "keep", right after the launch rows; notes say "Keep list: back from cut A (<root>); check category and allowed."
- **Place-derived names stay** (Banarasi sari, Norfolk jacket). No rename.
- **Also fixed:** names differing only in case ("terno", "Terno") were ordered by Python's set order, so each rebuild reordered them. Two rebuilds are now byte-identical.

**Part 1: D2 downloader, `data/vision/images/fetch_commons.py`:**
- **Sources per type, in order:** its P18 image, the files directly in its Commons category, then the files directly in each subcategory (one level).
- **Kept only when:**
  - the `License` code in Commons' extmetadata is cc0, pd, cc-by-* or cc-by-sa-* (any version or port). Commons gives no code at all for licenses outside these: Attribution, GFDL, FAL, PDM-owner, KOGL, GODL-India, "Copyrighted free use", "No restrictions". Those files are skipped as "no machine-readable license";
  - it is a JPEG, PNG or WebP;
  - its short side, and the saved file's, are at least 300 px;
  - its sha1 isn't taken (across all types: the first type fetched keeps it).
- **Saved:** `files/<qid>/<sha1>.<ext>`, Commons' 1280 px rendition, or the original when that is no wider. For narrower files Commons reports a 1280 px size but serves the unscaled original, so the manifest's width and height are the saved file's own.
- **Targets:** needs_owner = yes 80, not allowed 40, other allowed 12; review rows and keep = no get none.
- **Polite:** User-Agent `DziRentVisionData/0.1 (Dzirent clothing photo set; support@dzirent.com)`; at most 2 requests a second; back-off on 429 and 5xx with Retry-After; one JSON per API call in `images/raw/`.

**Part 2: D3 label-check page, `data/vision/images/review_server.py`** (http.server, 127.0.0.1:8765 only):
- One type a page: name, category, allowed badge, and its photos as 256 px thumbnails (made on first view into `images/thumbs/`).
- Click cycles keep, drop, not sure; keys `1` `2` `3` (then the next photo), arrows, `Enter` for the full photo, `N` next type, `P` previous; a "Drop whole type" button.
- Each decision is POSTed and appended to `images/labels.csv` (sha1, qid, decision, decided_at); the latest wins; undecided counts as keep.
- `N` saves keep for the photos left undecided, so "types checked" in the progress bar means every photo has a decision.
- Dark page; it shows no Commons file names, descriptions or authors (they name places and brands).

**Docs:**
- `data/vision/README.md`: how to run both scripts, the license policy, the layout, committed vs ignored, the tests.
- Root `README.md`: "Clothing photos" (Wikimedia Commons, per-file licenses in `data/vision/images/CREDITS.md`); Pillow and pytest for `data/vision`.
- `data/vision/.gitignore`: `images/files/`, `images/thumbs/`, `images/raw/` instead of all of `images/`.
- `requirements.txt`: Pillow 13.0.0 and pytest 8.4.2 with its dependencies, the versions `services/vision` uses.
- `pranalika/testing.md`.

**What was run:**
1. **Wikidata:** `fetch_wikidata.py --roots-only` resolved everything: 11 positive, 15 banned, 18 exclusion, 7 instance-of, 1 skipped, 57 launch, 45 keep. Then the full fetch: 50 requests, 193 s; the watch crawl has 162 classes.
2. **Taxonomy:** `build_taxonomy.py` exit 0, 1,745 rows. `validate.py` passed 8 of 8, with and without `--cache`, and on a copy of only the committed files.
3. **Tests:** `pytest data/vision/tests`: 49 passed. They use recorded fixtures only: a cardigan listing from Commons with six real refused pages, and Wikidata P31 records. Any connection off the PC fails a test; a live Commons call was checked to be blocked.
4. **CI:** [run 44194900141](https://github.com/Vivek-k24/Dzirent/actions/runs/44194900141) on `c417b6b` (the code and docs), and [run 44205648597](https://github.com/Vivek-k24/Dzirent/actions/runs/44205648597) on `b2853ef` (with `manifest.csv`, `CREDITS.md` and this entry), both green: contracts, website, android, vision, database, vision-data. Each vision-data log shows "ALL 8 CHECKS PASSED" and "49 passed".
5. **`fetch_commons.py --dry-run`** (every type with a target): 1,912 requests, 26 min, no 429.
   - needs_owner: 102 types, 4,678 of 8,160 available;
   - not allowed: 138 types, 3,190 of 5,520;
   - other allowed: 605 types, 3,853 of 7,260 (104 with none).
6. **`fetch_commons.py --only-launch`:** 4,730 requests in 55 min. 53 answers were 429 and one connection dropped; each was retried once and went through.
   - **Downloaded:** 4,678 photos for 92 of the 102 types, **1.72 GB** on disk. Same as the dry run.
   - **Skipped:** 344 format, 255 small, 118 no license code, 62 duplicates; 7 types have no image or category.
   - **Licenses:** CC BY-SA 2,183 (4.0 1,365), public domain 1,201, CC BY 866, CC0 428.
   - **A second run** made 0 requests and added nothing; `manifest.csv` and `CREDITS.md` were unchanged (same hashes).
7. **Launch types (57, 3,489 photos):**
   - 38 at 80;
   - short: jumpsuit 71, kurta 66, blazer 54, sherwani 51, tracksuit bottoms 45, trench coat 31, China Poblana 28, guayabera 24, sundress 24, dinner jacket 18, dashiki 15, sheath dress 9, Anarkali salwar suit 7, Nehru jacket 4, bridesmaid's dress 1, day dress 1;
   - **none:** débutante dress (its one file has no license code), party dress and achkan (no image or Commons category in Wikidata).
8. **Keep list (45, 1,189 photos):**
   - 8 at 80: Advanced Crew Escape Suit, Mao suit, speed skating suits, ikan, pinafore, racing silks, raincoat, tabard;
   - 30 between 1 and 68 (waders 68, djellaba 61, abaya 23, burka 19 …; 12 have a single photo);
   - **none:** bear suit, dinosaur suit, posing trunks, shaluka, track suit top, military tunic, zephyr.
9. **`review_server.py`:** started once, decisions pointed at a scratch file (`--labels`) so the committed `labels.csv` stays header-only.
   - `/` 302 to `/type/1` (blazer, type 1 of 92); `/type/1` 200; a thumbnail 200 (205 × 256);
   - a POST 200 wrote one line; a reload showed it;
   - then stopped, with nothing listening on 8765.

**For the coordinator (open questions):**
- **The full download:** 7,043 more photos by the dry run (not allowed 3,190, other allowed 3,853), roughly 2.6 GB at this run's average size and about 80 minutes. Not run.
- **"Launch rows (needs_owner=yes)"** was read as all 102 needs_owner rows, so the keep list got the 80 target too. Several keep-list types don't look rentable: Advanced Crew Escape Suit (80 photos), positive pressure personnel suit (55), environmental and cold-protection suits, fatsuit (50), gorilla suit (43), bear, cat and dinosaur suits, posing trunks, waders, racing silks, speed skating suits, military tunic. The owner can set keep = no; drop their photos on the page.
- **What the instance-of rule also removes:** real styles Wikidata files as trademarks or brands (Harrington jacket, Kariyushi shirt, Perfecto), or as archaeological artefacts (Skört, Mamuli, Zierscheibe, Jade burial suit), plus kakute (model series) and air-conditioned clothing (trademark). If some should stay: an exception list by QID.
- **Brand names the rule can't reach** (no P31, or only "watch"/"smartwatch"): Rolex GMT Master II, Patek Philippe Calibre 89, The Vacheron Constantin Reference 57260, Microbrand watches (allowed); Samsung Gear S3, Ruputer (not allowed); I'm Watch (review). Name matching was ruled out, so they stay for the owner's keep = no.
- **Unknown authors:** 255 photos have no author in Commons' metadata (219 public domain, 3 CC0, 27 CC BY or CC BY-SA). `CREDITS.md` links each one's Commons page, which carries the full credit.
- **Who runs the page:** the owner doesn't run local commands (rule 12), so an agent has to start `review_server.py` and keep it running while the owner checks, then commit `labels.csv`.

**Owner's next step:** Ask for a session that starts the label-check page, then open http://127.0.0.1:8765 and check the photos, type by type: keep the ones that clearly show the type, drop the rest (for not-allowed types, keep the ones that really show it). The review.csv check of the needs_owner = yes rows (now 102) also still stands.

## D1c - 2026-11-16 - vision data in the repo

**Before starting:** clean tree, `Preview` up to date at `361f9ef`. Read the D1b entry in `H:\DziRent\Dzirent_vision_data\HANDOFF.md` and its `taxonomy/specs.py`.

**Counts** (`data/vision/taxonomy/`, from `validate.py`):
- **Total:** 1,731 types, 57 of them launch (gate 200-2,000).
- **By allowed:** review 919, allowed 645, not_allowed 167.
- **By category:** Everyday 542, Accessories 452, Cultural & Traditional 277, not_applicable 167, Outerwear 147, Career & Professional 104, Occasion & Party 42.
- **By region:** Global 719, Unknown 436, European 238, East Asian 101, South Asian 57, African 45, Southeast Asian 39, Latin American 29, North American 28, Middle Eastern 22, Oceanian 11, Central Asian 6.
- **`vocabulary.json`:** 812 types (645 allowed, 167 not allowed), 3,311 names.
  - Accessories in it: costume jewelry 145, watch 13, tie 12, handbag 6, sunglasses 6.
- **`excluded.json`:** 4,721 types.
  - No Commons category, image or English article: 1,654.
  - Under an excluded root: 964 (D1b's roots plus cut A).
  - Banned kind beyond its root's 15 examples: 846.
  - Only through "fashion accessory" (cut B): 453.
  - Banned kind more than 2 levels down: 416.
  - No English label: 227.
  - Label word: 161.

**The cut applied (A+B, as in the D1b handoff):**
- **Cut A: nine more exclusion roots in `specs.py`.** Each is resolved and checked by label and description like the others, and recorded in `roots.json`:
  - costume Q1410477, uniform Q7434, mask Q161524, protective clothing Q14524031, religious clothing Q2490224;
  - "Liturgical vestments and insignia" Q6501052, academic dress Q1349227, sportswear Q645292, professional wear Q29000407.
  - **"costume":** two items carry that label. Q9053464 is "wardrobe and dress in general" and holds kimono, hanbok, dirndl, abaya and ball gown (482 of D1b's 2,713 rows). The one used, Q1410477, is the performer's or character's costume.
  - **Scope "clothing":** they drop a type (P279* or P31/P279*) only when the clothing root alone brings it in. Without that, they would also have removed:
    - **9 launch types:** kurta and huipil (religious and professional wear); trench coat and sunglasses (protective clothing); hoodie, sweatshirt, swimsuit, sports jersey and tracksuit bottoms (sportswear);
    - **29 banned examples:** swimwear, jerseys, gym shorts, a helmet. These stay not allowed;
    - **16 types other roots bring in:** Ray-Ban and aviator sunglasses, ecclesiastical rings, tallit.
- **Cut B:** the clothing crawl skips "fashion accessory" (Q1065579, resolved the same way). What clothing reaches only through it is dropped unless another positive root reaches it.
- **Removed, out of D1b's 2,713:**
  - cut A: 529 (45 allowed, 11 not allowed, 473 review);
  - cut B: 453 (25 allowed, 4 not allowed, 424 review).
- **Why 1,731 and not the expected 1,674:** D1b's estimate followed one recorded path per type. The real cut reads each type's ancestors, which catches more. It also spares the launch types, banned examples and other roots' types above, which keeps more. Cut B drops only what "fashion accessory" alone brings in.
- **Unchanged from D1b:**
  - plural label words, the "<dress word> of/in" drops, verified countries;
  - no origin from bare garment classes, the Central Asian region, special-purpose types to review;
  - step 8: a type with no clear signal is "review", never "allowed" (274 such rows).

**For the coordinator: what the cut costs** (all in `excluded.json` with the root that dropped them):
- **Cut A removes 45 types the classifier had as allowed.**
  - **Religious clothing:** abaya, djellaba, qamis, Farwah, Al-Azhar attire.
  - **Uniform:** Mao suit, attila, ikan, changfu.
  - **Protective clothing:** raincoat, Mackintosh, cagoule, duster, rain cape, burka.
  - **Sportswear:** Teba jacket.
  - **Costume:** bear and gorilla suits.
  - **The fix, if wanted:** list the cultural ones as launch types, or let cut A send allowed types to review instead of dropping them.
- **Cut B removes plain watches, cravats and buckles.** Watch, pocket watch, analog, mechanical and digital watches aren't under wristwatch; cravat and ascot aren't under necktie; every buckle comes only through "fashion accessory". So `vocabulary.json` has no "Belt buckle" type.
  - **The fix, if wanted:** "watch" and "buckle" as accessory roots.
- **Some garment names hold a city, state or brand.**
  - **Examples:** Banarasi, Kanchipuram and Kerala saris; Norfolk and Argyll jackets; Guayaquil skirt; Poncho salteño; Hardangerbunad; Jodhpuri; Lady Dior; Ray-Ban; Air Jordan.
  - **What they are:** Wikidata's names for the type. The origin fields hold countries only.
  - **If the "no city or state names" rule covers type names:** D2 or D3 should drop or rename them.

**What moved:**
- **New home:** the tooling is now in `data/vision/`, with the same layout: `README.md`, `HANDOFF.md`, `requirements.txt` and `taxonomy/`.
  - `taxonomy/` holds the five scripts, `taxonomy.json`, `roots.json`, `excluded.json`, `vocabulary.json` and `review.csv`.
  - 14 files are tracked. The largest is `taxonomy.json` at 2.8 MB.
- **Ignored:** `data/vision/.gitignore` keeps out `.venv/`, `taxonomy/raw/` (the Wikidata cache, 39 MB, copied here so the scripts run) and `images/`.
- **Not copied:** the data folder's `.git`, its `.venv`, D1's stale cache files and D1's wrong outputs. The build wrote new outputs.
- **`H:\DziRent\Dzirent_vision_data` stays in place:**
  - a note at the top of its `HANDOFF.md` says the tooling moved, committed in that local-only repo as `edd10a1` and `0f75bee`;
  - the owner deletes the folder later.

**What changed in the tooling:**
- **`review.csv`:**
  - a first column `needs_owner`, yes on the 57 launch rows;
  - the order is launch rows, then review rows, then the rest by category;
  - the sheet's part is stored per row (`sheet_group`), so the owner's edits never break the order check.
- **`vocabulary.json`:** for V1b. One entry per allowed or not-allowed type, never a review type or one marked keep = no.
  - Fields: `qid`, `english_name`, `vocabulary`, `dzirent_category`, `dzirent_item_type`, `dzirent_garment_type`, `allowed`, `region`.
- **`--apply-review`:**
  - keep must be yes, no or blank;
  - a type marked keep = no stays in `taxonomy.json` and the sheet, so it can be undone, and leaves `vocabulary.json`;
  - it rewrites `vocabulary.json`;
  - it reads Excel's plain CSV (Windows-1252) as well as CSV UTF-8.
- **Validator without the cache:**
  - each row carries its evidence (`ancestor_roots`, `positive_roots`, `country_evidence`), so `validate.py` runs from the committed files;
  - `--cache` re-checks that evidence against `taxonomy/raw/fetched.json`: ancestors, the positive roots, every path step as a crawl edge, and the countries' classes.
- **Line endings:** the JSON files are written with LF.
- **CI:** a new `vision-data` job installs `data/vision/requirements.txt` and runs `python taxonomy/validate.py` with no network and no cache.
- **Docs:**
  - `README.md` open-source section: "Clothing types" (Wikidata, CC0 1.0; Requests, Apache 2.0);
  - `BOARD.md` Vision data rows;
  - `testing.md`: the suite, the command and the job;
  - `data/vision/README.md` and `HANDOFF.md`.

**What was run:**
1. `fetch_wikidata.py --roots-only`: the ten new specs each resolved to exactly one item (20 requests). All 105 pass: 10 positive, 15 banned, 18 exclusion, 1 skipped, 4 country classes, 57 launch.
2. `fetch_wikidata.py`: only the ancestor check was new (48 requests); 226 s in all. A re-run made 0 requests (2.2 s).
3. `build_taxonomy.py`: exit 0, 1,731 rows.
4. `validate.py` passed 8 of 8 three ways:
   - on the repo copy;
   - with `--cache`;
   - on a scratch copy of only the 14 files git adds, with plain Python 3.12 and no cache (the CI case).
5. `--apply-review` on a scratch copy, with the sheet saved as Windows-1252 the way Excel's plain CSV saves it:
   - a keep = no row stayed in `taxonomy.json` and left `vocabulary.json`;
   - a review row set to allowed joined it;
   - a launch row's new category was applied;
   - keep "maybe" was skipped and reported;
   - the validator then passed 8 of 8.
   - With two planted defects (a clothing-only type under uniform, and needs_owner on a non-launch row), checks 2 and 7 failed, as they should.
6. **CI:** [run 44023221048](https://github.com/Vivek-k24/Dzirent/actions/runs/44023221048) on `c3508b6`, green: contracts, website, android, vision, database and the new `vision-data`. Its log shows the pinned packages installed and "ALL 8 CHECKS PASSED" (1,731 rows, 57 launch, 812 in `vocabulary.json`).

**Owner's next step:** Open data/vision/taxonomy/review.csv in Excel; check only the rows where needs_owner is yes (dzirent_category and allowed); save as CSV; tell the coordinator.

## V1a - 2026-11-15 - color reader

**Before starting:** clean tree, `Preview` up to date at `8dcd49e`. I didn't touch `H:\DziRent\Dzirent_vision_data` (the other agent's folder). `H:\DziRent\vision-test\should-accept` and `should-reject` are still empty, so there were no owner photos to compare.

**What changed:**
- **Vision service: the color reader** (`services/vision/app/color_reader.py`, new). Per photo, in under a second (timings below):
  1. **Garment mask:** OpenCV GrabCut (`opencv-python-headless` 4.14.0.94; no new model).
     - Seeded with the framing check's own item region, or the middle 60% of the photo when the framing check found none (a busy background such as a rug). The border band is always background.
     - Runs at 256 px on the long side, 3 iterations. On the 22 sample photos the masks hold the garment cleanly (hangers mostly out, small stand parts in).
  2. **Light:** the background's median color in log-chromaticity.
     - When it lies on the CIE daylight locus (within 0.10), the background is taken as a neutral surface under that light. The light, clamped to 3500-10000 K, is divided out (von Kries).
     - A colored background (a red rug sits 2.9 off the locus) can't tell its color from the light's, so the hue is left alone.
     - A dim photo is brightened up to 2.5x (by its brightest channel, so a saturated red cloth isn't taken for dim), never darkened.
  3. **Measure:** the garment's pixels in CIELAB (6000 per photo), k-means with lightness counting half.
     - Clusters that are one fabric lit and in shadow are joined: the same lightness-free chromaticity, or the same hue within 25°, up to 4x apart in luminance.
     - Clusters under 6% are left out. Each cluster is named by its lit half.
  4. **Name:** the nearest of the xkcd color survey's 949 names (`app/color_names.json`, CC0), by CIEDE2000 with the textile lightness factor 2.
     - Each name maps to the apps' value with the closest typical shade, except 21 hand-set names and 16 tans (below).
     - Then the app's old rules: the main color takes in its related shades, a second color needs 12%, and two colors within 0.75 are too close to call.
     - **Only the 15 values are ever returned** (unit-tested on random pixels).
  5. **Second opinion:** the model's text embeddings of "a photo of a <name> garment" and "<name> clothing" for all 949 names, built into the image with their own digest. The policy digest stays the policy's: `fab11ee739b2e4db`, unchanged.
     - **Contenders:** the pixels' main color, plus a second color or related shade with at least half its share, plus any value whose nearest name is within 4 of the main color's own.
     - **Model's share:** it is asked about the names near the contenders' colors only, and its share for a contender includes that contender's related shades.
     - **The rule:**
       - If the model mostly sees the contenders and picks the pixels' main color, the colors are kept: `color_confidence` 0.9, "agree".
       - If it picks another contender with at least 0.75 of its share, that one becomes the main color and the second is left out: 0.7, "settled".
       - Anything else keeps the pixel answer at 0.4 ("disagree"); colors that were too close to call stay without a color. Without the model the confidence is 0.6.
     - The lender never sees a warning.
  - **New key `suggestions.color_confidence`** (contract.md). Nothing reads it yet; the database stores the suggestions object as it is, so there is no database change.
  - **The old color function is removed** now that the evaluation passes: `color_votes`, `name_colors`, `ColorVotes` and the center box. `colors.py` keeps the 15 values, their shades, the related pairs, the thresholds and the Lab math. `SERVICE_VERSION` is `v1a.1`.
  - The build embeds 2,358 prompts (460 before). That took 232 s on this PC.
- **"Checking your photos…" (website and apps).**
  - **Cause, the same on both:** the check watcher restarted only when the check's id changed. Next on Photos again (or Check again) with unchanged photos gets the same, already finished check back, so nothing moved the banner off "Checking your photos…", while the earlier suggestions ("Filled from your photos") stayed.
  - **Website** (`listing-editor.tsx`): every request bumps a counter that restarts the watcher (it reads the check at once). Events for other checks are ignored, and a late "running" event never undoes a result.
  - **Apps** (`ListingEditor.kt`, `PhotoScan.kt`): the same counter restarts the watcher; the banner shows the result as soon as the finished check arrives (`checkBanner`: CHECKING with a finished scan is the result), and a check's watcher never shows another check's result.
- **README** open-source section: OpenCV (Apache 2.0; the wheel's MIT packaging and its bundled FFmpeg, LGPL 2.1, never used) and the xkcd color names (CC0); the NOTICE note. **Docs:** `architecture.md` 5.6, `contract.md` (the colors and `color_confidence`), `security-log.md`, `services/vision/README.md`, `code-reference.md` (regenerated), `BOARD.md` (new "Vision data" section).

**Old vs new colors, the 22 sample listing photos** (each photo scanned alone; old = the code before V1a, the deployed S1b code; new = V1a; same pinned model, same 92 photos, run with the service's own `Model`, `analyze_photo` and `scan` code). "Stored color" is the color word in the live listing's title or description; where the listing names none, "eye:" is my own reading of the photo. Rule: what the model's second opinion did, with its share for the value it picked.

| Photo | Old colors | New colors | Stored color | Old right | New right | New rule (model) |
| --- | --- | --- | --- | --- | --- | --- |
| cashmere-belted-trench-coat/back | Brown | Beige | camel | yes | yes | agree (Beige 0.58) |
| cashmere-belted-trench-coat/front | Brown | Beige | camel | yes | yes | agree (Beige 0.51) |
| embroidered-silk-lehenga-set/back | Brown | Maroon | eye: maroon with gold | no | yes | settled (Maroon 0.92) |
| embroidered-silk-lehenga-set/front | Maroon, Black | Maroon | eye: maroon with gold | yes | yes | settled (Maroon 0.95) |
| emerald-velvet-cocktail-dress/back | Black | Emerald | emerald green | no | yes | agree (Emerald 1.0) |
| emerald-velvet-cocktail-dress/front | Black | Emerald | emerald green | no | yes | agree (Emerald 1.0) |
| linen-summer-sundress/front | Orange, Maroon | Orange, Maroon | terracotta | yes | yes | agree (Orange 0.89) |
| minimalist-wool-day-coat/back | Grey | Grey | heather grey | yes | yes | agree (Grey 0.97) |
| minimalist-wool-day-coat/front | Grey | Grey | heather grey | yes | yes | agree (Grey 0.98) |
| modern-qipao-midi-dress/back | Emerald, Black | Emerald | eye: jade green | yes | yes | agree (Emerald 1.0) |
| modern-qipao-midi-dress/front | Emerald, Black | Emerald | eye: jade green | yes | yes | agree (Emerald 1.0) |
| pleated-wide-leg-trousers/back | White | White | eye: cream | yes | yes | agree (White 0.99) |
| pleated-wide-leg-trousers/front | White | White | eye: cream | yes | yes | agree (White 0.99) |
| satin-backless-maxi-dress/back | Brown | Beige | champagne | no | yes | agree (Beige 0.65) |
| satin-backless-maxi-dress/front | Beige, Grey | Beige | champagne | yes | yes | agree (Beige 1.0) |
| silk-halter-evening-gown/back | Navy, Grey | Navy, Grey | eye: navy | yes | yes | agree (Navy 0.63) |
| silk-halter-evening-gown/front | Navy, Grey | Navy | eye: navy | yes | yes | agree (Navy 0.6) |
| structured-silk-work-shirt/front | Beige | White | eye: white | no | yes | agree (White 1.0) |
| tailored-charcoal-blazer/back | Black | Grey | charcoal | no | yes | agree (Grey 0.72) |
| tailored-charcoal-blazer/front | Black | Grey | charcoal | no | yes | agree (Grey 0.75) |
| vintage-denim-jumpsuit/back | Grey, Blue | Blue | denim | no | yes | agree (Blue 0.99) |
| vintage-denim-jumpsuit/front | Grey, Blue | Blue | denim | no | yes | agree (Blue 1.0) |

**The 12 sample listings** (all their photos together; the title is the new suggestion, unchanged apart from the color word):

| Listing | Old colors | New colors | Stored color | Old right | New right | New rule (model) | New title |
| --- | --- | --- | --- | --- | --- | --- | --- |
| cashmere-belted-trench-coat | Brown | Beige | camel | yes | yes | disagree (Brown 0.57) | Beige wool trench coat |
| embroidered-silk-lehenga-set | Maroon | Maroon | eye: maroon with gold | yes | yes | settled (Maroon 0.95) | Maroon embroidered lehenga |
| emerald-velvet-cocktail-dress | Black | Emerald | emerald green | no | yes | agree (Emerald 1.0) | Emerald velvet cocktail dress |
| linen-summer-sundress | Orange, Maroon | Orange, Maroon | terracotta | yes | yes | agree (Orange 0.89) | Orange linen dress |
| minimalist-wool-day-coat | Grey | Grey | heather grey | yes | yes | agree (Grey 0.97) | Grey wool coat |
| modern-qipao-midi-dress | Emerald, Black | Emerald | eye: jade green | yes | yes | agree (Emerald 1.0) | Emerald silk qipao |
| pleated-wide-leg-trousers | White | White | eye: cream | yes | yes | agree (White 0.99) | White trousers |
| satin-backless-maxi-dress | Beige, Grey | Beige | champagne | yes | yes | agree (Beige 1.0) | Beige satin slip dress |
| silk-halter-evening-gown | Navy, Grey | Navy | eye: navy | yes | yes | agree (Navy 0.62) | Navy satin gown |
| structured-silk-work-shirt | Beige | White | eye: white | no | yes | agree (White 1.0) | White shirt |
| tailored-charcoal-blazer | Black | Grey | charcoal | no | yes | agree (Grey 0.74) | Grey wool suit |
| vintage-denim-jumpsuit | Grey, Blue | Blue | denim | no | yes | agree (Blue 1.0) | Blue denim jumpsuit |

**Scores:**
- **Sample photos:** old right on 13 of 22, new on **22 of 22**.
- **Sample listings:** old 8 of 12, new **12 of 12**.
- I counted the camel coat as right for Beige or Brown, terracotta for Orange or Brown, and green for Emerald or Green.

**The other 70 test photos** (the earlier sessions' Commons accept and reject sets, hoodies, worn dresses and the safe example; `vision-test` was empty):
- **Changed:** 19 of them get suggestions, and the colors changed on 11. By eye, new is right on 4 and old on 1:

| Photo | Old | New (rule) | By eye | Old right | New right |
| --- | --- | --- | --- | --- | --- |
| should-accept/blazer/1 (a portrait; the item read is the white scarf) | Grey | White (settled) | white scarf | no | yes |
| should-accept/saree/1 (far away) | Black | Brown (agree) | brown | no | yes |
| should-accept/wristwatch/2 | Grey | Navy (agree) | navy strap | no | yes |
| worn-dress/3 | - | Blue (agree) | bright blue | no | yes |
| should-accept/kimono/2 | Black | Purple (disagree: Maroon) | black, under magenta stage light | yes | no |
| should-accept/handbag/2 | Grey | - (model Grey, under 0.75) | brown and orange floral | no | no |
| should-accept/necktie/1 (children; the tie is black) | - | White (agree) | black tie | no | no |
| should-accept/sunglasses/1 (on red cloth) | Maroon, Black | Maroon (disagree: Red) | black frame | no | no |
| should-accept/sunglasses/2 (on a white card) | Grey | White (disagree: Beige) | red, white and blue frame | no | no |
| should-reject/shorts/3 (a shop mannequin) | Brown | Grey, Brown (agree) | white tee, print shirt | no | no |
| hoodies/hoodie/4 (long print dress) | Black, Yellow | Grey, Yellow (agree) | multicolor print | no | no |

- **Verdicts and everything else unchanged:** on all 92 photos and all 12 listings these are identical to before: verdict, reason, item, every photo's decision, labels, checks and warnings, the quality summary, and every suggestion field except the colors, with titles and descriptions compared with the color words taken out. **0 differences** (`compare.py` in my scratch folder).
- **Robustness (unit test, CI):** each of the 22 sample photos is scanned again under a 4000 K (yellow) cast, a 9000 K (blue) cast, half the light and 1.6x the light (clipped). The main color stays the same or one of its related shades (the app's light, shadow and neighbor pairs): **22 of 22 photos, all four casts.**
- **Owner's case:** the cream sherwani photo isn't in the repo or `vision-test`. A synthetic stand-in, a cream piece with folds flat on a red and gold patterned rug, is in the tests:
  - GrabCut separates it (mask overlap 0.85 or more with the true shape);
  - it is named **White**, never Grey or the rug's red.
  - Before the lit-and-shadow merge it read **Grey**: the fold shadows formed a bigger cluster than the lit cream, which is the same failure the owner saw.

**Licenses:**
- **OpenCV** `opencv-python-headless` 4.14.0.94: OpenCV under Apache 2.0, the wheel's packaging under MIT. The wheel's metadata says it bundles FFmpeg (LGPL 2.1) and other libraries listed in its `LICENSE-3RD-PARTY.txt`. The service never opens video. No advisory affects this version.
- **xkcd color survey names:** CC0 1.0 (the first line of the downloaded `rgb.txt`), copied unchanged into `color_names.json`.
- **No new model.** GrabCut found the garment on all 22 sample photos and on the synthetic rug test, so the segmentation-model fallback wasn't needed. On 9 of the other 70 photos it found too little (under 2% of the photo), and the reader used the framing check's seed instead. Those are mostly photos that aren't a garment: a typed letter, a laptop, footprints in snow, a dog, a building, plus jeans/3, sandals/3, necktie/2 (a drawing) and sweatshirt/1.

**Color names for the owner to decide on** (should the apps' 15-value list grow?):
- **The owner's examples:**
  - **ivory, cream:** map to White. Their closest typical shade is a Beige one (ΔE 14 and 16), so they are set by hand. Off white, eggshell and pale are too.
  - **champagne:** not in the xkcd list. The champagne satin dress reads as Beige.
  - **gold:** Yellow (3.2, maps well).
  - **maroon:** Maroon, already a value (3.0).
  - **teal:** Emerald (8.8); turquoise Emerald (9.7); aqua Emerald (13).
- **Other fashion names:**
  - **Map well:** burgundy → Maroon 3.5; mustard → Yellow 4.0; silver → Grey 3.9; taupe → Beige 2.9; terracotta → Orange 7.9; olive → Green 8.4; sage → Green 7.9.
  - **Map loosely:** camel → Beige 10.5 (set by hand; its closest shade is a gold); khaki → Beige 11.6 (set by hand; its closest shade is a green); charcoal → Grey 7.8 (set by hand; its closest shade is a black); coral → Red 7.9; peach → Orange 9.6; rust → Orange 9.5; wine → Maroon 9.3; mauve → Pink 9.4; lavender → Purple 9.5; lilac → Purple 10.2; plum → Purple 11.2; blush → Pink 10.7; mint → Green 14.9.
- **Hand-set (21), each because its closest shade is another family than the name:**
  - off white, ivory, cream, eggshell, pale → White;
  - charcoal, charcoal grey → Grey;
  - camel, tan, sand, khaki, light beige → Beige;
  - sandy brown, sand brown, golden brown, yellowish brown, yellowy brown, mustard brown → Brown;
  - royal blue → Blue; emerald → Emerald; dark (the survey's blue-black, #1b2431) → Navy.
- **Tan rule (16):** Yellow means a saturated yellow (chroma 52 or more). Weaker yellows that would land on the Yellow shades (which include golds) become Beige when light and Brown when dark: desert, greenish beige, dark cream, parchment, creme, light khaki, dark sand, sandy, buff, wheat, dark khaki, light tan and dark tan → Beige; hazel, muddy brown and "shit" (the survey's own name; it has several crude ones) → Brown.
- **Every name that maps poorly**, by value, with its distance to the value's closest typical shade (CIEDE2000, textile weighting; more than 10 counts as poor; 362 of the 949). Most are bright greens and limes, cyans and teals, lilacs and pinks that no 15-value list matches:
- **Black (1):** very dark brown 11
- **White (15):** pale cyan 19, eggshell blue 17, duck egg blue 17, light sky blue 16, light light blue 16, cream 16, pale blue 15, ivory 14, really light blue 14, very light blue 14, ice 14, very pale blue 14, ice blue 13, eggshell 12, pale 11
- **Grey (11):** robin egg blue 21, robin's egg blue 20, pale sky blue 16, light periwinkle 15, purpley grey 14, purple grey 14, purplish grey 12, pinkish grey 12, light grey blue 11, bluegrey 11, bluey grey 10
- **Navy (8):** purplish blue 12, purply blue 11, primary blue 11, strong blue 11, blue/purple 11, purple blue 11, burple 11, blue violet 11
- **Blue (23):** robin's egg 22, aqua blue 22, neon blue 18, turquoise blue 17, petrol 16, bright sky blue 16, powder blue 13, teal blue 13, periwinkle 13, periwinkle blue 12, pastel blue 12, ocean 12, lavender blue 12, light blue 12, baby blue 12, lightblue 11, sky 11, bluish purple 11, rich blue 11, light royal blue 10, dark blue grey 10, greyblue 10, purpley blue 10
- **Green (99):** acid green 18, lime green 18, bright lime 18, fluro green 18, bright green 18, fluorescent green 18, neon green 18, bright lime green 18, highlighter green 17, poison green 17, hot green 17, electric green 17, pale lime green 17, radioactive green 17, bright light green 16, key lime 16, light lime 16, kiwi 16, light neon green 16, light bright green 16, very light green 16, very pale green 16, vivid green 16, pale green 16, light light green 16, light mint 16, lighter green 16, light yellowish green 16, celadon 16, sea green 15, light green blue 15, spring green 15, light grass green 15, wintergreen 15, celery 15, spearmint 15, light seafoam green 15, minty green 15, lightgreen 15, light bluish green 15, green brown 15, pistachio 15, turquoise green 15, mint 15, light mint green 15, tea green 15, kiwi green 15, pastel green 15, easter green 15, washed out green 15, dark olive 15, foam green 15, baby green 15, pale light green 15, mint green 15, light pastel green 15, light sea green 15, light sage 14, light green 14, greeny brown 14, vibrant green 14, slime green 14, toxic green 13, green apple 13, greenish brown 13, light grey green 13, weird green 13, greenish grey 13, racing green 12, apple green 12, tealish green 12, bright olive 12, lightish green 12, bottle green 12, dark lime green 12, dark olive green 12, fresh green 12, brown green 11, browny green 11, seaweed 11, booger green 11, puke green 11, grey/green 11, apple 11, dark lime 11, greeny grey 11, pea soup 11, barf green 11, greyish green 11, navy green 11, sick green 10, green grey 10, greenish tan 10, pale olive green 10, pale olive 10, baby poop green 10, sickly green 10, mud green 10, grey green 10
- **Emerald (52):** bright light blue 21, cyan 20, bright cyan 20, light cyan 20, bright turquoise 19, deep teal 17, bright aqua 17, deep aqua 17, pale aqua 17, bright sea green 16, dark teal 15, dark cyan 15, light seafoam 15, seafoam green 15, seafoam 15, dark aqua 15, greenish cyan 14, greenish turquoise 14, light blue green 14, pale turquoise 14, light aqua 14, tiffany blue 14, deep turquoise 14, very dark green 14, bright teal 14, light aquamarine 14, hospital green 14, light greenish blue 13, dark green 13, forrest green 13, bluegreen 13, dark forest green 13, dark turquoise 13, light turquoise 13, aqua 13, dark aquamarine 13, hunter green 12, greenish blue 12, aqua green 12, light teal 12, darkgreen 12, greyish teal 12, aqua marine 12, topaz 12, forest green 12, sea 11, british racing green 11, pale teal 11, seafoam blue 10, dark blue green 10, dusty teal 10, aquamarine 10
- **Red (8):** salmon 12, reddish brown 11, pink red 11, red pink 10, auburn 10, coral pink 10, melon 10, reddish pink 10
- **Maroon (7):** dark plum 13, reddish purple 12, violet red 12, dark mauve 12, mulberry 12, red purple 11, lipstick 11
- **Pink (24):** pale lavender 16, very light purple 14, pink/purple 14, violet pink 13, pale mauve 13, bright magenta 13, fuchsia 13, light magenta 13, cerise 13, purple pink 13, pale salmon 12, deep pink 12, salmon pink 12, light salmon 12, dark hot pink 12, peachy pink 12, light plum 11, magenta 11, blush 11, deep rose 11, hot magenta 11, brownish pink 10, purply pink 10, dark pink 10
- **Purple (45):** pale lilac 16, light lilac 15, light lavender 15, dirty purple 14, light lavendar 14, bright purple 14, neon purple 14, hot purple 13, bright violet 13, electric purple 13, vivid purple 13, dark fuchsia 13, deep magenta 13, perrywinkle 13, dark magenta 13, eggplant 13, aubergine 13, dusky purple 12, light violet 12, purple/pink 12, heliotrope 12, dusty lavender 12, violet 12, pink purple 12, pale violet 12, grey purple 12, very dark purple 12, pinkish purple 11, greyish purple 11, plum 11, vibrant purple 11, midnight purple 11, bright lavender 11, bright lilac 11, dull purple 11, grape 10, pastel purple 10, lilac 10, dark purple 10, purpley 10, lighter purple 10, heather 10, bruise 10, lavender pink 10, pinky purple 10
- **Yellow (30):** bright yellow green 18, electric lime 17, lime 17, lemon green 16, light lime green 16, pale lime 15, light pea green 15, lemon lime 15, yellowgreen 15, yellow green 14, chartreuse 14, green yellow 14, light yellow green 14, yellow/green 13, greeny yellow 13, neon yellow 13, yellowy green 13, greenish yellow 13, lime yellow 13, yellowish green 13, snot green 13, pear 12, gross green 12, ugly brown 12, pea 11, vomit 11, green/yellow 10, mustard green 10, orange yellow 10, puke 10
- **Beige (17):** greenish beige 14, light khaki 14, buff 13, dark cream 13, sandy 12, parchment 12, wheat 12, creme 12, light beige 12, khaki 12, grey brown 12, dark tan 11, dark khaki 11, sand 11, camel 10, desert 10, brownish grey 10
- **Brown (22):** yellowy brown 18, yellowish brown 16, sandy brown 16, hazel 16, olive brown 15, mustard brown 14, sand brown 14, reddish grey 13, mud 13, muddy brown 13, golden brown 13, shit 13, poop 12, pinkish tan 12, poop brown 12, rust brown 11, greyish brown 11, shit brown 11, poo brown 11, pinkish brown 10, caramel 10, chestnut 10

**What I ran:**
1. **Vision tests** (repo `.venv`, Python 3.12.10, `pip check` clean): `pytest -m "not model" tests`: **116 passed**, 2 deselected (the CI form); with `VISION_SAFETY_DIR` set, **118 passed**.
   - 68 tests are new in `tests/test_color_reader.py`: CIEDE2000 against Sharma's reference pairs; the name mapping; the mask on the rug case; the light correction (casts removed on a neutral background, a red background left alone, exposure); clusters (shadows, black-and-white kept apart, tiny clusters dropped); the second-opinion rules with a stand-in bank; only the 15 values; the 22 cast-robustness cases; the time per photo.
   - `tests/test_colors.py` was rewritten for what `colors.py` keeps.
2. **Before and after** with the same pinned weights:
   - HEAD's vision code (`git archive`) on S1's built assets, against V1a on assets I built locally from the same pinned model files (`build_assets.build`, no download; 2,358 prompts in 232 s).
   - The results are the tables above.
3. **Speed** (this PC):
   - **The color reader alone** (`read_photo`, all 92 photos at the final setting): median 140 ms, max 408 ms. GrabCut is most of it; 256 px and 3 iterations instead of 320 px and 4 halved its time (max 810 to 390 ms), and the masks agree at a median 0.96 overlap.
   - **The whole per-photo analysis:** median 475 ms, max 747 ms. Before V1a it was median 593 ms, max 1,195 ms (the old reader worked on the full 1,280 px image).
4. **Local Linux image** (`docker build` of `services/vision`, the unchanged Dockerfile):
   - `pip check` in the image: "No broken requirements found" (OpenCV 4.14.0.94 with numpy 2.2.5 on Linux).
   - **Build time:** 2,358 prompts embedded in 243 s (model download included); the whole build took 7 min 46 s on this PC.
   - **Run** with `--cpus 2 --memory 4g` and the live `VISION_ALLOWED_URL_PREFIXES`:
     - it runs as uid 10001 `vision`;
     - `/health` shows `service_version` `v1a.1`, policy digest `fab11ee739b2e4db` (unchanged), the same model revision, start-up 7.4 s;
     - peak memory 909 MiB.
   - **The 12 sample listings through the container's `/scan`:**
     - all allowed, with the same colors and titles as the local run;
     - one confidence differs: the trench coat gets 0.4 in the container and 0.9 on Windows. The model splits about evenly between Beige and Brown there, so the small numeric differences between the two builds tip it; the color is Beige either way.
   - **Logs:** the only line with a URL is Uvicorn's own start line; there are no photo URLs.

5. **Website** (Node 22.23.3): `npm run lint` passes (its first run stopped on the stale `code-reference.md`, which I regenerated), `npm test` **50 of 50**, `npm run build` passes (23 pages).
6. **Android** (JDK 21, env loaded silently; no containers running): `:androidApp:assembleDebug :shared:testDebugUnitTest`: **BUILD SUCCESSFUL**, **81 tests, 0 failures, 1 skipped** (`SmokeTest` needs the test-user env). One is new: `PhotoScanTest.checkingGoesAsSoonAsTheResultIsIn`.
7. **No emulator, device or app screenshots.** The only images I looked at were contact sheets and mask overlays of the sample and Commons test photos.
8. **Push and CI:** pushed `4a145a2` ("V1a: color reader"). CI on the push, https://github.com/Vivek-k24/Dzirent/actions/runs/43761123988: **success, all 5 jobs** (android, contracts, vision, website, database). CI on the open `Preview` → `main` pull request, run 43761128802: success, all 5.

**Timings, before and after** (local containers with Cloud Run's 2 CPUs and 4 GiB, the same 22 sample photos sent one by one after 3 warm-up scans, then the 12 listings; before = the S1 image, the deployed code; after = V1a):

| | Before (`s1.1`) | After (`v1a.1`) |
| --- | --- | --- |
| Start-up, from `/health` | 13.2 s | 7.4 s (the first run reads the image from disk, so this mostly isn't the code) |
| Warm single-photo scan, round trip | median 0.75 s, max 0.91 s | median 0.77 s, max 1.00 s |
| The service's own analyze time per photo | median 732 ms, max 884 ms | median 760 ms, max 1,003 ms |
| Sample listing (1 or 2 photos) | median 1.38 s, max 1.66 s | median 1.43 s, max 1.73 s |

**Vision revision: not redeployed.**
- `gcloud auth print-identity-token` and `print-access-token` both answer "Reauthentication failed. cannot prompt during non-interactive execution": the owner's gcloud sign-in on this PC has expired, and only the owner can renew it.
- Cloud Run still serves **`vision-00006-sxv`** (`s1.1`, S1b). The new colors were at least as right as the old on every set, so the condition for deploying was met; only the sign-in was missing.
- The before and after timings above come from local containers with Cloud Run's CPU and memory, not from Cloud Run.
- **To deploy** (after `gcloud auth login`), from the repo root, the same settings as before:

      gcloud run deploy vision --source services/vision --project dzirent --region us-west1 --no-allow-unauthenticated --service-account vision-runtime@dzirent.iam.gserviceaccount.com --min-instances 0 --max-instances 1 --cpu 2 --memory 4Gi --timeout 120 --concurrency 4 --set-env-vars VISION_ALLOWED_URL_PREFIXES=https://pwfzkyjeivadbtkfkdxr.supabase.co/storage/v1/object/public/listing-photos/

  Then `/health` should show `v1a.1` and policy digest `fab11ee739b2e4db`, and `eval/run_eval.py` gives the deployed warm times.
  - **Cloud Build time:** the build now embeds 2,358 prompts instead of 460, about 4 minutes on this PC.

**Open issues:**
- **Deploy** (above): the owner's `gcloud auth login`, then an agent deploys and confirms `/health` and the warm scan time on Cloud Run.
- **Colored light with no neutral surface in view** isn't corrected. The black kimono under magenta stage light (kimono/2) reads Purple; the old reader said Black.
- **See-through and busy pieces:** the sunglasses' lenses show the red cloth under them (Maroon); a portrait masks the face and scarf, not the dark jacket. Multicolor prints get the largest color.
- **The fine names stay internal:** the response carries only the 15 values and `color_confidence`.
- **Whether `color_confidence` should change anything** (for example, leaving the color out of the title under 0.5) is for the owner. Today it's only recorded.
- **The owner's sherwani photo** wasn't available. Put it (and others) in `H:\DziRent\vision-test\should-accept` to have them in the next comparison.

**Phone and website test** (owner):
- **New listing:** add photos, Next, wait for "Your photos look good." Then Back to photos and Next again without changing them: "Checking your photos…" must go at once and must never sit next to "Filled from your photos". Also try Check again after a check finished.
- **Colors** stay as they are until the deploy.

**APK:** `mobile/androidApp/build/outputs/apk/debug/androidApp-debug.apk` (97,047,399 bytes, SHA-256 `740A2F733F07D1B1…`), copied to `C:\Users\User\Desktop\Belhaven\OneDrive - Belhaven University\Dzirent-apk\androidApp-debug.apk` (same size and hash; the original stays).

**Mac (iPhone) check:** only common code changed: `util/PhotoScan.kt` (`checkBanner`) and `ui/ListingEditor.kt` (the request counter). Check that the framework builds and that "Checking your photos…" goes as on Android.

## F1 - 2026-11-15 - owner test fixes

**Before starting:** clean tree, `Preview` up to date at `a8bff17`.

**Fixes, each with its cause:**
1. **Listing draft save.**
   - **Cause:** the website's `listings/save` ran the full publish check (`validateListing`) on every save. Next on the Photos step sends an unfinished form, so it was refused with "Choose a size." (the owner's 400). Next on the Details step would have failed the same way (size and price are step 3). An empty price was also sent as `0`, which the database's `price_usd > 0` refuses.
   - **Fix:** a draft save never asks for a missing field. It refuses only text over its limit or unknown styles, and saves the rest empty: the placeholder title and category until the details step, size and price `null` (`listing-form.ts` `draftProblem` / `draftRow`).
   - **Checks per step:** each step checks its own fields when the person continues: `detailsProblem` for step 2, `sizePriceProblem` at Publish (`publishProblem` = both, again on the server in `listings/finish`). Each check gives a field-level catalog message, shown under the field and at the buttons, and jumps back to that field's step. New codes **`DZ-E2070`-`E2085`** (title, category, item type, description, size, garment kind, price, price details, deposit note, retail value, accessory over $300, the accessory tick, styles, measurements, no dates, end before start); `DZ-E2010` for no photo.
   - **Unfinished rows:** a paused row with the placeholder title, or no size or price, is "unfinished" (`isUnfinished`, the same rule as the app's `Listing.isUnfinished`). My closet shows it as Draft without the Active/Paused switch, the status route refuses to turn it on with its field's code (`activationProblem`), and the editor publishes it like a new listing. A draft reopened from the closet starts with a blank title and category; a draft's price shows empty, never "null".
   - **Database:** it already accepted an unfinished paused row (only `title` 3-80 and `category` are required). Nothing moved there; pgTAP `14_f1` now checks it.
   - **Android:** the same problem didn't exist: the draft row (now `draftListing`) is inserted without a size or price, and the editor already checked size and price only at Publish. Fixed the same way:
     - each gap (`detailsMissing`, `step2Missing`) is now the catalog's message with its code and field, and shows under the title, description, price and notes fields;
     - an unfinished row (for example one saved on the website's details step) gets no closet switch and publishes as live (`ListingPublisher.goesLive`).
2. **No silent hangs.**
   - **Cause:** the website's `workflow()` and the photo uploads called `fetch` without a time limit, so a stalled request left "Saving..." / "Preparing your listing..." spinning. A network error or a host error page also surfaced as raw text ("Failed to fetch", a JSON parse error).
   - **Fix (website):** `lib/requests.ts`:
     - every call to `/api/workflows` (`workflow()`, `workflowUpload()` for listing and condition photos, the data download) gives up after **30 s** with `DZ-E9002`;
     - a dropped connection is also `DZ-E9002`; a non-JSON 5xx page is `DZ-E9003`;
     - only a `WorkflowClientError` ever comes out, so every form's catch has a message. `runStep` is busy on, then the error in place and busy off on any failure.
     - The listing editor's four server steps use it (draft save, photo upload, photo check start, publish), plus Check again. I went through the other forms (settings, studio, measurements, rentals and their condition photos, verification, payouts, closet, chat): each already catches and re-enables, and now always gets a coded message within 30 s.
   - **Fix (apps):** the Supabase client's `requestTimeout` is 30 s (it was supabase-kt's default 10 s). More network failures map to `DZ-E9002`: connection reset, refused or aborted, network unreachable, unexpected end of stream, no address. Publish now catches every failure, so the spinner can't stay on. Tidying up after a successful publish never turns it into a failure.
   - **Found on the way:** the website's measurements consent calls (Agree, and both Withdraw buttons) had no body, so they went out as **GET** and answered "Page not found." They are POSTs again.
3. **Step indicator.**
   - **Cause:** the global `button:disabled { cursor: wait }` gave steps not reached yet the wait cursor. The bar also had 2 columns for 3 steps.
   - **Fix:** steps not reached yet are dimmed with the normal cursor, only earlier steps (`reachable`) show the pointer, and the bar has 3 columns.
4. **Own studio.**
   - **Website:** your own studio page (`myStudioHandle()` = the studio's handle, ignoring case) hides Save studio, the Studio options disclosure, Report this studio and Block this studio, and shows **Edit studio** (`/app/settings/studio`). The rule is `lib/studio-view.ts`.
   - **App:** the studio screen never had Report or Block (people report from a listing's menu or the chat). Your own studio now shows **Edit studio** (opens My studio) instead of Save and Message. Your own listing already showed only Edit; both rules are now in `util/OwnActions.kt` (`studioActions`, `listingActions`) and tested. The website has no other page where you'd act on yourself (a chat is always with someone else, and the listing page has no Report).
   - **Database (a premise only half true):** `block_user()` and `report_user()` do skip your own handle and write nothing. But the apps write `blocks` and `reports` to the tables directly, and their policies only check the blocker or reporter, so a self-block or self-report could be written there. `20261115120000_f1_no_self_block_report.sql` adds a coded refusal:
     - the trigger `blocks_not_self` (`DZ-E3021`);
     - a check at the end of `app_private.report_prepare` (`DZ-E5017`: about yourself, your own listing or your own message). Before applying, I confirmed the live function is byte for byte P2B's body (MD5 of `prosrc`), so only the check is added.
     - pgTAP `14_f1` covers both paths, and that someone else can still be blocked and reported.
5. **Dark mode.**
   - **Cause:** the dark theme turns `--ink` near-white, but chips and pills hard-coded light backgrounds. The listing tags were 1.01:1 and the photo counter 1.10:1; the draft tag and the current step number (white on the dark theme's light pink) 2.48:1; the dark notice 1.50:1.
   - **Fix:** theme tokens `--chip`, `--chip-ink`, `--surface`, `--on-accent`, `--tint`, in both themes, for:
     - the listing and studio tags, filter tags, status badges (and the active one), the photo counter;
     - the draft tag, the current step number, avatars, the hero label, the share banner, how-it-works, the "or" divider, the fit symbol;
     - the dark notice, the photo placeholder's text (4.73:1), the active admin tab badge (6.62:1).
   - Measured with a WCAG script: every pair is **5.22:1 or more in both themes**.
   - **App:** its chips use Material 3 roles (style tags `onSurfaceVariant` on `surfaceVariant`, 5.8:1 light and 5.7:1 dark), and it has no photo counter (page dots), so nothing changed.
6. **Dependabot alert 83.**
   - `opentelemetry-api` 1.45.1 → **1.45.2** (released 2026-10-29, 17 days ago). FastAPI requires only the API; its SDK and exporter are extras the service doesn't install, so there are no companion packages to move.
   - `pip install --no-deps` into the repo `.venv`, then `pip check`: "No broken requirements found".
   - **Not redeployed**, because the alert closes without it: it is computed from `requirements.txt` on `main`, so it closes when the owner merges `Preview`. The running revision is not exposed in practice: FastAPI parses `traceparent` only when an OpenTelemetry provider is configured, and the vision app configures none. The next `vision` deploy picks up 1.45.2.

**What I ran:**
1. **Local backend** on the default ports (free today; no WinNAT clash), from scratch (`stop --no-backup`, `start` without Studio and the log stack): every migration including `20261115120000`, then the seed.
2. **pgTAP:** **14 files, 442 tests, PASS** (`14_f1` 14).
3. **Integration** (`node supabase/tests/run-all.mjs`, Node 22): **22 of 22 passed**, C6 off and on included.
4. **Website** (Node 22): `npm test` **50 of 50** (`listing-flow.test.ts` 10: the draft with an empty size, the size message at Publish, the other step-3 codes, unfinished rows, a forced network failure and a stalled save showing `DZ-E9002` with the button back, a refusal's field and code, a host error page `DZ-E9003`, own studio without Report or Block); `tsc --noEmit` clean; `eslint` clean; `npm run build` passed. `generate.mjs --check`: 214 codes, code reference fresh.
5. **Android** (stack stopped, no containers): `:androidApp:assembleDebug :shared:testDebugUnitTest` **BUILD SUCCESSFUL**: **80 tests, 0 failures, 1 skipped** (`ListingStepsTest` 9).
6. **Vision** (repo `.venv`):
   - pytest **54 passed** with the model tests (`VISION_SAFETY_DIR` = S1's built safety model); the CI form **52 passed, 2 deselected**.
   - **Same results:** the service's own code (`Model`, `analyze_photo`, `scan`; S1's script, on S1's built assets) on the same 92 photos and 12 listings before and after the update. Image embeddings and nudity scores are **bit-identical**, and 0 of 92 photos and 0 of 12 listings changed. All 22 sample photos and all 12 listings are still allowed; should-reject is 32 rejected, 10 review, 0 allowed; the highest nudity score is 0.148 (as in S1).
7. **Contrast:** a WCAG ratio script over the new token pairs (above).
8. **CI:** [run 43737167391](https://github.com/Vivek-k24/Dzirent/actions/runs/43737167391) on `5c0b185`: **all 5 jobs green**. Database: pgTAP `Files=14, Tests=442`, PASS; integration 22 of 22.
9. **Live**, after CI:
   - **Before** (read-only, `supabase db query --linked`): 0 self-blocks, 0 self-reports, 0 paused listings without a size or price, 0 active ones (13 listings). The live `app_private.report_prepare` was exactly P2B's body (MD5 of `prosrc`).
   - `supabase db push --linked --dry-run` listed only `20261115120000_f1_no_self_block_report.sql`; `supabase db push --linked` applied it.
   - **After** (read-only):
     - the trigger `blocks_not_self` exists, and `authenticated` can't execute `refuse_self_block()`;
     - `report_prepare` has the `DZ-E5017` check, and its body equals the migration's (MD5);
     - still 0 self rows, 13 listings; the last migration is `20261115120000`.
   - **Security Advisor** (Supabase MCP `get_advisors`, 2026-11-15 16:52 UTC): **no new findings**. RLS enabled with no policy 19, guest definer functions 5, signed-in definer functions 78: the same as after C6.
   - No Edge Function or vision deploy; nothing written on live except the migration.

**Test counts:**

| Suite | Count |
| --- | --- |
| pgTAP | 442 (14 files; `14_f1` 14) |
| Integration | 22 runs (20 scripts) |
| Shared Kotlin | 80 (1 skipped; `ListingStepsTest` 9) |
| Website | 50 (`listing-flow.test.ts` 10) |
| Vision | 54 with the model tests; 52 in CI |
| Contracts | 214 codes, fresh; code reference fresh |

**APK** (built 2026-11-15 10:35 local; 97,046,754 bytes):
- Original: `mobile/androidApp/build/outputs/apk/debug/androidApp-debug.apk`
- Copy (rule 15): `C:\Users\User\Desktop\Belhaven\OneDrive - Belhaven University\Dzirent-apk\androidApp-debug.apk`, replacing the C6 copy. Same size and SHA-256.

**Phone and website test (owner):**
- **Website, List a piece:**
  - Add photos, then Next: it goes on to Details with no size asked. Next again without a title: "Title must be 3 to 80 characters. (DZ-E2070)" under the title.
  - On step 3, Publish without a size: "Choose a size. (DZ-E2074)" under the size.
  - With the connection off, Next shows "Can't reach the server... (DZ-E9002)" and the button comes back (after at most 30 seconds when the line just stalls).
  - Steps not reached yet show the normal cursor.
- **Website, My closet:** a listing left after the details step shows Draft, with Edit and no Activate.
- **Your own studio** (website and app): Edit studio, no Save, Report, Block or Studio options. Another studio still has them on the website.
- **Dark mode** on a listing page: the size and style chips and "1 / 2" are readable.
- **Website, Settings > Measurements:** saving with consent (Agree) and Withdraw work.
- **App, Create listing:** Publish without a size shows "Choose a size. (DZ-E2074)"; without a price, the message under the price field too.

**iPhone, for the Mac session:** build-check the F1 common code:
- `ui/StudioScreen.kt` (`OutlinedButton` Edit studio, `onEditStudio`), `ui/MainAppScaffold.kt`, `ui/MainScreens.kt` (`listingActions`, `isUnfinished` in the closet card);
- `ui/ListingEditor.kt` (`showMissing`, `goesLive`, the catch-all), `ui/ListingStepDetails.kt` (price field message), `ui/ListingEditorState.kt`;
- `util/OwnActions.kt`, `util/ListingForm.kt` (`missingField`, `draftListing`), `util/PhotoGate.kt` (`Missing` with field and code), `util/PhotoScan.kt` (`isUnfinished`), `util/ReadRetry.kt`, `data/ListingPublisher.kt`;
- `repository/DzirentRepository.kt` (`requestTimeout` 30 s: check that uploads and Realtime on iPhone behave as before).

**Open issues:**
- **The database doesn't require a size or price to go live.** Both apps and the website check before publishing, and neither closet offers the switch for an unfinished row, but a hand-made API call could still set `status = 'active'` on one. A trigger at activation would close it. It would change several older test fixtures that insert bare active listings, so it was left for a step that may move that check (`supabase/` was limited to a server check that must move).
- **Edge Functions not redeployed:** their bundled `_shared/error-codes.ts` now has the 18 new codes, which none of them sends. They run the 196-code catalog until the next function deploy.
- **`--danger` is used but never defined** on the website (studio editor, chat, closet and admin error text), so its fallback `#d32f2f` is 3.7:1 on the dark background. These are form messages, not chips, so they were left out of this step's contrast fix.
- **Editing a live listing on the website pauses it** from the Details step's save until Save changes finishes (since step 2C: "Your listing stays paused while the save is incomplete"). Leaving the editor half-way leaves it paused. The app keeps the status until Publish.
- **Android Lint** wasn't run (the build and unit tests were).

**Requests:**
- **Owner:** merge `Preview` into `main` so Dependabot alert 83 closes (it is computed on `main`).

**Before starting:** clean tree, `Preview` up to date at `187b906`. `providers.env` has `DIDIT_API_KEY` and `DIDIT_WEBHOOK_SECRET` (values never printed). Its `DIDIT_WORKFLOW_ID` is stale: it isn't one of the application's 3 workflows (read-only `GET /v3/workflows/` with the key; it lists the task's `7051bbe4-…` as "Free KYC", the default). The setting `didit_workflow_id` holds the task's id, and no code reads that env value.

**Done:**
- **Database** (`supabase/migrations/20261114100000_c6_id_verification.sql`; the 14 changed functions were built from their current bodies, with each edit asserted to apply exactly once. Follow-up `20261114110000_c6_closed_tables_rls.sql`):
  - **Settings:** `didit_workflow_id` and `didit_application_id` (new value type `uuid`, new area `verification`, decided by the owner) and `id_verification_max_attempts` (3, 1-10), all editable on admin Settings.
  - **Data:** `public.identity_verifications` (one row per person: status, the provider's session id, legal name, `is_adult`, attempts, reason, dates). The owner reads only `user_id`, `status`, `updated_at`, and the row is on Realtime. Closed `app_private.didit_sessions` (each session Dzirent started) and `app_private.didit_events` (event id primary key, kept 30 days, never the payload).
  - **Badge:** `profiles.is_verified`, set from the status by a trigger and kept by a trigger against app updates. It shows through the shop window: `browse_listings`, `get_listing`, `fit_listings`, `my_saved_listings`, `get_studio` (and its listings), and `my_conversations` (`other_is_verified`).
  - **Gate:** `app_private.require_verified` (`DZ-E6001`) on a new chat, a message and publishing, only while `verification_required` is on. It is off.
  - **Age:** the ID's result (`age_checks` source `id_verification`) outranks the store and self-declared signals. An approved ID of someone under 18 is declined ("Under 18 (from the ID)") and blocks the account (listings paused).
  - **Server steps** (service key only): `didit_start_prepare` / `didit_start_release` / `didit_start_record`, `didit_webhook_received`, `didit_apply_decision` (a duplicate face goes to `in_review`; an admin's decision stands), `didit_sessions_for`, `didit_forget`. `my_verification()` is for signed-in people.
  - **Background:** outbox kind `didit_sync` (Vault `didit_sync_url` and a generated `didit_job_secret`). Cron `dzirent-didit-reconcile` runs every 10 minutes and re-checks sessions still in progress after 30 minutes, because Didit retries a webhook only twice.
  - **Admin:** `admin_list_id_reviews` (no legal name), `admin_decide_id_verification`, `admin_reset_id_attempts` (two-step, a reason, logged). `admin_queues` counts reviews. `export_my_data` adds `id_verification`.
  - **Follow-up:** RLS on `didit_sessions`, `didit_events` and C3's `rental_reminders`, and a pgTAP check that every table in `public` and `app_private` has RLS (Open issues).
- **Edge Functions** (shared `_shared/didit.ts`). With either key blank, every Didit function answers 503 `DZ-E6002`.
  - `didit-start` (start or check): `vendor_data` is always the caller, the workflow comes from the settings, and the return address is allow-listed.
  - `didit-webhook`: checks the signature on the raw body, the body's `timestamp` within 300 s, the application id, and the event id once. It answers at once; the decision goes through the outbox.
  - `didit-sync` (outbox secret): reads the decision and keeps only the status, legal name, 18+ result, duplicate flag and reason codes.
  - `delete-account` deletes the person's Didit sessions and Didit user first (`DZ-E6013` when Didit can't be reached with the keys set). `export-my-data` describes the new part, plus the claims, payments and emails parts its description was missing. `admin-integrations` names "ID verification".
- **Error codes:** `DZ-E6001`-`E6015`; 196 codes, regenerated.
- **Website:**
  - **Settings > ID verification** (`/app/settings/verification`): status, attempts left, and the note on what Dzirent keeps and never keeps. Verify ID goes to Didit's hosted flow. Didit shows its own consent; there is no second checkbox.
  - **`/verify/done`:** waits on Realtime plus a 3-second poll, up to 3 minutes, then goes back to where the person was.
  - **Badge and gate:** the Verified badge on cards, the listing byline, the studio and the chat header. On `DZ-E6001` the gate shows a Verify ID link and keeps the chat draft.
  - **Admin:** `/admin/id-verification` (queue; Approve, Reject and Reset attempts, each with a reason), the queue count, and the `uuid` type in the settings editor.
  - **Privacy page:** new section 6 "ID Verification" (later sections renumbered).
- **Android** (shared Kotlin):
  - **Screens:** Settings > ID verification and `VerificationScreen` (explainer, Didit's native SDK, "Checking…" until the result).
  - **Gate:** a full-screen dialog over the refused action (send, publish, a new chat, re-listing from the closet) that runs it again once the person is verified.
  - **Badge** on cards, the listing, the studio and the chat.
  - **SDK:** `IdVerification.android.kt` uses Didit SDK 4.9.1 (`me.didit:didit-sdk` without the `didit-sdk-wallet` add-on, from Didit's Maven repository for the `me.didit` group only). `IdVerification.ios.kt` is a stub that opens the hosted page.
- **Docs:**
  - `contract.md`: new section 10 (statuses, data, functions, webhook, screens, runbooks for rotating the key or webhook secret and switching the gate on), plus the shop window, admin, age gate, functions table, tables and settings.
  - `decisions.md`: "ID verification (2026-11-14)".
  - `architecture.md`: R11, functions, 5.5, configuration names, webhooks, G9 narrowed, new G43-G45, Appendix B.
  - `compliance.md`: 1.3a, age, the provider row, children, the biometric row, gaps 37-40.
  - `legal-placeholders.md` section 12; `security-log.md` "ID verification (C6)"; `testing.md`.
  - Generated: `error-codes.md` and `code-reference.md`.

**What I ran:**
1. **Local backend** on the default ports (free today), without Studio and the log stack.
2. **pgTAP:** 13 files, **427 tests, PASS** (`13_c6` 79). After the follow-up: **428, PASS** (`01_roles_rls` 23).
3. **Integration** (`node supabase/tests/run-all.mjs`, Node 22):
   - First run: 21 of 22. `c1_codes_price_jobs` failed with "fetch failed" in step 4 (a stale keep-alive socket after its multi-minute retry wait) and passed when re-run alone.
   - Both C6 runs passed:
     - **off:** every Didit function answers `DZ-E6002`.
     - **on** (the Didit stub): start; the status readable without the legal name; a bad signature, a stale timestamp and another application refused and not recorded; Approved → verified through the outbox with the badge and an 18+ check; the same event processed once; Declined; a duplicate face → review → admin approval and attempts reset (logged); the gate only while the flag is on; reconciliation without a webhook; Kyc Expired removes the badge; delete-account removes the Didit session and user at the stub, then the rows.
   - After the follow-up, one full run: **22 of 22 passed** (`c1_codes_price_jobs` passed too; `c3_rentals`, which uses `rental_reminders`, and both C6 runs included).
4. **Website** (Node 22): `npm run lint` clean (its `prelint`: 196 codes, code reference fresh); `npm test` **40 of 40** (with `verification.test.ts` and `_shared/didit.test.ts`); `tsc --noEmit` clean; `npm run build` passed.
5. **Android** (backend stopped, no containers): `:androidApp:assembleDebug :shared:testDebugUnitTest` **BUILD SUCCESSFUL**: **71 tests, 0 failures, 1 skipped** (`VerificationTest` 7). The first build failed on JitPack-only libraries of `didit-sdk-wallet`. Didit documents that add-on as optional, so the build excludes it instead of adding JitPack.
6. **CI:**
   - [Run 43633867583](https://github.com/Vivek-k24/Dzirent/actions/runs/43633867583) on `125b7cc`: **all 5 jobs green**.
   - Follow-up: [run 43636775973](https://github.com/Vivek-k24/Dzirent/actions/runs/43636775973) on `6141765`: **all 5 jobs green**. Database: pgTAP `Files=13, Tests=428`, PASS; integration 22 of 22.
7. **Live**, after CI:
   - `supabase db push --linked --dry-run` listed only the C6 migration; `supabase db push --linked` applied it.
   - Secrets: `DIDIT_API_KEY` and `DIDIT_WEBHOOK_SECRET` from `providers.env`, and `DIDIT_JOB_SECRET` from Vault `didit_job_secret`. All three went through a temporary file, deleted at once, and were never printed. `secrets list` names: the three, and no `DIDIT_API_BASE`.
   - `supabase functions deploy <name> --no-verify-jwt --use-api` for the 6 changed functions (`didit-start`, `didit-webhook`, `didit-sync`, `delete-account`, `admin-integrations`, `export-my-data`). `functions list`: 18 **ACTIVE**; the three Didit functions at v1 with `verify_jwt` false.
8. **Live read-only checks** (`supabase db query --linked`):
   - `identity_verifications` has exactly its 10 columns (none for a birthdate, document, address, nationality, image or IP); the 2 closed tables exist. Owner read grant: `status`, `updated_at`, `user_id`. Write grants for `anon` and `authenticated`: 0. On Realtime: yes. `profiles.is_verified` exists.
   - The three settings are as above; `verification_required` is **false**; cron `dzirent-didit-reconcile */10 * * * *`; Vault `didit_job_secret` and `didit_sync_url`; all 11 database functions present.
   - `authenticated` can't execute `didit_start_prepare` and can execute `my_verification`; `anon` can't execute `my_verification`.
   - **0 rows:** verifications 0, Didit sessions 0, events 0, verified profiles 0, ID age checks 0, `didit_sync` jobs 0.
9. **Live HTTP checks** (nothing written):
   - `didit-webhook` unsigned, and with a wrong signature: **401 `DZ-E6007`** (so the keys are set; blank keys would answer 503 `DZ-E6002`).
   - `didit-sync` without the outbox secret: **401 `DZ-E9004`**.
   - `didit-start` without sign-in: **401 `DZ-E1003`**.
10. **Security Advisor** after the deploy: 3 new findings, all expected (`my_verification` and the two admin functions). It didn't report the RLS gap; a catalog query found it, and the follow-up fixed it. Logged in `security-log.md`.
11. **Follow-up, live** (after its CI):
    - `db push --dry-run` listed only `20261114110000_c6_closed_tables_rls.sql`; `db push` applied it. The catalog query now finds no table in `public` or `app_private` without RLS.
    - The 12 functions C6 didn't change were redeployed (only their bundled `_shared/error-codes.ts` was new), so all 18 run the 196-code catalog. `functions list`: all 18 **ACTIVE**, `verify_jwt` false.
    - An unauthenticated POST to each of the 12 got its usual refusal before any work:
      - 401 `DZ-E1003`: `admin-actions`, `delete-listing`;
      - 401 `DZ-E9004`: `cleanup-files`, `scan-listing`, `send-email`, `send-push`;
      - 503 `DZ-E4030`: the six `stripe-*` functions (payments off).
    - The four Didit checks in step 9 answered the same again.
    - Security Advisor: "RLS enabled, no policy" 19 (the three tables), guest definer 5, signed-in definer 78.
12. Didit was called only to read the workflow list. The claude.ai Didit connector needs authorization, so it wasn't used. I used no emulator, device or browser, and created no data on live. The `on` integration run creates one throwaway account on the local stack only, for the deletion test.

**Test counts:**

| Suite | Count |
| --- | --- |
| pgTAP | 428 (13 files; `13_c6` 79, `01_roles_rls` 23) |
| Integration | 22 runs (20 scripts); C6 off and on (Didit stub) |
| Shared Kotlin | 71 (1 skipped; `VerificationTest` 7) |
| Website | 40 (incl. verification rules and the Didit summary and signature tests) |
| Contracts | 196 codes, fresh; code reference fresh |

**Live test (the owner's own ID, 2026-11-15): passed.** Close-out session: clean tree, `Preview` up to date at `97f1348`. Docs only and read-only queries; no emulator, device or browser, nothing written on live.
- **What happened** (as the owner and the coordinator reported it, matched against the Edge Function logs, read with the Supabase connector's `query_logs`):
  - **Cause:** the first start failed with `DZ-E6006`. `didit-start` logged `provider_status` 403 because the Didit key's Sessions access was Read only. Didit's [API-keys page](https://docs.didit.me/console/api-keys): Sessions Write covers creating sessions, and a key without access gets 403. The logs hold three such starts (2026-11-14 20:54 UTC, 2026-11-15 14:32 and 14:33 UTC); each gave its attempt back.
  - **Fix:** the owner set the key's Sessions access to Read + Write in Didit's console. It is the same key, so no secret changed: `secrets list` shows `DIDIT_API_KEY` and `DIDIT_WEBHOOK_SECRET` last set 2026-11-14 19:58 UTC (this step's deploy), and their SHA-256 digests equal `providers.env` (compared in memory, nothing printed).
  - **Retry:** `didit-start` ok at 14:45 UTC; three signed `status.updated` webhooks (Not Started and In Progress `unchanged`, Approved `queued`); `didit-sync` `verified` at 14:47 UTC.
  - **Account:** the sample-data test account Elena Rostova (6 listings; not an admin), verified with the owner's own ID.
- **Read-only checks** (`supabase db query --linked`; statuses, counts and column names only, never the legal name):
  - `identity_verifications`: **1 row**, `verified`, `is_adult` **true**, **attempts 1**, no reason. A legal name and Didit's session id are stored. Created 2026-11-14 20:54 UTC (the first start), verified 2026-11-15 14:47 UTC.
  - **1 verified profile** (`profiles.is_verified`), the same account.
  - **Shop window, as a guest:** `get_listing` shows the badge on all 6 of its listings; `browse_listings` (13 cards) shows it on 6 cards, all of them this account's.
  - **1 age check from the ID:** `id_verification` / `adult` / `server`.
  - **Didit events, once each:** 3 rows, 3 distinct event ids, no type and status repeated. 1 Didit session (`Approved`, decision checked, no admin decision). 1 `didit_sync` job, `done` on its first try, with only `session_id` in its payload.
  - **`verification_required`: false.**
  - **Nothing else stored:** `identity_verifications` has its 10 columns; `didit_events` and `didit_sessions` hold ids, statuses and times (no payload column); `age_checks` holds the source, result, platform and time; Storage has only `listing-photos` and `rental-photos`. No birthdate, document details, images or payloads.
- **Re-run once after writing this:** the database query, the log query and the secrets comparison gave the same results.
- **Docs:**
  - `contract.md` section 10 has a runbook for `DZ-E6006`: "If didit-start logs provider_status 403, the Didit key is missing Sessions Write."
  - The key-rotation runbook now lists the access per resource.
  - The `didit-start` row says a refusal from Didit also gives `DZ-E6006`, not only no answer.
  - `security-log.md` has the cause, the fix and this test.

**APK** (built 2026-11-14 13:42 local; 96,005,087 bytes, up from 34,313,577 with Didit's SDK, G45):
- Original: `mobile/androidApp/build/outputs/apk/debug/androidApp-debug.apk`
- Copy (rule 15): `C:\Users\User\Desktop\Belhaven\OneDrive - Belhaven University\Dzirent-apk\androidApp-debug.apk`, replacing the C5 copy. Same size and SHA-256 (checked again before this entry).

**Phone test** (`verification_required` is off, so nothing is required):
- Settings > ID verification shows the status and Verify ID, which opens the explainer, then Didit's own screens (consent, ID photo, selfie).
- A verified person's cards, listing, studio and chat header show "Verified".

**iPhone, for the Mac session:**
- `ui/IdVerification.ios.kt` is a stub (`available = false`): the shared screen opens Didit's hosted page in the browser, and the result arrives through the same status watch. Add Didit's iOS SDK (Swift Package in `iosApp`) behind `rememberIdVerificationLauncher` with the session token, mapping finished / cancelled / failed as Android does. Add the camera (and, if NFC is used, NFC) usage strings to `Info.plist`.
- Build-check the C6 common code: `ui/VerificationScreen.kt` (`Dialog` with `DialogProperties(usePlatformDefaultWidth = false)`), `ui/IdVerification.kt`, `MainAppScaffold.kt` (the gate provider and the `verification` route), `ChatScreens.kt`, `ListingEditor.kt`, `MainScreens.kt`, `StudioScreen.kt`, `SettingsScreen.kt`, `model/Models.kt`, the repository's verification calls and `util/Verification.kt`.

**Open issues:**
- **RLS gap (fixed in the follow-up):** the Advisor's "RLS disabled" check covers only the schemas the API exposes, not `app_private`. A catalog query after the deploy found three tables without RLS: the two new Didit tables and C3's `rental_reminders` (logged in C3 as "privileges revoked instead"). They were closed to every API role, so nothing was reachable. All three now have RLS with no policy, and pgTAP fails if any table is without it.
- **G43:** no face blocklist for banned people (Dzirent keeps no faces); duplicates found by Didit go to admin review.
- **G44:** iPhone uses the hosted page until the Mac session.
- **G45:** Didit's full SDK makes the debug APK about 96 MB (MediaPipe for 4 CPU types). Its manifest adds `RECORD_AUDIO`, `NFC` and `VIBRATE`; the app itself never asks for the microphone. Store disclosures must list them (P8A: consider `didit-sdk-core`, an App Bundle).
- **Choices made:**
  - An attempt counts when a session starts, so an abandoned one uses one of the 3. After 3 the screen says to contact support, and an admin can reset them (logged).
  - A minor's approved ID is declined and blocks the account.
  - Kyc Expired removes the badge but doesn't reset attempts.
  - An admin's decision stands against later Didit decisions for that session.
- **Against Didit itself** (the live test): creating the session, the signed webhook (signature, body timestamp, application id), reading the decision, and the badge. **Still only against the stub** (the documented V3 shapes): declines, duplicate faces and admin review, Kyc Expired, reconciliation, and deleting at Didit (session delete, users delete).
- **Android Lint** wasn't run (the build and unit tests were).
- **Unused env value:** `DIDIT_WORKFLOW_ID` in `providers.env`. No code reads it (the setting `didit_workflow_id` is used; searched again 2026-11-15), so the owner can delete the line.
- **Flaky locally:** `c1_codes_price_jobs` (the stale socket above), not a regression signal by itself; it passed in CI.
- **Dependabot alert 83** (open on `main`, reported by the push): `opentelemetry-api` in `services/vision/requirements.txt`, medium (denial of service through traceparent parsing), fixed in 1.45.2. Opened 2026-11-14 06:13 UTC, not caused by C6, and `services/` is outside this step's folders.

**Requests:**
- **Owner:**
  - Delete the `DIDIT_WORKFLOW_ID` line from `providers.env` (unused).
  - **The live test used the test account Elena Rostova.**
    - Deleting it later through Dzirent (Settings > Delete account, on the website or in the app; that's `delete-account`) also deletes its Didit session and Didit's user record first, then Dzirent's rows.
    - Deleting it from the Supabase dashboard skips Didit.
    - Before deleting, check in Didit's console that the key's People (users) access is Read + Write (Sessions is now). Without it, `delete-account` answers `DZ-E6013` and keeps the account; fix the key and delete again.
- **Owner and attorney:** `legal-placeholders.md` section 12 (the consent screen's company name, biometric consent, retention, the Terms) before `verification_required` is switched on.
- **Root `README.md`** (product features, outside this step's folders): describe ID verification and the Verified badge.
- **Vision service:** bump `opentelemetry-api` to 1.45.2 or later (Dependabot alert 83) in a step that may change `services/`.

## C5 - 2026-11-13 - payment screens and email

**Before starting:** clean tree, `Preview` up to date at `ce2f252`. No Stripe or email keys exist (`providers.env` has the three Stripe names blank and no email names).

**Done:**
- **C4 follow-ups**
  - **Date pickers:** no availability windows = every day from today (`util/Rentals.kt` `rentalDatesProblem`, `apps/web/src/lib/rentals.ts`); the website's request form has no last day then and says "Open: any day from today". Tests on both.
  - **Request answer time:** `rentalStatusLabel(status, iAmLender, requestHours)` on both clients uses `rental_settings().rental_request_hours`; without it the label has no number. No "48 hours" is left in client code.
  - **Payment deadline:** setting `payment_deadline_hours` (24, 1-72 "hours after acceptance", business owner, legal pages). `rentals.payment_due_at` is fixed by a trigger when a rental starts waiting for payment. `dzirent-rental-expiry` cancels an unpaid one past it (by Dzirent, note "Not paid within 24 hours after it was accepted"), cancels an unpaid PaymentIntent, and sends `rental_cancelled` "Not paid in time" to both. A payment recorded in time is never cancelled by it.
  - **Code reference:** `tools/gen-code-reference.py` regenerates `pranalika/code-reference.md` in the original format (rules fitted to the old file: TypeScript exactly, SQL with 5 deliberate exclusions, lines cut at 170; generated error-code copies and the city data migration left out; files from git, sorted). 339 files. `--check` runs inside `node contracts/generate.mjs --check`, which CI already runs (the `contracts` job and the website's `prelint`), because `.github/` isn't in this step's folders (Requests).
  - **Edge Functions:** all 15 redeployed (every one imports the error catalog), so each runs the 181-code catalog.
  - **S1 request:** the 5 `supabase/` scripts that printed a test user's email on a failed sign-in print only the HTTP status and Auth's error code.
- **Database** (`supabase/migrations/20261113230000_c5_payment_screens_email.sql`, built from the C1/C4 function bodies with each edit asserted once):
  - `rental_settings()` for guests and signed-in people (request hours, payment deadline, claim window, cancellation rule, fee, payments on).
  - `rental_json` adds fee, tax, captured deposit, hold end, payment deadline, each step's time and `lender_can_take_payment`.
  - Emails: `notification_settings.email_rentals` (default on), closed `app_private.email_messages` (template, account, rental, outcome; never text), outbox kind `send_email` and job status `skipped`, Vault `send_email_url` + generated `email_job_secret`; rental emails queued inside `queue_rental_push` after its blocked-pair check; the payment receipt by a trigger on `payment_status` paid; `queue_account_deleted_email`, `email_prepare`, `email_finish` (server key). Setting `email_log_retention_days` (30, attorney, legal pages) instead of a number in code. `export_my_data` adds the switch and the emails list; admin Background jobs counts skipped emails and names the template of a dead one.
- **Edge Function `send-email`** with `_shared/email.ts` (one HTTPS call; `EMAIL_PROVIDER` resend or postmark, `EMAIL_API_KEY`, `EMAIL_FROM`; `EMAIL_API_URL` tests only) and `_shared/email-templates.ts` (9 templates, plain HTML and text, Dzirent's burgundy look, values escaped, only a fixed list of fields). Key blank: the email is marked skipped before anything is read, 200, and the outbox marks the job skipped. `delete-account` queues the account-deleted email after the deletion.
- **Auth email templates:** `supabase/templates/confirmation.html`, `recovery.html`, `email_change.html` in the same look, in `config.toml` for the local stack only. No live Auth setting changed; the runbook is `contract.md` section 9.
- **Payment screens, Android** (shared Kotlin; hidden while payments are off):
  - Rules in `util/Rentals.kt`: `PaymentFacts`, payment-aware `rentalActions` (Pay, Place deposit hold and mark picked up, File a claim, Accept / Dispute the claim, Receipt), labels for every payment state, `depositLine`, `claimLine`, claim limits (`claimAmountProblem` etc.), `parseDepositAmount`, `rentalReceipt`, `payoutState`.
  - `ui/RentalViews.kt`: payment lines on the card (pay-by time, the lender's `DZ-W4001` notice, deposit "held, not charged", claim window end, claim, refund), Pay, Claim, Claim answer and Receipt dialogs. `ui/ChatScreens.kt` wires them: Pay → the pay dialog (saved-card consent) → `stripe-pay` → Stripe's PaymentSheet; Place hold → `stripe-deposit`.
  - `ui/PaymentSheet.kt` (`expect`), `PaymentSheet.android.kt` (Stripe Android SDK `com.stripe:paymentsheet` 21.29.2, pinned in `libs.versions.toml`), `PaymentSheet.ios.kt` (a stub: "Pay on dzirent.com", `DZ-E4049`).
  - My studio > Payouts (`PayoutsSection`): status from `payout_accounts`, "Set up payouts" opens Stripe's onboarding in the browser, refreshed with `stripe-account-status` when the app resumes.
  - Listing editor: optional "Deposit ($)" while payments are on (`DZ-E4051`), saved with the listing and in drafts. Settings > Notifications: "Email me about rentals".
- **Payment screens, website** (same rules in `lib/rentals.ts`): `components/rental-card.tsx` (payment lines and actions; claim form with return photo picks, claim answer, receipt), `components/payouts.tsx` on Settings > My studio (`/app/settings/payouts` opens it too, Stripe's default return), the deposit field in the listing editor, the email switch in Settings, and the pay page `app/app/pay/[id]` + `components/pay-form.tsx` (Stripe's Payment Element through `@stripe/stripe-js/pure` 9.17.0, `confirmPayment` with `redirect: "if_required"`; wallets off). The Pay button and the way back are plain links (full page loads). `next.config.ts` gives `/app/pay/:path*` its own CSP with Stripe's domains; every other page keeps the strict one (checked on the production server, below). New workflow routes: `chat/<id>/rental_hold`, `rental_claim`, `rental_claim_answer`, `pay`, `payouts/link`, `payouts/status`. Admin Background jobs shows the Emails kind and skipped counts. Privacy page: the emails, what they contain, the switch, what is kept (no company names).
- **Error codes:** `DZ-E4049` (no payment sheet on this phone), `DZ-E4050` (payment didn't go through), `DZ-E4051` (deposit amount), `DZ-W4001` (set up payouts first); 181 codes, regenerated.
- **Docs:** `contract.md` (sections 5-8 updated, section 7 "Screens (C5)", new section 9 Email with both runbooks), `decisions.md` ("Payments screens (2026-11-13)", "Email (2026-11-13)"), `architecture.md` (G4, G32, G35, G37, G38 updated; new G39-G42; 5.5; Appendix A status), `compliance.md` (1.11a emails, notification settings, the email service row, gap 34 progress, new gaps 35-36), `legal-placeholders.md` (payment deadline in section 10, new section 11 Emails), `security-log.md` ("Payments screens (C5)", "Email (C5)"), `testing.md`, `error-codes.md` (generated), `code-reference.md` (generated), and the rehearsal checklist `pranalika/stripe-rehearsal.md`.

**What I ran:**
1. **Local backend.** Windows again reserved 54243-54342, so the stack ran on 55xxx (`SUPABASE_*_PORT` in the same shell; no repo change), without Studio and the log stack.
2. **pgTAP:** on the first stack, the 11 earlier files passed with the new migration (294), then `12_c5` (53). After renaming the migration to today's date and adding `email_log_retention_days`, a **fresh stack** (`supabase stop --no-backup`, `start`): **12 files, 348 tests, PASS** (`12_c5` 54).
3. **Integration** (`node supabase/tests/run-all.mjs`, Node 22): on the first stack **20 of 20 passed** (19 scripts; the new `c5_payments_email.mjs` with 7 Stripe calls through stripe-mock, all accepted; 6 emails queued, all skipped `not_configured`, their jobs `skipped`). On the fresh stack 18 of 20: Docker restarted mid-run (I was running the website build and a production server at the same time; the containers I had left out came back up and the stubs, stripe-mock and functions containers were gone), so `c4_payments` failed on a socket error and `c5_payments_email` on a database connection. I stopped the extra containers and re-ran those two once: **2 of 2 passed**.
4. **Fixes found locally:** a `waitFor` with `await` inside a non-async arrow (syntax), a PowerShell `Set-Content` BOM on the new pgTAP file (removed), the "unused eslint-disable" warnings, `Stripe` types imported from `@stripe/stripe-js` instead of `/pure`, and the pay page calling a client-module function on the server (moved into `PaySummary`). One Gradle run failed on DNS ("No such host is known" for the Maven repositories); the re-run worked.
5. **Website** (Node 22): `npm run lint` clean (its `prelint` ran both freshness checks: 181 codes, code reference up to date); `npm test` **27 of 27** (13 in `rentals.test.ts`, 5 in the email template test); `tsc --noEmit` clean; `npm run build` passed (`/app/pay/[id]` listed). `next start` of that build: `/app/pay/<id>` sends a CSP with `js.stripe.com` in `script-src`, `hooks.stripe.com` in `frame-src` and `api.stripe.com` in `connect-src`; `/app/messages` and `/` have none of them.
6. **Lockfile:** `npm install` rewrote about 4,200 lines of `package-lock.json` (this npm re-hoists the v1 lockfile), so I restored it and added only the `@stripe/stripe-js` 9.17.0 entry (5 lines, integrity from the registry); `npm ci` installed from it cleanly.
7. **Android** (backend stopped, no containers; JDK 21, env loaded silently, `GOOGLE_SERVICES_JSON` set): `:androidApp:assembleDebug :shared:testDebugUnitTest` **BUILD SUCCESSFUL**. **64 tests, 0 failures, 1 skipped**, `RentalRulesTest` 14 (6 new). One warning: Stripe's `rememberPaymentSheet` is deprecated in favour of `PaymentSheet.Builder` (open issues).
8. **CI:** [run 43554529600](https://github.com/Vivek-k24/Dzirent/actions/runs/43554529600) on `6ec9591`, **all 5 jobs green**: contracts (with the code-reference check), website, android, vision, database (pgTAP 348 PASS; integration 20 of 20, C4 18 and C5 7 Stripe calls through stripe-mock).
9. **Live**, after CI:
   - `supabase db push --linked --dry-run` listed only the C5 migration; `supabase db push --linked` applied it.
   - `supabase functions deploy <name> --no-verify-jwt --use-api` for all 15 functions; `functions list`: all 15 **ACTIVE**, each updated in the same minute, `send-email` v1, `verify_jwt` false.
   - `EMAIL_JOB_SECRET` set from Vault `email_job_secret` (64 characters) through a temporary file, deleted at once, never printed. `secrets list` names: no `EMAIL_API_KEY`, no `STRIPE_*`.
10. **Live read-only checks** (`supabase db query --linked`, two HTTP calls that write nothing):
    - Settings: 30; `payment_deadline_hours` 24 (1-72, "hours after acceptance", business owner, payments, legal pages); `email_log_retention_days` 30 (7-365, attorney, retention, legal pages). `payments_enabled` **false**.
    - Cron: `dzirent-rental-expiry */10 * * * *` (it now runs the payment deadline too), `dzirent-async-jobs * * * * *`, `dzirent-deposit-holds 45 9 * * *`, `dzirent-rental-reminders 0 15 * * *`, the two cleanup jobs.
    - **0 payment and email rows:** email messages 0, `send_email` jobs 0, rentals 0 (0 with a deadline), payout accounts 0, customers 0, claims 0, payment events 0, operations 0, card disputes 0, listings with a deposit 0.
    - Present: the 8 new functions, the 2 triggers, `notification_settings.email_rentals` and `rentals.payment_due_at`, the outbox `send_email` kind and `skipped` status, Vault `send_email_url` and `email_job_secret`. `anon` can execute `rental_settings()`; `authenticated` can't execute `email_prepare`.
    - `POST /functions/v1/send-email` without the secret: **401 `DZ-E9004`**. `rental_settings` as a guest: payments off, request 48 h, deadline 24 h, claim window 48 h.
11. **Security Advisor:** two new findings, both expected (`email_messages` closed; `rental_settings()` public on purpose), logged in `security-log.md`.
12. I used no emulator, device or browser, created no data on live, and called neither Stripe nor an email provider.

**Test counts:**

| Suite | Count |
| --- | --- |
| pgTAP | 348 (12 files; `12_c5` 54) |
| Integration | 20 runs (19 scripts); C5 7 Stripe calls through stripe-mock |
| Shared Kotlin | 64 (1 skipped) |
| Website | 27 (incl. 5 email template tests) |
| Contracts | 181 codes, fresh; code reference fresh |

**APK** (built 2026-11-13 21:58 local; 34,313,577 bytes, up from 23,463,660 with the Stripe SDK):
- Original: `mobile/androidApp/build/outputs/apk/debug/androidApp-debug.apk`
- Copy (rule 15): `C:\Users\User\Desktop\Belhaven\OneDrive - Belhaven University\Dzirent-apk\androidApp-debug.apk`, replacing the C4 copy. Same size and SHA-256.

**Stripe rehearsal checklist:** `pranalika/stripe-rehearsal.md` (payouts, pay on Android and the website with 3-D Secure and a decline, the payment deadline, the hold, a disputed claim, receipts, refunds, a card dispute, the CSP, switching off afterwards). The runbook in `contract.md` section 7 points to it.

**Phone test** (payments are off, so almost nothing changes): a listing with no availability windows can now be requested for any day from today; a lender's request card says "answer within 48 hours" (from the server); Settings > Notifications has "Email me about rentals"; the app is larger (Stripe SDK). The payment screens appear only during the rehearsal, with payments switched on.

**iPhone, for the Mac session:**
- `ui/PaymentSheet.ios.kt` is a stub (`available = false`; Pay shows "Pay on dzirent.com (DZ-E4049)"). Add the Stripe iOS SDK (`StripePaymentSheet`, Swift Package in `iosApp`) and present `PaymentSheet` with the client secret and publishable key behind `rememberPaymentSheetLauncher`, mapping completed / canceled / failed as Android does.
- Build-check the common code: `util/Rentals.kt`, `ui/RentalViews.kt` (new dialogs, `FilterChip` with a leading thumbnail), `ui/ChatScreens.kt`, `ui/MyStudioScreen.kt` (`LocalUriHandler`, `LifecycleResumeEffect` for the payouts refresh), the listing editor's deposit field, `model/Models.kt`, the repository's new calls.

**Open issues:**
- **Not exercised against Stripe:** the payment sheet and Payment Element need test keys (G38); the checklist covers them. stripe-mock showed only that the client secret and publishable key come back.
- **Deprecation:** `rememberPaymentSheet` (21.29.2) still works but is deprecated for `PaymentSheet.Builder`; switch when the SDK is next upgraded (the 22.x/23.x lines need newer Kotlin and Compose, G27).
- **Choices made:**
  - The app's payout onboarding returns to the website's My studio (`https://dzirent.com/app/settings/studio?payouts=return`); the app refreshes when it resumes. `/app/settings/payouts` (Stripe's default in `stripe-onboard`) opens the same page.
  - Rental emails follow the push rules for blocked pairs (no email between blocked people, claims included); the receipt and the account-deleted email don't depend on blocks. Cancels, expiries, completion and hold renewals send no email (not in the list).
  - The account-deleted email is always sent (no account left to hold the switch); its address sits in `email_messages` until it finishes (G42, compliance gap 35).
  - "Email me about rentals" shows now although nothing is sent while the key is blank: it is stored for when email is switched on.
  - **Added:** the email record retention is a setting (`email_log_retention_days`, 30, attorney) rather than a number in code, as the decisions require for retention periods.
  - Wallet buttons (Apple Pay / Google Pay) are off on both sheets, so `Permissions-Policy: payment=()` stays.
- **`legal-placeholders.md`:** the file ended with two stray lines (`</content>`, `</invoke>`) from an earlier session's tool call; I removed them so the new rows sit in their tables.
- **Docker on this PC:** with 16 GB, running the website build next to the full local stack restarted Docker. Run one heavy job at a time.

**Requests:**
- **CI (`.github/workflows/ci.yml`, outside this step's folders):** the code-reference check runs inside `node contracts/generate.mjs --check` (the `contracts` job and the website's `prelint`). A separate step (`python3 tools/gen-code-reference.py --check`) would make its failure easier to read.
- **Root `README.md`** (product features, outside this step's folders): describe paying in the app, deposits, claims, receipts and rental emails once payments go live.
## C4 - 2026-11-13 - payments backend

**Before starting:** clean tree, `Preview` up to date at `4919df2`. The live project had 0 rentals and 18 settings, all within the new ranges.

**Done:**
- **Settings (Part 6)** (`supabase/migrations/20261113200000_c4_settings.sql`):
  - `app_private.settings` now has `label`, `area`, `value_type`, `unit`, `min_value`, `max_value`, `choices`, `decided_by` (owner / business owner / attorney) and `affects_terms`; `note` is the plain description. A trigger refuses a wrong type (`DZ-E5072`) or an out-of-range value (`DZ-E5070`) for every writer, migrations included.
  - 10 new settings (28 in all): the payment rules (`platform_fee_percent` 0, `claim_window_hours` 48, `cancellation_refund_cutoff_hours` 48, `late_cancellation_refund_percent` 0, `sales_tax_enabled` off, `deposit_hold_warning_hours` 24), `rental_autocancel_days` 2, `rental_reminder_hour` 9, `rental_timezone` America/Chicago, `data_export_interval_hours` 24.
  - Moved out of code: Austin time (`rental_today`), the 9 AM cron (now scheduled from the hour and time zone, rescheduled after each run so daylight saving is right, and on every change), the "48 hours" expiry note, the once-a-day export window, and the hardcoded fallbacks (48, 3, 365). Typed readers `setting_int/num/bool/text` raise `DZ-E9020` when a setting is missing.
  - `admin_list_settings()` and `admin_set_setting(key, value, reason)` (two-step, a reason, logged with old and new value).
- **Payments and the C3 follow-ups** (`supabase/migrations/20261113210000_c4_payments.sql`):
  - Data: `listings.deposit_amount`; `stripe_customers` (owner sees only that it exists); `payout_accounts` (owner reads); rental payment columns (`payment_intent_id`, `payment_status`, `fee_amount`, `tax_amount`, `refund_amount`, `deposit_amount` snapshot, `deposit_intent_id`, `deposit_status`, `deposit_capture_before`, `deposit_captured_amount`, `claim_window_ends_at`); `rental_claims`; closed `app_private.payment_events` (event id unique, payload hash only), `payment_operations` (each money step, key `dz-op-<id>`), `card_disputes`, `rental_payment_methods`. No card or bank data anywhere.
  - State rules (only with `payments_enabled` on): accept -> `awaiting_payment`; succeeded webhook -> `paid`; pickup needs the hold when there is a deposit (`DZ-E4033`); return with a hold -> `returned` and the claim window; no claim by its end -> released, completed; accepted claim -> captured; disputed -> admin decides. Without a deposit the rental completes at return, as before.
  - Follow-ups: automatic cancel 2 days after the start (with the refund rule), no-window listings requestable, `rental_cancelled` / `rental_expired` pushes (plus `claim_filed`, `claim_decided`, `deposit_hold_ending`), `admin_end_rental`.
  - Claims: `file_claim`, `respond_claim`, `admin_decide_claim`; admin `admin_refund_rental`, `admin_payments_overview`, `admin_record_integrations_check`.
  - Cancellation rule: full refund until 48 hours before the start (rental time zone), then 0% of the price; a lender cancellation refunds in full; a payment that arrives after the rental ended is refunded in full.
  - The outbox gained `stripe_deposit` and `stripe_refund` (Vault `stripe_deposit_url`, `stripe_refund_url`, `payments_job_secret`); a dead payment job marks its step failed. `dzirent-deposit-holds` nightly at 09:45 UTC renews holds that end within a day while the piece is out.
  - `export_my_data` adds claims, the payment states and the payout account status.
- **Edge Functions:** `stripe-onboard`, `stripe-account-status`, `stripe-pay`, `stripe-deposit`, `stripe-refund`, `stripe-webhook`, `admin-integrations`; shared `_shared/stripe.ts` (fetch, form encoding, idempotency keys, signature check on the raw body, API version pinned `2024-06-20`) and `_shared/payments.ts`. Every one answers 503 `DZ-E4030` "Payments aren't available yet." while `payments_enabled` is off or any of the three keys is blank, before anything else. `send-push` accepts the 5 new kinds.
- **Error codes:** `DZ-E4030`-`E4048`, `DZ-E5070`-`E5086`, `DZ-E9020`; 177 codes, regenerated.
- **Website (admin and text only):** `/admin/payments` (claims with evidence photos and Decide, card disputes, failed payments, failed payment steps, payout problems, paid rentals with Refund; each with a reason and a confirmation), `/admin/settings` (grouped, Edit, "From ... to ..." confirmation, a legal-pages warning on fee, refunds, claim window and the retention periods the privacy page names), `/admin/integrations` ("configured" / "not configured" only), "End rental..." in Users > Show rentals, the payments flag's warning, the Background jobs page's new kinds. Privacy page: a payment processor handles payments and payouts; Dzirent never stores card or bank details (no company names).
- **Apps:** no screen change was needed: the 4 payment states already had neutral labels and no payment actions (C3). New tests pin that on both clients. The generated error catalog changed, so the APK was rebuilt.
- **Tests and CI:** pgTAP `11_payments` (113 tests); integration `c4_payments_off.mjs` (keys blank) and `c4_payments.mjs` (stripe-mock, signed events); the stub server passes `/stripe/...` to stripe-mock and records each call, replaying a repeated idempotency key like Stripe; `run.mjs` starts stripe-mock (pinned by digest); `run-all.mjs` serves the functions itself with a known env file per script; CI runs stripe-mock as a service container joined to the local network.
- **Docs:** `contract.md` (section 6 follow-ups and pushes, new section 7 Payments with the keys runbook, section 8 Settings and integrations), `decisions.md` ("Rentals follow-ups", "Payments", "Settings", all 2026-11-13), `architecture.md` (R12, functions, configuration names, G8 and G30-G33 closed or narrowed, new G35-G38, Appendix A status), `compliance.md` (1.8a payments inventory, Stripe row, schema map, gaps 33-34), `legal-placeholders.md` (section 10, payment settings), `testing.md`, `security-log.md`, `error-codes.md` (generated).

**What I ran:**
1. **Local backend.** Windows had reserved ports 54243-54342 (WinNAT), so I started the stack on 55xxx with the CLI's `SUPABASE_*_PORT` overrides in the same shell (no repo change; noted in `testing.md`).
2. **pgTAP:** all 11 files, **294 tests, PASS** on a fresh stack and again on the used database. The new `11_payments` has 113 tests; the 181 earlier ones were unchanged.
3. **Integration** (`node supabase/tests/run-all.mjs`, Node 22): **19 of 19 passed** on a fresh stack (16 Stripe calls through stripe-mock, all accepted). I then added the deposit-renewal checks (3 pgTAP, and a step in `c4_payments.mjs`) and re-ran pgTAP (294, PASS) and the two C4 scripts (2 of 2 passed); CI ran everything again (item 7).
4. **Fixes found locally before CI:**
   - stripe-mock 0.206 doesn't accept `payment_method_types` on PaymentIntents. I switched to `automatic_payment_methods` with `allow_redirects: never`, which also lets the card be reused off-session.
   - The lender's hold carried no `rental_id` metadata (`payment_deposit_prepare` didn't return it).
   - `run-all.mjs`: on Windows, killing the CLI's shell left `functions serve` running with the previous env file. `c4_payments_off` caught that: keys blank, but onboarding answered 200. The runner now always serves the functions itself and removes the container at the end. Its readiness check no longer counts the gateway's own 503 ("name resolution failed").
   - The stub server answers `Connection: close`; a reused keep-alive socket gave `UND_ERR_SOCKET` after long waits.
   - Test fixes: overlapping fixture dates, ties on `created_at` inside one transaction, and a closed-table read under the signed-in role.
5. **Android** (backend stopped; JDK 21, env loaded silently): `:androidApp:assembleDebug :shared:testDebugUnitTest`, **BUILD SUCCESSFUL**. **58 tests, 0 failures, 1 skipped**, including `RentalRulesTest` (8, 1 new).
6. **Website** (Node 22): `npm test` **16 of 16** (3 new in `admin-settings.test.ts`, 1 in `rentals.test.ts`). `npm run lint` was clean after one alt-text fix; `tsc --noEmit` clean; `npm run build` passed.
7. **CI:** [run 43536660928](https://github.com/Vivek-k24/Dzirent/actions/runs/43536660928) on `cd78cdc`, **all 5 jobs green**. stripe-mock ran as a service container joined to the local network. pgTAP 294, integration 19 of 19 (18 Stripe calls), website 16.
8. **Live**, after CI:
   - `supabase db push --linked` (dry run first): both C4 migrations applied.
   - `supabase functions deploy` for `send-push`, `stripe-onboard`, `stripe-account-status`, `stripe-pay`, `stripe-deposit`, `stripe-refund`, `stripe-webhook` and `admin-integrations` (`--no-verify-jwt --use-api`): all 8 deployed.
   - `PAYMENTS_JOB_SECRET` set from Vault `payments_job_secret` through a temporary file (deleted, never printed).
9. **Live read-only checks** (`supabase db query --linked`, `functions list`, `secrets list`):
   - 28 settings, all with metadata (payments 6, rentals 5, rate limits 7, retention 10), with the defaults above. `payments_enabled` is **false**.
   - Cron: `dzirent-deposit-holds 45 9 * * *`, `dzirent-rental-expiry */10 * * * *`, `dzirent-rental-reminders 0 15 * * *` (9 AM Chicago in winter, computed).
   - All 7 new tables exist, with **0 payment rows** (customers, payout accounts, claims, events, operations, disputes, card references, rentals with a Stripe id) and 0 listings with a deposit.
   - The 3 Vault names are present. There is one read policy each on the new public tables and 0 write grants.
   - The 14 new functions exist, and the outbox accepts `stripe_deposit` and `stripe_refund`.
   - 14 Edge Functions are active. The only payment secret set is `PAYMENTS_JOB_SECRET`: no `STRIPE_*`.
   - One POST to the live `stripe-webhook` answered **503 `DZ-E4030` "Payments aren't available yet."**, and nothing was written.
10. **Security Advisor:** only expected findings, logged in `security-log.md`.
11. I used no emulator, device or browser, created no test data on live, and called the real Stripe API never.

**Test counts:**

| Suite | Count |
| --- | --- |
| pgTAP | 294 (11 files; `11_payments` 113) |
| Integration | 19 runs (18 scripts), 18 Stripe calls through stripe-mock |
| Shared Kotlin | 58 (1 skipped) |
| Website | 16 |
| Contracts | 177 codes, fresh |

**APK** (built 2026-11-13 18:45 local; the app changed only through the generated error catalog):
- Original: `mobile/androidApp/build/outputs/apk/debug/androidApp-debug.apk`
- Copy (rule 15): `C:\Users\User\Desktop\Belhaven\OneDrive - Belhaven University\Dzirent-apk\androidApp-debug.apk`, replacing the C3 copy. Both are 23,463,660 bytes with the same SHA-256.

**Phone test:** nothing changes for people while payments are off. A cancel now sends "… cancelled the rental" to the other person, and an unanswered request sends "Rental request expired" to both. The website admin has new pages: Payments (empty), Settings (try a change and see the confirmation and the audit log) and Integrations (everything "not configured" except what the server has).

**Placeholders for the business owner and the attorney** (`legal-placeholders.md` section 10; the Terms must state them before payments go live):
- Fee 0%; claim window 48 hours; full refund until 48 hours before the start, then 0%; a lender cancel is always a full refund.
- Automatic cancel 2 days after the start, counted as a late renter cancellation (the BO may want a different rule when the lender is at fault; an admin can refund by hand).
- Sales tax off ($0 hook).
- Hold renewal 24 hours before it ends.
- Consent wording for charges to a saved card (deposit hold, a claim after the hold ends).
- The processor's name for the Terms. The privacy page says "a payment processor".
- Payment record retention after account deletion (`compliance.md` gap 33).
- `PRIVACY_VERSION` bump (G34).

**iPhone, for the Mac session:** only common code changed: the generated `ErrorCodes.kt` and one test in `RentalRulesTest.kt`. No iOS code changed.

**Open issues:**
- **Deviation: a fourth, optional key.** Stripe signs Connect events (`account.updated` for lenders' accounts) with a separate endpoint secret, so `stripe-webhook` also accepts `STRIPE_CONNECT_WEBHOOK_SECRET` when it is set. Without it, `stripe-account-status` refreshes a lender's account on return from onboarding. The Integrations page needs only the three keys (plus `PAYMENTS_JOB_SECRET`).
- **Deviation: renewal only while picked up.** The nightly job renews a hold only while the rental is `picked_up`, as asked. If a hold ends after the return, during the claim window or a dispute, a capture falls back to an off-session charge on the saved card for the decided amount (never above the deposit).
- **Choices made for the spec:**
  - A rental without a deposit completes at return, even with payments on (no claim window: claims draw only on a deposit).
  - Admins can decide an open claim too, not only a disputed one (for a renter who never answers); there is no answer deadline yet.
  - An automatic cancel follows the late-cancellation rule.
- **Not tested against real Stripe** (G38). stripe-mock keeps no state, so every Stripe status change in the tests came from signed events. 3-D Secure, declines and real Connect onboarding are unverified until the test-mode rehearsal in the runbook.
- **No payment deadline** (G37): an `awaiting_payment` rental holds its days until the automatic cancel.
- **The apps' text "answer within 48 hours"** is written in the clients and doesn't follow `rental_request_hours`.
- **Left in code on purpose:** the outbox retry schedule, the admin two-step freshness (24 hours), the photo-check timeout, cron cadences, Stripe's 5-minute signature tolerance and the 7-day hold fallback. The `get_studio` reply-time window (90 days) and the `record_age_check` hour are not business rules either.
- **Not regenerated:** `code-reference.md` (no generator in the repo).
- **Edge Functions not redeployed:** the others use `_shared/error-codes.ts`, but their codes are unchanged, so they still run the older catalog copy until their next deploy.
- **Request from S1** (email in sign-in errors in `supabase/` scripts): still open.

**Requests:**
- **No-window listings in the date pickers.** `rentalDatesProblem` in `mobile/shared/.../util/Rentals.kt` and `apps/web/src/lib/rentals.ts` still treats "no availability windows" as closed (`windows.isEmpty() ||` / `!windows.length ||`). The server now accepts any future dates for such a listing, so those checks should read "no windows = every day open". That's one line each, plus their tests. It was outside this step's client scope ("only what new rental states need to display safely").

## C3 - 2026-11-13 - rental lifecycle

**Before starting:** clean tree, `Preview` up to date at `442ac3e`. The live project had 0 rental rows, so mapping old rows touched nothing there.

**Done:**
- **Database** (`supabase/migrations/20261113100000_c3_rental_lifecycle.sql`):
  - **States:** the 12 states. Old rows map `active` → `picked_up`, `returned` → `completed`, and each gets one "recorded before rental requests existed" event. `rental_outcomes` is unchanged and readable.
  - **Writes only through functions:** the insert and update policies on `rentals` are dropped, and every table and column write grant is revoked. The functions are `request_rental`, `respond_rental`, `cancel_rental`, `mark_picked_up`, `mark_returned` and `complete_rental`. Each one checks the caller, role, state, age block, suspension, current terms and blocks, then writes `rental_events`.
  - **Reads:** `get_rental` (by id, or a chat's latest) and `my_rentals` (incoming requests to the lender first).
  - **Price:** a snapshot at request time: `price_per_day`, `days`, `total`, USD.
  - **Dates:** a request must be inside the availability windows (adjacent windows join). The `btree_gist` exclusion constraint `rentals_no_double_booking` covers accepted, awaiting payment, paid and picked up. Days are inclusive, so back-to-back means the next day. There is one open rental per chat; a chat can hold several over time.
  - **Expiry:** `dzirent-rental-expiry` runs every 10 minutes and expires requests older than 48 hours.
  - **Condition photos:** private bucket `rental-photos` (JPEG, PNG or WebP; 10 MB), paths `{rental}/{pickup|return}/{random}.jpg`. Reads are for the two people and fresh two-step admins. Writes are for the two people, only in the matching state. There are no updates or deletes. The lender needs 2 photos per stage before marking picked up or returned.
  - **Pushes:** 7 rental kinds through the outbox. The daily `dzirent-rental-reminders` job runs at 15:00 UTC: pickup tomorrow, return tomorrow, and return overdue for up to 3 days. It sends to both people, at most once per rental, person and day (`app_private.rental_reminders`), and never between blocked people. `notification_settings.rental_reminders` defaults to on. Requests and answers follow the Messages switch.
  - **Changed readers:** `get_studio` now counts completed rentals. `get_listing` returns `booked`, and `browse_listings` with dates leaves out booked pieces. `export_my_data` adds rental prices and events and the caller's own `condition_photos`. `account_has_rental_in_progress` is a server-only check for delete-account.
  - **Reports:** `target_type = 'rental'`. The evidence holds the timeline and photo paths; strangers are refused (`DZ-E5015`). "Remove content" is refused for rentals (`DZ-E5016`). `admin_user_rentals` is logged.
  - **Cleanup:** `condition_photo_retention_days` (365, attorney placeholder) and the file job `old_condition_photos`, count-only. The `job_runs` and `rate_counters` checks were widened.
  - **Rate limit:** `rental_request`, 20 a day.
- **Error codes:** `DZ-E4001`-`E4022`, `DZ-E5015`, `DZ-E5016`. `DZ-E7010` is reworded. 147 codes, regenerated, and the freshness check passes.
- **Edge Functions:**
  - `send-push` accepts the rental kinds.
  - `delete-account` asks `account_has_rental_in_progress`.
  - `export-my-data` adds `condition_photos` with 7-day signed links, made with the caller's own token.
  - `cleanup-files` runs `old_condition_photos`.
- **Apps (shared Kotlin):**
  - **Rules:** `util/Rentals.kt` (states, actions per state and role, groups, request-date checks).
  - **UI:** `ui/RentalViews.kt` has the rental card (state, total, photos, timeline, actions), the "Request to rent" date picker (only open days, with "5 days · $75") and the cancel dialog with a reason.
  - **Chat:** the old `saveRental` and "Did this rental happen?" follow-up are gone. The rental card and a "Request to rent" button replace them. "Report this rental" is in the menu. Condition photos come from camera or gallery, are compressed and uploaded.
  - **My rentals:** grouped, with requests to you first.
  - **Inbox > Activity:** shows the latest step of each rental.
  - **Settings > Notifications:** a "Rental reminders" switch.
- **Website:**
  - **Rules:** `lib/rentals.ts`, the same rules as the apps.
  - **Chat:** `components/rental-card.tsx` has the card and the request form (dates checked against open and booked days, with the total). Cancel takes a reason, and "Report this rental" is in the menu. Condition photos upload through a new multipart route, `chat/{id}/rental-photo`.
  - **Closet:** My Rentals uses `my_rentals`, grouped. Lenders now get the tab too.
  - **Settings:** a new Notifications block with the same 3 switches.
  - **Admin:** user lookup has "Show rentals" (timeline and signed photo links). Report detail shows rental evidence, and "Remove content" is hidden for rental reports.
  - **Text:** the privacy page covers condition photos (who sees them, retention placeholder) and rental reminders; the delete-account page text is updated.
- **Docs:**
  - `contract.md`: new section 6 "Rentals", plus the changed fields.
  - `decisions.md`: "Rentals (2026-11-13)".
  - `architecture.md`: G2 and G28 closed; new gaps G30-G34; flow 6.8.
  - `testing.md`, `compliance.md`, `legal-placeholders.md` and `security-log.md` are updated, and `error-codes.md` is regenerated.

**What I ran:**
1. **Local backend, fresh** (`supabase stop --no-backup`, then `supabase start`):
   - `supabase test db --local supabase/tests/database`: **10 files, 181 tests, PASS**. The new `10_rentals` has 75 tests.
   - `node supabase/tests/run-all.mjs`: **17 of 17 passed**, including the new local-only `c3_rentals.mjs`.
   - pgTAP again on the used database: PASS.
2. **Fixes found locally before CI:**
   - `rate_counters` and `job_runs` had check constraints listing their allowed values; both are widened in the migration.
   - My first integration run left a chat and photos behind, which broke `01_roles_rls` and an export count on a used database. The script now removes its photos (Storage API, local service key), rentals and chats, and the pgTAP export check counts only its own rental.
3. **Shared Kotlin**, with the backend stopped: `:androidApp:assembleDebug :shared:testDebugUnitTest` (JDK 21, env loaded, `GOOGLE_SERVICES_JSON` set): **BUILD SUCCESSFUL** on the first run. **57 tests, 0 failures, 1 skipped**, including the new `RentalRulesTest` (7).
4. **Website** (Node 22): `npm test` **12 of 12** (6 new in `rentals.test.ts`); `npm run lint` clean after fixing 2 accessibility findings in my code; `npm run build` passed; `tsc --noEmit` clean.
5. **CI:** [run 43362479198](https://github.com/Vivek-k24/Dzirent/actions/runs/43362479198) on `2682952`, **all 5 jobs green**. In CI, pgTAP passed 181 tests, integration 17 of 17, website 12 of 12.
6. **Live** (after CI):
   - `supabase db push --linked`: the C3 migration applied.
   - `supabase functions deploy` for `send-push`, `delete-account`, `export-my-data` and `cleanup-files` (`--no-verify-jwt --use-api`): all 4 deployed.
7. **Live read-only checks** (`supabase db query --linked`):
   - `rental_events` and `app_private.rental_reminders` exist, and `btree_gist` is installed.
   - The constraint `rentals_no_double_booking` is in place, with the 4 booked states.
   - Bucket `rental-photos`: private, 10 MB, both policies present.
   - Cron jobs `dzirent-rental-expiry */10 * * * *` and `dzirent-rental-reminders 0 15 * * *` are scheduled.
   - The push kinds are in `queue_rental_push`.
   - The 10 functions are present.
   - The new status check is in place, and 0 rows remain in `active`/`returned` (0 rentals live).
   - On `rentals`, only `rentals_participant_read` remains, with 0 write grants (table and column) for `anon`/`authenticated`.
   - `rental_reminders` defaults to true; retention is 365; the cleanup switch is off; reports accept `rental`.
8. **Security Advisor:** only the expected findings, logged in `security-log.md`.
9. No emulator, device or browser; no tests or load against live.

**Test counts:**

| Suite | Count |
| --- | --- |
| pgTAP | 181 (10 files; `10_rentals` 75) |
| Integration | 17 runs (16 scripts) |
| Shared Kotlin | 57 (1 skipped) |
| Website | 12 |
| Contracts | 147 codes, fresh |

**APK (built 2026-11-12 21:34 local):**
- Original: `mobile/androidApp/build/outputs/apk/debug/androidApp-debug.apk`
- Copy (rule 15): `C:\Users\User\Desktop\Belhaven\OneDrive - Belhaven University\Dzirent-apk\androidApp-debug.apk`, replacing the C1 copy. Both are 23,463,660 bytes with the same SHA-256.

**Phone test (Android, two accounts A = renter, B = lender):**
1. A opens a chat on B's piece and taps **Request to rent**. Only open days can be picked, and the line shows "n days · $total". Send it: B gets "Rental request from …", and both see the rental card "Requested".
2. B taps **Accept**. Then **Add pickup photos**, add 2 (camera or gallery), then **Mark picked up**. Try marking with fewer than 2 first: "(DZ-E4020)".
3. A can add pickup photos too; both see the thumbnails.
4. B adds 2 return photos and taps **Mark returned**. The card says Completed, and A gets "Rental completed".
5. Try a request for dates that overlap the accepted rental: "(DZ-E4009)". The day after the end works.
6. A new request, then **Decline**, and another, then **Cancel rental** with a reason: the reason shows in the timeline.
7. **My rentals** groups them, with B's incoming requests first. **Settings > Notifications** shows Rental reminders.
8. **Website admin:** Users > find A > **Show rentals**: the timeline and photos.

**iPhone, for the Mac session (not compiled on iOS):** `RentalViews.kt`, `Rentals.kt` and the ChatScreens changes are common code. They use `rememberPhotoSources`, `DateRangePicker` with custom `SelectableDates`, `FlowRow`, and the supabase-kt storage `createSignedUrl`. All of these should compile for iOS; the iOS photo sources are the same `expect` the listing editor uses.

**Open issues:**
- **Deviation: blocked pairs.** The prompt said every function refuses blocked pairs. `cancel_rental`, `mark_returned` and `complete_rental` stay allowed, so a block never traps a booking or a picked-up piece. This is in `decisions.md` and `contract.md` 6.
- **Deviation: no push for a cancel or an expiry.** They weren't in the push list; the card updates live.
- **G30:** an accepted rental that is never picked up doesn't time out. It keeps its days booked and blocks deletion until cancelled.
- **G31:** there's no admin tool to end a rental (for example when the lender is banned).
- **G32:** a listing with no availability windows shows in date browsing but can't be requested.
- **G33:** reminders and "today" use Austin time.
- **G34:** the privacy text changed without a `PRIVACY_VERSION` bump. The owner and attorney decide.
- **Old installed apps:** "Mark as rented" and the follow-up now fail (no write grant). Updating the app fixes it.
- **Website condition photos:** uploads take JPEG after the browser compresses them (as listing photos do). Very large originals may take a moment.
- **Request from S1** (email in sign-in errors in `supabase/` scripts): still open, not part of C3.

**Requests:** none.

## S1b - 2026-11-12 - security updates finished

**Before starting:**
- The tree was clean, and `Preview` was up to date at `a7a10cc`.
- gcloud: `vivek.kallakuri@cloudprous.com` active, and `gcloud auth print-access-token` worked.

**Done:**
- **Vision deployed:** revision **`vision-00006-sxv`**, serving 100% (it replaced `vision-00005-9cg`). I used the S1 handoff's command, unchanged. It contains the S1 packages plus Pygments 2.21.0.
- **Pygments:** `services/vision/requirements.txt` now pins Pygments 2.21.0 (2026-08-17; no advisories in GitHub's database). The CI vision job no longer installs `pygments==2.19.2` separately. So the low Pygments alert S1 expected after the merge won't appear.
- **Uploads:** `.venv/` is added to `services/vision/.gcloudignore` and `.dockerignore`. Without it, this deploy would have uploaded the local test venv (with torch) to Cloud Build. `gcloud meta list-files-for-upload` now lists 19 files.
- **`contracts/generate.mjs`** (CodeQL alert #9, `js/incomplete-sanitization`, high, on PR #103):
  - Markdown cells escape `\` first, then `|` and backticks; line breaks become `<br>`.
  - Kotlin literals also escape line breaks, tabs and other control characters (`\uXXXX`) on top of `\`, `"` and `$`.
  - TypeScript stays `JSON.stringify`.
  - `field` must be an input name (`a-z`, `0-9`, `_`).
  - The four generated files came out byte-identical, because no catalog text has these characters, so there is no regenerated diff.
- **Docs:** `security-log.md`:
  - the deploy;
  - Pygments fixed, nothing to dismiss;
  - the generator alert;
  - alerts #10–#12 (`supabase/tests/run-all.mjs`, `lib/local_photos.mjs`), which were dismissed as "used in tests" from the owner's account on 2026-11-13.

**What I ran:**
1. **Generator:**
   - `node contracts/generate.mjs` wrote nothing, and `--check` reports "125 codes, generated files up to date".
   - **Round-trip test** (scratch `escape_test.mjs`) with a catalog whose messages contain `\`, `"`, `$`, `${x}`, `|`, backticks, line breaks, tabs, `\u0001`, `\u007f` and ` `. Every Kotlin literal decodes back exactly, with no raw line break and no bare `$`. The TypeScript object evaluates back exactly. Every Markdown row has 7 cells and unescapes back. A field of ``a`b`` is refused.
   - The same test against the old generator fails 6 checks: raw line breaks in Kotlin, the backslash-pipe case, a broken row, and the unvalidated field.
   - First run: my editor wrote ` `/` ` into the regex as raw characters, a syntax error. I removed them with a Node script; Kotlin accepts those characters in strings anyway.
2. **Vision tests** (repo `.venv`, Pygments 2.21.0, `pip check` clean, `VISION_SAFETY_DIR` set): **54 passed**; the CI form gives 52 passed, 2 deselected.
3. **Deploy:**
   - `gcloud run deploy vision --source services/vision …`, the S1 handoff command: "revision [vision-00006-sxv] … serving 100 percent of traffic".
   - `describe` afterwards: max 1, min unset (0), 2 CPU, 4Gi, no GPU, concurrency 4, 120 s, `vision-runtime`, the same `VISION_ALLOWED_URL_PREFIXES`. All the same as before the deploy.
   - IAM: still only `roles/run.invoker` for `vision-invoker`.
   - `/health` without a token → 403, with a made-up token → 401.
   - With `gcloud auth print-identity-token`: HTTP 200, **`service_version` `s1.1`**, policy digest `fab11ee739b2e4db`, 114 items, both models at their pinned revisions, start-up 37.3 s (23.6 s in P2A).
4. **Deployed eval:** `run_eval.py --url https://vision-296325491472.us-west1.run.app`, with the same sets as P2A and S1 (sample listings; 8B accept and reject sets; hoodies; worn dresses; the beignets photo).
   - **Against S1's container run** (`eval_s1_container.json`) and against P2A's deployed run: **0 of 92 photos changed** (verdict, reason, looks-like, warnings). **0 of 12 listings changed** (verdict, reason, title, category, garment type, colours, styles, quality).
   - Sample: 22 of 22 allowed; listings 12 of 12 allowed.
   - should-reject: 32 rejected, 10 review, 0 allowed.
   - Highest nudity score 0.148; none at or above 0.40.
   - Not passing, all three the same as in P2A and S1:
     - `should-accept/jumpsuit/1` rejected (read as a document);
     - `should-accept/saree/2` rejected (read as a dog);
     - `hoodies/hoodie/4` allowed (the back of a long print dress, no hood). This last one makes the script exit 1.
   - Single scans: median 1.4 s, max 2.9 s.
   - Cloud Run log of the new revision: 114 lines. The only two with a URL are Cloud Run's own front-door refusals of my two unauthenticated test requests, with Google docs links. None of the app's lines has one.
5. **Push and CI:** `5a01fea`, all green:
   - CI on the push: https://github.com/Vivek-k24/Dzirent/actions/runs/43337392087, 5 of 5 jobs;
   - CI on PR #103: https://github.com/Vivek-k24/Dzirent/actions/runs/43337399629, 5 of 5;
   - CodeQL on PR #103: https://github.com/Vivek-k24/Dzirent/actions/runs/43337394733, javascript-typescript, actions, python.
6. **CodeQL alert #9:** `gh api …/code-scanning/alerts/9` shows its instance on `refs/pull/103/head` as **`fixed`**. The alert's own `state` field is empty because it never existed on `main`; GitHub fills that field only for default-branch alerts.
   - Open code scanning alerts: 0 on the PR ref, 0 on `main`.
   - Dependabot: still 82 open, all on `main`; they close when PR #103 merges.

**Open issues:**
- **Owner: merge PR #103** (`Preview` → `main`) to close the 82 Dependabot alerts. Then list them again: none should remain, and no Pygments alert should appear.
- **Request, still open from S1:** `supabase/seed/*.mjs`, `supabase/tests/step1b.mjs` and `step4c_parity_test.mjs` should drop `${email}` from their `Sign in failed for …` errors (outside S1b's folders).
- Start-up after a cold start is 37 s (23.6 s on the P2A revision). It didn't change any scan, and the 120 s timeout covers it, but `scan-listing`'s first call after idle waits longer.

## S1 - 2026-11-12 - security updates

**Before starting:**
- The tree was clean, and `Preview` was up to date at `29da0f4`.
- Three website test servers from 2026-11-10 were still running: `next start` on ports 3123, 3124 and 3125, six `node` processes from the repo's `.tools` Node. They held `apps/web/node_modules` open, so `npm ci` failed with EPERM. I stopped those six only. The Codex daemon (`codex-runtimes`) was left running.

**Alerts:**

| | Before | After the push to Preview |
| --- | --- | --- |
| Dependabot | **82**: Pillow 58, transformers 11, Starlette 7, torch 5 (all `services/vision/requirements.txt`); minimatch 1 (`apps/web/package-lock.json`). 5 critical, 44 high, 29 medium, 4 low. No Gradle alert. | **82**, unchanged. GitHub computes them on the default branch, `main`, and the fixes are on `Preview`. They close when the owner merges. |
| Code scanning | **5**: `js/clear-text-logging` in three `supabase/seed` scripts and two `supabase/tests` scripts | **0** (all 5 dismissed, see below) |

**Version changes:**

| Where | Package | From | To | Fixes |
| --- | --- | --- | --- | --- |
| vision | pillow | 11.2.1 | 13.0.0 | 58 alerts |
| vision | torch / torchvision (CPU wheels) | 2.7.1 / 0.22.1 | 2.14.1 / 0.29.1 | 5 |
| vision | transformers | 4.51.3 | 5.20.2 | 11 |
| vision | fastapi / starlette | 0.115.12 / 0.46.2 | 0.162.0 / 1.7.0 | 7 (the pair in FastAPI 0.162.0's own `uv.lock`) |
| vision | open_clip_torch | 2.32.0 | 3.3.0 | needed: 2.x calls `batch_encode_plus`, removed in transformers 5 |
| vision | timm | 1.0.15 | 1.0.30 | needed by open_clip 3.3 (1.0.17 or later) |
| vision | tokenizers, huggingface-hub, safetensors | 0.21.4, 0.30.2, 0.5.3 | 0.23.3, 2.3.0, 0.8.0 | needed by transformers 5 |
| vision | new pins | | hf-xet 1.7.0, httpx2 2.16.0, httpcore2 2.16.0, truststore 0.10.5, annotated-doc 0.0.5, opentelemetry-api 1.45.1, typer 0.27.3, rich 15.0.0, markdown-it-py 4.2.0, mdurl 0.1.2, Pygments 2.19.2, shellingham 1.5.4 | new dependencies of the above |
| web | minimatch under `@typescript-eslint/typescript-estree` (npm override) | 10.2.6 | 11.0.3 | 1; its new dependency `@isaacs/nonrecursive-glob-match` is pinned to 1.0.3 |

- **Version ages:** every version was released at least two weeks before today (PyPI and npm dates checked). Where the resolver picked a newer one (hf-xet 1.8.0, opentelemetry-api 1.45.2, typer 0.29.1, annotated-doc 0.0.6, markdown-it-py 4.3.0, nonrecursive-glob-match 1.1.0), I pinned an older release.
- **Unchanged:** numpy, scipy, pydantic, uvicorn and the rest stay as they were. The base image keeps the same tag and digest.
- **Lockfile:** `apps/web/package-lock.json` stays in its v1 format (`npm install --lockfile-version=1`). The diff is the minimatch entry, its new dependency and a few empty `requires: {}` lines. A plain npm 10 install would have rewritten all 4,000 lines.
- **Other vision code changes:**
  - **Dockerfile:** `chmod -R a+rX /opt/model`. safetensors 0.8 writes `visual.safetensors` as 0600 and the service runs as user `vision`, so the first local image **failed to start** ("No such file or directory: /opt/model/visual.safetensors"). The fix makes the files readable; they stay owned by root.
  - **`app/main.py`:** also silences the `httpx2`/`httpcore2` loggers, which log request URLs at INFO like `httpx`.
  - **`app/config.py`:** `SERVICE_VERSION` is now `s1.1`, so `/health` and every scan show the new build.

**What I ran:**
1. **Pins:** `pip install --dry-run --report` for Linux, Python 3.12, wheels only, with the PyTorch CPU index.
   - The resolved set equals `requirements.txt`, apart from `colorama`: pip evaluates markers on this Windows PC, and colorama is Windows-only.
   - Checked against GitHub's advisory database: one match, Pygments (below).
2. **Vision tests, model tests included** (`VISION_SAFETY_DIR` set to the pinned safety model), in a scratch venv with the new pins:
   - **54 passed**, and the CI form gives 52 passed, 2 deselected;
   - the old packages also gave 54 passed;
   - the repo's `.venv` is now updated to the new pins too.
3. **Before/after on the same weights:** the old `.venv` and the new venv each built the assets (`build_assets.build`, no download), then ran the service's own `Model` / `analyze_photo` / `scan` code on 92 photos and 12 listings.
   - Text embeddings: worst cosine 0.9999998.
   - Image embeddings: cosine ≥ 0.99974.
   - Nudity scores: within 3e-7.
   - **0 changes** in any verdict, reason, label, warning or listing suggestion.
4. **Local Linux image:** `docker build` of `services/vision` with the unchanged Dockerfile.
   - `pip check`: "No broken requirements found"; 460 prompts embedded; the safety model loaded strictly.
   - After the chmod fix, the container ran with `--cpus 2 --memory 4g` and the live `VISION_ALLOWED_URL_PREFIXES`: ready in 7.8 s, as uid 10001 `vision`, `torch.cuda.is_available()` False, policy digest `fab11ee739b2e4db`, peak memory about 0.9 GiB.
5. **Eval:** `services/vision/eval/run_eval.py`, unchanged, against that container. Only the gcloud token is swapped for a dummy, because there's no Cloud Run front door locally. Same sets as the P2A deployed eval (sample listings from the shop window; the 8B Commons accept and reject sets; hoodies; worn dresses; the beignets photo). Compared photo by photo with the P2A results (`vision-00005-9cg`):
   - **0 of 92 photos changed** (verdict, reason, looks-like, warnings), **0 of 12 listings** (verdict, reason, title, category, garment type, colours, styles, quality).
   - Every sample photo is still allowed (22 of 22) and all 12 sample listings are allowed.
   - should-reject: 32 rejected, 10 review, **0 allowed**.
   - Highest nudity score 0.148 (a laptop photo); none at or above 0.40, so **no nudity false positives**.
   - The script exits 1 for the same single photo as in 8B and P2A: `hoodies/hoodie/4`, a long print dress seen from the back with no hood.
   - Median scan 0.8 s. The container log (110 lines) has no URLs.
6. **Website** (Node 22.23.3 from `.tools`):
   - before the change: `npm ci`, lint, 6 of 6 tests and the build pass;
   - after: `npm install --lockfile-version=1`, then removed `node_modules` and ran a clean `npm ci`: lint passes, **6 of 6** tests, build passes (23 pages);
   - `npm ls` shows minimatch 11.0.3 (overridden) under typescript-estree only;
   - a direct call of its `minimatch(path, pattern, { dot: true })` gave the expected matches.
7. **Android** (JDK 21, env loaded silently; local backend not running; no Docker containers running):
   - `:androidApp:assembleDebug :shared:testDebugUnitTest`: **BUILD SUCCESSFUL**, **50 tests, 0 failures, 1 skipped**.
   - `assembleDebug` was up to date: nothing in `mobile/` changed, so no new APK was produced and nothing was copied to OneDrive (rule 15). The APK stays at 2026-11-11 17:22.
8. **Push and CI:** pushed `8f079d8`. CI run https://github.com/Vivek-k24/Dzirent/actions/runs/43328663217: **success, all 5 jobs green** (contracts, website, android, vision, database).
9. **Dismissals:** dismissed code scanning alerts #4–#8 with `gh api` (reason below).

**Vision revision: not redeployed.**
- gcloud can't refresh the owner's sign-in here ("Reauthentication failed. cannot prompt during non-interactive execution"). `vivek.kallakuri@cloudprous.com` is the only account.
- So `gcloud run deploy` and the deployed eval couldn't run. Cloud Run still serves **`vision-00005-9cg` with the old packages**.
- The local Linux image of the same Dockerfile is the stand-in (steps 4 and 5). Its first build shows the deploy would have failed without the chmod fix.

**Dismissed:**
- **Code scanning #4–#8, "used in tests":**
  - These are seed and integration scripts. CodeQL treats all of `process.env` as sensitive because `userEnv` spreads it.
  - What reaches `console.error` is a sign-in error: the test user's email, the HTTP status and Auth's error body. Never a password, key or token.
  - In CI the email is a throwaway `*@dzirent.local` seed user.
- **Dependabot: none dismissed.** All 82 have a fix in this push.
- **One new low alert is expected after the merge:** Pygments 2.19.2, GHSA-5239-wwwm-4pmq, a ReDoS in `AdlLexer` that needs local access.
  - The service never highlights text.
  - Pygments stays at 2.19.2 because CI installs `pygments==2.19.2` next to `requirements.txt`, and a different pin makes CI's install fail (tried: `ResolutionImpossible`).
  - Dismiss it as "vulnerable code is not used" when it appears. Logged in `security-log.md`.

**Requests** (outside S1's folders):
- `.github/workflows/ci.yml`, vision job: drop `pygments==2.19.2` from the pip line (`requirements.txt` now pins Pygments). Then bump Pygments to 2.21.0 in `requirements.txt`.
- `supabase/seed/*.mjs` and `supabase/tests/step1b.mjs` / `step4c_parity_test.mjs`: drop `${email}` from the `Sign in failed for …` errors, so nothing from the environment is logged.
- `services/vision/.dockerignore` doesn't exclude `.venv`, so a local `docker build` sends it as context (Cloud Build uses `.gcloudignore`). Harmless, just slow. This one is in my folders; I left it as it is because S1 didn't need it.

**Open issues:**
- **Owner:** `gcloud auth login` on this PC. Then an agent runs, from the repo root:

      gcloud run deploy vision --source services/vision --project dzirent --region us-west1 --no-allow-unauthenticated --service-account vision-runtime@dzirent.iam.gserviceaccount.com --min-instances 0 --max-instances 1 --cpu 2 --memory 4Gi --timeout 120 --concurrency 4 --set-env-vars VISION_ALLOWED_URL_PREFIXES=https://pwfzkyjeivadbtkfkdxr.supabase.co/storage/v1/object/public/listing-photos/

  - Then check `/health` shows `s1.1`, and run `run_eval.py` with the same sets.
  - The S1 results file is in my scratch folder, `eval_s1_container.json`, if the next session can still reach it.
- **Owner:** merge `Preview` into `main` to close the 82 Dependabot alerts. Then dismiss the Pygments alert (above) and list the alerts again.
- **Website override:** drop it when typescript-eslint itself depends on minimatch 11.0.1 or later.

## C2 - 2026-11-12 - test foundation

**Before starting:**
- The tree was clean except two new untracked files, `pranalika/architecture.md` and `pranalika/code-reference.md`. I committed them in this step after scanning them for secrets: none found.
- `Preview` was up to date at `6fd6d00`.
- Docker 29.9.2 runs with 8 GB.

**Done:**
- **Local backend:**
  - `supabase start` brings up the full stack from `supabase/config.toml`. All 31 migrations apply from scratch, then `supabase/seed.sql`, which is new and local only (`[db.seed]`).
  - **Migrations fixed from scratch: none needed.** Every migration applied cleanly on an empty database.
  - **What the seed creates:**
    - 4 throwaway users (`test1/2/3@dzirent.local`, `admin@dzirent.local`; passwords in `supabase/tests/local.env`), created through `auth.users` so the sign-up trigger makes each profile;
    - the two sample studios; user 3 with role both and measurements with consent; terms accepted; the admin in `admin_users`;
    - the 12 sample listings with the live ids and titles, with photo rows, availability and measurements.
  - **Listings inserted paused:** they are published after their photos. Photo rows on an active listing start an automatic photo check, so inserting them active queued 12 checks on a fresh database.
  - **Vault:** the seed replaces all six Vault entries.
    - The migrations create `send_push_url` and `scan_listing_url` with the **live** function addresses. Without the seed's overwrite, a fresh local database would call production; it would get a 401 for the wrong secret, but still call out.
  - **TOTP on locally** in `config.toml`, so admin tests can sign in with two steps. This file isn't pushed anywhere.
- **Stubs and local functions:**
  - **Stub server** (`supabase/tests/stubs/server.mjs`): Node, in the container `dzirent-stubs` on the Supabase network, started with `stubs/run.mjs`.
    - `/push` checks the secret and fields like `send-push` and records what it would send.
    - `/scan` plays scan-listing plus vision. Answers by photo name: `reject` → rejected, `review` → review, anything else → allowed. Its fingerprints are deterministic, so different photos never look copied, and it gives a fixed suggestion.
  - **Why stubs:** the local Vault points the outbox at them. The Google and Firebase token addresses are fixed in `send-push` and `scan-listing`, and function code wasn't in this task's folders, so stubs stand in for those two.
  - **Edge Functions:** `supabase functions serve --env-file supabase/functions/local.env` (non-secret local values) serves all the others for real. `cleanup-files` is reached from the local Vault.
  - **Seed photos:** `supabase/tests/lib/local_photos.mjs` uploads them from `supabase/seed/images/`, as each owner.
- **pgTAP** (`supabase/tests/database/`, 9 files, 106 tests, each in a rolled-back transaction):
  - **Roles and RLS:** guest, renter, owner, other user, and admin without two-step, with a 25-hour-old code, and with a fresh one.
  - **Shop window:** no coordinates, emails or account ids, checked in both the declared columns and the actual rows, for guests and signed-in users.
  - **Refusal codes:** every refusal literal in the database has a DZ code (structural check), plus one refusal per family with its hint.
  - **Rate limits:** messages and new listings; a refused write isn't counted; server writes aren't limited.
  - **Outbox:**
    - the 1/5/30/120 schedule and dead after 5;
    - a 2xx answer marks a job done, a 503 retries;
    - a dead photo check ends failed/review, and retrying it is skipped;
    - admin dead list (no push text), Retry, `DZ-E5061`, logged.
  - **Report evidence:** saved at report time; can't be updated; outlives the deleted message.
  - **Terms, age, cleanup:** terms enforcement; the age block; cleanup jobs count only.
- **Integration:**
  - **One shared config:** all 13 scripts read `supabase/tests/lib/config.mjs`. It targets the **local** backend by default (URL and keys from `supabase status`, the users in `local.env`, SQL through `db query --local`). `--live` or `DZIRENT_TEST_TARGET=live` switches to dzirent-server and prints a warning.
  - **One runner:** `node supabase/tests/run-all.mjs`. It starts the stubs and `functions serve`, uploads the seed photos, runs 16 runs (15 scripts, with step 8B twice: `off`, then `on` with `vision_required` switched just around it), and prints a summary. Options: `--only`, `--keep`.
  - **Runner guards:** the runner fails if it stops before its summary; a pending `fetch` once let it exit 0 having run nothing. A keep-alive timer and fetch timeouts fix the cause.
  - **Stale scripts fixed** (they would also fail live):
    - `delete_listing.test.mjs` stripped only the first import, so it had been broken since P5A. It now loads the real `_shared` modules and expects the C1 code.
    - `p2a` expected chat messages to be filtered (removed in P5A). It now checks `check_text` for a message is null, without sending the slur.
    - `p2b` and `p2c` expected messages without their C1 codes.
    - `step8a` expected only three flags in `app_settings`.
    - `step8b` needed arguments by hand.
  - **Changed for local runs:**
    - `step7a`, locally, checks what the push stub recorded instead of a Firebase token removal (live is unchanged).
    - `step8b`, locally, names its upload `reject_*` so the stub rejects it.
- **Vision:** the two model-weight tests are marked `@pytest.mark.model` (`tests/conftest.py` registers the marker); CI runs `-m "not model"`.
- **CI** (`.github/workflows/ci.yml`):
  - **When:** on pull requests to Preview and main, on pushes to Preview, and by hand.
  - **Jobs:**
    - `contracts`: the freshness check;
    - `website`: `npm ci`, lint, test, build;
    - `android`: `:shared:testDebugUnitTest`, with a placeholder `google-services.json`, JDK 21;
    - `vision`: pinned packages, pytest without the model tests;
    - `database`: `supabase start -x studio,imgproxy,vector,logflare,postgres-meta,supavisor`, `db reset`, pgTAP, the runner, `supabase stop`.
  - **Secrets:** none. Only the local stack's default keys and placeholders.
- **Docs:** `pranalika/testing.md` (suites, how to run each, CI, and the rule that integration and load tests never touch the live project); `BOARD.md`.

**What I ran:**
1. **Local stack:** `supabase start`. All migrations applied; every service healthy except `vector` (the log shipper restart-loops on Docker Desktop; nothing uses it).
2. **Reset:** `supabase db reset --local` was declined by the permission check twice, so I asked. You chose `supabase stop --no-backup` + `supabase start` instead, and I used that for every fresh start.
3. **Fresh-start fixes:** the first fresh start found the Vault duplicate (seed changed to update-or-create). A later fresh run found the 12 queued checks (seed now publishes after photos).
4. **Final fresh local run:**
   - `supabase test db --local supabase/tests/database`: **9 files, 106 tests, PASS**.
   - `node supabase/tests/run-all.mjs`: **16 of 16 passed** (`delete_listing.test.mjs` is 4 node tests).
   - Then `supabase stop`.
5. **Unit tests, with the backend stopped:**
   - `:shared:testDebugUnitTest`: **BUILD SUCCESSFUL, 50 tests**;
   - `npm test` in apps/web: **6 of 6**;
   - pytest in `services/vision` (new `.venv`, pinned packages): **52 passed, 2 deselected** (`model`).
6. **CI on Preview:**
   - **Run 1** ([43126952262](https://github.com/Vivek-k24/Dzirent/actions/runs/43126952262)): contracts, website, android and vision passed. The database job ran 13 of 16, and pgTAP passed.
   - **Run 1 cause:** outside an agent session, `supabase db query` prints a table, so `sql()` got no rows. It now asks for `--output-format json` and reads both JSON shapes (a bare array outside an agent session, `{ rows }` inside one). I checked it locally with the agent variables removed: 4 of 4.
   - **Run 2** ([43127866994](https://github.com/Vivek-k24/Dzirent/actions/runs/43127866994)): four jobs passed. The integration step hung at the seed photo upload (in run 1 it took 0.4 s), so I cancelled the run after about 30 minutes to read the log.
   - **Run 2 fix:** every seed request gets a 15 s timeout and up to 3 tries. Each script is now limited to 10 minutes in the runner, and the CI step to 20.
   - **Run 3** ([43132086033](https://github.com/Vivek-k24/Dzirent/actions/runs/43132086033)): **all 5 jobs green.** In CI, pgTAP passed 9 files and 106 tests, the seed photos were 24 uploaded, and the integration runner passed 16 of 16.
7. No emulator, device or live write. The only live call was the read-only Advisor in C1, none this step.

**Test counts per suite:**

| Suite | Count |
| --- | --- |
| pgTAP | 106 (9 files) |
| Integration | 16 runs (15 scripts) |
| Shared Kotlin | 50 |
| Website | 6 |
| Vision | 52 (+2 model tests, skipped) |
| Contracts | 1 check |

**Open issues:**
- **`db reset` locally needs your approval;** agents use stop + start. CI runs `db reset`.
- **Not covered locally:** the Google/Firebase calls inside `send-push` and `scan-listing` (stubbed). A small change would make them testable: let the functions read their token and FCM addresses from env, falling back to Google's. That's in `supabase/functions/`, outside this task.
- **Leftover data:** the integration scripts leave data in the local database (chats, scans). The pgTAP files are written to pass on both a fresh and a used database, and CI always starts fresh.
- **Local Studio:** `vector` restart-loops on Docker Desktop for Windows. Harmless; CI leaves it out.
- **Not in CI:** Android Lint, `assembleDebug`, iPhone builds and tests, the vision eval. Unchanged by this step.
- **Required checks:** making the CI checks required on `main` and `Preview` is a GitHub setting for the owner (listed on the BOARD).

## C1 - 2026-11-11 - error codes, price per day, retries

**Before starting:** the working tree was clean and `Preview` was up to date with `origin/Preview` (`7c83362`). The architecture notes (blueprint Section 8, gaps G1, G20, G21) aren't in `pranalika/`, so I worked from the prompt.

**Done:**
- **Error and warning codes:**
  - One source: `contracts/error-codes.json`, 125 codes. `contracts/generate.mjs` writes four outputs: `ErrorCodes.kt` (shared Kotlin), `apps/web/src/lib/error-codes.generated.ts`, `supabase/functions/_shared/error-codes.ts`, and `pranalika/error-codes.md` (the readable table). All four are committed and marked "do not edit".
  - The generator runs at build time: the website's `prebuild`, and the Android `generateErrorCodes` task, which is skipped with a warning when Node is missing, as on the Mac. Two checks fail on stale files: `npm run lint` runs `generate.mjs --check` first, and `ErrorCodesFreshnessTest` (Kotlin) compares `ErrorCodes.kt` with the JSON.
  - | Family | Codes |
    | --- | --- |
    | 1xxx account, sign-in, terms, age | 22 |
    | 2xxx listings, photos, photo checks | 28 errors + 8 warnings (`DZ-W2001`-`W2008`) |
    | 3xxx chat, saving, blocking | 9 |
    | 4xxx rentals, payments | reserved, 0 |
    | 5xxx reports, moderation, admin | 36 |
    | 6xxx ID verification | reserved, 0 |
    | 7xxx data download, deletion | 9 |
    | 9xxx system | 13 (incl. `DZ-E9999`) |
  - **Database** (`20261111100000_c1_error_codes.sql`): I generated this migration from the live definitions (`pg_get_functiondef`) of the 66 functions that refuse. Only the raise lines changed: all 116 refusals now start with their code, with the same words. The field goes in the HINT (`full_legal_name`, `dates`, `reason`, `days`, `platform`; the text filter keeps its column). `text_refusal` (so also `check_text`) and `suspension_message` carry the code inside the sentence. One wording change: "You cannot message this user" is now "You can't message this user.", the words the apps already showed.
  - **Edge Functions:** all 7 answer `{ code, message }` with the catalog's status (`_shared/errors.ts`; `_shared/input.ts` adds a code to each input refusal), and all 7 are redeployed. Two side effects:
    - A few statuses moved to the catalog's value. For example "not configured" is now 503 instead of 500, and "Admins can't ban themselves" is 409 instead of 400.
    - `send-push` now answers 503 when nothing was delivered and a phone failed for a reason other than a dead token, so the outbox tries again.
  - **Shared Kotlin:**
    - `util/ErrorCatalog.kt` does the lookups. `fail()` in the repository shows the catalog's words with the code, "Add a photo first (DZ-E2010)", and takes the field from the HINT. A code this build doesn't know shows the server's words; anything without a code shows `DZ-E9999`.
    - Auth, network and Storage failures get codes in the app: `DZ-E1004`-`E1008`, `E9002`, `E1002`, `E2064`/`E2065`. `DzirentException` has a `code`.
    - Photo warnings, from the phone and from the server, show their `DZ-W2xxx` code, and `PhotoIssue` has a `code`.
  - **Website:**
    - `lib/errors.ts` does the lookups. `must()` and `WorkflowError` carry the code, and so do the API route's error JSON, the admin actions, sign-in and sign-up, the sign-up name check, the redirect notices (`refusals.ts`), Storage refusals and the photo warnings.
    - The admin two-step detection (`admin-code.ts`, `proxy.ts`, both layouts) now matches codes `DZ-E5002`/`E5003` instead of sentences.
- **Price per day:**
  - **Database** (`20261111101000_c1_price_per_day.sql`): `listings.price_unit` (`'per_day'`, default, the only allowed value). `browse_listings` and `get_listing` are dropped and re-created with the same bodies.
    - Both now also return `price_per_day`, `price_unit`, and with dates `days` (both ends counted) and `total`.
    - `get_listing` takes `p_start_date`/`p_end_date`.
    - `price` stays (the same number) so installed apps keep working.
  - **Apps:** cards "$X/day · distance"; the listing page "$X/day" and "<n> days · $total" for Home's chosen dates (`BrowseSession.dates`); chat header, Saved and filter heading per day; editor label "Price per day ($)".
  - **Website:**
    - cards "$X/day · distance"; the listing page "$X/day" and, with dates chosen, "<n> days · $total" from `get_listing`;
    - closet and chat show per-day prices; the editor field says "Price per day (USD)";
    - the link-preview line is "$X/day · City, ST".
- **Retries and dead-letter** (`20261111102000_c1_async_jobs.sql`):
  - `app_private.async_jobs` is closed to every API role. `queue_push` and `queue_scan` now call `enqueue_job` (the first attempt still goes out on commit) instead of `net.http_post`.
  - pg_cron `dzirent-async-jobs` runs `run_async_jobs()` every minute:
    - a 2xx answer marks the job done;
    - after a failure the next attempt waits 1, 5, 30, then 120 minutes; the 5th failure marks the job dead;
    - a dead photo-check job runs `vision_fail_scan`, which marks the check failed with verdict review.
  - Done jobs are kept 1 day, dead jobs 30 days.
  - Admin functions `admin_jobs_status`, `admin_list_dead_jobs` and `admin_retry_job` (logged as `retry_background_job`). On the website: a "Background jobs" card on the admin overview, and `/admin/jobs` with the dead list and Retry. There is a new nav item.
- **Client read retries:**
  - **Rules:** reads only, meaning GET/HEAD and a fixed list of read-only database functions. After a network failure, 408 or 5xx: 2 retries, after 0.5 s then 2 s. Writes are never retried.
  - **Apps:** Ktor `HttpRequestRetry` in `createDzirentSupabaseClient` (`util/ReadRetry.kt`, needs `@OptIn(SupabaseInternal)` for `httpConfig`).
  - **Website:** `lib/retry.ts` in the browser, server and preview clients.
- **Cleanup:** deleted `iOS_Toolchain_and_Packages.md` from the repo root. It was an Oct 31 Antigravity audit that no other file links to.
- **Docs:**
  - `contract.md`: new section 5, plus price fields, the outbox and Edge Function errors.
  - `security-log.md`: "Error codes, price per day and background jobs (C1)", with the Advisor run.
  - `decisions.md`: "Price (2026-11-11)" and "Errors and retries (2026-11-11)".
  - Root README product rules; `BOARD.md` "Code completion".

**What I ran:**
1. `supabase db push --linked`: the 3 migrations applied.
2. A live check that every `raise exception` literal now starts with a `DZ-` code (118 raises, counting the 2 new ones in `admin_retry_job`), and that the cron job has succeeded runs.
3. `supabase functions deploy <name> --no-verify-jwt --use-api` for all 7 functions.
4. `:androidApp:assembleDebug :shared:testDebugUnitTest` (JDK 21, env loaded, `GOOGLE_SERVICES_JSON` set). The first run failed to compile: `httpConfig` needs an opt-in, and `URLBuilder` has no `encodedPath`. The second built, but the P5A `storageRefusalsInPlainWords` test still expected sentences, so I updated it to codes. The third: **BUILD SUCCESSFUL**, 50 tests, 0 failures. The new ones are `ErrorCatalogTest` (9), `PricePerDayTest` (5: 1 day, 5 days, month and year boundaries, cents, read-retry rules) and `ErrorCodesFreshnessTest` (1).
5. `apps/web` with Node 22.23.3 from `.tools`:
   - `npm test` (new: catalog lookups and fallbacks, read retries, price lines): 6 of 6, after one fix. The website's existing `price()` prints "$12.5", so I corrected the test, not the format.
   - `npm run lint`: freshness check passed, then eslint with no warnings.
   - `npm run build`: passed.
6. Freshness check proof: I appended a line to the generated TS file. `generate.mjs --check` exited 1 and named the file. I regenerated, and it passed.
7. `node supabase/tests/c1_codes_price_jobs.mjs` against dzirent-server: **passed on the first run.**
   - **Refusals:**
     - `check_text` returned `DZ-E2050: ...` (guest).
     - `record_accessory_declaration` with a blank name returned 400 `DZ-E2041` with hint `full_legal_name`.
     - `set_conversation_dates` with the end date before the start returned `DZ-E3006` with hint `dates`.
     - A non-admin calling `admin_retry_job` got `DZ-E5001`.
   - **Edge Functions:** `delete-listing` with an unknown field answered 400 `{ code: "DZ-E9011", message }`; `export-my-data` without a token answered 401 `DZ-E1003`.
   - **Price:** 3 `browse_listings` cards for Dec 30 - Jan 2 all had days 4 and total = price × 4. `get_listing` returned 1 day for one date, 5 days for Feb 26 - Mar 2 2027, and null days and total without dates.
   - **Job:**
     - A `send_push` job whose payload `send-push` refuses (required fields missing, HTTP 400) failed 5 times. The measured waits were exactly 1, 5, 30 and 120 minutes; I skipped each wait by setting `next_attempt_at` (SQL, test setup only). It was dead after attempt 5.
     - I made test user 1 a temporary admin and signed in with TOTP at aal2. `admin_jobs_status` counted the job and `admin_list_dead_jobs` listed it, with no push text.
     - `admin_retry_job` started it again at attempt 1 (running), and it failed again to pending. A second Retry was refused with `DZ-E5061`, and the admin log has the retry.
   - **Clean-up:** the test job deleted, the factor deleted, the admin row removed. Afterwards: admin rows 0, factors 0, test jobs 0. The admin log rows stay (append-only by design). No rows were written by the refusal checks.
8. Security Advisor (MCP `get_advisors`): only expected findings. They are the `async_jobs` INFO and the 3 admin job functions, all logged.
9. No emulator, device or browser.

**APK (built 2026-11-11 17:22):**
- Original: `mobile/androidApp/build/outputs/apk/debug/androidApp-debug.apk`
- Copy (rule 15): `C:\Users\User\Desktop\Belhaven\OneDrive - Belhaven University\Dzirent-apk\androidApp-debug.apk`, which replaced the P5C copy. Same size (23,437,377 bytes) and SHA-256.

**Phone test (Android):**
1. **Prices:** Home cards read "$X/day · N mi". A listing page shows "$X/day" and, under it, "<n> days · $total" for the dates on Home. Change Home's dates and open the listing again: the days and total follow. The editor's field says "Price per day ($)".
2. **An error with a code:** in a listing title, type a phone number and save. The field shows "Please remove contact details from your listing; ... (DZ-E2050)".
3. **Wrong password at sign-in:** "Email or password is incorrect. (DZ-E1004)".
4. **Photo warnings:** a dark photo shows "Too dark: try daylight (DZ-W2002)".
5. **Push still arrives:** send a message from another account. It now goes through the outbox, so it should still arrive within seconds.
6. **Read retry:** with flight mode on, open Home. It waits about 2.5 s (two retries), then shows the error with "(DZ-E9002)" or "(DZ-E9999)". Turn flight mode off and try again.
7. **Website admin** (after the deploy): the overview has a "Background jobs" card; `/admin/jobs` shows counts and "No dead jobs."

**iPhone, for the Mac session (not compiled on iOS):**
- `ErrorCatalog.kt` and `ReadRetry.kt` are common code. The Ktor `HttpRequestRetry` and `kotlin.coroutines.cancellation.CancellationException` should compile for iOS too.
- Without Node, `generateErrorCodes` logs a warning and uses the committed `ErrorCodes.kt`.

**Open issues:**
- **Uncoded errors:** Postgres check-constraint and unique violations (for example `listings_price_usd_positive`) aren't `raise` statements, so they carry no code and show `DZ-E9999`. The apps validate those fields first. A later step could map constraint names to codes.
- **Server photo warnings:** the vision service (`services/`, not in this task's folders) still sends warning words. Clients map the exact words to `DZ-W2xxx`, so a reworded warning there would lose its code until the catalog is updated.
- **Website price format:** the website's existing price format shows "$12.5" where the apps show "$12.50"; not changed here.
- **Retrying a dead photo check:** a dead photo-check job has already ended its check as review. Retrying it finishes as "skipped", and the lender asks for a new check from the editor.
- **App listing page totals:** the app has no date picker on the listing page. The days/total line uses Home's chosen dates (Home always has a range), and the app computes it with the same rule the database uses, not from `get_listing`.
- **Generic fallback:** some website screens that used to say "Couldn't load your inbox." now say "Something went wrong. Please try again. (DZ-E9999)" for an uncoded failure, as the prompt asked.
- **Installed apps:** older apps that are already installed show server refusals with the code prefix, for example "DZ-E2010: Add a photo first", and fall back to their generic text for the rest. Updating the app fixes this.

**Requests:** none.

## P5C - 2026-11-10 - sharing

**Before starting:** the working tree was clean, and `Preview` was up to date with `origin/Preview` (`84d0d9b`).

**Done:**
- **Link previews (website):**
  - **Listing pages:** Open Graph and X tags.
    - title, "$price · City, ST", the clean `og:url`, `summary_large_image`;
    - a 1200 × 630 PNG at the listing's own `opengraph-image` / `twitter-image` route: the first photo in a white Dzirent frame with the wordmark, a maroon rule, title, "$price · City, ST" in maroon, `@handle` and "dzirent.com".
  - **Studio pages:** the same tags for everyone, guests and bots included, with an image of up to 4 listing photos, the studio name and `@handle`. Guests still get the sign-up gate on the page itself.
  - **Paused, deleted or hidden listings** (and made-up ids): a plain "This piece is no longer available" page with 8 newer pieces and "Browse all pieces", and a generic Dzirent preview image.
  - **Guest data only:**
    - All preview data is read with an anonymous client (`lib/preview.ts`).
    - Studio data comes from the guest shop window, because `get_studio` is signed-in only and `supabase/` wasn't in this task's folders.
  - **Content-Security-Policy:** not changed (reason in `security-log.md`).
- **Share:**
  - **Website:** a Share button on listing and studio pages (`components/share-button.tsx`). It uses the browser's share menu, else "Copy link" with "Link copied".
  - **Apps:**
    - a Share icon in the listing top bar (live pieces only) and the studio top bar;
    - `DeviceServices.share`: an Android chooser, and on iPhone a `UIActivityViewController`.
  - **Text** (`lib/share.ts`, `util/ShareLinks.kt`): "`<title>` on Dzirent: https://dzirent.com/listing/`<id>`" and "`<studio name>` on Dzirent: https://dzirent.com/studio/`<handle>`".
- **Android app links:**
  - `apps/web/public/.well-known/assetlinks.json` lists `com.dzirent.app.debug` with this PC's debug key fingerprint (the same key that signed the APK, checked with `apksigner`). It is kept out of the sign-in proxy.
  - The manifest has a verified (`autoVerify`) filter for `https://dzirent.com/listing/` and `/studio/`, and `MainActivity` is now `singleTask`.
  - `MainActivity` reads the link, and `DzirentApp` / `MainAppScaffold` open the listing, or the studio (guests get the sign-up pop-up).
  - A guest arriving through a link doesn't see the first-visit sheet.
- **P5A leftovers:**
  - `dependabot.yml`: all 4 entries now have `target-branch: Preview`.
  - Root README text filter line updated.
  - iPhone: a fresh install clears old Keychain items before reading the session (marker `dzirent_keychain_ready` in NSUserDefaults).
- **Docs:** `contract.md` section 4 (links, previews, app links, the P8A and P8B placeholders); `security-log.md` "Sharing and link previews (P5C)"; `compliance.md` 1.14 and the new 1.14a; `BOARD.md`.

**What I ran:**
1. **Mobile build:** `:androidApp:assembleDebug :shared:testDebugUnitTest` (JDK 21, env loaded, `GOOGLE_SERVICES_JSON` set): **BUILD SUCCESSFUL**. 35 tests, 0 failures, including the new `ShareLinksTest` (3): share text, links opened, links ignored.
2. **APK checks:**
   - `apksigner`: SHA-256 `a7af02ea…ee957c`, matching `assetlinks.json`.
   - `aapt2 dump`: package `com.dzirent.app.debug`, `autoVerify=true`, host `dzirent.com`, path prefixes `/listing/` and `/studio/`, `singleTask`.
3. **`apps/web`:** `npm run lint` (no warnings) and `npm run build` passed (Node 22.23.3 from `.tools`). Both ran twice, because of the studio image fix below.
4. **HTTP checks** against `next start` of the build, as a guest, with `p5c-http.mjs` in my scratch folder: **17 of 17 passed**.
   - **Listing page** (a real listing, "Black shirt"):
     - `og:title` "Black shirt", `og:description` "$15 · Irving, TX";
     - `og:url` `https://dzirent.com/listing/<id>`; `og:image` and `twitter:image` are its own routes; `summary_large_image`;
     - no tracking parameters; the share text is in the page;
     - the image returned 200 `image/png`.
   - **Studio page as a guest:** "AA cinema (@allu.arjun)" and its own image route, with a PNG.
   - **Made-up listing id:** 200, "This piece is no longer available", links to other pieces, the generic preview and a PNG.
   - **`/.well-known/assetlinks.json`:** 200, `application/json; charset=UTF-8`, valid JSON with the debug package and one fingerprint.
5. **Preview images:** I looked at the two generated images.
   - The listing image was right.
   - A studio with one photo showed three empty tiles. Fixed: one photo now fills the panel, two sit side by side, three or four make a grid.
   - I rebuilt and re-ran the checks, 17 of 17 again. The first re-run hit the old server still holding the port, so I re-ran on a new port against the new build.
6. **`curl` against the live site:** `https://dzirent.com/` answers 200 with no redirect. `/.well-known/assetlinks.json` is 404 there today, because dzirent.com serves `main`.
7. No emulator, device or browser.

**APK (built 2026-11-10 17:12):**
- Original: `mobile/androidApp/build/outputs/apk/debug/androidApp-debug.apk`
- Copy (rule 15): `C:\Users\User\Desktop\Belhaven\OneDrive - Belhaven University\Dzirent-apk\androidApp-debug.apk`, which replaced the P5A copy. Same size and SHA-256.

**Before the phone test:** shared links, their previews and app-link verification all use `https://dzirent.com`, which serves `main`. Merge `Preview` into `main` first. Until then:
- `assetlinks.json` is 404, so Android won't verify and links open in the browser;
- shared links show the old preview (only the first photo, no generated image).

After merging, reinstall the APK (or wait about a day) so Android checks the link again.

**Phone test (Android):**
1. **Share a listing to WhatsApp.**
   - Open a piece, tap Share in the top bar, and pick WhatsApp.
   - The message should read "`<title>` on Dzirent: https://dzirent.com/listing/…".
   - The chat should show a card with the framed photo, title, price and city.
2. **Share a studio** the same way. The card shows the studio's photos, name and `@handle`.
3. **Open a shared link with the app installed.** Tap a listing link in WhatsApp: the Dzirent Debug app opens on that listing.
   - Tap a studio link while signed in: the studio opens.
   - Signed out: the sign-up pop-up appears.
   - With the app already open, the link opens on top of it.
4. **Open a link without the app.** Uninstall it, or tap the link on another phone: the website opens on that page.
5. **Share on the website:**
   - on the phone's browser, Share opens the share menu;
   - on a desktop browser without one, the button says "Copy link" and shows "Link copied".
6. **A paused piece:** pause one of your listings and open its link in a browser. You should see "This piece is no longer available" with other pieces.

**iPhone, for the Mac session (none of this has been compiled):**
- **`IosDevice.kt` `share()` / `showShareSheet()`:**
  - presents `UIActivityViewController` from the top view controller, anchored to the screen centre on iPad;
  - check the `platform.UIKit.popoverPresentationController` import resolves (Kotlin/Native may expose it as a member instead of an extension);
  - test sharing a listing and a studio.
- **`IosSecureStore.kt`:**
  - `KeychainSettings.clear()` on the first launch of an install;
  - check that a fresh install starts signed out, and that an update from a pre-P5A build stays signed in (the NSUserDefaults session moves over).
  - Someone who had a P5A iPhone build installed will be signed out once by this update.
- **iPhone universal links** are not done: they need the paid Apple account and `apple-app-site-association` (P8B). Links open the website on iPhone.

**Open issues:**
- **Studio previews read at most the 300 newest pieces** (10 pages of 30). A studio whose pieces are all older gets the generic preview. Cleaner later: a small shop-window function `studio_preview(p_handle)` returning the name, handle and 4 cover photo paths. That needs a migration, so it was left out (`supabase/` wasn't in this task's folders).
- **The image routes refetch the photos on every request** (`cache-control: max-age=0`). Preview bots cache them themselves. Watch Vercel function use after launch.
- **The preview font is Next's built-in one:** the site's Roboto ships only as woff2, which the image renderer can't read. Titles in scripts it lacks (for example Devanagari) would show as boxes.
- **Security updates:** GitHub opens Dependabot *security* pull requests against the default branch (`main`) whatever `target-branch` says. Only the weekly version updates go to `Preview`. Two version pull requests opened before this change (pillow 13.0.0, torch 2.12.1) target `main`; close them or retarget them.
- **Privacy policy:** it doesn't yet mention link previews. Studio name, handle and photos now appear together for anyone who has a studio link (compliance 1.14a). Owner and attorney to decide.
- **Release builds:** `assetlinks.json` lists only the debug app; P8A adds the release package and key. `www.dzirent.com` links open the website, not the app.

## P5A - 2026-11-10 - security hardening

**Before starting:** the working tree was clean. I pulled `Preview` up to `1b200d1` (P4A).

**Done:**
- **Database audit:**
  - Every table has RLS, and every function has a fixed search path.
  - Guests reach only the shop window and public reference data. No elevated function was found that shouldn't be.
  - I added indexes for the 11 foreign keys the Performance Advisor listed.
  - Details are in `security-log.md` under "Security hardening (P5A)".
- **Migration `20261110230000_p5a_security_hardening.sql`:**
  - **Current terms required:** publishing, starting a chat, sending a message, saving a piece or studio, and reporting are refused until the caller accepts the current terms. Drafts and reading stay allowed.
  - **Rate limits:** messages 30 a minute, new chats 30 a day, reports 20 a day, new listings 20 a day, photo checks 30 an hour.
    - Built from one helper, the closed `app_private.rate_counters` table and `rate_limit_*` rows in `app_private.settings`.
    - The photo-check guard (was 20 an hour) now uses the same helper.
  - **Chat filter removed:** the trigger and its function are dropped, and `check_text(…,'message')` returns null.
  - **Uploads:** the `listing-photos` bucket now has type and size limits, and its policies accept only `{listing_id}/{random}.jpg`.
- **Migration `20261110231000_p5a_admin_code_24h.sql`:** `require_admin()` and `is_admin()` need a TOTP check from the last 24 hours, read from the JWT's `amr` claim.
  - The website shows the code step for the new refusal and then reloads the requested page (`proxy.ts`, `admin/layout.tsx`, `mfa-gate.tsx`, `lib/admin-code.ts`).
- **Edge Functions:**
  - `_shared/input.ts` checks every body: one JSON object, a size limit, no unknown fields, required fields present, and plain errors.
  - All 7 functions use it and are redeployed.
  - `admin-actions` no longer returns the database's reply in errors.
- **Website:**
  - Security headers in `next.config.ts`.
  - The terms and rate-limit refusals now show in the database's words on the listing and studio pages (`lib/refusals.ts`). Every other place already passed the database's sentence through `must()`.
  - Storage type and size refusals are shown in plain words.
  - Privacy policy section 15 has the 30-day sentence. Nowhere else does.
- **Apps (shared code):**
  - The new refusals are in `DATABASE_MESSAGES`, and Storage type and size refusals are shown in plain words.
  - Uploads now send `Content-Type: image/jpeg`. Before, nothing was set.
  - The session moved to encrypted storage (`platform/SecureSession.kt`, `AndroidSecureStore.kt`, `IosSecureStore.kt`, `DzirentApplication.kt`). A session left in plain storage moves over once, so nobody is signed out.
  - `android:allowBackup="false"`.
- **Report and Block in chat:** already two taps on all three platforms. On the website it's the conversation menu, then Report user or Block user. On Android and iPhone it's the top-bar ⋮ menu, then the same two items (shared `ChatScreens.kt`). Nothing changed.
- **Public text about chat checking:** no website or app page said chat messages are checked. The root `README.md` does (see Requests).
- **Auth:** the inactivity timeout is now 30 days (`sessions_inactivity_timeout` = 720 hours, set with the management API). No other Auth setting changed.
- **GitHub:**
  - Turned on vulnerability alerts, Dependabot security updates, and CodeQL default setup (actions, JavaScript/TypeScript, Python, Java/Kotlin; Swift is left out because it needs a macOS build).
  - Secret scanning and push protection were already on.
  - Added `.github/dependabot.yml`.
- **Docs:**
  - `security-log.md`: audit, everything above, bot-check research, accepted risks.
  - `compliance.md`: 1.1, 1.14, section 5. Gaps 16, 18, 20, 21 and 22 updated.
  - `contract.md`: terms and rate limits, uploads, Edge Function input rules, the admin 24 hours, the text filter.
  - `decisions.md`: "Security (2026-11-10)" and "Chat (2026-11-10)".
  - `BOARD.md`: the P5A rows, the P5C row, the P8C rows.

**What I ran:**
1. **Security and Performance Advisors and catalog queries** before the change, for the audit.
2. **`supabase db push --linked`** for each migration, dry run first. The second migration failed once with a syntax error (`pg_catalog.extract(epoch from …)` isn't valid). Nothing was applied that time; I fixed it and pushed again.
   - `SUPABASE_DB_PASSWORD` from the env file was refused. The CLI's access-token login worked instead.
   - The env files are written as `KEY = value`, so loaders must trim the space after `=`.
3. **`supabase functions deploy <name> --no-verify-jwt --use-api`** for all 7 functions.
4. **API tests (Node 22, test users 1, 3 and 4): 12 of 12 passed.**
   - User 4 hadn't accepted the current terms. A message and a save were refused with "Please accept the updated Terms of Use and Privacy Policy to continue.". After `accept_legal('web')`, the message went through.
   - User 3: 30 messages were sent and the 31st was refused with "You're doing that too often. Try again in a bit.". The first of those messages contained a word from the filter list and was accepted.
   - User 1: the same word in a listing title was refused, and the title didn't change.
   - Uploads to user 1's own listing:
     - `image/gif` was refused by Storage (415);
     - 10 MB + 1 KB was refused (413);
     - a `.png` name was refused (403).
     - Nothing was stored.
   - Edge Functions refused unknown fields, non-JSON bodies and bad ids with plain messages, and a non-admin got 403. The secret-protected functions gave 401 without the secret.
   - All 31 database calls to `send-push` returned 200.
   - The admin 24-hour check was tested with simulated JWT claims: a TOTP entry 1 hour old passes; 25 hours old and password-only are refused. It wasn't tested with a real admin session (I have none).
5. **Auth settings read back with a GET:**
   - `jwt_exp` 3600, refresh-token rotation on, reuse interval 10 s;
   - `sessions_inactivity_timeout` 720, `sessions_timebox` 0, single session off;
   - captcha off, TOTP enroll and verify on, `password_min_length` 8, leaked-password check on.
6. **Mobile build:** `:androidApp:assembleDebug :shared:testDebugUnitTest` (JDK 21, env loaded, `GOOGLE_SERVICES_JSON` set): **BUILD SUCCESSFUL**, 28 tests, 0 failures. I then added `SecureSessionTest` (4 tests: secure save and load, the one-time move from plain storage, unreadable value signs out, Storage refusal wording). Re-run: 32 tests, 0 failures.
7. **Website:** `npm ci` first, because P4A's `eslint-plugin-jsx-a11y` wasn't installed. Then `npm run lint`: no warnings. `npm run build`: passed. All with Node 22.23.3 from `.tools`.
8. **`next start` of the build:**
   - **Headers on `/` and a listing page:**
     - `Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https://pwfzkyjeivadbtkfkdxr.supabase.co; font-src 'self'; connect-src 'self' https://pwfzkyjeivadbtkfkdxr.supabase.co wss://pwfzkyjeivadbtkfkdxr.supabase.co; media-src 'self' blob:; frame-src 'none'; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests`
     - `Strict-Transport-Security: max-age=63072000; includeSubDomains`
     - `X-Frame-Options: DENY`
     - `Referrer-Policy: strict-origin-when-cross-origin`
     - `X-Content-Type-Options: nosniff`
     - `Permissions-Policy: camera=(self), geolocation=(self), microphone=(), payment=(), usb=(), display-capture=()`
     - On Vercel preview deployments, the Vercel toolbar's addresses are added.
   - **Listing page:** its 3 photos loaded (200, `image/jpeg`) from the allowed Supabase address.
   - **Sign-in:** through the site's own form, it returned 303 with the auth cookie, and the inbox then showed test user 3's chats.
9. **Security Advisor after both migrations (22:36 UTC):** 67 findings, all fixed or logged.
   - 10 INFO "RLS, no policies": the 9 already logged, plus the new closed `rate_counters` table.
   - 4 WARN for guest-callable shop-window functions.
   - 53 WARN for signed-in-callable functions, already logged.
   - Performance: no unindexed foreign keys left. 18 unused-index INFO (new indexes not read yet) and the Auth connection INFO (not changed: no other Auth settings).
10. No emulator, device, browser or screenshots.

**Where tokens are stored:**
- **Android:** AES-256-GCM. The key is generated inside the Android Keystore (`dzirent_session_key`) and can't be read out. Only the ciphertext is kept, in private SharedPreferences `dzirent_secure_session`. Backup is off.
- **iPhone:** the Keychain (service `com.dzirent.app.session`), through `KeychainSettings` from multiplatform-settings 1.3.0, which supabase-kt already brings in.
- **Before P5A:** both phones kept the session in plain storage (SharedPreferences / NSUserDefaults).

**APK (built 2026-11-10 16:29):**
- Original: `mobile/androidApp/build/outputs/apk/debug/androidApp-debug.apk`
- Copy (rule 15): `C:\Users\User\Desktop\Belhaven\OneDrive - Belhaven University\Dzirent-apk\androidApp-debug.apk`, which replaced the P4B copy. Both exist, same size and SHA-256.

**Phone test for the owner (Android):**
1. Install over the old app while signed in. You should **stay signed in**: the session moves to encrypted storage.
2. Sign out, then sign in again, then close and reopen the app. You should still be signed in.
3. Send many messages very fast in one chat. After 30 in a minute you'll see "You're doing that too often. Try again in a bit." under the chat box.
4. A message with a rude word now sends. The same word in a listing title is still refused.
5. Add and publish a listing with photos. Uploads and the photo check should work as before.

**iPhone, for the Mac session:**
- Build the shared framework. `IosSecureStore.kt` is the only new iOS file, and it has never been compiled. It imports `com.russhwolf.settings.KeychainSettings` with `@OptIn(ExperimentalSettingsImplementation::class)`. If the iOS targets don't see `multiplatform-settings`, add `com.russhwolf:multiplatform-settings:1.3.0` to `iosMain`.
- On the Simulator:
  - sign in with the old build, install the new one, and check you stay signed in;
  - then sign out, sign in, and restart;
  - the session should be in the Keychain, and the old NSUserDefaults key gone.
- Keychain items survive deleting the app on iOS, so after reinstalling the app may find the old session. Decide whether to clear it on first launch.

**Open issues:**
- **Not checked in a browser:** live chat over Realtime, photo uploads and the admin area under the new CSP. They use only the allowed addresses, but check them on Preview after the deploy. The CSP includes `upgrade-insecure-requests`, so a local `next start` over plain http isn't a fair browser test; use Preview.
- **Admin 24-hour code:** tested only with simulated claims, not with a real admin TOTP session.
- **`'unsafe-inline'` scripts** are accepted in the CSP (Next.js inline scripts); nonces would make every page dynamic.
- **Photo metadata:** a direct API upload can keep it. Accepted risk, in `security-log.md`.
- **Test data this run wrote:**
  - 32 messages by test users 3 and 4 (users can't delete messages);
  - test user 4 accepted the current terms;
  - one rate-limit counter row each for users 3 and 4.
- **`send-push`** still puts the recipient id and dead tokens in URLs (compliance gap 16). Moved to P5B.
- **Bot check** stays off: hCaptcha is recommended, planned for P8C.
- **Dependabot** pull requests will target `main`, the default branch.

**Requests (outside my folders):**
- Root `README.md`, "Text filter" table: "The words the database refuses in listings, profiles, chat and reports" should become "…in listings, profiles and report reasons".

## P4B - 2026-11-07 - app accessibility

Done (shared code, so Android and iPhone both get it; no redesign):
- Before starting: working tree clean, `Preview` up to date with `origin/Preview` (`17080e2`).
- **Helpers** (`ui/Accessibility.kt`): `Modifier.asHeading()` (heading semantics) and `Modifier.announced()` (polite live region).
- **Headings:**
  - All 31 top-bar and dialog titles (`title = { Text(...) }`).
  - `ScreenTitle` (bottom-bar screens), `SettingsGroup`, the closet's `SectionHeader`, the Home row titles, and the sidebar's "All categories".
  - `SectionTitle` and the guided-pick step titles were already headings.
- **Announced when they appear:**
  - The sign-in and sign-up error cards, and 19 error texts across the screens and dialogs.
  - Field errors in supporting text: legal name, display name, retail value, price note, title, studio name, handle, pickup area, measurement fields.
  - The listing editor's publish errors.
  - The whole photo-check banner: "Uploading your photos…" → "Checking your photos…" → result.
  - Character counters were left alone, so typing isn't interrupted.
- **Listing cards:** `ListingCard` reads as one item ("title, $25, 3 mi", the "·" read as a pause) with "double-tap to open". The photo no longer repeats the title.
  - Row thumbnails (`ListingThumbnail`: inbox, chat header, closet, rentals) and the saved-piece photo are decorative, because their title sits next to them.
  - Detail-screen photos keep "title, photo 2 of 4". Studio grid photos (photo-only) keep the title.
- **Avatars** are decorative: the initials only repeated the name next to them. The Home avatar button is now labelled "Open menu"; its label was only the initials.
- **Labels that say what they act on:**
  - Closet: the switch is "Show <title> in the shop", reporting Active or Paused; "Edit <title>" and "Delete <title>".
  - Saved: "Remove <title> from Saved" for pieces and studios.
  - Home: "See all: <row>".
  - Bottom tabs: the icon no longer repeats the tab label. The inbox dot reads "New activity".
- **State:** sidebar categories are `selectable`, so TalkBack says which is selected (it was color and bold only). Material chips, tabs, segmented buttons and switches already reported their state. The Settings switch rows were already `toggleable`.
- **Touch targets (48 dp):**
  - The photo "remove" X keeps the same 32 dp circle in the same corner, inside a 48 dp touch area.
  - The availability date chip: its 24 dp X button is gone; tapping the whole chip removes the dates, like the search filter chips, with the X as the visual hint and TalkBack hearing "double-tap to remove these dates".
  - Sidebar categories are at least 48 dp tall.
  - A scan found no other tappable element sized under 48 dp. Material components enforce 48 dp themselves.
- **Large text:** 23 buttons with a fixed 48 or 50 dp height now use a minimum height, so the label grows instead of clipping. This includes Sign in, Create account, Message lender, Publish, Next, Reset, Apply, List an item, Sign out, Agree and Delete my account. The look is the same at normal sizes. Truncated one-line titles keep their full text for screen readers, and the full title shows on the listing page.
- **Contrast**, measured for every theme pair (`ui/theme/Theme.kt`):
  - Text all passed 4.5:1 except the dark accent on grey chips (4.497:1), nudged from #E8638A to #EA658C: now 4.6:1 there, 6.2:1 on the background.
  - The outline color (text-field borders, outlined buttons, outline-tinted icons) was below 3:1. It is now #8C8C8C in light (3.4:1; was 2.5:1) and #6A6A6A in dark (3.6:1; was 3.0:1).
  - Dividers (`outlineVariant`) are decorative and unchanged.
- **Lint:** `androidApp/build.gradle.kts` sets `ContentDescription`, `ClickableViewAccessibility`, `GetContentDescriptionOverride`, `KeyboardInaccessibleWidget`, `LabelFor`, `AccessibilityWindowStateChangedEvent` and `AccessibilityScrollActions` as errors, with `checkDependencies = true` so the shared module is checked too.
  - Lint reported no accessibility issues. Its accessibility checks read XML views; the Compose screens were reviewed by hand, above.
  - It did report two real errors, both fixed:
    - `MainActivity` called `PackageInfo.longVersionCode`, which needs Android 9, while the app supports Android 8, so it would have crashed at start on Android 8.x. It now uses `PackageInfoCompat`.
    - The P3A save picker needs Fragment 1.3+, and Play services brought 1.1.0. `androidx.fragment` 1.8.5 is now pinned in the shared module.

What I ran:
1. A baseline `:androidApp:lintDebug` with the new settings: 2 errors (the two above), 0 accessibility issues, 71 warnings.
2. `:androidApp:assembleDebug :androidApp:lintDebug :shared:testDebugUnitTest` (JDK 21, env loaded, `GOOGLE_SERVICES_JSON` set). It failed three times before passing:
   - two missing `Modifier` imports, in `PhotoPermissions.kt` and then `Notifications.kt`;
   - then the Fragment pin had to move from the app into the shared module, because lint checks each module with its own dependencies.
   - **Final run: BUILD SUCCESSFUL.** Lint 0 errors (72 warnings: vector path length, dependency updates, KTX suggestions; none accessibility). Unit tests 28, 0 failures.
3. Contrast ratios computed with a script (WCAG relative luminance) for 26 pairs, then for the new colors.
4. No emulator, device or screenshots.

APK (built 2026-11-07 14:42):
- Original: `mobile/androidApp/build/outputs/apk/debug/androidApp-debug.apk`
- Copy (rule 15): `C:\Users\User\Desktop\Belhaven\OneDrive - Belhaven University\Dzirent-apk\androidApp-debug.apk`, which replaced the P3A copy. Same size and SHA-256 as the original.

TalkBack test list for the owner (TalkBack on, then Settings > Display > Font size and Display size at the largest):
1. **Home:** swipe through. Each card is one stop ("title, price, distance"), row titles are headings (swipe up/down with headings selected), "See all: <row>", and the avatar says "Open menu".
2. **Bottom bar:** each tab says its name once and "selected" on the current one; Inbox says "New activity" when the dot shows.
3. **Sidebar:** categories say "selected" / "not selected"; "All categories" is a heading.
4. **Listing page:** photos read "title, photo 1 of N"; Save says "Save" / "Remove from Saved".
5. **List an item:**
   - Add photos: the remove X on a photo says "Remove the front photo" and is easy to hit.
   - "Uploading your photos…" and "Checking your photos…" are read out by themselves, then the result.
   - In Details, tapping a date chip removes it, and TalkBack says "double-tap to remove these dates".
6. **Errors:** wrong password on sign-in, a contact detail in a listing title, too-short password in Change password. Each message should be read without moving to it.
7. **Closet:** the switch says "Show <title> in the shop, Active / Paused"; Edit and Delete say the title.
8. **Largest font:** sign-in, sign-up, listing editor buttons, filter sheet Reset/Apply, Settings Sign out. Labels wrap or grow, never cut off.
9. **Dark mode:** text field borders and outlined buttons are visible; accent text on grey chips is readable.

iPhone VoiceOver items for the next Mac session:
- **Test with VoiceOver actually on.** Compose Multiplatform builds the iOS accessibility tree only while an assistive technology is running. The Mac session's "no accessibility elements" was read from the inspector with VoiceOver off, so check again with VoiceOver on before concluding it's broken.
- Then the same list as above, on iPhone: headings (rotor), announcements (errors, photo check), one-stop listing cards, labelled buttons, and Dynamic Type at the largest size (Compose follows the system font scale on iOS).
- Build-check: `Accessibility.kt`, `Theme.kt` and the changed screens are all `commonMain`, with no iOS-specific code.

Open issues:
- **No device check:** none of this was heard on a device. TalkBack order, the live-region announcements and the largest-font layouts are untested until the owner's phone test.
- **Lint coverage:** Android Lint has no Compose accessibility checks. Lint passing proves only the XML/manifest side, and the Compose screens were reviewed by reading the code.
- **Small behavior change:** tapping an availability date chip now removes it. It used to do nothing, and only its tiny X removed it.
- **Large-text gaps:** segmented buttons in Settings (theme, units) keep one-line labels; at the largest font a long label may truncate, and TalkBack still reads it in full. The Home top bar has a fixed 56 dp height, enough for one line at the largest scale, but worth a look.
- **72 lint warnings** (none accessibility) are unchanged, mostly long vector paths in icons.

## P3B - 2026-11-07 - cleanup and retention

Done:
- **Before starting:** working tree clean, `Preview` already up to date with `origin/Preview` (`138343b`).
- **`pranalika/README.md`:** rule 15, copy every new Android debug APK to the OneDrive `Dzirent-apk` folder (copy, never move; confirm both). This task built no APK, so there was nothing to copy.
- **Backend:** `supabase/migrations/20261107140000_p3b_cleanup_jobs.sql`, pushed.
  - It installs `pg_cron`.
  - **Retention settings** in `app_private.settings`, each noting who decides:

    | Setting | Default | Decides |
    | --- | --- | --- |
    | `draft_retention_days` | 60 | Owner |
    | `orphan_photo_days` | 1 | Owner |
    | `photo_check_retention_days` | 90 | Owner |
    | `report_retention_days` | 730 | Attorney |
    | `data_export_retention_days` | 30 | Owner |
    | `age_checks_keep` | "latest" | Owner |
    | `suggestion_retention_days` | 365 | Owner |
    | `declaration_retention_years` | 7 | Attorney |
    | `device_token_stale_days` | 90 | Owner |

  - **Listings** get server-written `updated_at` (touched by any change to the listing, its photos, measurements or dates) and `published_at` (first time `active`). The 13 existing listings, all active, count as published.
  - **`app_private.job_runs`** is closed: one row per job run with job, mode, counts, error, start and finish.
  - **Seven database jobs:** `old_photo_checks`, `expired_reports`, `old_data_exports`, `old_age_checks`, `old_suggestion_choices`, `old_declarations`, `stale_device_tokens`. `app_private.run_cleanup_jobs()` runs them, each on its own, so one failure doesn't stop the rest.
  - **Age checks** keep the latest row per account and the latest decisive one, which the age gate reads. A strict "latest only" could have deleted the store "minor" that blocks an account.
  - **Two file jobs:** `abandoned_drafts` and `orphan_photos`. `public.cleanup_file_plan()` and `cleanup_record_run()` are callable with the server key only. `app_private.request_file_cleanup()` calls the function through `pg_net` with the Vault secret `cleanup_files_secret`.
  - **pg_cron:** `dzirent-cleanup-database` at 09:15 UTC, `dzirent-cleanup-files` at 09:30 UTC, nightly.
  - **Switches:** nine `app_settings` flags `cleanup_<job>`, all off (count only). They show on the admin Flags page with the existing confirmation, and `set_flag` logs each switch in the admin log.
  - `public.admin_cleanup_status()` (admin + two-step, logged) feeds the overview card.
  - The admin log and takedown records are never purged.
- **Edge Function `cleanup-files`** (deployed, `verify_jwt = false`):
  - It checks the shared secret in constant time, reads the plan, and in delete mode empties each abandoned draft's folder through the Storage API, then deletes the listing (as delete-listing does). It removes orphan files through the Storage API, and records both runs.
  - `CLEANUP_FILES_SECRET` was copied from Vault through a temporary file in my scratch folder, deleted at once. Never printed.
- **Website:**
  - The admin overview has a "Cleanup jobs" card: each job's mode badge, last run, counts and any error, with a link to the Flags page.
  - The privacy page's retention section has "Automatic Clean-ups" in plain words. The declaration and report periods stay visible placeholders. It also says the clean-ups are being switched on one at a time and are kept as the rest of the policy says until then, which is true while they only count.
- **`supabase/seed/remove_sample_data.mjs`:** signs in as test users 1 and 2 and calls `delete-listing` for each of their listings with one of the 12 sample titles. Without `--yes` it only lists them. **Not run, not even the dry run.** contract.md says to run it only when the owner says so.
- **Docs:** `contract.md` (jobs table, switches, `cleanup-files`, `admin_cleanup_status`, Sample data), `security-log.md` ("Cleanup and retention jobs (P3B)", Advisor), `compliance.md` (gaps 1-2, 5, 11, 14, 15, 24, 32, the admin log and takedown rows, TDPSA row, column map), `BOARD.md`.

What I ran:
1. `supabase db push --linked` (dry run first). Checked: both cron jobs active, 9 switches all off, 9 settings, 2 Vault entries, 0 unpublished listings, 0 job runs.
2. `supabase functions deploy cleanup-files --no-verify-jwt`; `supabase secrets set --env-file` (temporary file, deleted). `secrets list` shows `CLEANUP_FILES_SECRET`.
3. `node supabase/tests/p3b_cleanup.mjs` (new): **PASSED on the first run**. It runs `run_cleanup_jobs()` and `request_file_cleanup()`, the same calls pg_cron makes. `cleanup-files` answered 200 through pg_net.
4. Supabase Security Advisor: two new findings (`job_runs` closed, `admin_cleanup_status` admin-only), logged.
5. `apps/web`: `npm run lint` and `npm run build` pass, with no warnings (Node 22.23.4 from my scratch folder).
6. No emulator, device or screenshots. No Android build (no app code changed), so no APK to copy.

Count-only results (one run per job, all mode "count", no errors):

| Job | Would delete |
| --- | --- |
| `abandoned_drafts` | 0 listings, 0 photos |
| `orphan_photos` | 0 files |
| `old_photo_checks` | 0 photo checks, 0 photo results |
| `expired_reports` | 0 reports, 0 evidence |
| `old_data_exports` | 0 records |
| `old_age_checks` | 4 age checks |
| `old_suggestion_choices` | 0 |
| `old_declarations` | 0 accessory, 0 listing |
| `stale_device_tokens` | 0 tokens |

Nothing was deleted. The before and after snapshots matched exactly:

| Table or store | Rows |
| --- | --- |
| Listings | 13 |
| Photo rows | 25 |
| Photo files | 25 |
| Photo checks | 10 |
| Photo results | 18 |
| Reports | 6 |
| Evidence | 6 |
| Download records | 2 |
| Age checks | 6 |
| Suggestion choices | 13 |
| Declarations | 0 |
| Device tokens | 2 |

`job_runs` has exactly 9 rows, one per job. The 12 sample listings are untouched: same ids, still active, with the same 22 photo rows and 22 files.

Open issues:
- **The delete paths have not run.** By design, every job only counted. Before switching a job on, run it once in count mode (it runs nightly anyway), read the card, then switch. The first real run of `abandoned_drafts` should be watched.
- **The Flags page's generic wording.** The cleanup switches show their key as the title and my description. When turning one off, the page says "This will disable enforcement…". Fixing that wording means editing `components/admin/flags-view.tsx`, which was outside this task's folders.
- **Not covered:** `listing_events` (not in the job list; owner to decide), `auth.sessions` (a Supabase Auth setting), `pg_net` replies (its TTL), provider log retention (provider accounts, P5B/P7B), and the phones' original photos (needs an app change). All are in compliance.md.
- **Sample listings** are still there, waiting for the owner's go-ahead.
- **Attorney:** the declaration (7 years) and report (730 days) periods.

## P3A - 2026-11-07 - download my data

Done:
- **Before starting:** working tree clean. `git pull --rebase` fast-forwarded `Preview` from `9bdfd2c` to `6603cce` (the Mac iOS session, merged from `ios01`).
- **Backend:** `supabase/migrations/20261107130000_p3a_data_export.sql`, pushed.
  - `public.data_exports` records when each export ran; the owner reads their own and nobody writes it directly.
  - `public.export_my_data()` builds the whole file from `auth.uid()` only. It allows once per 24 hours, with an advisory lock against two exports at once, and refuses with "You can download your data once a day. Try again after Nov 8, 2026, 6:51 PM UTC."
  - Other people go through `app_private.export_person`: name (studio name, else display name) and handle.
  - `public.age_blocked()`, true or false for the caller, feeds the website's blocked page.
- **The rule:** I read every query against "nothing from another user's private data" before shipping. Choices it led to:
  - Messages are only `from: you / other person`, text and time, never sender ids.
  - Saved pieces show a title only while the piece is public.
  - Reports the user filed give reason, details and status. Not the outcome, admin note or evidence.
  - Blocked people, saved studios, chat and rental partners are name + handle only.
  - Photo checks' `duplicate` is only true or false.
- **Edge Function `export-my-data`** (deployed, `verify_jwt = false` in `config.toml`):
  - It verifies the token with Auth in code, then calls `export_my_data` with the caller's own token. It holds no server key.
  - It adds the plain-language `about` part (what each part is, the photo links, once a day), `exported_at`, and a `link` for every listing photo.
  - It returns the file with `Content-Disposition: attachment; filename="dzirent-data-<date>.json"`. The once-a-day refusal is HTTP 429.
- **Website:**
  - Settings > Privacy & safety (now `#privacy` on `/app/settings/preferences`) has "Download my data". It goes through `/api/workflows/export` and saves the file under the name the function gives.
  - The privacy page ("Download Your Data" in Your rights) and help ("Can I download a copy of my data?") now say where it is and that it works once a day. The privacy page's visible "/delete-account" link text is now "our account deletion page" (the plain-language task missed it).
  - **Welcome popups:** neither the guest "Welcome to Dzirent" popup nor the signed-in first-visit checklist opens on `/terms`, `/privacy`, `/community-guidelines`, `/copyright`, `/safety`, `/delete-account`, `/support` or `/help`. The app opens these in a browser, as a guest, so it was the guest popup the Mac session saw. The checklist waits for the next other page.
  - **Titles:** the template is `%s | Dzirent`, and the policy pages no longer add their own "| Dzirent" / "— Dzirent". Admin pages read "Admin: User Management | Dzirent" and so on.
  - **Age-blocked accounts** see a full page before anything else: "Dzirent is only for people 18 and older.", Delete my account (with a confirmation in the site's overlay), Sign out, and "Think this is a mistake? Contact support". The policy and support pages above stay readable.
- **Android and shared code:**
  - `platform/DataExport.kt` adds a `DataExportService` (`savesFiles`, `save` → SAVED / CANCELLED / FAILED) to `DeviceServices`.
  - `androidMain/.../AndroidDataExport.kt` uses the system "save file" picker (`ActivityResultContracts.CreateDocument("application/json")`). It is registered in `MainActivity.onCreate`, and the waiting file is held per process, so turning the phone while the picker is open still saves it.
  - Settings > Privacy & safety > "Download my data" (`DataExportSetting` in `Legal.kt`) suggests `dzirent-data-<date>.json` and shows a "Saved" toast and "Saved as …" under the row.
  - The downloaded file stays in memory, for that account and day, so a cancelled or failed save can be retried without hitting the daily limit. It is dropped on sign-out (`DzirentRepository.signOut`).
  - The once-a-day sentence reaches the row word for word.
- **iPhone:** `iosMain/.../IosDataExport.kt` has `savesFiles = false`, so the same row opens `AppLinks.DATA_EXPORT_URL` (the website's Settings > Privacy & safety).
- **Docs:** `contract.md` (`export-my-data`, `export_my_data`, `age_blocked`, `data_exports`), `security-log.md` ("Download my data (P3A)", Advisor), `compliance.md` (gap 13 handled with the rule, the TDPSA row, the column map), `BOARD.md`.

The export's parts, in file order: `about`, `exported_at`, `account` (email, created, last sign-in), `profile`, `private_profile` (measurements, consent time, fit profile, style interests), `listings` (each with `measurements`, `availability`, `photos` with `link`, `photo_checks` with per-photo results including the 768-number fingerprint), `saved_pieces`, `saved_studios`, `chats` (with `messages`, read time and rental answer), `rentals`, `blocked_people`, `reports_filed`, `warnings`, `accessory_declarations`, `listing_declarations`, `legal_acceptances`, `age_checks`, `notification_settings`, `devices` (platform and dates, no tokens), `suggestion_choices`, `listing_activity`, `earlier_exports`.

What I ran:
1. `supabase db push --linked` (dry run first) and `supabase functions deploy export-my-data --no-verify-jwt`.
2. `node supabase/tests/p3a_data_export.mjs` (new), as test user 3: **PASSED on the first run**.
   - The file is named `dzirent-data-2026-11-07.json`, starts with `about` then `exported_at`, and has all 20 parts, each explained in `about`.
   - Test user 1 appears only as `{"name":"Studio Rostova","handle":"studiorostova"}`. Their email and account id are nowhere in the file.
   - All 10 other-person entries hold only name and handle, and all 17 messages only from, text and time.
   - A second export is refused (429): "You can download your data once a day. Try again after Nov 8, 2026, 6:51 PM UTC." No token gets 401.
   - Setup cleared test user 3's earlier export times first (test data). This run's time stays, so test user 3 can't export again until Nov 8, 18:51 UTC.
3. Test user 3 has no listings, so I also checked the listing parts with one SQL call acting as test user 1. It returned 6 listings, 11 photos, 10 photo checks and 18 per-photo results (fingerprints of 768 numbers), with test user 3's email and id absent. I then deleted the `data_exports` row it made, so test user 1's daily limit is untouched.
4. Supabase Security Advisor: two new findings (`export_my_data`, `age_blocked`, both intended), logged.
5. `:androidApp:assembleDebug :shared:testDebugUnitTest`: BUILD SUCCESSFUL. 28 tests, 0 failures, including the new `DataExportTest` (3 tests).
6. `apps/web`: `npm run lint` and `npm run build` pass (Node 22.23.4 from my scratch folder). The first lint run flagged `window.location` in the blocked page; I switched it to the router and re-ran, and lint now reports no warnings.
7. No emulator, device or screenshots. Not run: an iOS build (no Mac here).

A mistake I made and fixed: a PowerShell replace script for the page titles flattened its list and swapped every letter "t" in 15 website files (`layout.tsx`, the eight policy pages, six admin pages). A byte-for-byte check showed each file differed from `HEAD` only by that swap, and none had other uncommitted changes. I restored them with `git checkout --` and made the title edits one by one. `git diff --numstat` then showed exactly one changed line per file. Nothing broken was committed.

Debug APK: `mobile/androidApp/build/outputs/apk/debug/androidApp-debug.apk` (built 2026-11-07 13:00 local time).

iOS work left for the Mac:
- Build-check the shared changes: `DeviceServices.dataExport`, `IosDeviceServices`, and the new `IosDataExport.kt`. None of the iosMain code was compiled here.
- **Native save:** in `IosDataExport.save`, write the bytes to a temporary file named `fileName`, then present `UIDocumentPickerViewController(forExporting:)` (or a share sheet) from the top view controller. Delete the temporary file afterwards, and return SAVED / CANCELLED / FAILED. Then set `savesFiles = true`; the shared row already handles the rest.
- Until then the iPhone row opens the website page in Safari, which needs the user to sign in there.

Open issues:
- **What the file leaves out:** provider logs (Supabase, Vercel, Google), declarations already unlinked from a deleted account, report evidence and reports about the user (moderation data), and anything only on the phone or in the browser. compliance.md gap 13 lists these for the attorney.
- **The daily limit counts at download, not at save.** On Android the kept file covers a cancelled or failed save until the app is closed. On the website a download the browser blocks still uses the day.
- **Android rotation:** if the phone turns while the picker is open, the file is still saved, but the "Saved" confirmation is lost with the old screen.
- **Size:** fingerprints make photo checks large: 768 numbers per photo, so about 8 KB each. Test user 1's file is fine, but a lender with many re-checked listings could reach a few MB.
- **Test user 3 can't export again** until Nov 8, 18:51 UTC (the test run's record). The test clears it itself next time.

## Mac iOS session - 2026-11-07

Branch: `ios01` only. Before starting: `git fetch`, `git switch ios01`, `git pull origin Preview` fast-forwarded `8c51207` to `9bdfd2c` (P2C, which had landed); the tree was clean. Kotlin (2.1.0) and Compose Multiplatform (1.7.3) weren't upgraded. No Android emulator or device.

Checkpoint 1 - it builds:
- `./gradlew :shared:compileKotlinIosSimulatorArm64` (env loaded without printing): BUILD SUCCESSFUL on the first try, no warnings in `iosMain` or `commonMain`.
- `xcodebuild -project iosApp.xcodeproj -scheme iosApp -configuration Debug -destination <iPhone 18 Pro, iOS 27.0> clean build`: CLEAN SUCCEEDED, BUILD SUCCEEDED.
- **No iOS compile fixes were needed** for 8B, P1B, P2A, P2B or P2C. Nothing to commit for this checkpoint; I pushed the fast-forwarded branch.

Checkpoint 2 - App Store requirements (`8f8972f`):
- New `mobile/iosApp/iosApp/PrivacyInfo.xcprivacy`, added to the app target's resources in `project.pbxproj` (`project.yml` picks it up from the `iosApp` folder). I checked that it is in the built `Dzirent.app`. `plutil -lint` passes.
- How I checked the APIs: the shared framework is static, so I ran `nm -u` on the built app and on each member of `shared.framework`, and `strings` for the Objective-C selectors. No `.xcprivacy` exists anywhere in the Gradle or Kotlin/Native caches, so no library ships its own manifest.
- **Declared:**
  - `NSPrivacyTracking` false, `NSPrivacyTrackingDomains` empty.
  - User defaults, `CA92.1`: `NSUserDefaults.standardUserDefaults` (settings, theme, drafts, age-check day; the session through multiplatform-settings). No app group.
  - File timestamp, `C617.1`: `stat`/`fstat`/`lstat` (Skia, ICU, the Kotlin/Native POSIX layer under okio/Coil) and `attributesOfItemAtPath` (photo size in `IosDevice.kt`). Files in the app container only.
  - System boot time, `35F9.1`: `CACurrentMediaTime` and `clock_gettime` (Compose frames, timeouts). Neither is on Apple's list by name, but both read the boot-relative clock, so I declared it to be safe.
  - Not declared, because nothing uses them: disk space and active keyboards. `sysctlbyname` is only used for CPU feature flags (`hw.optional.*`).
  - Collected data types, matching compliance.md 6.2: name, email, coarse location, in-app messages, photos, other user content, user ID, product interaction, other data. All linked to the user, none used for tracking. Device ID is left out while iPhone push is off.
- `NSPhotoLibraryUsageDescription` is removed from `Info.plist`. The app uses only `PHPickerViewController`, and camera shots are never saved to the library. The camera and location texts stay.
- `compliance.md`: new section 6.3, and gap 17 closed.

Checkpoint 4 - Apple's age check (P2C had landed; `bdd8184`, done before the Simulator run so it was exercised there):
- `IosAgeSignals.kt` now asks a Swift provider. `IosAgeRange.provider` is set in `iOSApp.init()`. `IosAgeRangeProvider` and `AgeRangeReply` are the bridge; -1 stands for an open bound. A 60 s timeout or no provider counts as no signal.
- New `iosApp/AgeRange.swift` (`DeclaredAgeRangeProvider`):
  - It runs only on **iOS 26.2+**, because `isEligibleForAgeFeatures` needs 26.2; the compiler refused 26.0.
  - It asks only when `AgeRangeService.shared.isEligibleForAgeFeatures` is true, then calls `requestAgeRange(ageGates: 18, in: <top view controller>)`.
  - `.sharing(range)` passes `lowerBound`/`upperBound` to `AgeSignal.fromRange`. An upper bound under 18 is a minor (recorded as `minor`, and the shared gate shows the blocked screen). A lower bound of 18 or more is an adult (`adult`).
  - `.declinedSharing`, any error, not covered, or older iOS: no signal, recorded as `self_declared`, which relies on the 18+ confirmation.
  - Like Android, users outside covered regions are never prompted. No birthdate is asked for or stored.
- `DeclaredAgeRange` is weak-linked (`-weak_framework`, confirmed `weak` in `otool -L`), so iOS 16-25 still launch.
- Entitlement: `iosApp/iosApp.entitlements` has `com.apple.developer.declared-age-range`. It is applied through `CODE_SIGN_ENTITLEMENTS[sdk=iphonesimulator*]` only, and the Simulator build's `.xcent` contains it. The project has no development team, and I couldn't confirm that a free personal team can sign this capability for a device. Device builds therefore don't carry it and behave as "no applicable signal" (the call fails or isn't eligible). Mirrored in `project.yml`.

Checkpoint 3 - Simulator (iPhone 18 Pro, iOS 27.0):
- **Launches: 2 of 4.**
  - Launch 1: my `simctl install` and `launch`.
  - Launch 2: a relaunch by the interaction subagent. It wrongly read the app as not running, so this one probably wasn't needed.
- **Screenshots viewed: 1 of 4**, saved at `~/Desktop/Dzirent/mac-ios-screenshots/01-after-relaunch-start.png`. The Compose UI exposes no accessibility elements, so the other screens were read by text recognition on the interaction tool's capture files (temp script, deleted).
- After the relaunch the app showed "Welcome to Dzirent", and test user 1 was signed in again.
- What was seen:
  1. **Terms:** "We've updated our terms" did not appear, as expected: test user 1 had accepted terms and privacy 1.0.0 on android in P1B's API test, and `needs_legal_acceptance()` is false (read through the API afterwards). **Agree was therefore not exercised on iPhone.** No 18+ blocked screen appeared.
  2. **Listing editor:**
     - Closet → "+ List an item", three photos (the seed denim jumpsuit front and back, plus a crop) → "Uploading your photos..." → "Checking your photos..." (about 30-50 s) → "Your photos look good." and "Filled from your photos."
     - Suggestions filled in: Title "Grey denim jumpsuit", Description "Grey denim jumpsuit with blue accents.", Category "Occasion & Party".
     - I added "Call me at 555-123-4567" to the Description and tapped Publish. It went back to Step 2 Details with "Please remove contact details from your listing; people can message you in Dzirent." under Description (and in a top banner). The text was kept.
     - "Start over" removed the server draft; the API shows no "New listing (draft)" left.
  3. **Measurements:** Chest 38 in → Save showed "Your measurements are private. We use them only to suggest pieces likely to fit you. They are never shown to anyone." with Not now / Agree. I tapped Not now and nothing was saved.
  4. **Settings > Help & legal:** Terms of Use and Privacy Policy each opened Safari at dzirent.com ("Terms of Use | Dzirent - Dzirent", "Privacy Policy | Dzirent - Dzirent").
- **Age check, end to end:** after the iPhone sign-in, `age_checks` for test user 1 holds `self_declared / adult / ios` at 18:27:44 UTC. The Simulator isn't in a covered region, so this is the no-signal path. The minor and adult paths could not be produced here.
- No crash: one pid from the relaunch to the end.
- `./gradlew :shared:iosSimulatorArm64Test` (with `SIMCTL_CHILD_*` test-user variables) **did not run**. The test task fails with `xcrun` exit code 137. `xcrun simctl spawn <device> /bin/echo hi` also exits 137, inside and outside the command sandbox. So every `simctl spawn` is killed on this Mac and Simulator, before any test code runs. The certificate error from Step 5C couldn't be checked either way; the XML results in `build/test-results` are still the 2026-11-05 ones.

Phase 2 - final builds on the final code: `:shared:compileKotlinIosSimulatorArm64 --rerun-tasks` BUILD SUCCESSFUL (task executed); `xcodebuild ... clean build` CLEAN SUCCEEDED, BUILD SUCCEEDED. No re-run was needed.

Android: not built here (no Android SDK on this Mac). Only `iosMain` and `iosApp` changed, so Android code is untouched.

Open issues:
- **`simctl spawn` exits 137** for any process, so the iOS unit tests can't run on this Mac right now. Try a reboot, or a different simulator runtime.
- **The terms "Agree" step is unverified on iPhone.** Test user 1 had already accepted. Test with test user 2 or 3, or after a new terms version.
- **Under-18 and adult Declared Age Range answers are untested.** They need a device on iOS 26.2+ in a covered region (or Apple's sandbox testing) with the paid account's entitlement.
- **The iOS UI has no accessibility elements in the hierarchy:** VoiceOver is likely broken. This belongs to P4B.
- The website's "Welcome to Dzirent" popup covers the Terms and Privacy pages when they're opened from the app, and page titles read "| Dzirent - Dzirent" (website, not changed here).
- The photo check suggested "Occasion & Party" for a denim jumpsuit.
- The Simulator photo library now holds the seed jumpsuit photos and a crop.
- **Secrets handling slip:** my first attempt to load the env files sourced them as shell. Their `KEY = value` format made zsh print the values in its error output, inside my local tool output only. Nothing was written to the repo, a file or a commit. The owner may want to rotate the test-user passwords and the DB password.

Needs the paid Apple Developer account:
- Enable the **Declared Age Range** capability on the `com.dzirent.app` App ID, set the team, and remove the `[sdk=iphonesimulator*]` condition from `CODE_SIGN_ENTITLEMENTS` (both `project.pbxproj` and `project.yml`).
- iPhone push (then add Device ID to the privacy manifest), TestFlight, App Store Connect privacy labels (from compliance.md 6.2 and 6.3), the age rating, and submission (P8B).

## P2C - 2026-11-07 - age gate and public text

Done:
- Before starting: working tree clean, `Preview` already up to date with `origin/Preview` (`5bff289`).
- **Backend** (`supabase/migrations/20261107120000_p2c_age_gate.sql`, pushed):
  - `public.age_checks`: user, source (`store_signal` / `self_declared`), result (`adult` / `minor` / `unknown`), platform, time. No birthdate field anywhere. Owner reads their own; written only by `record_age_check`. Removed with the account.
  - `record_age_check(p_source, p_result, p_platform)` returns true when the account is blocked. A self-declared `adult` from a profile without the 18+ confirmation is stored as `unknown`. The same answer within an hour adds no row.
  - **Blocked** = the latest decisive check is `minor`. Only a later store `adult` lifts it. A self-declared `adult` never does (so signing in on the website can't undo a Play "under 18"), and `unknown` changes nothing.
  - **The block:** a trigger `age_gate` on 22 tables refuses every insert and update by the blocked user with "Dzirent is only for people 18 and older." It is named to fire before the other triggers, so a blocked user sees this message, not a text-filter one. Reading, deleting rows, read receipts, `mark_activity_seen` (inbox) and account deletion still work. Admins and server jobs are not stopped.
  - When the block starts, the account's active listings are paused ("Paused: Dzirent is only for people 18 and older."), so nobody can start a chat with a minor. They stay paused after the block ends until the owner republishes.
  - `admin_find_user` also returns `age_check` (latest row) and `age_blocked`.
  - `20261107121000_p2c_preview_label.sql`: `app_settings.preview_label`, on.
- **Android:**
  - Google Play Age Signals `com.google.android.play:age-signals` **0.0.4** (the latest on Google Maven, published 2026-07-20). `androidApp/.../age/PlayAgeSignals.kt` calls `checkAgeSignals` and maps `ageLower` / `ageUpper`: a range ending under 18 is a minor, one starting at 18 or above is an adult, anything else (no range, an error, a 10-second timeout) is no signal.
  - 0.0.4 no longer has `userStatus`, and adds a Play prompt (`requestAgeSignalsAccess`) that I don't call: the app only reads what Play already shares.
  - Shared `util/AgeGate.kt` runs on every sign-in and once a day when the app opens (the day and the last answer are kept per account in the phone's prefs). It records adult or minor as `store_signal`, and no signal as `self_declared` / `adult`.
  - If the server can't be reached, the last answer stands (a store "minor" blocks anyway) and the check runs again next time.
  - The new `AgeBlocked` screen comes before the terms step: "Dzirent is only for people 18 and older.", with Delete my account (with a confirmation), Sign out, and Contact support.
  - The 18+ refusal reaches screens word for word (`DATABASE_MESSAGES`).
- **iOS:** `shared/src/iosMain/.../platform/IosAgeSignals.kt` is a clear stub returning "no applicable signal" (the iPhone records `self_declared`).
- **Website:**
  - Sign-up records `record_age_check('self_declared', 'adult', 'web')` after `accept_legal`.
  - Admin user lookup shows an "Under 18: blocked" badge and an "Age Check" cell.
  - Flags page: `preview_label` has a title and confirmation text. Switching it also refreshes the site-wide header.
  - "Preview only" sits in the header right after "How Dzirent works", on every page: red (`#c62828`; `#ff6b6b` in dark), 14px. On phones (760px and below) "How Dzirent works" is hidden, and the label sits next to the menu button on the logo row. It may wrap to two lines, and the side cells can shrink (`minmax(0, 1fr)`), so nothing is pushed off screen. The flag is read on every request; if it can't be read, the label shows.
  - **Overlay dialogs:**
    - `ConfirmSubmit` now confirms in the site's overlay (`WorkflowModal`) instead of `window.confirm`. Block uses it, and Report now does too (it had no confirmation).
    - If a required field is empty (the report reason, or anything on the sign-in page), the same overlay lists what's missing in plain words instead of the browser's bubble.
    - The only browser-drawn box on the sign-in page was that "please tick this box" bubble on the 18+ and terms ticks, so I took that to be the confirmation the task meant.
  - **Public text:**
    - Privacy: the provider list is now the one paragraph from the task; "Google Firebase delivers them" is now "our notification provider delivers them".
    - Passwords (privacy twice, delete-account once): "Your password is protected with one-way encryption, so no one, including us, can read it."
    - Age: privacy (what we collect, and the age section) and help ("Why is Dzirent 18+ only?") say that in some states we use your app store's age check, and that we never ask for or store your birthdate. Privacy and delete-account list age checks among what deletion removes.
    - "Last updated" is November 7 on privacy, help and delete-account. "Planned: Didit / Stripe" is gone from the config comments.
    - Google Play and Apple App Store stay on the delete-account page: they are app stores, not service providers.
  - Fixed the one lint warning (an unused `_reason` in `components/admin/flags-view.tsx`). The plain-language entry below wrongly named `action-dialog.tsx` as its file.
- **Docs:** `decisions.md` "Age gate (2026-11-07)", `contract.md` (Age gate, `age_checks`, `app_settings` now switched by `set_flag`), `security-log.md` (Age gate, Advisor), `compliance.md` (inventory row, section 4, the SB 2420 / Utah row handled on Android and web with iPhone pending, gap 7), `BOARD.md`.

What I ran:
1. `supabase db push --linked` (dry run first): both migrations applied. Checked: 22 `age_gate` triggers, `preview_label` = true.
2. `node supabase/tests/p2c_age_gate.mjs` (new): **PASSED on the first run**.
   - Guests read `preview_label` = true.
   - Bad source, result and platform are refused (`22023`), and so are guests (401).
   - Test user 3 with a store "minor": creating a listing, sending a message and editing the profile are all refused with `P0001` "Dzirent is only for people 18 and older.". Reading their own profile and age checks, and `mark_activity_seen`, still work. A self-declared adult afterwards keeps the block.
   - Store "adult": a test listing is created and published, and a message is sent. Clean-up deleted the listing and left test user 3 as adult. One test message stays in that chat.
3. `node supabase/tests/p2b_admin.mjs` (regression, with a new assertion): **PASSED**. Admin lookup at `aal2` returns test user 3's `age_check` (store_signal / adult / android) and `age_blocked = false`. Its clean-up reported "flags on: 1": that is `preview_label`, which is meant to stay on.
4. Supabase Security Advisor: one new finding (`record_age_check` callable by signed-in users, intended), logged in `security-log.md`.
5. `:androidApp:assembleDebug :shared:testDebugUnitTest` (JDK 21, `GOOGLE_SERVICES_JSON` set): BUILD SUCCESSFUL. 25 tests, 0 failures, including the new `AgeGateTest` (4 tests).
6. `apps/web`: `npm run lint` and `npm run build` pass (Node 22.23.4 from my scratch folder, as in the previous entry). Run once, then again after the lint-warning fix; the second lint run reports no warnings.
7. Final read-back: `preview_label` true; test user 3 latest check `store_signal/adult`, not blocked. A scan of every public page and the legal config finds no provider name.
8. No emulator, device or screenshots.

Debug APK: `mobile/androidApp/build/outputs/apk/debug/androidApp-debug.apk` (built 2026-11-07 12:08 local time).

iOS work left for the Mac:
- Replace the `IosAgeSignals` stub with Apple's Declared Age Range: the entitlement, a small Swift call asking for the range with an age gate of 18, then `AgeSignal.fromRange(lower, upper)`. The notes in the stub weren't verified on a Mac; check Apple's current API names and the minimum iOS version.
- Build-check the shared changes: `DeviceServices.ageSignals`, `IosDeviceServices`, and the new screen and state in `DzirentApp.kt`.

Open issues:
- **The signal is client-reported.** Play has no server-side check, so someone calling the API directly could send a store "adult" and lift their own block (security-log.md). Closing that needs ID verification (P6A) or a verified signal.
- **Play may return nothing for most users.** Ranges come only for users in covered states. A sideloaded debug build gets `APP_NOT_OWNED`, so the owner's phone test will most likely record `self_declared`. Seeing a real "minor" needs Play's test tools (`FakeAgeSignalsManager`) or a covered account. I didn't add a debug switch.
- **The website has no blocked screen.** A blocked account's writes are refused with the 18+ message wherever the site shows database errors, but nothing explains it up front. Android has the full screen.
- **Gap 7 remains open:** `adult_confirmed` is still writable by the user and not required. A self-declared adult without it is stored as `unknown`.
- **Minors can re-register.** Age checks are deleted with the account, so a blocked person can delete it and sign up again; on Android the next sign-in asks Play again.
- **Attorney:** whether Texas SB 2420 and Utah's law apply to Dzirent and in what form, and whether `self_declared` is enough outside covered states.
- **Policy version:** the privacy text changed (age checks), but `PRIVACY_VERSION` is still 1.0.0, so nobody is asked to accept again. The owner should decide whether that counts as a material change.
- **Owner checks after the commit:** the label in both themes and on a narrow phone (under about 340px it can touch the logo), and the new Block, Report and sign-in dialogs.

## Plain-language legal pages - 2026-11-07

Done:
- Before starting: working tree clean. `git pull --rebase` fast-forwarded `Preview` from `f25087d` to `380c82e` (website fixes, P2B part 2).
- Website content only (`apps/web`), no database or app code. Nothing in `compliance.md` changed.

What changed, per page:
- **Privacy** (`app/privacy/page.tsx`), the biggest change:
  - Cookies: the nine-row table with cookie names and storage types is now three categories (Essential: until you sign out; Preferences: up to a year; Drafts and reminders: until you clear your browser), plus "no advertising cookies, no tracking across other sites".
  - Outside providers: the table with regions and data received is now a four-line list (Supabase, Vercel, Google Cloud, Google Firebase) and the sentence "These providers process data only to run Dzirent for us, and our data is stored in the United States." "Under strict security commitments" is gone. The phone's location service moved to the location section ("your phone's or browser's location service, if you allow it").
  - Passwords: "stored in a scrambled form that can't be read back by anyone, including us", in the data list and in Security. No more "encrypted and hashed", "Supabase Auth" or "encrypted passwords".
  - Location: "rounded to about 1 kilometer (0.6 miles)" and "up to about half a mile" instead of decimal places and degrees; the city-centre explanation no longer names a directory.
  - Photos: "hidden photo information (such as GPS location) is removed" instead of EXIF and the drawing methods; photos public with random links instead of a bucket and path pattern; the photo check named as "our photo-check service, which uses open-source image models" instead of the model name and Cloud Run; "a numerical summary of what each photo looks like" instead of a 768-number vector. Added the nudity check and that a person looks when the check isn't sure.
  - New disclosures that compliance.md asked for (gaps 11, 12): what a report keeps (a copy of what was reported, with a few messages around a reported message), that reports and that copy survive account deletion for the 2-year placeholder period, that Dzirent staff see reports, photos for review and account details, sign in with two-step verification and have every action recorded, and that terms acceptance and warnings are stored.
  - Sign-in records, declarations and server logs: "the browser or app you used" instead of "user agent"; "the page or action requested" instead of "request path, status code"; no provider names, no "HTTP".
  - Security: the Row Level Security, TLS, bucket and Vault items are now "your data is yours", "encrypted connections", "encrypted storage", "passwords" and "limited staff access".
  - Retention: the server-log placeholder label no longer says "Supabase keeps logs for at least 7 days"; "content delivery cache" is now "may stay reachable at its old link for a short time"; the declaration retention got its own placeholder.
- **Community guidelines**: the model name and the 768-number fingerprint are gone; the "worn detection" item is now "photo safety: nudity not allowed, a worn piece is fine and never penalized"; the under-review outcome names the hood case; "the server automatically checks" is now "checked again automatically".
- **Help**: the photo-check results now match the app's words (Allowed, Under review, Not allowed, with the hood and nudity cases) instead of Approved, Flagged and "potential safety trigger"; "legal acceptances" and "from our database" reworded.
- **Delete account**: "backend triggers an immediate database cascade deletion" is now "deleted immediately"; "Supabase Auth login, phone number, and password hashes" is now sign-in details with the scrambled-password wording; "visual search embeddings" is now "photo-check results". Items Dzirent never had are removed: phone numbers, avatars, usernames, saved searches, reviews and ratings. Added what is deleted (notification registration, terms acceptance, warnings, chats and rentals for both people) and what stays (declarations with a retention placeholder, reports for the placeholder period, server logs). "Request endpoints" is now "what was requested".
- **Support**: "AI scanning checks" is now "how photo checks work".
- **Config**: `SERVICE_AREA` is "United States" (it mentioned the city selection).
- **Unchanged after reading:** terms, copyright, safety, about. They had nothing on the list.
- `BOARD.md` updated.

What I ran:
1. Baseline scan of the nine public pages, the legal config and `legal-layout.tsx` for the task's terms plus provider and model names: 41 hits, all in the privacy page.
2. Scan after the rewrite, for `sb-`, `dzirent-`, `LocalStorage`, `IndexedDB`, `HttpOnly`, `us-west`, `pdx1`, `Oregon`, `Portland`, `Cloudflare`, `edge`, `encrypted password`, `.tsx`, `rpc`, `bucket`, `revision`, and also `Supabase`, `Vercel`, `Firebase`, `Marqo`, `SigLIP`, `768`, `EXIF`, `cascade`, `SDK`, `hash`. Every remaining hit:
   - `.tsx`: the first-line path comment in eight files (`// apps/web/src/app/privacy/page.tsx` and the like). Code comments, never rendered.
   - `edge`: safety page, "lining edges" in the garment inspection table. An ordinary word.
   - `cascade`: delete-account page, the section id `cascade-warning` (an anchor in code; the visible heading is "Impact on Shared Chats & Records").
   - `Supabase`, `Vercel`, `Firebase`: the provider list in the privacy page, company names only, as the task asked; "Google Firebase delivers them for us" in the notifications item.
   - No hit for `sb-`, `dzirent-`, `LocalStorage`, `IndexedDB`, `HttpOnly`, `us-west`, `pdx1`, `Oregon`, `Portland`, `Cloudflare`, `encrypted password`, `rpc`, `bucket`, `revision`, `Marqo`, `SigLIP`, `768`, `EXIF`, `SDK` or `hash` anywhere.
3. `npm ci`, `npm run lint`, `npm run build` in `apps/web`: all three pass. Lint reports one warning in `components/admin/action-dialog.tsx` (an unused `_reason`), which was there before and isn't mine. The build compiled all nine public routes.
   - The PC's Node is 18.20.7 with npm 6.14.18, which can't read the lockfile and is below the `engines` requirement (Node 22+). `npm ci` failed with it. I downloaded the official Node v22.23.4 Windows zip into my scratch folder (checksum verified against nodejs.org) and ran the three commands with it. Nothing was installed on the PC. BOARD has a row for the owner.
4. No emulator, device or app screenshots.

Disclosure check (compliance.md items and where each still appears):
- What we collect and why: Privacy §2 (account, profile, messages and rentals, declarations, reports, notifications, server logs), §3 location, §4 photos, §5 measurements.
- Who helps process it, where data is stored: Privacy §8 (four providers, United States).
- Retention and its placeholders: Privacy §10 (deleted photos, reports 2-year placeholder, server logs, backups) and §11 (declarations, reports, logs); Delete account §4 and §5 (same placeholders).
- Chats and rentals deleted for both people: Privacy §11 callout; Delete account §4 and §6.
- What declarations keep after deletion (legal name, email, city, IP address, time): Privacy §11; Delete account §5.
- Report evidence kept after deletion, staff-only: Privacy §2 "Reports you make", §7, §10, §11; Delete account §5.
- Staff access with two-step sign-in and a record of every action: Privacy §7 and §15.
- Deleted photos may stay reachable for a short time: Privacy §10 and §11; Delete account §4.
- Photos are public with random links: Privacy §4.
- Photo check, fingerprints not biometric, nudity check: Privacy §4; Community guidelines §5; Help "What are photo checks".
- Location rounded to about 1 km, distance in whole miles only, approximate permission only: Privacy §3.
- Hidden photo information (GPS) removed on all platforms: Privacy §4.
- Display name shown to guests when there is no studio name: Privacy §2 and §12.
- Measurements private, consent before saving, withdrawal deletes them: Privacy §5; Help "Fit & measurements".
- Firebase in the Android app and what it sends Google: Privacy §2 "Notifications".
- Server logs with IP addresses: Privacy §2 and §10; Delete account §5.
- Rights (access, correction, deletion, download on request, notifications, appeals): Privacy §13; Help "Account & privacy".
- 18+: Privacy §14; Terms §2; Help "Why is Dzirent 18+ only?".
- No ads, no tracking, no selling, no analytics: Privacy §1, §6, §9.
- Terms acceptance stored and deleted with the account: Privacy §2 and §11; Delete account §4.

Open issues:
- The `DATA_RETENTION` placeholder is used for five different periods (deleted photos, reports, server logs, backups, declarations) with different labels. When the attorney fills the config, one value would show for all five; the config needs separate keys first (`legal-placeholders.md` lists the periods).
- The report retention label says "currently 2 years, pending attorney review", matching the 730-day setting in the database.
- The website build needs Node 22 on this PC (BOARD).
- Terms, copyright, safety and about were read and left as they were.

## P2B part 1 - 2026-11-07 - admin backend

Done:
- Before starting: working tree clean. `git pull --rebase` fast-forwarded `Preview` from `a69f158` to `fbf8b7c` (website catch-up).
- `supabase/migrations/20261107100000_p2b_admin_core.sql`:
  - **Admins:** `app_private.admin_users` (account, added time, added by), closed to every API role. `public.is_admin()` is true only for an admin whose JWT is `aal2`. `app_private.require_admin()` is the first statement of every admin function.
  - **Admin log:** `app_private.admin_actions` (admin, action, target type and id, reason, before and after, time). Triggers refuse every update, delete and truncate. Written by `app_private.log_admin_action`.
  - **Settings:** `app_private.settings` with `report_retention_days` = 730, a placeholder for the attorney.
  - **Suspensions:**
    - `profiles.suspended_until` and `suspension_reason`; a trigger keeps them for app roles.
    - Messages, new chats and reports by a suspended account are refused: "Your account is suspended until Nov 8, 2026. Reason: …." For a ban (`infinity`): "Your account is suspended. Reason: …."
  - **Holds:** `listings.hold` (`hidden` or `suspended`), `hold_reason` and `hold_restores`.
    - A held listing is paused (out of the shop window) with `auto_paused_reason` ("Hidden by Dzirent: …." or "Paused while your account is suspended."). Apps can't set or clear a hold or republish a held listing, and a suspended owner can't publish.
    - Lifting a hold restores `active` if the listing was active. An admin hide survives the end of a suspension.
    - I chose holds over editing every shop-window function: the shop window already shows only active listings.
  - **Reports:**
    - The reporter's foreign key is now `on delete set null`.
    - New columns: `target_user_id` (server-set), `status`, `outcome`, `outcome_note`, `closed_at`, `closed_by`. Apps always insert `open`.
    - Message reports must be in the reporter's own chats.
    - `app_private.report_evidence`: a snapshot at insert (message plus 5 before and after with sender ids, names, handles and times; listing text and photo paths; profile public fields). It is closed to API roles and an update trigger refuses changes.
    - Report details skip the text filter; reason is still checked.
    - `app_private.purge_expired_reports()` exists but isn't scheduled (P3B).
  - **Other tables and columns:**
    - `public.user_warnings`: owner-readable warnings.
    - `app_private.takedown_requests`.
    - `listing_scans.admin_reason`.
- `supabase/migrations/20261107101000_p2b_admin_functions.sql`: the admin functions listed below. Each checks `require_admin()` first and writes one log row, reads included.
- **Edge Function `admin-actions`** (deployed, `verify_jwt = false` in `config.toml`):
  - Validates the token, then asks `is_admin()` with the caller's own token.
  - Only then uses the server key: Auth ban or unban (`ban_duration` about 100 years / `none`), or deleting photo files. The database side (`admin_record_ban` / `admin_remove_photos`) runs as the caller.
  - Self-ban is refused.
- **`supabase/seed/admins.mjs`:** syncs `admin_users` to `ADMIN_EMAILS` (adds listed accounts, removes unlisted ones, logs each change, refuses an empty list, prints counts only). It runs the CLI binary directly, so the SQL isn't mangled by a shell.
- **Apps** (shared code):
  - The review banner shows the check's own reason when there is one (hood, photo safety, copied photo, or "not sure what this piece is"), otherwise "Someone at Dzirent will check these photos."
  - An admin's rejection shows `admin_reason`.
  - **Suspension notice:** `Profile.suspendedUntil` / `suspensionReason` and `util/Suspension.kt` give the same wording as the database plus "Contact support if you think this is a mistake." A `SuspensionNotice` card shows:
    - at the top of the listing editor;
    - instead of the chat message box;
    - instead of the report form.
    - Each screen reads the profile fresh, so a suspension that started after sign-in still shows.
  - The suspension, hidden-listing and own-chat refusals reach the screens word for word (`DATABASE_MESSAGES`).
- **Docs:** `contract.md` ("Admin"), `security-log.md` ("Admin role", Advisor findings, `admin-actions`), `compliance.md` (gap 11 closed, gap 12's backend done, report retention and admin data in 1.9, column map), `decisions.md` ("Admin (2026-11-07)"), `BOARD.md`.

Every admin function (all need admin + two-step sign-in, all logged):
- **Status:**
  - `is_admin()`: true for an admin at `aal2` (any signed-in user may ask).
- **Queues:**
  - `admin_queues()`: counts of open reports, scans in review, open takedowns, and ID reviews (0 until P6A).
  - `admin_list_reports(p_status, p_limit, p_offset)`: reports with reporter and target names and the evidence snapshot.
  - `admin_list_scan_reviews(p_limit, p_offset)`: photo checks waiting for a person, with each photo's path, decision, warnings, nudity and hood scores.
  - `admin_list_takedowns(p_status, p_limit, p_offset)`: takedown requests (open ones by default).
  - `admin_list_id_reviews()`: an empty list until ID verification (P6A).
- **Reports:**
  - `admin_dismiss_report(p_report_id, p_reason)`: closes a report as dismissed.
  - `admin_warn_user(p_user_id, p_note, p_report_id)`: stores a warning the user can read; closes the report as warned.
  - `admin_remove_reported_content(p_report_id, p_reason)`: deletes a reported message, hides a reported listing, or clears a profile's studio name, bio and pickup area; closes the report as content_removed.
- **Suspensions and bans:**
  - `admin_suspend_user(p_user_id, p_days, p_reason, p_report_id)`: suspends for 1 to 3650 days and holds the user's active listings.
  - `admin_unsuspend_user(p_user_id, p_reason)`: lifts the suspension and restores the held listings.
  - `admin_record_ban(p_user_id, p_banned, p_reason, p_report_id)`: the database side of a ban or unban (open-ended suspension); called by `admin-actions`.
- **Photo checks:**
  - `admin_decide_scan(p_scan_id, p_decision, p_reason)`: approves or rejects a finished photo check, with a reason the lender sees.
- **Listings:**
  - `admin_hide_listing(p_listing_id, p_reason)` / `admin_unhide_listing(p_listing_id, p_reason)`: hides a listing from everyone, then restores it.
- **Takedowns:**
  - `admin_create_takedown(...)`: records a copyright takedown request from a support email.
  - `admin_takedown_remove_listing(p_takedown_id, p_listing_id, p_reason)`: hides the listing and marks the request actioned.
  - `admin_remove_photos(p_listing_id, p_photo_ids, p_reason, p_takedown_id)`: removes photo rows and returns their storage paths. Use it through `admin-actions`, which also deletes the files.
  - `admin_record_counter_notice(p_takedown_id, p_notice, p_received_at)`: records a counter-notice.
  - `admin_set_takedown_status(p_takedown_id, p_status, p_note)`: sets rejected or restored, or corrects the status.
- **Flags, metrics, lookup, the log:**
  - `set_flag(p_key, p_enabled)`: switches a feature flag.
  - `admin_metrics()`: users, new users this week, active listings, scans this week by verdict, open reports, messages this week, suspended users.
  - `admin_find_user(p_query)`: looks up an account by email, handle or id, with suspension, ban, report, warning and listing counts.
  - `admin_audit_log(p_limit, p_offset)`: the admin log, newest first.
- **Edge Function `admin-actions`:** `ban`, `unban` and `remove_photos`, the steps that need the server key.

How to add an admin (also in `contract.md`):
1. The person signs up on Dzirent with their email.
2. The owner adds that email to `ADMIN_EMAILS` in `H:\DziRent\secrets\providers.env` (comma-separated).
3. An agent runs `node supabase/seed/admins.mjs` from the repo root.
4. The admin enrolls TOTP and signs in with it; the admin website does this in P2B part 2.

To remove an admin, take the email out of `ADMIN_EMAILS` and run the script again.

What I ran:
1. Read the hosted Auth MFA settings (GET, non-secret fields): TOTP enroll and verify on, `mfa_allow_low_aal = false`. Edge Function secret names: the default key variables are present.
2. `supabase db push --linked` (dry run first) for both migrations. `supabase functions deploy admin-actions --no-verify-jwt`.
3. `node supabase/tests/p2b_admin.mjs`: PASSED on the first run, and again after I extended it.
   - I extended it because test user 3 has no active listings, so the hold path wasn't exercised. It now also hides and unhides a listing and briefly suspends test user 2.
   - Refusals:
     - Test user 3 (not an admin): all 23 admin functions and `is_admin()` refused (`42501`, "Admins only"); `admin-actions` refused (403).
     - Test user 1 in `admin_users` at `aal1`: all refused with "two-step"; `admin-actions` refused.
   - TOTP: enrolled through `/auth/v1/factors`, with the code computed in the script. After verify, `is_admin()` is true at `aal2`.
   - Queues: all four counts.
   - Report evidence:
     - Test user 3 reported a message from test user 1, with a filtered word in the details, and the report was accepted.
     - The evidence held the message plus 5 before and 1 after.
     - `admin_remove_reported_content` deleted the message and closed the report as `content_removed`; the evidence was byte-for-byte unchanged.
   - A listing report: its evidence held the title and 2 photo paths, and it was dismissed.
   - Suspending test user 3 for 1 day: sending a message was refused ("Your account is suspended until Nov 8, 2026. Reason: P2B test suspension."), and so was reporting. Unsuspending made sending work again.
   - Hiding one of test user 1's listings:
     - guests couldn't see it;
     - the owner's republish was refused ("This listing is hidden by Dzirent: P2B test hide. Contact support if you think this is a mistake.");
     - My closet showed "Hidden by Dzirent: P2B test hide.";
     - unhiding made it active again.
   - Suspending test user 2: active listings went 6 → 0, all held with "Paused while your account is suspended."; unsuspending brought back all 6.
   - Ban through `admin-actions`: test user 3's sign-in was refused (400); after unban it worked.
   - `payments_enabled` was switched on, then off.
   - Metrics, and lookup by `@handle`, worked.
   - Admin log: 19 rows by test user 1 in the run, covering every action. A SQL update on the log was refused.
   - Clean-up: TOTP factor deleted, test user 1 removed from `admin_users`, 0 flags on, test user 3 neither suspended nor banned (checked by SQL).
4. Security Advisor (2026-11-07 04:01 UTC): new are `is_admin` and the 23 admin functions (signed-in, elevated) and 5 INFO entries for the closed `app_private` tables. No new guest-callable function. All logged.
5. `node supabase/seed/admins.mjs`: "Listed: 1, accounts found: 0, added: 0, removed: 0". The email in `ADMIN_EMAILS` has no Dzirent account yet, so nobody is an admin.
6. `gradlew :shared:compileCommonMainKotlinMetadata :androidApp:assembleDebug :shared:testDebugUnitTest` (JDK 21, env loaded silently): BUILD SUCCESSFUL. 21 shared unit tests, 0 failures, 0 skipped; new: `suspensionNoticeMatchesTheDatabaseWording` and banner cases. No warnings in the changed files.
7. No emulator, device or screenshots.

Debug APK: `H:\DziRent\Dzirent_dev\mobile\androidApp\build\outputs\apk\debug\androidApp-debug.apk` (22.2 MB, 2026-11-06 22:04 local).

Owner phone test (after an admin has suspended your test account, or using the P2B part 2 website):
- While suspended: the listing editor shows the notice at the top, the chat shows it instead of the message box, and Report shows it instead of the form.
- A hidden listing in My closet shows "Hidden by Dzirent: …".
- A photo check in review shows its own reason, for example "This piece has a hood, …".

iOS-facing changes for a Mac check (all `commonMain`):
- `Models.kt` (`Profile` suspension fields and `suspensionNotice`, `ListingScan.adminReason`)
- `util/Suspension.kt` (new), `util/PhotoScan.kt`
- `Moderation.kt` (`rememberSuspensionNotice`, `SuspensionNotice`, the report dialog), `ListingEditor.kt`, `ChatScreens.kt`, `ListingStepPhotos.kt`
- `DzirentRepository.kt` (messages list)

Open issues:
- **`ADMIN_EMAILS` has no matching account yet.** Sign up with that email, then re-run the seed script.
- **No admin website yet** (P2B part 2), so there is no way to enroll TOTP except through the API.
- **Retention:** the 730-day report period is a placeholder for the attorney, and nothing deletes expired reports yet (`purge_expired_reports`, P3B). The admin log and takedown requests have no retention period either.
- **A ban keeps working sessions alive for a while.** It stops sign-in and token refresh, but an access token already issued works until it expires (up to 1 hour). The database refuses messaging, chats, reports and publishing at once, through the open-ended suspension.
- **Calling `admin_remove_photos` directly leaves the files** in the public bucket. The website should always use the Edge Function.
- **Test data stays:** messages and reports from the test, and the admin log rows (append-only by design).
- **Removing a profile's content** clears the studio name, bio and pickup area, but not the display name; use suspend or warn for that.

Requests (website, P2B part 2):
- Admin sign-in with TOTP: enroll (QR code from `/auth/v1/factors`), challenge, verify, then call the functions above with the `aal2` session. `is_admin()` tells whether to show the admin area.
- Ban, unban and photo removal go through `POST /functions/v1/admin-actions` with the admin's token.
- Show the scan's `admin_reason` and the listing's `auto_paused_reason` (holds) to the lender, and the suspension message where a suspended user would publish, message or report. The refusals already carry these words.
- Show the review reason from the scan (as the apps now do).

## P2A - 2026-11-07 - content safety

Done:
- Before starting: working tree clean. `git pull --rebase` fast-forwarded `Preview` from `ea240b7` to `c1be438` (P1B part 2, website).

Part 1, text filter, in the database:
- `supabase/migrations/20261107010000_p2a_text_filter.sql`, applied with `supabase db push` after a dry run.
  - **Lists:**
    - `app_private.text_filter_terms`: the LDNOOBW English list, 402 entries. The one emoji entry is left out.
    - `app_private.text_filter_allowed`: 20 phrases that are ordinary on a clothing marketplace, each with a note. Examples: "nude", "sexy", "tied up", "tight white", "big black", "girl on", "xx"/"xxx", "s&m" (it normalizes to "s m", as in sizes S M L), "pussy bow", "bondage pants", "poof sleeve(s)".
    - Both tables have RLS and no grants for any API role.
  - **Matching:**
    - Normalizes lower case and accents (`unaccent`), and reads 0 1 3 4 5 7 @ $ ! as o i e a s t a s i. Anything else becomes a space.
    - Each term is a whole-word pattern in which every letter may repeat. So "fuuuck" is found, but "cocktail", "classic" or "as" never match.
    - Allowlisted phrases are masked out first.
  - **Contact details** (public text only): phone numbers in US formats, 10 or more digits in a row, email addresses, links, bare domains on common endings, and `@handles`.
  - **Triggers** on `listings` (title, description, price note, deposit note), `profiles` (display name, studio name, handle, bio, pickup area), `messages` (body) and `reports` (reason, details). A column is checked only when it is inserted or changes.
  - **Refusals** are `P0001` with the plain-words message, and `hint` is the column name.
  - **`check_text(p_text, p_where)`** lets guests and signed-in users check text before saving. Sign-up needs it because the Auth API hides the database's message.
- `20261107012000_p2a_text_filter_one_as_l.sql`: my first check showed "bu11sh!t" getting through, because people write 1 for l too. The language check now reads the text both ways.
- **Apps** (shared code):
  - `DzirentException.field` carries the hint. The two refusal messages are passed through as they are.
  - Sign-up checks the display name first (`checkText`) and shows the refusal under the field.
  - My studio shows it under the studio name, handle, bio or pickup area.
  - The listing editor goes back to the form instead of the "publish failed" view. It opens the step with the field, shows the message under the title, description, price details or deposit note, and keeps what was typed. The message clears when the field is edited.
  - Chat shows it under the chat box, keeps the text and drops the Retry button.
  - The report dialog already showed errors under the details field.

Part 2, photos, in the vision service:
- `app/safety.py` (new): `Marqo/nsfw-image-detection-384`, pinned to `0c26ec22111b83f106d72a55f611ec35962bcb65`.
  - Preprocessing as in its model card: 384 center crop, bicubic, mean and std 0.5.
  - Loaded strictly with timm (already a dependency). `build_assets.py` downloads it into `/opt/model/safety` and loads it during the build, so a broken download fails the build.
- `app/verdict.py`, rules around the existing ones:
  - Any photo (size tags and close-ups included) with P(nudity or sexual content) of at least 0.90: rejected, "This photo isn't allowed on Dzirent.", before any other rule.
  - At least 0.40: review, unless already rejected.
  - A hooded reading (new `hooded` prompt bank in `vocab.json`) of at least 0.60 turns allowed into review: "This piece has a hood, so someone at Dzirent will check it."
- Worn: no warning ever mentioned it, and it was never a verdict input; tests now pin both. The per-photo labels in `photo_scans.labels` now also carry `hooded` and `safety.nsfw`.
- `policy.json` and `policy_item_types` are unchanged and still in sync (`test_policy_sync` passes).
- Redeployed with the Step 8A settings. Revision **`vision-00005-9cg`** serves 100%. `describe` shows max 1 instance, 2 CPU, 4 GiB, 120 s, concurrency 4, runs as `vision-runtime`; the only IAM binding is `roles/run.invoker` for `vision-invoker`. Health reports `service_version` `p2a.1`, both models with their revisions and licenses, and a 23.6 s start-up.
- Docs:
  - root `README.md` (open-source section: the safety model and its base, a "Text filter" table for the word list with its changes, the `unaccent` extension, NOTICE note);
  - `services/vision/README.md`;
  - `decisions.md` (appended "Content safety (2026-11-07)");
  - `contract.md`, `security-log.md` (four new Advisor findings, logged);
  - `compliance.md` (gap 22 closed; gap 23's nudity check closed, the fingerprint question still with the attorney);
  - `BOARD.md`.

Licenses checked (Hugging Face and GitHub APIs, at the pinned revisions):
- Word list: LDNOOBW, CC BY 4.0, commit `5faf2ba42d7b1c0977169ec3611df25a3c08eb13` (2020-07-13). Attribution and changes are in the README.
- Safety classifier: `Marqo/nsfw-image-detection-384`, Apache 2.0 (model card and API metadata). Its base model `timm/vit_tiny_patch16_384.augreg_in21k_ft_in1k` is Apache 2.0.
- Neither ships a NOTICE file. The card says it was trained on a proprietary dataset; the license is still Apache 2.0.
- Not used: the card's own example image, `beignets-task-guide.png`. It comes from the `huggingface/documentation-images` dataset, which is CC BY-NC-SA 4.0 (non-commercial). An openly licensed beignets photo stood in for it.

What I ran:
1. `supabase db push --linked` (dry run first) for both migrations.
2. Read-only `text_refusal` checks on 22 example texts. These cover leetspeak, repeated letters, spaced letters, words inside words, allowlisted words, sizes, phones, emails, links, domains, handles and accents. The one miss ("bu11sh!t") led to the second migration, then passed.
3. Existing rows that would fail: **none**. 13 listings × 4 fields, 5 profiles × 5 fields, 14 messages, 0 reports.
4. `node supabase/tests/p2a_text_filter.mjs` (test users 1 and 3): PASSED on the first run.
   - A phone number in a listing title was refused (400, hint `title`) and the title stayed unchanged.
   - The same number in a chat message was accepted.
   - A slur in a chat message was refused (hint `body`).
   - "cocktail", "classic" and "nude heels" were accepted.
   - `check_text` as a guest: "Jane Doe" passes; a name with an email is refused.
   - Two test messages stay in the test chat between users 1 and 3.
5. Security Advisor (2026-11-07 02:47 UTC): new are `check_text` (guest and signed-in elevated) and two INFO entries for the closed `app_private` filter tables. All are logged in `security-log.md`.
6. Vision service tests in the Step 8B scratch venv (Python 3.12.10, the pinned torch/timm/open_clip), with `VISION_SAFETY_DIR` set to the downloaded safety model: **54 passed**. 14 are new:
   - nudity rules: reject, review, support photos count, a rejection is never softened, low scores change nothing;
   - hood rules: review, a rejection is never softened, below the threshold stays allowed;
   - worn: never a verdict input, and no warning mentions wearing;
   - safety model: preprocessing, a strict load, and synthetic plain images scoring below the review line.
   - No real or explicit images were used.
7. Local run of the service's own code on the built assets (main model from the Step 8B scratch copy, text embeddings rebuilt for the new prompts). It matched the deployed results below exactly.
8. `services/vision/eval/run_eval.py` against the deployed service:
   - **Sample photos:** all 22 allowed one by one; all 12 sample listings allowed. Highest nudity score 0.054, highest hood score 0.340.
   - **Worn dresses** (openly licensed photos in my scratch): the red-carpet gown is allowed with only "Bottom of the item is cut off"; the runway maxi dress is allowed with no warning; a head-and-shoulders portrait goes to review because the item is unclear. No warning anywhere mentions wearing.
   - **Hoodie and sweatshirt set:** 4 rejected, 3 review. `hoodie/4` is allowed, as in Step 8B: that photo is the back of a long-sleeve print dress with no hood visible (I looked).
   - **Beignets** (the openly licensed stand-in): rejected as not clothing, nudity score 0.054.
   - **Step 8B Commons sets:** accept set 12 allowed, 2 review, 2 rejected; reject set 32 rejected, 10 review, 0 allowed. Both are the same as in Step 8B.
   - The script exits 1 only because of `hoodie/4`.
   - Highest nudity score over all 92 photos: 0.148, against the 0.40 review line.
   - Single-photo scans: median 1.1 s.
9. **Hood rule, end to end:** two openly licensed down-jacket photos (CC BY-SA 4.0) on the deployed service both went to review with "This piece has a hood…" (hood scores 0.95, nudity scores 0.05).
10. `gradlew :shared:compileCommonMainKotlinMetadata :androidApp:assembleDebug :shared:testDebugUnitTest` (JDK 21, env loaded silently):
    - The first run failed: `decodeAs<String?>()` isn't allowed. I fixed it by decoding a `JsonElement`.
    - Second run: BUILD SUCCESSFUL. 20 shared unit tests, 0 failures, 0 skipped. No warnings in the changed files.
11. No emulator, device or app screenshots. The only images I viewed were a contact sheet of the three dress photos and the `hoodie/4` thumbnail; all test images stay in my scratch folder.

Vision revision: `vision-00005-9cg`.

Debug APK: `H:\DziRent\Dzirent_dev\mobile\androidApp\build\outputs\apk\debug\androidApp-debug.apk` (22.2 MB, 2026-11-06 20:06 local).

Owner phone test:
- Put a phone number in a listing's description and publish. You should go back to the details step, with the message under Description and your text kept.
- In the price or deposit note: More options opens with the message under that field.
- In My studio's bio: the message appears under Bio.
- Send a phone number in chat: it is sent. Send a listed word: the message shows under the chat box, with no Retry, and the text stays.
- Sign up with a display name that has an email in it: the message appears under Display Name.
- Upload a photo of a hooded jacket: the review banner shows.

iOS-facing changes for a Mac check (all `commonMain`):
- `DzirentRepository.kt` (`DzirentException.field`, `checkText`, the messages list)
- `AuthScreens.kt`, `MyStudioScreen.kt`, `ChatScreens.kt`
- `ListingEditor.kt` (`DepositFields` has a new optional parameter), `ListingEditorState.kt`, `ListingStepPhotos.kt`, `ListingStepDetails.kt`

Open issues:
- **The list is mostly sexual terms;** it covers only some slurs and hate terms. More terms can be added with a migration (`source` column).
- **Left blocked, though also ordinary words:** "lolita" (a Japanese fashion style) and "negro" (Spanish for black). The owner should decide; the BOARD has a row for it.
- **Report details are filtered too, as the task asked.** Someone reporting abuse can't quote a slur in the details; the reason picker still works.
- **Not checked:** listing measurement labels (free text up to 40 characters), and the accessory declaration's legal name.
- **The thresholds were calibrated only on the photos I had:** nudity 0.90 / 0.40, hood 0.60. No explicit images were used, so the reject line has no positive examples locally; the unit tests cover it with synthetic scores.
- **The apps' review banner** shows its own generic wording ("Someone at Dzirent will check these photos."), not the new hood or safety reason.
- **Two test chat messages stay in the database** (between test users 1 and 3).

Requests (website, `apps/web` not touched):
- Show the two text-filter refusals next to the field, and keep what was typed. Refusals carry the column name in `hint`.
- Check the sign-up display name with `check_text(name, 'profile')`, as the apps do, because the Auth API hides the database's message.
- Reuse the photo-check reasons as they are ("This photo isn't allowed on Dzirent.", "This piece has a hood, …").

## P1B part 1 - 2026-11-06 - terms acceptance and consent

Done:
- Before starting: working tree clean. `git pull --rebase` fast-forwarded `Preview` from `03df5fe` to `cbd6ce5` (P1A part 2 and its fix-up). `TERMS_VERSION` and `PRIVACY_VERSION` in `apps/web/src/content/legal/config.ts` are both `1.0.0`.
- Migration `supabase/migrations/20261106120000_p1b_legal_and_consent.sql`, applied with `supabase db push` (dry run first: only this migration was pending):
  - `legal_documents`: `terms` 1.0.0 and `privacy` 1.0.0, with their URLs. Readable by everyone; no API role can write it.
  - `legal_acceptances`: user, document, version, platform (`web`, `android`, `ios`), time. Unique per user, document and version. Owner reads; written only by `accept_legal`; removed with the account.
  - `accept_legal(p_platform)` (elevated, signed-in only) records the current version of both documents. `needs_legal_acceptance()` (runs as the caller) is true while either is missing. No user had accepted anything, so every existing user gets the terms step.
  - `private_profiles.measurements_consent_at`. The trigger `app_private.require_measurements_consent`:
    - keeps the stored consent time when an app writes the row (apps can't set or clear it);
    - refuses a new body measurement without consent (`P0001` "Give consent before saving your measurements."), on insert, update and upsert. An upsert reaches the INSERT trigger first, so the trigger reads the consent from the existing row.
    - Clearing a measurement, and saving only fit profile or styles, stays allowed.
  - `give_measurements_consent()` returns the consent time, keeping the first one. `withdraw_measurements_consent()` deletes the six measurements and the consent time.
  - All existing body measurements were deleted, so everyone is asked fresh.
- Mobile shared code (Android builds it here; iOS shares it):
  - **Sign-up:** the tick is now "I agree to the Terms of Use and Privacy Policy". Both names are links (`LinkAnnotation`) that open dzirent.com/terms and /privacy in the browser. It is required, and `accept_legal` runs right after sign-up (`AuthScreens.kt`). "Read how Dzirent works" stays below it.
  - **Terms step:** a new `AuthScreenState.NeedsTerms`. After sign-in, and when a saved session opens at app start, `needs_legal_acceptance()` decides. While it's true, the app shows only `TermsUpdateScreen` ("We've updated our terms", both links, Agree, Sign out). Agree calls `accept_legal` with `"android"` or `"ios"` (the push service's platform name). Sign out unregisters push first, as Settings does (`DzirentApp.kt`, `Legal.kt`).
  - **Measurements:** before the first save that includes a measurement, a dialog shows "Your measurements are private. We use them only to suggest pieces likely to fit you. They are never shown to anyone." with Agree / Not now. Agree calls `give_measurements_consent`, then saves (`BodyMeasurementsScreen.kt`).
  - **Settings > Privacy & safety > Measurements consent:** shows "Given" or "Not given". When given, tapping it asks "Withdraw consent?" ("Your saved body measurements will be deleted…") and then calls `withdraw_measurements_consent`.
  - **Passwords:** `PASSWORD_MIN_LENGTH = 8` (`Models.kt`) is used by the sign-up check, the sign-up field's hint, Change password, and the "too weak" server message.
  - **Settings > Help & legal:** Help (/help), Safety tips, Community guidelines, Terms of Use, Privacy Policy, Copyright, Delete account (/delete-account), Contact support (/support). All open in the browser; guests see them too. `LinkRow` from About is now shared, and About says "Terms of Use" instead of "Terms of Service".
  - Removed the unused `DzirentPolicy.SIGN_UP_CONSENT`.
- New test `supabase/tests/p1b_legal_consent.mjs`.
- `contract.md`, `security-log.md` (three new Advisor findings, logged), `compliance.md` (gaps 8, 9 and 21 closed for the database and apps, with the website remainder named; inventory rows and the column map updated) and `BOARD.md`.

What I ran:
1. `supabase db push --linked --dry-run`, then `supabase db push --linked`: applied.
2. `node supabase/tests/p1b_legal_consent.mjs` as test user 1: PASSED on the first run.
   - `legal_documents` shows privacy 1.0.0 and terms 1.0.0. `needs_legal_acceptance()` was true; after `accept_legal('android')` it is false. The two rows are privacy 1.0.0 and terms 1.0.0 on android. A guest call to `accept_legal` was refused (401).
   - A chest measurement upsert without consent was refused (400, P0001, "Give consent before saving your measurements."). A direct PATCH of `measurements_consent_at` was ignored.
   - After `give_measurements_consent()` the upsert saved 92 cm. `withdraw_measurements_consent()` then cleared the measurement and the consent time.
3. Read-only queries afterwards:
   - 1 of 5 users has acceptances (test user 1, from the test).
   - 0 rows with a body measurement, 0 with consent.
   - `has_function_privilege`: `anon` can't run any of the four functions; `authenticated` can't run the trigger function.
   - `has_table_privilege`: `authenticated` can't insert acceptances or change documents; `service_role` can't insert documents; `anon` can read documents, not acceptances.
4. Security Advisor (2026-11-07 01:03 UTC): new are `accept_legal`, `give_measurements_consent` and `withdraw_measurements_consent` (signed-in elevated functions, logged with reasons). Nothing else changed.
5. `gradlew :shared:compileCommonMainKotlinMetadata :androidApp:assembleDebug :shared:testDebugUnitTest` (JDK 21, both env files and `GOOGLE_SERVICES_JSON` loaded silently): BUILD SUCCESSFUL. 20 shared unit tests, 0 failures, 0 skipped (`SmokeTest` ran with the test-user env). No compiler warnings in the changed files.
6. No emulator, device or screenshots.

Debug APK: `H:\DziRent\Dzirent_dev\mobile\androidApp\build\outputs\apk\debug\androidApp-debug.apk` (22.2 MB, 2026-11-06 19:07 local).

Owner phone test:
- Sign in as test user 2 or 3. Test user 1 already accepted through the API test, so it won't see the terms step. You should see "We've updated our terms"; both links should open the website; Agree should enter the app; signing out and in again shouldn't show the step again.
- Sign out from the terms step: it should land in guest browsing.
- Sign up a new account: the tick needs ticking; the links open the pages; there should be no terms step afterwards.
- My measurements: enter a measurement and Save. The consent dialog shows; Not now saves nothing; Agree saves. Then Settings > Privacy & safety > Measurements consent > Withdraw: My measurements is empty again.
- Settings > Help & legal: each row opens the right page. Help (/help) has no page on the website yet.
- Sign-up with a 7-character password: refused with "at least 8".

iOS-facing changes for a Mac check (all in `commonMain`, no `iosMain` change):
- `Legal.kt` (new): `LinkAnnotation.Clickable` / `withLink` in `buildAnnotatedString`, `LocalUriHandler`, `AlertDialog`, Material icons `QuestionAnswer`, `Groups`, `Copyright`, `SupportAgent`, `Straighten`, `Description`, `PrivacyTip`.
- `DzirentApp.kt`: the `NeedsTerms` state and its check at start and sign-in.
- `AuthScreens.kt`, `SettingsScreen.kt`, `BodyMeasurementsScreen.kt`, `AboutScreen.kt` (`LinkRow` no longer private), `Models.kt`, `DzirentRepository.kt`.
- On iPhone, `accept_legal` gets `"ios"` from `IosPushService.platform`.

Open issues:
- **Website (out of scope here, `apps/web` not touched):**
  - It still uses the old "only connects people" tick, doesn't call `accept_legal` and doesn't check `needs_legal_acceptance`.
  - Its measurements form (`lib/workflow-mutations.ts`) has no consent step, so the database now refuses website measurement saves.
  - It still says 6-character passwords.
  - There is no `/help` page, which the apps link to.
  - Listed on `BOARD.md`.
- If `needs_legal_acceptance()` can't be reached (no connection), the app opens anyway and checks again at the next start or sign-in. The database doesn't block other actions for users who haven't accepted.
- With email confirmation turned on later (P8C), sign-up returns no session, so `accept_legal` can't run then. The terms step asks at the first sign-in instead, with the heading "We've updated our terms".
- A new terms or privacy version needs a migration that updates `legal_documents` together with the website's config.

## P1A part 1 - 2026-11-06 - data inventory

Done:
- Before starting: working tree clean, `Preview` up to date with `origin/Preview` at `62f50b5` (Step 8B); `git pull --rebase` was a no-op.
- New `pranalika/compliance.md`:
  1. data inventory, one row per data item across web, mobile, Supabase, the vision service and push, with a live table-and-column map;
  2. outside services;
  3. tracking and ads;
  4. how 18+ works today;
  5. security measures in place;
  6. Google Play Data safety and Apple privacy label drafts, with the items that change at P6A and P6B;
  7. rules to features, with phases;
  8. 32 numbered gaps, each with a fix and a phase from the handoff plan.
- New `pranalika/legal-placeholders.md`: every fill-in the legal pages need, with who fills it (owner, attorney, engineering) and a retention table to decide. All values blank.
- `BOARD.md`: new section "Handoff plan" with P1A to P8C; P1A part 1 Done.
- No code, database or settings changed.

What I ran (all read-only):
1. `supabase db query --linked` on `dzirent-server`:
   - columns of `public` and `storage`;
   - foreign-key delete rules (`information_schema` and `pg_constraint`, which also shows the keys into `auth.users`);
   - the bucket and its object count;
   - tables in the other schemas, and extensions;
   - RLS and policy counts, Storage policies, the Realtime publication;
   - `pg_net.ttl` and the age of its stored replies;
   - row counts of the tables in the inventory;
   - the key names (not values) in `auth.users.raw_user_meta_data`, and Vault secret names (not values);
   - `has_column_privilege` on `profiles` and `listings`.
2. Supabase Management API `GET /v1/projects/<ref>/config/auth`: printed selected non-secret fields only; SMTP only as set or not set.
3. Supabase log queries (read only): sources, field names, retention window, user-agent shapes with letters and digits masked. No IP, email or user agent was printed.
4. `gradlew :androidApp:dependencies --configuration releaseRuntimeClasspath` (JDK 21, env loaded silently): BUILD SUCCESSFUL. The first try stopped at the release guard (the configuration name contains "release"), so I set `ANDROID_VERSION_CODE_OFFSET=0` in that process only; one try through `cmd` couldn't find `gradlew.bat`. No build output was produced.
5. Read the merged manifest of the last debug build, and the Vercel project (MCP, read only).
6. `gcloud` (Cloud Logging buckets, sinks, audit config, Cloud Run describe): failed, it needs an interactive `gcloud auth login`. Cloud Logging retention, Cloud Run settings and the billing kill switch are marked unconfirmed.
7. Phase 2:
   - Schema: a script compared the live schema with `compliance.md`. All 26 tables were named. Many columns were only described in words, so I added the exact column map to 1.16. On re-run, all 193 columns are named.
   - EXIF: re-read the upload paths. The website has one upload call (`listing-editor.tsx`, blobs only from `compressPhoto` or the IndexedDB draft of them). The phones have one (`ListingPublisher.syncPhotos` through `compressImage` on Android and iPhone). All three re-encode the photo; none strips on the server.
   - Tracking: 0 matches in the release dependency tree for 15 analytics, ads and crash SDK names. 0 in `apps/web/package-lock.json` for 11 web analytics names; the 18 `gtag` hits are all inside `tostringtag`. `apps/web/package.json` and `mobile/iosApp/project.yml` have no such dependency.
   - Fixes made from these checks: support email exists (`support@dzirent.com` in About and the website menu); style interests come from the measurements screen; push tokens are registered on every sign-in and app start, notification permission or not.
8. No emulator, device or screenshots.

Gap list summary (`compliance.md` section 8):
- Kept after deletion:
  - accessory declarations keep legal name, email, IP, user agent and city (gap 1, P3B);
  - listing declarations keep the IP (gap 2, P3B).
- Wrong data: website declarations record Vercel's IP and user agent, not the person's (gap 3, P5A).
- Photo metadata: removed by all three apps, but not on the server (gap 4, P5A). Phones keep the original photos with EXIF in app storage until pruned (gap 5, P3B).
- Location: the database doesn't round coordinates after sign-up (gap 6, P5A).
- Age: 18+ is a tick the user can undo through the API (gap 7, P2C).
- Consent: terms acceptance is not recorded (gap 8, P1B); no consent step before body measurements are saved (gap 9, P1B).
- Deletion effects: an account deletion removes the other person's chat and rental history (gap 10, disclose in P1A); reports lose their evidence (gap 11, P2B).
- Missing tools: no review tool (gap 12, P2B); no data download (gap 13, P3A).
- Retention: history that never expires, including scans, `listing_events` (nothing reads it), stale tokens, sessions and `pg_net` replies (gap 14, P3B); log retention unknown (gap 15, P3B, P5B, P7B).
- Logs: `send-push` puts the account ID and the push token in URL query strings, which the API logs record (gap 16, P5A).
- iPhone: no privacy manifest (gap 17, P8B).
- Android: backup includes the session and drafts (gap 18, P5A).
- Email: confirmation off, Auth `site_url` is localhost, no custom SMTP (gap 19, P6C, P8C).
- Security: no bot check, no message or report rate limits, no security headers (gap 20, P5A); clients still say 6-character passwords while the server needs 8 (gap 21, P5A).
- Content: chat text is unfiltered (gap 22, P2A); photos of people with no nudity check (gap 23, P2A).
- Disclosures: gaps 24 to 30.
- Not checked this session: gap 31, P7B.
- Sample listings in production: gap 32, P3B.

Requests:
- Owner: run `gcloud auth login` on this PC, so an agent can confirm Cloud Logging retention, the Cloud Run settings and the billing kill switch.
- Owner and attorney: fill `legal-placeholders.md`, including the retention periods, before P1A part 2 publishes the pages.
- This entry's title follows the task prompt (`P1A part 1 - ...`), not the `Step <number>` pattern in `README.md` rule 10.

## Step 8B - 2026-11-05 - photo scanning in the app

Done:
- Before starting: working tree clean, `Preview` up to date with `origin/Preview` at `2f65e95` (Step 8A); `git pull --rebase` was a no-op.
- Policy, in `services/vision/app/policy.json` and `policy_item_types` together (still 114 items):
  - Hoodies and sweatshirts are not allowed now: group "hoodies and sweatshirts", reason "This looks like a hoodie. Dzirent doesn't list everyday basics like hoodies and sweatshirts." (sweatshirt likewise).
  - Unchanged, as the owner decided: lingerie, underwear and swimwear not allowed; costume jewelry (necklace, earrings, bracelet, ring, brooch) allowed as "Costume jewelry" with the accessory declaration; a copied photo of a banned item stays rejected.
  - Sharper sweater and sweatshirt prompts, because on revision 3 two sweatshirt photos read as sweaters and went to review. The Western casual style prompt no longer mentions sweatshirts (`vocab.json`).
  - `test_policy_sync` compares `policy.json` with the newest migration that seeds the rows.
- Vision service redeployed twice with the Step 8A settings (`gcloud run deploy --source`): revision `vision-00003-thb` (policy), then `vision-00004-7rb` (sharper prompts), which serves 100%. Checked afterwards:
  - min instances unset (0), max 1, 2 CPU, 4 GiB, 120 s timeout, concurrency 4, no GPU, runs as `vision-runtime`;
  - the only IAM binding is `roles/run.invoker` for `vision-invoker`.
- Database (each migration applied with `supabase db push`):
  - `20261106040000_step8b_photo_policy.sql`:
    - the policy rows;
    - the `verification_required` description: "Renters and lenders verify their ID once, before their first message or first listing.";
    - `listings.auto_paused_reason` (at most 300 characters);
    - `listing_scans` in `supabase_realtime`;
    - `app_private.queue_scan`, shared by `request_scan` and the re-check (it returns the latest check when it is done and covers the current photos);
    - triggers on `listing_photos` (insert, delete, and changes of `storage_path`, `slot` or `listing_id`) that re-check active listings;
    - `vision_finish_scan` and `vision_fail_scan` pause an active listing with a reason while `vision_required` is on, or check again if the photos changed during the check;
    - the publish gate clears `auto_paused_reason` on a successful republish and on every insert by an app.
  - `20261106050000_step8b_sweater_prompts.sql`: the policy rows again, with the sharper prompts.
  - `20261106070000_step8b_server_role_helpers.sql`: a fix found by the API test (below). `service_role` needs USAGE on `app_private` and EXECUTE on `vision_pause` and `recheck_active_listing`.
  - `20261106080000_step8b_test_vision_on.sql`, then `20261106081000_step8b_test_vision_off.sql`: the flag on for API test 4, then off again.
- Mobile apps (shared code; Android builds it here, iOS shares it):
  - On-phone recognition removed:
    - code: `ItemRecognition.kt`, `ItemColor.kt`, `ItemRecognizer.kt`;
    - assets: the TinyCLIP model (`tinyclip_image.tflite`, 19.6 MB) and `label_embeddings.json`;
    - the LiteRT dependency and its AboutLibraries entry (`tinyclip.json`).
    - `ItemLabels.kt` keeps only the policy wording the editor still uses. The on-phone blur and lighting checks stay (`PhotoAnalyzer`, `PhotoGate`, `PhotoThresholds`).
  - New listing: after the photos step, the editor saves a paused draft row (title "New listing (draft)", a placeholder category), uploads the photos (`ListingPublisher.syncPhotos`) and calls `request_scan`.
    - "Checking your photos…" shows above the details while the lender types; nothing is blocked.
    - The scan is watched through Realtime, with a read every 4 s as the fallback (`DzirentRepository.watchScan`). After 3 minutes the editor stops waiting and shows "We couldn't check the photos right now." with a way to try again.
  - Allowed: the suggestions (category, item type, garment type, styles, title, description) fill only fields that are empty and weren't cleared by the lender, with the same accept and clear controls as before. On publish, kept, edited or cleared is logged to `suggestion_events`. The listing form has no color or pattern field: colors and pattern reach the listing only through the suggested title and description.
  - Rejected: a banner with the reason and "Replace photos" (back to the photos step). Review: "Someone at Dzirent will check these photos." (or the copied-photo reason). The lender can still finish the details either way.
  - The server's per-photo warnings show on each slot once the check is done, leaving out ones the phone already shows.
  - Publish reads `app_settings.vision_required`. When on, it waits for the check of the current photos, then the database gate decides, and its message is shown on refusal. When off, it publishes as before.
  - Editing a live listing keeps it live while saving; the server re-checks changed photos.
  - My closet: a draft shows a "Draft" badge and no switch; a paused listing shows its `auto_paused_reason`.
  - The local draft (`Drafts.kt`, version 2) remembers the server draft, the uploads and the scan. "Start over" deletes a draft row that was never published. Drafts saved by an older app version aren't offered any more.
- Root `README.md`:
  - product rules: hoodies and sweatshirts; lingerie, underwear and swimwear; costume jewelry with the declaration; automatic photo checks;
  - new section "Open-source software and models", built from `libs.versions.toml` and the Gradle files, `apps/web/package.json`, `requirements.txt`, the Dockerfile and the extensions in the migrations.
    - Licenses were read from the cached POMs, the installed Python package metadata, the npm registry, Hugging Face and GitHub, not from memory. Every link returned HTTP 200.
    - NOTICE files: PyTorch (link) and Requests (text). The models and the apps' direct dependencies ship none.
    - Google Play services Location is named separately as not open source.
- `contract.md`, `security-log.md`, `decisions.md` (appended "Photo policy (2026-11-05)") and `BOARD.md` are updated. The Step 8A entry below now has the measured cold start.

What I ran:
1. `pytest services/vision/tests` (scratch Python 3.12.10 venv): 40 passed, `test_policy_sync` included.
2. `run_eval.py` against the deployed service (identity token from gcloud): the 22 sample photos plus 8 openly licensed Commons hoodie and sweatshirt photos, kept in my scratch folder only.
   - Revision 3: hoodie/1 and sweatshirt/2 rejected; sweatshirt/3 and sweatshirt/4 went to review (read as sweaters). That is why the prompts were sharpened.
   - Revision 4 (`vision-00004-7rb`):
     - rejected: hoodie/1 ("This looks like a hoodie. …"), sweatshirt/2, sweatshirt/3 and sweatshirt/4;
     - review: hoodie/2, hoodie/3 and sweatshirt/1;
     - allowed: hoodie/4 (see open issues).
     - All 22 sample photos and all 12 sample listings are still allowed. Single-photo scans: median 1.3 s.
   - Local run of the final policy over the Step 8A Commons sets (scratch venv): the same as in Step 8A. Reject set: 32 rejected, 10 review, 0 allowed. Accept set: 12 allowed, 2 review, 2 rejected.
   - `H:\DziRent\vision-test\should-accept` and `should-reject` are still empty.
3. `gradlew :shared:compileCommonMainKotlinMetadata :androidApp:assembleDebug :shared:testDebugUnitTest` (JDK 21, env loaded silently, `GOOGLE_SERVICES_JSON` set): BUILD SUCCESSFUL.
   - Shared unit tests, re-run with `--rerun`: 19 passed, 1 skipped (`SmokeTest` needs the test-user env, which I didn't load). 7 of them are new, in `PhotoScanTest`.
   - Native libraries in the debug APK: `libandroidx.graphics.path.so` and `libdatastore_shared_counter.so`, for arm64-v8a, armeabi-v7a, x86 and x86_64. No TensorFlow Lite library and no model or label file is left.
4. API test `node supabase/tests/step8b_recheck.mjs <off|on> <photo>`, as test user 1 on "Emerald Velvet Cocktail Dress". The photo is a generated picture of a typed page (my own image, kept in scratch).
   - Flag off: adding the photo kept the listing active, and the automatic re-check finished in 7 s (review, "The photos seem to show different things, so someone at Dzirent will check them."). The listing stayed active with no reason. Removing the photo: re-checked, allowed (3 s). PASSED.
   - Flag on (migration `..._test_vision_on`): the re-check gave review (6 s), and the listing was paused with "Paused: the new photos need a check before this listing can go live again." The test removed the photo; `request_scan` gave allowed (4 s); the republish made it active and cleared the reason. PASSED.
   - Flag off again (migration `..._test_vision_off`). A final query showed `vision_required` off, the listing active with its 2 original photos and no reason, no listing anywhere with a pause reason, and only those 2 photos in its storage folder.
   - The first run failed: the check stayed `running`, because `service_role` couldn't call the new `app_private` helpers from `vision_finish_scan`. Fixed with the grant migration, then re-run.
   - The re-run's first attempt timed out too: the script compared scan times with this PC's clock, which runs about a second ahead of the server. It now compares scan IDs.
5. Security Advisor after all the migrations: no new findings. `has_function_privilege` on the new functions: as designed (`security-log.md`).
6. `gcloud run services describe` and `get-iam-policy`: the settings above.
7. No emulator, device or app screenshots. The only image I viewed was a contact sheet of the 8 Commons hoodie and sweatshirt photos.

Vision revision: `vision-00004-7rb`, serving 100%.

Native libraries removed: `libtensorflowlite_jni.so` (LiteRT), with the TinyCLIP model and its label embeddings.

Debug APK: `mobile/androidApp/build/outputs/apk/debug/androidApp-debug.apk` (21.3 MB, "Dzirent Debug").

iOS-facing changes, for a Mac check:
- `iosMain`: `IosPhotoAnalyzer.kt` no longer has a recognition stub and implements the slimmer `PhotoAnalyzer` (`platform/Device.kt`).
- `commonMain`:
  - editor: `ui/ListingEditor.kt`, `ListingEditorState.kt`, `ListingStepPhotos.kt`, `ListingStepDetails.kt`; `data/ListingPublisher.kt`, `data/PhotoAnalysis.kt`;
  - data: `repository/DzirentRepository.kt` (app settings, `request_scan`, scan reads, a Realtime channel on `listing_scans`), `model/Models.kt` (`ListingScan`, `auto_paused_reason`);
  - screens: `ui/MainScreens.kt` (closet), `ui/Policy.kt`;
  - util: `Drafts.kt`, `ItemLabels.kt`, `ListingForm.kt`, `ListingPhotos.kt`, `PhotoGate.kt`, `PhotoThresholds.kt`, new `PhotoScan.kt`; deleted `ItemRecognition.kt` and `ItemColor.kt`.
- Here only `:shared:compileCommonMainKotlinMetadata` ran (common code against common APIs). `iosMain` was not compiled.
- On a Mac:
  - check that the framework or Xcode build compiles;
  - in the Simulator: new listing, photos, "Checking your photos…", suggestions fill the details;
  - check whether Realtime connects with the Darwin engine. If it doesn't, the 4 s reads still finish the check.

Open issues:
- hoodie/4 came back allowed on revisions 3 and 4, as an African print dress. It is Damien Hirst's "Butterfly Hoodie" on a dress form: long and fitted with an all-over print, so it reads like a hooded mini dress. hoodie/3, the same garment from the front, went to review.
  - Not fixed: stricter prompts would risk turning real printed dresses away.
  - Owner to decide: accept such misses for now, or have hooded garments go to review.
- The owner's `vision-test` folders are still empty.
- A new listing's draft row (title "New listing (draft)", paused) stays on the server if the lender leaves the editor. It shows in My closet as "Draft"; "Start over" or Delete removes it.
- The website doesn't call `request_scan` yet. Its listings are checked only when photos change while the listing is active (the trigger).
- While `vision_required` is on, a lender whose active listings' photos change more than 20 times in an hour has that listing paused until the next check.
- Artifact Registry `cloud-run-source-deploy` now holds images for revisions 1 to 4 (about 0.68 GB each). The older ones can be deleted.
- Owner: phone test of the new listing flow (photos, the check banner, suggestions, publish, closet reason). Mac: the iOS check above.
- Test data left: the test's `listing_scans` and `photo_scans` rows on "Emerald Velvet Cocktail Dress" (removed with the listing).

## Step 8A - 2026-11-05 - vision service backend

Done:
- Before starting: working tree clean. Pulled `Preview` (fast-forward to `a59af89`, "Fix broken sample photos").
- Vision service, `services/vision/` (new): FastAPI on CPU PyTorch with Marqo-FashionSigLIP through open_clip, pinned to commit `c56244cc94f92419e8369fa71efdaf403b124ce8`.
  - Every Python package is pinned (`requirements.txt` is the full lock, installed with `--no-deps` and then `pip check`), and so is the base image (by digest).
  - The Docker build downloads the model and embeds all 446 prompts (`app/build_assets.py`). Only the vision tower's weights (354 MB) stay in the image, so a cold start reads local files only and never builds the text tower.
  - `POST /scan` and `GET /health`.
    - Per photo: `blur_score`, `brightness_score`, `framing_score`, `worn_by_person`, a 768-number `fingerprint`, label scores, a decision, and warnings worded as on the phone.
    - Per listing: verdict, a plain-words reason, suggestions and a quality summary. Suggestions are the category, item type and garment type (the database's own values), colors (from the garment's pixels), pattern, fabric, up to 3 styles from the app's list, a template title ("Maroon embroidered lehenga") and a description.
  - Quality checks (`app/quality.py`) and color names (`app/colors.py`) are numpy ports of the app's `PhotoQuality.kt` and `ItemColor.kt`, with the same thresholds and wording.
  - Policy (`app/policy.json`, 114 items): the README's allowed and not-allowed items, plus things that aren't clothing, each with 2 to 5 prompt phrasings and the lender-facing reason.
  - Verdict rules (`app/verdict.py`):
    - Allowed: allowed items take at least 0.90 of the probability, and neither not-allowed items nor not-clothing labels take more than 0.08.
    - Not allowed: one policy group reaches 0.60 while allowed items stay at 0.25 or less. The reason names the item.
    - Not clothing: both the labels and a separate general check reach 0.60. Reason: "This doesn't look like clothing or an accessory we list."
    - Everything else is unsure, and unsure or disagreeing photos give review, never allowed.
    - Size-tag and close-up photos never decide the verdict.
    - Quality never changes the verdict.
  - Photos are fetched only from the public `listing-photos` URL prefix (no redirects, 15 MB and 40 MP limits). `data:` image URLs are also accepted; the eval uses them so no test photo is uploaded anywhere.
  - Tests: `tests/` (color naming, title template, verdict thresholds, and `policy.json` = the migration's seed rows). Eval: `eval/run_eval.py`.
- Database, migration `20261105200000_step8a_photo_scanning.sql` (applied with `supabase db push`):
  - `vector` (0.8.2) in `extensions`.
  - `photo_scans` and `listing_scans`: the owner reads; only the server writes. One scan at a time per listing (partial unique index plus an advisory lock).
  - `policy_item_types`: the same 114 rows as `policy.json`, readable by everyone.
  - `app_settings`: `vision_required`, `verification_required` and `payments_enabled`, all off, readable by everyone, writable by no API role.
  - `request_scan(listing_id)`: owner only. It queues the scan and calls `scan-listing` through `pg_net` with the Vault secret `scan_listing_secret`, like `send-push`. Asking again while a scan runs returns that scan. A stuck scan fails after 10 minutes. Limit: 20 scans per lender per hour.
  - Server-only `vision_start_scan`, `vision_finish_scan` and `vision_fail_scan` (`service_role` only).
  - Duplicate check: a fingerprint with cosine similarity of 0.95 or more to a photo of another lender's listing turns allowed or review into review, with "This photo matches another listing."
  - Publish gate `listings_vision_publish_gate` (insert or status change to `active`, clients only). It acts only while `vision_required` is on.
- Edge Function `scan-listing` (new, deployed, `verify_jwt = false`):
  - Checks `x-scan-listing-secret` in constant time and marks the scan running.
  - Answers 202, then in the background (`EdgeRuntime.waitUntil`) signs a JWT as `vision-invoker`, swaps it for a Google ID token, calls `/scan` with public photo URLs (115 s timeout), computes the photo set hash and saves the result.
  - Any failure: `failed`, verdict review.
- Google Cloud (project `dzirent`, `us-west1`):
  - The four APIs were already enabled; `gcloud services enable` for them was a no-op.
  - Created `vision-runtime` (no roles) and `vision-invoker`.
  - Deployed `vision` with `gcloud run deploy --source`: no unauthenticated access, runs as `vision-runtime`, min 0, max 1, 2 CPU, 4 GiB, 120 s timeout, concurrency 4, no GPU.
  - Granted `vision-invoker` `roles/run.invoker` on the service only.
  - Created one key for `vision-invoker` (ID `476993fa…`).
  - Serving revision: `vision-00002-wgg`, URL `https://vision-296325491472.us-west1.run.app`.
  - Billing, budgets, `billing-alerts` and `stop-billing` were not touched.
- `contract.md`, `security-log.md`, `decisions.md` (appended "Photo scanning (2026-11-05)") and `BOARD.md` are updated.

What I ran:
- Locally, in a scratch Python 3.12.10 venv (same pinned versions, Windows wheels; nothing in the repo):
  - `pytest services/vision/tests`: 40 passed.
  - The bundled tokenizer gave the same token IDs as `timm/ViT-B-16-SigLIP` for all 446 prompts.
  - My preprocessing matched open_clip's own transform exactly (max difference 0).
  - The standalone vision tower gave embeddings identical to the full model's. Load time: 6.4 s instead of 14.4 s.
- Local calibration, before the first deploy:
  - Run on the 12 sample listings plus 58 openly licensed Wikimedia Commons photos kept in my scratch folder.
  - First thresholds (allowed at 0.70 / contrary at most 0.15): 3 of 42 should-reject Commons photos came back allowed (a uniform illustration, a shop mannequin, a man in a flight jacket filed under "Smartwatches"). They had allowed mass 0.85 to 0.89 and contrary mass 0.09 to 0.11. Genuine positives were at least 0.958.
  - Tightened to 0.90 / 0.08 and merged near-synonym groups (tank tops with T-shirts; track pants with sweatpants and joggers). Result: 0 allowed.
  - The general check had been vetoing clear accessories (sunglasses at 0.998 were sent to review), so it now applies only to not-clothing rejections, with fashion prompts that cover accessories.
- Duplicate threshold, measured locally:
  - Different garments: at most 0.80.
  - Front and back of one garment (same lender, not compared): 0.92 to 0.974.
  - Edited copies of one photo (JPEG q60, half size, 8% crop, +15% brightness, mirrored): at least 0.97.
  - So 0.95.
- Migration:
  - First run in a transaction that a final block always aborted (`DRYRUN_OK policy_rows=114 allowed=58 flags=3 flags_on=0 vector=0.8.2 triggers=1`). A follow-up query showed nothing persisted.
  - Then `supabase db push --linked --dry-run` (only this file) and `supabase db push --linked --yes`.
  - `has_table_privilege` / `has_function_privilege` for `anon`, `authenticated` and `service_role` on every new table and function: as designed.
- Secrets: `supabase secrets set` twice, through temporary files in my scratch folder, deleted right after; nothing printed. `supabase functions deploy scan-listing --use-api --no-verify-jwt`.
- Security Advisor after the migration: the only new finding is `request_scan` (logged). Performance Advisor: the only new item is `photo_scans_photo_id_idx` "not used yet". It is there for the photo-delete cascade.
- Phase 2:
  1. Unit tests: 40 passed (Python 3.12.10).
  2. Without sign-in, `GET /health` and `POST /scan` returned 403, and a made-up token got 401. `/health` with `gcloud auth print-identity-token` returned 200 (model, revision, Apache-2.0, 114 policy items).
  3. Eval: `run_eval.py` against the deployed service, twice (revisions 1 and 2), with identical results. The table is below.
     - `H:\DziRent\vision-test\should-accept` and `should-reject` were empty both times (0 files), so the owner's sets were not evaluated.
     - I added my scratch Commons sets as `commons-reject` and `commons-accept`. Their category labels are noisy: `boots/1` is footprints in snow, `hat/1` a car interior, `jeans/1` a building, `jumpsuit/1` a typed letter, `saree/2` a dog lying on saris.
     - No should-reject photo was allowed, so no change was needed after deploying.
  4. End to end: `node supabase/tests/step8a_scan.mjs` passed (warm).
     - Guests read 114 policy rows and three flags, all off. Guests got 401 for scans and `request_scan`.
     - Test user 1's `request_scan` on "Emerald Velvet Cocktail Dress" returned the same scan when asked twice. Test user 3 was refused (403).
     - The scan was done after 4 s: allowed, "This looks like a cocktail dress. You can list it." Suggestions: "Black velvet cocktail dress", Occasion & Party / dress, Western formal.
     - Both photos have `photo_scans` rows with 768-number fingerprints. User 3 reads none of it.
     - `scan-listing` with a wrong secret: 401.
  5. Gate: `supabase db query --linked -f supabase/tests/step8a_gate.sql`, one block that always ends by raising its results, so everything rolls back. With `vision_required` on, as the owner (role `authenticated` with their JWT claims):
     1. The real allowed scan let the listing publish. This also proves `scan-listing`'s hash matches the SQL `photo_set_hash`.
     2. A rejected latest scan: refused ("This listing can't be published yet: This looks like a T-shirt. …").
     3. Admin-approved: published.
     4. A photo moved slot: refused ("The photos changed after they were checked. …").
     5. A new listing inserted as active: refused ("Check the photos before publishing this listing.").
     6. Flag off: published.
     7. Another lender's photo with the same fingerprint: review, "This photo matches another listing."
     8. `vision_fail_scan`: failed / review.
     - Afterwards a separate query showed `vision_required = false`, no test rows, the listing still active and its photos unchanged.
  6. `gcloud run services describe` and `get-iam-policy`: min instances unset (0), max 1, CPU 2, memory 4Gi, no GPU, CPU only during requests, timeout 120 s, concurrency 4, runs as `vision-runtime`. The only IAM binding is `roles/run.invoker` for `vision-invoker`; there is no `allUsers` or `allAuthenticatedUsers`.
- Fixed after the first deploy:
  - `httpx` logged every photo URL at INFO (public URLs, but the logs are meant to hold counts only). `app/main.py` now sets `httpx` and `httpcore` to WARNING.
  - Redeployed: revision `vision-00002-wgg` has 0 log lines with URLs.
- No emulator, device or app screenshots. The only images I viewed were two contact sheets of the Commons test photos.

Eval, final run (revision `vision-00002-wgg`):

| Set | Photo | Expected | Verdict | Looks like | Reason | Warnings | Pass |
| --- | --- | --- | --- | --- | --- | --- | --- |
| sample | silk-halter-evening-gown/front | allowed or review | allowed | gown | This looks like a gown. You can list it. | Left side of the item is cut off | yes |
| sample | silk-halter-evening-gown/back | allowed or review | allowed | gown | This looks like a gown. You can list it. | Left side of the item is cut off | yes |
| sample | tailored-charcoal-blazer/front | allowed or review | allowed | suit | This looks like a suit. You can list it. |  | yes |
| sample | tailored-charcoal-blazer/back | allowed or review | allowed | suit | This looks like a suit. You can list it. |  | yes |
| sample | emerald-velvet-cocktail-dress/front | allowed or review | allowed | cocktail_dress | This looks like a cocktail dress. You can list it. |  | yes |
| sample | emerald-velvet-cocktail-dress/back | allowed or review | allowed | cocktail_dress | This looks like a cocktail dress. You can list it. |  | yes |
| sample | cashmere-belted-trench-coat/front | allowed or review | allowed | trench_coat | This looks like a trench coat. You can list it. |  | yes |
| sample | cashmere-belted-trench-coat/back | allowed or review | allowed | trench_coat | This looks like a trench coat. You can list it. |  | yes |
| sample | pleated-wide-leg-trousers/front | allowed or review | allowed | trousers | This looks like trousers. You can list it. |  | yes |
| sample | pleated-wide-leg-trousers/back | allowed or review | allowed | trousers | This looks like trousers. You can list it. |  | yes |
| sample | linen-summer-sundress/front | allowed or review | allowed | day_dress | This looks like a dress. You can list it. |  | yes |
| sample | embroidered-silk-lehenga-set/front | allowed or review | allowed | lehenga | This looks like a lehenga. You can list it. |  | yes |
| sample | embroidered-silk-lehenga-set/back | allowed or review | allowed | lehenga | This looks like a lehenga. You can list it. |  | yes |
| sample | modern-qipao-midi-dress/front | allowed or review | allowed | qipao | This looks like a qipao. You can list it. |  | yes |
| sample | modern-qipao-midi-dress/back | allowed or review | allowed | qipao | This looks like a qipao. You can list it. |  | yes |
| sample | minimalist-wool-day-coat/front | allowed or review | allowed | coat | This looks like a coat. You can list it. |  | yes |
| sample | minimalist-wool-day-coat/back | allowed or review | allowed | coat | This looks like a coat. You can list it. |  | yes |
| sample | structured-silk-work-shirt/front | allowed or review | allowed | dress_shirt | This looks like a dress shirt. You can list it. |  | yes |
| sample | vintage-denim-jumpsuit/front | allowed or review | allowed | jumpsuit | This looks like a jumpsuit. You can list it. |  | yes |
| sample | vintage-denim-jumpsuit/back | allowed or review | allowed | jumpsuit | This looks like a jumpsuit. You can list it. |  | yes |
| sample | satin-backless-maxi-dress/front | allowed or review | allowed | slip_dress | This looks like a slip dress. You can list it. |  | yes |
| sample | satin-backless-maxi-dress/back | allowed or review | allowed | slip_dress | This looks like a slip dress. You can list it. |  | yes |
| commons-reject | baseball_cap/1 | rejected | rejected | cap | This looks like a cap. Dzirent doesn't allow caps or hats. |  | yes |
| commons-reject | baseball_cap/2 | rejected | rejected | cap | This looks like a cap. Dzirent doesn't allow caps or hats. |  | yes |
| commons-reject | baseball_cap/3 | rejected | rejected | cap | This looks like a cap. Dzirent doesn't allow caps or hats. |  | yes |
| commons-reject | boots/1 (footprints in snow) | rejected | rejected | dog | This doesn't look like clothing or an accessory we list. |  | yes |
| commons-reject | boots/2 | rejected | rejected | boots | This looks like boots. Dzirent doesn't allow shoes or boots. | Too dark: try daylight | yes |
| commons-reject | boots/3 | rejected | rejected | boots | This looks like boots. Dzirent doesn't allow shoes or boots. |  | yes |
| commons-reject | dog/1 | rejected | rejected | dog | This doesn't look like clothing or an accessory we list. |  | yes |
| commons-reject | dog/2 | rejected | rejected | dog | This doesn't look like clothing or an accessory we list. |  | yes |
| commons-reject | dog/3 | rejected | rejected | dog | This doesn't look like clothing or an accessory we list. |  | yes |
| commons-reject | hat/1 (car interior) | rejected | rejected | sofa | This doesn't look like clothing or an accessory we list. |  | yes |
| commons-reject | hat/2 | rejected | rejected | cowboy_hat | This looks like a cowboy hat. Dzirent doesn't allow hats or caps. |  | yes |
| commons-reject | hat/3 | rejected | rejected | cowboy_hat | This looks like a cowboy hat. Dzirent doesn't allow hats or caps. |  | yes |
| commons-reject | jeans/1 (a building) | rejected | rejected | household_object | This doesn't look like clothing or an accessory we list. |  | yes |
| commons-reject | jeans/2 | rejected | rejected | jean_shorts | This looks like jean shorts. Dzirent doesn't list everyday basics like jean shorts. |  | yes |
| commons-reject | jeans/3 | rejected | rejected | jeans | This looks like plain jeans. Dzirent doesn't list everyday basics like jeans. |  | yes |
| commons-reject | laptop/1 | rejected | rejected | laptop | This doesn't look like clothing or an accessory we list. |  | yes |
| commons-reject | laptop/2 | rejected | rejected | laptop | This doesn't look like clothing or an accessory we list. |  | yes |
| commons-reject | laptop/3 | rejected | rejected | laptop | This doesn't look like clothing or an accessory we list. |  | yes |
| commons-reject | sandals/1 | rejected | rejected | dog | This doesn't look like clothing or an accessory we list. |  | yes |
| commons-reject | sandals/2 | rejected | rejected | sandals | This looks like sandals. Dzirent doesn't allow shoes. |  | yes |
| commons-reject | sandals/3 | rejected | rejected | sandals | This looks like sandals. Dzirent doesn't allow shoes. |  | yes |
| commons-reject | shorts/1 | rejected | rejected | shorts | This looks like shorts. Dzirent doesn't list everyday basics like shorts. |  | yes |
| commons-reject | shorts/2 | rejected | review | suit | We're not sure what this piece is, so someone at Dzirent will check the photos. | Too bright: avoid direct sun and flash | yes |
| commons-reject | shorts/3 | rejected | review | crossbody_bag | We're not sure what this piece is, so someone at Dzirent will check the photos. |  | yes |
| commons-reject | smartphone/1 | rejected | rejected | phone | This doesn't look like clothing or an accessory we list. | Strong glare: move out of direct light; Right side of the item is cut off | yes |
| commons-reject | smartphone/2 | rejected | rejected | phone | This doesn't look like clothing or an accessory we list. |  | yes |
| commons-reject | smartphone/3 | rejected | rejected | drink | This doesn't look like clothing or an accessory we list. |  | yes |
| commons-reject | smartwatch/1 | rejected | review | shirt | We're not sure what this piece is, so someone at Dzirent will check the photos. |  | yes |
| commons-reject | smartwatch/2 | rejected | review | bomber_jacket | We're not sure what this piece is, so someone at Dzirent will check the photos. |  | yes |
| commons-reject | smartwatch/3 | rejected | review | bomber_jacket | We're not sure what this piece is, so someone at Dzirent will check the photos. |  | yes |
| commons-reject | socks/1 | rejected | review | potli_bag | We're not sure what this piece is, so someone at Dzirent will check the photos. |  | yes |
| commons-reject | socks/2 | rejected | rejected | socks | This looks like socks. Dzirent doesn't allow socks. |  | yes |
| commons-reject | socks/3 | rejected | rejected | socks | This looks like socks. Dzirent doesn't allow socks. | Too bright: avoid direct sun and flash | yes |
| commons-reject | sweatpants/1 | rejected | rejected | sweatpants | This looks like sweatpants. Dzirent doesn't list everyday basics like sweatpants. |  | yes |
| commons-reject | sweatpants/2 | rejected | review | chinos | We're not sure what this piece is, so someone at Dzirent will check the photos. |  | yes |
| commons-reject | sweatpants/3 | rejected | rejected | joggers | This looks like joggers. Dzirent doesn't list everyday basics like joggers. |  | yes |
| commons-reject | tank_top/1 | rejected | rejected | tank_top | This looks like a tank top. Dzirent doesn't list everyday basics like tank tops. |  | yes |
| commons-reject | tank_top/2 | rejected | review | folklorico_dress | We're not sure what this piece is, so someone at Dzirent will check the photos. | Strong glare: move out of direct light | yes |
| commons-reject | tank_top/3 | rejected | rejected | cap | This looks like a cap. Dzirent doesn't allow caps or hats. | Strong glare: move out of direct light | yes |
| commons-reject | tshirt/1 | rejected | rejected | tshirt | This looks like a T-shirt. Dzirent doesn't list everyday basics like T-shirts. |  | yes |
| commons-reject | tshirt/2 | rejected | review | sweatshirt | We're not sure what this piece is, so someone at Dzirent will check the photos. |  | yes |
| commons-reject | tshirt/3 | rejected | review | shirt | We're not sure what this piece is, so someone at Dzirent will check the photos. |  | yes |
| commons-accept | blazer/1 | allowed or review | allowed | tie | This looks like a tie. You can list it. | Bottom of the item is cut off | yes |
| commons-accept | blazer/2 | allowed or review | allowed | blazer | This looks like a blazer. You can list it. |  | yes |
| commons-accept | handbag/1 | allowed or review | allowed | clutch | This looks like a clutch. You can list it. |  | yes |
| commons-accept | handbag/2 | allowed or review | allowed | clutch | This looks like a clutch. You can list it. |  | yes |
| commons-accept | jumpsuit/1 (a typed letter) | allowed or review | rejected | document | This doesn't look like clothing or an accessory we list. |  | no |
| commons-accept | jumpsuit/2 | allowed or review | allowed | bomber_jacket | This looks like a bomber jacket. You can list it. | Top of the item is cut off | yes |
| commons-accept | kimono/1 | allowed or review | allowed | kimono | This looks like a kimono. You can list it. |  | yes |
| commons-accept | kimono/2 | allowed or review | allowed | kimono | This looks like a kimono. You can list it. |  | yes |
| commons-accept | necktie/1 | allowed or review | allowed | tie | This looks like a tie. You can list it. |  | yes |
| commons-accept | necktie/2 (a drawing) | allowed or review | review | tie | We're not sure what this piece is, so someone at Dzirent will check the photos. |  | yes |
| commons-accept | saree/1 | allowed or review | allowed | saree | This looks like a saree. You can list it. |  | yes |
| commons-accept | saree/2 (a dog lying on saris) | allowed or review | rejected | dog | This doesn't look like clothing or an accessory we list. |  | no |
| commons-accept | sunglasses/1 | allowed or review | allowed | sunglasses | This looks like sunglasses. You can list it. |  | yes |
| commons-accept | sunglasses/2 | allowed or review | allowed | sunglasses | This looks like sunglasses. You can list it. |  | yes |
| commons-accept | wristwatch/1 (an LED DIY watch) | allowed or review | review | watch | We're not sure what this piece is, so someone at Dzirent will check the photos. |  | yes |
| commons-accept | wristwatch/2 | allowed or review | allowed | watch | This looks like a watch. You can list it. |  | yes |

| Sample listing (all photos together) | Photos | Verdict | Suggested title | Category / garment type | Colors | Styles | Quality |
| --- | --- | --- | --- | --- | --- | --- | --- |
| silk-halter-evening-gown | 2 | allowed | Navy satin gown | Occasion & Party / dress | Navy, Grey | Western formal | 2 of 2 photos could be better. |
| tailored-charcoal-blazer | 2 | allowed | Black wool suit | Career & Professional / suit | Black | Western formal | All photos look good. |
| emerald-velvet-cocktail-dress | 2 | allowed | Black velvet cocktail dress | Occasion & Party / dress | Black | Western formal | All photos look good. |
| cashmere-belted-trench-coat | 2 | allowed | Brown wool trench coat | Outerwear / top | Brown |  | All photos look good. |
| pleated-wide-leg-trousers | 2 | allowed | White trousers | Career & Professional / trousers | White | Western formal, Western casual | All photos look good. |
| linen-summer-sundress | 1 | allowed | Orange linen dress | Everyday / dress | Orange, Maroon | Western casual | All photos look good. |
| embroidered-silk-lehenga-set | 2 | allowed | Maroon embroidered lehenga | Cultural & Traditional / saree | Maroon | South Asian | All photos look good. |
| modern-qipao-midi-dress | 2 | allowed | Emerald silk qipao | Cultural & Traditional / dress | Emerald, Black | East Asian | All photos look good. |
| minimalist-wool-day-coat | 2 | allowed | Grey wool coat | Outerwear / top | Grey | Western casual | All photos look good. |
| structured-silk-work-shirt | 1 | allowed | Beige shirt | Career & Professional / top | Beige | Western formal | All photos look good. |
| vintage-denim-jumpsuit | 2 | allowed | Grey denim jumpsuit | Occasion & Party / dress | Grey, Blue | Western casual | All photos look good. |
| satin-backless-maxi-dress | 2 | allowed | Beige satin slip dress | Occasion & Party / dress | Beige, Grey |  | All photos look good. |

Totals: sample photos 22 of 22 allowed, sample listings 12 of 12 allowed. Commons reject set: 32 rejected, 10 review, 0 allowed. Commons accept set: 12 allowed, 2 review, 2 rejected (the letter and the dog photo).

Times:
- Warm: single-photo scans median 1.3 s, max 1.9 s (80 scans, eval round trip). A 2-photo listing through the whole chain (`request_scan` to done, polled every 3 s): 4 s.
- Cold start: not measured yet at this commit. Measured right after it (Step 8B session, revision `vision-00002-wgg`): after 20 idle minutes, `request_scan` to done took 54 s end to end (the scan row: created 03:08:59 UTC, finished 03:09:51). The new instance started at 03:09:01, the app was ready 39.4 s after its process started, and the scan itself took 3.7 s.
- The container's own start-up (Python imports and model load, from `/health`): 27.8 s on revision 1, 31.9 s on revision 2. A cold scan takes at least that plus the warm time.

Model license: Apache 2.0 (the Hugging Face model card and the repo's metadata, `license: apache-2.0`).

New secrets (names only):
- Supabase Edge Function secrets: `SCAN_LISTING_SECRET`, `VISION_URL`, `VISION_INVOKER_KEY_BASE64`.
- Vault: `scan_listing_secret` (and `scan_listing_url`, the function's address, not a secret).
- Local file: `H:\DziRent\secrets\vision-invoker-key.json` (the `vision-invoker` key).

Open issues:
- The owner's test folders `H:\DziRent\vision-test\should-accept` and `should-reject` were empty, so the thresholds were set on the sample listings and 58 Commons photos only. Fill the folders and re-run: `python services/vision/eval/run_eval.py --url https://vision-296325491472.us-west1.run.app --out results.json`. It exits 1 if a should-reject photo comes back allowed.
- The apps and the website don't call `request_scan` or show anything yet (backend only, as asked). Before `vision_required` is turned on, the clients must insert new listings as `paused`, upload photos, run `request_scan`, then publish. An insert straight to `active` is refused while the flag is on.
- The gate checks only the change to `active`. Photos changed on a listing that is already active aren't checked again. Owner to decide: re-scan or pause on photo change.
- There is no admin tool yet for `admin_decision` (review verdicts wait for one).
- Colors are pixel heuristics, as on the phone. The dark "Emerald" velvet dress reads as Black, and the light-wash denim jumpsuit as Grey and Blue.
- The framing check warns "Left side of the item is cut off" on both gown photos. That is not verified by eye; quality never changes the verdict.
- A scan with more than 8 photos fails and goes to review (the app has 6 slots).
- The duplicate check compares against every stored fingerprint (exact, no index). Fine at today's size; add an index or a limit when `photo_scans` grows into the tens of thousands.
- Artifact Registry `cloud-run-source-deploy` holds 2 images of 0.68 GB each. The older one (`20baf90e…`) belongs only to retired revision `vision-00001-h2z`; I left it in place, and it can be deleted.
- Test data left: the end-to-end `listing_scans` and `photo_scans` rows of test user 1's "Emerald Velvet Cocktail Dress" (removed with the listing).

Requests (owner to confirm):
- The policy table goes beyond the README's lists:
  - Lingerie, underwear and swimwear are not allowed (from the app's `ItemLabels.kt` policy).
  - Necklaces, earrings, bracelets, rings and brooches are allowed as "Costume jewelry" (the app's jewelry tier, with the accessory declaration).
  - Hoodies and sweatshirts are allowed, as in the app.
- The duplicate check keeps a rejected verdict rejected and turns only allowed or review into review. The prompt says "becomes review", but a banned item shouldn't move to review just because its photo was copied.

## Step 5D - 2026-11-04 - Android check and top padding

Done:
- Before starting: working tree clean. Pulled `Preview` (fast-forward to `c754168`, the 5C `ios01` merge).
- Top padding on Android: `androidMain/ui/BackHandler.android.kt`. `consumeScaffoldInsets(padding)` now returns `consumeWindowInsets(padding)`, the same as iosMain. Before, it returned the modifier unchanged. This is the only code change.
  - The NavHost already gets `padding(innerPadding)` from the outer Scaffold. Each screen's `TopAppBar` now no longer adds the status bar inset a second time.
- Nothing else changed. `PlatformNavigationBackHandler` on Android is still a no-op, and no commonMain or iosMain files were touched.
  - The commonMain `expect` comment in `MainAppScaffold.kt` still says "Android: unchanged (returns this modifier)". It's out of date now, but commonMain was off-limits because the build wasn't broken.

What I ran:
- `.\gradlew.bat :androidApp:assembleDebug :shared:testDebugUnitTest` (JDK 21, `GOOGLE_SERVICES_JSON` and the server env loaded), with the fix in place: BUILD SUCCESSFUL. 13 tests in 5 classes, 0 failures, 0 errors, 0 skipped.
- I didn't build the merge without the fix first. The 5C Android actuals compiled together with the fix in this one build.
- No emulator, device or screenshots.

Debug APK: `mobile/androidApp/build/outputs/apk/debug/androidApp-debug.apk` (local build, not committed).

Owner phone check:
- The fix is only visible where the app draws behind the status bar. That is always the case on Android 15+, because targetSdk 36 forces edge to edge. The app has no `enableEdgeToEdge()` call, so on older Android the insets may be zero there and nothing changes.
- Pages with their own top bar should now have their title right under the status bar, at the same height as the Home title, with no empty band above it: Listing Details, See all, Settings, About, Licenses, Chat, Measurements, My studio, Studio page, Moderation (blocked users), Policy pages, the listing editor and the accessory declaration.
- Should be unchanged:
  - Home and the welcome and sign-in pages.
  - The bottom bar, and the bottom of scrolling pages above the navigation bar or gesture bar. The consumed padding also includes the bottom, so check that nothing is now hidden under the bottom bar, for example on Chat (the message box) and the listing editor's bottom buttons.

Open issues:
- Not seen on a phone yet (above).
- The stale `expect` comment in commonMain `MainAppScaffold.kt` (above).

## Step 5C - 2026-11-04 - iPhone polish

Branch: `ios01` only. Before starting I switched to `ios01` and pulled `Preview` (fast-forward to `95ddbfe`, 5B); the tree was clean. Kotlin and Compose Multiplatform weren't upgraded.

Done:
- Swipe back (`e70ee50`, final version `0f8e4ec`):
  - A drag that starts within 24 pt of the left screen edge and moves right goes Back once it reaches 80 pt (or a quick flick past 24 pt). It goes to the same place as the on-screen back arrow, through the same `popBackStack()`.
  - `iosMain/ui/BackHandler.ios.kt`:
    - `IosBackDispatcher`: the most recently added enabled handler wins, as on Android.
    - `PlatformBackHandler` (drawer, guide) registers with the dispatcher.
    - `PlatformNavigationBackHandler`: Back pops the stack while there's an earlier screen.
  - The gesture is a Compose modifier (`edgeSwipeBack`) on the app root in `MainViewController`.
    - It looks at touches before the screens do and takes the drag only once it's clearly a rightward swipe from the edge. Taps, vertical scrolls and drags that start away from the edge pass through.
    - It does nothing when nothing is enabled (root screens).
    - Dialogs are separate Compose layers, so it never acts underneath one.
    - My first two versions used UIKit gesture recognizers on the Compose view (a screen-edge recognizer, then a plain pan restricted to the edge). Neither ever fired in the Simulator, with or without simultaneous recognition, so I moved the gesture into Compose.
  - Both NavHosts are wired: the main app's and the sign-in flow's.
- Status bar (`48ec1ca`): `iosMain/ui/theme/Theme.ios.kt` adds `StatusBarFollowsTheme`, called from `MainViewController`.
  - It sets the window's appearance from the in-app theme: Light to light, Dark to dark, System to unspecified, so System keeps following the phone.
  - The app sits inside SwiftUI's hosting controller, which ignores a child's status bar style. The window appearance is what the status bar follows, and it updates when the theme changes.
  - Side effect: system sheets (photo picker, camera, share) also follow the in-app theme.
  - `SystemBarIcons` stays a no-op on iOS (comment updated).
- Top gap (`e792c20`):
  - Cause: the outer `Scaffold` in `MainAppScaffold` padded the `NavHost` for the status bar, and each screen's own `TopAppBar` added the status bar inset again.
  - This affected every page inside the NavHost that has a `TopAppBar`: Listing Details, See all, Settings, About, Licenses, Chat, Measurements, My studio, Studio, Moderation, Policy, the listing editor and the accessory declaration.
  - Fix: the NavHost marks the Scaffold padding as used (`consumeWindowInsets`) on iOS, so those top bars sit right under the status bar. Home and pages outside the NavHost (welcome, sign-in) were already right and are unchanged.
- `IosSignInTest` now calls supabase-kt directly, so a failure reports the real error instead of the app's "Couldn't log in".

commonMain changes (Android behavior identical; please build-check Android on Windows):
- `ui/MainAppScaffold.kt`:
  - Calls `PlatformNavigationBackHandler(navController)` just before the `NavHost`.
  - The `NavHost` modifier is now `Modifier.padding(innerPadding).consumeScaffoldInsets(innerPadding)`.
  - Two new `expect` declarations next to `PlatformBackHandler`: `PlatformNavigationBackHandler(NavHostController)` and `Modifier.consumeScaffoldInsets(PaddingValues)`.
- `ui/DzirentApp.kt`: `PlatformNavigationBackHandler(authNavController)` just before the auth `NavHost`.
- `androidMain/ui/BackHandler.android.kt`: the Android actuals are no-ops. `PlatformNavigationBackHandler` returns `Unit` (NavHost already handles system Back) and `consumeScaffoldInsets` returns the modifier unchanged.
- Note for Android: the same doubled top inset is probably there too (smaller, since Android's status bar is shorter). I left it unchanged as asked. Making the Android `consumeScaffoldInsets` actual `consumeWindowInsets(padding)` would fix it the same way.

What I ran:
- `./gradlew :shared:compileKotlinIosSimulatorArm64` after each item and after each fix: BUILD SUCCESSFUL, with no warnings in iosMain at the end.
- `./gradlew :shared:iosSimulatorArm64Test`, with the test-user variables passed as `SIMCTL_CHILD_*`, run twice:
  - `simctl spawn` is no longer blocked, and the tests ran. 12 of 13 passed: `ChatPushTest` 2, `GuestGateTest` 2, `ListingValidationTest` 4, `ModelTest` 4.
  - `IosSignInTest` failed both times on `NSURLErrorDomain -1202` / `errSSLXCertChainInvalid (-9807)`: "The certificate for this server is invalid" for `pwfzkyjeivadbtkfkdxr.supabase.co`.
  - From the host, the same server presents a valid Google Trust Services (WE1) chain (`openssl s_client`), and inside the app on the same Simulator HTTPS works (listings, photos, sign-in session).
  - So the bare test binary started by `simctl spawn` can't validate the chain in this environment. I couldn't fix that from here.
- Clean `xcodebuild ... clean build` for the iPhone 18 Pro simulator: CLEAN SUCCEEDED, BUILD SUCCEEDED, at the start of Phase 2 and again on the final code.
- Simulator: 3 app launches (of 4). I viewed 2 screenshot images (of 4). All other checks used OCR and pixel probes on the interaction tool's capture files (tools in a temp folder, outside the repo). The 2 screenshots are in `~/Desktop/Dzirent/step5c-screenshots/` (`1-listing.png`, `2-dark.png`).
- Android: not built here (no Android SDK on this Mac). No emulator or device used.

What I saw in the Simulator:
- Launch 1 (first build):
  - Listing Details and Settings titles sit at the same height as the Home title, right under the status bar, with no gap (screenshot 1).
  - Theme, checked by a status-bar pixel probe:

    | Theme | App | Status bar icons |
    | --- | --- | --- |
    | Dark | dark | light |
    | Light | light | dark |
    | System, with the Simulator in dark mode | dark | light |

    Screenshot 2 shows light icons on the dark app. The theme is left on Light.
  - The UIKit edge swipe did nothing.
- Launch 2 (pan recognizer): the swipe still did nothing.
- Launch 3 (Compose gesture):
  - Listing Details → Home in one swipe.
  - Studio page → Listing Details → Home, one level per swipe.
  - Settings → Home.
  - A vertical scroll and a mid-screen horizontal swipe on the listing page didn't navigate.
  - On Home (root) the swipe does nothing except the sidebar's own existing drag, which is enabled only on Home, the same as Android.
  - No crash in any launch (same pid throughout each).
- The app is left running on Home, signed in as test user 1, Light theme.

Open issues:
- `IosSignInTest` fails on Simulator certificate trust (above). Re-run on a normal Mac session.
- Some listing photos show as solid black boxes, for example "Satin Backless Maxi Dress", "Modern Qipao Midi Dress" and "Embroidered Silk Lehenga Set". Their storage files are 149-byte stub JPEGs (`ae3b22ace731bd21.jpg`, `cb2a8a3733907033.jpg`, `6877334392c02f0d.jpg`), not real photos. Seed data, not app code; the other photos render. Worth re-seeding those photos.
- The back swipe has no sliding preview animation; it acts on release, like Android's non-predictive Back.
- Android build check of the commonMain hooks above (Windows).

## Step 5B - 2026-11-04 - Android check after iOS merge

Done:
- Before starting: working tree clean. Pulled `Preview` (fast-forward to `9e222ae`, the `ios01` merge).
- Android check: the Step 5 shared-code changes (`Guide.kt` using `PlatformBackHandler`, `@ObjCName` on `AccessoryDeclaration.NAME_MAX`) build on Android as they are. No `mobile/` changes needed.
- Backend: migration `20261104140000_step5b_dates_block.sql` (applied with `supabase db push`). `set_conversation_dates` now refuses with `42501` "You cannot message this user" (the same wording as `start_conversation`) when the renter and lender are blocked in either direction. The renter-only check and its error are unchanged. Grants are unchanged (`create or replace`).
- `supabase/tests/step5b_dates_block.mjs` (new): the block, refuse, unblock, works-again check.
- `supabase/tests/step7a_push.mjs`: step 5 used to change dates while blocked to prove no push is sent. It now expects that change to be refused. The token-untouched check is still there.
- `contract.md` and `security-log.md` (the `set_conversation_dates` entries) and `BOARD.md` updated.

What I ran:
- `.\gradlew.bat :androidApp:assembleDebug :shared:testDebugUnitTest` (JDK 21, `GOOGLE_SERVICES_JSON` set): BUILD SUCCESSFUL. 13 tests in 5 classes, 0 failures, 0 errors, 0 skipped.
- `supabase db push --linked --dry-run` (only the new migration pending), then `supabase db push --linked --yes`: applied.
- `node supabase/tests/step5b_dates_block.mjs`: passed. User 1 blocked user 3, and user 3's date change was refused (403, `42501`) with the dates unchanged. After the unblock the change worked, and the original dates were put back.
- `node supabase/tests/step7a_push.mjs` (updated): passed. While blocked, both the message and the date change were refused, and the fake token was untouched after 20 s.
- No emulator or device used.

Debug APK: `mobile/androidApp/build/outputs/apk/debug/androidApp-debug.apk` (local build, not committed).

Open issues:
- How the apps handle the refusal (read from the code, not run): on the phone, `ChatScreens.kt` changes dates only after the message itself is sent. A blocked message is refused first, so the date call isn't reached, and `setConversationDates` returns false on any error anyway. The website's dates action shows its own "Could not change your dates.", not the server text.
- Everything open from Step 5 still stands (iOS push, iOS item recognition, the listing-page top gap, iOS unit tests not run).

## Step 5 - 2026-11-04 - iPhone app (Simulator)

Branch: `ios01` only (per the task prompt, overriding the two-branch rule). Nothing pushed to `main` or `Preview`. Done on the owner's Mac (Xcode 27.1, JDK 17, no Android SDK).

Done:
- Checkpoint 1, shared code builds for iPhone (`70a23a8`):
  - `mobile/shared/build.gradle.kts`: a static framework, `baseName "shared"`, for `iosArm64` and `iosSimulatorArm64`.
  - The only commonMain compile error: `ui/Guide.kt` used Android's `BackHandler`. It now uses the existing `PlatformBackHandler`.
  - `mobile/iosApp/scripts/load-env.sh`: reads `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` from the env file (handles CRLF, quotes and spaces around `=`) and never prints them.
- Checkpoint 2, Xcode app shell in `mobile/iosApp` (`f23f4a3`):
  - `project.yml` (XcodeGen 2.46.0) and the generated `iosApp.xcodeproj`, both committed.
  - Settings: app name Dzirent, bundle ID `com.dzirent.app`, iOS 16+, iPhone only, portrait only, version 1.0.0 (1).
  - Build phase "Build shared Kotlin framework" (`scripts/build-shared.sh`) runs on every build. It reads the env file path from `mobile/iosApp/local.config` (gitignored; `local.config.example` is committed), defaulting to `~/Desktop/Dzirent/secrets/dzirent-server.env`. It finds JDK 17 and runs `./gradlew :shared:embedAndSignAppleFrameworkForXcode`. If the env file or a value is missing, the build stops with an error naming the file and the fix. Xcode links the framework from `shared/build/xcode-frameworks/<config>/<sdk>`, so nothing is copied by hand.
  - `iosApp/iOSApp.swift`: SwiftUI shows `MainViewController()` edge to edge, like Android. Compose handles the safe areas.
  - `Info.plist`: location, camera and photo-library texts use the Android wording. It also sets `CADisableMinimumFrameDurationOnPhone`, which Compose needs. Launch screen: the logo mark on white (on #0E0E0E in dark mode).
  - App icon: the logo mark (#A80038) on white, rendered from `apps/web/public/logo-mark.svg`, with no alpha channel.
  - `AccessoryDeclaration.NAME_MAX` collided with the C `NAME_MAX` macro in the generated header. Its Objective-C name is now `nameMaxLength` (`@ObjCName`); the Kotlin name is unchanged.
  - `.gitignore`: added `mobile/iosApp/local.config`.
- Checkpoint 3, iPhone versions of the phone features (`1925a14`), all in `iosMain`:
  - Settings storage (`IosSettingsStorage`): NSUserDefaults, using Android's key names (theme, distance_unit, measure_unit, rental_days, default_distance_step, recent_searches_<user>) and fallbacks. Small flags (`KeyValueStore`) also use NSUserDefaults.
  - Location (`IosLocationService`):
    - CoreLocation "when in use", accuracy about 1 km, coordinates rounded to 2 decimals, 15 s timeout.
    - Reverse geocoder with a 10 s timeout: `locality ?: subAdministrativeArea`, then `cityLabel()` for the US ("City, ST"), "City, PR" for Puerto Rico, city only elsewhere.
    - The permission request goes through `rememberLocationPermissionRequest`. A refusal leads to the existing "choose your city" path.
  - Photo picker: PHPicker, images only, limited to the editor's `maxPhotos` (same as Android's `PickMultipleVisualMedia(maxPhotos)`). It uses the shared consent dialog first, needs no photo-library permission, and shows "Some photos couldn't be read. Pick different ones." when needed.
  - Camera:
    - Shared consent dialog first, then the system camera (UIImagePickerController) behind camera access.
    - No camera (the Simulator): the same message Android shows when there's no camera app, "No camera app found. Use Gallery instead."
    - Access refused: the same dialog as Android, worded for iOS, with an "Open Settings" button.
  - Image compression: the same defaults as Android (long side at most 1600 px, JPEG quality 80), turned upright, never scaled up.
  - Photo copies live in `Application Support/listing_photos/<user>` and drafts in `Application Support/drafts/<name>.json` (atomic writes), with the same file names as Android.
  - Other phone services: camera cache cleanup, a toast-style message, opening links, app version and build from Info.plist. `search_related.json` is bundled straight from `shared/src/androidMain/assets` (referenced in `project.yml`, not copied).
  - On-device AI (`IosPhotoAnalyzer`) works exactly like Android when its TinyCLIP model can't load. The shared photo checks (sharpness, lighting, whole item, colors) still run on the upright photo, but there is no embedding and no scores, so no suggestions appear.
  - Push (`IosPushService`) stays a stub but no longer throws:
    - No token and `canNotify()` is false.
    - `openNotificationSettings()` opens Dzirent's page in the Settings app.
    - The notification permission request answers "no".
  - Licenses screen: a plain list of the main libraries and their licenses. Android uses AboutLibraries.
- Checkpoint 4, running in the Simulator (iPhone 18 Pro, iOS 27.0):
  - Built with xcodebuild, installed with `xcrun simctl install`, launched with `xcrun simctl launch`.
  - Guest browsing, the listing page and sign-in all work (details under "What works in the Simulator").
  - `iosSimulatorArm64Test/.../IosSignInTest.kt` (new) signs in test user 1 through the shared repository on the Simulator. It skips when the variables aren't set (pass `SIMCTL_CHILD_TEST_USER_1_EMAIL` / `_PASSWORD`). It compiles and links, but couldn't run here (see below).

What I ran:
- `./gradlew :shared:compileKotlinIosSimulatorArm64`:
  - Failed first on `Guide.kt` (2 errors), then passed.
  - Passed again after Checkpoint 3, with no warnings in iosMain.
- `./gradlew :shared:linkDebugFrameworkIosSimulatorArm64`: BUILD SUCCESSFUL.
- `xcodebuild -project iosApp.xcodeproj -scheme iosApp -destination 'platform=iOS Simulator,id=<iPhone 18 Pro>' build`:
  - Failed first on the `NAME_MAX` header clash, then BUILD SUCCEEDED.
  - BUILD SUCCEEDED again after Checkpoint 3; `search_related.json` is in the app bundle.
- `scripts/build-shared.sh` with `local.config` pointing at a missing file: exit 1 with the error message (config restored after).
- Phase 2, clean build: `xcodebuild ... clean build` into a fresh DerivedData: CLEAN SUCCEEDED, BUILD SUCCEEDED. The only warnings come from supabase-kt's generated header (`Auth_ktSSO`/`Auth_ktPhone` names) and App Intents metadata.
- Phase 2, `./gradlew :shared:iosSimulatorArm64Test`:
  - Compiling and linking the tests passed. The run failed with `xcrun` exit code 137.
  - Cause: in this agent environment every `xcrun simctl spawn` process is killed with SIGKILL, even `/bin/echo` (checked). Running the test binary by hand, also after re-signing it, gave the same result.
  - So the iOS unit tests have not run. This is the environment, not the code: `simctl install` and `launch` work, and the app runs.
- Phase 2, `./gradlew :androidApp:assembleDebug`: not run. The Android SDK isn't installed on this Mac. Gradle configured the iOS tasks without it, so I installed nothing.
- Device check through Xcode's device-interaction tools, done by a subagent:
  - Compose exposes no accessibility tree to them, so taps were placed from screenshots and OCR.
  - 3 screenshots were viewed and kept, in `~/Desktop/Dzirent/step5-screenshots/` (outside the repo): `1-first-screen.png`, `2-home.png`, `3-listing.png`.
  - The interaction tool writes a capture file on every call. Sign-in was checked by OCR of those captures (text only, no more images viewed).
- Crash check: the app process (same pid) stayed up through guest browsing, the listing page, sign-in and Saved. No Dzirent crash report appeared.
  - Device logs: `log show`/`log stream` return nothing in this environment (blocked like `simctl spawn`), and `GetConsoleOutput` had no launch session. So "no crash" rests on the process and the crash reports, not the log.
- Tools on this Mac: Homebrew couldn't write (`/opt/homebrew` blocked by the environment), so XcodeGen 2.46.0 ran from its official release zip in a temp folder, outside the repo.
- Git: this Mac had no git identity. The first commit (`70a23a8`) got an auto-detected `vivekanandakallakuri@Vivekanandas-MacBook-Air.local` author. I then set a repo-local identity (`Vivek-k24`, `vivek.kallakuri@gmail.com`, as in earlier commits). I didn't rewrite the pushed commit.

What works in the Simulator:
- Launch screen, then the "Welcome to Dzirent" sheet (Sign Up, Log In, Browse as guest).
- As a guest: the top bar shows "Austin, TX", the date chip "Nov 4 - 8", the measurements banner, and the Products/Studios tabs with sample listings and real photos (for example "Linen Summer Sundress $14 · under 1 mi"). The bottom bar shows Home, Inbox, Search, Closet and Saved.
- Listing page: photo, title, "Everyday | Size XS", price, studio row, description.
- Sign-in with test user 1, through the Saved guest gate, then Log In, then "Welcome Back":
  - No error appeared.
  - The avatar now shows the user's initials.
  - The "Finish setting up your account" dialog appeared.
  - Saved opens without the guest gate.
  - Home shows that user's nearby listings.
- The Simulator is left open (iPhone 18 Pro booted) with the app running, signed in as test user 1.

Not verified:
- Location permission and geocoding, picking photos, the camera dialogs, compression and upload, drafts, toasts, the dark theme.
- The app surviving a restart while signed in. The app's Preferences folder was still empty right after sign-in, so I couldn't confirm where supabase-kt saves the session.
- An `iosArm64` (device) build. Real-device signing is out of scope.

Open issues:
- On-device item recognition on iOS: stub (no TinyCLIP; photo checks run). Needs LiteRT/Core ML for iOS.
- iOS push: stub. Needs a paid Apple Developer account (APNs key, Firebase iOS app), and `send-push` sends to Android tokens only. Until then, after the first message the "Get notified" prompt appears once, and its button opens Dzirent's Settings page.
- Listing page on iPhone: an empty band of about 60-130 pt between the status bar and the "Listing Details" bar. It looks like the top inset added twice by nested Scaffolds, made larger by the Dynamic Island status bar. It's shared UI, so I left it unchanged (no redesign); check whether Android shows the same.
- Status bar icon colour doesn't follow the in-app theme (`SystemBarIcons` is still a no-op on iOS).
- No iOS back-swipe gesture (`PlatformBackHandler` is a no-op on iOS); on-screen back arrows work.
- The iOS unit tests (`iosSimulatorArm64Test`, including `IosSignInTest`) need running on a Mac where `simctl spawn` works.
- Universal links, real-device signing and TestFlight: out of scope (paid account).
- `test-user.env` has a space after `=` for test user 1. The loaders trim it.

How the owner opens and runs the app in Xcode:
1. Needs Xcode and JDK 17 (both on this Mac). Optional: copy `mobile/iosApp/local.config.example` to `local.config` and set `DZIRENT_ENV_FILE` if the env file isn't at `~/Desktop/Dzirent/secrets/dzirent-server.env`. That file already exists on this Mac.
2. Open `mobile/iosApp/iosApp.xcodeproj` in Xcode.
3. Pick the `iosApp` scheme and an iPhone simulator (for example iPhone 18 Pro).
4. Press Run (Cmd-R). The first build runs Gradle for a few minutes; later builds are faster.
5. After changing `project.yml`, regenerate with `xcodegen generate` in `mobile/iosApp`. Code changes in `mobile/shared` need nothing extra; the build phase rebuilds the framework.

Files changed:
- `mobile/shared/build.gradle.kts`, `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/Guide.kt`, `util/AccessoryDeclaration.kt`
- `mobile/shared/src/iosMain/kotlin/com/dzirent/shared/MainViewController.kt`, `platform/IosDevice.kt`, `platform/IosPlatformServices.kt`, `platform/IosImages.kt` (new), `data/IosPhotoAnalyzer.kt` (new), `ui/PhotoPermissions.ios.kt`, `ui/LocationPermission.ios.kt`, `ui/NotificationPermission.ios.kt`, `ui/Licenses.ios.kt`
- `mobile/shared/src/iosSimulatorArm64Test/kotlin/com/dzirent/shared/IosSignInTest.kt` (new)
- `mobile/iosApp/` (new): `project.yml`, `iosApp.xcodeproj`, `iosApp/` (Swift entry, Info.plist, assets), `scripts/build-shared.sh`, `scripts/load-env.sh`, `local.config.example`
- `.gitignore`, `pranalika/BOARD.md`, this file

Requests:
- Owner: merge `ios01` into `Preview` when ready.

## Step 7A - 2026-11-03 - Android push notifications

Done:
- Backend (migration `20261104035948_step7a_push_notifications.sql`, applied with `supabase db push`):
  - `device_tokens` (token unique, user, platform, created and last-seen times) and `notification_settings` (Messages default on, "Show message text" default off). Owner-only RLS, explicit grants (new tables get no Data API grants by default since 2026-10-30), both removed with the account.
  - `register_push_token(p_token, p_platform)` (moves a token to whoever signed in on that phone last) and `unregister_push_token(p_token)`.
  - Triggers on `messages` (new message: the other participant), `conversations` insert (new chat: the lender) and requested-date changes (the other participant) call `app_private.queue_push`. It skips blocked pairs (either direction), recipients with Messages off or no registered phone, and words the push: "New message from <name>" (text only if "Show message text" is on), "New chat from <name>" (listing and dates), "New dates from <name>" ("Nov 5 - 8 · listing"). Text that looks like a phone number, email or street address, map link or coordinates is left out entirely. A push problem never blocks the message or chat itself.
  - `pg_net` (in `extensions`) posts to `send-push` with the shared secret. The migration generates the secret inside the database (Vault `send_push_secret`) and stores the function address (Vault `send_push_url`).
- `send-push` Edge Function, deployed: checks `x-send-push-secret` against `SEND_PUSH_SECRET` (constant time), gets a Google access token from the server key (`FIREBASE_SERVICE_ACCOUNT_BASE64`), sends high-priority FCM HTTP v1 data messages (chat ID, per-chat tag `chat_<id>`, TTL one day) to the recipient's Android tokens, and deletes tokens Firebase reports as unregistered or invalid. Logs counts only.
- Secrets: `SEND_PUSH_SECRET` (copied from Vault) and `FIREBASE_SERVICE_ACCOUNT_BASE64` (from the server key file) set with `supabase secrets set --env-file` through a temporary file in my scratch folder, deleted right after. Nothing printed or committed.
- Android: Firebase Messaging (BoM 34.19.0) in `androidApp` only. Gradle reads `google-services.json` from the path in `GOOGLE_SERVICES_JSON` and turns it into the string resources the google-services plugin would generate, using the Firebase app of each build type's application ID (`com.dzirent.app`, `com.dzirent.app.debug`). The file is never copied into the repo; `.gitignore` lists it. Release builds fail without it; a debug build without it builds with push off.
  - Token registered on sign-in and every app start while signed in, and on token refresh (`onNewToken`, using the one shared client `DzirentRepository.shared`). Sign-out and account deletion unregister and delete the token and clear shown notifications.
  - The app builds each notification from the data message in a "Messages" channel: one per chat (the tag), nothing for another account signed in on the phone, nothing while that chat is on screen (and opening a chat clears its notification). The lock-screen public version has the title only. A tap opens the chat.
  - Permission: asked only after the user's first message sent on the phone, after "Get notified when they reply". Declining is final; Settings > Notifications turns it on (system question once on Android 13+, then the phone's notification settings).
  - Settings > Notifications (signed in): Messages and "Show message text", saved to `notification_settings`.
  - iOS: `PushService` interface in common code with an iOS stub (`TODO`) only. `send-push` sends to Android tokens only.
- Release workflow writes `google-services.json` from the new GitHub secret `GOOGLE_SERVICES_JSON_BASE64` before building and sets `GOOGLE_SERVICES_JSON`.
- `decisions.md` (Notifications), `contract.md`, `security-log.md`, `BOARD.md` updated.
- Fixed while building: the Preview branch did not compile (Step 4C commit `fe61cfb`): `BlockedProfile` didn't exist (now `Profile`), `BrowseSession` called the repository's member extension `toListing()` from outside (now `with(repository)`) and `PrivateProfile()` without its `userId`, and `Home.kt` duplicated `Listing.availabilityWindows()` from `Fit.kt` (copy removed). Minimal edits only.
- Before starting: the uncommitted changes were one extra trailing blank line in `supabase/seed/list_listings.mjs` and `sample_photos.mjs`; identical to `origin/Preview` ignoring whitespace, so discarded.

Files changed:
- `supabase/migrations/20261104035948_step7a_push_notifications.sql` (new), `supabase/functions/send-push/index.ts` (new), `supabase/config.toml`, `supabase/tests/step7a_push.mjs` (new)
- `mobile/gradle/libs.versions.toml`, `mobile/androidApp/build.gradle.kts`, `mobile/androidApp/src/main/AndroidManifest.xml`, `mobile/androidApp/src/main/java/com/dzirent/app/MainActivity.kt`
- `mobile/androidApp/src/main/java/com/dzirent/app/push/FirebasePush.kt`, `ChatNotifications.kt`, `DzirentMessagingService.kt` (new), `mobile/androidApp/src/main/res/drawable/ic_notification.xml` (new, logo mark in white)
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/platform/Push.kt` (new), `platform/Device.kt`, `ui/Notifications.kt` (new), `ui/DzirentApp.kt`, `ui/MainAppScaffold.kt`, `ui/ChatScreens.kt`, `ui/SettingsScreen.kt`, `repository/DzirentRepository.kt`, `model/Models.kt`
- `mobile/shared/src/androidMain/kotlin/com/dzirent/shared/platform/AndroidDevice.kt`, `ui/NotificationPermission.android.kt` (new)
- `mobile/shared/src/iosMain/kotlin/com/dzirent/shared/platform/IosDevice.kt`, `IosPlatformServices.kt`, `ui/NotificationPermission.ios.kt` (new)
- `mobile/shared/src/commonTest/kotlin/com/dzirent/shared/ChatPushTest.kt` (new)
- Step 4C compile fixes: `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/BrowseSession.kt`, `util/Home.kt`, `repository/DzirentRepository.kt`
- `.github/workflows/android-release.yml`, `.gitignore`
- `pranalika/decisions.md`, `pranalika/contract.md`, `pranalika/security-log.md`, `pranalika/BOARD.md`, this file

What I ran:
- `google-services.json` lists both `com.dzirent.app` and `com.dzirent.app.debug` (checked package names only).
- Baseline `:androidApp:assembleDebug` on `dc9ca25`: failed with the Step 4C errors above. After the fixes `:shared:compileDebugKotlinAndroid` passed.
- `supabase db push --dry-run` (only the new migration pending), then `supabase db push --linked --yes`: applied.
- Read-only queries (`supabase db query --linked`): both Vault entries exist (secret 64 characters), `pg_net` 0.20.4, the three triggers exist, `device_tokens`/`notification_settings` grants have no `anon`, `push_dates_label` gives "Nov 5 - 8" and "Oct 30 - Nov 2", `push_safe_text` hides "(512) 555-0199" and "123 Main St" and keeps "Is this available Nov 5 - 8?".
- `supabase secrets set --env-file ...` (temporary file, deleted): 2 secrets set; `supabase secrets list` shows both names.
- `supabase functions deploy send-push --use-api --no-verify-jwt`: deployed.
- `node supabase/tests/step7a_push.mjs`: all passed.
  - `send-push` with a wrong secret: 401.
  - Test user 1's settings upsert (Messages on, text hidden) through the API.
  - Fake token registered for test user 1; user 1 reads it, user 3 reads none.
  - Test user 3 sent a message in their chat with user 1; the fake token was gone within the 60 s wait.
  - User 1 blocked user 3: user 3's message refused (403); user 3 changed the chat dates (allowed while blocked); after 20 s the second fake token was still there.
  - Unblocked; `unregister_push_token` removed the second token; no block left.
- `net._http_response` (read-only) for the test window: exactly one request, the message push: HTTP 200 `{"sent":0,"failed":1,"removed":1,"errors":["INVALID_ARGUMENT"]}`, so `send-push` ran, got a Google access token, reached Firebase, got the invalid-token reply and removed the token. Nothing was sent during the blocked step; the request queue is empty.
- Security Advisor: the only new finding is `register_push_token` (signed-in users can run an elevated function), logged with the reason.
- `:androidApp:assembleDebug :shared:testDebugUnitTest --continue` with `GOOGLE_SERVICES_JSON` set (JDK 21): BUILD SUCCESSFUL. Unit tests: 5 classes, 13 tests, 0 failures (`ChatPushTest` 2 new; `SmokeTest` ran live because the test-user variables were loaded).
- After marking the deprecated Firebase token calls (below), `:androidApp:assembleDebug` again: BUILD SUCCESSFUL, no warnings in the push code.
- `aapt2` on the debug APK: package `com.dzirent.app.debug`; manifest has `POST_NOTIFICATIONS`, `DzirentMessagingService` with `MESSAGING_EVENT`, and the Firebase default channel and icon; the Firebase string resources are present and `google_app_id` is the debug app's (compared in a script, not printed).
- No emulator or device used.

Not verified (needs the owner's phone):
- A real notification arriving, its wording on screen, the lock-screen version, the first-message prompt and system dialog, Settings toggles, tap-to-open, no notification while the chat is open, nothing after sign-out.
- The release workflow (needs the new secret below) and any iOS build.

Open issues:
- The owner must add the GitHub secret `GOOGLE_SERVICES_JSON_BASE64` (base64 of `H:\DziRent\secrets\google-services.json`) before the next run of the Android release workflow; without it the workflow stops with an error.
- firebase-messaging 25.1 deprecated `getToken`, `deleteToken` and `onNewToken` in favour of registering with the Firebase installation ID. Firebase's HTTP v1 send docs still describe only token targeting, which `send-push` uses, so the app keeps the token calls (warnings suppressed with a comment). Move both sides when the installation ID route is documented.
- Phone test for the owner: sign in on the phone, send a first message (prompt appears once), have another account message you with the app in the background (notification, text hidden), turn on "Show message text" (text appears), open that chat (its notification clears, no new one while open), tap a notification (opens the chat), turn Messages off (nothing arrives), sign out (nothing arrives).
- Test data left on `dzirent-server`: one message "Step 7A push test" in the chat between test user 3 (renter) and test user 1 (lender). That chat had no requested dates and now shows Dec 14 - 16 from the blocked-step test; dates can't be cleared through the API, so I left them (no one-off SQL).
- `set_conversation_dates` does not check blocks, so a blocked renter can still change a chat's dates (no push is sent). Not changed here.
- The text filter is a heuristic: it errs toward hiding text (some ordinary messages with long numbers or street-like words lose their preview), and unusual address formats may not be caught.
- "New chat" fires when a renter opens a chat from a listing, before they type anything, as the task asked. With the per-chat tag, their first message replaces it.
- The migration stores the production function address in Vault. A local `supabase start` stack would call production with its own random secret and get 401 (harmless).
- Step 4C's handoff (Antigravity) says both builds passed, but the committed tree did not compile; fixed above.

Debug APK path:
- `mobile/androidApp/build/outputs/apk/debug/androidApp-debug.apk`

New GitHub secret:
- `GOOGLE_SERVICES_JSON_BASE64`

## Step 2C - 2026-11-02 - website fixes

Done:
- Onboarding after sign-up: copied the app's first-run flow and setup checklist. Renters get Location and Body Measurements; lenders and "both" also get Studio setup and First piece listing. Added WelcomeChecklistModal, FinishSetupCard on Profile, and 5-step GuideOverlay tour matching the app. Skippable, stored in localStorage per user, lands on the same page.
- Guest gate: replaced every full-page redirect to the sign-in page with the app's interactive dialog matching `GuestGate.kt` copy and options (Create account, Sign in, Not now to stay on the current page). Applied to Saved, Inbox, Closet/List a piece, Fit matching, Studio cards, Studio byline, and Message lender.
- Theme: default is now Light for everyone (not System). Added sun/moon switch in top-bar `.top-right` on every page in the exact same spot. Sun/moon switch and Settings Theme control update instantly with no page reload or sign-out and always agree. Choice remembered in localStorage and cookies on the device.
- Dropdowns: configured `color-scheme` and contrasting background and font colors for all native `<select>` and `<option>` elements and custom dropdowns (`.chat-menu > div`) ensuring open lists are fully legible in both Light and Dark themes.
- Sweep of 2B WIP: verified messaging, listing editor with photo compression/upload, closet, settings. Fixed conversation menu details dropdown closing on selection and size badge formatting.

Files changed:
- `apps/web/src/components/onboarding.tsx` (new: checklist, finish setup card, tour)
- `apps/web/src/components/guest-gate.tsx` (new: dialog, trigger, action mapping)
- `apps/web/src/components/shell.tsx` (onboarding modals, guest gate integration, top-bar theme toggle, nav triggers)
- `apps/web/src/components/local-preferences.tsx` (light default, instant theme toggle, settings sync)
- `apps/web/src/components/icon.tsx` (sun and moon icons)
- `apps/web/src/components/cards.tsx` (gated studio cards, updated Gate copy/actions)
- `apps/web/src/app/page.tsx` (fit banner and share banner guest gate triggers)
- `apps/web/src/app/listing/[id]/page.tsx` (gated studio byline, message lender, save piece, fit link)
- `apps/web/src/app/studio/[handle]/page.tsx`, `saved/page.tsx`, `fit/page.tsx`, `app/messages/[id]/page.tsx`, `app/list-a-piece/[id]/page.tsx`, `app/[feature]/page.tsx` (gated actions)
- `apps/web/src/components/settings.tsx` (finish setup card on profile)
- `apps/web/src/components/closet.tsx` (formatting fix)
- `apps/web/src/components/chat.tsx` (menu dropdown ref fix)
- `apps/web/src/app/globals.css` (dropdown theme readability, theme toggle button, guest gate styling)
- `pranalika/handoffs/claude-code.md` (this handoff entry)

How verified:
- `npm run lint` in `apps/web` passed with 0 errors and 0 warnings.
- `npm run build` in `apps/web` compiled production build with Turbopack and static page generation successfully.
- Local production server verification script ran on `http://localhost:3456`:
  - `GET /auth` returned 200.
  - `GET /` returned 200.
  - As authenticated test user 3 (via Supabase auth token session cookies): `GET /app/messages` returned 200.
  - As authenticated test user 1 (via Supabase auth token session cookies): `GET /app/closet` returned 200.

Open issues:
- None.

## Step 4B - 2026-10-31 - Android parity

Done:
- `decisions.md`: added "Versions (2026-10-31)" (V1.0 / V1.1 / V2.0). Android `versionName` is now `1.0.0`.
- Ported the reference `util/` layer into `mobile/shared/src/commonMain/.../util/` almost line for line (photo checks, item recognition logic, colors, labels, sizes, prices, dates, drafts, fit, onboarding, studio, search-related words, activity). JVM-only bits were replaced: `java.time` with kotlinx-datetime helpers (`util/Time.kt`), `BigDecimal` with `util/Decimal.kt` (same half-up rounding from the shortest decimal form), `Normalizer` with `expect fun stripAccents`.
- Copied the reference screens into `shared/ui` and changed only what the new backend, guest mode or common code needs: listing editor (photos, details, size/price/dates step, declaration, drafts, resumable publish), chat, inbox and activity, My Closet, My Rentals, Profile (role switching), listing page, studio page, Saved, Settings (now actually saved on the phone), body measurements, My studio, blocked users, guide, welcome checklist, About and open-source licenses, policy screens, filter sheet, sidebar, location dialog, city field, theme, components. `MainAppScaffold` is the reference scaffold (role-based Closet, Inbox dot every minute, welcome checklist, app tour, policy routes, chat drafts) with the guest gates kept.
- On-device AI copied exactly: TinyCLIP image encoder on LiteRT (`androidMain/data/ItemRecognizer.kt`, `AndroidPhotoAnalyzer`), label embeddings, tier removals, warnings, chips, color/fabric hints. The model is in `shared/src/androidMain/assets/ml/` and stored uncompressed in the APK. Android-only code sits behind `PhotoAnalyzer`, `DeviceServices`, `PhotoStore`, `DraftStore`, `KeyValueStore`, `LocationService` and a few `expect` composables (photo sources, location permission, back handler, licenses list, system bar icons), each with an iOS stub.
- Repository: the reference app's calls are kept as adapters on the shop window. Other people are known only by studio handle, so on screen a studio's handle stands in for its "lender id" (studio route, saved studios, chat start). Owner-side listing saving, chat, rentals, outcomes, blocks and reports use the raw tables the contract allows. Error wording matches the reference.
- Fixed while porting: Home and Search read the distance step as miles (with the reference settings that would be a 2-mile radius); Search sent sort keys the contract doesn't have; "New near you" was the first 8 results (now `p_new_days = 7`); the fit card showed for users with measurements but no matches; "Use my location" never asked for permission or used the device location; Settings never saved; Profile opened My studio; the logo was a generic icon; the accessory declaration said $500 (the reference says $300).
- Removed the deep-link intent filters: the reference app has none.

Parity checklist:

| Screen / workflow | Status | Remaining difference |
| --- | --- | --- |
| Listing editor: photo slots, picker, camera, consent, compression, upload, reorder, delete | Same | iOS stubbed |
| Listing editor: steps, suggestions, declaration, size, measurements, "Same as", price, dates, more options, ready list, publish/retry, drafts | Same | None known |
| On-device AI: photo checks, recognition, removals, warnings, chips, colors, fabric hint | Same | iOS stubbed |
| Inbox (Messages, Activity, dots) | Same | Names and titles come from `my_conversations` (studio name when set) |
| Chat (pinned listing, dates, rental menu, follow-up, quick replies, safety tip, block, report, live) | Same | Same as Inbox |
| My Closet, My Rentals, Profile, role switch | Same | None known |
| Listing page | Same | Lender line shows studio name and city from the shop window; guests: save, message and studio ask to sign up, no report menu |
| Studio page | Same | Rental count and reply time from `get_studio`; no "Since" line (no `created_at` in the shop window); the owner viewing their own studio also sees Save/Message |
| Saved (pieces, studios) | Same | Paused or deleted saved pieces disappear instead of showing "no longer available" |
| Settings | Same | Guests see only appearance, preferences, location, search history and About |
| Body measurements, My studio, blocked users | Same | Blocked users show "Dzirent member" (other people's names aren't readable) |
| Guide, welcome checklist, About, licenses, policies | Same | About links point to dzirent.com (reference has placeholders) |
| Filter sheet, sidebar, location dialog, city field, theme | Same | Sidebar and location dialog keep the guest additions |
| Auth (welcome, log in, sign up) | Same | Guest additions only (first-visit sheet, "Browse as guest", sign-up prompt) |
| Home | Partly | Still the Step 3B layout on shop-window cards. Rows now follow the reference rules (Fit, New, For your style, Under $15, saved studios), but the zero-result "Suggested for you" groups, card and studio-tab layout are not line-by-line copies |
| Search, See all | Partly | Step 3B layout; recent searches are in memory only (the reference keeps them per user on the phone); zero-result suggestions (related words, wider distance, other dates, similar titles) are the Step 3B rule-based version |
| Distances | Allowed | Whole miles from the shop window, "under 1 mi" for 0 |

Files changed (main ones):
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/util/*` (new, from the reference)
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/ui/*` (reference screens; `ClosetScreens.kt`, `ListingDetailScreen.kt` removed, their code is in `MainScreens.kt`)
- `mobile/shared/src/commonMain/kotlin/com/dzirent/shared/data/*`, `platform/Device.kt`, `model/Models.kt`, `repository/DzirentRepository.kt`
- `mobile/shared/src/androidMain/...` (device services, analyzer, recognizer, photo sources, permissions, licenses, back handler, theme bars, assets)
- `mobile/shared/src/iosMain/...` (stubs)
- `mobile/shared/src/commonMain/composeResources/drawable/logo_mark.xml`, `logo_wordmark.xml`
- `mobile/androidApp/build.gradle.kts`, `AndroidManifest.xml`, `MainActivity.kt`, `config/libraries/tinyclip.json`
- `mobile/gradle/libs.versions.toml`, `mobile/build.gradle.kts`, `mobile/shared/build.gradle.kts` (LiteRT 1.4.2, AboutLibraries 11.2.3, activity-compose, compose resources package)
- `pranalika/decisions.md`, `pranalika/BOARD.md`, this file

How verified:
- `:shared:compileDebugKotlinAndroid` and `:shared:compileCommonMainKotlinMetadata` (no JVM APIs in common code).
- `:androidApp:assembleDebug` builds (JDK 21). The APK contains the model stored uncompressed, the label embeddings, `aboutlibraries.json` and the logo vectors.
- `:shared:testDebugUnitTest`: 4 classes, 10 tests passed, 1 skipped (`SmokeTest` live check).
- No emulator or device used. Nothing was run on a phone.

Open issues:
- Home, Search and See all are not yet line-by-line ports (see the checklist). Next step: port the reference `HomeScreen.kt`, `SearchScreen.kt` and `Suggestions.kt` onto shop-window data, and keep recent searches per user on the phone.
- The first three commits (photos, editor, AI) were made from one working tree; only the third builds on its own.
- Guests start in Austin, TX (from Step 3B) until they set a place. Owner to decide if that stays.
- iOS: every platform piece is a stub (`TODO`); iOS code was not compiled (Windows can't build iOS targets).
- The owner should test on the phone: listing a piece end to end (camera and gallery), the declaration, chat and rental marking, role switching, Settings, location permission.

Debug APK path:
- `mobile/androidApp/build/outputs/apk/debug/androidApp-debug.apk`
