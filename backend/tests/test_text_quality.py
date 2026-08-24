import pytest

from app.services.text_quality import MAX_ANSWER_WORDS, validate_answer_text

# The exact junk strings observed in this app's DB before this check existed.
OBSERVED_GIBBERISH = [
    "jssjsjsjs",
    "sssssdd",
    "dfdfdfd",
    "dffffffffd",
    "aaaaaaaaad",
    "xkkkdkdkd",
    "sllsllslsls",
    "akkkaaaaaaaaaaa",
    "ssssssssssssssss",
]


@pytest.mark.parametrize("text", OBSERVED_GIBBERISH)
def test_rejects_observed_gibberish(text):
    with pytest.raises(ValueError):
        validate_answer_text(text)


def test_rejects_multiword_keyboard_mashing():
    with pytest.raises(ValueError):
        validate_answer_text("jkjk jkjk jkjk jkjk")


def test_accepts_real_turkish_sentence():
    validate_answer_text(
        "Müşteri hizmetleri konusunda üç yıllık tecrübem var ve mağazada satış hedeflerine ulaşmak için ekip çalışmasına önem veriyorum."
    )


def test_accepts_short_but_real_answer():
    validate_answer_text("Evet, önceki işimde kasada çalıştım.")


def test_accepts_short_real_answer_with_no_minimum_word_count():
    # No minimum word count — a candidate answering briefly (even a single
    # real word) should not be blocked just for being short.
    validate_answer_text("Evet")
    validate_answer_text("ok evet")


def test_rejects_answer_over_word_limit():
    text = " ".join(["kelime"] * (MAX_ANSWER_WORDS + 1))
    with pytest.raises(ValueError):
        validate_answer_text(text)


def test_accepts_answer_at_word_limit():
    text = " ".join(["kelime"] * MAX_ANSWER_WORDS)
    validate_answer_text(text)


def test_enforce_word_limit_false_accepts_answer_over_word_limit():
    # Voice answers pass enforce_word_limit=False — a candidate speaking
    # freely shouldn't be capped the way a typed answer is.
    text = " ".join(["kelime"] * (MAX_ANSWER_WORDS + 1))
    validate_answer_text(text, enforce_word_limit=False)


def test_enforce_word_limit_false_still_rejects_gibberish():
    with pytest.raises(ValueError):
        validate_answer_text("jkjk jkjk jkjk jkjk", enforce_word_limit=False)
