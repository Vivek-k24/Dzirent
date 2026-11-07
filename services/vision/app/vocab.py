"""The policy table and the recognition vocabulary, loaded and checked once."""

import hashlib
import json
from dataclasses import dataclass
from functools import lru_cache

from . import config

# The values the database allows (supabase/migrations/20261030232726_foundation_schema.sql,
# listings_*_check). A suggestion can only ever use these.
CATEGORIES = (
    "Career & Professional", "Occasion & Party", "Cultural & Traditional",
    "Everyday", "Outerwear", "Accessories",
)
GARMENT_TYPES = ("top", "trousers", "suit", "dress", "skirt", "saree", "one_size")
ITEM_TYPES = ("Sunglasses", "Handbag", "Tie", "Watch (non-smart)", "Belt buckle", "Costume jewelry")
STYLES = (
    "South Asian", "East Asian", "Southeast Asian", "Middle Eastern", "African",
    "Mexican & Latin American", "Country & Western", "Western formal", "Western casual",
)
KINDS = ("garment", "accessory", "other")
SLOTS = ("front", "back", "close_up", "size_tag", "extra_1", "extra_2")

NOT_CLOTHING_REASON = "This doesn't look like clothing or an accessory we list."

# The columns public.policy_item_types has, in order.
POLICY_COLUMNS = (
    "key", "label", "kind", "allowed", "category", "item_type", "garment_type", "style",
    "policy_group", "noun", "looks_like", "reason", "prompts",
)


@dataclass(frozen=True)
class Item:
    key: str
    label: str
    kind: str
    allowed: bool
    category: str | None
    item_type: str | None
    garment_type: str | None
    style: str | None
    policy_group: str | None
    noun: str
    looks_like: str
    reason: str | None
    prompts: tuple[str, ...]

    @property
    def group(self) -> str:
        """allowed, not_allowed (a policy item) or not_clothing."""
        if self.allowed:
            return "allowed"
        return "not_clothing" if self.kind == "other" else "not_allowed"


@dataclass(frozen=True)
class Entry:
    """One vocabulary class: its key, prompts and (for patterns) the title adjective."""
    key: str
    prompts: tuple[str, ...]
    adjective: str | None = None


BANKS = ("general", "worn", "hooded", "details", "patterns", "styles", "fabrics")


@dataclass(frozen=True, eq=False)
class Vocab:
    items: tuple[Item, ...]
    banks: dict[str, tuple[Entry, ...]]  # BANKS, each in vocab.json's order
    by_key: dict[str, Item]

    def prompt_sets(self) -> dict[str, list[tuple[str, tuple[str, ...]]]]:
        """Every bank, items first, as [(key, prompts)]: the order embeddings are stored in."""
        sets = {"items": [(i.key, i.prompts) for i in self.items]}
        sets.update({name: [(e.key, e.prompts) for e in self.banks[name]] for name in BANKS})
        return sets

    @property
    def digest(self) -> str:
        """Changes whenever any key or prompt changes; the built embeddings record it."""
        sets = self.prompt_sets()
        return hashlib.sha256(json.dumps(sets, sort_keys=True).encode("utf-8")).hexdigest()


def _check_item(row: dict) -> Item:
    missing = [c for c in POLICY_COLUMNS if c not in row]
    if missing:
        raise ValueError(f"{row.get('key')}: missing {missing}")
    item = Item(**{c: (tuple(row[c]) if c == "prompts" else row[c]) for c in POLICY_COLUMNS})
    where = f"policy item {item.key}"
    if item.kind not in KINDS:
        raise ValueError(f"{where}: unknown kind {item.kind}")
    if not item.prompts or any(not p.strip() for p in item.prompts):
        raise ValueError(f"{where}: needs prompts")
    if item.allowed:
        if item.kind == "other":
            raise ValueError(f"{where}: something that isn't clothing can't be allowed")
        if item.category not in CATEGORIES or item.garment_type not in GARMENT_TYPES:
            raise ValueError(f"{where}: allowed items need a database category and garment type")
        if item.style is not None and item.style not in STYLES:
            raise ValueError(f"{where}: unknown style {item.style}")
        if item.kind == "accessory":
            if item.category != "Accessories" or item.item_type not in ITEM_TYPES or item.garment_type != "one_size":
                raise ValueError(f"{where}: accessories need category Accessories, an item type and one_size")
        elif item.item_type is not None:
            raise ValueError(f"{where}: only accessories have an item type")
        if item.reason is not None or item.policy_group is not None:
            raise ValueError(f"{where}: allowed items have no reason or policy group")
    else:
        if any(v is not None for v in (item.category, item.item_type, item.garment_type, item.style)):
            raise ValueError(f"{where}: items that aren't allowed map to no category, type or style")
        if not item.reason or not item.policy_group:
            raise ValueError(f"{where}: items that aren't allowed need a reason and a policy group")
        if item.kind == "other" and item.reason != NOT_CLOTHING_REASON:
            raise ValueError(f"{where}: things that aren't clothing use the one fixed reason")
    return item


@lru_cache(maxsize=1)
def load() -> Vocab:
    policy = json.loads(config.POLICY_FILE.read_text(encoding="utf-8"))
    vocab = json.loads(config.VOCAB_FILE.read_text(encoding="utf-8"))
    items = tuple(_check_item(row) for row in policy["items"])
    keys = [i.key for i in items]
    if len(set(keys)) != len(keys):
        raise ValueError("policy keys must be unique")

    banks: dict[str, tuple[Entry, ...]] = {}
    for name in BANKS:
        entries = tuple(
            Entry(key=e["key"], prompts=tuple(e["prompts"]), adjective=e.get("adjective"))
            for e in vocab[name]
        )
        if len({e.key for e in entries}) != len(entries) or any(not e.prompts for e in entries):
            raise ValueError(f"vocab {name}: keys must be unique and have prompts")
        banks[name] = entries
    if [e.key for e in banks["styles"]] != list(STYLES):
        raise ValueError("vocab styles must be the database's listing styles, in order")
    if [e.key for e in banks["general"]] != ["fashion", "not_fashion"] or \
            [e.key for e in banks["worn"]] != ["worn", "not_worn"] or \
            [e.key for e in banks["hooded"]] != ["hooded", "not_hooded"]:
        raise ValueError("vocab general, worn and hooded have fixed keys")
    return Vocab(items=items, banks=banks, by_key={i.key: i for i in items})


def policy_rows() -> list[dict]:
    """The policy as the database stores it: one dict per row, in the columns' order."""
    policy = json.loads(config.POLICY_FILE.read_text(encoding="utf-8"))
    return [{c: row[c] for c in POLICY_COLUMNS} for row in policy["items"]]
