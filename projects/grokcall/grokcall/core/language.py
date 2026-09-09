import re
from typing import Optional

SWEDISH_INDICATORS = {
    "hej", "tjena", "hallå", "tack", "snälla", "patrik", "ring", "ringa",
    "senare", "idag", "imorgon", "efter", "före", "möte", "mötet", "projektet",
    "kan", "vill", "lämna", "meddelande", "nej", "ja", "okej", "bra",
    "hur", "mår", "du", "är", "det", "jag", "inte", "nu", "vi", "på"
}

ENGLISH_INDICATORS = {
    "hi", "hello", "hey", "thanks", "thank", "please", "call", "later",
    "today", "tomorrow", "after", "before", "meeting", "project", "can",
    "would", "like", "leave", "message", "no", "yes", "okay", "good",
    "how", "are", "you", "is", "it", "i", "not", "now", "we", "on", "at"
}


_LANGUAGE_ALIASES = {
    "swe": "sv", "swedish": "sv", "sv-se": "sv",
    "eng": "en", "english": "en", "en-us": "en", "en-gb": "en",
}


def normalize_language(code: Optional[str]) -> Optional[str]:
    """Map provider language codes (ISO 639-3, BCP-47, names) onto the two-letter
    codes the rest of the system uses. Unknown codes are passed through lower-cased.
    """
    if not code:
        return None
    lowered = code.strip().lower()
    if lowered in _LANGUAGE_ALIASES:
        return _LANGUAGE_ALIASES[lowered]
    if "-" in lowered:
        lowered = lowered.split("-", 1)[0]
    return lowered or None


def detect_language(text: str, default: str = "sv") -> str:
    """Heuristic language detection between Swedish ('sv') and English ('en').

    Defaults to 'sv' when ambiguous or when no clear English terms dominate.
    """
    if not text:
        return default

    # Tokenize words
    words = re.findall(r"\b[a-zA-ZåäöÅÄÖ]+\b", text.lower())
    if not words:
        return default

    sv_score = sum(1 for w in words if w in SWEDISH_INDICATORS)
    en_score = sum(1 for w in words if w in ENGLISH_INDICATORS)

    # Detect Swedish-specific characters
    if any(c in text.lower() for c in ("å", "ä", "ö")):
        sv_score += 3

    if en_score > sv_score and en_score >= 1:
        return "en"
    elif sv_score > 0:
        return "sv"

    return default
