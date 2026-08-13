import io
import zipfile

from app.core.security import create_access_token
from app.models.ai_score import InterviewReport
from app.models.interview import InterviewQuestion, InterviewSession


def test_download_report_pdf(client, as_hr, db_session, interview_session):
    db_session.add(
        InterviewReport(
            session_id=interview_session.id,
            overall_score=82,
            recommendation="recommended",
            competency_scores={
                "communication": 80,
                "technical_competency": 75,
                "problem_solving": 85,
                "teamwork": 90,
                "customer_service": 88,
                "role_fit": 79,
            },
            strengths=["Güçlü müşteri odaklılık"],
            development_areas=["Zaman yönetimi geliştirilebilir"],
            summary="Aday pozisyon için uygun görünüyor.",
            evidence=[{"competency": "communication", "evidence": "Net ve akıcı yanıtlar verdi."}],
        )
    )
    db_session.commit()

    response = client.get(f"/api/v1/reports/session/{interview_session.id}/pdf")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF")


def test_download_report_pdf_404_when_no_report(client, as_hr, interview_session):
    response = client.get(f"/api/v1/reports/session/{interview_session.id}/pdf")

    assert response.status_code == 404


def test_download_report_pdf_requires_hr_auth(client, candidate, interview_session):
    # Real JWT decoding path, not the as_candidate fixture — its blanket
    # get_current_user override bypasses the dependency's own type check
    # (see test_hr_dashboard.py::test_hr_endpoints_reject_candidate_token).
    token = create_access_token(subject=str(candidate.id), token_type="candidate")
    response = client.get(
        f"/api/v1/reports/session/{interview_session.id}/pdf",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 401


def _session_with_report(db_session, candidate, job) -> InterviewSession:
    session = InterviewSession(candidate_id=candidate.id, job_id=job.id, status="completed")
    session.questions = [InterviewQuestion(text="Test question?", order=0)]
    db_session.add(session)
    db_session.commit()
    db_session.add(InterviewReport(session_id=session.id, overall_score=70, recommendation="maybe"))
    db_session.commit()
    db_session.refresh(session)
    return session


def test_export_reports_returns_zip_with_one_pdf_per_session(
    client, as_hr, db_session, candidate, other_candidate, job
):
    session_a = _session_with_report(db_session, candidate, job)
    session_b = _session_with_report(db_session, other_candidate, job)

    response = client.post("/api/v1/reports/export", json=[session_a.id, session_b.id])

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    zf = zipfile.ZipFile(io.BytesIO(response.content))
    assert len(zf.namelist()) == 2
    for name in zf.namelist():
        assert zf.read(name).startswith(b"%PDF")


def test_export_reports_skips_sessions_without_report(client, as_hr, db_session, candidate, interview_session, job):
    with_report = _session_with_report(db_session, candidate, job)
    # interview_session has no InterviewReport row — should be silently skipped.
    response = client.post("/api/v1/reports/export", json=[with_report.id, interview_session.id])

    assert response.status_code == 200
    zf = zipfile.ZipFile(io.BytesIO(response.content))
    assert len(zf.namelist()) == 1


def test_export_reports_404_when_nothing_found(client, as_hr, interview_session):
    response = client.post("/api/v1/reports/export", json=[interview_session.id, 999999])
    assert response.status_code == 404


def test_export_reports_requires_hr_auth(client, candidate, interview_session):
    token = create_access_token(subject=str(candidate.id), token_type="candidate")
    response = client.post(
        "/api/v1/reports/export",
        json=[interview_session.id],
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 401
