from datetime import timedelta

from app.core.config import settings
from app.services.candidate_service import compute_interview_deadline


def test_compute_interview_deadline(candidate):
    expected = candidate.created_at + timedelta(days=settings.interview_deadline_days)
    assert compute_interview_deadline(candidate) == expected


def test_candidates_me_includes_interview_deadline(client, as_candidate, candidate):
    response = client.get("/api/v1/candidates/me")

    assert response.status_code == 200
    body = response.json()
    assert body["interview_deadline"] is not None


def test_get_candidate_includes_interview_deadline(client, as_hr, candidate):
    response = client.get(f"/api/v1/candidates/{candidate.id}")

    assert response.status_code == 200
    assert response.json()["interview_deadline"] is not None


def test_candidate_can_list_own_sessions(client, as_candidate, interview_session):
    response = client.get("/api/v1/interviews")

    assert response.status_code == 200
    ids = [s["id"] for s in response.json()]
    assert interview_session.id in ids


def test_candidate_cannot_list_other_candidates_sessions_via_param(
    client, as_other_candidate, interview_session, other_candidate
):
    # interview_session belongs to `candidate`, not `other_candidate` — even
    # if other_candidate explicitly asks for candidate_id=<candidate's id>,
    # the server must override it with their own id.
    response = client.get("/api/v1/interviews", params={"candidate_id": interview_session.candidate_id})

    assert response.status_code == 200
    ids = [s["id"] for s in response.json()]
    assert interview_session.id not in ids


def test_hr_can_still_list_sessions_by_candidate_id(client, as_hr, interview_session):
    response = client.get("/api/v1/interviews", params={"candidate_id": interview_session.candidate_id})

    assert response.status_code == 200
    ids = [s["id"] for s in response.json()]
    assert interview_session.id in ids


def test_in_progress_session_has_no_completion_stats(client, as_candidate, interview_session):
    response = client.get(f"/api/v1/interviews/{interview_session.id}")

    body = response.json()
    assert body["duration_minutes"] is None
    assert body["answered_count"] == 0


def test_finished_session_has_completion_stats(client, as_candidate, interview_session, question, db_session):
    from app.services import interview_service
    from app.schemas.interview import AnswerSubmit

    interview_service.submit_answer(
        db_session, interview_session.id, AnswerSubmit(question_id=question.id, transcript="Evet, deneyimliyim.")
    )
    interview_session.status = "awaiting_review"
    db_session.commit()

    response = client.get(f"/api/v1/interviews/{interview_session.id}")

    body = response.json()
    assert body["answered_count"] == 1
    assert body["duration_minutes"] is not None
    assert body["duration_minutes"] >= 0
