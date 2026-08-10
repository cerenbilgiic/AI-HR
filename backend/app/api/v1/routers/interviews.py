import io
import os
import tempfile

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

from app.api.v1.deps import get_current_candidate, get_current_user, get_current_user_or_candidate
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
from app.schemas.ai import AIMediaUrlResponse
from app.schemas.report import InterviewReportOut
from app.services import interview_service, report_service
from app.services.ai.base import AIResponseError
from app.services.media_constraints import ALLOWED_MEDIA_TYPES, MAX_MEDIA_SIZE_BYTES
from app.services.storage import MediaStorage, get_media_storage

MEDIA_URL_EXPIRES_SECONDS = 300

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
    try:
        return interview_service.create_session(db, current_candidate)
    except AIResponseError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


@router.get("", response_model=list[InterviewSessionOut])
def list_sessions(
    candidate_id: int | None = None,
    job_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[InterviewSessionOut]:
    sessions = interview_service.list_sessions(db, candidate_id=candidate_id, job_id=job_id)
    interview_service.attach_report_summary(db, sessions)
    return sessions


@router.get("/{session_id}", response_model=InterviewSessionOut)
def get_session(
    session_id: int,
    db: Session = Depends(get_db),
    current: User | Candidate = Depends(get_current_user_or_candidate),
) -> InterviewSessionOut:
    """Candidates can only fetch their own session; HR can fetch any —
    this is also the HR-facing "interview detail" fetch (Q&A, transcripts,
    timing), see pages/hr/InterviewDetail.tsx.
    """
    session = _get_session_or_404(db, session_id)
    if isinstance(current, Candidate) and session.candidate_id != current.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized for this session")
    interview_service.attach_report_summary(db, [session])
    return session


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
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    storage: MediaStorage = Depends(get_media_storage),
) -> None:
    session = _get_session_or_404(db, session_id)
    interview_service.delete_session(db, session, storage)


@router.post("/{session_id}/answers", status_code=status.HTTP_201_CREATED)
def submit_answer(
    session_id: int,
    data: AnswerSubmit,
    db: Session = Depends(get_db),
    current_candidate: Candidate = Depends(get_current_candidate),
) -> dict:
    _get_owned_session(db, session_id, current_candidate)
    try:
        answer = interview_service.submit_answer(db, session_id, data)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return {"id": answer.id, "transcript": answer.transcript}


@router.post("/{session_id}/recording", status_code=status.HTTP_201_CREATED)
def upload_recording(
    session_id: int,
    recording: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_candidate: Candidate = Depends(get_current_candidate),
    storage: MediaStorage = Depends(get_media_storage),
) -> dict:
    """The whole interview (all questions, start to finish) is captured as a
    single continuous recording on the frontend and uploaded once here, when
    the candidate finishes — not transcribed, just archived for HR review.
    """
    _get_owned_session(db, session_id, current_candidate)

    content_type = (recording.content_type or "").split(";")[0].strip()
    extension = ALLOWED_MEDIA_TYPES.get(content_type)
    if extension is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported media type: {content_type or 'unknown'}",
        )

    data = recording.file.read()
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file")
    if len(data) > MAX_MEDIA_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds the {MAX_MEDIA_SIZE_BYTES // (1024 * 1024)}MB limit",
        )

    # One recording per interview, never re-recorded, so a fixed name is
    # fine — no uuid needed to avoid collisions the way /ai/transcribe does.
    object_key = f"interviews/{session_id}/full-recording{extension}"

    try:
        storage.upload(object_key, io.BytesIO(data), content_type, len(data))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Could not upload recording: {exc}"
        ) from exc

    interview_service.attach_recording(
        db, session_id, object_key, recording.filename or "recording", content_type, len(data)
    )
    return {"object_key": object_key}


@router.post("/{session_id}/finish", response_model=InterviewSessionOut)
def finish_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_candidate: Candidate = Depends(get_current_candidate),
) -> InterviewSessionOut:
    """Candidate-facing: just marks the interview as awaiting HR review.
    No AI evaluation happens here — see evaluate_session below, which HR
    triggers manually once they see the candidate has finished.
    """
    session = _get_owned_session(db, session_id, current_candidate)
    return interview_service.complete_session(db, session)


@router.post("/{session_id}/evaluate", response_model=InterviewReportOut)
def evaluate_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> InterviewReportOut:
    """HR-only: runs AI evaluation for a session the candidate has finished,
    generating (or regenerating) its report.
    """
    _get_session_or_404(db, session_id)
    try:
        return interview_service.finalize_session(db, session_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except AIResponseError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


@router.post("/{session_id}/generate-report", response_model=InterviewReportOut)
def generate_report(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> InterviewReportOut:
    """HR-only: generates the detailed final interview report (structured
    competency scores, strengths, development areas, cited evidence) — a
    richer analysis than evaluate_session above. If a report already exists
    from a prior call to this endpoint, it's returned as-is, not regenerated.
    """
    _get_session_or_404(db, session_id)
    try:
        return report_service.generate_final_report(db, session_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except AIResponseError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


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


@router.get("/{session_id}/answers/{question_id}/media-url", response_model=AIMediaUrlResponse)
def get_answer_media_url(
    session_id: int,
    question_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    storage: MediaStorage = Depends(get_media_storage),
) -> AIMediaUrlResponse:
    answer = interview_service.get_answer(db, session_id, question_id)
    if answer is None or not answer.audio_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No recording for this answer")
    url = storage.presigned_url(answer.audio_path, expires_seconds=MEDIA_URL_EXPIRES_SECONDS)
    return AIMediaUrlResponse(url=url, expires_in_seconds=MEDIA_URL_EXPIRES_SECONDS)


@router.get("/{session_id}/recording-url", response_model=AIMediaUrlResponse)
def get_recording_url(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    storage: MediaStorage = Depends(get_media_storage),
) -> AIMediaUrlResponse:
    session = _get_session_or_404(db, session_id)
    if not session.recording_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No recording for this session")
    url = storage.presigned_url(session.recording_path, expires_seconds=MEDIA_URL_EXPIRES_SECONDS)
    return AIMediaUrlResponse(url=url, expires_in_seconds=MEDIA_URL_EXPIRES_SECONDS)


@router.get("/media/{object_key:path}")
def get_media_file(
    object_key: str,
    current_user: User = Depends(get_current_user),
    storage: MediaStorage = Depends(get_media_storage),
) -> FileResponse:
    """Streams a recorded answer's bytes back through the backend rather
    than redirecting — LocalFileStorage has no real signed-URL mechanism,
    and this works for any MediaStorage implementation via download_to_path.
    """
    fd, tmp_path = tempfile.mkstemp()
    os.close(fd)
    try:
        storage.download_to_path(object_key, tmp_path)
    except Exception as exc:
        os.unlink(tmp_path)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recording not found") from exc
    return FileResponse(
        tmp_path,
        filename=os.path.basename(object_key),
        background=BackgroundTask(os.unlink, tmp_path),
    )
