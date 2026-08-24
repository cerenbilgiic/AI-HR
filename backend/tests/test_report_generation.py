from unittest.mock import MagicMock

import pytest

from app.models.ai_evaluation import AIEvaluation
from app.models.ai_score import InterviewReport
from app.models.interview import CandidateAnswer, InterviewQuestion, InterviewSession
from app.schemas.report import CompetencyScores
from app.services import report_service
from app.services.ai.base import AIResponseError

# Realistic scenario: Sales Associate candidate with 2 years of retail
# experience, 5 questions / 5 answers (matches the scope this stage was
# specified against).
QUESTIONS = [
    "Perakende satış deneyiminizden bahseder misiniz?",
    "Zor bir müşteriyle nasıl başa çıkarsınız?",
    "Takım çalışmasına dair bir örnek verebilir misiniz?",
    "Satış hedeflerine ulaşmak için nasıl bir strateji izlersiniz?",
    "Stok yönetimi konusunda deneyiminiz var mı?",
]
ANSWERS = [
    "İki yıldır bir giyim mağazasında satış danışmanı olarak çalışıyorum, "
    "müşteri karşılama ve kasa işlemlerinde deneyimliyim.",
    "Sakin kalıp müşteriyi dinlerim, sorunu anlayıp çözüm sunmaya çalışırım.",
    "Yoğun dönemlerde mesai arkadaşlarımla stok sayımını birlikte yaparak zamanında tamamladık.",
    "Günlük satış hedeflerimi takip eder, müşteri ihtiyaçlarına göre ek ürün önerileri sunarım.",
    "Evet, haftalık stok kontrolü ve raf düzenlemesi yaptım.",
]


def _build_five_question_session(db_session, candidate, job) -> InterviewSession:
    session = InterviewSession(candidate_id=candidate.id, job_id=job.id, status="awaiting_review")
    session.questions = [InterviewQuestion(text=q, order=i) for i, q in enumerate(QUESTIONS)]
    db_session.add(session)
    db_session.commit()
    db_session.refresh(session)

    for question, answer_text in zip(session.questions, ANSWERS):
        db_session.add(CandidateAnswer(session_id=session.id, question_id=question.id, transcript=answer_text))
    db_session.commit()
    db_session.refresh(session)
    return session


def _build_blank_session(db_session, candidate, job, with_blank_rows: bool) -> InterviewSession:
    session = InterviewSession(candidate_id=candidate.id, job_id=job.id, status="awaiting_review")
    session.questions = [InterviewQuestion(text=q, order=i) for i, q in enumerate(QUESTIONS)]
    db_session.add(session)
    db_session.commit()
    db_session.refresh(session)

    if with_blank_rows:
        # Mirrors a real timeout submission: _get_or_create_answer always
        # writes a row, even when the candidate never actually spoke/typed.
        for question in session.questions:
            db_session.add(CandidateAnswer(session_id=session.id, question_id=question.id, transcript=""))
        db_session.commit()
        db_session.refresh(session)
    return session


def test_compute_overall_score_averages_competency_scores():
    scores = CompetencyScores(
        communication=100,
        technical_competency=0,
        problem_solving=50,
        teamwork=50,
        customer_service=50,
        role_fit=50,
    )
    assert report_service._compute_overall_score(scores) == 50


def test_compute_overall_score_rounds_to_nearest_int():
    scores = CompetencyScores(
        communication=80,
        technical_competency=70,
        problem_solving=75,
        teamwork=82,
        customer_service=85,
        role_fit=77,
    )
    # (80+70+75+82+85+77)/6 = 78.1666...
    assert report_service._compute_overall_score(scores) == 78


def _valid_llm_response(**overrides):
    # No "overall_score" key — the model is never asked for one anymore
    # (see local_llm.py's generate_final_report); report_service computes
    # it in Python from competency_scores, see test_generate_report_success.
    response = {
        "recommendation": "recommended",
        "competency_scores": {
            "communication": 80,
            "technical_competency": 70,
            "problem_solving": 75,
            "teamwork": 82,
            "customer_service": 85,
            "role_fit": 77,
        },
        "strengths": ["Strong customer focus", "Clear communication"],
        "development_areas": ["Could elaborate more on stock management"],
        "summary": "The candidate demonstrates solid retail experience and customer orientation.",
        "evidence": [
            {
                "competency": "customer_service",
                "evidence": "Described calmly resolving a difficult customer situation.",
            }
        ],
    }
    response.update(overrides)
    return response


def _mock_provider(mocker, response=None):
    provider = MagicMock()
    provider.generate_final_report.return_value = response if response is not None else _valid_llm_response()
    mocker.patch("app.services.report_service.get_ai_provider", return_value=provider)
    return provider


def test_generate_report_success(db_session, candidate, job, mocker):
    session = _build_five_question_session(db_session, candidate, job)
    provider = _mock_provider(mocker)

    report = report_service.generate_final_report(db_session, session.id)

    # (80 + 70 + 75 + 82 + 85 + 77) / 6, rounded — computed in Python from
    # competency_scores, not supplied by the mocked provider.
    assert report.overall_score == 78
    assert report.recommendation == "recommended"
    assert report.competency_scores["customer_service"] == 85
    assert report.strengths == ["Strong customer focus", "Clear communication"]
    assert report.development_areas == ["Could elaborate more on stock management"]
    assert len(report.evidence) == 1
    db_session.refresh(session)
    assert session.status == "completed"

    kwargs = provider.generate_final_report.call_args.kwargs
    assert kwargs["job_description"] == job.description
    for question_text in QUESTIONS:
        assert question_text in kwargs["questions_and_answers"]
    for answer_text in ANSWERS:
        assert answer_text in kwargs["questions_and_answers"]
    assert candidate.full_name in kwargs["candidate_profile"]


def test_generate_report_blank_interview_scores_zero_without_calling_ai(db_session, candidate, job, mocker):
    # Regression: a candidate who never answers anything used to still get
    # an LLM-guessed "no evidence" score (small local models tend to land
    # around ~20 instead of 0) — this must be a deterministic zero, and the
    # AI provider shouldn't even be called.
    session = _build_blank_session(db_session, candidate, job, with_blank_rows=True)
    provider = _mock_provider(mocker)

    report = report_service.generate_final_report(db_session, session.id)

    assert report.overall_score == 0
    assert report.recommendation == "not_recommended"
    assert all(v == 0 for v in report.competency_scores.values())
    assert report.strengths == []
    provider.generate_final_report.assert_not_called()
    db_session.refresh(session)
    assert session.status == "completed"


def test_generate_report_blank_interview_with_no_answer_rows_at_all(db_session, candidate, job, mocker):
    session = _build_blank_session(db_session, candidate, job, with_blank_rows=False)
    provider = _mock_provider(mocker)

    report = report_service.generate_final_report(db_session, session.id)

    assert report.overall_score == 0
    provider.generate_final_report.assert_not_called()


def test_generate_report_rejects_in_progress_session(db_session, interview_session, mocker):
    _mock_provider(mocker)
    with pytest.raises(ValueError):
        report_service.generate_final_report(db_session, interview_session.id)


def test_generate_report_returns_existing_without_regenerating(db_session, candidate, job, mocker):
    session = _build_five_question_session(db_session, candidate, job)
    provider = _mock_provider(mocker)

    first = report_service.generate_final_report(db_session, session.id)
    second = report_service.generate_final_report(db_session, session.id)

    assert first.id == second.id
    provider.generate_final_report.assert_called_once()


def test_generate_report_dedupes_identical_evidence_text_across_competencies(db_session, candidate, job, mocker):
    # Regression: small local models sometimes cite the exact same quote
    # for more than one competency when the interview doesn't give them
    # enough distinct material — the report must not show that quote twice.
    session = _build_five_question_session(db_session, candidate, job)
    duplicate_quote = "Described calmly resolving a difficult customer situation."
    _mock_provider(
        mocker,
        response=_valid_llm_response(
            evidence=[
                {"competency": "customer_service", "evidence": duplicate_quote},
                {"competency": "problem_solving", "evidence": duplicate_quote},
                {"competency": "communication", "evidence": "Explained the greeting process clearly."},
            ]
        ),
    )

    report = report_service.generate_final_report(db_session, session.id)

    assert len(report.evidence) == 2
    assert report.evidence[0]["competency"] == "customer_service"
    assert report.evidence[1]["competency"] == "communication"


def test_generate_report_rejects_out_of_range_competency_score(db_session, candidate, job, mocker):
    session = _build_five_question_session(db_session, candidate, job)
    _mock_provider(
        mocker,
        response=_valid_llm_response(
            competency_scores={
                "communication": 80,
                "technical_competency": 70,
                "problem_solving": 75,
                "teamwork": 82,
                "customer_service": 150,
                "role_fit": 77,
            }
        ),
    )

    with pytest.raises(AIResponseError):
        report_service.generate_final_report(db_session, session.id)

    assert db_session.query(InterviewReport).filter(InterviewReport.session_id == session.id).count() == 0


def test_generate_report_rejects_invalid_recommendation_enum(db_session, candidate, job, mocker):
    session = _build_five_question_session(db_session, candidate, job)
    _mock_provider(mocker, response=_valid_llm_response(recommendation="strong_hire"))

    with pytest.raises(AIResponseError):
        report_service.generate_final_report(db_session, session.id)


def test_generate_report_rejects_malformed_json_shape(db_session, candidate, job, mocker):
    session = _build_five_question_session(db_session, candidate, job)
    _mock_provider(mocker, response={"unexpected": "shape"})

    with pytest.raises(AIResponseError):
        report_service.generate_final_report(db_session, session.id)


def test_generate_report_includes_prior_ai_evaluations_in_context(db_session, candidate, job, mocker):
    session = _build_five_question_session(db_session, candidate, job)
    first_answer = session.answers[0]
    db_session.add(
        AIEvaluation(
            answer_id=first_answer.id,
            competency="customer_service",
            score=8,
            is_sufficient=True,
            follow_up_needed=False,
            feedback="Clear and specific example.",
        )
    )
    db_session.commit()

    provider = _mock_provider(mocker)
    report_service.generate_final_report(db_session, session.id)

    kwargs = provider.generate_final_report.call_args.kwargs
    assert "Clear and specific example." in kwargs["answer_evaluations"]


def test_generate_report_no_prior_evaluations_uses_placeholder_text(db_session, candidate, job, mocker):
    session = _build_five_question_session(db_session, candidate, job)
    provider = _mock_provider(mocker)

    report_service.generate_final_report(db_session, session.id)

    kwargs = provider.generate_final_report.call_args.kwargs
    assert "önceki bir yapay zekâ değerlendirmesi bulunmuyor" in kwargs["answer_evaluations"]


def test_generate_report_passes_job_evaluation_criteria_to_provider(db_session, candidate, job, mocker):
    job.evaluation_criteria = "- Kasada hızlı işlem\n- Müşteriyle göz teması"
    db_session.commit()
    session = _build_five_question_session(db_session, candidate, job)
    provider = _mock_provider(mocker)

    report_service.generate_final_report(db_session, session.id)

    kwargs = provider.generate_final_report.call_args.kwargs
    assert kwargs["evaluation_criteria"] == "- Kasada hızlı işlem\n- Müşteriyle göz teması"


def test_generate_report_evaluation_criteria_defaults_to_empty_string(db_session, candidate, job, mocker):
    # job.evaluation_criteria is None until the background task (see
    # test_job_evaluation_criteria.py) finishes — generate_final_report
    # must not crash or pass None through to the provider in that window.
    assert job.evaluation_criteria is None
    session = _build_five_question_session(db_session, candidate, job)
    provider = _mock_provider(mocker)

    report_service.generate_final_report(db_session, session.id)

    kwargs = provider.generate_final_report.call_args.kwargs
    assert kwargs["evaluation_criteria"] == ""


# API-level tests (endpoint wiring, auth, HTTP status mapping)


def test_generate_report_endpoint_success(client, as_hr, db_session, candidate, job, mocker):
    session = _build_five_question_session(db_session, candidate, job)
    _mock_provider(mocker)

    response = client.post(f"/api/v1/interviews/{session.id}/generate-report")

    assert response.status_code == 200
    body = response.json()
    assert body["overall_score"] == 78
    assert body["recommendation"] == "recommended"
    assert body["competency_scores"]["role_fit"] == 77
    assert body["evidence"][0]["competency"] == "customer_service"


def test_generate_report_endpoint_rejects_in_progress_session(client, as_hr, interview_session, mocker):
    _mock_provider(mocker)
    response = client.post(f"/api/v1/interviews/{interview_session.id}/generate-report")
    assert response.status_code == 409


def test_generate_report_endpoint_invalid_llm_response_returns_502(
    client, as_hr, db_session, candidate, job, mocker
):
    session = _build_five_question_session(db_session, candidate, job)
    _mock_provider(mocker, response={"bad": "shape"})

    response = client.post(f"/api/v1/interviews/{session.id}/generate-report")

    assert response.status_code == 502


def test_generate_report_endpoint_nonexistent_session(client, as_hr, mocker):
    _mock_provider(mocker)
    response = client.post("/api/v1/interviews/999999/generate-report")
    assert response.status_code == 404


def test_generate_report_survives_concurrent_duplicate_insert(db_session, candidate, job, mocker):
    # Regression: two "Evaluate" requests close together (e.g. HR re-clicking
    # after the first seemed slow) used to both see no existing report and
    # each insert their own row — the session's report/recommendation shown
    # elsewhere (attach_report_summary) could then silently pick a different,
    # stale row than the one HR was actually editing. Simulates the second
    # request's row landing while this call is still "waiting" on the AI.
    session = _build_five_question_session(db_session, candidate, job)

    def fake_ai_call(**kwargs):
        db_session.add(
            InterviewReport(
                session_id=session.id,
                summary="Winner (concurrent request)",
                recommendation="not_recommended",
                overall_score=10,
                competency_scores={
                    "communication": 10,
                    "technical_competency": 10,
                    "problem_solving": 10,
                    "teamwork": 10,
                    "customer_service": 10,
                    "role_fit": 10,
                },
                strengths=[],
                development_areas=[],
                evidence=[],
            )
        )
        db_session.commit()
        return _valid_llm_response()

    provider = MagicMock()
    provider.generate_final_report.side_effect = fake_ai_call
    mocker.patch("app.services.report_service.get_ai_provider", return_value=provider)

    result = report_service.generate_final_report(db_session, session.id)

    assert result.summary == "Winner (concurrent request)"
    assert (
        db_session.query(InterviewReport).filter(InterviewReport.session_id == session.id).count() == 1
    )


def test_interview_reports_session_id_is_unique_at_db_level(db_session, interview_session):
    from sqlalchemy.exc import IntegrityError

    db_session.add(InterviewReport(session_id=interview_session.id, summary="first"))
    db_session.commit()

    db_session.add(InterviewReport(session_id=interview_session.id, summary="second"))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_generate_report_endpoint_second_call_does_not_regenerate(
    client, as_hr, db_session, candidate, job, mocker
):
    session = _build_five_question_session(db_session, candidate, job)
    provider = _mock_provider(mocker)

    first = client.post(f"/api/v1/interviews/{session.id}/generate-report")
    second = client.post(f"/api/v1/interviews/{session.id}/generate-report")

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["id"] == second.json()["id"]
    provider.generate_final_report.assert_called_once()
