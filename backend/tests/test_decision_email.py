from app.models.ai_score import InterviewReport
from app.models.audit_log import AuditLog


def _report_with_decision(db_session, interview_session, decision: str) -> InterviewReport:
    report = InterviewReport(session_id=interview_session.id, hr_decision=decision)
    db_session.add(report)
    db_session.commit()
    db_session.refresh(report)
    return report


def test_preview_requires_a_decision_first(client, as_hr, interview_session, db_session):
    db_session.add(InterviewReport(session_id=interview_session.id))
    db_session.commit()

    resp = client.get(f"/api/v1/reports/session/{interview_session.id}/decision-email")

    assert resp.status_code == 409


def test_preview_404_when_no_report_at_all(client, as_hr, interview_session):
    resp = client.get(f"/api/v1/reports/session/{interview_session.id}/decision-email")
    assert resp.status_code == 404


def test_preview_matches_recommended_decision(client, as_hr, interview_session, candidate, job, db_session):
    _report_with_decision(db_session, interview_session, "recommended")

    resp = client.get(f"/api/v1/reports/session/{interview_session.id}/decision-email")

    assert resp.status_code == 200
    body = resp.json()
    assert body["to"] == candidate.email
    assert job.title in body["subject"] or job.title in body["body"]
    assert "olumlu" in body["body"]


def test_preview_matches_not_recommended_decision(client, as_hr, interview_session, db_session):
    _report_with_decision(db_session, interview_session, "not_recommended")

    resp = client.get(f"/api/v1/reports/session/{interview_session.id}/decision-email")

    assert resp.status_code == 200
    assert "ilerletmeme" in resp.json()["body"]


def test_preview_matches_maybe_decision(client, as_hr, interview_session, db_session):
    _report_with_decision(db_session, interview_session, "maybe")

    resp = client.get(f"/api/v1/reports/session/{interview_session.id}/decision-email")

    assert resp.status_code == 200
    assert "değerlendirme sürecimiz devam" in resp.json()["body"]


def test_send_decision_email_sends_and_logs(client, as_hr, hr_user, interview_session, candidate, db_session, mocker):
    _report_with_decision(db_session, interview_session, "recommended")
    mock_send = mocker.patch("app.api.v1.routers.reports.send_email")

    resp = client.post(f"/api/v1/reports/session/{interview_session.id}/send-decision-email")

    assert resp.status_code == 200
    assert resp.json()["to"] == candidate.email
    mock_send.assert_called_once()
    assert mock_send.call_args.args[0] == candidate.email

    log = (
        db_session.query(AuditLog)
        .filter(AuditLog.candidate_id == candidate.id, AuditLog.action == "decision_email_sent")
        .first()
    )
    assert log is not None


def test_send_decision_email_502_when_smtp_not_configured(client, as_hr, interview_session, db_session, mocker):
    _report_with_decision(db_session, interview_session, "recommended")
    mocker.patch(
        "app.api.v1.routers.reports.send_email",
        side_effect=RuntimeError("SMTP is not configured"),
    )

    resp = client.post(f"/api/v1/reports/session/{interview_session.id}/send-decision-email")

    assert resp.status_code == 502


def test_send_decision_email_requires_a_decision_first(client, as_hr, interview_session, db_session):
    db_session.add(InterviewReport(session_id=interview_session.id))
    db_session.commit()

    resp = client.post(f"/api/v1/reports/session/{interview_session.id}/send-decision-email")

    assert resp.status_code == 409
