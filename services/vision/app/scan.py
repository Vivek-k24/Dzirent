"""One listing's scan: per-photo scores and the listing's verdict and suggestions.

Works on image embeddings and pixels; model.py makes the embeddings. Nothing here talks to
the network or to Supabase.
"""

from dataclasses import dataclass

import numpy as np

from . import config
from . import pins as type_pins
from .color_reader import ColorBank, PhotoColors, read_listing, read_photo
from .pins import Pins, Thresholds, TypeReading
from .quality import Quality, check_photo
from .text import suggest_text
from .verdict import (
    ALLOWED, DETAIL, NOT_ALLOWED, SUGGEST_MIN, SUPPORT_SLOTS, UNSURE, Decision, PhotoView, Scores, TypeView,
    decide_listing, decide_photo,
)
from .vocab import APP_GARMENT_TYPES, Vocab

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
    colors: PhotoColors | None = None  # the garment's pixels after the light correction (color_reader)
    worn: float | None = None    # recorded only: being worn never changes the verdict or adds a warning
    hooded: float | None = None  # the hooded-garment check (verdict.HOODED_MIN)
    nsfw: float | None = None    # the safety model (verdict.NSFW_*)
    extra: dict | None = None  # pattern, style and fabric probabilities
    reading: TypeReading | None = None  # V1b: what the type pins say (pins.read)

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
                "hooded": _r(self.hooded),
                "safety": {"nsfw": _r(self.nsfw)},
                **{name: {k: _r(v) for k, v in probs.items()} for name, probs in self.extra.items()},
                **({"pins": _reading_json(self.reading)} if self.reading is not None else {}),
            },
            "fingerprint": [round(float(v), 6) for v in self.embedding],
        }


def _reading_json(r: TypeReading) -> dict:
    """One photo's pin reading, as it is kept with the photo's labels."""
    return {"type": r.type.qid if r.type else None, "type_confidence": _r(r.confidence), "agreement": r.agreement,
            "text": {"qid": r.text_type.qid, "score": _r(r.text_score)},
            "gallery": {"qid": r.gallery_type.qid if r.gallery_type else None, "score": _r(r.gallery_score)},
            "banned_score": _r(r.banned_score)}


def banned_reason(scores: Scores, vocab: Vocab) -> str | None:
    """The reason of the closest not-allowed policy item: what the banned gate tells the lender."""
    key, _ = scores.top(vocab, NOT_ALLOWED)
    return vocab.by_key[key].reason if key else None


def analyze_photo(result: PhotoResult, embedding: np.ndarray, rgb: np.ndarray | None, banks: dict[str, TextBank],
                  vocab: Vocab, nsfw: float = 0.0, pins: Pins | None = None,
                  thresholds: Thresholds | None = None) -> None:
    """[rgb] None skips the photo-quality and color checks (the local eval reads verdicts only)."""
    result.embedding = embedding
    result.scores = item_scores(embedding, banks)
    result.decision = decide_photo(result.scores, vocab)
    if rgb is not None:
        result.quality = check_photo(rgb)
        result.colors = read_photo(rgb, result.quality.region)
    result.worn = zero_shot(embedding, banks["worn"])["worn"]
    result.hooded = zero_shot(embedding, banks["hooded"])["hooded"]
    result.nsfw = nsfw
    result.extra = {name: zero_shot(embedding, banks[name]) for name in ("patterns", "styles", "fabrics")}
    if pins is not None and thresholds is not None:
        result.reading = type_pins.read(embedding, pins, thresholds)


def _suggestions(combined: np.ndarray, whole: list[PhotoResult], banks: dict[str, TextBank], vocab: Vocab,
                 verdict: str, color_bank: ColorBank | None = None) -> dict | None:
    if verdict == "rejected":
        return None
    scores = item_scores(combined, banks)
    allowed = sorted(((k, p) for k, p in scores.items.items() if vocab.by_key[k].allowed), key=lambda kp: -kp[1])
    if not allowed or (verdict != "allowed" and allowed[0][1] < SUGGEST_MIN):
        return None
    item = vocab.by_key[allowed[0][0]]

    # V1a: the garment's pixels name the colors; the model gives a second opinion (color_reader).
    reading = read_listing([r.colors for r in whole], combined, color_bank)
    colors = reading.colors
    jewelry = item.item_type == "Costume jewelry"

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
        # V1b: costume is a database value the apps' garment kinds don't list yet; the apps get
        # none for it (the response's "type" carries it).
        "garment_type": item.garment_type if item.garment_type in APP_GARMENT_TYPES else None,
        "colors": [c for c in colors if c] if not jewelry else [],
        # How sure the colors are: 0.9 the model agrees, 0.7 it settled a near tie, 0.6 pixels
        # only, 0.4 it disagreed (the pixel answer stays). Null when there are no colors.
        "color_confidence": reading.confidence if not jewelry and colors[0] else None,
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


def listing_verdict(results: list[PhotoResult], banks: dict[str, TextBank], vocab: Vocab,
                    pins: Pins | None = None, thresholds: Thresholds | None = None) -> dict:
    """The verdict and the V1b type fields for analyzed photos (scan() adds the rest). The local
    eval (eval/run_eval.py --local) calls this directly, so it judges exactly what /scan judges."""
    views = [PhotoView(r.slot, None if r.error else r.decision, nsfw=r.nsfw or 0.0, hooded=r.hooded or 0.0,
                       reading=None if r.error else r.reading,
                       banned_reason=None if r.error else banned_reason(r.scores, vocab))
             for r in results]
    whole = [r for r in results if not r.error and r.slot not in SUPPORT_SLOTS and r.decision.decision != DETAIL]
    candidates = [r for r in whole if r.decision.decision in (ALLOWED, UNSURE)]
    combined = unit_mean([r.embedding for r in candidates])
    combined_decision = decide_photo(item_scores(combined, banks), vocab) if combined is not None else None
    types = None
    reading = None
    if pins is not None and thresholds is not None:
        # The listing's type: all its whole-piece photos together, whatever the policy check said.
        together = unit_mean([r.embedding for r in whole])
        reading = type_pins.read(together, pins, thresholds) if together is not None else None
        types = TypeView(reading=reading, thresholds=thresholds,
                         banned_reason=banned_reason(item_scores(together, banks), vocab) if together is not None else None,
                         item_key=combined_decision.item_key if combined_decision else None)
    verdict = decide_listing(views, combined_decision, vocab, types)
    readings = [r.reading for r in results if not r.error and r.reading is not None] + ([reading] if reading else [])
    return {
        "verdict": verdict, "combined": combined, "candidates": candidates,
        "type": reading.type.to_json() if reading and reading.type else None,
        "type_confidence": _r(reading.confidence) if reading else None,
        "agreement": bool(reading.agreement) if reading else False,
        "top_types": reading.top_types if reading else [],
        "banned_score": _r(max(r.banned_score for r in readings)) if readings else None,
        "vocabulary_version": pins.version if pins is not None else None,
    }


def scan(listing_id: str, results: list[PhotoResult], banks: dict[str, TextBank], vocab: Vocab,
         color_bank: ColorBank | None = None, pins: Pins | None = None, thresholds: Thresholds | None = None) -> dict:
    """[results] are already analyzed (or carry an error). Returns the /scan response body.
    [color_bank] is the model's color names (the colors' second opinion); without it, pixels only.
    [pins] and [thresholds] (V1b) add the type, its confidence and the banned gate."""
    decided = listing_verdict(results, banks, vocab, pins, thresholds)
    verdict, combined, candidates = decided["verdict"], decided["combined"], decided["candidates"]
    suggestions = _suggestions(combined, candidates, banks, vocab, verdict.verdict, color_bank) \
        if combined is not None else None
    return {
        "listing_id": listing_id,
        "verdict": verdict.verdict,
        "reason": verdict.reason,
        "item_key": verdict.item_key,
        "suggestions": suggestions,
        "quality": _quality_summary(results),
        "photos": [r.to_json() for r in results],
        "model": {"id": config.MODEL_ID, "revision": config.MODEL_REVISION, "license": config.MODEL_LICENSE},
        "safety_model": {"id": config.SAFETY_MODEL_ID, "revision": config.SAFETY_MODEL_REVISION,
                         "license": config.SAFETY_MODEL_LICENSE},
        "policy_digest": vocab.digest[:16],
        "service_version": config.SERVICE_VERSION,
        # V1b: the type the pins read for the whole-piece photos together.
        "type": decided["type"],
        "type_confidence": decided["type_confidence"],
        "agreement": decided["agreement"],
        "top_types": decided["top_types"],
        "banned_score": decided["banned_score"],
        "vocabulary_version": decided["vocabulary_version"],
    }
