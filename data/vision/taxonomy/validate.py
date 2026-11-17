#!/usr/bin/env python3
"""
validate.py (D1c; D2 added the instance-of and generic-entry checks and the keep list)
Checks taxonomy.json, review.csv and vocabulary.json against the product rules and against how
they were built:

1. Every root, excluded instance-of class, skipped class and launch type resolved to its
   expected label and description, and every keep-list type to its QID and label (roots.json).
2. No kept type is under an excluded root (P279* or P31/P279*). Cut A's roots (scope "clothing")
   allow a launch type, a keep-list type, a banned root's example and a type another positive
   root reaches. Cut B: no path passes through a skipped class, and every other type is reached
   by a positive root. No type other than a launch type is an instance of an excluded class
   (brand, trademark, product model or line, fictional object or clothing, archaeological
   artefact) or a generic entry ("clothing", "garment", "gown").
3. No label names a degree, title or award (degree, doctorate, knight, duke, ...).
4. The depth bound holds: no type more than 4 subclass-of steps below its positive root (2 below
   a banned root), and each step of its recorded path is a subclass-of edge.
5. Every banned rule has a not-allowed type, and no banned root contributes more than 15.
6. Every launch type has its QID, priority "launch", keep "yes" (or the owner's "no") and at
   least two names; every keep-list type is in, marked as such, and nothing else is.
7. Only the database's values (and none_fits / not_applicable) in category, garment type and
   item type; known allowed and region values; no duplicate QIDs; review.csv matches
   taxonomy.json in order and parts (launch rows, then the keep list, both with needs_owner =
   yes, then review, then the rest); vocabulary.json holds exactly the allowed and not-allowed types not marked keep = no.
8. Countries of origin are countries (no city, state or province), and the sheet's size is
   within the expected range.
Then prints the counts by category, region and allowed status.

Needs only the committed files (taxonomy.json, roots.json, review.csv, vocabulary.json), so CI
runs it as it is. With --cache it also re-checks the evidence each row carries against the local
Wikidata cache (taxonomy/raw/fetched.json, not committed): the ancestor roots, the positive roots
that reach the type, every path step as an edge of its root's crawl, and the countries' classes.
"""

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

import specs
from build_taxonomy import (ALLOWED, CATEGORIES, CSV_COLUMNS, EXCLUDED_JSON, FETCHED_JSON, GARMENT_TYPES, ITEM_TYPES,
                            KEEP_VALUES, MAX_ROWS, MIN_ROWS, NEEDS_OWNER_GROUPS, REGIONS, REVIEW_CSV, SHEET_GROUPS,
                            TAXONOMY_JSON, VOCABULARY_JSON, bfs_paths, read_review_csv, vocabulary_entries)

ROOTS_JSON = Path(__file__).resolve().parent / "roots.json"
FORBIDDEN_LABEL = re.compile(r"degree|doctorate|knight|duke|duchess|rector|chancellor|medal|honorary|citizen", re.I)

# Each product rule that bans a kind, with words that show a type of that kind.
NOT_ALLOWED_RULES = {
    "T-shirts and tank tops": ["t-shirt", "tee", "tank top", "jersey"],
    "track pants, sweatpants and joggers": ["track pants", "sweatpants", "joggers", "tracksuit bottoms"],
    "shorts": ["shorts"],
    "jeans": ["jeans"],
    "hoodies and sweatshirts": ["hoodie", "sweatshirt"],
    "shoes": ["shoe", "sneaker", "boot", "heel", "sandal", "footwear"],
    "socks": ["sock"],
    "pantyhose": ["pantyhose", "tights", "stocking", "hosiery"],
    "hats and caps": ["cap", "hat", "headgear", "beanie"],
    "smartwatches": ["smartwatch"],
    "lingerie": ["lingerie"],
    "underwear": ["underwear", "undergarment", "bra", "brief"],
    "swimwear": ["swimwear", "swimsuit", "bikini", "swim"],
}


def matches(entry: dict, spec: dict) -> bool:
    label, desc = entry["label"].casefold(), entry["description"].casefold()
    return (label in {l.casefold() for l in spec["labels"]} and all(w.casefold() in desc for w in spec["desc"])
            and not any(w.casefold() in desc for w in spec.get("desc_not", [])))


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate the clothing taxonomy and its sheets.")
    parser.add_argument("--cache", action="store_true",
                        help="also re-check each row's evidence against taxonomy/raw/fetched.json (the local cache)")
    args = parser.parse_args()
    needed = [TAXONOMY_JSON, REVIEW_CSV, VOCABULARY_JSON, ROOTS_JSON] + ([FETCHED_JSON] if args.cache else [])
    for path in needed:
        if not path.exists():
            print(f"FAIL: {path} is missing.")
            return 1
    rows = json.loads(TAXONOMY_JSON.read_text(encoding="utf-8"))
    roots = json.loads(ROOTS_JSON.read_text(encoding="utf-8"))
    fetched = json.loads(FETCHED_JSON.read_text(encoding="utf-8")) if args.cache else None
    errors: list[str] = []
    passed: list[str] = []
    failed: list[str] = []

    def check(name: str, problems: list[str]) -> None:
        if problems:
            errors.extend(problems)
            failed.append(name)
            print(f"  [FAIL] {name}: {len(problems)} problem(s), e.g. {problems[:3]}")
        else:
            passed.append(name)
            print(f"  [PASS] {name}")

    mode = "committed files + local cache" if args.cache else "committed files only"
    print("=" * 70 + f"\nDziRent taxonomy validation (D1c; {mode})\n" + "=" * 70)
    by_qid = {r["qid"]: r for r in rows}
    is_launch = {r["qid"]: r["launch_concept"] is not None for r in rows}

    # 1. Roots, skipped classes and launch types.
    problems = []
    groups = [("positive", specs.POSITIVE_ROOTS), ("banned", specs.BANNED_ROOTS), ("exclude", specs.EXCLUDE_ROOTS),
              ("instance_of", specs.EXCLUDE_INSTANCE_OF), ("skip", specs.SKIP_UNDER_CLOTHING),
              ("country_classes", specs.COUNTRY_CLASSES)]
    for group, spec_list in groups:
        by_key = {r["key"]: r for r in roots.get(group, [])}
        for spec in spec_list:
            entry = by_key.get(spec["key"])
            if (not entry or not matches(entry, spec) or (spec.get("qid") and entry["qid"] != spec["qid"])
                    or entry.get("scope") != spec.get("scope")):
                problems.append(f"{group} {spec['key']}: {entry and (entry['qid'], entry['label'])}")
    launch_roots = {l["qid"]: l for l in roots["launch"]}
    for spec in specs.LAUNCH:
        entry = launch_roots.get(spec["qid"])
        if not entry or not matches(entry, spec):
            problems.append(f"launch {spec['concept']} {spec['qid']}")
    keep_roots = {k["qid"]: k for k in roots.get("keep", [])}
    for spec in specs.KEEP_LIST:
        entry = keep_roots.get(spec["qid"])
        if not entry or entry["label"].casefold() != spec["label"].casefold():
            problems.append(f"keep list {spec['qid']} {spec['label']}: {entry and entry['label']}")
    if set(keep_roots) != specs.KEEP_QIDS:
        problems.append(f"roots.json keep list {sorted(set(keep_roots) ^ specs.KEEP_QIDS)} differs from specs.KEEP_LIST")
    check("every root, instance-of class, skipped class, launch QID and keep-list QID resolved to its expected label "
          "and description", problems)

    # 2. Excluded roots (cut A) and skipped classes (cut B).
    exclude = {r["qid"]: r["key"] for r in roots["exclude"]}
    clothing_scope = {r["qid"] for r in roots["exclude"] if r.get("scope") == "clothing"}
    skip = {r["qid"] for r in roots["skip"]}
    instance_of = {r["qid"]: r["key"] for r in roots["instance_of"]}
    generic = {g.casefold() for g in specs.GENERIC_LEAF_LABELS}
    problems = []
    for r in rows:
        name = f"{r['qid']} {r['english_name']}"
        under = [a for a in r["ancestor_roots"] if a in exclude]
        hard = [exclude[a] for a in under if a not in clothing_scope]
        if hard:
            problems.append(f"{name} under {hard}")
        if not is_launch[r["qid"]]:
            inst = [instance_of[a] for a, via in r["ancestor_roots"].items() if a in instance_of and via == "P31"]
            inst += [instance_of[c["qid"]] for c in r["instance_of"] if c["qid"] in instance_of]
            if inst:
                problems.append(f"{name} is an instance of {sorted(set(inst))}")
            if r["english_name"].casefold() in generic:
                problems.append(f"{name} is a generic entry")
        exempt = (is_launch[r["qid"]] or r["keep_list"] or r["banned_root"]
                  or set(r["positive_roots"]) - {"clothing"})
        if not exempt and any(a in clothing_scope for a in under):
            problems.append(f"{name} under {[exclude[a] for a in under if a in clothing_scope]} (cut A)")
        if any(p["qid"] in skip for p in r["path"]):
            problems.append(f"{name}: its path passes through a skipped class (cut B)")
        if not is_launch[r["qid"]] and not r["banned_root"] and not r["positive_roots"]:
            problems.append(f"{name}: no positive root reaches it (cut B)")
    if fetched:
        ancestors = fetched["ancestors"]
        crawls = fetched["crawls"]
        paths = {r["key"]: bfs_paths(crawls[r["key"]], skip if r["key"] == "clothing" else set()) for r in roots["positive"]}
        for r in rows:
            if r["ancestor_roots"] != ancestors.get(r["qid"], {}):
                problems.append(f"{r['qid']} {r['english_name']}: ancestor roots differ from the cache")
            if r["positive_roots"] != [k for k in paths if r["qid"] in paths[k]]:
                problems.append(f"{r['qid']} {r['english_name']}: positive roots differ from the cache's crawls")
    check("no type under an excluded root (title, award, occupation, degree, position, human, organization, military "
          "unit, armour; cut A's nine for what only clothing reaches); none only through fashion accessory (cut B); "
          "no instance of an excluded class and no generic entry (D2)", problems)

    # 3. Degree, title and award words.
    check("no label names a degree, title or award",
          [f"{r['qid']} {r['english_name']}" for r in rows if FORBIDDEN_LABEL.search(r["english_name"])])

    # 4. Depth bound and paths.
    root_of = {r["key"]: (r["qid"], specs.MAX_DEPTH) for r in roots["positive"]}
    root_of.update({r["key"]: (r["qid"], specs.BANNED_DEPTH) for r in roots["banned"]})
    edges = {k: {tuple(e) for e in c["edges"]} for k, c in fetched["crawls"].items()} if fetched else None
    problems = []
    for r in rows:
        name = f"{r['qid']} {r['english_name']}"
        if r["root"] not in root_of:
            problems.append(f"{name}: no root ({r['root']})")
            continue
        root_qid, limit = root_of[r["root"]]
        path = [p["qid"] for p in r["path"]]
        if path[0] != root_qid or path[-1] != r["qid"] or len(path) - 1 != r["depth"]:
            problems.append(f"{name}: path doesn't run from {r['root']} to the type")
            continue
        if r["depth"] > limit:
            problems.append(f"{name}: {r['depth']} steps below {r['root']} (limit {limit})")
        for parent, child in zip(path, path[1:]):
            # A step to a kept type must be one of its own parent classes; with --cache, every step
            # must be an edge of the root's crawl.
            if child in by_qid and parent not in {p["qid"] for p in by_qid[child]["parents"]}:
                problems.append(f"{name}: {parent} isn't a parent class of {child}")
            if edges is not None and (child, parent) not in edges[r["root"]]:
                problems.append(f"{name}: step {parent} -> {child} isn't an edge of the {r['root']} crawl")
    check(f"depth bound: at most {specs.MAX_DEPTH} steps below a positive root, {specs.BANNED_DEPTH} below a "
          f"banned root, along subclass-of edges", problems)

    # 5. Banned rules and examples.
    not_allowed = [r for r in rows if r["allowed"] == "not_allowed"]
    problems = []
    for rule, words in NOT_ALLOWED_RULES.items():
        hit = [r["qid"] for r in not_allowed if rule in r["notes"] or any(
            w in f"{r['english_name']} {' '.join(r['vocabulary'])}".lower() for w in words)]
        print(f"      {rule}: {len(hit)} not-allowed type(s)")
        if not hit:
            problems.append(f"no not-allowed type for '{rule}'")
    per_root = Counter(r["banned_root"] for r in rows if r["banned_root"])
    problems += [f"{k} contributes {n}" for k, n in per_root.items() if n > specs.BANNED_KEEP]
    problems += [f"banned root {r['key']} contributes nothing" for r in roots["banned"] if not per_root.get(r["key"])]
    check(f"every banned rule has a not-allowed type; no banned root contributes more than {specs.BANNED_KEEP}", problems)

    # 6. Launch types.
    problems = []
    for spec in specs.LAUNCH:
        r = by_qid.get(spec["qid"])
        if not r:
            problems.append(f"{spec['concept']} {spec['qid']} missing")
        elif r["priority"] != "launch" or r["keep"] not in ("yes", "no") or len(r["vocabulary"]) < 2:
            problems.append(f"{spec['qid']} {r['english_name']}: priority {r['priority']}, keep '{r['keep']}', "
                            f"{len(r['vocabulary'])} names")
    launch_rows = sum(is_launch.values())
    if launch_rows != len(specs.LAUNCH):
        problems.append(f"{launch_rows} launch rows, expected {len(specs.LAUNCH)}")
    keep_rows = {r["qid"] for r in rows if r["keep_list"]}
    problems += [f"keep list {q} missing" for q in sorted(specs.KEEP_QIDS - keep_rows)]
    problems += [f"{q} is marked keep list but isn't on it" for q in sorted(keep_rows - specs.KEEP_QIDS)]
    check("every launch type has its QID, keep 'yes' (or the owner's 'no') and at least two names; every keep-list "
          "type is in and marked", problems)

    # 7. Values, duplicates, the sheet and the vocabulary.
    problems = []
    for r in rows:
        for field, valid in (("dzirent_category", CATEGORIES), ("dzirent_garment_type", GARMENT_TYPES),
                             ("allowed", ALLOWED), ("region", REGIONS), ("keep", KEEP_VALUES),
                             ("sheet_group", SHEET_GROUPS)):
            if r[field] not in valid:
                problems.append(f"{r['qid']} {field} '{r[field]}'")
        if r["dzirent_item_type"] is not None and r["dzirent_item_type"] not in ITEM_TYPES:
            problems.append(f"{r['qid']} item type '{r['dzirent_item_type']}'")
        if (r["sheet_group"] == "launch") != is_launch[r["qid"]]:
            problems.append(f"{r['qid']} sheet part '{r['sheet_group']}' but launch {is_launch[r['qid']]}")
        if (r["sheet_group"] == "keep") != (r["keep_list"] and not is_launch[r["qid"]]):
            problems.append(f"{r['qid']} sheet part '{r['sheet_group']}' but keep list {r['keep_list']}")
    dupes = [q for q, n in Counter(r["qid"] for r in rows).items() if n > 1]
    problems += [f"duplicate QID {q}" for q in dupes]
    parts = [SHEET_GROUPS.index(r["sheet_group"]) for r in rows if r["sheet_group"] in SHEET_GROUPS]
    if parts != sorted(parts):
        problems.append("taxonomy.json isn't launch rows, then review rows, then the rest")
    sheet, columns = read_review_csv()
    if columns != CSV_COLUMNS:
        problems.append(f"review.csv columns {columns}, expected {CSV_COLUMNS}")
    elif [s["qid"] for s in sheet] != [r["qid"] for r in rows]:
        problems.append("review.csv rows don't match taxonomy.json (same QIDs, same order)")
    else:
        group = {r["qid"]: r["sheet_group"] for r in rows}
        problems += [f"review.csv {s['qid']}: needs_owner '{s['needs_owner']}'" for s in sheet
                     if s["needs_owner"] != ("yes" if group[s["qid"]] in NEEDS_OWNER_GROUPS else "")]
    vocabulary = json.loads(VOCABULARY_JSON.read_text(encoding="utf-8"))
    if vocabulary.get("entries") != vocabulary_entries(rows):
        problems.append("vocabulary.json isn't the allowed and not-allowed rows of taxonomy.json (keep = no left out)")
    check("only database values, no duplicates; review.csv and vocabulary.json match taxonomy.json", problems)

    # 8. Countries and size.
    classes = {r["qid"] for r in roots["country_classes"]}
    types = fetched["country_types"] if fetched else None
    problems = []
    for r in rows:
        if r["country_of_origin"] != [c["label"] for c in r["country_evidence"]]:
            problems.append(f"{r['qid']}: countries {r['country_of_origin']} don't match their evidence")
        for c in r["country_evidence"]:
            if not c["classes"] or not set(c["classes"]) <= classes:
                problems.append(f"{r['qid']} country '{c['label']}' isn't shown to be a country")
            if types is not None and c["classes"] != sorted(set(types.get(c["qid"], [])) & classes):
                problems.append(f"{r['qid']} country '{c['label']}': classes differ from the cache")
    if not MIN_ROWS <= len(rows) <= MAX_ROWS:
        problems.append(f"{len(rows)} rows, outside {MIN_ROWS}-{MAX_ROWS}")
    check(f"countries of origin are countries; {MIN_ROWS}-{MAX_ROWS} rows", problems)

    print("\n--- Counts ---")
    print(f"rows {len(rows)}, launch {launch_rows}, keep list {len(keep_rows)}, needs_owner = yes "
          f"{sum(r['sheet_group'] in NEEDS_OWNER_GROUPS for r in rows)}, in vocabulary.json "
          f"{len(vocabulary['entries'])}, keep = no {sum(r['keep'] == 'no' for r in rows)}")
    for field in ("dzirent_category", "region", "allowed"):
        print(f"by {field}: " + ", ".join(f"{k} {n}" for k, n in Counter(r[field] for r in rows).most_common()))
    if EXCLUDED_JSON.exists():
        excluded = json.loads(EXCLUDED_JSON.read_text(encoding="utf-8"))
        print("excluded by reason: " + ", ".join(f"{k} {n}" for k, n in Counter(x["reason"] for x in excluded).most_common()))

    if errors:
        print(f"\nVALIDATION FAILED: {len(errors)} problem(s) in {len(failed)} of {len(failed) + len(passed)} checks.")
        return 1
    print(f"\nALL {len(passed)} CHECKS PASSED.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
