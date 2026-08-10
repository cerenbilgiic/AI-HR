import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.api.v1.deps import get_current_user, get_current_user_or_candidate
from app.core.config import settings
from app.core.database import get_db
from app.models.candidate import Candidate
from app.models.user import User
from app.schemas.ai import (
    AIEvaluateAnswerRequest,
    AIEvaluationOut,
    AIGenerateQuestionsRequest,
    AIGenerateQuestionsResponse,
    AIQuestionItem,
    AITranscribeResponse,
)
from app.services import candidate_service, interview_service, job_service
from app.services.ai import get_ai_provider
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
    job = job_service.get_job(db, data.job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    try:
        session = interview_service.generate_and_persist_questions(
            db, candidate, job, count=data.number_of_questions
        )
    except AIResponseError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return AIGenerateQuestionsResponse(
        session_id=session.id,
        questions=[
            AIQuestionItem(
                question=q.text, category=q.category or "general", difficulty=q.difficulty or "medium"
            )
            for q in session.questions
        ],
    )


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


@router.post("/transcribe", response_model=AITranscribeResponse)
def transcribe(
    session_id: int = Form(...),
    audio: UploadFile = File(...),
    db: Session = Depends(get_db),
    current: User | Candidate = Depends(get_current_user_or_candidate),
) -> AITranscribeResponse:
    if isinstance(current, Candidate):
        session = interview_service.get_session(db, session_id)
        if session is None or session.candidate_id != current.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized for this session"
            )

    session_dir = Path(settings.upload_dir) / str(session_id)
    session_dir.mkdir(parents=True, exist_ok=True)
    extension = Path(audio.filename or "").suffix or ".webm"
    file_path = session_dir / f"{uuid.uuid4()}{extension}"
    with file_path.open("wb") as f:
        f.write(audio.file.read())

    try:
        transcript = get_ai_provider().transcribe(str(file_path))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Transcription failed: {exc}"
        ) from exc

    return AITranscribeResponse(transcript=transcript, audio_path=str(file_path))
