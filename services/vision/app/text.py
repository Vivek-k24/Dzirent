"""Suggested title and description, from a template only (never generated text).

The app's suggestionsFor (ItemRecognition.kt): "<color> <detail> <noun>", for example
"Navy polka-dot shirt" or "Emerald velvet cocktail dress", and a description that adds a
clear second color: "... with red border." for sarees and dupattas, "... with red accents."
otherwise. Jewelry gets no color, because metal reads as yellow or grey and the title shouldn't
suggest gold or silver.
"""

TITLE_MAX = 80  # listings_title_check (every policy noun is at least its minimum of 3)
BORDERED = frozenset({"saree", "dupatta"})
NO_COLOR_ITEM_TYPES = frozenset({"Costume jewelry"})


def title_for(noun: str, color: str | None = None, detail: str | None = None) -> str:
    """"Emerald velvet cocktail dress". A detail already in the noun ("denim jacket") is left out."""
    words = []
    if color:
        words.append(color.lower())
    if detail and detail.lower() not in noun.lower().split():
        words.append(detail.lower())
    words.append(noun)
    title = " ".join(words)
    return (title[:1].upper() + title[1:])[:TITLE_MAX].rstrip()


def suggest_text(
    key: str,
    noun: str,
    item_type: str | None,
    colors: tuple[str | None, str | None],
    detail: str | None = None,
) -> tuple[str, str]:
    """(title, description) for one allowed item."""
    primary, secondary = (None, None) if item_type in NO_COLOR_ITEM_TYPES else colors
    title = title_for(noun, primary, detail)
    extra = ""
    if secondary:
        extra = f" with {secondary.lower()} {'border' if key in BORDERED else 'accents'}"
    return title, f"{title}{extra}."
