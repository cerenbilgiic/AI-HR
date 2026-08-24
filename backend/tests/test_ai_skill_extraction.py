from app.services.ai.local_llm import LocalOllamaProvider, _CriteriaModel, _SkillsModel


def _provider_with_structured_response(mocker, model_instance) -> LocalOllamaProvider:
    provider = LocalOllamaProvider.__new__(LocalOllamaProvider)
    # extract_skills/generate_evaluation_criteria call self._chat_structured
    # (Ollama's schema-constrained JSON mode, see local_llm.py) rather than
    # the free-text self._chat — mock at that level instead.
    mocker.patch.object(provider, "_chat_structured", return_value=model_instance)
    return provider


def test_extract_skills_drops_non_latin_turkish_names(mocker):
    provider = _provider_with_structured_response(
        mocker,
        _SkillsModel(skills=["Müşteri hizmetleri", "Veri tabanı管理工作经验", "C#", "SQL Server", "経験あり"]),
    )

    skills = provider.extract_skills("cv text", "job description")

    assert skills == ["Müşteri hizmetleri", "C#", "SQL Server"]


def test_extract_skills_allows_turkish_and_common_punctuation(mocker):
    provider = _provider_with_structured_response(
        mocker,
        _SkillsModel(skills=["Dil yetkinliği (İngilizce)", "İş analizi", "C++", ".NET", "Takım liderliği"]),
    )

    skills = provider.extract_skills("cv text", "job description")

    assert skills == ["Dil yetkinliği (İngilizce)", "İş analizi", "C++", ".NET", "Takım liderliği"]


def test_generate_evaluation_criteria_accepts_flat_string_list(mocker):
    provider = _provider_with_structured_response(
        mocker,
        _CriteriaModel(criteria=["Kasada hızlı ve doğru işlem yapabilme", "Stresli anlarda sakin kalma"]),
    )

    criteria = provider.generate_evaluation_criteria("Kasiyer", "job description", "")

    assert criteria == ["Kasada hızlı ve doğru işlem yapabilme", "Stresli anlarda sakin kalma"]


def test_generate_evaluation_criteria_caps_at_eight(mocker):
    provider = _provider_with_structured_response(
        mocker, _CriteriaModel(criteria=[f"Kriter {i}" for i in range(12)])
    )

    criteria = provider.generate_evaluation_criteria("Kasiyer", "job description", "")

    assert len(criteria) == 8


def test_generate_evaluation_criteria_drops_non_turkish_script(mocker):
    # Regression: the model occasionally breaks character mid-criterion and
    # produces a Chinese conversational reply instead of an actual
    # criterion — schema-constrained JSON guarantees the right shape
    # (a string in the list) but not that its content is real Turkish.
    provider = _provider_with_structured_response(
        mocker,
        _CriteriaModel(
            criteria=[
                "Kasada hızlı ve doğru işlem yapabilme",
                "AI modellerinin performansını监控中，暂无结果。您希望我如何继续？",
            ]
        ),
    )

    criteria = provider.generate_evaluation_criteria("Kasiyer", "job description", "")

    assert criteria == ["Kasada hızlı ve doğru işlem yapabilme"]
