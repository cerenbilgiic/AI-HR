from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.audit_log import AuditLog
from app.models.candidate import Candidate, CandidateCV, CandidateSkill
from app.models.consent import ConsentRecord
from app.models.interview import InterviewSession
from app.models.job import Job
from app.schemas.candidate import (
    CandidateCreate,
    CandidateCVCreate,
    CandidateCVUpdate,
    CandidateSkillIn,
    CandidateSkillUpdate,
    CandidateUpdate,
    ConsentIn,
)
from app.services.ai import get_ai_provider


def list_candidates(db: Session, job_id: int | None = None) -> list[Candidate]:
    query = db.query(Candidate)
    if job_id is not None:
        query = query.filter(Candidate.job_id == job_id)
    return query.all()


def get_candidate(db: Session, candidate_id: int) -> Candidate | None:
    return db.get(Candidate, candidate_id)


def compute_interview_deadline(candidate: Candidate) -> datetime:
    """Automatic, not HR-set — N days from account creation (settings.interview_deadline_days)."""
    return candidate.created_at + timedelta(days=settings.interview_deadline_days)


def create_candidate(db: Session, data: CandidateCreate) -> Candidate:
    candidate_data = data.model_dump(exclude={"password"})
    hashed_password = hash_password(data.password) if data.password else None
    candidate = Candidate(**candidate_data, hashed_password=hashed_password)
    db.add(candidate)
    db.commit()
    db.refresh(candidate)
    return candidate


def update_candidate(db: Session, candidate: Candidate, data: CandidateUpdate) -> Candidate:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(candidate, field, value)
    db.commit()
    db.refresh(candidate)
    return candidate


def delete_candidate(db: Session, candidate: Candidate) -> None:
    has_sessions = db.query(InterviewSession).filter(InterviewSession.candidate_id == candidate.id).first()
    has_consent = db.query(ConsentRecord).filter(ConsentRecord.candidate_id == candidate.id).first()
    if has_sessions is not None or has_consent is not None:
        raise ValueError("Cannot delete a candidate with interview sessions or consent records")
    # Audit-log rows are lightweight metadata, not substantive candidate
    # activity — clear them rather than blocking deletion (unlike
    # sessions/consent above).
    db.query(AuditLog).filter(AuditLog.candidate_id == candidate.id).delete()
    db.delete(candidate)
    db.commit()


def record_consent(db: Session, candidate_id: int, data: ConsentIn) -> ConsentRecord:
    consent = ConsentRecord(candidate_id=candidate_id, **data.model_dump())
    db.add(consent)
    db.commit()
    db.refresh(consent)
    return consent


def get_consent(db: Session, candidate_id: int) -> ConsentRecord | None:
    return db.query(ConsentRecord).filter(ConsentRecord.candidate_id == candidate_id).first()


def add_candidate_skill(db: Session, candidate: Candidate, data: CandidateSkillIn) -> CandidateSkill:
    skill = CandidateSkill(candidate_id=candidate.id, name=data.name)
    db.add(skill)
    db.commit()
    db.refresh(skill)
    return skill


def get_candidate_skill(db: Session, candidate_id: int, skill_id: int) -> CandidateSkill | None:
    return (
        db.query(CandidateSkill)
        .filter(CandidateSkill.id == skill_id, CandidateSkill.candidate_id == candidate_id)
        .first()
    )


def update_candidate_skill(db: Session, skill: CandidateSkill, data: CandidateSkillUpdate) -> CandidateSkill:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(skill, field, value)
    db.commit()
    db.refresh(skill)
    return skill


def delete_candidate_skill(db: Session, skill: CandidateSkill) -> None:
    db.delete(skill)
    db.commit()


def merge_ai_skills(db: Session, candidate: Candidate, skill_names: list[str]) -> None:
    """Add AI-extracted CV skills, additively — never removes existing
    (e.g. HR-added) skills, and skips names already present (case-insensitive).
    """
    existing = {s.name.strip().lower() for s in candidate.skills}
    for name in skill_names:
        key = name.strip().lower()
        if not key or key in existing:
            continue
        db.add(CandidateSkill(candidate_id=candidate.id, name=name.strip()))
        existing.add(key)
    db.commit()


def extract_and_merge_cv_skills(candidate_id: int, cv_id: int) -> None:
    """Background task (see routers/candidates.py upload_my_cv) — the AI
    skill-extraction call can take well over a minute on a cold local model,
    so it must not block the upload response or the CV itself would appear
    to "not show up" while the candidate waits. Opens its own DB session
    since the request-scoped one is already closed by the time this runs
    (same pattern as transcription_service.transcribe_pending_answers).
    """
    db = SessionLocal()
    try:
        cv = db.get(CandidateCV, cv_id)
        if cv is None or not cv.parsed_text:
            return
        candidate = db.get(Candidate, candidate_id)
        if candidate is None:
            return
        job = db.get(Job, candidate.job_id)
        try:
            skills = get_ai_provider().extract_skills(cv.parsed_text, job.description if job else "")
        except Exception:
            return
        if skills:
            merge_ai_skills(db, candidate, skills)
    finally:
        db.close()


def add_candidate_cv(db: Session, candidate: Candidate, data: CandidateCVCreate) -> CandidateCV:
    cv = CandidateCV(candidate_id=candidate.id, file_path=data.file_path, parsed_text=data.parsed_text)
    db.add(cv)
    db.commit()
    db.refresh(cv)
    return cv


def get_candidate_cv(db: Session, candidate_id: int, cv_id: int) -> CandidateCV | None:
    return db.query(CandidateCV).filter(CandidateCV.id == cv_id, CandidateCV.candidate_id == candidate_id).first()


def update_candidate_cv(db: Session, cv: CandidateCV, data: CandidateCVUpdate) -> CandidateCV:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(cv, field, value)
    db.commit()
    db.refresh(cv)
    return cv


def delete_candidate_cv(db: Session, cv: CandidateCV) -> None:
    db.delete(cv)
    db.commit()


def analyze_candidate_cv(db: Session, candidate: Candidate, cv: CandidateCV) -> CandidateCV:
    job = db.get(Job, candidate.job_id)
    analysis = get_ai_provider().analyze_cv(cv.parsed_text or "", job.description if job else "")
    cv.analysis = analysis
    db.commit()
    db.refresh(cv)
    return cv
