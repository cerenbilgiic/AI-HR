import io
import os
import tempfile
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
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
    AIQuestionItem,
    AITranscribeResponse,
)
from app.services import candidate_service, interview_service, job_service
from app.services.ai import get_ai_provider
from app.services.ai.base import AIResponseError
from app.services.media_constraints import ALLOWED_MEDIA_TYPES, MAX_MEDIA_SIZE_BYTES
from app.services.storage import MediaStorage, get_media_storage

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
        feedback=evaluation.feedback,
        next_question=next_question,
    )


@router.post("/transcribe", response_model=AITranscribeResponse)
def transcribe(
    session_id: int = Form(...),
    question_id: int = Form(...),
    audio: UploadFile = File(...),
    db: Session = Depends(get_db),
    current: User | Candidate = Depends(get_current_user_or_candidate),
    storage: MediaStorage = Depends(get_media_storage),
) -> AITranscribeResponse:
    if isinstance(current, Candidate):
        session = interview_service.get_session(db, session_id)
        if session is None or session.candidate_id != current.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized for this session"
            )

    # Browsers report MediaRecorder blobs with codec parameters attached
    # (e.g. "video/webm;codecs=vp8,opus") — match on the base type only.
    content_type = (audio.content_type or "").split(";")[0].strip()
    extension = ALLOWED_MEDIA_TYPES.get(content_type)
    if extension is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported media type: {content_type or 'unknown'}",
        )

    data = audio.file.read()
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file")
    if len(data) > MAX_MEDIA_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds the {MAX_MEDIA_SIZE_BYTES // (1024 * 1024)}MB limit",
        )

    # Never derive the object key from the client-supplied filename — a
    # fresh uuid keeps the storage path free of user input entirely, which
    # rules out path traversal by construction rather than by sanitizing.
    object_key = f"interviews/{session_id}/{uuid.uuid4()}{extension}"

    try:
        storage.upload(object_key, io.BytesIO(data), content_type, len(data))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Could not upload recording: {exc}"
        ) from exc

    try:
        interview_service.attach_media(
            db, session_id, question_id, object_key, audio.filename or "recording", content_type, len(data)
        )
    except ValueError as exc:
        storage.delete(object_key)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except Exception as exc:
        storage.delete(object_key)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not save recording metadata: {exc}",
        ) from exc

    tmp_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=extension, delete=False) as tmp:
            tmp.write(data)
            tmp_path = tmp.name
        transcript = get_ai_provider().transcribe(tmp_path)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Transcription failed: {exc}"
        ) from exc
    finally:
        if tmp_path is not None:
            os.unlink(tmp_path)

    return AITranscribeResponse(transcript=transcript, object_key=object_key)
