from datetime import datetime, timedelta
from unittest.mock import MagicMock

import pytest

from app.models.ai_score import AIScore, InterviewReport
from app.models.interview import CandidateAnswer
from app.models.job import JobQuestion
from app.schemas.interview import AnswerSubmit
from app.services import interview_service


def test_create_session_raises_once_the_deadline_has_passed(db_session, candidate, job):
    # created_at drives compute_interview_deadline (created_at + N days) —
    # backdating it well past settings.interview_deadline_days simulates an
    # expired application without needing to fake "now".
    candidate.created_at = datetime.now() - timedelta(days=30)
    db_session.commit()

    with pytest.raises(ValueError, match="deadline"):
        interview_service.create_session(db_session, candidate)


def test_create_session_copies_job_questions_in_order(db_session, candidate, job):
    # Seeded candidates/demo data are intentionally backdated (so dashboard
    # stats look realistic) and can already be past the interview deadline —
    # reset it here since this test is about question ordering, not deadlines.
    candidate.created_at = datetime.now()
    db_session.commit()

    # Seeded jobs already have their own real HR-authored questions — clear
    # them so this test only sees the two it's adding itself.
    db_session.query(JobQuestion).filter(JobQuestion.job_id == job.id).delete()
    db_session.add_all(
        [
            JobQuestion(job_id=job.id, text="Second question?", order=1),
            JobQuestion(job_id=job.id, text="First question?", order=0),
        ]
    )
    db_session.commit()

    session = interview_service.create_session(db_session, candidate)

    assert [q.text for q in session.questions] == ["First question?", "Second question?"]
    assert [q.order for q in session.questions] == [0, 1]


def test_create_session_raises_when_job_has_no_questions(db_session, candidate, job):
    candidate.created_at = datetime.now()
    db_session.query(JobQuestion).filter(JobQuestion.job_id == job.id).delete()
    db_session.commit()
    with pytest.raises(ValueError, match="no interview questions"):
        interview_service.create_session(db_session, candidate)


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
