import re

from .errors import Detail, field_error

CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
SINGLE_LINE_CONTROL = re.compile(r"[\x00-\x1f\x7f]")


def clean_text(
    value: str, field: str, max_length: int, errors: list[Detail], *, multiline: bool = False
) -> str:
    text = value.strip()
    if not text:
        errors.append(field_error(field, "blank", "Must not be blank."))
    elif len(text) > max_length:
        errors.append(field_error(field, "too_long", f"Must be at most {max_length} characters."))
    elif (CONTROL if multiline else SINGLE_LINE_CONTROL).search(text):
        errors.append(field_error(field, "control_characters", "Contains control characters."))
    return text
