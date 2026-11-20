"""V1b: what type a photo shows, read from two kinds of pins, and how banned it looks.

- Text pins (app/vocabulary.npz, committed): one unit vector per vocabulary.json type (843 types,
  allowed and not allowed), the mean of "a photo of a <name>" over its English name and up to 5
  also-called names. Built by data/vision/embed/build_pins.py with this service's own model code.
- Gallery pins (app/gallery.npz, fetched from the bucket at build time, never at request time):
  one unit vector per kept train photo of those types. Test photos are never in it.
- pins.json (committed) names the vocabulary version both were built for and the gallery file's
  sha256; the service refuses to start when the files don't match it.

Per photo (or the listing's averaged embedding):
- text: cosine similarity to every text pin, turned into probabilities with the model card's
  zero-shot recipe (softmax of 100 x similarity); the top 5 are reported;
- gallery: the k nearest gallery photos vote for their type, each with its similarity;
- type: when the text's top type and the gallery's vote agree, that type with confidence the mean
  of the two scores; when they disagree, the higher-scoring one, its confidence multiplied by the
  disagreement factor, and agreement false;
- banned_score: the larger of the highest probability of any not-allowed text pin and the
  not-allowed share of the gallery vote. verdict.py turns it into the banned gate.

Every number the rules use is in app/thresholds.json, with the reason for each value.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from . import config

THRESHOLDS_FILE = config.APP_DIR / "thresholds.json"
PINS_FILE = config.APP_DIR / "pins.json"
VOCABULARY_PINS_FILE = config.APP_DIR / "vocabulary.npz"
GALLERY_PINS_FILE = config.APP_DIR / "gallery.npz"


@dataclass(frozen=True)
class PinType:
    qid: str
    english_name: str
    category: str | None
    item_type: str | None
    garment_type: str | None
    allowed: bool

    @property
    def kind(self) -> str:
        """accessory (it has an item type) or garment: photos of one listing must agree on it."""
        return "accessory" if self.item_type else "garment"

    def to_json(self) -> dict:
        return {"qid": self.qid, "english_name": self.english_name, "category": self.category,
                "item_type": self.item_type, "garment_type": self.garment_type}


@dataclass(frozen=True)
class Thresholds:
    text_logit_scale: float
    text_top: int
    gallery_k: int
    disagreement_factor: float
    type_min_confidence: float
    banned_min: float

    @classmethod
    def load(cls, path: Path = THRESHOLDS_FILE) -> "Thresholds":
        raw = json.loads(path.read_text(encoding="utf-8"))
        values = {k: v["value"] for k, v in raw.items() if not k.startswith("_")}
        missing = [f for f in cls.__dataclass_fields__ if f not in values]
        if missing:
            raise ValueError(f"thresholds.json is missing {missing}")
        th = cls(**{f: values[f] for f in cls.__dataclass_fields__})
        for name in ("disagreement_factor", "type_min_confidence", "banned_min"):
            if not 0.0 <= getattr(th, name) <= 1.0:
                raise ValueError(f"thresholds.json: {name} must be between 0 and 1")
        if th.text_top < 1 or th.gallery_k < 1 or th.text_logit_scale <= 0:
            raise ValueError("thresholds.json: text_top, gallery_k and text_logit_scale must be positive")
        return th


def _unit(m: np.ndarray) -> np.ndarray:
    m = np.asarray(m, dtype=np.float32)
    norms = np.linalg.norm(m, axis=-1, keepdims=True)
    return m / np.where(norms == 0, 1.0, norms)


@dataclass(eq=False)
class Pins:
    version: str
    types: tuple[PinType, ...]
    text: np.ndarray            # (types, dims), unit rows
    gallery: np.ndarray         # (photos, dims), unit rows
    gallery_type: np.ndarray    # (photos,) index into types
    not_allowed: np.ndarray = field(init=False)

    def __post_init__(self):
        self.text = _unit(self.text)
        self.gallery = _unit(self.gallery) if len(self.gallery) else np.zeros((0, self.text.shape[1]), np.float32)
        self.gallery_type = np.asarray(self.gallery_type, dtype=np.int64)
        self.not_allowed = np.array([not t.allowed for t in self.types], dtype=bool)
        if self.text.shape[0] != len(self.types):
            raise ValueError("one text pin per type")
        if len(self.gallery) != len(self.gallery_type):
            raise ValueError("one type per gallery pin")
        if len(self.gallery_type) and (self.gallery_type.min() < 0 or self.gallery_type.max() >= len(self.types)):
            raise ValueError("a gallery pin names a type that has no text pin")


def _text(value) -> str | None:
    s = str(value)
    return s or None


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def load(vocabulary_file: Path = VOCABULARY_PINS_FILE, gallery_file: Path = GALLERY_PINS_FILE,
         pins_file: Path = PINS_FILE) -> Pins:
    """Both pin files, checked against pins.json and each other. Runs once, at start-up."""
    expected = json.loads(pins_file.read_text(encoding="utf-8"))
    vocab = np.load(vocabulary_file, allow_pickle=False)
    version = str(vocab["vocabulary_version"])
    if version != expected["vocabulary_version"]:
        raise RuntimeError("vocabulary.npz isn't the version pins.json names; rebuild the pins")
    if not gallery_file.exists():
        raise RuntimeError("gallery.npz is missing: the build fetches it from the bucket (cloudbuild.yaml)")
    if _sha256(gallery_file) != expected["gallery_sha256"]:
        raise RuntimeError("gallery.npz isn't the file pins.json names (sha256 differs); fetch it again")
    gallery = np.load(gallery_file, allow_pickle=False)
    if str(gallery["vocabulary_version"]) != version:
        raise RuntimeError("gallery.npz was built for another vocabulary; rebuild the pins")
    types = tuple(
        PinType(qid=str(q), english_name=str(n), category=_text(c), item_type=_text(i), garment_type=_text(g),
                allowed=bool(a))
        for q, n, c, i, g, a in zip(vocab["qid"], vocab["english_name"], vocab["dzirent_category"],
                                    vocab["dzirent_item_type"], vocab["dzirent_garment_type"], vocab["allowed"])
    )
    index = {t.qid: i for i, t in enumerate(types)}
    unknown = sorted({str(q) for q in gallery["qid"]} - set(index))
    if unknown:
        raise RuntimeError(f"gallery.npz has photos of {len(unknown)} types without a text pin")
    return Pins(version=version, types=types, text=vocab["embeddings"], gallery=gallery["embeddings"],
                gallery_type=np.array([index[str(q)] for q in gallery["qid"]]))


@dataclass
class TypeReading:
    """What the pins say about one embedding."""
    type: PinType | None
    confidence: float
    agreement: bool
    top_types: list[dict]
    text_type: PinType
    text_score: float
    gallery_type: PinType | None
    gallery_score: float
    banned_text: float      # the highest probability of any not-allowed text pin
    banned_gallery: float   # the not-allowed share of the gallery vote

    @property
    def banned_score(self) -> float:
        return max(self.banned_text, self.banned_gallery)


def softmax(logits: np.ndarray) -> np.ndarray:
    e = np.exp(logits - logits.max())
    return e / e.sum()


def gallery_vote(embedding: np.ndarray, pins: Pins, k: int, exclude: np.ndarray | None = None) -> dict[int, float]:
    """type index -> its share of the similarity-weighted vote of the k nearest gallery photos.
    [exclude] (calibration only) removes gallery rows, so a train photo never votes for itself."""
    if not len(pins.gallery):
        return {}
    sims = pins.gallery @ embedding
    if exclude is not None and len(exclude):
        sims = sims.copy()
        sims[exclude] = -np.inf
    k = min(k, int(np.isfinite(sims).sum()))
    if k <= 0:
        return {}
    nearest = np.argpartition(-sims, k - 1)[:k]
    weights = np.clip(sims[nearest], 0.0, None)
    total = float(weights.sum())
    if total <= 0:
        return {}
    votes: dict[int, float] = {}
    for t, w in zip(pins.gallery_type[nearest], weights):
        votes[int(t)] = votes.get(int(t), 0.0) + float(w) / total
    return votes


def read(embedding: np.ndarray, pins: Pins, th: Thresholds, exclude: np.ndarray | None = None) -> TypeReading:
    e = _unit(embedding)
    sims = pins.text @ e
    p = softmax(th.text_logit_scale * sims)
    order = np.argsort(-p, kind="stable")
    text_i = int(order[0])
    text_score = float(p[text_i])
    votes = gallery_vote(e, pins, th.gallery_k, exclude)
    if votes:
        gallery_i, gallery_score = max(votes.items(), key=lambda kv: (kv[1], -kv[0]))
    else:
        gallery_i, gallery_score = None, 0.0
    agreement = gallery_i == text_i
    if agreement:
        chosen, confidence = text_i, (text_score + gallery_score) / 2
    elif gallery_i is not None and gallery_score > text_score:
        chosen, confidence = gallery_i, gallery_score * th.disagreement_factor
    else:
        chosen, confidence = text_i, text_score * th.disagreement_factor
    top = [{"qid": pins.types[i].qid, "english_name": pins.types[i].english_name,
            "allowed": pins.types[i].allowed, "score": round(float(p[i]), 4)} for i in order[:th.text_top]]
    banned_text = float(p[pins.not_allowed].max()) if pins.not_allowed.any() else 0.0
    banned_gallery = float(sum(v for t, v in votes.items() if pins.not_allowed[t]))
    return TypeReading(
        type=pins.types[chosen], confidence=float(confidence), agreement=bool(agreement), top_types=top,
        text_type=pins.types[text_i], text_score=text_score,
        gallery_type=pins.types[gallery_i] if gallery_i is not None else None, gallery_score=float(gallery_score),
        banned_text=banned_text, banned_gallery=banned_gallery,
    )
