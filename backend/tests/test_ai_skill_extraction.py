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
