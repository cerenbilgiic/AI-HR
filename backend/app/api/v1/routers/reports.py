from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.v1.deps import get_current_user
from app.core.database import get_db
from app.models.ai_score import AIScore, InterviewReport
from app.models.user import User
from app.schemas.report import AIScoreOut, AIScoreUpdate, InterviewReportOut, InterviewReportUpdate
from app.services import interview_service

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/session/{session_id}", response_model=InterviewReportOut)
def get_report_by_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> InterviewReportOut:
    report = db.query(InterviewReport).filter(InterviewReport.session_id == session_id).first()
    if report is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    scores = db.query(AIScore).filter(AIScore.session_id == session_id).first()
    result = InterviewReportOut.model_validate(report)
    if scores is not None:
        result.scores = scores
    return result


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
