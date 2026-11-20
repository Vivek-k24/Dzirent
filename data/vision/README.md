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
    fetch_openverse.py   # D2d: a second source (Openverse) for the launch types still short; run once in D2e
    ingest_own.py        # D2e: the owner's own photos from H:\DziRent\vision-own (train only)
    auto_filter.py       # D2c: marks grayscale, sepia and page-scan photos; merges into labels.csv
    split.py             # D4: the locked train/test split of the kept photos (sticky since D2e)
    augment.py           # D4b: training-time augmentation, in memory; --preview for a person to look at
    openverse.csv        # D2d: each Openverse photo's id, license, creator and source site (committed)
    manifest.csv         # one row per downloaded photo (committed)
    CREDITS.md           # every photo's author, license and Commons page, by license (committed)
    labels.csv           # keep / drop / not sure: the owner's rows and auto_filter's drop rows (committed)
    auto_filter.csv      # every photo's measures and auto_drop (committed)
    split.json           # train and test photos per type (committed; test is locked)
    model_agreement.csv  # V1b: each checked Openverse and search photo's top 3 text pins (committed)
    files/<qid>/<sha1>.<ext>   # the photos (not committed)
    thumbs/              # 256 px thumbnails for the page (not committed)
    raw/                 # cached Commons and Openverse responses, run reports, augment previews (not committed)
  embed/
    build_pins.py        # V1b: the vision service's text and gallery pins, and the model-agreement check
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

**Status (V1b, 2026-11-19):** 1,758 types (57 launch, 33 on the keep list, 14 allowed
costumes; 104 with needs_owner = yes), 843 types in `vocabulary.json`. 15,100 photos (5.32 GB, not
committed) for 729 types: 13,742 from Commons, 1,358 found with Openverse for 28 launch types.
The model-agreement check (V1b) dropped 1,945 Openverse and search photos, so 10,022 are kept:
8,094 train and 1,928 test in `split.json` (sticky: no photo changed sides). The vision service's
pins come from here (`embed/build_pins.py`): 843 text pins and one gallery pin per kept train photo.
`ingest_own.py` (the owner's own photos) and `augment.py` (training-time augmentation) are written
and tested; the owner's photos weren't added (see the D2e handoff). See HANDOFF.md and
`pranalika/handoffs/claude-code.md`.

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

- **Every saved photo must decode (D2d):** Pillow opens it and reads every pixel; a file that is
  cut short or broken is deleted and skipped as "unreadable" (a later run tries it again).
  `--verify` checks every photo in the manifest the same way and removes the ones that fail (run
  once in D2d: 2 of 13,744 removed).
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

### 5b. Openverse (D2d)

```powershell
python images/fetch_openverse.py --dry-run          # the targets and the most API calls; no network
python images/fetch_openverse.py --max-minutes 8.5  # fetch (needs the key below), in foreground pieces
```

- **Targets:** the launch types (needs_owner = yes, priority = launch) with fewer than 40 kept
  photos (owner keep, or undecided and not auto-dropped), in the sheet's order: 27 types in D2d.
  Each is filled up to **80 kept-or-undecided photos across all sources**.
- **Search:** Openverse's image API (`/v1/images/`) for the English name, then each `also_called`
  name, as a phrase, up to 5 pages of 20. Only `license` cc0, by, by-sa (any version) and pdm are
  asked for, and each result is checked again; Wikimedia is left out (Commons is the first source);
  nothing marked mature.
- **Each file** comes from its source site (`url`), must decode and be a JPEG, PNG or WebP with a
  short side of at least 300 px, and is saved at most 1280 px wide (never enlarged). Its sha1 is
  the downloaded file's; a sha1 already in the manifest is skipped. A photo the auto-filter would
  drop is kept on disk and in the manifest (the auto-filter marks it) but doesn't count toward 80.
- **Records:** a manifest row with `source` = openverse (license as "CC BY 2.0", "CC0 1.0" or
  "Public Domain Mark 1.0"; `author` = the creator; `source_url` = the file; `commons_page_url` =
  the page where it was published), and a row in `images/openverse.csv`: sha1, Openverse id, qid,
  title, license, license_version, license_url, creator, creator_url, source site, landing page,
  URL. `CREDITS.md` gets an Openverse part, by license, with each file's creator and source site,
  and the note Openverse's terms ask for (made with Openverse, not endorsed or certified by it).
- **Then** run `auto_filter.py` (it measures only the new photos and merges) and `split.py`.
- **Limits and the key:** anonymous use is 20 requests a minute and 200 a day (the
  `x-ratelimit-*` headers, 2026-11-18). The 27 targets need up to 666 search calls. With
  `OPENVERSE_CLIENT_ID` and `OPENVERSE_CLIENT_SECRET` in `H:\DziRent\secrets\providers.env` (or the
  environment), the script gets a token and runs registered. Without them it stops before any
  request and prints the registration steps: one PowerShell line that registers and saves the two
  values without showing them, then the verification email. Politeness: the User-Agent above
  (`support@dzirent.com`), one request at a time, 1 s between API calls and 0.5 s between
  downloads, back-off on 429 and 5xx, and a clean stop when fewer than 5 calls are left today.
  Responses are cached in `images/raw/openverse/`. Openverse's terms forbid scraping the catalog;
  this is a bounded, targeted search within the published limits.
- **Openverse was used through its API with a registered key, within its limits, as a one-time
  targeted search; the catalogue was not crawled.**
- **The run (D2e, 2026-11-19):** the registered key's headers reported 100 requests a minute and
  10,000 a day (the token request itself is counted anonymously: 20 a minute, 200 a day). One run
  in 4 foreground pieces: 122 API calls (4 of them token requests), 1,451 download requests to the
  source sites (Flickr for most). 28 launch types; 1,358 photos kept on disk (233.9 MB).
- **One run in pieces (D2e):** the first piece fixes the run's targets in
  `images/raw/openverse/run_state.json`, so a type stopped halfway is still filled to 80 in the
  next piece though it is no longer under 40. The file also keeps the finished types, the results
  downloaded and refused (never downloaded again) and each piece's request counts. Once every
  target is finished the script says the run is complete and makes no request; deleting the file
  starts a new run. Between pieces, an Openverse photo the auto-filter would drop counts as dropped
  even before `auto_filter.py` has merged it. The gap between API calls follows the burst limit the
  latest response reports (never under 1 s). The time is checked before every download; a source
  site gets 3 tries of 30 s.
- **iNaturalist is excluded too (D2e):** it holds species observations only. "guayabera" brought
  42 photos of the parrot *Amazona guayabera* and "kurta" 3 of a fish; they were removed (disk,
  manifest, `openverse.csv`, credits) and the two types refilled with `inaturalist` excluded.

### 5c. The owner's own photos (D2e)

```powershell
python images/ingest_own.py --dry-run   # what would be added, per type; writes nothing
python images/ingest_own.py             # copy and record; then auto_filter.py and split.py
```

- **From `H:\DziRent\vision-own\<type name>\`:** each folder's name is a type's English name in
  `taxonomy/review.csv`, matched exactly, ignoring case. A folder that matches no type (or more
  than one) is reported and skipped, and so is a file that isn't a JPEG (`.jpg`, `.jpeg`,
  `.jfif`), PNG or WebP or doesn't decode.
- **Each photo** is turned upright by its EXIF orientation, converted to sRGB if it has a colour
  profile, resized to at most 1600 px on its long side (never enlarged), and saved with no
  metadata at all: no EXIF (so no location, device or time), no XMP, comments or colour profile.
  Saved as `files/<qid>/<sha1>.<ext>`, the sha1 being the original file's, so a second run adds
  nothing.
- **Records:** a manifest row with `source` = owner, `license` = owner, `author` = Dzirent owner and
  no URLs; a `labels.csv` row keep with `source` = owner-upload. The auto-filter treats
  owner-upload as an owner decision (it never overrules it); `--forget-owner` leaves it alone.
  `CREDITS.md` counts these photos in a section of their own.
- **Train only:** `split.py` never puts a photo with source owner in test.

### 6. Check the photos (D3)

```powershell
python images/review_server.py                 # then open http://127.0.0.1:8765 ; Ctrl+C stops it
python images/review_server.py --launch-only   # only the launch types (needs_owner = yes, priority launch)
python images/review_server.py --types-with-new   # only types with a photo nobody (owner or filter) decided
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
- **`--types-with-new` (D2d)** serves only the types that have at least one photo with no decision
  from any source (neither the owner nor the auto-filter), in the sheet's order. With
  `--launch-only` as well, only the launch types among them.
- **For a not-allowed type, keep means "this photo clearly shows the banned item"**: those
  photos teach the check what to refuse. Drop is for a photo that doesn't show it.
- **A "search" tag** marks a photo that came from the Commons search rather than the type's own
  image or category; since D2e an "openverse" tag marks one found with Openverse and an "own" tag
  one the owner took.
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
python images/auto_filter.py --forget-owner Q80151,Q83363   # first remove those types' owner rows (D2d)
```

- **`--forget-owner` (D2d)** removes the owner's rows of the named types from `labels.csv`, every
  other line byte for byte, then merges as usual, so those types become filter-only. Used once, for
  hat, hoodie, jeans and cap, which the owner had dropped whole reading "not allowed" as "drop".

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
    serves it). Measured again on every run;
  - **model_disagrees (V1b):** `images/model_agreement.csv` says the vision model's top 3 text pins
    for this Openverse or search photo don't include its own type (section 8c). Only photos nobody
    had decided were checked, and an owner decision still wins.
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

- **Kept photos only** (see above). Per type, round(20 %) of its kept photos are test, at least 2;
  the rest are train. A type with fewer than 5 kept photos and no test photo goes entirely to train
  and is listed under `thin`.
- **Sticky (D2e):** a photo already in the committed `split.json` keeps its side for as long as it
  is kept; new photos fill the type's test share, lowest sha1 first (the content hash, so the
  choice is deterministic and owes nothing to names or order); a type over its share after drops
  keeps its test photos and gets no new ones. The owner's own photos (source owner) are always
  train. Without a `split.json` this is D4's rule (the lowest sha1s are test). Under D4's rule the
  D2e Openverse photos would have moved 39 committed photos between sides; with it, none.
- **Oversampling (D2e):** a type with fewer than 20 train photos gets `oversample` =
  ceil(20 / train), else 1, so each type gives at least 20 samples an epoch in `augment.py` (555
  of 710 types in D2e, mostly the allowed types with 12 photos).
- **The test set is locked. It is never used for the gallery or the linear layer**, only to measure
  them, and never augmented. `split.json` (`rule`, `counts`, `thin`, and per type `english_name`,
  `train`, `test`, `oversample`, and `owner_train` when there are any) is committed. Running
  `split.py` again prints how many photos changed sides against the committed file
  (`train_to_test`, `test_to_train`: 0 by construction since D2e).

### 8b. Augmentation (D4b)

```powershell
python images/augment.py --preview <sha1>   # 8 augmented samples of one train photo into images/raw/augment_preview/<sha1>/
```

- **For training only, in memory** (Albumentations 2.0.8, MIT; its successor AlbumentationsX is
  AGPL or paid, so it isn't used). It never touches the test split: `Augmenter` refuses a test
  photo, and `epoch()` draws train photos only, each type `oversample` times, shuffled. It never
  writes manifest rows or files; `--preview` is the only thing that writes, into its own folder,
  for a person to look at (a test photo is refused there too).
- **The pipeline, in order:** rotation up to 10° either way (p 0.5, corners filled by reflection);
  random resized crop to 224 × 224 (the vision model's input), 70-100 % of the area, aspect 3:4 to
  4:3; horizontal flip (p 0.5); brightness and contrast up to 0.2 either way (p 0.5); hue up to
  5° either way, saturation and value unchanged, so colours stay honest for the colour reader
  (p 0.3; OpenCV's 8-bit hue has 2° steps, so the limit is 2.5); light gaussian blur, kernel 3-5,
  sigma 0.1-1.0 (p 0.2); JPEG quality 60-95 (p 0.3).
- Importing it sets `NO_ALBUMENTATIONS_UPDATE=1`: Albumentations otherwise asks PyPI for a newer
  version on every import.

### 8c. Pins and the model-agreement check (V1b)

Run with the vision service's Python (it has torch), from the repo root, with `VISION_MODEL_DIR`
pointing at the pinned Marqo-FashionSigLIP files (`services/vision/app/config.py`):

```powershell
services/vision/.venv/Scripts/python.exe data/vision/embed/build_pins.py embed --max-minutes 9   # in pieces
services/vision/.venv/Scripts/python.exe data/vision/embed/build_pins.py text
services/vision/.venv/Scripts/python.exe data/vision/embed/build_pins.py agree
.venv/Scripts/python.exe images/auto_filter.py ; .venv/Scripts/python.exe images/split.py
services/vision/.venv/Scripts/python.exe data/vision/embed/build_pins.py gallery
```

- **Same model, same code as the service.** The photos are opened, squashed to 224 x 224 and
  embedded by the service's own functions (`app.fetch.open_image`, `app.model.preprocess`,
  `app.model.embed_tensors`), with the same pinned weights, so a pin and a scan see a photo the same
  way. `embed` caches every kept photo's embedding in `images/raw/embeddings/` (not committed;
  about 3 photos a second on this PC's CPU, so it runs in pieces and resumes). `--with-owner-drops`
  also embeds the photos the owner dropped, the labelled set the check was measured on.
- **Text pins** (`text`): one per `vocabulary.json` type, the normalized mean of "a photo of a
  {name}" for its English name and its `also_called` names (the sheet's, at most 5). Written to
  `services/vision/app/vocabulary.npz` (float16, committed): each row's qid, English name, category,
  item type, garment type and allowed, and `vocabulary_version`, the sha256 of `vocabulary.json`.
- **The model-agreement check** (`agree`, before the gallery): every kept photo from Openverse or a
  Commons search (manifest `source` openverse or search) that nobody had decided is compared with
  all 843 text pins; when its own type isn't among the top 3 it is `model_disagrees`. The result is
  `images/model_agreement.csv` (committed: sha1, qid, source, its own type's rank, the top 3, the
  verdict, the vocabulary version); `auto_filter.py` turns `model_disagrees` into an auto drop, so an
  owner decision always wins and a later run keeps it. Then `split.py` (sticky).
- **The run (V1b, 2026-11-19):** 2,222 photos checked (159 skipped: the owner had decided them),
  1,945 marked `model_disagrees` (1,074 of 1,241 Openverse, 871 of 981 search). Kept 11,967 ->
  10,022; split 8,094 train and 1,928 test; no photo changed sides. How sure the rule is: on the
  owner's own decisions (photos of all sources the owner kept or dropped), "own type in the top 3"
  turns away 63 % of the photos the owner kept and 87 % of those dropped, so it is harsh on clean
  photos. On the Openverse and search photos it marked, a contact sheet of 24 chosen at random
  showed 18 wrong photos (a tank, a bust, a magazine cover, a book titled with the type's name), 4
  doubtful and 2 right (a red swimsuit, a lingerie photo). The photos it kept include some that only
  show the type's name written (an infographic, a shop sign). See the V1b handoff for the table.
- **Gallery pins** (`gallery`): one per kept TRAIN photo of a type with a text pin; the build stops
  if a test photo gets in. Written to `services/vision/app/gallery.npz` (float16, not committed:
  uploaded to the bucket under `pins/<vocabulary_version>/` and fetched by Cloud Build) and
  `services/vision/app/pins.json` (committed: both versions, the gallery's sha256 and its rows).

### Backup bucket (V1b)

The photos, `manifest.csv`, `labels.csv` and `split.json` are also in a private Cloud Storage
bucket, the only copy of the photos not on this PC: `gs://dzirent-vision-data-dzirent` (project
`dzirent`, `us-west1`, uniform bucket-level access, public access prevented; `vision-runtime` and
Cloud Build's account, which fetches the gallery pins, may read objects). Created in V1b: 15,105
objects, 5,342,621,097 bytes (the 15,100 photos, 5,319,005,365 bytes, the same as on this PC; the
three files below; the two pin files). The pins sit under `pins/<vocabulary_version>/`. To bring it up to date, from the
repo root:

```powershell
gcloud storage rsync data/vision/images/files gs://dzirent-vision-data-dzirent/images/files --recursive
gcloud storage cp data/vision/images/manifest.csv data/vision/images/labels.csv data/vision/images/split.json gs://dzirent-vision-data-dzirent/images/
```

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
| `images/fetch_commons.py`, `images/fetch_openverse.py`, `images/ingest_own.py`, `images/review_server.py`, `images/auto_filter.py`, `images/split.py`, `images/augment.py`, `tests/` | `images/files/` (the photos, the owner's included) |
| `images/openverse.csv` | `images/raw/openverse/` (Openverse responses, `run_state.json`, run report), `images/raw/augment_preview/` |
| `images/manifest.csv`, `images/CREDITS.md`, `images/labels.csv`, `images/auto_filter.csv`, `images/split.json`, `images/model_agreement.csv` | `images/thumbs/` (the page's thumbnails) |
| `embed/build_pins.py`; its text pins in `services/vision/app/vocabulary.npz` and `pins.json` | `images/raw/embeddings/` (the embedding cache); the gallery pins (`services/vision/app/gallery.npz`, in the bucket) |
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
only, the changed-sides count). D2d added: the decode check (a cut-short download deleted and
skipped, `--verify` removing a broken photo), `--forget-owner` (every other line byte-identical,
through the merge too), `--types-with-new`, and `fetch_openverse.py` on a recorded Openverse search
(`fixtures/openverse_search.json`: license acceptance with pdm, the photo checks, 80
kept-or-undecided with auto drops not counted, the manifest, `openverse.csv` and credits rows, the
cache, the token, the stop with the registration steps). D2e and D4b added: Openverse's limits from
the headers (the latest response sets the gap), a later piece keeping the run's targets, a refused
result never downloaded again, the time checked before each download, a failing source site
skipped, the auto-filter's drops counted between pieces; the sticky split (committed photos keep
their side, a thin type growing, a type over its share), the owner's photos train only,
oversampling factors; `ingest_own.py` (folder names exact ignoring case, no metadata left, upright,
1600 px, the manifest and labels rows, a second run adding nothing, owner-upload kept by the merge
and `--forget-owner`); `augment.py` (train photos only, a test photo refused, the factors per epoch,
the pipeline's settings, the hue within 5°, `--preview` writing its own folder only). V1b added
(`test_build_pins.py`, no model): the pin prompts (the name and at most 5 also-called names), the
vocabulary version, the agreement check (only undecided kept Openverse and search photos, rank 3
agrees and rank 4 doesn't, a type without a pin left blank), the gallery rows (train photos of
pinned types only; a test photo stops the build), and `model_disagrees` becoming an auto drop that
an owner keep overrules. Any connection to something other than this PC fails the test. CI's `vision-data` job runs them after
`validate.py`.
