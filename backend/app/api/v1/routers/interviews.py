from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.interview import AnswerSubmit, InterviewSessionCreate, InterviewSessionOut
from app.schemas.report import InterviewReportOut
from app.services import interview_service

router = APIRouter(prefix="/interviews", tags=["interviews"])


@router.post("", response_model=InterviewSessionOut, status_code=status.HTTP_201_CREATED)
def create_session(data: InterviewSessionCreate, db: Session = Depends(get_db)) -> InterviewSessionOut:
    return interview_service.create_session(db, data)


@router.get("/{session_id}", response_model=InterviewSessionOut)
def get_session(session_id: int, db: Session = Depends(get_db)) -> InterviewSessionOut:
    session = interview_service.get_session(db, session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return session


@router.post("/{session_id}/answers", status_code=status.HTTP_201_CREATED)
def submit_answer(session_id: int, data: AnswerSubmit, db: Session = Depends(get_db)) -> dict:
    answer = interview_service.submit_answer(db, session_id, data)
    return {"id": answer.id, "transcript": answer.transcript}


@router.post("/{session_id}/finish", response_model=InterviewReportOut)
def finish_session(session_id: int, db: Session = Depends(get_db)) -> InterviewReportOut:
    return interview_service.finalize_session(db, session_id)
