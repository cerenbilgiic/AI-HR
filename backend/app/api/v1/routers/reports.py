from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.v1.deps import get_current_user
from app.core.database import get_db
from app.models.ai_score import AIScore, InterviewReport
from app.models.user import User
from app.schemas.report import InterviewReportOut

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
