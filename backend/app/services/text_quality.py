"""Rule-based sanity checks for candidate free-text answers.

Deliberately not AI-based: running this per answer submission needs to stay
near-instant, since the interview flow was just changed specifically to
avoid any AI call between questions (see interview_service.create_session's
docstring). This only catches obvious keyboard-mashing junk, not a general
quality/profanity filter.
"""

MAX_ANSWER_WORDS = 500
_VOWELS = set("aeıioöuüAEIİOÖUÜ")


def _looks_like_gibberish_token(token: str) -> bool:
    letters = [c for c in token if c.isalpha()]
    if len(letters) < 4:
        return False
    if not any(c in _VOWELS for c in letters):
        return True
    return len(set(c.lower() for c in letters)) / len(letters) < 0.35


def validate_answer_text(text: str) -> None:
    """Raises ValueError with a human-readable reason if `text` shouldn't be
    accepted as an interview answer. Callers should only invoke this for
    non-blank text — an empty answer (e.g. the candidate ran out of time)
    is a separate, legitimate case handled by the caller, not by this check.
    """
    words = text.split()
    if len(words) > MAX_ANSWER_WORDS:
        raise ValueError(f"Answers are limited to {MAX_ANSWER_WORDS} words.")

    long_tokens = [w for w in words if len(w) >= 4]
    if long_tokens:
        gibberish_count = sum(1 for w in long_tokens if _looks_like_gibberish_token(w))
        if gibberish_count / len(long_tokens) >= 0.5:
            raise ValueError("This doesn't look like a real answer. Please rewrite it.")
