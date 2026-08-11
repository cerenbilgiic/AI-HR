from app.services import interview_service


def test_terminate_session_marks_terminated(client, as_candidate, interview_session):
    response = client.post(f"/api/v1/interviews/{interview_session.id}/terminate")

    assert response.status_code == 200
    assert response.json()["status"] == "terminated"


def test_terminate_session_rejects_non_in_progress(client, as_candidate, interview_session, db_session):
    interview_session.status = "awaiting_review"
    db_session.commit()

    response = client.post(f"/api/v1/interviews/{interview_session.id}/terminate")

    assert response.status_code == 409


def test_terminate_session_requires_ownership(client, as_other_candidate, interview_session):
    response = client.post(f"/api/v1/interviews/{interview_session.id}/terminate")

    assert response.status_code == 403


def test_create_session_rejects_when_candidate_has_terminated_session(
    db_session, candidate, interview_session
):
    interview_service.terminate_session(db_session, interview_session)

    try:
        interview_service.create_session(db_session, candidate)
        assert False, "expected ValueError"
    except ValueError as exc:
        assert "terminated" in str(exc).lower()


def test_create_session_endpoint_rejects_when_candidate_has_terminated_session(
    client, as_candidate, interview_session, db_session
):
    interview_session.status = "terminated"
    db_session.commit()

    response = client.post("/api/v1/interviews")

    assert response.status_code == 409


def test_submit_answer_rejects_when_session_not_in_progress(
    client, as_candidate, interview_session, question, db_session
):
    interview_session.status = "terminated"
    db_session.commit()

    response = client.post(
        f"/api/v1/interviews/{interview_session.id}/answers",
        json={"question_id": question.id, "transcript": "Hello"},
    )

    assert response.status_code == 422


def test_finish_session_rejects_when_not_in_progress(
    client, as_candidate, interview_session, db_session
):
    interview_session.status = "terminated"
    db_session.commit()

    response = client.post(f"/api/v1/interviews/{interview_session.id}/finish")

    assert response.status_code == 409
