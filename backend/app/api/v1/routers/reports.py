import io
import zipfile
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.v1.deps import get_current_user
from app.core.database import get_db
from app.models.audit_log import AuditLog
from app.models.ai_score import AIScore, InterviewReport
from app.models.candidate import Candidate
from app.models.interview import InterviewSession
from app.models.job import Job
from app.models.user import User
from app.schemas.report import (
    AIScoreOut,
    AIScoreUpdate,
    DecisionEmailOut,
    InterviewReportOut,
    InterviewReportUpdate,
)
from app.services import interview_service
from app.services.email_service import build_decision_email, send_email
from app.services.pdf_report import build_interview_report_pdf

router = APIRouter(prefix="/reports", tags=["reports"])


def _build_report_out(db: Session, session_id: int) -> InterviewReportOut | None:
    report = db.query(InterviewReport).filter(InterviewReport.session_id == session_id).first()
    if report is None:
        return None
    scores = db.query(AIScore).filter(AIScore.session_id == session_id).first()
    result = InterviewReportOut.model_validate(report)
    if scores is not None:
        result.scores = scores
    return result


@router.get("/session/{session_id}", response_model=InterviewReportOut)
def get_report_by_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> InterviewReportOut:
    result = _build_report_out(db, session_id)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    return result


@router.get("/session/{session_id}/pdf")
def download_report_pdf(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    session = db.get(InterviewSession, session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview session not found")
    report = _build_report_out(db, session_id)
    if report is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    candidate = db.get(Candidate, session.candidate_id)
    if candidate is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    job = db.get(Job, session.job_id)

    buffer = build_interview_report_pdf(candidate, job, session, report)
    filename = f"{candidate.full_name.replace(' ', '_')}_interview_report.pdf"
    ascii_filename = filename.encode("ascii", "ignore").decode("ascii") or "interview_report.pdf"
    encoded_filename = quote(filename)
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": (
                f'attachment; filename="{ascii_filename}"; filename*=UTF-8\'\'{encoded_filename}'
            )
        },
    )


@router.post("/export")
def export_reports(
    session_ids: list[int],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    """Bulk-downloads one PDF per session_id as a single zip — same PDF
    build_interview_report_pdf already produces for the single-session
    download above, just looped. Sessions with no report yet (or that don't
    exist) are silently skipped rather than failing the whole batch, since a
    bulk selection realistically mixes decided/undecided sessions."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        used_names: set[str] = set()
        for session_id in session_ids:
            session = db.get(InterviewSession, session_id)
            if session is None:
                continue
            report = _build_report_out(db, session_id)
            if report is None:
                continue
            candidate = db.get(Candidate, session.candidate_id)
            if candidate is None:
                continue
            job = db.get(Job, session.job_id)

            pdf_buffer = build_interview_report_pdf(candidate, job, session, report)
            base_name = f"{candidate.full_name.replace(' ', '_')}_interview_report"
            ascii_name = base_name.encode("ascii", "ignore").decode("ascii") or f"interview_report_{session_id}"
            name = f"{ascii_name}.pdf"
            # Two candidates can share a name — keep every entry.
            suffix = 2
            while name in used_names:
                name = f"{ascii_name}_{suffix}.pdf"
                suffix += 1
            used_names.add(name)
            zf.writestr(name, pdf_buffer.getvalue())

    if not used_names:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No reports found for the given sessions")

    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="interview_reports.zip"'},
    )


@router.put("/session/{session_id}", response_model=InterviewReportOut)
def update_report(
    session_id: int,
    data: InterviewReportUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> InterviewReportOut:
    report = interview_service.get_report(db, session_id)
    if report is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    updated = interview_service.update_report(db, report, data)

    scores = db.query(AIScore).filter(AIScore.session_id == session_id).first()
    result = InterviewReportOut.model_validate(updated)
    if scores is not None:
        result.scores = scores
    return result


@router.put("/session/{session_id}/score", response_model=AIScoreOut)
def update_score(
    session_id: int,
    data: AIScoreUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AIScoreOut:
    score = interview_service.get_score(db, session_id)
    if score is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Score not found")
    return interview_service.update_score(db, score, data)


def _decision_email_content(db: Session, session_id: int) -> tuple[Candidate, str, list[str]]:
    """Shared by the preview and send endpoints below — both must build the
    exact same content, or HR could see one draft and send another."""
    report = interview_service.get_report(db, session_id)
    if report is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    if report.hr_decision is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="No final decision set for this session yet")

    session = db.get(InterviewSession, session_id)
    candidate = db.get(Candidate, session.candidate_id) if session else None
    if candidate is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    job = db.get(Job, session.job_id) if session else None

    subject, paragraphs = build_decision_email(candidate.full_name, job.title if job else "", report.hr_decision)
    return candidate, subject, paragraphs


@router.get("/session/{session_id}/decision-email", response_model=DecisionEmailOut)
def preview_decision_email(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DecisionEmailOut:
    """Lets HR see the result email before it goes out — see
    pages/hr's InterviewDetailPanel, which shows this next to the "Nihai
    Karar" buttons once a decision is set."""
    candidate, subject, paragraphs = _decision_email_content(db, session_id)
    return DecisionEmailOut(to=candidate.email, subject=subject, body="\n\n".join(paragraphs))


@router.post("/session/{session_id}/send-decision-email", response_model=DecisionEmailOut)
def send_decision_email(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DecisionEmailOut:
    candidate, subject, paragraphs = _decision_email_content(db, session_id)
    try:
        send_email(candidate.email, subject, paragraphs)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    db.add(
        AuditLog(
            actor_type="hr",
            actor_id=current_user.id,
            candidate_id=candidate.id,
            action="decision_email_sent",
        )
    )
    db.commit()
    return DecisionEmailOut(to=candidate.email, subject=subject, body="\n\n".join(paragraphs))
