"""One listing's scan: per-photo scores and the listing's verdict and suggestions.

Works on image embeddings and pixels; model.py makes the embeddings. Nothing here talks to
the network or to Supabase.
"""

from dataclasses import dataclass

import numpy as np

from . import config
from .colors import ColorVotes, color_votes, name_colors
from .quality import Quality, check_photo
from .text import suggest_text
from .verdict import (
    ALLOWED, DETAIL, SUGGEST_MIN, SUPPORT_SLOTS, UNSURE, Decision, PhotoView, Scores,
    decide_listing, decide_photo,
)
from .vocab import Vocab

PATTERN_MIN = 0.70  # the app's PATTERN_CONFIDENCE: a pattern is named at or above this
FABRIC_MIN = 0.60   # a fabric is the title's detail (when there is no pattern) at or above this
STYLE_MIN = 0.50    # a style the model sees is added at or above this
STYLES_MAX = 3      # listings_listing_styles_check
TOP_ITEM_LABELS = 10


@dataclass
class TextBank:
    """Class keys and their unit-length text embeddings (one row per key)."""
    keys: list[str]
    matrix: np.ndarray


def softmax(logits: np.ndarray) -> np.ndarray:
    e = np.exp(logits - logits.max())
    return e / e.sum()


def zero_shot(embedding: np.ndarray, bank: TextBank) -> dict[str, float]:
    p = softmax(config.LOGIT_SCALE * (bank.matrix @ embedding))
    return {k: float(v) for k, v in zip(bank.keys, p)}


def item_scores(embedding: np.ndarray, banks: dict[str, TextBank]) -> Scores:
    """Items and details compete in one softmax, so a size-tag photo isn't forced onto an item."""
    items, details = banks["items"], banks["details"]
    p = softmax(config.LOGIT_SCALE * (np.vstack([items.matrix, details.matrix]) @ embedding))
    n = len(items.keys)
    return Scores(
        items={k: float(v) for k, v in zip(items.keys, p[:n])},
        details={k: float(v) for k, v in zip(details.keys, p[n:])},
        not_fashion=zero_shot(embedding, banks["general"])["not_fashion"],
    )


def unit_mean(embeddings: list[np.ndarray]) -> np.ndarray | None:
    """Several photos of one item, as one embedding."""
    if not embeddings:
        return None
    m = np.mean([e / np.linalg.norm(e) for e in embeddings], axis=0)
    return m / np.linalg.norm(m)


def _r(x: float | None, digits: int = 4) -> float | None:
    return None if x is None else round(float(x), digits)


def _top(probs: dict[str, float], n: int) -> dict[str, float]:
    return {k: _r(v) for k, v in sorted(probs.items(), key=lambda kv: -kv[1])[:n]}


@dataclass
class PhotoResult:
    photo_id: str
    slot: str | None
    error: str | None = None
    embedding: np.ndarray | None = None
    scores: Scores | None = None
    decision: Decision | None = None
    quality: Quality | None = None
    votes: ColorVotes | None = None
    worn: float | None = None
    extra: dict | None = None  # pattern, style and fabric probabilities

    def to_json(self) -> dict:
        if self.error:
            return {"photo_id": self.photo_id, "slot": self.slot, "ok": False, "error": self.error}
        q, d = self.quality, self.decision
        return {
            "photo_id": self.photo_id,
            "slot": self.slot,
            "ok": True,
            "blur_score": _r(q.blur_score),
            "brightness_score": _r(q.brightness_score),
            "framing_score": _r(q.framing_score),
            "worn_by_person": _r(self.worn),
            "checks": {
                "sharp": q.sharp.status, "lighting": q.lighting.status, "whole_item": q.whole_item.status,
                "notes": [q.sharp.note, q.lighting.note, q.whole_item.note],
                "sharpness": _r(q.sharpness, 1), "mean_gray": _r(q.brightness, 1),
            },
            "warnings": q.warnings,
            "decision": d.decision,
            "looks_like": d.item_key,
            "labels": {
                "items": _top(self.scores.items, TOP_ITEM_LABELS),
                "groups": {k: _r(v) for k, v in d.groups.items()},
                "not_fashion": _r(self.scores.not_fashion),
                **{name: {k: _r(v) for k, v in probs.items()} for name, probs in self.extra.items()},
            },
            "fingerprint": [round(float(v), 6) for v in self.embedding],
        }


def analyze_photo(result: PhotoResult, embedding: np.ndarray, rgb: np.ndarray, banks: dict[str, TextBank],
                  vocab: Vocab) -> None:
    result.embedding = embedding
    result.scores = item_scores(embedding, banks)
    result.decision = decide_photo(result.scores, vocab)
    result.quality = check_photo(rgb)
    result.votes = color_votes(rgb, result.quality.region, result.quality.background)
    result.worn = zero_shot(embedding, banks["worn"])["worn"]
    result.extra = {name: zero_shot(embedding, banks[name]) for name in ("patterns", "styles", "fabrics")}


def _suggestions(combined: np.ndarray, whole: list[PhotoResult], banks: dict[str, TextBank], vocab: Vocab,
                 verdict: str) -> dict | None:
    if verdict == "rejected":
        return None
    scores = item_scores(combined, banks)
    allowed = sorted(((k, p) for k, p in scores.items.items() if vocab.by_key[k].allowed), key=lambda kp: -kp[1])
    if not allowed or (verdict != "allowed" and allowed[0][1] < SUGGEST_MIN):
        return None
    item = vocab.by_key[allowed[0][0]]

    votes = ColorVotes.empty()
    for r in whole:
        votes = votes + r.votes
    colors = name_colors(votes)

    patterns = zero_shot(combined, banks["patterns"])
    pattern, pattern_p = max(patterns.items(), key=lambda kv: kv[1])
    pattern = pattern if pattern_p >= PATTERN_MIN else None
    adjective = next((e.adjective for e in vocab.banks["patterns"] if e.key == pattern), None)
    fabrics = zero_shot(combined, banks["fabrics"])
    fabric, fabric_p = max(fabrics.items(), key=lambda kv: kv[1])
    detail = adjective or (fabric if fabric_p >= FABRIC_MIN else None)

    styles = [item.style] if item.style else []
    for style, p in sorted(zero_shot(combined, banks["styles"]).items(), key=lambda kv: -kv[1]):
        if p >= STYLE_MIN and style not in styles:
            styles.append(style)
    title, description = suggest_text(item.key, item.noun, item.item_type, colors, detail)
    return {
        "item_key": item.key,
        "item_label": item.label,
        "category": item.category,
        "item_type": item.item_type,
        "garment_type": item.garment_type,
        "colors": [c for c in colors if c] if item.item_type != "Costume jewelry" else [],
        "pattern": pattern,
        "fabric": fabric if fabric_p >= FABRIC_MIN else None,
        "styles": styles[:STYLES_MAX],
        "title": title,
        "description": description,
        "alternatives": [vocab.by_key[k].label for k, _ in allowed[1:3]],
        "confidence": _r(allowed[0][1]),
    }


def _quality_summary(results: list[PhotoResult]) -> dict:
    scanned = [r for r in results if not r.error]
    flagged = [r for r in scanned if r.quality.warnings]
    warnings = list(dict.fromkeys(w for r in flagged for w in r.quality.warnings))
    if not scanned:
        summary = "No photos could be checked."
    elif not flagged:
        summary = "All photos look good."
    else:
        summary = f"{len(flagged)} of {len(scanned)} photos could be better."
    return {"summary": summary, "photos": len(results), "photos_with_warnings": len(flagged), "warnings": warnings}


def scan(listing_id: str, results: list[PhotoResult], banks: dict[str, TextBank], vocab: Vocab) -> dict:
    """[results] are already analyzed (or carry an error). Returns the /scan response body."""
    views = [PhotoView(r.slot, None if r.error else r.decision) for r in results]
    whole = [r for r in results if not r.error and r.slot not in SUPPORT_SLOTS and r.decision.decision != DETAIL]
    candidates = [r for r in whole if r.decision.decision in (ALLOWED, UNSURE)]
    combined = unit_mean([r.embedding for r in candidates])
    combined_decision = decide_photo(item_scores(combined, banks), vocab) if combined is not None else None
    verdict = decide_listing(views, combined_decision, vocab)
    suggestions = _suggestions(combined, candidates, banks, vocab, verdict.verdict) if combined is not None else None
    return {
        "listing_id": listing_id,
        "verdict": verdict.verdict,
        "reason": verdict.reason,
        "item_key": verdict.item_key,
        "suggestions": suggestions,
        "quality": _quality_summary(results),
        "photos": [r.to_json() for r in results],
        "model": {"id": config.MODEL_ID, "revision": config.MODEL_REVISION, "license": config.MODEL_LICENSE},
        "policy_digest": vocab.digest[:16],
        "service_version": config.SERVICE_VERSION,
    }
