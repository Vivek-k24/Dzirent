"""What the photos mean for the listing: allowed, rejected or review.

Pure functions over the model's probabilities, so the rules are tested without the model.
The rules, strongest first:
- A photo is "not clothing" only when the item labels and the separate general check agree,
  "not allowed" only when one policy group (all shoes together, for example) clearly wins while
  allowed items are unlikely, and "allowed" only when allowed items take nearly all of the
  probability. Anything in between is "unsure".
- Not-allowed item -> rejected, naming the item. Not clothing -> rejected.
- Allowed only when every photo of the whole piece agrees and the photos together are clearly
  an allowed item. Low confidence or photos that disagree -> review. Unsure is never allowed.
- Content safety (P2A), around those rules: any photo the safety model reads as clear nudity or
  sexual content -> rejected, before anything else; an uncertain one -> review (unless already
  rejected); a photo read as a hooded garment -> review instead of allowed.
- Photo quality never changes the verdict (quality.py only adds warnings), and neither does the
  piece being worn by a person: worn photos are fine and never produce a warning.

V1b adds the type pins (pins.py) on top, when the service has them:
- The banned gate, computed separately from the type: a whole-piece photo (or the photos
  together) with banned_score at or above banned_min -> rejected, always, whatever the type says,
  with the reason of the photo's closest not-allowed policy item. A size tag or close-up that
  reaches it sends the listing to review, as a not-allowed item there always did.
- The rules above still run: clear nudity first, then their rejections (a not-allowed policy item,
  not clothing) and their reviews for a photo that couldn't be opened, no whole piece or photos
  that disagree.
- Allowed now comes from the type: an allowed type, the text and gallery pins agreeing, and
  type confidence at or above type_min_confidence, with every whole-piece photo the same kind of
  thing. Anything else is review. Unsure safety and a hood still turn it into review.
"""

from dataclasses import dataclass

from .pins import Thresholds, TypeReading
from .vocab import NOT_CLOTHING_REASON, Vocab

ALLOWED = "allowed"
NOT_ALLOWED = "not_allowed"
NOT_CLOTHING = "not_clothing"
DETAIL = "detail"  # a size tag or a fabric close-up: says nothing about what the item is
UNSURE = "unsure"

# Per photo (owner to tune; calibrated on the sample listings, see services/vision/README.md).
NOT_CLOTHING_MIN = 0.60          # not-clothing labels add up to this...
GENERAL_NOT_FASHION_MIN = 0.60   # ...and the general check says "not fashion" at least this
DETAIL_MIN = 0.50                # size tag / close-up labels add up to this
NOT_ALLOWED_GROUP_MIN = 0.60     # one not-allowed group (e.g. shoes) adds up to this...
NOT_ALLOWED_ALLOWED_MAX = 0.25   # ...while allowed items add up to no more than this
ALLOWED_MIN = 0.90               # allowed items add up to this...
ALLOWED_OTHER_MAX = 0.08         # ...and not-allowed items, and not-clothing labels, each at most this
LEAN_ALLOWED_MIN = 0.50          # an unsure photo still "leans allowed" at this...
LEAN_OTHER_MAX = 0.25            # ...with not-allowed and not-clothing each below this
SUGGEST_MIN = 0.45               # a review listing still gets suggestions above this top-item probability

# Content safety (P2A; owner to tune, see services/vision/README.md).
NSFW_REJECT_MIN = 0.90           # the safety model is at least this sure of nudity or sexual content: rejected
NSFW_REVIEW_MIN = 0.40           # ...at least this unsure: review
HOODED_MIN = 0.60                # the hooded-garment check reaches this: review, never allowed straight away

# Photos that show a detail, not the whole piece. They can only raise a conflict.
SUPPORT_SLOTS = frozenset({"close_up", "size_tag"})

REASON_ALLOWED = "This looks like {looks_like}. You can list it."
REASON_UNSURE = "We're not sure what this piece is, so someone at Dzirent will check the photos."
REASON_CONFLICT = "The photos seem to show different things, so someone at Dzirent will check them."
REASON_NO_WHOLE_PIECE = "Add a photo that shows the whole piece, so we can check it."
REASON_PHOTO_FAILED = "We couldn't open one of the photos, so someone at Dzirent will check them."
REASON_NOT_ALLOWED_PHOTO = "This photo isn't allowed on Dzirent."
REASON_SAFETY_UNSURE = "Someone at Dzirent will check these photos before this listing can go live."
REASON_HOODED = "This piece has a hood, so someone at Dzirent will check it."
# V1b: the banned gate's reason when the photo has no not-allowed policy item to name.
REASON_BANNED = "This item isn't allowed on Dzirent."
# Names that are plural nouns take no article in "This looks like ...".
_PLURAL_ENDINGS = ("trousers", "pants", "jeans", "shorts", "leggings", "tights", "chinos", "overalls", "pyjamas",
                   "pajamas", "sunglasses", "glasses", "slacks", "breeches", "bottoms", "knickers", "jodhpurs")


def looks_like(name: str) -> str:
    """'a sherwani', 'an abaya', 'palazzo trousers': a type's English name after "This looks like"."""
    n = name.strip()
    if n.lower().endswith(_PLURAL_ENDINGS):
        return n
    return ("an " if n[:1].lower() in "aeiou" else "a ") + n


@dataclass
class Scores:
    """The model's view of one image (or several averaged): one softmax over items and details."""
    items: dict[str, float]
    details: dict[str, float]
    not_fashion: float  # the general check: P("not fashion")

    def total(self, vocab: Vocab, group: str) -> float:
        return sum(p for k, p in self.items.items() if vocab.by_key[k].group == group)

    def top(self, vocab: Vocab, group: str) -> tuple[str | None, float]:
        best = max(((k, p) for k, p in self.items.items() if vocab.by_key[k].group == group),
                   key=lambda kp: kp[1], default=(None, 0.0))
        return best

    def policy_groups(self, vocab: Vocab) -> dict[str, float]:
        """Each not-allowed policy group added up ("hat", "cap" and "cowboy hat" together)."""
        out: dict[str, float] = {}
        for k, p in self.items.items():
            item = vocab.by_key[k]
            if item.group == NOT_ALLOWED:
                out[item.policy_group] = out.get(item.policy_group, 0.0) + p
        return out


@dataclass
class Decision:
    decision: str
    item_key: str | None  # what it looks like (the top item of the deciding group)
    confidence: float
    leans_allowed: bool = False
    groups: dict[str, float] | None = None  # allowed / not_allowed / not_clothing / detail totals


def decide_photo(scores: Scores, vocab: Vocab) -> Decision:
    allowed = scores.total(vocab, ALLOWED)
    banned = scores.total(vocab, NOT_ALLOWED)
    other = scores.total(vocab, NOT_CLOTHING)
    detail = sum(scores.details.values())
    groups = {"allowed": allowed, "not_allowed": banned, "not_clothing": other, "detail": detail}

    if other >= NOT_CLOTHING_MIN and scores.not_fashion >= GENERAL_NOT_FASHION_MIN:
        key, _ = scores.top(vocab, NOT_CLOTHING)
        return Decision(NOT_CLOTHING, key, other, groups=groups)
    if detail >= DETAIL_MIN:
        return Decision(DETAIL, None, detail, groups=groups)
    group_totals = scores.policy_groups(vocab)
    if group_totals:
        group, total = max(group_totals.items(), key=lambda gt: gt[1])
        if total >= NOT_ALLOWED_GROUP_MIN and allowed <= NOT_ALLOWED_ALLOWED_MAX:
            key = max((k for k in scores.items if vocab.by_key[k].policy_group == group
                       and vocab.by_key[k].group == NOT_ALLOWED), key=lambda k: scores.items[k])
            return Decision(NOT_ALLOWED, key, total, groups=groups)
    top_allowed, top_p = scores.top(vocab, ALLOWED)
    if allowed >= ALLOWED_MIN and banned <= ALLOWED_OTHER_MAX and other <= ALLOWED_OTHER_MAX:
        return Decision(ALLOWED, top_allowed, allowed, groups=groups)
    leans = allowed >= LEAN_ALLOWED_MIN and banned < LEAN_OTHER_MAX and other < LEAN_OTHER_MAX
    return Decision(UNSURE, top_allowed, top_p, leans_allowed=leans, groups=groups)


@dataclass
class PhotoView:
    """One photo as the listing verdict sees it. [decision] is None when it couldn't be opened."""
    slot: str | None
    decision: Decision | None
    nsfw: float = 0.0    # the safety model: P(nudity or sexual content)
    hooded: float = 0.0  # the hooded-garment check: P(hooded)
    reading: TypeReading | None = None  # V1b: what the pins say about this photo
    banned_reason: str | None = None    # V1b: the reason the gate gives if this photo fires it


@dataclass
class TypeView:
    """V1b: the listing as the pins see it. [reading] is for the averaged embedding of the
    whole-piece photos (None when there are none)."""
    reading: TypeReading | None
    thresholds: Thresholds
    banned_reason: str | None = None   # the reason for the averaged embedding
    item_key: str | None = None        # the closest allowed policy item (for item_key in the result)


@dataclass
class Verdict:
    verdict: str          # allowed / rejected / review
    reason: str
    item_key: str | None  # the item the reason is about, if any


def is_whole(p: PhotoView) -> bool:
    """A photo of the whole piece: not a size tag or close-up slot, not read as a detail."""
    return p.decision is not None and p.slot not in SUPPORT_SLOTS and p.decision.decision != DETAIL


def decide_listing(photos: list[PhotoView], combined: Decision | None, vocab: Vocab,
                   types: TypeView | None = None) -> Verdict:
    """
    [combined] is decide_photo on the averaged embedding of the whole-piece photos that are
    allowed or unsure (None when there are none). Every photo counts for content safety, size
    tags and close-ups too. [types] (V1b) is the pins' reading; without it the rules are as
    before V1b.
    """
    opened = [p for p in photos if p.decision is not None]
    if any(p.nsfw >= NSFW_REJECT_MIN for p in opened):
        return Verdict("rejected", REASON_NOT_ALLOWED_PHOTO, None)
    gate = banned_gate(photos, types) if types is not None else None
    if gate is not None and gate.verdict == "rejected":
        return gate
    verdict = _decide_item(photos, combined, vocab)
    if verdict.verdict == "rejected":
        return verdict
    if any(p.nsfw >= NSFW_REVIEW_MIN for p in opened):
        return Verdict("review", REASON_SAFETY_UNSURE, None)
    if gate is not None:
        return gate
    if types is not None:
        verdict = _decide_type(photos, verdict, types)
    if verdict.verdict == "allowed" and any(p.hooded >= HOODED_MIN for p in opened):
        return Verdict("review", REASON_HOODED, verdict.item_key)
    return verdict


def banned_gate(photos: list[PhotoView], types: TypeView) -> Verdict | None:
    """V1b: rejected when a whole-piece photo or the photos together reach banned_min; review when
    only a size tag or close-up does; None otherwise."""
    limit = types.thresholds.banned_min
    hits = [(p.reading.banned_score, p.banned_reason) for p in photos
            if is_whole(p) and p.reading is not None and p.reading.banned_score >= limit]
    if types.reading is not None and types.reading.banned_score >= limit:
        hits.append((types.reading.banned_score, types.banned_reason))
    if hits:
        _, reason = max(hits, key=lambda h: h[0])
        return Verdict("rejected", reason or REASON_BANNED, None)
    if any(p.decision is not None and not is_whole(p) and p.reading is not None and p.reading.banned_score >= limit
           for p in photos):
        return Verdict("review", REASON_CONFLICT, None)
    return None


# The pre-V1b reviews that are about the photos themselves, not about what the piece is: they stand.
_PHOTO_REVIEWS = (REASON_PHOTO_FAILED, REASON_NO_WHOLE_PIECE, REASON_CONFLICT)


def _decide_type(photos: list[PhotoView], before: Verdict, types: TypeView) -> Verdict:
    """V1b: allowed only for an allowed type the text and gallery pins agree on, confidently."""
    if before.verdict == "review" and before.reason in _PHOTO_REVIEWS:
        return before
    reading, th = types.reading, types.thresholds
    if (reading is None or reading.type is None or not reading.type.allowed or not reading.agreement
            or reading.confidence < th.type_min_confidence):
        return Verdict("review", REASON_UNSURE, None)
    # A bag in one photo and a dress in another: different things, even when both are allowed.
    kinds = {(p.reading.type.kind, p.reading.type.item_type) for p in photos
             if is_whole(p) and p.reading is not None and p.reading.type is not None}
    if len(kinds) > 1:
        return Verdict("review", REASON_CONFLICT, None)
    return Verdict("allowed", REASON_ALLOWED.format(looks_like=looks_like(reading.type.english_name)),
                   before.item_key or types.item_key)


def _decide_item(photos: list[PhotoView], combined: Decision | None, vocab: Vocab) -> Verdict:
    """What the item is and whether Dzirent lists it (the rules before content safety)."""
    if any(p.decision is None for p in photos):
        return Verdict("review", REASON_PHOTO_FAILED, None)
    whole = [p for p in photos if p.slot not in SUPPORT_SLOTS and p.decision.decision != DETAIL]
    support_banned = [p for p in photos if p.slot in SUPPORT_SLOTS and p.decision.decision == NOT_ALLOWED]
    if not whole:
        return Verdict("review", REASON_NO_WHOLE_PIECE, None)

    def of(kind: str) -> list[Decision]:
        return [p.decision for p in whole if p.decision.decision == kind]

    allowed, banned, other, unsure = of(ALLOWED), of(NOT_ALLOWED), of(NOT_CLOTHING), of(UNSURE)
    if allowed and (banned or other or support_banned):
        return Verdict("review", REASON_CONFLICT, None)
    if banned:
        top = max(banned, key=lambda d: d.confidence)
        return Verdict("rejected", vocab.by_key[top.item_key].reason, top.item_key)
    if other:
        top = max(other, key=lambda d: d.confidence)
        return Verdict("rejected", NOT_CLOTHING_REASON, top.item_key)
    if not allowed or any(not d.leans_allowed for d in unsure):
        return Verdict("review", REASON_UNSURE, None)
    if combined is None or combined.decision != ALLOWED:
        return Verdict("review", REASON_UNSURE, None)
    # A bag in one photo and a dress in another: different things, even though both are allowed.
    kinds = {vocab.by_key[d.item_key].kind for d in allowed}
    item_types = {vocab.by_key[d.item_key].item_type for d in allowed}
    if len(kinds) > 1 or len(item_types) > 1 or vocab.by_key[combined.item_key].kind not in kinds:
        return Verdict("review", REASON_CONFLICT, None)
    item = vocab.by_key[combined.item_key]
    return Verdict("allowed", REASON_ALLOWED.format(looks_like=item.looks_like), item.key)
