"""Post-interview speech-to-text for verbal-only answers.

Runs after the candidate finishes (see the background task scheduled from
POST /interviews/{id}/finish), never during the live interview — per-question
STT used to run synchronously and was removed specifically for the latency
it added to the candidate's experience. This module owns its own DB session,
same as data_retention.run_daily_retention_job, since it runs outside a
request.
"""

import os
import tempfile

from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.interview import InterviewSession
from app.services.ai import get_ai_provider
from app.services.audio_slicing import extract_audio_slice
from app.services.storage import get_media_storage


def _transcribe_session_answers(db: Session, session: InterviewSession) -> None:
    if not session.recording_path:
        return

    storage = get_media_storage()
    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
        recording_path = tmp.name
    try:
        storage.download_to_path(session.recording_path, recording_path)

        for answer in session.answers:
            # Only fills a blank — never overwrites a typed answer, and
            # skips anything with no recorded answer window at all.
            if answer.transcript or answer.recording_start_offset_seconds is None:
                continue

            fd, slice_path = tempfile.mkstemp(suffix=".wav")
            os.close(fd)
            try:
                extract_audio_slice(
                    recording_path,
                    answer.recording_start_offset_seconds,
                    answer.recording_end_offset_seconds or answer.recording_start_offset_seconds + 1,
                    slice_path,
                )
                answer.transcript = get_ai_provider().transcribe(slice_path) or None
            except Exception:
                # Best-effort per answer — one bad slice shouldn't stop the
                # rest of the interview's answers from being transcribed.
                pass
            finally:
                os.unlink(slice_path)

        db.commit()
    finally:
        os.unlink(recording_path)


def transcribe_pending_answers(session_id: int) -> None:
    db = SessionLocal()
    try:
        session = db.get(InterviewSession, session_id)
        if session is None:
            return
        _transcribe_session_answers(db, session)
    finally:
        db.close()
