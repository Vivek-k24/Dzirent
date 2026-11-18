#!/usr/bin/env python3
"""
fetch_wikidata.py (D1b; D1c added cut A's exclusion roots and cut B's skipped class; D2 added the
watch root, the excluded instance-of classes and the keep list; D2b the costume and space suit
roots, each with its own depth, the instance-of exceptions and the drop list)
Collects Dzirent's clothing types from Wikidata in cached steps:

1. Roots: every root, exclusion root, excluded instance-of class, skipped class, country class
   and launch type in specs.py is resolved by label search (wbsearchentities) and checked with
   wbgetentities; any label or description that doesn't match stops the run. D1's launch QIDs are
   checked the same way, and each keep-list, instance-of exception and drop-list type by its QID
   and English label. The result is recorded in taxonomy/roots.json.
2. Crawl: "subclass of" (P279) below each root, one SPARQL query per root with explicit hop
   paths (wdt:P279, wdt:P279/wdt:P279, ...; never P279*): 1-4 hops below a positive root (or
   its own "depth": costume 2, space suit 1), 1-2 below a banned root.
3. Details (wbgetentities) for each crawled item with a Commons category, an image or an
   English Wikipedia article, and for every launch type.
4. Ancestors: which exclusion, banned and positive roots and excluded instance-of classes each
   of those items is under (P279* or P31/P279*).
5. English labels of the parents, classes (P31), countries and cultures they name, and the
   classes of each country of origin.

Writes taxonomy/raw/fetched.json for build_taxonomy.py. Every response is cached in
taxonomy/raw/, so a second run makes no requests. No images are downloaded.
"""

import argparse
import json
import logging
import sys
import time
from collections import defaultdict, deque
from pathlib import Path

import specs
from wikidata_client import RAW_DIR, Client, digest, qid_num, qid_of

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("fetch_wikidata")

TAXONOMY_DIR = Path(__file__).resolve().parent
ROOTS_JSON = TAXONOMY_DIR / "roots.json"
FETCHED_JSON = RAW_DIR / "fetched.json"

SEARCH_PAGES = 5
ENTITY_PROPS = "labels|descriptions|aliases|claims|sitelinks"
ENTITY_LANGS = "|".join(["en"] + specs.LANGUAGES)
CLAIM_PROPS = ["P31", "P279", "P495", "P2596", "P373", "P18"]
ANCESTOR_BATCH = 100


class SpecError(Exception):
    pass


def en_text(ent: dict, field: str) -> str:
    value = ent.get(field, {}).get("en")
    return value.get("value", "") if value else ""


def matches(ent: dict, spec: dict) -> bool:
    label = en_text(ent, "labels").casefold()
    desc = en_text(ent, "descriptions").casefold()
    return (label in {l.casefold() for l in spec["labels"]}
            and all(w.casefold() in desc for w in spec["desc"])
            and not any(w.casefold() in desc for w in spec.get("desc_not", [])))


def resolve(client: Client, spec: dict) -> dict:
    """Search the spec's label, confirm with wbgetentities, return the single matching item."""
    text = spec.get("search", spec["labels"][0])
    wanted = {l.casefold() for l in spec["labels"]}
    seen: list[dict] = []
    hits: list[str] = []
    ents: dict = {}
    offset = 0
    for _ in range(SEARCH_PAGES):
        results, more = client.search(text, offset)
        seen.extend(results)
        candidates = [r["id"] for r in results if str(r.get("label", "")).casefold() in wanted]
        if candidates:
            ents = client.entities(candidates, "labels|descriptions|aliases", "en", "verify")
            hits = [q for q in candidates if q in ents and matches(ents[q], spec)]
            if hits:
                break
        if not more:
            break
        offset += len(results)
    name = spec.get("key") or spec.get("concept")
    if not hits:
        top = "; ".join(f"{r['id']} '{r.get('label', '')}' ({r.get('description', '')[:60]})" for r in seen[:6])
        raise SpecError(f"{name}: no search result for '{text}' has label {spec['labels']} and "
                        f"description words {spec['desc']}. Top results: {top}")
    if len(hits) > 1:
        raise SpecError(f"{name}: several items match '{text}': {hits}; sharpen its description words")
    qid = hits[0]
    if spec.get("qid") and spec["qid"] != qid:
        raise SpecError(f"{name}: resolved to {qid}, but the expected QID is {spec['qid']}")
    return {"qid": qid, "label": en_text(ents[qid], "labels"), "description": en_text(ents[qid], "descriptions"),
            "search": text, "rank": [r["id"] for r in seen].index(qid) + 1}


def resolve_all(client: Client) -> dict:
    errors: list[str] = []
    out: dict = {"positive": [], "banned": [], "exclude": [], "instance_of": [], "skip": [], "country_classes": [],
                 "launch": [], "keep": [], "instance_of_exceptions": [], "drop": []}
    groups = [("positive", specs.POSITIVE_ROOTS), ("banned", specs.BANNED_ROOTS), ("exclude", specs.EXCLUDE_ROOTS),
              ("instance_of", specs.EXCLUDE_INSTANCE_OF), ("skip", specs.SKIP_UNDER_CLOTHING),
              ("country_classes", specs.COUNTRY_CLASSES)]
    for group, spec_list in groups:
        for spec in spec_list:
            try:
                out[group].append({"key": spec["key"], **resolve(client, spec),
                                   **{k: spec[k] for k in ("rule", "scope", "depth", "costume") if k in spec}})
            except SpecError as e:
                errors.append(str(e))
    for spec in specs.LAUNCH:
        try:
            entry = {"concept": spec["concept"], **resolve(client, {**spec, "key": spec["concept"]})}
        except SpecError as e:
            errors.append(str(e))
            continue
        # D1's own QID, checked against the same label and description.
        d1 = spec.get("d1_qid", spec["qid"])
        d1_ent = client.entities([d1], "labels|descriptions|aliases", "en", "verify").get(d1, {})
        d1_ok = matches(d1_ent, spec)
        entry.update({"d1_qid": d1, "d1_label": en_text(d1_ent, "labels"),
                      "d1_description": en_text(d1_ent, "descriptions"), "d1_check": "pass" if d1_ok else "fail"})
        if "d1_qid" in spec and d1_ok:
            errors.append(f"{spec['concept']}: D1's {d1} passes the check, so replacing it isn't needed")
        out["launch"].append(entry)
    # The keep list (D2), the instance-of exceptions and the drop list (D2b): each type by its QID,
    # which must carry the English label recorded with it.
    for group, spec_list in (("keep", specs.KEEP_LIST), ("instance_of_exceptions", specs.EXCLUDE_INSTANCE_OF_EXCEPTIONS),
                             ("drop", specs.DROP_LIST)):
        ents = client.entities([k["qid"] for k in spec_list], "labels|descriptions|aliases", "en", "verify")
        for spec in spec_list:
            ent = ents.get(spec["qid"], {})
            label = en_text(ent, "labels")
            if label.casefold() != spec["label"].casefold():
                errors.append(f"{group} {spec['qid']}: English label is '{label}', expected '{spec['label']}'")
                continue
            out[group].append({"qid": spec["qid"], "label": label, "description": en_text(ent, "descriptions")})
    if errors:
        for e in errors:
            logger.error(e)
        raise SystemExit(f"Stopped: {len(errors)} root or launch check(s) failed (see above).")
    return out


def crawl_query(root: str, hops: int) -> str:
    """Edges child -> parent for every class 1..hops subclass-of steps below root."""
    parts = [f"{{ ?item wdt:P279 wd:{root} . BIND(wd:{root} AS ?parent) }}"]
    for h in range(1, hops):
        path = "/".join(["wdt:P279"] * h)
        parts.append(f"{{ ?parent {path} wd:{root} . ?item wdt:P279 ?parent . }}")
    union = "\n    UNION ".join(parts)
    return f"""SELECT ?item ?parent ?label ?commons ?image ?enwiki WHERE {{
  {{ SELECT DISTINCT ?item ?parent WHERE {{
    {union}
  }} }}
  OPTIONAL {{ ?item rdfs:label ?label . FILTER(LANG(?label) = "en") }}
  BIND(EXISTS {{ ?item wdt:P373 [] }} AS ?commons)
  BIND(EXISTS {{ ?item wdt:P18 [] }} AS ?image)
  BIND(EXISTS {{ ?page schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }} AS ?enwiki)
}}"""


def crawl(client: Client, role: str, root: dict, hops: int) -> dict:
    qid = root["qid"]
    cache = RAW_DIR / "crawl" / f"{role}_{root['key']}_{qid}_{hops}.json"
    data = client.sparql(crawl_query(qid, hops), cache)
    nodes: dict[str, dict] = {}
    edges: set[tuple[str, str]] = set()
    for b in data["results"]["bindings"]:
        child, parent = qid_of(b["item"]["value"]), qid_of(b["parent"]["value"])
        if not child or not parent or child == qid:
            continue
        edges.add((child, parent))
        nodes[child] = {"label": b.get("label", {}).get("value", ""),
                        "commons": b["commons"]["value"] == "true", "image": b["image"]["value"] == "true",
                        "enwiki": b["enwiki"]["value"] == "true"}
    children = defaultdict(list)
    for child, parent in edges:
        children[parent].append(child)
    depth = {qid: 0}
    queue = deque([qid])
    while queue:
        node = queue.popleft()
        for child in children[node]:
            if child not in depth:
                depth[child] = depth[node] + 1
                queue.append(child)
    for q, attrs in nodes.items():
        attrs["depth"] = depth.get(q)
    too_deep = [q for q, a in nodes.items() if a["depth"] is None or a["depth"] > hops]
    if too_deep:
        raise SystemExit(f"crawl {root['key']}: {len(too_deep)} items beyond {hops} hops, e.g. {too_deep[:5]}")
    logger.info("crawl %s %s (%s, %d hops): %d classes, %d edges", role, root["key"], qid, hops, len(nodes), len(edges))
    return {"role": role, "root": qid, "hops": hops, "nodes": nodes,
            "edges": sorted(edges, key=lambda e: (qid_num(e[0]), qid_num(e[1])))}


def claim_values(ent: dict, prop: str) -> list[str]:
    """Truthy values, as wdt: gives them: preferred statements if any, else normal ones."""
    statements = [s for s in ent.get("claims", {}).get(prop, []) if s.get("rank") != "deprecated"]
    preferred = [s for s in statements if s.get("rank") == "preferred"]
    out = []
    for s in preferred or statements:
        value = s.get("mainsnak", {}).get("datavalue", {}).get("value")
        if isinstance(value, dict) and "id" in value:
            out.append(value["id"])
        elif isinstance(value, str):
            out.append(value)
    return list(dict.fromkeys(out))


def trim(ent: dict) -> dict:
    return {
        "labels": {lang: v["value"] for lang, v in ent.get("labels", {}).items()},
        "descriptions": {lang: v["value"] for lang, v in ent.get("descriptions", {}).items()},
        "aliases": {lang: [a["value"] for a in vals] for lang, vals in ent.get("aliases", {}).items()},
        "claims": {p: claim_values(ent, p) for p in CLAIM_PROPS},
        "enwiki": ent.get("sitelinks", {}).get("enwiki", {}).get("title"),
    }


def ancestor_query(batch: list[str], targets: list[str]) -> str:
    values = " ".join(f"wd:{q}" for q in batch)
    wanted = ", ".join(f"wd:{q}" for q in targets)
    return f"""SELECT DISTINCT ?item ?anc ?via WHERE {{
  VALUES ?item {{ {values} }}
  {{ ?item wdt:P279* ?anc . BIND("P279" AS ?via) }}
  UNION
  {{ ?item wdt:P31/wdt:P279* ?anc . BIND("P31" AS ?via) }}
  FILTER(?anc IN ({wanted}))
}}"""


def types_query(batch: list[str]) -> str:
    values = " ".join(f"wd:{q}" for q in batch)
    return f"SELECT ?item ?type WHERE {{ VALUES ?item {{ {values} }} ?item wdt:P31 ?type . }}"


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch D1b's clothing types from Wikidata (cached).")
    parser.add_argument("--roots-only", action="store_true", help="resolve and check the roots and launch types, then stop")
    args = parser.parse_args()
    started = time.time()
    client = Client()

    roots = resolve_all(client)
    ROOTS_JSON.write_text(json.dumps(roots, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    failed_d1 = [l for l in roots["launch"] if l["d1_check"] == "fail"]
    logger.info("Roots and launch types resolved: %d positive, %d banned, %d exclusion, %d instance-of, %d skipped, "
                "%d launch (%d of D1's launch QIDs failed and were replaced), %d on the keep list, %d instance-of "
                "exceptions, %d on the drop list.",
                len(roots["positive"]), len(roots["banned"]), len(roots["exclude"]), len(roots["instance_of"]),
                len(roots["skip"]), len(roots["launch"]), len(failed_d1), len(roots["keep"]),
                len(roots["instance_of_exceptions"]), len(roots["drop"]))
    if args.roots_only:
        return

    crawls = {}
    for root in roots["positive"]:
        crawls[root["key"]] = crawl(client, "positive", root, root.get("depth", specs.MAX_DEPTH))
    for root in roots["banned"]:
        crawls[root["key"]] = crawl(client, "banned", root, specs.BANNED_DEPTH)

    # The quality floor, from the crawl's flags: details are fetched only for items that pass.
    root_qids = {r["qid"] for g in ("positive", "banned") for r in roots[g]}
    launch_qids = {l["qid"] for l in roots["launch"]} | {k["qid"] for g in ("keep", "instance_of_exceptions", "drop")
                                                          for k in roots[g]}
    candidates, below_floor = set(root_qids | launch_qids), {}
    for key, c in crawls.items():
        for q, a in c["nodes"].items():
            if a["commons"] or a["image"] or a["enwiki"]:
                candidates.add(q)
            else:
                below_floor.setdefault(q, {"label": a["label"], "roots": []})["roots"].append(key)
    for q in candidates:
        below_floor.pop(q, None)
    candidates = sorted(candidates, key=qid_num)
    logger.info("%d candidate classes pass the quality floor; %d don't.", len(candidates), len(below_floor))

    raw_entities = client.entities(candidates, ENTITY_PROPS, ENTITY_LANGS, "entities")
    entities = {q: trim(e) for q, e in raw_entities.items() if "missing" not in e}
    logger.info("Details for %d classes.", len(entities))

    targets = sorted({r["qid"] for g in ("exclude", "banned", "positive", "instance_of") for r in roots[g]}, key=qid_num)
    rows = client.sparql_batched(sorted(entities, key=qid_num), lambda b: ancestor_query(b, targets),
                                 f"ancestors_{digest(targets)[:8]}", ANCESTOR_BATCH)
    ancestors: dict[str, dict[str, str]] = defaultdict(dict)
    for r in rows:
        item, anc, via = qid_of(r["item"]["value"]), qid_of(r["anc"]["value"]), r["via"]["value"]
        if ancestors[item].get(anc) != "P279":
            ancestors[item][anc] = via
    logger.info("Ancestor check done for %d classes.", len(entities))

    labels = {q: a["label"] for c in crawls.values() for q, a in c["nodes"].items() if a["label"]}
    labels.update({r["qid"]: r["label"] for g in roots.values() for r in g})
    labels.update({q: e["labels"].get("en", "") for q, e in entities.items()})
    referenced = {v for e in entities.values() for p in ("P279", "P31", "P495", "P2596") for v in e["claims"][p]}
    missing = sorted((q for q in referenced if q.startswith("Q") and not labels.get(q)), key=qid_num)
    for q, e in client.entities(missing, "labels|descriptions", "en", "labels").items():
        labels[q] = en_text(e, "labels")
    countries = sorted({v for e in entities.values() for v in e["claims"]["P495"]}, key=qid_num)
    country_types: dict[str, list[str]] = defaultdict(list)
    for r in client.sparql_batched(countries, types_query, "country_types", 200):
        country_types[qid_of(r["item"]["value"])].append(qid_of(r["type"]["value"]))

    fetched = {"roots": roots, "crawls": crawls, "below_floor": below_floor, "entities": entities,
               "ancestors": ancestors, "labels": labels, "country_types": country_types,
               "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    FETCHED_JSON.write_text(json.dumps(fetched, ensure_ascii=False), encoding="utf-8", newline="\n")
    logger.info("Done in %.1f s: %d requests, %d cache hits. Wrote %s.", time.time() - started,
                client.requests_made, client.cache_hits, FETCHED_JSON)


if __name__ == "__main__":
    main()
