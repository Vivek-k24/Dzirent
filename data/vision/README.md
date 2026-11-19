# Dzirent Vision Data

The pipeline, datasets and review tooling for Dzirent's clothing and accessory types. It reads
clothing types from Wikidata, maps them to Dzirent's database values and rules, and produces a
review sheet for the owner and a vocabulary for the photo check. Since D2 it also downloads
licensed photos of the types from Wikimedia Commons, and (D3) has a page for checking them by
hand. It lives in the Dzirent repo at `data/vision/` (since D1c; before that in the local folder
`H:\DziRent\Dzirent_vision_data`).

Wikidata data is under CC0 1.0 (public domain). Each Commons photo keeps its own license (CC0,
CC BY, CC BY-SA or public domain; see "License policy" below), credited in
`images/CREDITS.md`. The photos themselves are never committed.

## Folder layout

```
data/vision/
  README.md              # this file
  HANDOFF.md             # progress notes, newest entry at the top
  requirements.txt       # pinned Python packages
  .gitignore             # keeps .venv/, taxonomy/raw/, images/files/, images/thumbs/ and images/raw/ out of git
  images/
    fetch_commons.py     # D2: downloads Commons photos for the types; writes manifest.csv and CREDITS.md
    review_server.py     # D3: the label-check page, http://127.0.0.1:8765; appends to labels.csv
    auto_filter.py       # D2c: marks grayscale, sepia and page-scan photos; merges into labels.csv
    split.py             # D4: the locked train/test split of the kept photos
    manifest.csv         # one row per downloaded photo (committed)
    CREDITS.md           # every photo's author, license and Commons page, by license (committed)
    labels.csv           # keep / drop / not sure: the owner's rows and auto_filter's drop rows (committed)
    auto_filter.csv      # every photo's measures and auto_drop (committed)
    split.json           # train and test photos per type (committed; test is locked)
    files/<qid>/<sha1>.<ext>   # the photos (not committed)
    thumbs/              # 256 px thumbnails for the page (not committed)
    raw/                 # cached Commons API responses, one JSON per call, and run reports (not committed)
  tests/                 # pytest on recorded responses in tests/fixtures/ (no network)
  taxonomy/
    specs.py             # every root, skipped class and launch type, by English label and description words
    wikidata_client.py   # polite, cached Wikidata access (action API and SPARQL)
    fetch_wikidata.py    # resolves the roots, crawls, fetches details; writes raw/fetched.json
    build_taxonomy.py    # classifies; writes taxonomy.json, review.csv, excluded.json, vocabulary.json
    validate.py          # checks the outputs against the rules (and, with --cache, against the crawl)
    roots.json           # what every root and launch type resolved to (written by fetch)
    raw/                 # cached Wikidata responses (not committed)
    taxonomy.json        # every kept type with its Wikidata fields and the evidence for each rule
    review.csv           # the owner's review sheet (UTF-8 with BOM, opens in Excel)
    excluded.json        # every dropped type, with the reason and the root it came from
    vocabulary.json      # what the photo check reads: allowed and not-allowed types only
```

**Status (D2c+D4, 2026-11-18):** 1,758 types (57 launch, 33 on the keep list, 14 allowed
costumes; 104 with needs_owner = yes), 843 types in `vocabulary.json`. 13,744 photos (5.09 GB, not
committed) for 729 types: the full run is done. `auto_filter.py` marked 1,757 photos; with the
owner's decisions, 10,515 photos are kept, and `split.json` holds them as 8,483 train and 2,032
test. See HANDOFF.md and `pranalika/handoffs/claude-code.md`.

## Setup

Python 3.12, from `data/vision/`.

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Running each step

### 1. Fetch from Wikidata

```powershell
python taxonomy/fetch_wikidata.py               # everything
python taxonomy/fetch_wikidata.py --roots-only  # only resolve and check the roots and launch types
```

1. **Roots are looked up, never typed from memory.** Each root, excluded instance-of class,
   skipped class and launch type in `specs.py` is an English label plus a few words of its
   description. The script searches the label (`wbsearchentities`, up to 5 pages), confirms each
   candidate with `wbgetentities`, and stops with an error unless exactly one item has that label
   and those words (and, where a QID is given, is that QID). D1's launch QIDs get the same check,
   and each keep-list type (D2), instance-of exception and drop-list type (D2b) is checked by its
   QID and English label. The result is `taxonomy/roots.json`.
2. **Bounded crawl.** One SPARQL query per root, with explicit hop paths (`wdt:P279`,
   `wdt:P279/wdt:P279`, ...; never `P279*`): up to 4 levels below a positive root (clothing,
   handbag, sunglasses, necktie, wristwatch, belt, jewellery, costume jewellery, scarf, shawl and,
   since D2, watch; since D2b costume, 2 levels, and space suit, 1), 2 below a banned-example root (T-shirt, sports jersey, tracksuit bottoms, shorts, jeans, hoodie,
   sweatshirt, footwear, headgear, smartwatch, swimsuit, lingerie, undergarment, sock, hosiery).
3. **Details** (`wbgetentities`) for every crawled type with a Commons category, an image or an
   English Wikipedia article: labels, descriptions and aliases in English and 15 languages, parent
   classes, country and culture of origin, Commons category, image file name, English article.
4. **Ancestors**: which excluded, banned and positive roots and excluded instance-of classes each
   type is under (`P279*` or `P31/P279*`).
5. Labels of the parents, classes (P31), countries and cultures named, and each country's classes.

Wikimedia rules: User-Agent `DziRentDataTool/0.2 (contact: admin@dzirent.com)`, one request at a
time with a pause after each (1 s for the API, 2 s for SPARQL), back-off on 429 and 5xx, and
every response cached in `taxonomy/raw/`. A second run makes no requests.

### 2. Build the sheet

```powershell
python taxonomy/build_taxonomy.py
```

- **Dropped** (into `excluded.json`, with the reason and root):
  - types under title, award, occupation, academic degree, position, human, organization,
    military unit or armour;
  - **cut A:** types under uniform, mask, protective clothing, religious clothing, liturgical
    vestments, academic dress, sportswear or professional wear, when only the clothing root brings
    them in. A launch type, a banned root's example and a type another positive root reaches stay
    (sunglasses are protective clothing in Wikidata). Costume left this list in D2b;
  - **costume (D2b):** a type the costume root reaches that is also under mask, uniform,
    protective clothing or sportswear (the exclusion wins), and a subclass of costume more than 2
    levels below it;
  - **space suit itself only (D2c, `specs.ONLY_ITSELF_ROOTS`):** the types below space suit are
    particular suits (Apollo/Skylab A7L, Sokol, Orlan, Mars suit, ...), flight hardware rather than
    something people rent; "space suit" covers them as a costume. A launch or keep-list type below
    it stays (Advanced Crew Escape Suit);
  - **cut B:** what clothing reaches only through "fashion accessory": accessories come from their
    own roots;
  - **instance of (D2):** a type that is an instance (P31, or P31 of a subclass) of fictional
    object, fictional clothing, brand, trademark, product model, model series ("product line") or
    archaeological artefact: it names one made thing, not a garment type. Being a *subclass* of
    one of them doesn't count (Wikidata has "dress fastener" under archaeological artefact).
    Exempt (D2b, `EXCLUDE_INSTANCE_OF_EXCEPTIONS`): Harrington jacket, Perfecto and Kariyushi
    shirt, real styles filed as trademarks or brands;
  - **generic entries (D2):** the types labelled exactly "clothing", "garment" or "gown";
  - **the keep list (D2; 33 since D2b):** types cut A removed that come back past cut A only (every
    other rule still applies) and get needs_owner = yes. D2b kept the everyday, work, weather,
    cultural and costume ones and removed the protective, industrial, military and sportswear ones
    (`KEEP_LIST_REMOVED`, with the reasons); track suit top and posing trunks come back as
    not-allowed examples;
  - labels with "uniform of", "costume of", "insignia", "medal", "order of" (plurals too) or a
    dress word followed by "of"/"in" ("traditional clothing of <a province>");
  - no Commons category, image or English article; banned kinds beyond their root's 15 examples
    or more than 2 levels below it.
- **Classified by the item itself**: its label and aliases (read at their head word, so "dress
  shirt" is a shirt and "shirt dress" a dress), then the head of its description, then its parent
  labels decide category, garment type, item type and allowed. A type with no clear signal is
  "review", never "allowed". A type named only through a parent, a historical one, or one made
  for a single purpose (uniform, costume, sport, clergy, children) is "review". Values are the
  database's own, "none_fits" where none fits, "not_applicable" for the category of a banned kind.
- **Costumes (D2b):** a type the costume or space suit root reaches (or a keep-list type under
  them, or a type Wikidata files as an instance of costume, like "Halloween costume") is Occasion &
  Party with garment type `costume`, which isn't a database value yet. It is allowed when its own
  name or description gives a garment signal, review when only a parent class does.
- **Drop list (D2b):** seven brand-named watch models no instance-of class reaches (Rolex GMT
  Master II, Samsung Gear S3, ...) stay in the sheet with keep = no.
- **Region**: country or culture of origin first, then the parent chain (only parents that are
  culture-specific, never a bare "jacket"), then the item's own text; "Global" only for a generic
  garment with no origin evidence, "Unknown" otherwise. Regions are world regions only.
- **Size gate**: if the sheet would have more than 2,000 or fewer than 200 rows, nothing is
  written; the script prints what dominated and exits with status 2.
- Launch types keep D1's mapping (`specs.py`, with the D1b changes noted there).
- **The sheet** (`review.csv`): `needs_owner` = yes on the 57 launch rows, which come first, on
  the 33 keep-list rows after them and on the allowed costumes after those; then the types left
  for review; then the rest by category.
- **The vocabulary** (`vocabulary.json`): one entry per allowed or not-allowed type (never a review
  type, never one marked keep = no): `qid`, `english_name`, `vocabulary` (its names), the three
  Dzirent fields, `allowed` and `region`.

### 3. Validate

```powershell
python taxonomy/validate.py           # the committed files only (what CI runs)
python taxonomy/validate.py --cache   # also against taxonomy/raw/fetched.json
```

Roots and launch types resolved as expected, and the keep list by QID; nothing under an excluded
root (cuts A and B included), no instance of an excluded class and no generic entry (D2); no
degree, title or award labels; the depth bound along subclass-of edges; every
banned rule covered and no banned root over 15; launch types complete; database values only;
`review.csv` and `vocabulary.json` match `taxonomy.json`; countries of origin are countries; the
sheet's size; then counts by category, region and allowed status.

Each row in `taxonomy.json` carries its evidence (ancestor roots, the positive roots that reach it,
its path, its countries' classes), so the checks run without the cache. `--cache` re-checks that
evidence against the cache. CI's `vision-data` job runs it without the flag.

### 4. Apply the owner's review

After the owner edits `review.csv` (keep, priority, dzirent_category, dzirent_garment_type,
allowed, notes) and saves it as CSV (Excel's "CSV UTF-8" or plain "CSV" both work):

```powershell
python taxonomy/build_taxonomy.py --apply-review
```

This writes those columns back into `taxonomy.json` and rewrites `vocabulary.json`, skipping (and
listing) any line whose values aren't valid. keep is yes, no or blank; a type marked no stays in
`taxonomy.json` and the sheet (so the choice can be undone) and leaves `vocabulary.json`.

### 5. Download the photos (D2)

```powershell
python images/fetch_commons.py --dry-run        # counts only: what Commons has for each type, nothing downloaded
python images/fetch_commons.py --only-launch    # only the needs_owner = yes rows (launch, keep list, costumes)
python images/fetch_commons.py                  # every type with a target
python images/fetch_commons.py --limit-per-type 5   # at most 5 a type (below its target)
python images/fetch_commons.py --prune          # remove the photos of types now dropped or keep = no
python images/fetch_commons.py --max-minutes 8.5    # stop cleanly before the next photo after 8.5 minutes
```

- **`--max-minutes` (D2c):** the run stops before its next photo once the time is up, writes
  `CREDITS.md` and its report (`"stopped_at_time_limit": true`), and the next run resumes from the
  manifest. Claude Code stops idle background commands when memory runs low, so long runs go in
  foreground pieces under the tool's 10-minute limit.

- **Where the photos come from**, for each type in turn, until it has its target: its Wikidata
  image (P18), then the files directly in its Commons category (P373), then the files directly in
  each subcategory of that category (one level down, never deeper).
- **Search (D2b)**, only for a needs_owner = yes type still under 40 photos after those: a Commons
  file search (the search module over the File namespace, `filetype:bitmap`) for its English name,
  then each of its `also_called` names (the sheet's column), each as a phrase, the first 100 results
  each, best match first. Same license, format, size and sha1 rules, same cap of 80. Search results
  are looser than a category, so the label-check page tags them.
- **Targets:** 80 photos for a needs_owner = yes row, 40 for a not-allowed row (the negatives),
  12 for every other allowed row. Review rows and rows marked keep = no get none yet. A type stops
  early when Commons runs out; the shortfall is logged and kept in `images/raw/last_run.json`
  (`last_dry_run.json` for a dry run).
- **What is kept** (see the license policy below): a JPEG, PNG or WebP whose short side, and the
  short side of what is saved, are at least 300 px. SVG, GIF, TIFF, PDF, video and audio are
  skipped. A file is saved once: its Commons sha1 is the key, and a photo two types share goes to
  the first one fetched (needs_owner rows, then not allowed, then allowed).
- **Saved as** `images/files/<qid>/<sha1>.<ext>`: Commons' 1280 px wide rendition, or the
  original when that is no wider (never enlarged). Each file gets a row in `manifest.csv`:
  `qid, english_name, dzirent_category, allowed, sha1, file, width, height, license, author,
  source_url, commons_page_url, downloaded_at, source` (width and height are the saved file's;
  `file` is relative to `images/`; `source` is p18, category, subcategory or search). `CREDITS.md`
  is rewritten from the manifest after every run. A manifest from before D2b gets its `source`
  column from the cached listings on the next run, without a request.
- **`--prune`** removes from disk (with their thumbnails) and from `manifest.csv` the photos of
  every type no longer in `taxonomy.json` or marked keep = no, rewrites `CREDITS.md` and stops. A
  normal run only warns about them; their sha1s stay taken until they are pruned.
- **Wikimedia rules:** User-Agent `DziRentVisionData/0.1 (Dzirent clothing photo set;
  support@dzirent.com)`, at most 2 requests a second (API calls and downloads together),
  exponential back-off on 429 and 5xx (honouring Retry-After). Every API response is cached in
  `images/raw/`, one JSON file per call.
- **Resumable:** a type that already has its target in the manifest is skipped without a request;
  a file whose sha1 is in the manifest is never fetched again; listings come from the cache. A
  second run adds nothing and makes no requests. Delete `images/raw/` to see new Commons uploads.

### 6. Check the photos (D3)

```powershell
python images/review_server.py                 # then open http://127.0.0.1:8765 ; Ctrl+C stops it
python images/review_server.py --launch-only   # only the launch types (needs_owner = yes, priority launch)
```

- One type at a time: its name, category and whether it can be listed, then its photos as 256 px
  thumbnails (made on first view into `images/thumbs/`).
- **Each photo is keep, drop or not sure.** Click a photo to cycle through them, or use the keys:
  `1` keep, `2` drop, `3` not sure (then the next photo), arrows to move, `Enter` (or a double
  click) for the full photo, `N` next type, `P` previous type. **Drop whole type** drops all its
  photos.
- **For a not-allowed type**, keep the photos that really show it: they teach the photo check
  what to refuse.
- **Saved at once:** every decision is appended to `images/labels.csv` (`sha1, qid, decision,
  decided_at, source`); the latest line for a photo wins, so any decision can be changed later, and a
  reload shows what is saved. A photo with no decision counts as keep, so a type nobody checked
  still trains. `N` saves keep for the photos left undecided on the page, so the progress bar
  counts the type as checked, and the next page starts with a line for the type just finished:
  how many kept, dropped and not sure.
- **`--launch-only` (D2b)** serves only the types with needs_owner = yes and priority launch in
  `taxonomy/review.csv`, in the sheet's order; the progress bars count those only.
- **A "search" tag** marks a photo that came from the Commons search rather than the type's own
  image or category.
- **The source column (D2c):** the page writes `source` = owner on every line. A drop that
  `auto_filter.py` added shows as "drop (auto)" until the owner clicks the photo; the owner's click
  is appended and wins. `N` leaves auto drops as they are (they count as decided). A `labels.csv`
  from before D2c (four columns) gets four-column lines.
- **The page** listens on 127.0.0.1 only and shows nothing from Commons but the photos (no file
  names, descriptions or authors, which can name places and brands). `--labels <file>` writes
  the decisions somewhere else (for a trial run).

### 7. Auto-filter (D2c)

```powershell
python images/auto_filter.py               # measure new photos, write auto_filter.csv, merge into labels.csv, report
python images/auto_filter.py --histogram   # also print the saturation histogram
python images/auto_filter.py --no-merge    # write auto_filter.csv only
```

- **Measures**, on a copy at most 256 px on its long side:
  - `saturation`: the mean HSV saturation (0-1) of the pixels that are neither near-white (darkest
    channel 230 or more) nor near-black (brightest 25 or less), so a white background or a black
    backdrop doesn't make a colour photo look grey;
  - `white_frac`, `black_frac`: the share of near-white and near-black pixels;
  - `page_score`: how many of the four borders (the outer 6 %) are at least 90 % paper: light (HSV
    value 190 or more) and nearly colourless (saturation 0.25 or less);
  - cached in `images/raw/auto_filter_stats.json` only: how tightly the coloured pixels share one
    hue and which hue, how much of the photo is tinted, the border's own colour.
- **auto_drop**, with the reason in `auto_filter.csv`:
  - **grayscale:** saturation under 0.02;
  - **sepia:** saturation under 0.25, at least 93 % of the pixels tinted, all on one brown-orange
    hue (15-55°, concentration 0.98 or more);
  - **page:** page_score 3 or more, saturation under 0.15, and the border itself tinted (border
    saturation 0.07 or more: cream paper, not studio white or grey), on one hue (0.95 or more);
  - **small:** a short side under 300 px (none: `fetch_commons.py` already skips them);
  - **unreadable:** Pillow can't open the file (2: one cut short, one PNG broken as Commons
    serves it). Measured again on every run.
- **Why these thresholds.** The saturation histogram of the 13,744 photos (`--histogram`, bins of
  0.02): 1,426 photos in 0.00-0.02 (1,338 of them exactly 0, no colour at all), then 194, 253,
  272, 325 and rising to about 650 a bin at 0.20-0.30. Contact sheets of the 0.02-0.06 bins showed
  about half black-and-white photos and half colour photos of white, black or grey things (white
  dresses, black jackets, sunglasses on white); no measure here told them apart. So grayscale stops
  at the spike's edge: of the 19 photos between 0.01 and 0.02 in a first check (8,279 photos), 13
  were black-and-white or drawings and 6 colour photos of white items. One brown hue with low
  saturation also matches colour photos of beige things, so the sepia rule asks for the tint
  everywhere. Its cap of 0.25 is where those colour photos started in the samples; about 2 in 30
  of what it marks are still colour photos. A paper border alone also matches product shots on
  white, so the page rule asks for a cream border. About 1 in 10 of what it marks are museum photos
  of garments on cream backgrounds.
- **Merge into `labels.csv`:** the rows the review page wrote (source owner, or no source in a
  file from before D2c) stay exactly as they are, in their order. An auto_drop photo the owner never
  decided gets one row: decision drop, source auto, no time. **An owner decision always wins**,
  whatever it is and whenever it was made. Auto rows are written again on every run, so a photo
  the filter no longer marks loses its row.
- **Kept photos** (for `split.py`): the owner's latest decision, else the auto one, else keep (as
  on the review page). Drop and not sure are left out.
- **Report:** what the owner kept, dropped and wasn't sure of per type, what the filter added, and
  the 20 launch types with the fewest photos left; the full table is in
  `images/raw/auto_filter_report.json`.

### 8. The locked split (D4)

```powershell
python images/split.py          # write split.json
python images/split.py --check  # compare with the committed split.json; write nothing
```

- **Kept photos only** (see above). Per type: the round(20 %) of its kept photos with the lowest
  sha1 (the content hash, so the choice is deterministic and owes nothing to names or order) are
  test, at least 2; the rest are train. A type with fewer than 5 kept photos goes entirely to train
  and is listed under `thin`.
- **The test set is locked. It is never used for the gallery or the linear layer**, only to measure
  them. `split.json` (`rule`, `counts`, `thin`, and per type `english_name`, `train`, `test`) is
  committed. Running `split.py` again after `labels.csv` or the manifest changes prints how many
  photos changed sides against the committed file (`train_to_test`, `test_to_train`), so a photo
  that trained never moves into test unnoticed.

### Item policy

Costumes and replica suits are listed as costume; certified protective equipment is never a type.

### License policy

A photo is downloaded only when its Commons metadata carries a machine-readable license code
(the `License` field of `extmetadata`) for one of:

- **CC0** (`cc0`);
- **Public domain** (`pd`);
- **CC BY**, any version or port (`cc-by-2.0`, `cc-by-4.0`, `cc-by-3.0-de`, ...);
- **CC BY-SA**, any version or port (`cc-by-sa-3.0`, `cc-by-sa-4.0`, `cc-by-sa-2.0-kr`, ...).

Everything else is skipped: GFDL-only, Free Art License, "Attribution", "Copyrighted free use",
government licenses, and any file with no `License` code at all (Commons gives none for licenses
outside these families). Each photo's author, license and Commons page are in `CREDITS.md`,
grouped by license, which is the attribution the CC BY and CC BY-SA licenses ask for.

### What is committed and what isn't

| Committed | Not committed (`.gitignore`) |
| --- | --- |
| `images/fetch_commons.py`, `images/review_server.py`, `images/auto_filter.py`, `images/split.py`, `tests/` | `images/files/` (the photos) |
| `images/manifest.csv`, `images/CREDITS.md`, `images/labels.csv`, `images/auto_filter.csv`, `images/split.json` | `images/thumbs/` (the page's thumbnails) |
| `taxonomy/` scripts and outputs | `images/raw/` (Commons API cache, run reports, the auto-filter's measures and report), `taxonomy/raw/` (Wikidata cache), `.venv/` |

### 9. Tests

```powershell
python -m pytest -q tests
```

On recorded responses only (`tests/fixtures/`): the license, format and size filters, sha1
dedupe, the manifest's columns and the credits, resuming (a second run makes no request and adds
nothing), the dry run and the targets; the instance-of rule on recorded Wikidata data; and the
label-check page (a type page renders, a POST appends to `labels.csv`, a reload shows it). D2b
added: the search source on a recorded search (rank order, the under-40 bar, the cap), the
`source` column and filling it from the cache, `--prune`, and the build on a recorded slice of the
Wikidata cache (Harrington jacket kept by the exception list, the drop list's keep = no, costume
classified Occasion & Party / costume, a costume also under protective clothing or mask dropped),
plus `--launch-only`, the search tag and the finished-type line. D2c and D4 added:
`--max-minutes` (a clean stop, then a resume that fetches nothing twice); the auto-filter's rules
on images made in the test (grayscale, colour, a cream page, a pale garment on white that isn't a
page, sepia, small, a cut-short file, a transparent PNG); the merge (an owner keep beats auto_drop,
owner rows unchanged, merging twice changes nothing); the review page's source column (auto drops
shown as auto, an owner click wins, a four-column file stays four columns); and the split
(determinism whatever the order, 80/20, at least 2 test photos from 5, thin types, kept photos
only, the changed-sides count). Any connection to something other than this PC fails the test. CI's `vision-data` job runs them
after `validate.py`.
