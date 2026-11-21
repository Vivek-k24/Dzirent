## V2 - 2026-11-20 - English-name pins, looser model-agreement check, linear head

**Result:**
- **Pins:** text pins from the English name and its English aliases (no `also_called`): 843 pins, 1,860 prompts, vocabulary version `02fcb7ac…` (it now covers the prompts). Gallery: 8,827 train photos of 708 types (in the bucket under `pins/02fcb7ac…/`).
- **Model-agreement check, V2 rule:** a pin of the photo's own Dzirent mapping (category, garment type) in its top 5. The 1,945 photos V1b marked were checked again: 930 kept again (608 Openverse, 322 search), 1,015 still dropped. The owner's 4,170 rows are byte-identical. A random sample of 24 of the 930: 8 right, 6 doubtful, 10 wrong.
- **Photos:** 10,952 kept; `split.json` 8,827 train, 2,125 test; 930 new, no photo changed sides.
- **Launch types under 20 kept:** 5 (10 in V1b): achkan 0, débutante dress 5, Anarkali Salwar Suit 8, Nehru jacket 8, Sherwani 17.
- **Linear head:** `embed/train_linear.py`: 6,655 augmented copies of 3,035 train photos in 549 types under 20 kept; 15,482 samples, 708 classes, L2 1e-6 (out-of-fold top-1 58.1 %); `services/vision/app/linear.npz` (1,019,078 bytes) with its training set's sha256 in `pins.json`. Train split only.
- **Tests:** 152 (`test_build_pins.py` rewritten for V2, `test_train_linear.py` new).

## V1b - 2026-11-19 - pins for the vision service, model-agreement check

**Result:**
- **Pins:** `embed/build_pins.py` embeds the photos with the vision service's own code and weights. 843 text pins (`services/vision/app/vocabulary.npz`, committed) and one gallery pin per kept train photo (`gallery.npz`, in the bucket, not in git).
- **Model-agreement check:** 2,222 kept Openverse and search photos nobody had decided were compared with the text pins; 1,945 (1,074 Openverse, 871 search) whose own type isn't in the top 3 are `model_disagrees` (`images/model_agreement.csv`) and auto drops. The owner's rows are byte-identical and still win.
- **Photos:** 10,022 kept; `split.json` 8,094 train, 1,928 test; no photo changed sides.
- **Launch types under 20 kept:** 10 (4 before): achkan 0, débutante dress 2, Nehru jacket 2, Anarkali Salwar Suit 8, blouse 11, China Poblana 12, evening dress 14, Sherwani 15, sheath dress 18, dashiki 18.
- **Tests:** 146.

## D2e+D4b - 2026-11-19 - Openverse run, sticky split, owner photos (not added), augmentation

**Result:**
- **Labels:** the owner's 352 new rows (cap, hat, hoodie, jeans, undergarment) committed as saved. Kept: cap 53, hat 51, hoodie 66, jeans 52, undergarment 33 (80 after the Openverse run).
- **Openverse:** run once with the registered key (100 a minute, 10,000 a day): 122 API calls, 1,451 downloads from source sites, 1,358 photos for 28 launch types. 45 iNaturalist photos (parrots and fish matching "guayabera" and "kurta") were removed and iNaturalist excluded.
- **Photos:** 15,100 (5.32 GB, not committed); 11,967 kept; `split.json` 9,639 train, 2,328 test.
- **Split:** sticky since D2e: a committed photo keeps its side (D4's rule would have moved 39); the owner's photos are train only; `oversample` per type.
- **Owner photos:** `ingest_own.py` written and tested, not run on `H:\DziRent\vision-own`. Its 32 files look saved from a web image search, not taken by the owner (see the D2e+D4b entry in `pranalika/handoffs/claude-code.md`).
- **Augmentation:** `augment.py` (Albumentations 2.0.8, MIT), in memory, train photos only.
- **Tests:** 139.

## D2d - 2026-11-18 - four owner decisions undone, decode check, Openverse (not run), --types-with-new

**Result:**
- **Labels:** hat, hoodie, jeans and cap lost their 328 owner rows (the owner had read "not allowed" as "drop") and are filter-only: kept 0 → 69, 77, 78, 79. Every other owner row is byte-identical.
- **Photos:** 13,742, every one decodes (`--verify` removed the 2 broken ones). 10,818 kept; `split.json` 8,725 train, 2,093 test, and no photo changed sides.
- **Openverse:** `fetch_openverse.py` is written and tested on a recorded search, but not run. Anonymous use is 20 requests a minute and 200 a day, and the 27 short launch types need up to 666 calls. It waits for the owner's registration (the steps are in `pranalika/handoffs/claude-code.md`, D2d).
- **Page:** `review_server.py --types-with-new`.
- **Tests:** 114.

## D2c+D4 - 2026-11-18 - full download, space suit models out, auto-filter, locked split

**Result:**
- **Types:** 1,758 (57 launch, 33 keep list, 14 allowed costumes; 104 with needs_owner = yes), 843 in `vocabulary.json`; `validate.py` passes 8 of 8.
- **Photos:** 13,744 Commons photos for 729 types (5.09 GB, not committed); the full run is done, and a second run makes no request. 114 types with a target have none.
- **Labels:** the owner's 4,146 rows (57 launch types) unchanged, plus 1,253 auto drop rows. 10,515 photos are kept.
- **Split:** `split.json`, 704 types: 8,483 train, 2,032 test (locked), 219 thin.

The full entry, with the per-type counts and the open questions, is in `pranalika/handoffs/claude-code.md` (D2c+D4).

- **Space suit itself only:** `specs.ONLY_ITSELF_ROOTS`; the nine particular suits went to `excluded.json`, and `--prune` removed their 628 photos (217.8 MB).
- **`fetch_commons.py --max-minutes`:** a clean stop before the next photo; the full run went in 10 foreground pieces of 8.5 minutes.
- **`auto_filter.py`:** grayscale (saturation under 0.02, the histogram's spike), sepia, page scans, small and unreadable. 1,757 photos auto_drop; owner decisions always win. Writes `auto_filter.csv` and merges into `labels.csv` (new `source` column: owner or auto).
- **`split.py`:** kept photos only; the round(20 %) lowest sha1s per type are test (at least 2 from 5 kept); fewer than 5 kept is all train (thin). The test set is never used for the gallery or the linear layer.
- **Page:** writes `source` = owner; auto drops show as "drop (auto)".
- **Tests:** 88.

## D2b - 2026-11-17 - costume roots, keep list rework, search source

**Result:**
- **Types:** 1,767 (57 launch, 33 keep list, 23 allowed costumes; 113 with needs_owner = yes), 852 in `vocabulary.json`; `validate.py` passes 8 of 8.
- **Photos:** 8,056 Commons photos (3.04 GB, not committed): every needs_owner row has some, 7,347 in all; plus 709 not-allowed ones. The full run is paused and resumes from the manifest.

The full entry, with the per-type counts and the open questions, is in `pranalika/handoffs/claude-code.md` (D2b).

- **Roots:** costume Q1410477 (2 levels; out of the exclusion roots) and space suit Q223571 (1 level) are positive roots. What they reach is Occasion & Party with garment type `costume` (not a database value yet). Mask, uniform, protective clothing and sportswear still win over costume.
- **Lists by QID:**
  - keep list 45 → 33 (protective, industrial, military and sportswear removed; track suit top and posing trunks now not allowed);
  - `EXCLUDE_INSTANCE_OF_EXCEPTIONS`: Harrington jacket, Perfecto, Kariyushi shirt;
  - `DROP_LIST`: 7 brand-named watches, keep = no.
- **Photos:**
  - `--prune` removed 338 photos (94.3 MB) of the 10 types that left;
  - `manifest.csv` has a `source` column;
  - needs_owner types under 40 also get Commons search results (1,932 so far, tagged on the page).
- **Page:** `review_server.py --launch-only` (57 types), a "search" tag, a finished-type line.
- **Tests:** 64.

## D2+D3 - 2026-11-17 - vocabulary cleanup, Commons photos, label-check page

**Result: 1,745 types (57 launch, 45 keep list; 102 with needs_owner = yes), 845 in `vocabulary.json`; `validate.py` passes 8 of 8. 4,678 Commons photos for 92 of the 102 needs_owner rows (1.72 GB, in `images/files/`, not committed); `images/manifest.csv` and `images/CREDITS.md` committed; the label-check page `images/review_server.py`.** The full entry, with the per-type counts and the open questions, is in `pranalika/handoffs/claude-code.md` (D2+D3).

- **Dropped:** instances (P31 or P31/P279*) of fictional object, fictional clothing, brand, trademark, product model, model series ("product line") or archaeological artefact (55 of D1c's rows); the generic entries "clothing" and the two "gown" items (3).
- **Added:** the watch root (Q178794; 23 rows); the keep list (the 45 allowed types cut A removed, by QID, needs_owner = yes).
- **Photos:** CC0, CC BY, CC BY-SA or public domain only (by Commons' machine-readable code); JPEG, PNG or WebP; short side at least 300 px; one copy per sha1. Not downloaded yet: the not-allowed (40 each) and other allowed (12 each) types, 7,043 photos by the dry run.
- **Tests:** `tests/` (49, recorded fixtures, no network), run by CI's `vision-data` job after `validate.py`.

## D1c - 2026-11-16 - cut A+B, review sheet, tooling in the repo

**Result: 1,731 types (57 launch): 645 allowed, 167 not allowed, 919 review. `review.csv` and `vocabulary.json` (812 types) are written; `validate.py` passes 8 of 8.** The tooling moved here from `H:\DziRent\Dzirent_vision_data` (the D1 and D1b notes below were written there). The full entry is in `pranalika/handoffs/claude-code.md` (D1c).

- **Cut A:** nine exclusion roots with scope "clothing", each resolved and checked like the others (`roots.json`): costume Q1410477 (the performer's; Q9053464, also "costume", is "wardrobe and dress in general"), uniform Q7434, mask Q161524, protective clothing Q14524031, religious clothing Q2490224, Liturgical vestments and insignia Q6501052, academic dress Q1349227, sportswear Q645292, professional wear Q29000407. They drop what only the clothing root brings in; launch types, banned examples and types another positive root reaches stay.
- **Cut B:** "fashion accessory" (Q1065579) is skipped in the clothing crawl; what clothing reaches only through it is dropped unless another positive root reaches it.
- **Why 1,731 and not D1b's estimate of 1,674:** the estimate followed one recorded path per type. The real cut uses each type's ancestors, which is wider, but spares launch types, banned examples and other roots' types, which is narrower. Cut B drops only what comes through "fashion accessory" alone.
- **Removed by the cuts** (of D1b's 2,713): cut A 529 (45 allowed, 11 not allowed, 473 review); cut B 453 (25 allowed, 4 not allowed, 424 review).
- **New:** `needs_owner` (first column of `review.csv`, yes on the launch rows); `vocabulary.json`; each row's evidence in `taxonomy.json` (`ancestor_roots`, `positive_roots`, `country_evidence`, `sheet_group`) so the validator runs from the committed files; `validate.py --cache` for the cache cross-checks; `--apply-review` takes keep = no, rewrites `vocabulary.json`, and reads Excel's plain CSV (Windows-1252) too.
- **Requests:** 68 (20 to resolve the ten new specs, 48 for the ancestor check); a re-run makes 0.


**Result: stopped at the size gate (step 10). The new sheet would have 2,713 rows (limit 2,000), so the build wrote nothing.** `taxonomy.json`, `review.csv` and `excluded.json` in this folder are still D1's (wrong) files: don't review them. Everything else is done: verified roots, bounded crawl, classifier, validator, cache. The cut is the coordinator's call; the options and their counts are below.

### What was wrong in D1
- **Wrong root:** Q216353 in D1's "suits_formal" branch is "title" (the honorific), so about 4,000 degrees, doctorates, dukedoms, knighthoods and job titles came in as "Career & Professional / suit / allowed".
- **QIDs never checked.** One launch QID is wrong too: **Q1156828, D1's "sport or athletic tee", is sokutai** (Japanese imperial court dress), which D1 marked not allowed.
- **Unbounded crawl:** `P279*` with no depth limit, the banned branches included (665 hats, 251 shoes).
- **Classification by branch, and by substring.** "hat" matched "that", "cap" matched "cape", "ring" matched "earring" and "string".
- **Place names in fallback names:** "oaxacan huipil", "punjabi suit", "habanera".
- **Smaller defects:** `--apply-review` ignored `keep`, and `requirements.txt` was saved as UTF-16.

### Roots and launch QIDs that failed verification, and what replaced them
- **armour:** the coordinator's **Q20793164 now redirects to Q11886611** ("armor", same description); Wikidata merged the two. Q11886611 is used. Another item labelled "armor", Q50414523, is armoured forces and vehicles; the spec excludes it.
- **"sportswear top":** no item has that name. **sports jersey (Q2623418)** is used: "identifying shirt worn as part of a sports uniform", a subclass of t-shirt and sportswear.
- **swimwear:** the item is labelled "swimsuit" (Q212989), with "swimwear" as an alias.
- **jewellery:** two items are labelled "jewelry": Q161439 is the craft ("creation of objects of personal adornment") and Q2142903 the objects. Q2142903 is used; D1 used both.
- **Launch:** **Q1156828 sokutai → Q2623418 sports jersey** ("sport or athletic tee"). The other 56 launch QIDs pass.
  - Two are borderline and kept:
    - **Q4668625 "tuxedo"** is described as the black-tie dress code, but it is a subclass of suit, formal wear and evening wear (Commons "Tuxedoes").
    - **Q2647929 "boubou"** has the alias "agbada". The item labelled "Agbada" (Q122929253) has no class and no Commons category.
- **Other roots:** the other 8 exclusion roots match the coordinator's QIDs, and clothing is Q11460 as given. The search rank of "position" (Q4164871) is 39 and of armour 90, so the resolver pages through up to 5 result pages.
- The record of every resolution (QID, label, description, search rank, D1's QID and its check) is in **`taxonomy/roots.json`**.

### Launch mapping changes (D1's otherwise kept)
- tuxedo and dinner jacket: **Occasion & Party**, as in `policy.json`. D1 had Career & Professional.
- Fallback names "oaxacan huipil", "punjabi suit" and "habanera" are now "embroidered tunic", "salwar suit" and "guayabera shirt".

### Additions beyond the prompt (for the coordinator to confirm)
- **Label words with plurals.** The prompt's "uniform of" misses "Uniforms of the United States Navy", and "order of" misses "ceremonial clothing of orders of knighthood". Both now match.
- **"<dress word> of/in …" dropped**, in the spirit of "uniform of": "traditional clothing of Andalusia", "clothing of Chiapas", "Academic dress of the University of Leeds". These are topics, not garment types, and their labels name provinces, cities and universities. 161 label-word drops in all.
- **Countries of origin are kept only when Wikidata classes them as a country** (country, sovereign state, historical country, or constituent country of the UK; those classes are verified like the roots). So no state or province reaches the output.
- **No origin from a bare garment class.** Wikidata's "jacket" (Q849964) says country of origin Malaysia, which made every jacket Southeast Asian. A class labelled only with a garment word gives no origin, to itself or below it.
- **New region "Central Asian"** (the five Central Asian countries), for balance.
- **Special-purpose types go to review** even when their name is a plain garment: a description saying uniform, costume, ballet, clergy, children, space suit, firefighter and so on.

### Fetch
- **Crawl sizes** (one SPARQL query per root, explicit hop paths):
  - **Positive roots, 4 levels:** clothing 6,341 classes; jewellery 448; belt 60; wristwatch 51; shawl 24; necktie 22; scarf 14; handbag 12; sunglasses 10; costume jewellery 1.
  - **Banned roots, 2 levels:** headgear 621; footwear 330; undergarment 146; smartwatch 75; hosiery 61; swimsuit 42; lingerie 41; sock 37; shorts 21; t-shirt 13; jeans 11; sports jersey 9; sweatshirt 2; hoodie 1; tracksuit bottoms 0.
- **Quality floor:** 4,798 classes have a Commons category, an image or an English article; 1,654 don't.
- **Fresh run (empty cache):** 630 s (10.5 min), 344 requests. The build takes about 5 s. **Re-run:** 0 requests (all from cache), 5 s.

### The sheet that would have been written (2,713 rows, 57 launch)
- **By allowed:** review 1,816, allowed 715, not_allowed 182.
- **By category:** Everyday 1,000; Accessories 878; Cultural & Traditional 314; not_applicable 182; Outerwear 167; Career & Professional 129; Occasion & Party 43.
- **By region:** Global 1,094; Unknown 865; European 304; East Asian 163; African 60; South Asian 58; North American 46; Southeast Asian 45; Latin American 34; Middle Eastern 25; Oceanian 13; Central Asian 6.
- **Excluded by reason (3,739):** no Commons category, image or English article 1,654; banned kind beyond its root's 15 examples 846; under an excluded root 435 (armour 210, award 207, position 41, title 38, organization 16, occupation 3; some under two); banned kind more than 2 levels below its root 416; no English label 227; label word 161.
- **Banned examples:** 15 each for footwear, headgear, hosiery, lingerie, shorts, smartwatch, sock, swimsuit and undergarment. Fewer for the rest, because their trees are small: t-shirt 10, jeans 9, sports jersey 3, hoodie, sweatshirt and tracksuit bottoms 1 each. Every banned rule has at least one not-allowed row.

### What dominated
- **Review rows (1,816):**
  - 497 have no clear garment signal;
  - 328 are accessories outside the allowed list (gloves, masks, fans, glasses, buttons, collars);
  - 127 costumes; 123 typed only by their parent class; 123 jewellery outside the five allowed kinds; 87 uniforms; 77 historical garments; 74 work, protective or sport wear; 58 scarves and shawls; 48 religious dress; 46 belts and sashes.
- **By first branch under clothing:** fashion accessory 481; outerwear 217; protective clothing 123; costume 121; dress 100; uniform 95; trousers 86; mask 70; sportswear 57; religious clothing 56; skirt 55; Japanese clothing 48. The jewellery root adds 291 more.
- **By depth:** 474 at 1 level, 1,005 at 2, 931 at 3, 279 at 4.

### Options for the cut (counted on the full 2,713; launch rows always stay)

| Option | Rows | allowed | review | not_allowed |
| --- | --- | --- | --- | --- |
| A. Add exclusion roots: costume, uniform, mask, protective clothing, religious clothing, liturgical vestments, academic dress, sportswear, professional wear | 2,155 | 672 | 1,312 | 171 |
| B. Accessories only from the 9 listed accessory roots (drop what comes only through "fashion accessory") | 2,232 | 688 | 1,367 | 177 |
| C. Drop the "no clear signal" rows (conflicts with step 8, which makes them review) | 2,216 | 715 | 1,319 | 182 |
| D. Clothing 3 levels instead of 4 | 2,452 | 688 | 1,586 | 178 |
| **A + B** | **1,674** | 645 | 863 | 166 |
| A + B + C | 1,396 | 645 | 585 | 166 |
| A + B + D | 1,644 | 633 | 845 | 166 |
| A + B + C + D | 1,371 | 633 | 572 | 166 |
| Only allowed and not_allowed rows | 897 | 715 | 0 | 182 |

- **My recommendation: A + B (1,674 rows).**
  - Both cuts follow the product rules: only the listed accessory kinds can be listed, and uniforms, costumes, masks and protective wear aren't rentable outfits.
  - Step 8 ("no clear signal → review") stays as it is.
  - Both are one-line changes in `specs.py`: more `EXCLUDE_ROOTS`, and a flag that skips "fashion accessory" under clothing.

### What was run
1. `python taxonomy/fetch_wikidata.py --roots-only`:
   - the first run stopped on three ambiguous specs (armor, cocktail dress, overcoat: each also matched a museum object or another item), which I sharpened;
   - then all 91 specs resolved.
2. `python taxonomy/fetch_wikidata.py`: the full fetch. Re-run: 0 requests.
   - Then a fresh run from an empty cache: D1b's cache folders were moved to my scratch folder first; D1's cache files were left in place.
   - It gave the same crawl, the same quality floor and, after the build, the same 2,713 rows and counts.
3. `python taxonomy/build_taxonomy.py`: exit 2, "STOPPED: 2713 rows is above 2000; nothing written".
4. `validate.py` on an ungated build in my scratch folder (never in this repo). It passed 7 of 8 checks:
   - roots and launch resolved; nothing under an excluded root;
   - no degree, title or award words;
   - the depth bound along real crawl edges;
   - every banned rule covered, no root over 15;
   - launch rows complete; database values only;
   - only the size check failed (2,713 rows).
   - It isn't run on this folder's files, which are D1's.
5. `--apply-review` on a copy of that ungated sheet:
   - an edited row's keep, allowed, category and notes were written back;
   - a line with an invalid category was skipped and reported.

### V1a deploy (Part 0): not done
- `gcloud auth list` shows admin@dzirent.com as the active account, but its sign-in has expired. `gcloud auth print-identity-token`, `print-access-token` and a read-only `gcloud run services describe` all fail with "Reauthentication failed. cannot prompt during non-interactive execution", as in V1a.
- Nothing was deployed and nothing changed in `Dzirent_dev`, whose tree is clean on `Preview` at `361f9ef`.

### Owner's next step
- **No sheet to review yet.** Tell the coordinator which cut to use (my recommendation: A + B, 1,674 rows); the next step writes `review.csv`.
- **For the V1a deploy:** sign in to gcloud again (`gcloud auth login`); only the owner can.

## D1 - 2026-11-15 - clothing types

### What was run
1. Initialized independent local git repository in `H:\DziRent\Dzirent_vision_data\` with Python 3.12 virtual environment (`.venv`) and pinned requirements in `requirements.txt`.
2. Checked and verified database constraints and scanner policies from `H:\DziRent\Dzirent_web` without making any changes in that repository.
3. Executed `python taxonomy/fetch_wikidata.py` using Wikidata SPARQL endpoint:
   - Split queries into branches across clothing, traditional garments, outerwear, footwear, headwear, bags, eyewear, jewelry, watches, belts, neckwear, and underwear/swimwear.
   - Sent descriptive User-Agent (`DziRentDataTool/0.1 (contact: admin@dzirent.com)`), rate-limited with polite 1.2s pause between requests and exponential backoff retry.
   - Extracted Wikidata IDs, English labels/descriptions, aliases, parent classes, country/culture of origin, Commons categories, image filenames (names only, no downloads), and English Wikipedia titles.
   - Fetched multilingual labels and aliases across 16 languages (Hindi, Urdu, Bengali, Tamil, Telugu, Spanish, Portuguese, French, Arabic, Chinese, Japanese, Korean, Yoruba, Swahili, and Tagalog).
   - Cached all raw responses in `taxonomy/raw/`. Re-runs verify 100% cache hits with zero API calls.
4. Executed `python taxonomy/build_taxonomy.py`:
   - Filtered non-garments (uniforms tied to specific organizations, historical armor, theatre costumes, unlabeled items) into `taxonomy/excluded.json` with reasons.
   - Mapped every item strictly against database constraints for `dzirent_category`, `dzirent_garment_type`, and `dzirent_item_type`.
   - Mapped regions across 11 global regions (strictly avoiding any mention of cities, states, or local markets).
   - Flagged launch items with priority `launch` and prefilled `keep=yes`.
   - Generated `taxonomy/taxonomy.json` and Excel-compatible `taxonomy/review.csv` (UTF-8 with BOM).
5. Executed `python taxonomy/validate.py`: verified all quality checks, duplicate prevention, constraint conformance, not-allowed rule coverage, launch vocabulary requirements, and regional distributions.

### Dataset Counts
- **Total types in taxonomy:** 8,827 types (`taxonomy.json`)
- **Total launch types:** 57 items representing the ~38 core launch concepts
- **Excluded non-garments:** 1,105 items (`excluded.json`)
- **Counts by Category:**
  - `Career & Professional`: 4,096
  - `Accessories`: 2,243
  - `not_applicable` (not-allowed basics & safety examples): 2,056
  - `Everyday`: 337
  - `Cultural & Traditional`: 47
  - `Outerwear`: 30
  - `Occasion & Party`: 18
- **Counts by Region:**
  - `Global`: 8,116
  - `European`: 288
  - `East Asian`: 164
  - `South Asian`: 64
  - `Latin American`: 56
  - `Middle Eastern`: 41
  - `Southeast Asian`: 38
  - `African`: 30
  - `North American`: 27
  - `Oceanian`: 3
- **Counts by Allowed Status:**
  - `allowed`: 5,412
  - `not_allowed`: 2,056
  - `review`: 1,359

### Launch Types That Had No Single Dedicated Match
The following launch concepts did not have a single dedicated standalone Wikidata garment item, and were mapped to the closest formal concepts:
- **Quinceañera dress:** In Wikidata, `Q1519234` is the cultural celebration/event, not the garment. Matched to **Ball gown** (`Q635784`) and **Débutante dress** (`Q5320192`), which represent full-length coming-of-age presentation ball gowns.
- **Prom dress:** No standalone clothing item exists in Wikidata for "prom dress" (treated under evening formalwear). Matched to **Party dress** (`Q7140985`) and **Ball gown** (`Q635784`).
- **Sequin party dress:** "Sequin" (`Q674273`) is categorized as an ornamental trimming material rather than a distinct garment class. Matched to **Party dress** (`Q7140985`).
- **Folklórico dress:** Traditional Mexican folklórico dresses are represented through **China Poblana** (`Q1073477`, traditional folk dress of Mexico) and **Huipil** (`Q3269820`).

### The "none_fits" List (Where Database May Need New Values)
The current database check constraints only permit:
- `garment_type`: `top`, `trousers`, `suit`, `dress`, `skirt`, `saree`, `one_size`
- `item_type` (for Accessories): `Sunglasses`, `Handbag`, `Tie`, `Watch (non-smart)`, `Belt buckle`, `Costume jewelry`

The items marked `none_fits` reveal where database extensions may be required in the future:
1. **Footwear:** 251 items (shoes, boots, sneakers, sandals, heels, dress shoes). Marked `dzirent_garment_type: none_fits` and `allowed: not_allowed`. If footwear is ever permitted or explicitly tracked in schema, a `footwear` or `shoes` garment type would be needed.
2. **Headwear:** 665 items (hats, caps, beanies, sun hats, fedoras). Marked `dzirent_garment_type: none_fits` and `allowed: not_allowed`.
3. **Undergarments & Hosiery:** 278 items (lingerie, underwear, socks, tights, stockings, pantyhose). Marked `dzirent_garment_type: none_fits` and `allowed: not_allowed`.
4. **Non-Standard Accessories:** items currently mapped to `dzirent_category: Accessories` and `garment_type: one_size`, but having `item_type: none_fits` (e.g. scarves, shawls, stoles, wraps, belts without buckles, gloves, umbrellas, hair accessories, compacts, wallets). If allowed accessories expand, adding values such as `Scarf`, `Belt`, or `Hair accessory` to `policy_item_types` and `listings_item_type_check` would be needed.

### Execution Times
- **Fresh run from Wikidata API:** ~4.5 minutes (280.5s for all 18 branches and 100 multilingual batches with rate limiting).
- **Cached re-run:** ~0.2s for `fetch_wikidata.py`, ~1.2s for `build_taxonomy.py`.

### Owner's Next Step
Open taxonomy/review.csv in Excel, edit keep, priority, dzirent_category, allowed and notes, save as CSV, then tell the coordinator.
