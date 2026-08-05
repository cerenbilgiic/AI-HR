from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.v1.deps import get_current_candidate, get_current_user
from app.core.database import get_db
from app.models.candidate import Candidate
from app.models.interview import InterviewSession
from app.models.user import User
from app.schemas.interview import (
    AnswerSubmit,
    InterviewQuestionCreate,
    InterviewQuestionOut,
    InterviewQuestionUpdate,
    InterviewSessionOut,
    InterviewSessionStatusUpdate,
)
from app.schemas.report import InterviewReportOut
from app.services import interview_service

router = APIRouter(prefix="/interviews", tags=["interviews"])


def _get_owned_session(db: Session, session_id: int, current_candidate: Candidate) -> InterviewSession:
    session = interview_service.get_session(db, session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if session.candidate_id != current_candidate.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized for this session")
    return session


def _get_session_or_404(db: Session, session_id: int) -> InterviewSession:
    session = interview_service.get_session(db, session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return session


@router.post("", response_model=InterviewSessionOut, status_code=status.HTTP_201_CREATED)
def create_session(
    db: Session = Depends(get_db),
    current_candidate: Candidate = Depends(get_current_candidate),
) -> InterviewSessionOut:
    return interview_service.create_session(db, current_candidate)


@router.get("", response_model=list[InterviewSessionOut])
def list_sessions(
    candidate_id: int | None = None,
    job_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[InterviewSessionOut]:
    return interview_service.list_sessions(db, candidate_id=candidate_id, job_id=job_id)


@router.get("/{session_id}", response_model=InterviewSessionOut)
def get_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_candidate: Candidate = Depends(get_current_candidate),
) -> InterviewSessionOut:
    return _get_owned_session(db, session_id, current_candidate)


@router.patch("/{session_id}/status", response_model=InterviewSessionOut)
def update_session_status(
    session_id: int,
    data: InterviewSessionStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> InterviewSessionOut:
    session = _get_session_or_404(db, session_id)
    return interview_service.update_session_status(db, session, data)


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(
    session_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
) -> None:
    session = _get_session_or_404(db, session_id)
    interview_service.delete_session(db, session)


@router.post("/{session_id}/answers", status_code=status.HTTP_201_CREATED)
def submit_answer(
    session_id: int,
    data: AnswerSubmit,
    db: Session = Depends(get_db),
    current_candidate: Candidate = Depends(get_current_candidate),
) -> dict:
    _get_owned_session(db, session_id, current_candidate)
    answer = interview_service.submit_answer(db, session_id, data)
    return {"id": answer.id, "transcript": answer.transcript}


@router.post("/{session_id}/finish", response_model=InterviewReportOut)
def finish_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_candidate: Candidate = Depends(get_current_candidate),
) -> InterviewReportOut:
    _get_owned_session(db, session_id, current_candidate)
    return interview_service.finalize_session(db, session_id)


@router.post("/{session_id}/questions", response_model=InterviewQuestionOut, status_code=status.HTTP_201_CREATED)
def add_question(
    session_id: int,
    data: InterviewQuestionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> InterviewQuestionOut:
    session = _get_session_or_404(db, session_id)
    return interview_service.add_question(db, session, data)


@router.put("/{session_id}/questions/{question_id}", response_model=InterviewQuestionOut)
def update_question(
    session_id: int,
    question_id: int,
    data: InterviewQuestionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> InterviewQuestionOut:
    question = interview_service.get_question(db, session_id, question_id)
    if question is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")
    return interview_service.update_question(db, question, data)


@router.delete("/{session_id}/questions/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_question(
    session_id: int,
    question_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    question = interview_service.get_question(db, session_id, question_id)
    if question is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")
    interview_service.delete_question(db, question)
