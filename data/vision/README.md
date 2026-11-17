# Dzirent Vision Data

The pipeline, datasets and review tooling for Dzirent's clothing and accessory types. It reads
clothing types from Wikidata, maps them to Dzirent's database values and rules, and produces a
review sheet for the owner and a vocabulary for the photo check. It lives in the Dzirent repo at
`data/vision/` (since D1c; before that in the local folder `H:\DziRent\Dzirent_vision_data`).

Wikidata data is under CC0 1.0 (public domain). No images are downloaded; image fields are
Commons file names only.

## Folder layout

```
data/vision/
  README.md              # this file
  HANDOFF.md             # progress notes, newest entry at the top
  requirements.txt       # pinned Python packages
  .gitignore             # keeps .venv/, taxonomy/raw/ and images/ out of git
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

**Status (D1c, 2026-11-16):** 1,731 types (57 launch), `review.csv` ready for the owner, 812 types
in `vocabulary.json`. See HANDOFF.md.

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

1. **Roots are looked up, never typed from memory.** Each root, skipped class and launch type in
   `specs.py` is an English label plus a few words of its description. The script searches the
   label (`wbsearchentities`, up to 5 pages), confirms each candidate with `wbgetentities`, and
   stops with an error unless exactly one item has that label and those words (and, where a QID
   is given, is that QID). D1's launch QIDs get the same check. The result is `taxonomy/roots.json`.
2. **Bounded crawl.** One SPARQL query per root, with explicit hop paths (`wdt:P279`,
   `wdt:P279/wdt:P279`, ...; never `P279*`): up to 4 levels below a positive root (clothing,
   handbag, sunglasses, necktie, wristwatch, belt, jewellery, costume jewellery, scarf, shawl), 2
   below a banned-example root (T-shirt, sports jersey, tracksuit bottoms, shorts, jeans, hoodie,
   sweatshirt, footwear, headgear, smartwatch, swimsuit, lingerie, undergarment, sock, hosiery).
3. **Details** (`wbgetentities`) for every crawled type with a Commons category, an image or an
   English Wikipedia article: labels, descriptions and aliases in English and 15 languages, parent
   classes, country and culture of origin, Commons category, image file name, English article.
4. **Ancestors**: which excluded, banned and positive roots each type is under (`P279*` or
   `P31/P279*`).
5. Labels of the parents, countries and cultures named, and each country's classes.

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
  - **cut A:** types under costume (the performer's or character's), uniform, mask, protective
    clothing, religious clothing, liturgical vestments, academic dress, sportswear or professional
    wear, when only the clothing root brings them in. A launch type, a banned root's example and a
    type another positive root reaches stay (sunglasses are protective clothing in Wikidata);
  - **cut B:** what clothing reaches only through "fashion accessory": accessories come from their
    own roots;
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
- **Region**: country or culture of origin first, then the parent chain (only parents that are
  culture-specific, never a bare "jacket"), then the item's own text; "Global" only for a generic
  garment with no origin evidence, "Unknown" otherwise. Regions are world regions only.
- **Size gate**: if the sheet would have more than 2,000 or fewer than 200 rows, nothing is
  written; the script prints what dominated and exits with status 2.
- Launch types keep D1's mapping (`specs.py`, with the D1b changes noted there).
- **The sheet** (`review.csv`): `needs_owner` = yes on the 57 launch rows, which come first; then
  the types left for review; then the rest by category.
- **The vocabulary** (`vocabulary.json`): one entry per allowed or not-allowed type (never a review
  type, never one marked keep = no): `qid`, `english_name`, `vocabulary` (its names), the three
  Dzirent fields, `allowed` and `region`.

### 3. Validate

```powershell
python taxonomy/validate.py           # the committed files only (what CI runs)
python taxonomy/validate.py --cache   # also against taxonomy/raw/fetched.json
```

Roots and launch types resolved as expected; nothing under an excluded root (cuts A and B
included); no degree, title or award labels; the depth bound along subclass-of edges; every
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
