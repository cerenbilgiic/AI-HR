from datetime import datetime, timedelta

from app.core.config import settings
from app.models.audit_log import AuditLog
from app.services.candidate_service import compute_interview_deadline, reset_interview_deadline
from tests.conftest import clear_candidate_sessions


def test_compute_interview_deadline(db_session, candidate):
    # The shared `candidate` fixture is real dev-DB data that may already
    # have been invited by earlier manual testing — pin invited_at to None
    # so this test is about the created_at fallback specifically, not
    # whatever the fixture happens to carry right now.
    candidate.invited_at = None
    db_session.commit()
    expected = candidate.created_at + timedelta(days=settings.interview_deadline_days)
    assert compute_interview_deadline(candidate) == expected


def test_compute_interview_deadline_uses_invited_at_once_sent(db_session, candidate):
    # The deadline must track when the invite was actually emailed, not
    # account creation — this is also what the magic link's own JWT expiry
    # matches (see invitation_service._build_invitation_content).
    candidate.created_at = datetime.now() - timedelta(days=30)
    candidate.invited_at = datetime.now()
    db_session.commit()
    expected = candidate.invited_at + timedelta(days=settings.interview_deadline_days)
    assert compute_interview_deadline(candidate) == expected


def test_reset_interview_deadline_grants_a_fresh_window(db_session, candidate):
    candidate.created_at = datetime.now() - timedelta(days=30)
    db_session.commit()
    assert compute_interview_deadline(candidate) < datetime.now()  # expired, matching create_session's check

    reset_interview_deadline(db_session, candidate, actor_id=None)

    new_deadline = compute_interview_deadline(candidate)
    assert new_deadline > datetime.now()
    assert new_deadline > candidate.created_at + timedelta(days=settings.interview_deadline_days)


def test_reset_interview_deadline_writes_audit_log(db_session, candidate, hr_user):
    reset_interview_deadline(db_session, candidate, actor_id=hr_user.id)
    log = (
        db_session.query(AuditLog)
        .filter(AuditLog.candidate_id == candidate.id, AuditLog.action == "interview_deadline_reset")
        .first()
    )
    assert log is not None
    assert log.actor_id == hr_user.id


def test_hr_can_reset_interview_deadline_via_api(client, as_hr, candidate, db_session):
    candidate.created_at = datetime.now() - timedelta(days=30)
    db_session.commit()

    response = client.post(f"/api/v1/candidates/{candidate.id}/reset-interview-deadline")

    assert response.status_code == 200
    new_deadline = datetime.fromisoformat(response.json()["interview_deadline"])
    assert new_deadline > datetime.now()


def test_candidate_can_start_interview_after_hr_resets_deadline(
    client, as_hr, db_session, candidate, job
):
    from app.models.job import JobQuestion

    clear_candidate_sessions(db_session, candidate.id)
    db_session.query(JobQuestion).filter(JobQuestion.job_id == job.id).delete()
    db_session.add(JobQuestion(job_id=job.id, text="Q?", order=0))
    candidate.created_at = datetime.now() - timedelta(days=30)
    db_session.commit()

    client.post(f"/api/v1/candidates/{candidate.id}/reset-interview-deadline")

    from tests.conftest import override_auth

    override_auth(candidate)
    response = client.post("/api/v1/interviews")
    assert response.status_code == 201


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
