from app.services import interview_service


def test_log_violation_endpoint(client, as_candidate, interview_session):
    resp = client.post(
        f"/api/v1/interviews/{interview_session.id}/violations",
        json={"violation_type": "tab_switch"},
    )
    assert resp.status_code == 204


def test_log_violation_requires_owning_candidate(client, as_other_candidate, interview_session):
    resp = client.post(
        f"/api/v1/interviews/{interview_session.id}/violations",
        json={"violation_type": "tab_switch"},
    )
    assert resp.status_code == 403


def test_get_session_includes_violation_counts(client, as_hr, db_session, interview_session):
    interview_service.log_violation(db_session, interview_session, "tab_switch")
    interview_service.log_violation(db_session, interview_session, "tab_switch")
    interview_service.log_violation(db_session, interview_session, "copy_attempt")

    body = client.get(f"/api/v1/interviews/{interview_session.id}").json()

    assert body["violation_counts"] == {"tab_switch": 2, "copy_attempt": 1}


def test_risk_score_computed_on_finish(client, as_candidate, interview_session, question, db_session):
    interview_service.log_violation(db_session, interview_session, "tab_switch")
    interview_service.log_violation(db_session, interview_session, "fullscreen_exit")

    resp = client.post(f"/api/v1/interviews/{interview_session.id}/finish")

    assert resp.status_code == 200
    assert resp.json()["risk_score"] == 40


def test_risk_score_computed_on_terminate(client, as_candidate, interview_session, db_session):
    interview_service.log_violation(db_session, interview_session, "tab_switch")

    resp = client.post(f"/api/v1/interviews/{interview_session.id}/terminate")

    assert resp.status_code == 200
    assert resp.json()["risk_score"] == 20


def test_risk_score_caps_at_100(db_session, interview_session):
    for _ in range(10):
        interview_service.log_violation(db_session, interview_session, "tab_switch")

    result = interview_service.complete_session(db_session, interview_session)

    assert result.risk_score == 100


def test_risk_score_reflects_violations_logged_after_termination_snapshot(client, as_candidate, interview_session, db_session):
    # Regression: Interview.tsx's logViolation is fire-and-forget, called
    # right before terminateSession — the terminate request (which snapshots
    # risk_score) can reach the backend before the violation POST commits,
    # undercounting it at the time. attach_violation_summary must recompute
    # risk_score live from the current violation count, not trust the stale
    # snapshot, so HR always sees a score consistent with the listed violations.
    resp = client.post(f"/api/v1/interviews/{interview_session.id}/terminate")
    assert resp.json()["risk_score"] == 0  # no violations logged yet at snapshot time

    # Violation "arrives late" — logged only after the snapshot was taken.
    interview_service.log_violation(db_session, interview_session, "fullscreen_exit")

    body = client.get(f"/api/v1/interviews/{interview_session.id}").json()

    assert body["violation_counts"] == {"fullscreen_exit": 1}
    assert body["risk_score"] == 20
