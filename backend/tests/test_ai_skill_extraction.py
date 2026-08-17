import json

from app.services.ai.local_llm import LocalOllamaProvider


def _provider_with_chat_response(mocker, payload: dict) -> LocalOllamaProvider:
    provider = LocalOllamaProvider.__new__(LocalOllamaProvider)
    mocker.patch.object(provider, "_chat", return_value=json.dumps(payload))
    return provider


def test_extract_skills_drops_non_latin_turkish_names(mocker):
    provider = _provider_with_chat_response(
        mocker,
        {"skills": ["Müşteri hizmetleri", "Veri tabanı管理工作经验", "C#", "SQL Server", "経験あり"]},
    )

    skills = provider.extract_skills("cv text", "job description")

    assert skills == ["Müşteri hizmetleri", "C#", "SQL Server"]


def test_extract_skills_allows_turkish_and_common_punctuation(mocker):
    provider = _provider_with_chat_response(
        mocker,
        {"skills": ["Dil yetkinliği (İngilizce)", "İş analizi", "C++", ".NET", "Takım liderliği"]},
    )

    skills = provider.extract_skills("cv text", "job description")

    assert skills == ["Dil yetkinliği (İngilizce)", "İş analizi", "C++", ".NET", "Takım liderliği"]


def test_generate_evaluation_criteria_accepts_flat_string_list(mocker):
    provider = _provider_with_chat_response(
        mocker, {"criteria": ["Kasada hızlı ve doğru işlem yapabilme", "Stresli anlarda sakin kalma"]}
    )

    criteria = provider.generate_evaluation_criteria("Kasiyer", "job description", "")

    assert criteria == ["Kasada hızlı ve doğru işlem yapabilme", "Stresli anlarda sakin kalma"]


def test_generate_evaluation_criteria_flattens_object_shape(mocker):
    # Real observed behavior from the local model (qwen2.5:7b): it often
    # ignores the "flat string" instruction and returns
    # {criterion_name, description} objects instead — a strict
    # isinstance(str) filter would silently drop every criterion.
    provider = _provider_with_chat_response(
        mocker,
        {
            "criteria": [
                {
                    "criterion_name": "Envanter Yönetimi ve Kontrol Deneyimleri",
                    "description": "Adayların mevcut envanter yönetimi uygulamalarını nasıl yönettiğini değerlendir.",
                },
                {"title": "Sadece başlık"},
                {"description": "Sadece açıklama"},
                {"unrelated_key": "değer"},
                "Düz metin kriteri",
            ]
        },
    )

    criteria = provider.generate_evaluation_criteria("Depo Elemanı", "job description", "")

    assert criteria == [
        "Envanter Yönetimi ve Kontrol Deneyimleri: Adayların mevcut envanter yönetimi uygulamalarını nasıl yönettiğini değerlendir.",
        "Sadece başlık",
        "Sadece açıklama",
        "Düz metin kriteri",
    ]


def test_generate_evaluation_criteria_caps_at_eight(mocker):
    provider = _provider_with_chat_response(mocker, {"criteria": [f"Kriter {i}" for i in range(12)]})

    criteria = provider.generate_evaluation_criteria("Kasiyer", "job description", "")

    assert len(criteria) == 8
