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

V2 (v2.1):
- The linear head (app/linear.npz, committed): a logistic-regression layer over the embedding,
  trained on the train split only (data/vision/embed/train_linear.py), gives every type it learned
  a probability. pins.json names its sha256 and its training set's sha256; the service refuses to
  start on a mismatch.
- The final type score is the weighted sum of the text, gallery and linear probabilities
  (weight_text, weight_gallery, weight_linear).
- Decisions are made at the Dzirent level: every score is also summed per mapping (dzirent
  category, garment type, allowed). Agreement means the text pins' top mapping and the gallery
  vote's top mapping are the same; that mapping is chosen, its confidence the final score summed
  over its types. When they differ, the mapping with the highest final score is chosen and its
  confidence multiplied by the disagreement factor. The reported type is the best type (final
  score) inside the chosen mapping; top_types are the 5 best types by the final score.
- banned_score is computed per source as the not-allowed mapping's share (text, gallery, linear)
  and combined by banned_rule (thresholds.json); verdict.py turns it into a two-tier gate.
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
LINEAR_FILE = config.APP_DIR / "linear.npz"  # V2
BANNED_RULES = ("max", "combined")  # V2: how the per-source not-allowed shares make banned_score


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

    @property
    def mapping(self) -> tuple[str, str, bool]:
        """V2: what a listing of this type becomes at Dzirent: (category, garment type, allowed)."""
        return (self.category or "", self.garment_type or "", self.allowed)

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
    # V2
    banned_hard: float
    banned_rule: str
    weight_text: float
    weight_gallery: float
    weight_linear: float
    text_poster_min: float

    @classmethod
    def load(cls, path: Path = THRESHOLDS_FILE) -> "Thresholds":
        raw = json.loads(path.read_text(encoding="utf-8"))
        values = {k: v["value"] for k, v in raw.items() if not k.startswith("_")}
        missing = [f for f in cls.__dataclass_fields__ if f not in values]
        if missing:
            raise ValueError(f"thresholds.json is missing {missing}")
        th = cls(**{f: values[f] for f in cls.__dataclass_fields__})
        for name in ("disagreement_factor", "type_min_confidence", "banned_min", "banned_hard", "weight_text",
                     "weight_gallery", "weight_linear", "text_poster_min"):
            if not 0.0 <= getattr(th, name) <= 1.0:
                raise ValueError(f"thresholds.json: {name} must be between 0 and 1")
        if th.text_top < 1 or th.gallery_k < 1 or th.text_logit_scale <= 0:
            raise ValueError("thresholds.json: text_top, gallery_k and text_logit_scale must be positive")
        if th.banned_min > th.banned_hard:
            raise ValueError("thresholds.json: banned_min can't be above banned_hard")
        if abs(th.weight_text + th.weight_gallery + th.weight_linear - 1.0) > 1e-6:
            raise ValueError("thresholds.json: the three weights must add up to 1")
        if th.banned_rule not in BANNED_RULES:
            raise ValueError(f"thresholds.json: banned_rule must be one of {BANNED_RULES}")
        return th


def _unit(m: np.ndarray) -> np.ndarray:
    m = np.asarray(m, dtype=np.float32)
    norms = np.linalg.norm(m, axis=-1, keepdims=True)
    return m / np.where(norms == 0, 1.0, norms)


@dataclass(eq=False)
class Linear:
    """V2: the linear head. weights (classes, dims) and bias (classes) as stored (float16), used in
    float32; type_index maps each class to its row in Pins.types."""
    weights: np.ndarray
    bias: np.ndarray
    type_index: np.ndarray
    sha256: str = ""
    training_sha256: str = ""

    def __post_init__(self):
        self.weights = np.asarray(self.weights, dtype=np.float32)
        self.bias = np.asarray(self.bias, dtype=np.float32)
        self.type_index = np.asarray(self.type_index, dtype=np.int64)
        if self.weights.shape[0] != len(self.bias) or len(self.bias) != len(self.type_index):
            raise ValueError("the linear head needs one weight row, one bias and one type per class")

    def probabilities(self, embedding: np.ndarray, types: int) -> np.ndarray:
        """P(type) for every type (0 for the types the head never learned)."""
        logits = self.weights @ embedding + self.bias
        p = softmax(logits)
        out = np.zeros(types, dtype=np.float64)
        out[self.type_index] = p
        return out


@dataclass(eq=False)
class Pins:
    version: str
    types: tuple[PinType, ...]
    text: np.ndarray            # (types, dims), unit rows
    gallery: np.ndarray         # (photos, dims), unit rows
    gallery_type: np.ndarray    # (photos,) index into types
    linear: Linear | None = None  # V2
    not_allowed: np.ndarray = field(init=False)
    mappings: tuple[tuple[str, str, bool], ...] = field(init=False)  # V2: every (category, garment type, allowed)
    mapping_of: np.ndarray = field(init=False)                       # V2: (types,) index into mappings

    def __post_init__(self):
        self.text = _unit(self.text)
        self.gallery = _unit(self.gallery) if len(self.gallery) else np.zeros((0, self.text.shape[1]), np.float32)
        self.gallery_type = np.asarray(self.gallery_type, dtype=np.int64)
        self.not_allowed = np.array([not t.allowed for t in self.types], dtype=bool)
        self.mappings = tuple(sorted({t.mapping for t in self.types}, key=lambda m: (not m[2], m[0], m[1])))
        index = {m: i for i, m in enumerate(self.mappings)}
        self.mapping_of = np.array([index[t.mapping] for t in self.types], dtype=np.int64)
        if self.text.shape[0] != len(self.types):
            raise ValueError("one text pin per type")
        if len(self.gallery) != len(self.gallery_type):
            raise ValueError("one type per gallery pin")
        if len(self.gallery_type) and (self.gallery_type.min() < 0 or self.gallery_type.max() >= len(self.types)):
            raise ValueError("a gallery pin names a type that has no text pin")
        if self.linear is not None and len(self.linear.type_index) and (
                self.linear.type_index.min() < 0 or self.linear.type_index.max() >= len(self.types)):
            raise ValueError("a linear head class names a type that has no text pin")

    def by_mapping(self, scores: np.ndarray) -> np.ndarray:
        """Per-type scores summed per mapping."""
        return np.bincount(self.mapping_of, weights=scores, minlength=len(self.mappings))


def _text(value) -> str | None:
    s = str(value)
    return s or None


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def load_linear(linear_file: Path, expected: dict, version: str, index: dict[str, int]) -> Linear:
    """V2: the linear head, checked against pins.json (the file's sha256 and its training set's) and
    the text pins."""
    if "linear_sha256" not in expected or "linear_training_sha256" not in expected:
        raise RuntimeError("pins.json names no linear head; run data/vision/embed/train_linear.py train")
    if not linear_file.exists():
        raise RuntimeError("linear.npz is missing")
    sha = _sha256(linear_file)
    if sha != expected["linear_sha256"]:
        raise RuntimeError("linear.npz isn't the file pins.json names (sha256 differs)")
    data = np.load(linear_file, allow_pickle=False)
    if str(data["training_set_sha256"]) != expected["linear_training_sha256"]:
        raise RuntimeError("linear.npz was trained on another training set than pins.json names")
    if str(data["vocabulary_version"]) != version:
        raise RuntimeError("linear.npz was trained for another vocabulary; train it again")
    unknown = sorted({str(q) for q in data["qid"]} - set(index))
    if unknown:
        raise RuntimeError(f"linear.npz has {len(unknown)} classes without a text pin")
    return Linear(weights=data["weights"], bias=data["bias"], type_index=np.array([index[str(q)] for q in data["qid"]]),
                  sha256=sha, training_sha256=str(data["training_set_sha256"]))


def load(vocabulary_file: Path = VOCABULARY_PINS_FILE, gallery_file: Path = GALLERY_PINS_FILE,
         pins_file: Path = PINS_FILE, linear_file: Path = LINEAR_FILE) -> Pins:
    """The pin files and the linear head, checked against pins.json and each other. Runs once, at start-up."""
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
                gallery_type=np.array([index[str(q)] for q in gallery["qid"]]),
                linear=load_linear(linear_file, expected, version, index))


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
    banned_text: float      # V2: the not-allowed mapping's share of the text probabilities
    banned_gallery: float   # the not-allowed share of the gallery vote
    # V2
    banned_linear: float = 0.0           # the not-allowed share of the linear head's probabilities
    banned_score: float = 0.0            # the three combined by banned_rule
    mapping: tuple[str, str, bool] | None = None  # the chosen (category, garment type, allowed)
    mapping_score: float = 0.0           # the final score summed over the chosen mapping's types
    type_score: float = 0.0              # the reported type's own final score
    text_mapping: tuple[str, str, bool] | None = None
    gallery_mapping: tuple[str, str, bool] | None = None
    linear_type: PinType | None = None
    linear_score: float = 0.0


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


def _first_max(a: np.ndarray) -> int:
    return int(np.argmax(a))  # ties go to the lower index: deterministic


def combine_banned(text: float, gallery: float, linear: float, th: Thresholds) -> float:
    """V2: banned_score from the three sources' not-allowed shares. max: the most alarmed source;
    combined: the final score's not-allowed share (the same weights as the type)."""
    if th.banned_rule == "max":
        return max(text, gallery, linear)
    return th.weight_text * text + th.weight_gallery * gallery + th.weight_linear * linear


def read(embedding: np.ndarray, pins: Pins, th: Thresholds, exclude: np.ndarray | None = None,
         linear_probs: np.ndarray | None = None) -> TypeReading:
    """[exclude] (calibration only) leaves gallery rows out; [linear_probs] (calibration only)
    replaces the linear head's probabilities with ones from a head that never saw this photo."""
    e = _unit(embedding)
    n = len(pins.types)
    p_text = softmax(th.text_logit_scale * (pins.text @ e))
    votes = gallery_vote(e, pins, th.gallery_k, exclude)
    p_gallery = np.zeros(n)
    for t, v in votes.items():
        p_gallery[t] = v
    if linear_probs is not None:
        p_linear = np.asarray(linear_probs, dtype=np.float64)
    elif pins.linear is not None:
        p_linear = pins.linear.probabilities(e, n)
    else:
        p_linear = np.zeros(n)
    final = th.weight_text * p_text + th.weight_gallery * p_gallery + th.weight_linear * p_linear

    m_text, m_gallery, m_final = pins.by_mapping(p_text), pins.by_mapping(p_gallery), pins.by_mapping(final)
    text_m = _first_max(m_text)
    gallery_m = _first_max(m_gallery) if votes else None
    agreement = gallery_m == text_m
    if agreement:
        chosen_m, confidence = text_m, float(m_final[text_m])
    else:
        chosen_m = _first_max(m_final)
        confidence = float(m_final[chosen_m]) * th.disagreement_factor
    inside = np.flatnonzero(pins.mapping_of == chosen_m)
    chosen = int(inside[_first_max(final[inside])])

    text_i = _first_max(p_text)
    gallery_i = max(votes.items(), key=lambda kv: (kv[1], -kv[0]))[0] if votes else None
    linear_i = _first_max(p_linear) if p_linear.any() else None
    order = np.argsort(-final, kind="stable")
    top = [{"qid": pins.types[i].qid, "english_name": pins.types[i].english_name,
            "allowed": pins.types[i].allowed, "score": round(float(final[i]), 4)} for i in order[:th.text_top]]
    na = pins.not_allowed
    banned_text = float(p_text[na].sum())
    banned_gallery = float(p_gallery[na].sum())
    banned_linear = float(p_linear[na].sum())
    return TypeReading(
        type=pins.types[chosen], confidence=confidence, agreement=bool(agreement), top_types=top,
        text_type=pins.types[text_i], text_score=float(p_text[text_i]),
        gallery_type=pins.types[gallery_i] if gallery_i is not None else None,
        gallery_score=float(votes[gallery_i]) if gallery_i is not None else 0.0,
        banned_text=banned_text, banned_gallery=banned_gallery, banned_linear=banned_linear,
        banned_score=combine_banned(banned_text, banned_gallery, banned_linear, th),
        mapping=pins.mappings[chosen_m], mapping_score=float(m_final[chosen_m]), type_score=float(final[chosen]),
        text_mapping=pins.mappings[text_m], gallery_mapping=pins.mappings[gallery_m] if gallery_m is not None else None,
        linear_type=pins.types[linear_i] if linear_i is not None else None,
        linear_score=float(p_linear[linear_i]) if linear_i is not None else 0.0,
    )
