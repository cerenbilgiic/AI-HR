"""KVKK-driven retention for interview data.

Three independent windows (see Settings.media_retention_days /
transcript_retention_days / report_retention_days, env-configurable):
  - recorded audio/video (MinIO object + its DB reference)      -> shortest
  - answer transcripts (the text of what the candidate said)    -> medium
  - the final AI report (interview_reports + ai_scores)         -> longest

Each is measured from when that specific piece of data was created, not
from the interview date — e.g. a transcript survives independently of
whether its recording has already been purged.

Wired to run automatically once a day via APScheduler (see app/main.py's
lifespan). run_daily_retention_job() is the entry point the scheduler calls;
it owns its own DB session since a scheduled job has no request to borrow
one from.
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.ai_score import AIScore, InterviewReport
from app.models.interview import CandidateAnswer, InterviewSession
from app.services.storage import MediaStorage, get_media_storage


def delete_expired_media(db: Session, storage: MediaStorage, older_than_days: int) -> int:
    """Delete stored recordings (and clear their DB references) older than
    `older_than_days`. Returns how many were deleted. Best-effort: an object
    already missing in storage doesn't block clearing the DB reference,
    since the end state (no orphaned reference) is the same.

    Covers both the legacy per-answer recordings (CandidateAnswer.audio_path,
    from the earlier per-question record flow) and the current whole-interview
    recording (InterviewSession.recording_path).
    """
    cutoff = datetime.now(UTC) - timedelta(days=older_than_days)
    deleted = 0

    answers = (
        db.query(CandidateAnswer)
        .filter(CandidateAnswer.audio_path.isnot(None))
        .filter(CandidateAnswer.created_at < cutoff)
        .all()
    )
    for answer in answers:
        try:
            storage.delete(answer.audio_path)
        except Exception:
            pass
        answer.audio_path = None
        answer.media_filename = None
        answer.media_content_type = None
        answer.media_size = None
        deleted += 1

    sessions = (
        db.query(InterviewSession)
        .filter(InterviewSession.recording_path.isnot(None))
        .filter(InterviewSession.created_at < cutoff)
        .all()
    )
    for session in sessions:
        try:
            storage.delete(session.recording_path)
        except Exception:
            pass
        session.recording_path = None
        session.recording_filename = None
        session.recording_content_type = None
        session.recording_size = None
        deleted += 1

    db.commit()
    return deleted


def clear_expired_transcripts(db: Session, older_than_days: int) -> int:
    """Blank out transcript text for answers older than `older_than_days`.
    The answer row itself stays (AIEvaluation still references it) — only
    the personal-data content is purged.
    """
    cutoff = datetime.now(UTC) - timedelta(days=older_than_days)
    answers = (
        db.query(CandidateAnswer)
        .filter(CandidateAnswer.transcript.isnot(None))
        .filter(CandidateAnswer.created_at < cutoff)
        .all()
    )

    for answer in answers:
        answer.transcript = None

    db.commit()
    return len(answers)


def delete_expired_reports(db: Session, older_than_days: int) -> int:
    """Delete the final session-level report (InterviewReport + AIScore)
    for reports older than `older_than_days`. Per-answer AI evaluations
    (ai_evaluations) are not touched by this window.
    """
    cutoff = datetime.now(UTC) - timedelta(days=older_than_days)

    reports_deleted = (
        db.query(InterviewReport)
        .filter(InterviewReport.created_at < cutoff)
        .delete(synchronize_session="fetch")
    )
    db.query(AIScore).filter(AIScore.created_at < cutoff).delete(synchronize_session="fetch")

    db.commit()
    return reports_deleted


def run_retention_sweep(db: Session, storage: MediaStorage) -> dict[str, int]:
    """Runs all three retention windows using the configured settings."""
    return {
        "media_deleted": delete_expired_media(db, storage, settings.media_retention_days),
        "transcripts_cleared": clear_expired_transcripts(db, settings.transcript_retention_days),
        "reports_deleted": delete_expired_reports(db, settings.report_retention_days),
    }


def run_daily_retention_job() -> None:
    """Entry point for the scheduler — owns its own DB session/storage client
    since it doesn't run inside a request.
    """
    db = SessionLocal()
    try:
        run_retention_sweep(db, get_media_storage())
    finally:
        db.close()
