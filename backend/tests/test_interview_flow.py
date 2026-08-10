from unittest.mock import MagicMock

from app.models.ai_score import AIScore, InterviewReport
from app.models.interview import CandidateAnswer
from app.schemas.interview import AnswerSubmit
from app.services import interview_service


def _fake_questions(n):
    return [
        {"question": f"Question {i}?", "category": "general", "difficulty": "medium"} for i in range(n)
    ]


def test_create_session_generates_all_questions_up_front(db_session, candidate, mocker):
    fake_provider = MagicMock()
    fake_provider.generate_questions.return_value = _fake_questions(5)
    mocker.patch("app.services.interview_service.get_ai_provider", return_value=fake_provider)

    session = interview_service.create_session(db_session, candidate)

    assert len(session.questions) == 5
    assert [q.order for q in session.questions] == [0, 1, 2, 3, 4]
    assert [q.text for q in session.questions] == [f"Question {i}?" for i in range(5)]
    # exactly one AI call for the whole interview, not one per question
    fake_provider.generate_questions.assert_called_once()


def test_submit_answer_creates_row_when_none_exists(db_session, interview_session, question):
    answer = interview_service.submit_answer(
        db_session,
        interview_session.id,
        AnswerSubmit(question_id=question.id, transcript="this is my real answer"),
    )

    assert answer.transcript == "this is my real answer"
    count = (
        db_session.query(CandidateAnswer)
        .filter(
            CandidateAnswer.session_id == interview_session.id,
            CandidateAnswer.question_id == question.id,
        )
        .count()
    )
    assert count == 1


def test_submit_answer_reuses_row_created_by_transcribe(db_session, interview_session, question):
    # simulate /ai/transcribe having already run for this question and
    # attached a recording before the candidate confirms/submits the text
    interview_service.attach_media(
        db_session,
        interview_session.id,
        question.id,
        object_key="interviews/1/clip.webm",
        filename="clip.webm",
        content_type="video/webm",
        size=123,
    )

    answer = interview_service.submit_answer(
        db_session,
        interview_session.id,
        AnswerSubmit(question_id=question.id, transcript="final answer text"),
    )

    assert answer.transcript == "final answer text"
    assert answer.audio_path == "interviews/1/clip.webm"  # media metadata preserved, not overwritten
    count = (
        db_session.query(CandidateAnswer)
        .filter(
            CandidateAnswer.session_id == interview_session.id,
            CandidateAnswer.question_id == question.id,
        )
        .count()
    )
    assert count == 1  # no duplicate row


def _fake_provider():
    provider = MagicMock()
    provider.generate_report.return_value = {"summary": "Solid candidate.", "recommendation": "hire"}
    provider.evaluate_answer.return_value = {
        "technical_competency": 4,
        "communication_skills": 4,
        "problem_solving": 4,
        "job_role_compatibility": 4,
        "response_quality": 4,
        "confidence": 4,
    }
    return provider


def test_finish_session_marks_awaiting_review_without_evaluating(client, as_candidate, interview_session, db_session):
    response = client.post(f"/api/v1/interviews/{interview_session.id}/finish")

    assert response.status_code == 200
    assert response.json()["status"] == "awaiting_review"
    assert db_session.query(AIScore).filter(AIScore.session_id == interview_session.id).count() == 0
    assert db_session.query(InterviewReport).filter(InterviewReport.session_id == interview_session.id).count() == 0


def test_evaluate_session_rejects_in_progress_session(client, as_hr, interview_session):
    response = client.post(f"/api/v1/interviews/{interview_session.id}/evaluate")

    assert response.status_code == 409


def test_evaluate_session_creates_report_for_awaiting_review_session(
    client, as_hr, interview_session, db_session, mocker
):
    interview_session.status = "awaiting_review"
    db_session.commit()
    mocker.patch("app.services.interview_service.get_ai_provider", return_value=_fake_provider())

    response = client.post(f"/api/v1/interviews/{interview_session.id}/evaluate")

    assert response.status_code == 200
    body = response.json()
    assert body["recommendation"] == "hire"
    db_session.refresh(interview_session)
    assert interview_session.status == "completed"


def test_evaluate_session_does_not_duplicate_report_on_second_call(
    client, as_hr, interview_session, db_session, mocker
):
    interview_session.status = "awaiting_review"
    db_session.commit()
    mocker.patch("app.services.interview_service.get_ai_provider", return_value=_fake_provider())

    client.post(f"/api/v1/interviews/{interview_session.id}/evaluate")
    client.post(f"/api/v1/interviews/{interview_session.id}/evaluate")

    assert db_session.query(AIScore).filter(AIScore.session_id == interview_session.id).count() == 1
    assert db_session.query(InterviewReport).filter(InterviewReport.session_id == interview_session.id).count() == 1


def test_submit_answer_rejects_gibberish_text(client, as_candidate, interview_session, question):
    response = client.post(
        f"/api/v1/interviews/{interview_session.id}/answers",
        json={"question_id": question.id, "transcript": "jssjsjsjs"},
    )

    assert response.status_code == 422


def test_submit_answer_allows_gibberish_when_forced_by_timeout(
    client, as_candidate, interview_session, question, db_session
):
    response = client.post(
        f"/api/v1/interviews/{interview_session.id}/answers",
        json={"question_id": question.id, "transcript": "jssjsjsjs", "is_timeout": True},
    )

    assert response.status_code == 201
    answer = (
        db_session.query(CandidateAnswer)
        .filter(CandidateAnswer.session_id == interview_session.id, CandidateAnswer.question_id == question.id)
        .first()
    )
    assert answer.transcript == "jssjsjsjs"


def test_submit_answer_allows_blank_transcript(client, as_candidate, interview_session, question):
    response = client.post(
        f"/api/v1/interviews/{interview_session.id}/answers",
        json={"question_id": question.id, "transcript": ""},
    )

    assert response.status_code == 201
