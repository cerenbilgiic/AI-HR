from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.v1.deps import get_current_user, get_current_user_or_candidate
from app.core.database import get_db
from app.models.candidate import Candidate
from app.models.user import User
from app.schemas.ai import (
    AIEvaluateAnswerRequest,
    AIEvaluationOut,
    AIGenerateQuestionsRequest,
    AIGenerateQuestionsResponse,
)
from app.services import candidate_service, interview_service
from app.services.ai.base import AIResponseError

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/generate-questions", response_model=AIGenerateQuestionsResponse)
def generate_questions(
    data: AIGenerateQuestionsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AIGenerateQuestionsResponse:
    candidate = candidate_service.get_candidate(db, data.candidate_id)
    if candidate is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    try:
        questions = interview_service.preview_questions(db, candidate, count=data.count)
    except AIResponseError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return AIGenerateQuestionsResponse(questions=questions)


@router.post("/evaluate-answer", response_model=AIEvaluationOut)
def evaluate_answer(
    data: AIEvaluateAnswerRequest,
    db: Session = Depends(get_db),
    current: User | Candidate = Depends(get_current_user_or_candidate),
) -> AIEvaluationOut:
    if isinstance(current, Candidate):
        session = interview_service.get_session(db, data.session_id)
        if session is None or session.candidate_id != current.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized for this session"
            )
    try:
        evaluation, next_question = interview_service.evaluate_answer(
            db, data.session_id, data.question_id, data.candidate_answer
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except AIResponseError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    return AIEvaluationOut(
        competency=evaluation.competency,
        score=evaluation.score,
        is_sufficient=evaluation.is_sufficient,
        follow_up_needed=evaluation.follow_up_needed,
        next_question=next_question,
    )
