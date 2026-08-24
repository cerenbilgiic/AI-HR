import json

from app.services.ai.local_llm import (
    LocalOllamaProvider,
    _clean_evidence_text,
    _CompetencyScoresModel,
    _EvidenceExtractionModel,
    _EvidenceItemModel,
    _ReportSynthesisModel,
    _ScoringModel,
)

EXTRACTION = _EvidenceExtractionModel(
    evidence=[_EvidenceItemModel(competency="communication", evidence="Explained the process clearly.")]
)
SCORING = _ScoringModel(
    competency_scores=_CompetencyScoresModel(
        communication=80,
        technical_competency=70,
        problem_solving=75,
        teamwork=82,
        customer_service=85,
        role_fit=77,
    )
)
SYNTHESIS = _ReportSynthesisModel(
    recommendation="recommended",
    strengths=["Strong customer focus"],
    development_areas=["Could elaborate more on stock management"],
    summary="Solid retail experience overall.",
)

CALL_KWARGS = {
    "job_description": "Sales Associate role",
    "required_skills": "Customer service, POS",
    "candidate_profile": "Ad Soyad: Test Candidate",
    "candidate_cv": "Two years of retail experience.",
    "questions_and_answers": "S1: Tell us about yourself?\nC1: I have two years of experience.",
    "answer_evaluations": "Bu mülakat için önceki bir yapay zekâ değerlendirmesi bulunmuyor.",
    "evaluation_criteria": "",
}


def _provider_with_stages(mocker) -> LocalOllamaProvider:
    provider = LocalOllamaProvider.__new__(LocalOllamaProvider)
    mocker.patch.object(provider, "_chat_structured", side_effect=[EXTRACTION, SCORING, SYNTHESIS])
    return provider


def test_generate_final_report_merges_the_three_stages(mocker):
    provider = _provider_with_stages(mocker)

    result = provider.generate_final_report(**CALL_KWARGS)

    assert result == {
        "recommendation": "recommended",
        "competency_scores": {
            "communication": 80,
            "technical_competency": 70,
            "problem_solving": 75,
            "teamwork": 82,
            "customer_service": 85,
            "role_fit": 77,
        },
        "strengths": ["Strong customer focus"],
        "development_areas": ["Could elaborate more on stock management"],
        "summary": "Solid retail experience overall.",
        "evidence": [{"competency": "communication", "evidence": "Explained the process clearly."}],
    }


def test_generate_final_report_never_asks_for_overall_score(mocker):
    provider = _provider_with_stages(mocker)

    result = provider.generate_final_report(**CALL_KWARGS)

    assert "overall_score" not in result


def test_extraction_stage_is_called_with_the_expected_schema_and_qa(mocker):
    provider = _provider_with_stages(mocker)

    provider.generate_final_report(**CALL_KWARGS)

    call = provider._chat_structured.call_args_list[0]
    prompt, schema = call.args
    assert schema is _EvidenceExtractionModel
    assert CALL_KWARGS["questions_and_answers"] in prompt
    # Evaluation is interview-answers-only — the model is never shown the
    # CV/profile at all (see the module comment above
    # EVIDENCE_EXTRACTION_PROMPT in prompts.py: telling it "don't use this
    # as evidence" wasn't reliable enough, it still leaked CV text into
    # evidence in practice).
    assert CALL_KWARGS["candidate_cv"] not in prompt
    assert CALL_KWARGS["candidate_profile"] not in prompt


def test_scoring_stage_receives_extracted_evidence_not_cv(mocker):
    provider = _provider_with_stages(mocker)

    provider.generate_final_report(**CALL_KWARGS)

    call = provider._chat_structured.call_args_list[1]
    prompt, schema = call.args
    assert schema is _ScoringModel
    evidence_json = json.dumps([item.model_dump() for item in EXTRACTION.evidence], ensure_ascii=False)
    assert evidence_json in prompt
    assert CALL_KWARGS["candidate_cv"] not in prompt
    assert CALL_KWARGS["candidate_profile"] not in prompt


def test_synthesis_stage_receives_evidence_and_scores_not_cv(mocker):
    provider = _provider_with_stages(mocker)

    provider.generate_final_report(**CALL_KWARGS)

    call = provider._chat_structured.call_args_list[2]
    prompt, schema = call.args
    assert schema is _ReportSynthesisModel
    evidence_json = json.dumps([item.model_dump() for item in EXTRACTION.evidence], ensure_ascii=False)
    scores_json = json.dumps(SCORING.competency_scores.model_dump(), ensure_ascii=False)
    assert evidence_json in prompt
    assert scores_json in prompt
    assert CALL_KWARGS["candidate_cv"] not in prompt
    assert CALL_KWARGS["candidate_profile"] not in prompt


def test_clean_evidence_text_strips_qa_label():
    assert (
        _clean_evidence_text("C4: Bir kampanyanın doğru uygulanmadığını fark etti.")
        == "Bir kampanyanın doğru uygulanmadığını fark etti."
    )


def test_clean_evidence_text_strips_label_with_cevabi_word():
    assert _clean_evidence_text("S2 cevabı C4: Fiyat hatasını yöneticisine bildirdi.") == "Fiyat hatasını yöneticisine bildirdi."


def test_clean_evidence_text_keeps_only_first_block():
    text = "C2: Sessizce çözüm sunar.\n\nC3: Yavaşlar ve kontrol eder."
    assert _clean_evidence_text(text) == "Sessizce çözüm sunar."


def test_clean_evidence_text_strips_wrapping_quotes():
    text = '"Sessizce başka bir ödeme yöntemi teklif eder."'
    assert _clean_evidence_text(text) == "Sessizce başka bir ödeme yöntemi teklif eder."


def test_clean_evidence_text_strips_label_restating_the_question():
    # Real observed shape: the model restates the question label mid-string
    # rather than only labeling its own answer.
    text = '"S2: Bir müşterinin kartı reddedilirse ne yaparsınız? C2: Sessizce başka bir yöntem teklif ederim."'
    assert (
        _clean_evidence_text(text)
        == "Bir müşterinin kartı reddedilirse ne yaparsınız? Sessizce başka bir yöntem teklif ederim."
    )


def test_clean_evidence_text_keeps_only_first_line_when_stacked():
    text = '"Sakin kalırım."\nC2: "Yardım isterim."\nC4: "Standart süreci takip ederim."'
    assert _clean_evidence_text(text) == "Sakin kalırım."


def test_clean_evidence_text_leaves_clean_sentence_unchanged():
    assert _clean_evidence_text("Sakin bir tutum sergiledi.") == "Sakin bir tutum sergiledi."


def test_generate_final_report_cleans_evidence_before_downstream_stages(mocker):
    dirty_extraction = _EvidenceExtractionModel(
        evidence=[
            _EvidenceItemModel(competency="communication", evidence="C1: Sakin bir tutum sergiledi."),
            _EvidenceItemModel(
                competency="teamwork", evidence="C2: Yardım istedi.\n\nC3: Ayrıca stok kontrolü yaptı."
            ),
        ]
    )
    provider = LocalOllamaProvider.__new__(LocalOllamaProvider)
    mocker.patch.object(provider, "_chat_structured", side_effect=[dirty_extraction, SCORING, SYNTHESIS])

    result = provider.generate_final_report(**CALL_KWARGS)

    assert result["evidence"] == [
        {"competency": "communication", "evidence": "Sakin bir tutum sergiledi."},
        {"competency": "teamwork", "evidence": "Yardım istedi."},
    ]
    scoring_prompt = provider._chat_structured.call_args_list[1].args[0]
    assert "C1:" not in scoring_prompt
    assert "Sakin bir tutum sergiledi." in scoring_prompt


def test_evaluation_criteria_defaults_when_blank(mocker):
    provider = _provider_with_stages(mocker)

    provider.generate_final_report(**{**CALL_KWARGS, "evaluation_criteria": ""})

    extraction_prompt = provider._chat_structured.call_args_list[0].args[0]
    scoring_prompt = provider._chat_structured.call_args_list[1].args[0]
    assert "genel yetkinlik çerçevesini kullan" in extraction_prompt
    assert "genel yetkinlik çerçevesini kullan" in scoring_prompt


def test_evaluation_criteria_passed_through_when_set(mocker):
    provider = _provider_with_stages(mocker)

    provider.generate_final_report(**{**CALL_KWARGS, "evaluation_criteria": "- Kasada hızlı işlem"})

    extraction_prompt = provider._chat_structured.call_args_list[0].args[0]
    assert "- Kasada hızlı işlem" in extraction_prompt
